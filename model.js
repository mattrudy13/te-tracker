// Data and model code shared by the site (browser globals) and the GitHub Action scripts
// (Node, via createRequire). No DOM access in here.

// ---- Fantasy scoring ----

const SCORING = {
  ppr: { label: "PPR", rec: 1 },
  half: { label: "Half PPR", rec: 0.5 },
  std: { label: "Standard", rec: 0 },
};
// tep: TE premium, extra points per catch.
function fantasyPoints(g, format = "ppr", tep = false) {
  const perRec = (SCORING[format]?.rec ?? 1) + (tep ? 0.5 : 0);
  return g.rec * perRec + (g.yds + g.rushYds) * 0.1 + (g.td + g.rushTd) * 6 - g.fumLost * 2;
}

// ---- Aggregation ----

function gamesFor(data, { from = 1, to = 99, team = "", playerId = null } = {}) {
  return data.games.filter(
    (g) => g.week >= from && g.week <= to && (!team || g.team === team) && (!playerId || g.playerId === playerId)
  );
}

const SUM_KEYS = ["rec", "tgt", "yds", "td", "rushAtt", "rushYds", "rushTd", "fumLost", "teamTgt", "teamRecYds", "tgt5", "tgt10", "tgt20", "td5", "td10", "td20"];

// One summary row per player over the given games.
function aggregate(data, games, { format = "ppr", tep = false } = {}) {
  const model = tdModel(data);
  const by = new Map();
  for (const g of games) {
    let a = by.get(g.playerId);
    if (!a) {
      a = { id: g.playerId, player: data.players[g.playerId], team: g.team, gp: 0, fpts: 0, long: 0, xtd: 0, firstTd: 0, games: [] };
      for (const k of SUM_KEYS) a[k] = 0;
      by.set(g.playerId, a);
    }
    a.gp++;
    a.team = g.team; // latest team, since games are in week order
    for (const k of SUM_KEYS) a[k] += g[k];
    a.long = Math.max(a.long, g.long);
    if (g.firstTd) a.firstTd++; // games where this player scored the game's first TD
    a.fpts += fantasyPoints(g, format, tep);
    a.xtd += model.xtd(g);
    a.games.push(g);
  }
  for (const a of by.values()) {
    a.tgtShare = a.teamTgt ? a.tgt / a.teamTgt : null;
    a.ydsShare = a.teamRecYds ? a.yds / a.teamRecYds : null;
    a.catchPct = a.tgt ? a.rec / a.tgt : null;
    a.ypr = a.rec ? a.yds / a.rec : null;
    a.ypt = a.tgt ? a.yds / a.tgt : null;
    a.fppg = a.fpts / a.gp;
    a.tgtPg = a.tgt / a.gp;
    a.rzPg = a.tgt20 / a.gp;
    a.tdDiff = a.td - a.xtd;
  }
  return [...by.values()];
}

// ---- Touchdown model ----
//
// Expected receiving TDs (xTD): each target is worth the league-wide TE TD rate for where it was
// thrown from (inside the 5, 6–10, 11–20, or outside the red zone). Rates are this season's
// actual TE results blended with long-run priors; the priors carry most of the weight early on.
//
// Anytime-TD odds: a player's expected TDs per game is shrunk toward a volume-only baseline
// (targets per game x a long-run 5% TE TD-per-target rate), worth SHRINK_GAMES games of data, so a
// few red-zone looks in September don't dominate. Season and last-3 estimates are blended, scaled by
// the team's implied points for the matchup, then P = 1 − e^(−λ) (Poisson).
//
// First-TD odds: the game's expected TDs Λ = both teams' implied points x TD_PER_POINT. If TDs arrive
// as independent Poisson streams, the first one is this player's with chance λ/Λ, and there is a
// first TD at all with chance 1 − e^(−Λ). So P(first) = λ/Λ · (1 − e^(−Λ)).
//
// Calibrated on 2026-10-05 against the first sportsbook snapshot (30 priced TEs, books de-vigged by
// ~12%): RMSE went from 11.2 to 6.4 percentage points and the average matched the market. The model
// still disagrees with the books on purpose (it only knows targets and field position).

