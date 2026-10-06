#!/usr/bin/env node
// Builds data/<season>.json: one row per tight end per completed regular-season game,
// from ESPN's public site API. Run with `node scripts/build-data.mjs [season]`.
// Already-processed games are reused from the existing file, so reruns only fetch new games.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const ATHLETE_API = "https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes";
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const SEASON_TYPE = 2; // regular season

async function getJson(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "te-tracker (github.com/mattrudy13/te-tracker)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i >= tries) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

// Box score stat lines come as parallel `labels` / `stats` arrays.
function statMap(category, athlete) {
  const m = {};
  category.labels.forEach((label, i) => {
    const n = Number(String(athlete.stats[i]).replace(/,/g, ""));
    m[label] = Number.isFinite(n) ? n : 0;
  });
  return m;
}

// Play-by-play names a receiver like "K.Pitts" or "Bi.Robinson" (extra letters when a team
// has two players with that initial and last name).
const SUFFIX = /\s+(jr|sr|ii|iii|iv|v)\.?$/i;
const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
function nameKey(fullName) {
  const parts = fullName.replace(SUFFIX, "").trim().split(/\s+/);
  return { first: norm(parts[0]), last: norm(parts.slice(1).join("")) };
}
function matchesPbpName(pbpName, key) {
  const dot = pbpName.indexOf(".");
  if (dot < 1) return false;
  const first = norm(pbpName.slice(0, dot));
  const last = norm(pbpName.slice(dot + 1).replace(SUFFIX, ""));
  return last === key.last && key.first.startsWith(first);
}
const TARGET_RE = /pass (?:incomplete )?(?:short|deep)?\s*(?:left|middle|right)?\s*(?:to|intended for) ([A-Z][A-Za-z'-]*\.\s?[A-Z][A-Za-z' -]*?[A-Za-z])(?=[\s.,;(\[]|$)/;
const PASS_TYPES = /^(Pass Reception|Pass Incompletion|Passing Touchdown|Pass Interception Return|Interception Return Touchdown|Sack)$/;

// Red-zone targets and TDs per player from the play-by-play, by distance to the end zone
// at the snap. Returns { [athleteId]: { tgt5, tgt10, tgt20, td5, td10, td20 } }.
function redZoneSplits(summary, teamIdByAbbr, tesByTeam) {
  const out = {};
  for (const drive of summary.drives?.previous ?? []) {
    for (const play of drive.plays ?? []) {
      const text = play.text ?? "";
      if (/NULLIFIED|No Play/i.test(text)) continue;
      const yte = play.start?.yardsToEndzone;
      if (!(yte > 0 && yte <= 20)) continue;
      const offenseId = play.start?.team?.id;
      const abbr = Object.keys(tesByTeam).find((a) => teamIdByAbbr[a] === offenseId);
      if (!abbr) continue;
      let hit, td;
      if (PASS_TYPES.test(play.type?.text ?? "")) {
        const m = TARGET_RE.exec(text);
        hit = m && tesByTeam[abbr].find((te) => matchesPbpName(m[1], te.key));
        td = play.scoringPlay && /TOUCHDOWN/.test(text) && !/INTERCEPT/i.test(text);
      } else if (play.scoringPlay) {
        // Some scoring plays are mistyped and only carry summary text: "Eric Saubert 13 Yd pass from ...".
        const m = /^(.+?) \d+ Yd pass from /.exec(text);
        const key = m && nameKey(m[1]);
        hit = key && tesByTeam[abbr].find((te) => te.key.first === key.first && te.key.last === key.last);
        td = true;
      }
      if (!hit) continue;
      const s = (out[hit.id] ??= { tgt5: 0, tgt10: 0, tgt20: 0, td5: 0, td10: 0, td20: 0 });
      for (const [lim, k] of [[5, "5"], [10, "10"], [20, "20"]]) {
        if (yte <= lim) {
          s["tgt" + k]++;
          if (td) s["td" + k]++;
        }
      }
    }
  }
  return out;
}

async function main() {
  const current = await getJson(`${API}/scoreboard`);
  const season = Number(process.argv[2]) || current.season.year;
  const outFile = path.join(DATA_DIR, `${season}.json`);
  const positionsFile = path.join(DATA_DIR, `positions-${season}.json`);

  const prev = await readJson(outFile, { processedEvents: [], games: [], players: {} });
  const positions = await readJson(positionsFile, {}); // athlete id -> position, for players not on a roster

  // Teams: colors and logos for the site.
  const teamsRes = await getJson(`${API}/teams`);
  const teams = {};
  const teamIds = [];
  const teamIdByAbbr = {};
  for (const { team: t } of teamsRes.sports[0].leagues[0].teams) {
    teamIds.push(t.id);
    teamIdByAbbr[t.abbreviation] = t.id;
    teams[t.abbreviation] = {
      name: t.displayName,
      short: t.shortDisplayName,
      color: t.color ? `#${t.color}` : null,
      alt: t.alternateColor ? `#${t.alternateColor}` : null,
      logo: t.logos?.[0]?.href ?? null,
    };
  }

  // Current rosters identify tight ends (box score athletes have no position).
  const players = { ...prev.players };
  const rosterTe = new Set();
  await mapLimit(teamIds, 6, async (id) => {
    const r = await getJson(`${API}/teams/${id}/roster`);
    const abbr = r.team?.abbreviation;
    for (const group of r.athletes ?? []) {
      for (const a of group.items ?? []) {
        if (a.position?.abbreviation !== "TE") continue;
        rosterTe.add(a.id);
        players[a.id] = {
          name: a.fullName,
          short: a.shortName ?? a.fullName,
          team: abbr,
          headshot: a.headshot?.href ?? null,
          jersey: a.jersey ?? null,
          age: a.age ?? null,
          exp: a.experience?.years ?? null,
          onRoster: true,
        };
      }
    }
  });
  for (const [id, p] of Object.entries(players)) {
    if (!rosterTe.has(id)) p.onRoster = false;
  }

  // Completed regular-season games, by week.
  const calendar = current.leagues[0].calendar.find((c) => Number(c.value) === SEASON_TYPE);
  const now = Date.now();
  const weekNums = calendar.entries
    .filter((e) => new Date(e.startDate).getTime() <= now)
    .map((e) => Number(e.value));
  const events = [];
  for (const week of weekNums) {
    const sb = await getJson(`${API}/scoreboard?seasontype=${SEASON_TYPE}&week=${week}&dates=${season}`);
    for (const ev of sb.events ?? []) {
      if (ev.status?.type?.completed) events.push({ id: ev.id, week });
    }
  }

  // Next week's games with betting lines: implied team points drive the TD odds on the site.
  // On Monday nights the current week has no unplayed games left, so look one week ahead too.
  const upcoming = [];
  for (const nextWeek of calendar.entries.filter((e) => new Date(e.endDate).getTime() > now).slice(0, 2)) {
    if (upcoming.length) break;
    const sb = await getJson(`${API}/scoreboard?seasontype=${SEASON_TYPE}&week=${nextWeek.value}&dates=${season}`);
    for (const ev of sb.events ?? []) {
      if (ev.status?.type?.state !== "pre") continue;
      const comp = ev.competitions[0];
      const odds = comp.odds?.[0];
      const total = odds?.overUnder ?? null;
      const home = comp.competitors.find((c) => c.homeAway === "home").team.abbreviation;
      const away = comp.competitors.find((c) => c.homeAway === "away").team.abbreviation;
      // `spread` is from the home team's side: -3 means home favored by 3.
      const spread = odds?.spread ?? null;
      const implied = (side) =>
        total == null || spread == null ? null : Math.round((total / 2 + (side === "home" ? -spread : spread) / 2) * 10) / 10;
      for (const [team, opp, side] of [[home, away, "home"], [away, home, "away"]]) {
        upcoming.push({ week: Number(nextWeek.value), gameId: ev.id, date: comp.date, team, opp, home: side === "home", total, spread: spread == null ? null : side === "home" ? spread : -spread, implied: implied(side) });
      }
    }
  }

  const processed = new Set(prev.processedEvents);
  const keep = prev.games.filter((g) => events.some((e) => e.id === g.gameId));
  const todo = events.filter((e) => !processed.has(e.id));
  console.log(`season ${season}: ${events.length} completed games, ${todo.length} new`);

  const isTe = async (id) => {
    if (rosterTe.has(id)) return true;
    if (!(id in positions)) {
      try {
        const a = (await getJson(`${ATHLETE_API}/${id}`)).athlete;
        positions[id] = a.position?.abbreviation ?? "?";
        if (positions[id] === "TE" && !players[id]) {
          players[id] = {
            name: a.displayName,
            short: a.shortName ?? a.displayName,
            team: a.team?.abbreviation ?? null,
            headshot: a.headshot?.href ?? null,
            jersey: a.jersey ?? null,
            age: a.age ?? null,
            exp: a.experience?.years ?? null,
            onRoster: false,
          };
        }
      } catch (err) {
        console.warn(`position lookup failed for ${id}: ${err.message}`);
        return false; // not cached, so it's retried next run
      }
    }
    return positions[id] === "TE";
  };

  const newRows = (
    await mapLimit(todo, 6, async ({ id, week }) => {
      const s = await getJson(`${API}/summary?event=${id}`);
      const comp = s.header.competitions[0];
      const side = {};
      for (const c of comp.competitors) {
        side[c.team.abbreviation] = { homeAway: c.homeAway, score: Number(c.score) };
      }
      const rows = [];
      const tesByTeam = {};
      for (const teamBox of s.boxscore?.players ?? []) {
        const team = teamBox.team.abbreviation;
        const opp = Object.keys(side).find((t) => t !== team);
        const cat = Object.fromEntries(teamBox.statistics.map((c) => [c.name, c]));
        const lines = {}; // athlete id -> { receiving, rushing, fumbles }
        for (const name of ["receiving", "rushing", "fumbles"]) {
          for (const a of cat[name]?.athletes ?? []) {
            (lines[a.athlete.id] ??= { name: a.athlete.displayName })[name] = statMap(cat[name], a);
          }
        }
        let teamTgt = 0, teamRecYds = 0;
        for (const l of Object.values(lines)) {
          teamTgt += l.receiving?.TGTS ?? 0;
          teamRecYds += l.receiving?.YDS ?? 0;
        }
        for (const [pid, l] of Object.entries(lines)) {
          if (!(await isTe(pid))) continue;
          (tesByTeam[team] ??= []).push({ id: pid, key: nameKey(l.name) });
          const rec = l.receiving ?? {}, rush = l.rushing ?? {}, fum = l.fumbles ?? {};
          rows.push({
            gameId: id,
            week,
            date: comp.date,
            playerId: pid,
            team,
            opp,
            home: side[team].homeAway === "home",
            score: side[team].score,
            oppScore: side[opp].score,
            rec: rec.REC ?? 0,
            tgt: rec.TGTS ?? 0,
            yds: rec.YDS ?? 0,
            td: rec.TD ?? 0,
            long: rec.LONG ?? 0,
            rushAtt: rush.CAR ?? 0,
            rushYds: rush.YDS ?? 0,
            rushTd: rush.TD ?? 0,
            fumLost: fum.LOST ?? 0,
            teamTgt,
            teamRecYds,
          });
        }
      }
      const rz = redZoneSplits(s, teamIdByAbbr, tesByTeam);
      for (const r of rows) Object.assign(r, rz[r.playerId] ?? { tgt5: 0, tgt10: 0, tgt20: 0, td5: 0, td10: 0, td20: 0 });
      return rows;
    })
  ).flat();

  const games = [...keep, ...newRows].sort((a, b) => a.week - b.week || a.date.localeCompare(b.date));
  const usedIds = new Set(games.map((g) => g.playerId));
  const out = {
    season,
    updated: new Date().toISOString(),
    weeks: [...new Set(events.map((e) => e.week))].sort((a, b) => a - b),
    teams,
    upcoming,
    // Roster tight ends plus anyone who played as one; drops ex-TEs with no games.
    players: Object.fromEntries(
      Object.entries(players)
        .filter(([id, p]) => p.onRoster || usedIds.has(id))
        .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    ),
    processedEvents: events.map((e) => e.id).filter((id) => processed.has(id) || todo.some((t) => t.id === id)),
    games,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(outFile, JSON.stringify(out) + "\n");
  await writeFile(positionsFile, JSON.stringify(positions, null, 0) + "\n");
  await writeFile(path.join(DATA_DIR, "seasons.json"), JSON.stringify({ current: season }) + "\n");
  console.log(`wrote ${games.length} TE game rows, ${Object.keys(out.players).length} players -> ${path.relative(process.cwd(), outFile)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
