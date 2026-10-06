// Shared code for every page: data loading, stat aggregation, fantasy scoring, the
// touchdown model, URL state and the watchlist. Plain globals, no build step.

const TE = { data: null };

async function loadData() {
  if (TE.data) return TE.data;
  const { current } = await (await fetch("data/seasons.json", { cache: "no-cache" })).json();
  const res = await fetch(`data/${current}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Couldn't load data (HTTP ${res.status})`);
  TE.data = await res.json();
  return TE.data;
}

// ---- Formatting ----

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
const fmt = {
  int: (n) => (n == null || !Number.isFinite(n) ? "–" : Math.round(n).toLocaleString()),
  d1: (n) => (n == null || !Number.isFinite(n) ? "–" : n.toFixed(1)),
  d2: (n) => (n == null || !Number.isFinite(n) ? "–" : n.toFixed(2)),
  pct: (n) => (n == null || !Number.isFinite(n) ? "–" : `${(n * 100).toFixed(1)}%`),
  pct0: (n) => (n == null || !Number.isFinite(n) ? "–" : `${Math.round(n * 100)}%`),
  signed: (n) => (n == null || !Number.isFinite(n) ? "–" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}`),
  // Fair American odds for a probability.
  odds: (p) => {
    if (!(p > 0 && p < 1)) return "–";
    return p >= 0.5 ? `−${Math.round((100 * p) / (1 - p))}` : `+${Math.round((100 * (1 - p)) / p)}`;
  },
};
function updatedText(data) {
  const d = new Date(data.updated);
  return `Through week ${data.weeks.at(-1) ?? "–"} · updated ${d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

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
      a = { id: g.playerId, player: data.players[g.playerId], team: g.team, gp: 0, fpts: 0, long: 0, xtd: 0, games: [] };
      for (const k of SUM_KEYS) a[k] = 0;
      by.set(g.playerId, a);
    }
    a.gp++;
    a.team = g.team; // latest team, since games are in week order
    for (const k of SUM_KEYS) a[k] += g[k];
    a.long = Math.max(a.long, g.long);
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
// Expected receiving TDs (xTD): each target is worth the TE-wide TD rate for where it was
// thrown from (inside the 5, 6–10, 11–20, or outside the red zone). Rates are this season's
// actual TE results blended with priors, so the first weeks aren't driven by a few plays.
// Anytime-TD odds: expected TDs per game (season blended with the last 3 games), scaled by
// the team's implied points for the matchup, through a Poisson: P = 1 − e^(−λ).

const TD_ZONES = [
  { key: "i5", label: "Inside 5", prior: 0.42, weight: 40 },
  { key: "i10", label: "6–10", prior: 0.22, weight: 60 },
  { key: "i20", label: "11–20", prior: 0.1, weight: 100 },
  { key: "out", label: "Outside 20", prior: 0.025, weight: 800 },
];
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
    const xtdRecent = recent.reduce((s, g) => s + model.xtd(g), 0) / recent.length;
    // Small rushing-TD bump for the few TEs who get carries near the goal line.
    const rush = a.rushTd / a.gp;
    const base = (a.gp >= 3 ? 0.5 * xtdSeason + 0.5 * xtdRecent : xtdSeason) + 0.5 * rush;
    const scale = u.implied ? u.implied / model.avgImplied : 1;
    const lambda = base * scale;
    const missedLast = (lastTeamWeek[team] ?? 0) > a.games.at(-1).week;
    rows.push({ ...a, team, up: u, xtdPg: xtdSeason, xtdRecent, lambda, prob: 1 - Math.exp(-lambda), missedLast });
  }
  return rows.sort((x, y) => y.prob - x.prob);
}

// ---- URL state ----

function getParams() {
  return Object.fromEntries(new URLSearchParams(location.search));
}
function setParams(obj) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== "" && v != null && v !== false) q.set(k, v === true ? "1" : v);
  const s = q.toString();
  history.replaceState(null, "", s ? `?${s}` : location.pathname);
}

