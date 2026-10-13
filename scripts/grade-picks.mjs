#!/usr/bin/env node
// Grades recorded Best Bets picks once their games are final (data/picks-<season>.json).
//   won   – the player scored a TD (receiving or rushing); for "first" picks, the game's first TD
//   lost  – the player has a box-score line but didn't score (or, for "first", didn't score first,
//           including games with no TD at all)
//   void  – the player didn't play (books void those bets). The box score leaves out a TE who played
//           but drew no targets, so a missing line is checked against the player's ESPN game log:
//           a stat row for the game means they played (graded on zero TDs), "–" means they didn't.
//           If the game log can't be fetched, the pick stays ungraded until the next run.
// Profit is per $100 at the recorded price. Fades are graded right/wrong only (no "No" price).
// Already-graded picks are left alone, so reruns change nothing.

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { payout } = require("../model.js");
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

const { current: season } = JSON.parse(await readFile(path.join(DATA_DIR, "seasons.json"), "utf8"));
const data = JSON.parse(await readFile(path.join(DATA_DIR, `${season}.json`), "utf8"));
const file = path.join(DATA_DIR, `picks-${season}.json`);
let store;
try {
  store = JSON.parse(await readFile(file, "utf8"));
} catch {
  console.log("no picks file yet");
  process.exit(0);
}

// Did the player appear in this game? Only asked when the box score has no line for them.
const gamelogs = new Map();
async function playedIn(playerId, gameId) {
  if (!gamelogs.has(playerId)) {
    const url = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${playerId}/gamelog?season=${season}`;
    gamelogs.set(playerId, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  const log = await gamelogs.get(playerId);
  if (!log) return null;
  const row = (log.seasonTypes ?? []).flatMap((t) => t.categories ?? []).flatMap((c) => c.events ?? []).find((e) => e.eventId === gameId);
  return !!row && row.stats?.[0] !== "-";
}

const final = new Set(data.processedEvents);
const rows = new Map(data.games.map((g) => [`${g.gameId}:${g.playerId}`, g]));
let graded = 0;
for (const wk of Object.values(store.weeks)) {
  for (const p of wk.picks) {
    if (p.result || !final.has(p.gameId)) continue;
    const g = rows.get(`${p.gameId}:${p.playerId}`);
    const played = g ? true : await playedIn(p.playerId, p.gameId);
    if (played == null) {
      console.log(`couldn't check whether ${p.playerId} played in ${p.gameId}; leaving ungraded`);
      continue;
    }
    // A player who played without a box-score line had no catches, so no receiving or rushing TD.
    const scored = g ? (p.cat === "first" ? !!g.firstTd : g.td + g.rushTd > 0) : played ? false : null;
    if (!played) p.result = "void";
    else if (p.cat === "fade") p.result = scored ? "lost" : "won"; // a fade "wins" when the player doesn't score
    else p.result = scored ? "won" : "lost";
    p.scored = scored;
    p.profit = p.cat === "fade" || p.price == null ? null : p.result === "won" ? Math.round(payout(p.price) * 100) / 100 : p.result === "lost" ? -100 : 0;
    graded++;
  }
}
if (graded) {
  store.graded = new Date().toISOString();
  await writeFile(file, JSON.stringify(store, null, 1) + "\n");
}
console.log(`graded ${graded} picks`);
