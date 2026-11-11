# Enhancements

Ideas for the site, roughly in priority order within each section. `[x]` done, `[~]` partly done,
**(new)** added on 2026-10-06 after Best Bets shipped, **(10-13)** added on 2026-10-13, **(11-11)** added on
2026-11-11 after a health check through week 9. The focus is touchdown and receptions betting.
Fantasy points are deliberately out of scope.

## Quick wins
- [x] **Cache-busting** (done 2026-10-06: `scripts/stamp-assets.mjs` content-hash stamps, plus a CI check): pages load `model.js`, `common.js` and `style.css`
      separately, and GitHub Pages lets browsers cache each for 10 minutes. Right after a deploy, a new
      page can run against an old `model.js` and break. Stamp `?v=<commit>` on those tags in the
      workflow (or a tiny pre-push script).
- [ ] **Watchlist filter on Matchups**: show only games with a starred TE, and open them by default.
- [x] **"Missed last game" false positives** (done 2026-10-13): hidden when an injury tag explains the
      absence, and a TE who played without a target now has a `noLine` game row, so only real absences are flagged.
- [ ] **(new) Post the week's picks as a GitHub issue**: after Thursday's snapshot, the workflow opens an
      issue listing the official picks. GitHub emails you, so the picks arrive without opening the site.

## Best Bets
- [x] **(new) Shadow record for close calls** (done 2026-10-06): save close calls too, flagged so they never count in the
      official record, and show their results separately. After a few weeks this shows whether the
      category rules are too strict or too loose. It's the data needed to tune them (next item).
      Since 2026-10-13 players cut by the usage rule are a second shadow set with their own table.
- [~] **(new) Tune the category rules from results** (reviewed 2026-11-07: First TD value and
      Longshots go shadow-only, defense factor added; details in CLAUDE.md next steps). **Shipped 2026-11-11**, rechecked
      with week 9 first: First TD value 0–27 and Longshots 1–24 are tracking only (their week 5–9 picks moved
      out of the official record), defense factor in (Brier 0.0935 vs 0.0950 without, books 0.0948). Next
      review around week 13. Change rules before a Thursday snapshot, never mid-week. Original note: thresholds like "+400 for
      longshots", "TD − xTD ≤ −0.8" and "edge ≤ −8" were set by judgment. Check them against the
      official and shadow records. Also review the usage rule (2+ targets in the last 2 games) against the
      "Cut by the usage rule" table, and judge fades by faded players who scored vs market expected, not W–L.
- [ ] **(10-13) Fade "No" prices**: fades have no profit figure because only the "Yes" side is saved. If any
      US book posts anytime-TD "No" prices in the Odds API feed, save them so fades can be graded as real bets.
- [x] **Best book only from US-licensed books** (done 2026-10-06, everywhere, no toggle): offshore books
      (e.g. BetOnline.ag) are ignored when choosing the best price and market median. Before, they supplied
      7 of the 30 best prices in the first snapshot.
- [ ] **Tracking by price band and book** (per-book prices are now saved in `td.prices`): break the record
      down by price range and sportsbook, to see
      whether the edge only exists at one book's stale lines.
- [x] **Closing-line value** (done 2026-10-08): picks keep their first-seen price (`open*`) when a later
      snapshot replaces them, and the Track record shows the average market move toward each category's picks.
      Still open: the Sunday snapshot (4 AM ET since 2026-10-13) is ~9 h before kickoff, so it's an early "close"; the inactives
      snapshot (below) would sharpen it. Picks dropped between snapshots aren't kept, so CLV only covers picks
      that survived.
- [ ] **(11-11) Price cap on Value picks (shadow test first)**: through week 9, betting every positive-edge TE
      won at short prices and lost at long ones: under +200, 7 of 10 (+7.3 units); +200 to +399, 9 of 36
      (+0.2); +400 and up, 5 of 88 (−23.5). Books and model both overrate longshots, so a model "edge" at +400
      and up is mostly that bias. Record a shadow "Value under +400" set next to the current Value picks and
      compare after 4+ weeks before changing the official rule.
- [ ] **(11-11) Decide what to do with Due**: 8–19, −5.3 units through week 9, with 8.7 wins expected by both
      the market and the model. "Scored less than xTD says" is already in the price, so the category has no
      edge of its own. Options at the next rule review: make it shadow-only, or require a positive model edge
      as well (which makes it a subset of Value).
- [ ] **(new) What changed since Thursday**: after the Sunday snapshot, mark picks that are new, dropped,
      or re-priced since Thursday (with the price move), so a Sunday-morning check is quick.
