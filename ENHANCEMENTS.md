# Enhancements

Ideas for the site, roughly in priority order within each section. `[x]` done, `[~]` partly done,
**(new)** added on 2026-10-06 after Best Bets shipped. The focus is touchdown and receptions betting.
Fantasy points are deliberately out of scope.

## Quick wins
- [x] **Cache-busting** (done 2026-10-06: `scripts/stamp-assets.mjs` content-hash stamps, plus a CI check): pages load `model.js`, `common.js` and `style.css`
      separately, and GitHub Pages lets browsers cache each for 10 minutes. Right after a deploy, a new
      page can run against an old `model.js` and break. Stamp `?v=<commit>` on those tags in the
      workflow (or a tiny pre-push script).
- [ ] **Watchlist filter on Matchups**: show only games with a starred TE, and open them by default.
- [~] **"Missed last game" false positives**: now hidden when an injury tag explains the absence.
      Still open: a TE who played but drew no targets has no box-score line, so they're still flagged.
      The box score's full participant list (or snap counts, below) would fix it.
- [ ] **(new) Post the week's picks as a GitHub issue**: after Thursday's snapshot, the workflow opens an
      issue listing the official picks. GitHub emails you, so the picks arrive without opening the site.

## Best Bets
- [x] **(new) Shadow record for close calls** (done 2026-10-06): save close calls too, flagged so they never count in the
      official record, and show their results separately. After a few weeks this shows whether the
      category rules are too strict or too loose. It's the data needed to tune them (next item).
- [ ] **(new) Tune the category rules from results** (around week 9): thresholds like "+400 for
      longshots", "TD − xTD ≤ −0.8" and "edge ≤ −8" were set by judgment. Check them against the
      official and shadow records.
- [x] **Best book only from US-licensed books** (done 2026-10-06, everywhere, no toggle): offshore books
      (e.g. BetOnline.ag) are ignored when choosing the best price and market median. Before, they supplied
      7 of the 30 best prices in the first snapshot.
- [ ] **Tracking by price band and book** (per-book prices are now saved in `td.prices`): break the record
      down by price range and sportsbook, to see
      whether the edge only exists at one book's stale lines.
- [ ] **Closing-line value**: compare each Thursday pick's price with Sunday's price for the same player.
      Beating the closing line is a faster, less noisy signal than W–L.
- [ ] **(new) What changed since Thursday**: after the Sunday snapshot, mark picks that are new, dropped,
      or re-priced since Thursday (with the price move), so a Sunday-morning check is quick.
- [ ] **(new) Units chart**: cumulative units by week for each category, under the record table.
- [ ] **(new) Blend model and market for "Most likely to score"**: rank by an average of the model and the
      de-vigged market instead of the model alone. Books know about injuries and game plans that the model
      doesn't, so the blend should be the better "who will score" estimate. Keep value bets model-driven.
- [ ] **(new) Suggested stake size**: a conservative fraction-of-Kelly bet size per value pick (e.g. ¼ Kelly,
      capped), shown only once the track record supports trusting the model's edge.
- [ ] **(new) Copy picks**: a button that copies the week's picks as plain text (player, market, price,
      book) for a notes app or group chat.
- [ ] **(new) Calibrate the first-TD model** (after 2–3 snapshots with first-TD prices): fit `TD_PER_POINT`
      against the de-vigged first-TD market, the way the anytime model was calibrated. Until then the model
      runs a bit above the actual TE first-TD rate (about 20% of games vs 16% in weeks 1–4), so the
      "First TD value" category may be too generous.
- [ ] **Receptions picks**: over/under categories, once the receptions projection exists (see Receptions).

## Touchdown model
- [~] **Score the model and the books against results**: Best Bets grades its own picks. Still open is the
      full version: save the model's TD % and book prices for *every* priced TE at each snapshot. After
      the games, show a calibration table (predicted vs actual), Brier score / log loss for model vs
      market, and ROI from betting every positive-edge TE. That's the honest test of whether Edge means
      anything.
- [ ] **Recalibrate every few weeks** from those results and the market. The current constants came
      from one Monday-night snapshot of ~30 mostly star TEs.
- [ ] **(new) Sunday inactives snapshot**: inactives come out about 90 minutes before kickoff (~11:30 AM ET
      for 1 PM games), after the 8 AM snapshot. A third snapshot then would catch late scratches and line
      moves. It costs ~26 credits, ~370/month for three a week, which is tight but under 500. Pair it with
      the quota guard below.
- [ ] **Red-zone target share**: count every receiver's red-zone targets from play-by-play (not just
      TEs), so a TE's share of the team's red-zone looks can feed the model. That's a better signal than raw
      counts when teams differ in red-zone trips.
- [~] **Defense vs TE touchdowns**: shown in each Best Bets reason. A model multiplier was tested and left
      out because it worsened the market fit after 4 weeks. Retest around week 9 with more data.
- [ ] **Goal-line role**: flag TEs with targets or carries inside the 5 over the last few games. The sample
      is small, but those are the plays books seem to price hardest.
- [ ] **(new) Teammate injuries**: when the team's WR1 or other TE is ruled out, raise the TE's
      target share and TD chance. The roster injury data is already in the build.
