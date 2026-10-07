// Shared code for every page: data loading, stat aggregation, fantasy scoring, the
// touchdown model, URL state and the watchlist. Plain globals, no build step.

const TE = { data: null };

async function loadData() {
  if (TE.data) return TE.data;
  const { current } = await (await fetch("data/seasons.json", { cache: "no-cache" })).json();
  const res = await fetch(`data/${current}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Couldn't load data (HTTP ${res.status})`);
  TE.data = await res.json();
  // Sportsbook snapshot (optional: the site works without it).
  try {
    const o = await fetch(`data/odds-${current}.json`, { cache: "no-cache" });
    TE.data.odds = o.ok ? await o.json() : null;
  } catch {
    TE.data.odds = null;
  }
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
  signed: (n) => {
    if (n == null || !Number.isFinite(n)) return "–";
    const r = Math.round(n * 10) / 10;
    return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)}`;
  },
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

// ---- Sportsbook odds ----

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}


function americanText(o) {
  return o == null ? "–" : o > 0 ? `+${o}` : `−${Math.abs(o)}`;
}
function oddsAsOf(data) {
  if (!data.odds?.takenAt) return "";
  const d = new Date(data.odds.takenAt);
  return `Sportsbook odds as of ${d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`;
}
function bookTdCell(o) {
  if (!o?.td) return `<span class="muted">–</span>`;
  const market = o.td.marketProb != null ? ` · market ${Math.round(o.td.marketProb * 100)}%` : "";
  return `<span title="Best of ${o.td.books} book${o.td.books > 1 ? "s" : ""}: ${esc(o.td.book)}${market}">${americanText(o.td.best)}</span>`;
}
function recLineCell(o) {
  if (!o?.rec) return `<span class="muted">–</span>`;
  const r = o.rec;
  return `<span title="Over ${americanText(r.over)} (${esc(r.overBook ?? "–")}) · Under ${americanText(r.under)} (${esc(r.underBook ?? "–")})">${r.line} <small class="muted">o${americanText(r.over)}</small></span>`;
}
function edgeCell(model, market) {
  if (model == null || market == null) return `<span class="muted">–</span>`;
  const e = Math.round((model - market) * 100);
  return `<span class="${e > 0 ? "pos" : e < 0 ? "neg" : ""}">${e > 0 ? "+" : e < 0 ? "−" : ""}${Math.abs(e)}</span>`;
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
// Small injury badge: Q (amber), D / O / IR / SUS (red). Empty when healthy.
function injuryTag(p) {
  const st = p?.injury?.status;
  if (!st) return "";
  const short = /^questionable/i.test(st) ? "Q" : /^doubtful/i.test(st) ? "D" : /^out/i.test(st) ? "O" : /^injured reserve/i.test(st) ? "IR" : /^suspen/i.test(st) ? "SUS" : /^physically/i.test(st) ? "PUP" : st.slice(0, 3).toUpperCase();
  return ` <span class="inj${short === "Q" ? " q" : ""}" title="${esc(st)}${p.injury.date ? ` (${esc(new Date(p.injury.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }))})` : ""}">${short}</span>`;
}
function teamChip(data, abbr) {
  const t = data.teams[abbr];
  return `<span class="team" style="--team:${esc(t?.color ?? "#888")}">${esc(abbr)}</span>`;
}
function playerLink(a) {
  return `<a class="pname" href="player.html?id=${encodeURIComponent(a.id)}">${esc(a.player?.name ?? a.id)}</a>${injuryTag(a.player)}`;
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