const TD_ZONES = [
  { key: "i5", label: "Inside 5", prior: 0.45, weight: 400 },
  { key: "i10", label: "6–10", prior: 0.27, weight: 400 },
  { key: "i20", label: "11–20", prior: 0.12, weight: 600 },
  { key: "out", label: "Outside 20", prior: 0.025, weight: 3000 },
];
const TD_PER_TARGET_PRIOR = 0.05;
const SHRINK_GAMES = 8;
const RECENT_WEIGHT = 0.3;
// TDs per implied point: NFL teams average about 2.4 TDs on about 23 points. Not yet calibrated
// against the first-TD market.
const TD_PER_POINT = 0.105;

function zoneCounts(g) {
  return {
    i5: { tgt: g.tgt5, td: g.td5 },
    i10: { tgt: g.tgt10 - g.tgt5, td: g.td10 - g.td5 },
    i20: { tgt: g.tgt20 - g.tgt10, td: g.td20 - g.td10 },
    out: { tgt: Math.max(0, g.tgt - g.tgt20), td: Math.max(0, g.td - g.td20) },
  };
}

function tdModel(data) {
  if (data._tdModel) return data._tdModel;
  const tot = Object.fromEntries(TD_ZONES.map((z) => [z.key, { tgt: 0, td: 0 }]));
  for (const g of data.games) {
    const z = zoneCounts(g);
    for (const k in z) {
      tot[k].tgt += z[k].tgt;
      tot[k].td += z[k].td;
    }
  }
  const rates = {};
  for (const z of TD_ZONES) rates[z.key] = (tot[z.key].td + z.prior * z.weight) / (tot[z.key].tgt + z.weight);
  const xtd = (g) => {
    const z = zoneCounts(g);
    return TD_ZONES.reduce((s, { key }) => s + z[key].tgt * rates[key], 0);
  };
  const implied = (data.upcoming ?? []).map((u) => u.implied).filter((n) => n != null);
  const avgImplied = implied.length ? implied.reduce((a, b) => a + b, 0) / implied.length : 22;
  data._tdModel = { rates, totals: tot, xtd, avgImplied };
  return data._tdModel;
}

// Injury statuses that mean the player won't (or almost surely won't) play.
const OUT_STATUS = /^(out|doubtful|injured reserve|suspen|physically unable|non-football)/i;
function isOut(player) {
  return !!player?.injury && OUT_STATUS.test(player.injury.status ?? "");
}

// Defense vs TE TDs was tested as a matchup multiplier on 2026-10-06 and left out: after 4 weeks
// it's mostly noise and made the model's fit to the market worse at every strength tried
// (RMSE 6.39 -> 6.58..7.19). Revisit mid-season; defense context is still shown in Best Bets.

// Expected TDs per game over `games`, shrunk toward the player's volume-only baseline.
function shrunkXtdPg(model, games, tgtPg) {
  const x = games.reduce((s, g) => s + model.xtd(g), 0);
  return (x + SHRINK_GAMES * tgtPg * TD_PER_TARGET_PRIOR) / (games.length + SHRINK_GAMES);
}

// Anytime-TD probability for each TE with a game in the upcoming week.
function tdOdds(data) {
  const model = tdModel(data);
  const byTeam = Object.fromEntries((data.upcoming ?? []).map((u) => [u.team, u]));
  const lastTeamWeek = {};
  for (const g of data.games) lastTeamWeek[g.team] = Math.max(lastTeamWeek[g.team] ?? 0, g.week);
  const rows = [];
  for (const a of aggregate(data, data.games)) {
    const p = a.player;
    const team = p?.onRoster ? p.team : a.team;
    const u = byTeam[team];
    if (!u || team !== a.team) continue; // no game this week, or changed teams
    const recent = a.games.slice(-3);
    const xtdSeason = a.xtd / a.gp;
    const season = shrunkXtdPg(model, a.games, a.tgtPg);
    const recentPg = shrunkXtdPg(model, recent, a.tgtPg);
    // Small rushing-TD bump for the few TEs who get carries near the goal line.
    const rush = a.rushTd / a.gp;
    const base = (a.gp >= 3 ? (1 - RECENT_WEIGHT) * season + RECENT_WEIGHT * recentPg : season) + 0.5 * rush;
    const scale = u.implied ? u.implied / model.avgImplied : 1;
    const lambda = base * scale;
    const missedLast = (lastTeamWeek[team] ?? 0) > a.games.at(-1).week;
    const out = isOut(p);
    const oppImplied = byTeam[u.opp]?.implied;
    const gameLambda = u.implied != null && oppImplied != null ? (u.implied + oppImplied) * TD_PER_POINT : null;
    const firstProb = out || !gameLambda ? null : (lambda / gameLambda) * (1 - Math.exp(-gameLambda));
    rows.push({ ...a, team, up: u, xtdPg: xtdSeason, lambda, out, prob: out ? null : 1 - Math.exp(-lambda), firstProb, missedLast });
  }
  return rows.sort((x, y) => (y.prob ?? -1) - (x.prob ?? -1));
}

