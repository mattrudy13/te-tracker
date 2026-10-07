# te-tracker: project notes

NFL tight end stats/usage/TD-odds site on GitHub Pages: https://mattrudy13.github.io/te-tracker/
See README.md for features, the TD model and how to run it. Same conventions as `../h2h`: plain HTML/CSS/JS,
no build step, globals in `common.js`, Barlow Condensed + Inter, dark top bar.

## Status (2026-10-06)

Live and working end to end:
- Pages: Best Bets (home), Matchups, Leaders, Touchdowns, Player. Watchlist, shareable URLs, dark mode,
  phone layout. Compare was removed on request (2026-10-06).
- Best Bets track record starts with week 5 (picks are recorded at the Thu/Sun snapshots, graded by update-data).
- Data: `update-data.yml` (ESPN, every 3 h Thu–Mon + Tue) and `snapshot-odds.yml` (The Odds API, Thu 5 PM ET
  + Sun 8 AM ET). `ODDS_API_KEY` secret is set. The first real snapshot (Mon night) priced 37 TEs, 483
  credits left.
- TD model calibrated against that snapshot (RMSE 11.2 → 6.4 pts). Constants are at the top of the TD
  model section in common.js.

Next steps: ENHANCEMENTS.md. The highest-value items are injury tags, scoring the model and books against
results, and a receptions projection vs the line.

## Layout

- `scripts/build-data.mjs`: the only thing that talks to ESPN. Writes `data/<season>.json`,
  `data/positions-<season>.json` (athlete position cache) and `data/seasons.json` (`{current}`, read
  by the site to pick the file).
- `scripts/fetch-odds.mjs` + `.github/workflows/snapshot-odds.yml`: The Odds API snapshot (Thu 21:00 /
  Sun 12:00 UTC) → `data/odds-<season>.json` `{ takenAt, games: {oddsEventId: {home, away, commence}},
  players: {espnId: {oddsGameId, td: {best, book, books, marketProb}, rec: {line, over, under, ...}}} }`.
  Needs the `ODDS_API_KEY` secret. It costs 1 credit per market per game (free tier 500/month), so don't
  schedule it more often without checking the quota (`x-requests-remaining` is logged). Players are matched
  by normalized name, then last name + first initial, among the two teams' TEs. The site shows odds only
  when the snapshot game's home/away match (`playerOdds()`), so stale weeks never leak. Test offline with
  `--fixture`.
- Both workflows share the `update-data` concurrency group and `git pull --rebase` before pushing.
- `.github/workflows/update-data.yml`: scheduled build; commits `data/` only if something other
  than `updated` changed.
- `model.js`: all data and model code, with no DOM access, shared by the pages (globals) and the Node scripts
  (`createRequire`): `aggregate`, `tdModel` / `tdOdds`, `isOut`, `defenseVsTe`, `playerOdds`, `bestBets`,
  `evPer100`. Pages load `model.js` before `common.js`. **Any model change affects recorded picks, so the page
  and the Action always agree.**
- `common.js`: DOM side: data loading, formatting, `renderTable()` (sortable), URL params, watchlist, markup
  helpers (`playerLink` includes `injuryTag`), odds cell helpers.
- `scripts/record-picks.mjs` (snapshot-odds.yml: build → fetch-odds → record) and `scripts/grade-picks.mjs`
  (update-data.yml: build → grade) maintain `data/picks-<season>.json` `{ weeks: { N: { picks: [{ cat, playerId,
  gameId, kickoff, price, book, modelProb, marketProb, ev, why, takenAt, result?, scored?, profit? }] } } }`.
  Picks lock at kickoff. Test with `NOW=<iso>` and a scratch copy of `data/`.
- `bestBets()` returns `cats` (strict rules: recorded and graded) and `closeCalls` (a looser pool that fills
  each category to 5, display only, `tr.close` with a "CC" label). The user asked for full lists but wanted
  the track record kept clean, so never record close calls.
- Pages: `index.html` (Best Bets, the home page by request), `matchups.html`, `leaders.html`, `touchdowns.html`,
  `player.html`. Matchups was briefly the home page, so `index.html` forwards `?open=` links to `matchups.html`;
  each keeps its page logic in an inline script. The nav is copied into each page; add new tabs to all of them.
- `defenseVsTe()` in model.js: TE fantasy points allowed per game by each defense (PPR, rank 1 = fewest).
- Odds helpers: `playerOdds()` / `impliedProb()` in model.js; `americanText()`, `bookTdCell()`,
  `recLineCell()`, `edgeCell()`, `oddsAsOf()` in common.js.
- Injuries: `players[id].injury = { status, date }` from the ESPN roster (`a.injuries[0]`). `isOut()` (Out,
  Doubtful, IR, suspended, PUP, NFI) sets `tdOdds` rows `out: true` and `prob: null`; those players are never picked.
