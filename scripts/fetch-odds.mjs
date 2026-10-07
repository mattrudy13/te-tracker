#!/usr/bin/env node
// Snapshots sportsbook odds for tight ends from The Odds API: anytime-TD prices and
// receptions over/under. Writes data/odds-<season>.json. Needs ODDS_API_KEY in the environment.
//
// Cost: listing events is free; each game's odds cost 1 credit per market per region
// (2 markets x 1 region = 2 per game, ~32 per full-week snapshot). Free tier is 500/month.
// Games that have already kicked off keep their earlier snapshot, so a Sunday run leaves
// Thursday's game alone.
//
//   node scripts/fetch-odds.mjs            # live
//   node scripts/fetch-odds.mjs --fixture f.json   # offline test: f.json maps eventId -> odds response

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl";
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const MARKETS = ["player_anytime_td", "player_receptions"];
const DAYS_AHEAD = 7;
// Offshore books in The Odds API's "us" region. They're dropped before picking the best price and the
// market median, so every price on the site (and every recorded pick) is one a US bettor can take at a
// licensed book. Keys are The Odds API's bookmaker keys.
const OFFSHORE_BOOKS = new Set(["betonlineag", "bovada", "betus", "mybookieag", "lowvig", "betanysports", "everygame"]);

const fixtureArg = process.argv.indexOf("--fixture");
const fixture = fixtureArg > 0 ? JSON.parse(await readFile(process.argv[fixtureArg + 1], "utf8")) : null;
const key = process.env.ODDS_API_KEY;
if (!key && !fixture) {
  console.error("ODDS_API_KEY is not set");
  process.exit(1);
}

