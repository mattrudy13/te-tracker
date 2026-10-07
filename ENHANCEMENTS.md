# Enhancements

Ideas for the site, roughly in priority order within each section. `[x]` done, `[~]` partly done.
The focus is touchdowns and receptions betting angles. Fantasy is secondary.

## Quick wins
- [x] **Injury tags**: ESPN game summaries (`injuries`) and team rosters carry each player's status
      (Questionable / Doubtful / Out / IR). Show a Q/D/O tag next to the name on Matchups and
      Touchdowns, set TD % to 0 for Out, and replace the vague "missed last game" flag with the real
      reason.
- [~] **"Missed last game" false positives**: hidden when an injury tag explains it. Still open otherwise: a TE who played but drew no targets has no box-score
      line, so they're flagged too. Injury data (above) or the box score's full participant list
      would fix it.
- [x] **Best edges card**: now the Best Bets page. a short "biggest model-vs-market gaps this week" list at the top of
      Matchups (top 5 positive and negative TD edges, plus any receptions edges once those exist).
- [ ] **Watchlist filter on Matchups**: show only games with a starred TE, and open them by default.
- [ ] **Cache-busting**: add `?v=<commit>` to `style.css` / `common.js` (stamped by the workflow), so
      a deploy isn't half-stale for 10 minutes, as happened with a nav tab.

## Touchdown model
- [~] **Score the model and the books against results**: Best Bets records and grades its picks (W–L,
      units, ROI). Still open, the full version: at each Thursday/Sunday snapshot, save
      the model's TD % and the book prices for every priced TE (`data/predictions-<season>.json`).
      After the games, record who scored. Show a calibration table on Touchdowns (predicted vs
      actual by bucket), Brier score / log loss for model vs market, and the ROI from betting every
      positive-edge TE at the best price. That's the honest test of whether Edge means anything.
- [ ] **Recalibrate every few weeks** from those results (and the market), not just the first
      snapshot. The current constants came from one Monday-night snapshot of ~30 mostly star TEs.
- [ ] **Red-zone target share**: count every receiver's red-zone targets from the play-by-play
      (not just TEs), so a TE's share of team RZ looks can feed the model. That's a stronger signal than raw
      counts when teams differ in red-zone trips.
- [~] **Defense vs TE touchdowns**: shown in each Best Bets reason. A model multiplier was tested and left
      out (it worsened the market fit after 4 weeks). Retest around week 9 with more data.
- [ ] **Goal-line role**: flag TEs with targets or carries inside the 5 in the last few games.
      Those are a small sample, but they're the plays books seem to price hardest.
- [ ] **First TD scorer odds**: the Odds API market `player_1st_td` (+1 credit per game, ~16 per
      snapshot). It would fit in the free tier alongside the current two markets.

## Receptions
- [ ] **Receptions projection vs the line**: project catches as targets per game × catch rate,
      adjusted for the team's implied pass volume. Turn that into P(over) with a Poisson or
      negative binomial, and compare it with the book's over/under prices for an Edge column like TDs.
- [ ] **Line movement**: keep the Thursday snapshot when Sunday's runs (today Sunday overwrites
      unplayed games) and show how TD prices and reception lines moved. ESPN's DraftKings feed also
      has `open` vs `current` reception lines for free.
- [ ] **Receiving yards line**: the `player_reception_yds` market (+1 credit per game) with the same
      over/under treatment.
- [~] **Hit rates**: the player page shows how often the TE has gone over this week's line. Still open: hit rates
      against each past week's own line, and how they've done when the book TD price was shorter than +200.

## Data and coverage
- [ ] **Snap counts and routes from nflverse**: free weekly CSVs with snap share, routes run and
      targets per route run. That's the real usage picture ESPN doesn't publish, and a better input for
      both models.
- [ ] **Better play-by-play target matching**: it matches box-score targets exactly in ~95% of games.
      Log the unmatched receiver names in the build so the misses can be fixed (two-point tries,
      laterals, unusual name abbreviations).
- [ ] **Two-point conversions** in fantasy points (from scoring-play text).
- [ ] **Postseason**: season type 3 games, with the schedule and odds following into the playoffs.
- [ ] **Past seasons**: build 2025 for year-over-year comparisons and better priors, plus a season
      picker (`data/seasons.json` already exists for this).

## Look and feel
- [ ] **Sticky player column** on wide tables at phone width, so the name stays visible while
      scrolling across the stats.
- [x] **Player page de-fantasy**: "This week" card with receptions line and TD odds, receptions chart
      against the line, no fantasy points.
- [ ] **Player odds history**: a weekly strip on the player page showing model TD %, book price and
      whether they scored, plus each week's reception line and result.
- [ ] **Per-game snapshot time** on Matchups ("odds as of Thu 5:00 PM" per game), since TNF and Sunday
      games come from different snapshots.
- [ ] **Sort Matchups games** by kickoff (current), by biggest TE edge, or by implied total.

## Code and reliability
- [ ] **Shared nav**: the top bar is copied into all four pages, and a missed copy is exactly how a
      tab can go missing. Render it from `common.js`, or check in CI that every page has every tab.
- [ ] **Odds quota guard**: skip a snapshot and open a GitHub issue if `x-requests-remaining` is low
      or the key fails, instead of silently writing an empty file.
- [ ] **Parser tests**: small fixtures for `TARGET_RE`, `matchesPbpName`, the mistyped-scoring-play
      fallback and odds name matching (`findTe`), run with `node --test` in CI.
- [ ] **Smoke test in CI**: load each page with Playwright after a deploy, and fail on console errors or
      an empty table.
- [ ] **ESPN schema watch**: the build depends on an unofficial API. Have it fail loudly (it does
      today) and validate the output shape (rows per game, players with no team), so a quiet change
      doesn't publish bad numbers.

## Best Bets
- [ ] **Receptions picks**: add over/under categories once a receptions projection exists (see Receptions).
- [ ] **Tracking by price band and book**: break the track record down by price range and sportsbook, to
      see whether the edge only exists at one offshore book's stale lines.
- [ ] **Closing-line value**: compare each pick's price with the Sunday-morning price for the same player.
      Beating the close is a faster signal than W–L.
- [ ] **Best book only from major US books**: an option to ignore offshore books (e.g. BetOnline) when
      choosing the best price, since many users can't bet there.

## Shipped
- [x] Leaderboard, Player, watchlist, shareable URLs, dark mode, phone layout
- [x] Leaders reworked around usage and TDs (no fantasy points or LNG), Compare removed, Matchups table
      consolidated into Usage / Receptions / Touchdowns groups, positive Edge in green, Touchdowns
      sorted by Edge, player page refocused on lines (2026-10-06)
- [x] Best Bets home page with five categories, recorded and graded picks, and injury tags (2026-10-06)
- [x] Red-zone splits from play-by-play, xTD, anytime-TD model with implied team points
- [x] Matchups page with each game's TEs, defense vs TE and finished-game box scores
- [x] Sportsbook odds snapshot (anytime TD, receptions line) on Matchups, Touchdowns and Player
- [x] TD model calibrated against the first snapshot
