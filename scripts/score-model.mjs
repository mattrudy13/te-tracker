// Scores the anytime-TD model against the books and the results, for every priced TE.
//
// For each odds snapshot in git history, the model is rebuilt from that commit's data/2026.json (only
// games played before the snapshot) and compared with that commit's odds. Each player-game keeps its
// latest snapshot before kickoff, and is scored against today's data/2026.json (no row = didn't play,
// left out like a voided bet). Books are de-vigged by dividing the median implied chance by 1.12.
//
// Usage (from the repo root):
//   node scripts/score-model.mjs                 current model plus the default variants below
//   node scripts/score-model.mjs '<json array>'  your own variants, e.g.
//     '[{"name":"prior .05","consts":{"TD_PER_TARGET_PRIOR":0.05}},{"name":"def 16","defK":16}]'
// A variant can swap any top-level `const NAME = value;` in model.js (`consts`) and add a defense
// multiplier (`defK` = games of league-average prior, `defPow` = strength, default 1). Nothing is written.
//
// Lower Brier score and log loss are better. Week 5–8 baseline (2026-11-07, 368 TE games): model Brier
// 0.0963 vs books 0.0959; defense factor (defK 16) 0.0944.

import { execSync } from "node:child_process";
import fs from "node:fs";
import vm from "node:vm";

const SEASON = JSON.parse(fs.readFileSync("data/seasons.json", "utf8")).current;
const DEVIG = 1.12;
const DEFAULT_VARIANTS = [{ name: "current" }, { name: "defense k16", defK: 16 }, { name: "defense k8", defK: 8 }];

const git = (args) => execSync(`git ${args}`, { maxBuffer: 1 << 28 }).toString();
const src = fs.readFileSync("model.js", "utf8");
const current = JSON.parse(fs.readFileSync(`data/${SEASON}.json`, "utf8"));

// model.js with constants swapped and, optionally, the opponent's TE TDs allowed as a multiplier.
function loadModel(v = {}) {
  let s = src;
  for (const [k, val] of Object.entries(v.consts ?? {})) {
    const re = new RegExp(`const ${k} = [^;]+;`);
    if (!re.test(s)) throw new Error(`model.js has no const ${k}`);
    s = s.replace(re, `const ${k} = ${val};`);
  }
  if (v.defK != null) {
    const before = s;
    s = s.replace(
      "const lambda = base * scale;",
      `const __d = __def[u.opp]; const __m = __d ? ((__d.td + ${v.defK} * __avg) / (__d.gp + ${v.defK})) / __avg : 1;
       const lambda = base * scale * Math.pow(__m, ${v.defPow ?? 1});`,
    );
    s = s.replace(
      "const rows = [];\n  for (const a of aggregate(data, data.games)) {",
      `const __def = defenseVsTe(data).byTeam; const __dv = Object.values(__def);
  const __avg = __dv.reduce((a, d) => a + d.td, 0) / __dv.reduce((a, d) => a + d.gp, 0);
  const rows = [];
  for (const a of aggregate(data, data.games)) {`,
    );
    // If tdOdds() changed shape, fail loudly rather than score an unpatched model as "defense".
    if (s === before || !s.includes("__def[u.opp]") || !s.includes("const __avg")) throw new Error("defense patch didn't apply: update loadModel()");
  }
  const ctx = { module: { exports: {} }, console, Math, Date, Object, Array, Set, Map, JSON, Number, String, RegExp };
  vm.runInNewContext(s, ctx);
  return ctx.module.exports;
}

const snaps = git(`log --format=%H -- data/odds-${SEASON}.json`).trim().split("\n").filter(Boolean).map((h) => ({
  odds: JSON.parse(git(`show ${h}:data/odds-${SEASON}.json`)),
  data: JSON.parse(git(`show ${h}:data/${SEASON}.json`)),
}));

const result = new Map(current.games.map((g) => [`${g.playerId}|${g.gameId}`, g.td + g.rushTd > 0 ? 1 : 0]));
const done = new Set(current.processedEvents ?? current.games.map((g) => g.gameId));

