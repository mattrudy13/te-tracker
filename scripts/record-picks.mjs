#!/usr/bin/env node
// Saves this week's Best Bets picks to data/picks-<season>.json so they can be graded later.
// Runs after each odds snapshot. A pick locks at kickoff: later snapshots only replace picks whose
// games haven't started, so Thursday's TNF picks survive the Sunday run.
//
//   node scripts/record-picks.mjs                      # now
//   NOW=2026-10-11T12:00:00Z node scripts/record-picks.mjs   # pretend it's a different time (tests)

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { bestBets } = require("../model.js");
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const now = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();

const readJson = async (f, fallback) => {
  try {
    return JSON.parse(await readFile(f, "utf8"));
  } catch {
    return fallback;
  }
};

const { current: season } = await readJson(path.join(DATA_DIR, "seasons.json"));
const data = await readJson(path.join(DATA_DIR, `${season}.json`));
data.odds = await readJson(path.join(DATA_DIR, `odds-${season}.json`), null);
const file = path.join(DATA_DIR, `picks-${season}.json`);
const store = await readJson(file, { season, weeks: {} });

const bets = bestBets(data, now);
if (!bets.week) {
  console.log("no upcoming week; nothing to record");
  process.exit(0);
}
const wk = (store.weeks[bets.week] ??= { picks: [] });
const started = (p) => Date.parse(p.kickoff) <= now;
const locked = wk.picks.filter(started);
const lockedKeys = new Set(locked.map((p) => `${p.cat}:${p.playerId}`));
const takenAt = new Date(now).toISOString();
const fresh = [];
for (const [cat, rows] of Object.entries(bets.cats)) {
  for (const c of rows) {
    if (lockedKeys.has(`${cat}:${c.playerId}`)) continue;
    fresh.push({
      cat, playerId: c.playerId, name: c.name, team: c.team, opp: c.opp, home: c.home,
      gameId: c.gameId, kickoff: c.kickoff, price: c.price, book: c.book,
      modelProb: round(c.modelProb), marketProb: c.marketProb == null ? null : round(c.marketProb),
      ev: c.ev == null ? null : Math.round(c.ev * 10) / 10, why: c.why, takenAt, oddsAt: data.odds?.takenAt ?? null,
    });
  }
}
wk.picks = [...locked, ...fresh];
store.updated = takenAt;
await writeFile(file, JSON.stringify(store, null, 1) + "\n");
console.log(`week ${bets.week}: ${locked.length} locked picks kept, ${fresh.length} picks from this snapshot (${bets.priced} TEs priced)`);

function round(x) {
  return Math.round(x * 10000) / 10000;
}
