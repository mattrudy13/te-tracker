# te-tracker: project notes

NFL tight end stats/usage/TD-odds site on GitHub Pages: https://mattrudy13.github.io/te-tracker/
See README.md for features, the TD model and how to run it. Same conventions as `../h2h`: plain HTML/CSS/JS,
no build step, globals in `common.js`, Barlow Condensed + Inter, dark top bar.

## Status (2026-10-05)

Live and working end to end:
- Pages: Leaders, Matchups, Touchdowns, Player, Compare. Watchlist, shareable URLs, dark mode, phone layout.
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
- `common.js`: data loading, `aggregate()`, `fantasyPoints()`, `tdModel()` / `tdOdds()`,
  `renderTable()` (sortable), URL params, watchlist (localStorage), markup helpers.
- Pages: `index.html` (leaders), `matchups.html`, `touchdowns.html`, `player.html`, `compare.html`;
  each keeps its page logic in an inline script. The nav is copied into each page; add new tabs to all of them.
- `defenseVsTe()` in common.js: TE fantasy points allowed per game by each defense (PPR, rank 1 = fewest).
- Odds helpers in common.js: `playerOdds()`, `impliedProb()`, `americanText()`, `bookTdCell()`,
  `recLineCell()`, `edgeCell()`, `oddsAsOf()`.

## Page notes

- Matchups is odds-first by request: no fantasy columns and no scoring toggle. Before kickoff it shows
  Model TD / Book TD / Market / Edge / Rec line / O-U. Finished games show the pregame price (✓/✗) and line
  (Over/Under) next to the box score. Data refreshes every 3 h, so in-progress games show no live stats.
- Wide tables: the matchup and Touchdowns odds tables use tighter cell padding (`.g-side .grid`,
  `.table-wrap.tight`) so they fit at 1280px without sideways scrolling. Check `scrollWidth <= clientWidth`
  on the table wrapper when adding columns.
- "Missed last game" (tdOdds `missedLast`) means no box-score row in the team's latest game, which also
  catches a TE who played but drew no targets.
- The user cares about TD and receptions betting angles more than fantasy points. Keep new features
  pointed that way.

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
