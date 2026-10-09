# te-tracker: project notes

NFL tight end stats/usage/TD-odds site on GitHub Pages: https://mattrudy13.github.io/te-tracker/
See README.md for features, the TD model and how to run it. Same conventions as `../h2h`: plain HTML/CSS/JS,
no build step, globals in `model.js` (data/model) and `common.js` (DOM), Barlow Condensed + Inter, dark top bar.

## Status (2026-10-08, end of session)

Live and working end to end:
- Pages: Best Bets (home), Matchups, Leaders, Touchdowns, Player. Watchlist, shareable URLs, dark mode,
  phone layout, injury tags. Compare was removed on request.
- Workflows: `update-data.yml` (ESPN every 3 h Thu–Mon + Tue → grade picks), `snapshot-odds.yml`
  (Thu 21:00 / Sun 12:00 UTC: build → odds → record picks), `check-assets.yml` (stamp check on push).
  `ODDS_API_KEY` secret is set.
- Odds: US-licensed books only. The first scheduled Thursday snapshot (Oct 8) priced 110 TEs; **420 credits left**
  this month. It started at 01:02 UTC, four hours late and after TNF kickoff (GitHub cron delay). If that
  repeats, move the cron earlier.
- Best Bets: week 5 has 26 official picks + 5 close calls (one TNF close call locked from Tuesday's manual
  snapshot). Picks now carry `open*` prices for CLV (see Layout). **Week 5 is the first graded week** (grading runs after games are final).
- TD model calibrated against the first snapshot (RMSE 11.2 → 6.4 pts vs de-vigged market). Constants are at
  the top of the TD model section in `model.js`.

Next steps: ENHANCEMENTS.md. Highest value now:
- check the first graded results after week 5
- the receptions projection vs the line (unlocks receptions picks)
- scoring the model and books on every priced TE
- closing-line value: shipped 2026-10-08 (CLV column); next is a later Sunday snapshot so the close is closer to kickoff
- around week 9: tune the category rules from the official and shadow records, and retest the defense factor

## Before every commit that touches model.js, common.js or style.css

Run `node scripts/stamp-assets.mjs`. It rewrites the `?v=<hash>` stamps in every HTML file.
`.github/workflows/check-assets.yml` fails the push otherwise. New pages must load those files with the same
`src="model.js"` / `href="style.css"` form so the stamper finds them.

## Layout

- `scripts/build-data.mjs`: the only thing that talks to ESPN. Writes `data/<season>.json`,
  `data/positions-<season>.json` (athlete position cache) and `data/seasons.json` (`{current}`, read
  by the site to pick the file).
- `scripts/fetch-odds.mjs` + `.github/workflows/snapshot-odds.yml`: The Odds API snapshot (Thu 21:00 /
  Sun 12:00 UTC) → `data/odds-<season>.json` `{ takenAt, games: {oddsEventId: {home, away, commence}},
  players: {espnId: {oddsGameId, td: {best, book, books, marketProb, prices: {book: price}}, first: {best, book,
  books, marketProb, fairProb, prices}, rec: {line, over, under, overBook, underBook, books}}}, excluded: [offshore keys] }`.
  `first` is the first-TD-scorer market (`player_1st_td`); `fairProb` is the median de-vigged chance (each book's
  prices divided by its overround over every outcome in the game; books with < 20 outcomes skipped). Always use
  `fairProb`, not `marketProb`, for first-TD edges: the margin is 25–40%.
  Needs the `ODDS_API_KEY` secret. It costs 1 credit per market per game (3 markets, ~375/month at two snapshots
  a week; free tier 500/month), so don't
  schedule it more often without checking the quota (`x-requests-remaining` is logged). Players are matched
  by normalized name, then last name + first initial, among the two teams' TEs. The site shows odds only
  when the snapshot game's home/away match (`playerOdds()`), so stale weeks never leak. Test offline with
  `--fixture`.
- Both workflows share the `update-data` concurrency group and `git pull --rebase` before pushing.
- `.github/workflows/update-data.yml`: scheduled build + grading; commits `data/` only if something other
  than `updated` changed.
- `.github/workflows/check-assets.yml`: runs `stamp-assets.mjs --check` on pushes that touch pages or shared assets.
- `model.js`: all data and model code, with no DOM access, shared by the pages (globals) and the Node scripts
  (`createRequire`): `aggregate`, `tdModel` / `tdOdds`, `isOut`, `defenseVsTe`, `playerOdds`, `bestBets`,
  `evPer100`. `tdOdds` rows also carry `firstProb` (first-TD chance, `TD_PER_POINT`). Pages load `model.js` before `common.js`. **Any model change affects recorded picks, so the page
  and the Action always agree.**
- `common.js`: DOM side: data loading, formatting, `renderTable()` (sortable), URL params, watchlist, markup
  helpers (`playerLink` includes `injuryTag`), odds cell helpers.