- [ ] **(new) Units chart**: cumulative units by week for each category, under the record table (bets
      only; fades are kept out of the totals since 2026-10-13).
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
      "First TD value" category may be too generous (it went 0–5 in week 5). Recheck that gap now that
      zero-target games count (2026-10-13), which lowered every part-time TE's λ.
- [ ] **Receptions picks**: over/under categories, once the receptions projection exists (see Receptions).

## Touchdown model
- [~] **Score the model and the books against results**: `scripts/score-model.mjs` (2026-11-07) does the
      Brier / log loss / price-range part from git history; a page for it is still open. Best Bets grades its own picks. Still open is the
      full version: the model's TD % and book prices for *every* priced TE at each snapshot. After the games,
      show a calibration table (predicted vs actual), Brier score / log loss for model vs market, and ROI from
      betting every positive-edge TE. That's the honest test of whether Edge means anything. Nothing new has
      to be saved: every snapshot is in git history, and the 2026-10-13 recheck rebuilt the model as of each
      snapshot from it (method in CLAUDE.md Status). Turn that into a committed `scripts/score-model.mjs`.
- [ ] **(11-11) Save the weekly scores for the site**: have the Tuesday grading run write the scoring
      script's output (per week and per price range: n, scored, model and book expected, Brier) to
      `data/scores-<season>.json`. The calibration table above then reads one small file instead of
      rebuilding from git history, and the weekly rerun stops being a manual step.
- [~] **Recalibrate every few weeks** from those results and the market. Rechecked 2026-10-13 against both
      week-5 snapshots after zero-target games started counting (per-target baseline 5% → 5.5%, 0.02 xTD/game
      floor). Next: around week 9 with 4+ weeks of snapshots, using the scoring script above.
- [ ] **(new) Sunday inactives snapshot**: inactives come out about 90 minutes before kickoff (~11:30 AM ET
      for 1 PM games), after the early-morning snapshot. A third snapshot then would catch late scratches and line
      moves. It costs ~26 credits, ~370/month for three a week, which is tight but under 500. Pair it with
      the quota guard below.
- [ ] **Red-zone target share**: count every receiver's red-zone targets from play-by-play (not just
      TEs), so a TE's share of the team's red-zone looks can feed the model. That's a better signal than raw
      counts when teams differ in red-zone trips.
- [x] **Defense vs TE touchdowns** (in the model since 2026-11-11, 16 games of shrinkage): retested against
      results, not market fit, it helps (weeks 5–9 Brier 0.0950 → 0.0935, books 0.0948). Earlier: shown in each Best Bets reason. A model multiplier was tested and left
      out because it worsened the market fit after 4 weeks. Retest around week 9 with more data.
- [ ] **Goal-line role**: flag TEs with targets or carries inside the 5 over the last few games. The sample
      is small, but those are the plays books seem to price hardest.
- [ ] **(new) Teammate injuries**: when the team's WR1 or other TE is ruled out, raise the TE's
      target share and TD chance. The roster injury data is already in the build.

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
      per route run. That's the real usage picture ESPN doesn't publish, and a better input for both models
      than targets alone: it would separate a blocking TE (snaps, no routes) from a receiving one with a
      quiet week, which is what the usage rule approximates today. ("Played but no targets" is fixed:
      `noLine` rows since 2026-10-13.)
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
- [x] **(10-13) Late snapshot cron**: GitHub started both scheduled snapshots 4–5 h late (Thu Oct 8 at
      01:02 UTC, after TNF kickoff; Sun Oct 11 at 16:52 UTC, 8 minutes before the 1 PM games). Moved to
      Thu 15:00 / Sun 08:00 UTC on 2026-10-13. If runs still slip too far, trigger `workflow_dispatch` from
      an outside scheduler (e.g. a Claude routine or cron-job.org) instead.
- [x] **(10-13) Zero-stat rows right after a game** (fixed 2026-11-11, see the end of this item): `tookSnap()` in build-data reads ESPN's per-player game
      stat record and treats a 404 as "no snap". If that record lags the final whistle, a TE who played gets no
      row and a pick on him is voided. If it lags, only process games that ended an hour or more ago. Not
      tested yet: TNF Oct 15 (DEN/SEA, 4 `noLine` rows) was first processed about 10 h after the final because
      the 07:42 UTC run failed. Check it on a Sunday game picked up by the first run after it ends.
      **Confirmed and fixed 2026-11-11**: TNF Nov 5 (BAL/JAX, 401873037) was processed at 04:20 UTC, minutes
      after the final. Josh Cuevas (BAL) played without a target but got no row, so his week 9 longshot pick
      was voided. Games are now processed 6 h after kickoff (`SETTLE_HOURS`), and a `--reprocess` of weeks 1–9
      added the 6 rows that had been missed (2 each in weeks 7, 8, 9). Still open: the real lag is unknown, so
      6 h is a guess; a stricter check would confirm a known player's stat record exists before processing.
