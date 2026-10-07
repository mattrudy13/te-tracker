#!/usr/bin/env node
// Grades recorded Best Bets picks once their games are final (data/picks-<season>.json).
//   won   – the player scored a TD (receiving or rushing)
//   lost  – the player has a box-score line but didn't score
//   void  – no box-score line (usually inactive; books void those bets). A TE who played but drew
//           no targets also has no line, so a few real losses land here.
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

const final = new Set(data.processedEvents);
const rows = new Map(data.games.map((g) => [`${g.gameId}:${g.playerId}`, g]));
let graded = 0;
for (const wk of Object.values(store.weeks)) {
  for (const p of wk.picks) {
    if (p.result || !final.has(p.gameId)) continue;
    const g = rows.get(`${p.gameId}:${p.playerId}`);
    const scored = g ? g.td + g.rushTd > 0 : null;
    if (!g) p.result = "void";
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