// What each defense allows to tight ends, per game. rank 1 = fewest receptions allowed, since the
// receptions line is the market this feeds (the user bets TDs and receptions, not fantasy).
function defenseVsTe(data) {
  const by = {};
  for (const g of data.games) {
    const d = (by[g.opp] ??= { team: g.opp, gameIds: new Set(), tgt: 0, rec: 0, yds: 0, td: 0 });
    d.gameIds.add(g.gameId);
    d.tgt += g.tgt;
    d.rec += g.rec;
    d.yds += g.yds;
    d.td += g.td + g.rushTd;
  }
  const rows = Object.values(by).map((d) => {
    const n = d.gameIds.size;
    return { team: d.team, gp: n, tgtPg: d.tgt / n, recPg: d.rec / n, ydsPg: d.yds / n, tdPg: d.td / n, td: d.td };
  });
  rows.sort((a, b) => a.recPg - b.recPg).forEach((r, i) => (r.rank = i + 1));
  return { byTeam: Object.fromEntries(rows.map((r) => [r.team, r])), count: rows.length };
}

// ---- Sportsbook odds ----

// American odds -> implied probability. Includes the book's margin, so it runs a bit high.
function impliedProb(o) {
  return o == null ? null : o > 0 ? 100 / (o + 100) : -o / (-o + 100);
}
// A player's snapshot odds for a specific game (matched by teams, so last week's snapshot never
// shows up against this week's game).
function playerOdds(data, id, home, away) {
  const p = data.odds?.players?.[id];
  const g = p && data.odds.games?.[p.oddsGameId];
  return g && g.home === home && g.away === away ? p : null;
}

// ---- Best bets ----

