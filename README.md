# te-tracker

NFL tight end stats, usage and touchdown odds through the season. A static site on GitHub
Pages: https://mattrudy13.github.io/te-tracker/

- **Leaders** (`index.html`): sortable leaderboard covering targets, target share, yards share, catch
  rate, Y/R, Y/Tgt, TDs, red-zone targets and fantasy points (PPR / Half / Standard, optional TE
  premium). Filter by team, week range, minimum targets, or your ★ watchlist.
- **Matchups** (`matchups.html`): this week's games (next week's once Monday night is final) with
  kickoff, network, spread, total and implied team points. Expand a game to see both teams' tight ends:
  season usage, xTD, points per game, anytime-TD % and a last-3 sparkline, plus how the opposing defense
  has fared against TEs. Finished games also show their TE box score. `?open=<gameId>,…` keeps games expanded.
- **Touchdowns** (`touchdowns.html`): this week's anytime-TD odds for every TE, red-zone usage
  (targets inside the 20 / 10 / 5), expected TDs (xTD) vs actual, and the TE touchdown rate by
  field position that the model uses.
- **Player** (`player.html?id=<espn id>`): season tiles, touchdown outlook, weekly charts and
  a game log.
- **Compare** (`compare.html?ids=a,b`): up to four TEs overlaid week by week, plus season totals.

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

## The touchdown model

- **xTD** credits each target with the league-wide TE TD rate for where the ball was snapped:
  inside the 5, 6–10, 11–20, or outside the red zone. Rates are this season's results blended with
  long-run priors, so the early weeks aren't driven by a few plays.
- **Anytime TD %**: expected TDs per game (season average blended 50/50 with the last 3 games,
  plus a small rushing-TD term), scaled by the team's implied points against the week's average.
  The result goes through a Poisson: P = 1 − e^(−λ). It's shown as a probability and as fair
  American odds.

## Running locally

```sh
node scripts/build-data.mjs          # current season; or pass a year
python3 -m http.server 8000          # then open http://localhost:8000
```

## Known limits

- ESPN doesn't publish snap counts or routes run, so usage means targets, target share and yards share.
- Red-zone splits come from play-by-play text and match box-score targets in ~95% of games
  (sometimes off by one).
- Two-point conversions aren't counted toward fantasy points.
- Regular season only.
