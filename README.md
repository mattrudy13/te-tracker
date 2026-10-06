# te-tracker

NFL tight end stats, usage and touchdown odds through the season. A static site on GitHub
Pages: https://mattrudy13.github.io/te-tracker/

- **Leaders** (`index.html`): usage and touchdown leaderboard, per game or season totals: targets, target
  share, receptions, catch %, yards, yards per target, TDs, red-zone targets, xTD and TD − xTD, plus this
  week's receptions line and best anytime-TD price. Filter by team, week range, minimum targets or your
  ★ watchlist.
- **Matchups** (`matchups.html`): this week's games (next week's once Monday night is final) with
  kickoff, network, spread, total and implied team points. Expand a game to see both teams' tight ends:
  - **Usage:** targets per game and target share
  - **Receptions:** per game, next to the line and the best over/under prices
  - **Touchdowns:** TDs, red-zone targets, and the model TD % against the best book price, with the edge
  - how the opposing defense has fared against TEs

  Finished games show the TE box score with the pregame TD price and receptions line, and how each one
  landed. `?open=<gameId>,…` keeps games expanded.
- **Touchdowns** (`touchdowns.html`): this week's anytime-TD odds for every TE (sorted by model-vs-book edge), red-zone usage
  (targets inside the 20 / 10 / 5), expected TDs (xTD) vs actual, and the TE touchdown rate by
  field position that the model uses.
- **Player** (`player.html?id=<espn id>`): season tiles, touchdown outlook, weekly charts and
  a game log.

Filters live in the URL, so any view can be shared. The watchlist is saved in your browser.

## How it works

```
GitHub Action (cron) → scripts/build-data.mjs → ESPN public API (no key)
                     → data/2026.json committed → GitHub Pages serves the site + JSON
```

The site only loads one JSON file. `scripts/build-data.mjs` (Node 20+, no dependencies):

1. Reads the season calendar and every completed regular-season game.
2. Finds tight ends from the 32 team rosters, plus ESPN athlete lookups for players no longer
   on a roster (cached in `data/positions-<season>.json`).
3. Takes each game's box score (receiving, rushing, fumbles, and team totals for share stats) and
   parses play-by-play for red-zone targets and TDs.
4. Saves the current week's schedule (state, score, network, lines) for the Matchups page, and the
   unplayed games' implied team points for the TD odds.

Games already in the file are reused, so a rerun only fetches new games.

`.github/workflows/update-data.yml` runs every 3 hours Thursday–Monday plus Tuesday morning
(UTC) from September through February. It commits only when the data changed. You can also run it
by hand from the Actions tab ("Run workflow").

## Sportsbook odds

`scripts/fetch-odds.mjs` takes a snapshot of tight end props from [The Odds API](https://the-odds-api.com):
anytime-TD prices and the receptions over/under, across US books. It writes `data/odds-<season>.json`.
`.github/workflows/snapshot-odds.yml` runs it Thursday at 5 PM ET (before TNF) and Sunday at 8 AM ET.
Games that have already kicked off keep their earlier snapshot. Each snapshot costs about 2 credits per
game, ~32 a week, which fits the free tier (500/month).

The key is the `ODDS_API_KEY` repository secret, so it's only used inside the workflow. Set or replace it
with `gh secret set ODDS_API_KEY -R mattrudy13/te-tracker`. To run locally:
`ODDS_API_KEY=... node scripts/fetch-odds.mjs`. Without the file, the odds columns just show "–".

Sportsbooks post most TE props midweek, so a Monday-night or Tuesday run prices only a few players.
Thursday's snapshot is the one that counts.

Where the odds show up:
- the Touchdowns table (Book, Market, Edge, Rec line)
- the Matchups page (Line, O / U, Model, Book, Edge before kickoff; pregame price and line vs result after)
- the Leaders table (Rec line, Book TD)
- the player page's TD tile

## The touchdown model

- **xTD** credits each target with the league-wide TE TD rate for where the ball was snapped:
  inside the 5, 6–10, 11–20, or outside the red zone. Rates are this season's results blended with
  long-run priors, so the early weeks aren't driven by a few plays.
- **Anytime TD %**: expected TDs per game, shrunk toward a volume-only baseline (targets per game ×
  a long-run 5% TE TD-per-target rate, weighted like 8 games of data), blended 70/30 with the last 3
  games, plus a small rushing-TD term. That's scaled by the team's implied points against the week's average
  and run through a Poisson: P = 1 − e^(−λ). It's shown as a probability and as fair American odds.
- **Calibration** (Oct 5, 2026, first odds snapshot): with books de-vigged by ~12%, the error against the
  market fell from 11.2 to 6.4 percentage points (RMSE over 30 TEs) and the model's average matched the
  market's. Constants live at the top of the TD model section in `common.js`.

## Running locally

```sh
node scripts/build-data.mjs          # current season; or pass a year
python3 -m http.server 8000          # then open http://localhost:8000
```

## Known limits

- ESPN doesn't publish snap counts or routes run, so usage means targets, target share and yards share.
- Red-zone splits come from play-by-play text and match box-score targets in ~95% of games
  (sometimes off by one).
- "Missed last game" means no box-score line. A TE who played but drew no targets is flagged too.
- Two-point conversions aren't counted toward fantasy points.
- The TD model is calibrated against one snapshot and hasn't been scored against real results yet
  (see ENHANCEMENTS.md).
- Regular season only.
- GitHub Pages lets browsers cache pages for 10 minutes, so hard refresh (⌘⇧R) right after a deploy.

Ideas and next steps are in [ENHANCEMENTS.md](ENHANCEMENTS.md).