// Profit on a $100 winning bet at American odds.
function payout(price) {
  return price > 0 ? price : (100 * 100) / -price;
}
// Expected profit per $100 at `price` if the true chance is p.
function evPer100(p, price) {
  return p * payout(price) - (1 - p) * 100;
}
function ordinalShort(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const BET_CATEGORIES = [
  { key: "likely", label: "Most likely to score", blurb: "Highest model chance of an anytime TD this week, given usage and the team's implied points." },
  { key: "value", label: "Best value", blurb: "The model's chance beats the best available price by the most (expected profit per $100). Prices under +400, priced by at least 2 books." },
  { key: "longshot", label: "Longshots", blurb: "Prices of +400 or longer where the model still sees positive expected value, for players with a red-zone role." },
  { key: "due", label: "Due for a TD", blurb: "Plenty of red-zone looks but fewer TDs than those targets usually produce. The usage suggests TDs are coming." },
  { key: "fade", label: "Fades", blurb: "Short prices (+250 or shorter) the model thinks are too short. Bets to avoid." },
  { key: "first", label: "First TD value", blurb: "Bets on the player scoring the game's first touchdown (by either team). The model's chance beats the best price by the most. Priced by at least 2 books, red-zone role required." },
];
const PICKS_PER_CATEGORY = 5;

// This week's suggested anytime-TD bets by category. `now` is injectable for tests.
function bestBets(data, now = Date.now()) {
  const def = defenseVsTe(data).byTeam;
  const tdRank = Object.values(def).sort((a, b) => b.tdPg - a.tdPg).map((d) => d.team);
  const cands = [];
  for (const r of tdOdds(data)) {
    if (r.out || new Date(r.up.date).getTime() <= now) continue;
    const home = r.up.home ? r.team : r.up.opp, away = r.up.home ? r.up.opp : r.team;
    const odds = playerOdds(data, r.id, home, away);
    const book = odds?.td ?? null;
    const first = odds?.first ?? null;
    const price = book?.best ?? null;
    const d = def[r.up.opp];
    const why = [
      `${r.tgt20} RZ tgt${r.tgt5 ? ` (${r.tgt5} inside 5)` : ""}`,
      `${r.td + r.rushTd} TD vs ${r.xtd.toFixed(1)} xTD`,
      r.up.implied != null ? `team ${r.up.implied.toFixed(1)} pts` : "",
      d ? `${r.up.opp} allows ${d.td} TE TD in ${d.gp} (${ordinalShort(tdRank.indexOf(r.up.opp) + 1)}-most)` : "",
    ].filter(Boolean).join(" · ");
    cands.push({
      playerId: r.id, name: r.player?.name ?? r.id, team: r.team, opp: r.up.opp, home: r.up.home,
      gameId: r.up.gameId, kickoff: r.up.date, week: r.up.week,
      injury: r.player?.injury?.status ?? null,
      modelProb: r.prob, price, book: book?.book ?? null, books: book?.books ?? 0,
      marketProb: book?.marketProb ?? null,
      edge: book ? r.prob - book.marketProb : null,
      ev: price != null ? evPer100(r.prob, price) : null,
      tgt20: r.tgt20, tdDiff: r.tdDiff, why,
      first: first && r.firstProb != null ? {
        modelProb: r.firstProb, price: first.best, book: first.book, books: first.books,
        marketProb: first.fairProb ?? null, ev: evPer100(r.firstProb, first.best),
      } : null,
    });
  }
  const top = (rows, by) => rows.sort(by).slice(0, PICKS_PER_CATEGORY);
  const priced = cands.filter((c) => c.price != null);
  // Each category: the strict rule (real picks, recorded and graded) and a looser pool that fills
  // the list to PICKS_PER_CATEGORY with labeled "close calls" (shown only, never recorded).
  const byEv = (a, b) => b.ev - a.ev;
  // First-TD rows carry first-TD price, chances and EV in the usual fields, so the page and
  // record-picks.mjs treat them like any other pick. marketProb is the de-vigged market chance.
  const firstRows = cands.filter((c) => c.first).map((c) => ({ ...c, ...c.first, edge: c.first.marketProb == null ? null : c.first.modelProb - c.first.marketProb }));
  const rules = {
    likely: { pick: () => cands, near: () => [], by: (a, b) => b.modelProb - a.modelProb },
    value: {
      pick: () => priced.filter((c) => c.ev > 0 && c.price < 400 && c.modelProb >= 0.15 && c.books >= 2),
      near: () => priced.filter((c) => c.price < 400), by: byEv,
    },
    longshot: {
      pick: () => priced.filter((c) => c.price >= 400 && c.ev > 0 && c.tgt20 >= 1),
      near: () => priced.filter((c) => c.price >= 400), by: byEv,
    },
    due: {
      pick: () => priced.filter((c) => c.tdDiff <= -0.8 && c.tgt20 >= 3),
      near: () => priced.filter((c) => c.tdDiff < 0 && c.tgt20 >= 1), by: (a, b) => a.tdDiff - b.tdDiff,
    },
    fade: {
      pick: () => priced.filter((c) => c.price <= 250 && c.edge <= -0.08),
      near: () => priced.filter((c) => c.price <= 300 && c.edge < 0), by: (a, b) => a.edge - b.edge,
    },
    first: {
      pick: () => firstRows.filter((c) => c.ev > 0 && c.books >= 2 && c.tgt20 >= 1 && c.modelProb >= 0.04),
      near: () => firstRows, by: byEv,
    },
  };
  const cats = {}, closeCalls = {};
  for (const [k, r] of Object.entries(rules)) cats[k] = top([...r.pick()], r.by);
  // A fade close call shouldn't contradict a real "due" pick (or vice versa).
  const avoid = { fade: new Set(cats.due.map((c) => c.playerId)), due: new Set(cats.fade.map((c) => c.playerId)) };
  for (const [k, r] of Object.entries(rules)) {
    const taken = new Set(cats[k].map((c) => c.playerId));
    closeCalls[k] = r.near()
      .filter((c) => !taken.has(c.playerId) && !avoid[k]?.has(c.playerId))
      .sort(r.by)
      .slice(0, Math.max(0, PICKS_PER_CATEGORY - cats[k].length));
  }
  return {
    week: cands[0]?.week ?? data.upcoming?.[0]?.week ?? null,
    candidates: cands.length,
    priced: priced.length,
    cats,
    closeCalls,
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    SCORING, fantasyPoints, gamesFor, aggregate, TD_ZONES, TD_PER_POINT, zoneCounts, tdModel, shrunkXtdPg, tdOdds,
    defenseVsTe, impliedProb, playerOdds, isOut, payout, evPer100, BET_CATEGORIES, bestBets,
  };
}