- A defense-vs-TE multiplier was tested (2026-10-06) and left out: it worsened the market fit at every
  strength (RMSE 6.39 → 6.58–7.19). The note is in model.js. Revisit mid-season.

## Page notes

- Leaders is a usage/TD leaderboard by request: no fantasy points, no LNG, no scoring toggle. Per-game is
  the default (`?mode=tot` for totals); TD, xTD and TD − xTD are always season totals. It also shows this week's
  Rec line and Book TD.
- Matchups is odds-first by request: no fantasy columns and no scoring toggle. The TE table has grouped headers
  (Usage: Tgt/G, Share · Receptions: Rec/G, Line, O/U · Touchdowns: TD, RZ Tgt, Model, Book, Edge). Market %
  lives in the Book cell's tooltip. Finished games show the pregame price (✓/✗) and line
  (Over/Under) next to the box score. Data refreshes every 3 h, so in-progress games show no live stats.
- Wide tables: the matchup and Touchdowns odds tables use tighter cell padding (`.g-side .grid`,
  `.table-wrap.tight`) so they fit at 1280px without sideways scrolling. Check `scrollWidth <= clientWidth`
  on the table wrapper when adding columns.
- "Missed last game" (tdOdds `missedLast`) means no box-score row in the team's latest game, which also
  catches a TE who played but drew no targets.
- The user cares about TD and receptions betting angles more than fantasy points. Keep new features
  pointed that way. Fantasy points survive only in the PPR defense line on Matchups (`defenseVsTe`) and
  `fantasyPoints()` in common.js. The player page is odds-first too: a "This week" card (rec line, O/U, over-the-line
  hit rate, model TD vs book), receptions chart with the line drawn in, no scoring toggle.
- Player names (`.pname`) have a dotted underline so it's clear they link to player pages (the user didn't
  know the page existed).
- Edge is green for any positive value and red for any negative one (`edgeCell`). Touchdowns sorts by Edge by default.
- Explain jargon in plain words in page notes and header tooltips (the user asked what "Tgt %" meant).

## Data shape (data/<season>.json)

`games[]` has one row per TE per completed game: box score `rec,tgt,yds,td,long,rushAtt,rushYds,rushTd,
fumLost`, team totals `teamTgt,teamRecYds` (share denominators), and play-by-play red-zone splits
`tgt5,tgt10,tgt20,td5,td10,td20` (cumulative: inside the 5 ⊂ 10 ⊂ 20). `upcoming[]` has one row per team for
the next week, with `implied` points (from `total` and `spread`). `spread` is from that team's side.
`schedule` = `{ week, games[] }` for the matchups page: the first not-yet-ended calendar week that still has
an unfinished game, so it rolls over once Monday night is final. Each game has `state` (pre/in/post),
`detail`, `network`, `home`/`away`, scores, and `spread` (home side) / `total`. ESPN drops odds from
finished games, so those are null. `upcoming` can be a week ahead of `schedule` on Monday nights.

## ESPN API quirks

- `site.api.espn.com` needs no key and sends CORS `*`. Box score athletes have **no position**,
  so TEs come from `/teams/{id}/roster`. Players who aren't on a roster are looked up via
  `site.web.api.espn.com/apis/common/v3/.../athletes/{id}` and cached in `positions-<season>.json`.
- Scoreboard `odds[0].spread` is from the **home** team's side (−3 = home favored by 3), even when
  `details` names the away favorite.
- Play-by-play (`summary.drives.previous[].plays`) has `participants: null`, so receivers are parsed
  from text (`pass ... to K.Pitts`, `Bi.Robinson` for disambiguation) and matched to that team's
  TEs by last name + first-name prefix (`matchesPbpName`). Some scoring plays are mistyped (e.g.
  "Fumble Recovery (Own)") and carry summary text ("X 13 Yd pass from Y"), which has its own fallback.
  Skip `NULLIFIED` / `No Play`.
- Games are only processed once `status.type.completed`, and `processedEvents` stops
  them from being fetched again. To force a full rebuild, delete `data/<season>.json`.
- Around Monday night the current week has no unplayed games left, so `upcoming` looks at the next
  calendar week as well (`openWeeks` in build-data.mjs holds both).

## Dev notes

- Serve with `python3 -m http.server`. Test with Playwright from `../apartments/.venv/bin/python`.
  Check every page in light and dark mode, at 375px (`scrollWidth <= 375`), with no console errors.
- Spot-check numbers against `site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{id}/gamelog?season=YYYY`.
- Keep page copy pronoun-neutral ("the player").
- GitHub Pages sends `max-age=600`, so a page can be served stale for 10 minutes after a deploy. When
  something "disappears" right after a push, check for that first (it happened with the nav tab).
- Test odds UI offline: intercept `data/odds-2026.json` (and `data/2026.json` for a pre-kickoff week) with
  Playwright `page.route`. Never commit fixture odds.
- Commit prefixes: `feat:`, `fix:`, `docs:`, `data:` (the bot uses `data:`).