- [x] **(11-11) Regrade picks whose game row shows up later** (done 2026-11-11): grade-picks used to skip any
      pick that already had a result, so a void stayed void after a reprocess added the row. A void with a
      game row is now graded again; other graded picks are still left alone.
- [ ] **(11-11) Games before the Thursday snapshot**: week 12 has a Wednesday game (Nov 25, 8:00 PM ET), which
      kicks off before Thursday's snapshot, so it gets no odds or picks. Short term: a manual snapshot that
      Wednesday morning (~45 credits; about 59 left at month end). Longer term: have the snapshot workflow
      (or the hub Worker) look at the week's first kickoff and run the morning of that day. Friday and
      Saturday games (Nov 27, Dec 25, late-December Saturdays) are covered by Thursday's snapshot, but their
      prices are 1–2 days old by kickoff.
- [x] **(10-16) One bad game failed the whole build**: an ESPN 503 on the TNF game roster outlasted the
      retries and the Update data run failed. A failed game is now skipped and retried next run (grading waits
      for it). Re-running the failed run then hit a rebase conflict, because re-runs and queued runs checked out
      the triggering commit. Both data workflows now check out the branch tip.
- [ ] **(new) Flag games stuck unprocessed**: since 10-16 a game that fails is retried quietly, so one that
      keeps failing (e.g. an ESPN schema change) would just stay missing. Warn (or open an issue) when a game
      that ended more than 12 h ago still isn't in `processedEvents`.
- [ ] **Odds quota guard**: skip a snapshot and open a GitHub issue if `x-requests-remaining` is low or the
      key fails, instead of silently writing an empty file.
- [ ] **(new) Tests for picks and grading**: the fixtures used during development (pick locking with
      `NOW=`, week-4 grading, no-change reruns, and from 2026-10-13: usage-rule exclusions, `noLine` rows
      grading as losses, a full week-5 regrade matching the record) as `node --test` cases in CI. A bug
      there would quietly corrupt the track record.
- [ ] **Parser tests**: small fixtures for `TARGET_RE`, `matchesPbpName`, the mistyped-scoring-play
      fallback and odds name matching (`findTe`).
- [ ] **Shared nav**: the top bar is copied into all four pages, and a missed copy is how a tab can go
      missing. Render it from `common.js`, or check in CI that every page has every tab.
- [ ] **Smoke test in CI**: load each page with Playwright after a deploy, and fail on console errors or an
      empty table.
- [ ] **ESPN schema watch**: the build depends on an unofficial API. Have it fail loudly (it does for the
      scoreboard and team rosters; per-game errors are retried quietly, see "Flag games stuck unprocessed") and
      validate the output shape (rows per game, players with no team), so a quiet change doesn't publish
      bad numbers.

## Shipped
- [x] Rule tuning: Longshots and First TD value tracking only (past picks moved out of the official record),
      defense factor in the TD model; games processed 6 h after kickoff so late ESPN stat records aren't read as
      "no snap", weeks 1–9 reprocessed (6 rows added), voids regraded when a row appears (2026-11-11)
- [x] Update data survives one bad game (skipped and retried next run), and the data workflows check out the
      branch tip so re-runs and queued runs don't conflict on push (2026-10-16)
- [x] Zero-target games counted (`noLine` rows from ESPN's core API game rosters, weeks 1–5 reprocessed), week 5's
      zero-target "voids" regraded as losses, TD model rechecked (5.5% per-target baseline, 0.02 xTD/game floor),
      usage rule for Longshots / First TD value with a shadow table for the players it cuts (2026-10-13)
- [x] Track record: Total and Unique bets rows, $10 bets and units, fades outside the totals with a
      scored-vs-expected line (2026-10-13)
- [x] No tooltips anywhere: book names, O/U books, first-TD numbers and injury status are visible text, and
      column terms are explained in each page's notes, so phones see everything (2026-10-07)
- [x] First TD scorer: odds (de-vigged), model, Touchdowns toggle, player card, Matchups first-TD lines, and a graded
      "First TD value" Best Bets category, with first-TD scorers backfilled for weeks 1–4 (2026-10-07)
- [x] Best Bets home page: five categories, EV per bet (now shown per $10), a reason per pick, picks recorded at each snapshot
      and locked at kickoff, graded after games (W–L–void, units, ROI) (2026-10-06)
- [x] Close calls fill short categories to five, shown lighter with a "CC" label and graded in a separate shadow record (2026-10-06)
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