let remaining = null;
async function api(pathAndQuery) {
  if (fixture) return fixture[pathAndQuery.startsWith("/events?") ? "events" : pathAndQuery.split("/")[2]];
  const url = `${API}${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}apiKey=${key}`;
  const res = await fetch(url);
  remaining = res.headers.get("x-requests-remaining") ?? remaining;
  if (!res.ok) throw new Error(`${pathAndQuery}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

const SUFFIX = /\s+(jr|sr|ii|iii|iv|v)\.?$/i;
const norm = (s) => s.replace(SUFFIX, "").toLowerCase().replace(/[^a-z]/g, "");

// American odds -> implied probability (includes the book's margin).
const implied = (o) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
const better = (a, b) => (b == null || implied(a) < implied(b) ? a : b); // longer price is better for the bettor

async function main() {
  const { current: season } = JSON.parse(await readFile(path.join(DATA_DIR, "seasons.json"), "utf8"));
  const data = JSON.parse(await readFile(path.join(DATA_DIR, `${season}.json`), "utf8"));
  const outFile = path.join(DATA_DIR, `odds-${season}.json`);
  let prev = {};
  try {
    prev = JSON.parse(await readFile(outFile, "utf8"));
  } catch {}

  const abbrByName = Object.fromEntries(Object.entries(data.teams).map(([abbr, t]) => [t.name, abbr]));
  // Tight ends by team and normalized name. Box-score team wins over roster team for traded players.
  const teByTeam = {};
  const latestTeam = {};
  for (const g of data.games) latestTeam[g.playerId] = g.team;
  const lastFirst = {}; // team -> "lastname|f" -> id, for nicknames ("Chig" vs "Chigoziem")
  for (const [id, p] of Object.entries(data.players)) {
    const team = latestTeam[id] ?? p.team;
    if (!team) continue;
    (teByTeam[team] ??= {})[norm(p.name)] = id;
    const parts = p.name.replace(SUFFIX, "").trim().split(/\s+/);
    (lastFirst[team] ??= {})[`${norm(parts.slice(1).join(""))}|${norm(parts[0])[0]}`] = id;
  }
  const findTe = (name, teams) => {
    for (const t of teams) if (teByTeam[t]?.[norm(name)]) return teByTeam[t][norm(name)];
    const parts = name.replace(SUFFIX, "").trim().split(/\s+/);
    const k = `${norm(parts.slice(1).join(""))}|${norm(parts[0])[0]}`;
    for (const t of teams) if (lastFirst[t]?.[k]) return lastFirst[t][k];
    return null;
  };

  const now = Date.now();
  const events = (await api(`/events?dateFormat=iso`)).filter((e) => {
    const t = new Date(e.commence_time).getTime();
    return t > now && t < now + DAYS_AHEAD * 864e5;
  });

  // Keep earlier snapshots for games that have started (their odds are gone now).
  const games = Object.fromEntries(
    Object.entries(prev.games ?? {}).filter(([, g]) => new Date(g.commence).getTime() <= now && new Date(g.commence).getTime() > now - DAYS_AHEAD * 864e5)
  );
  const players = Object.fromEntries(Object.entries(prev.players ?? {}).filter(([, p]) => games[p.oddsGameId]));
  const unmatched = [];

  for (const ev of events) {
    const home = abbrByName[ev.home_team], away = abbrByName[ev.away_team];
    if (!home || !away) {
      console.warn(`unknown team in ${ev.away_team} @ ${ev.home_team}`);
      continue;
    }
    const odds = await api(`/events/${ev.id}/odds?regions=us&markets=${MARKETS.join(",")}&oddsFormat=american`);
    games[ev.id] = { home, away, commence: ev.commence_time, takenAt: new Date().toISOString() };

    const byPlayer = {}; // espn id -> { td: {book: price}, rec: {point: {over: {book: price}, under: {book: price}}} }
    const books = (odds.bookmakers ?? []).filter((bm) => !OFFSHORE_BOOKS.has(bm.key));
    for (const bm of books) {
      for (const m of bm.markets ?? []) {
        for (const o of m.outcomes ?? []) {
          const name = o.description ?? o.name;
          if (!name || /^(no|under|over|yes)$/i.test(name)) continue;
          const id = findTe(name, [home, away]);
          if (!id) continue; // not a tight end (or a name we can't match)
          const p = (byPlayer[id] ??= { td: {}, rec: {} });
          if (m.key === "player_anytime_td") {
            if (/^no$/i.test(o.name)) continue;
            p.td[bm.title] = o.price;
          } else if (m.key === "player_receptions" && o.point != null) {
            const side = /^over$/i.test(o.name) ? "over" : /^under$/i.test(o.name) ? "under" : null;
            if (side) ((p.rec[o.point] ??= { over: {}, under: {} })[side][bm.title] = o.price);
          }
        }
      }
    }

    for (const [id, p] of Object.entries(byPlayer)) {
      const out = { oddsGameId: ev.id };
      const tdBooks = Object.entries(p.td);
      if (tdBooks.length) {
        const [book, price] = tdBooks.reduce((a, b) => (better(b[1], a[1]) === b[1] ? b : a));
        // Median of the books' implied probabilities: a steadier "market" number than the best price.
        const probs = tdBooks.map(([, o]) => implied(o)).sort((a, b) => a - b);
        const mid = probs.length / 2;
        const median = probs.length % 2 ? probs[Math.floor(mid)] : (probs[mid - 1] + probs[mid]) / 2;
        out.td = { best: price, book, books: tdBooks.length, marketProb: median, prices: Object.fromEntries(tdBooks) };
      }
      // Receptions: use the line most books hang, and the best price on each side of it.
      const lines = Object.entries(p.rec).sort((a, b) => Object.keys(b[1].over).length - Object.keys(a[1].over).length);
      if (lines.length) {
        const [point, sides] = lines[0];
        const best = (s) => {
          const e = Object.entries(s);
          return e.length ? e.reduce((a, b) => (better(b[1], a[1]) === b[1] ? b : a)) : null;
        };
        const over = best(sides.over), under = best(sides.under);
        out.rec = { line: Number(point), over: over?.[1] ?? null, overBook: over?.[0] ?? null, under: under?.[1] ?? null, underBook: under?.[0] ?? null, books: Object.keys(sides.over).length };
      }
      players[id] = out;
    }
    const names = new Set();
    for (const bm of odds.bookmakers ?? []) for (const m of bm.markets ?? []) for (const o of m.outcomes ?? []) if (o.description) names.add(o.description);
    for (const n of names) if (!findTe(n, [home, away])) unmatched.push(n);
  }

  const out = { season, takenAt: new Date().toISOString(), source: "The Odds API (US-licensed books only)", excluded: [...OFFSHORE_BOOKS], games, players };
  await writeFile(outFile, JSON.stringify(out) + "\n");
  console.log(`odds: ${events.length} games fetched, ${Object.keys(players).length} TEs priced${remaining != null ? `, ${remaining} credits left` : ""}`);
  console.log(`(${unmatched.length} non-TE or unmatched prop names skipped)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