function rowsFor(M) {
  const best = new Map();
  for (const s of snaps) {
    if (!s.odds?.takenAt) continue;
    const data = structuredClone(s.data);
    data.odds = s.odds;
    const takenAt = new Date(s.odds.takenAt).getTime();
    for (const r of M.tdOdds(data)) {
      if (r.out || r.prob == null || new Date(r.up.date).getTime() <= takenAt) continue;
      const key = `${r.id}|${r.up.gameId}`;
      if (!done.has(r.up.gameId) || !result.has(key)) continue;
      const home = r.up.home ? r.team : r.up.opp, away = r.up.home ? r.up.opp : r.team;
      const o = M.playerOdds(data, r.id, home, away)?.td;
      if (!o?.marketProb) continue;
      if ((best.get(key)?.takenAt ?? 0) > takenAt) continue;
      best.set(key, { takenAt, week: r.up.week, model: r.prob, market: Math.min(0.99, o.marketProb / DEVIG), price: o.best, y: result.get(key) });
    }
  }
  return [...best.values()];
}

const mean = (rows, f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
const logLoss = (p, y) => -Math.log(y ? p : 1 - p);
const clamp = (p) => Math.min(0.99, Math.max(0.005, p));
const pay = (price) => (price > 0 ? price / 100 : 100 / -price);
function score(rows) {
  return {
    n: rows.length,
    scored: rows.reduce((s, r) => s + r.y, 0),
    modelExp: rows.reduce((s, r) => s + r.model, 0),
    marketExp: rows.reduce((s, r) => s + r.market, 0),
    brier: mean(rows, (r) => (r.model - r.y) ** 2),
    brierMkt: mean(rows, (r) => (r.market - r.y) ** 2),
    ll: mean(rows, (r) => logLoss(clamp(r.model), r.y)),
    llMkt: mean(rows, (r) => logLoss(r.market, r.y)),
  };
}
const line = (label, s) =>
  `${label.padEnd(16)}${String(s.n).padStart(4)}${String(s.scored).padStart(7)}${s.modelExp.toFixed(1).padStart(8)}${s.marketExp.toFixed(1).padStart(8)}` +
  `${s.brier.toFixed(4).padStart(9)}${s.brierMkt.toFixed(4).padStart(9)}${s.ll.toFixed(4).padStart(9)}${s.llMkt.toFixed(4).padStart(9)}`;
const header = `${"".padEnd(16)}${"n".padStart(4)}${"scored".padStart(7)}${"model".padStart(8)}${"books".padStart(8)}${"Brier".padStart(9)}${"books".padStart(9)}${"logloss".padStart(9)}${"books".padStart(9)}`;

const variants = process.argv[2] ? JSON.parse(process.argv[2]) : DEFAULT_VARIANTS;
for (const v of variants) {
  const rows = rowsFor(loadModel(v));
  console.log(`\n== ${v.name}  (model/books = expected TD scorers)\n${header}`);
  console.log(line("all", score(rows)));
  for (const w of [...new Set(rows.map((r) => r.week))].sort((a, b) => a - b)) console.log(line(`week ${w}`, score(rows.filter((r) => r.week === w))));
  // Price ranges, and $1 on every TE the model calls +EV at the best price.
  for (const [lo, hi, label] of [[-1e5, 200, "under +200"], [200, 400, "+200 to +399"], [400, 1e6, "+400 and up"]]) {
    const inRange = rows.filter((r) => r.price != null && r.price >= lo && r.price < hi);
    const bets = inRange.filter((r) => r.model * pay(r.price) - (1 - r.model) > 0);
    const units = bets.reduce((s, r) => s + (r.y ? pay(r.price) : -1), 0);
    console.log(`${line(label, score(inRange))}   +EV bets ${bets.length}, won ${bets.reduce((s, r) => s + r.y, 0)}, ${units >= 0 ? "+" : ""}${units.toFixed(1)} units`);
  }
}