- `scripts/record-picks.mjs` (snapshot-odds.yml: build → fetch-odds → record) and `scripts/grade-picks.mjs`
  (update-data.yml: build → grade) maintain `data/picks-<season>.json` `{ weeks: { N: { picks: [{ cat, playerId,
  gameId, kickoff, price, book, modelProb, marketProb, ev, why, takenAt, oddsAt, shadow?, result?, scored?,
  profit?, openPrice?, openBook?, openMarketProb?, openOddsAt? }] } } }`.
  Picks lock at kickoff. A later snapshot replaces an unstarted pick but carries its first-seen price forward
  as `open*` (the replaced `price`/`marketProb` act as the close). The Track record's CLV column is the
  average move in `marketProb` toward the pick (flipped for fades), skipping picks with `openOddsAt === oddsAt`.
  Week 5's opens were backfilled from git history (Tuesday's snapshot). Test with `NOW=<iso>` and a scratch copy of `data/`.
- The "first" Best Bets category (first TD scorer) builds rows whose `price/book/modelProb/marketProb/ev` are the
  first-TD values, so record-picks needs no special case. grade-picks grades `cat === "first"` on the row's
  `firstTd` flag.
- `bestBets()` returns `cats` (strict rules: official picks) and `closeCalls` (a looser pool that fills each
  category to 5, `tr.close` with a "CC" label). record-picks saves close calls with `shadow: true`; they're
  graded like picks but shown only in the separate "shadow record" table. **Never let shadow picks into the
  official record.** Every consumer must filter on `!p.shadow`. The lock key includes the shadow flag.
- Odds are US-licensed books only: `OFFSHORE_BOOKS` in fetch-odds.mjs (Odds API bookmaker keys) are dropped
  before best price / market median. The user chose "exclude everywhere, no toggle". `td.prices` keeps the
  per-book prices for future by-book tracking.
- Pages: `index.html` (Best Bets, the home page by request), `matchups.html`, `leaders.html`, `touchdowns.html`,
  `player.html`. Matchups was briefly the home page, so `index.html` forwards `?open=` links to `matchups.html`;
  each keeps its page logic in an inline script. The nav is copied into each page; add new tabs to all of them.
- `defenseVsTe()` in model.js: TE receptions, targets, yards and TDs allowed per game by each defense
  (rank 1 = fewest receptions). `bestBets()` ranks by `tdPg` itself, so the rank doesn't touch picks.
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
  (Usage: Tgt/G, Share · Receptions: Rec/G, Line, O/U · Touchdowns: TD, RZ Tgt, Model, Book, Edge). Market % isn't
  shown (it only feeds Edge); the book name and the first-TD model and price are second lines in their cells. Finished games show the pregame price (✓/✗) and line
  (Over/Under) next to the box score. Data refreshes every 3 h, so in-progress games show no live stats.
- Wide tables: the matchup and Touchdowns odds tables use tighter cell padding (`.g-side .grid`,
  `.table-wrap.tight`) so they fit at 1280px without sideways scrolling. Check `scrollWidth <= clientWidth`
  on the table wrapper when adding columns.
- "Missed last game" (tdOdds `missedLast`) means no box-score row in the team's latest game, which also
  catches a TE who played but drew no targets. It's hidden when an injury tag already explains the absence.
- The user cares about TD and receptions betting angles more than fantasy points. Keep new features
  pointed that way. Fantasy points survive only in `fantasyPoints()` / `aggregate` in model.js (no page
  shows them). The player page is odds-first too: a "This week" card (rec line, O/U, over-the-line
  hit rate, model TD vs book), receptions chart with the line drawn in, no scoring toggle.
- Player names (`.pname`) have a dotted underline so it's clear they link to player pages (the user didn't
  know the page existed).
- Edge is green for any positive value and red for any negative one (`edgeCell`). Touchdowns sorts by Edge by default.
- Touchdowns has an Anytime / 1st TD toggle (`?mkt=first`). The 1st TD view swaps the Rec line column for
  "1st TDs" so the table still fits at 1280px. Column keys stay the same, so the sort carries over.
- Explain jargon in plain words in the page notes (the user asked what "Tgt %" meant).
- **Tooltips only for definitions** (`title=` attributes), by request: they don't work on phones. A tooltip may
  define a term or give a helpful hint (e.g. what a column abbreviation means), but never carry information
  that's needed to use the page. Say why when adding one. Anything worth knowing is visible text: a second line
  in the cell (`<small class="ln">`, e.g. the book under a price), a page note, or a card subtitle. Jargon is
  still explained in the page notes too, so phone users get it. `renderTable` columns have no `title` field
  yet. Use `aria-label` for icon-only buttons.

## Data shape (data/<season>.json)

`players{}`: `name, short, team, headshot, jersey, age, exp, onRoster, injury: {status, date} | null`.
`games[]` has one row per TE per completed game: box score `rec,tgt,yds,td,long,rushAtt,rushYds,rushTd,
fumLost`, `firstTd` (true if this TE scored the game's first TD), team totals `teamTgt,teamRecYds` (share denominators), and play-by-play red-zone splits
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
- First TD scorer: the first `scoringPlays[]` entry with `type.abbreviation === "TD"`, name parsed from
  "X 2 Yd pass from Y" and matched to that team's TEs. The TE's game row gets `firstTd: true` (absent otherwise).
  `--backfill-first-td` refetches processed games to reset the flags (it was run once on 2026-10-07 for weeks 1–4).
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
- The user's global rule: no commits or pushes 8 AM–5 PM ET on weekdays unless they ask (a hook enforces it).
  Check `TZ=America/New_York date` before committing.