- [ ] **First TD scorer odds**: the Odds API market `player_1st_td` (+1 credit per game, ~16 per
      snapshot). It would fit in the free tier alongside the current two markets.

## Receptions
- [ ] **Receptions projection vs the line**: project catches as targets per game × catch rate, adjusted
      for the team's implied pass volume. Turn that into P(over) with a Poisson or negative binomial,
      and compare it with the book's over/under prices for an Edge column like TDs.
- [~] **Hit rates**: the player page shows how often the TE has gone over this week's line. Still open:
      hit rates against each past week's own line, which needs line history (next item).
- [ ] **Line movement and history**: keep each snapshot instead of overwriting (today Sunday replaces
      Thursday for unplayed games), then show how TD prices and reception lines moved. ESPN's
      DraftKings feed also has `open` vs `current` reception lines for free.
- [ ] **Receiving yards line**: the `player_reception_yds` market (+1 credit per game) with the same
      over/under treatment.

## Data and coverage
- [ ] **Snap counts and routes from nflverse**: free weekly CSVs with snap share, routes run and targets
      per route run. That's the real usage picture ESPN doesn't publish, a better input for both models,
      and it fixes the "played but no targets" blind spot.
- [ ] **Better play-by-play target matching**: it matches box-score targets exactly in ~95% of games.
      Log the unmatched receiver names in the build so the misses can be fixed (two-point tries,
      laterals, unusual name abbreviations).
- [ ] **Postseason**: season type 3 games, with the schedule, odds and picks following into the playoffs.
- [ ] **Past seasons**: build 2025 for year-over-year comparisons and better priors, plus a season picker
      (`data/seasons.json` already exists for this).

## Look and feel
- [ ] **Sticky player column** on wide tables at phone width, so the name stays visible while scrolling
      across the stats.
- [ ] **Player odds history**: a weekly strip on the player page showing model TD %, book price and
      whether they scored, plus each week's reception line and result.
- [ ] **(new) Player's pick history**: on the player page, every Best Bets pick for that player and how
      it did.
- [ ] **Per-game snapshot time** on Matchups ("odds as of Thu 5:00 PM" per game), since TNF and Sunday
      games come from different snapshots.
- [ ] **Sort Matchups games** by kickoff (current), by biggest TE edge, or by implied total.

## Code and reliability
- [ ] **Odds quota guard**: skip a snapshot and open a GitHub issue if `x-requests-remaining` is low or the
      key fails, instead of silently writing an empty file.
- [ ] **(new) Tests for picks and grading**: the fixtures used during development (pick locking with
      `NOW=`, week-4 grading, no-change reruns) as `node --test` cases in CI. A bug there would quietly
      corrupt the track record.
- [ ] **Parser tests**: small fixtures for `TARGET_RE`, `matchesPbpName`, the mistyped-scoring-play
      fallback and odds name matching (`findTe`).
- [ ] **Shared nav**: the top bar is copied into all four pages, and a missed copy is how a tab can go
      missing. Render it from `common.js`, or check in CI that every page has every tab.
- [ ] **Smoke test in CI**: load each page with Playwright after a deploy, and fail on console errors or an
      empty table.
- [ ] **ESPN schema watch**: the build depends on an unofficial API. Have it fail loudly (it does today) and
      validate the output shape (rows per game, players with no team), so a quiet change doesn't publish
      bad numbers.

## Shipped
- [x] No tooltips anywhere: book names, O/U books, first-TD numbers and injury status are visible text, and
      column terms are explained in each page's notes, so phones see everything (2026-10-07)
- [x] First TD scorer: odds (de-vigged), model, Touchdowns toggle, player card, Matchups first-TD lines, and a graded
      "First TD value" Best Bets category, with first-TD scorers backfilled for weeks 1–4 (2026-10-07)
- [x] Best Bets home page: five categories, EV per $100, a reason per pick, picks recorded at each snapshot
      and locked at kickoff, graded after games (W–L–void, units, ROI) (2026-10-06)
- [x] Close calls fill short categories to five, shown lighter with a "CC" label and never graded (2026-10-06)
- [x] Injury tags from ESPN rosters on every page; Out / Doubtful / IR players never picked (2026-10-06)
- [x] `model.js` shared by the pages and the GitHub Action scripts (2026-10-06)
- [x] Leaders reworked around usage and TDs; Compare removed; Matchups table grouped into Usage /
      Receptions / Touchdowns; positive Edge in green; Touchdowns sorted by Edge (2026-10-06)
- [x] Player page refocused on this week's lines (receptions line and hit rate, TD odds, chart vs line)
- [x] Sportsbook odds snapshot (anytime TD, receptions line) from The Odds API, Thursday + Sunday
- [x] TD model calibrated against the first snapshot (RMSE 11.2 → 6.4 points vs the market)
- [x] Matchups page with each game's TEs, defense vs TE and finished-game box scores with pregame lines
- [x] Red-zone splits from play-by-play, xTD, anytime-TD model with implied team points
- [x] Leaderboard, player pages, watchlist, shareable URLs, dark mode, phone layout