// ---- Watchlist (per browser) ----

const WATCH_KEY = "te-tracker:watchlist";
function getWatchlist() {
  try {
    return new Set(JSON.parse(localStorage.getItem(WATCH_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function toggleWatch(id) {
  const w = getWatchlist();
  w.has(id) ? w.delete(id) : w.add(id);
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify([...w]));
  } catch {}
  return w.has(id);
}
function starButton(id, watched) {
  return `<button class="star${watched ? " on" : ""}" data-star="${esc(id)}" aria-pressed="${watched}" title="${watched ? "Remove from" : "Add to"} watchlist">${watched ? "★" : "☆"}</button>`;
}
// Star clicks anywhere on the page; `onChange` re-renders if the page needs to.
function initStars(onChange) {
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-star]");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const on = toggleWatch(b.dataset.star);
    b.classList.toggle("on", on);
    b.textContent = on ? "★" : "☆";
    b.setAttribute("aria-pressed", on);
    onChange?.();
  });
}

// ---- Shared bits of markup ----

function headshot(p, size = 36) {
  if (p?.headshot) {
    return `<img class="hs" src="${esc(p.headshot)}" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'hs hs-x'}))">`;
  }
  return `<span class="hs hs-x" style="width:${size}px;height:${size}px"></span>`;
}
function teamChip(data, abbr) {
  const t = data.teams[abbr];
  return `<span class="team" style="--team:${esc(t?.color ?? "#888")}">${esc(abbr)}</span>`;
}
function playerLink(a) {
  return `<a class="pname" href="player.html?id=${encodeURIComponent(a.id)}">${esc(a.player?.name ?? a.id)}</a>`;
}
function matchup(u) {
  return `${u.home ? "vs" : "@"} ${esc(u.opp)}`;
}

// Sortable table: columns are { key, label, fmt, cls, title, sort }. Sort state lives on `state`.
function renderTable(el, rows, cols, state, onSort) {
  const dir = state.dir === "asc" ? 1 : -1;
  const col = cols.find((c) => c.key === state.sort) ?? cols[0];
  const val = col.sort ?? ((r) => r[col.key]);
  rows = [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return typeof x === "string" ? x.localeCompare(y) * dir : (x - y) * dir;
  });
  el.innerHTML = `<table class="grid"><thead><tr>${cols
    .map(
      (c) =>
        `<th class="${c.cls ?? ""}${c.key === col.key ? " sorted " + state.dir : ""}" ${c.title ? `title="${esc(c.title)}"` : ""}>${
          c.nosort ? c.label : `<button data-sort="${c.key}">${c.label}</button>`
        }</th>`
    )
    .join("")}</tr></thead><tbody>${
    rows.length
      ? rows.map((r, i) => `<tr>${cols.map((c) => `<td class="${c.cls ?? ""}">${c.fmt(r, i)}</td>`).join("")}</tr>`).join("")
      : `<tr><td class="empty" colspan="${cols.length}">No tight ends match these filters.</td></tr>`
  }</tbody></table>`;
  el.querySelectorAll("[data-sort]").forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.sort;
      if (state.sort === k) state.dir = state.dir === "asc" ? "desc" : "asc";
      else {
        state.sort = k;
        state.dir = cols.find((c) => c.key === k)?.asc ? "asc" : "desc";
      }
      onSort();
    })
  );
}

function showError(err) {
  const el = document.getElementById("status");
  if (el) {
    el.hidden = false;
    el.textContent = err.message || String(err);
  }
  console.error(err);
}

// Chart.js colors that follow the light/dark theme.
function chartTheme() {
  const cs = getComputedStyle(document.documentElement);
  return { fg: cs.getPropertyValue("--muted").trim(), grid: cs.getPropertyValue("--border").trim() };
}
const SERIES = ["#2f7de1", "#e8590c", "#2b9348", "#c2255c"];
