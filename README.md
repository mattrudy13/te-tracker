# te-tracker

NFL tight end usage, touchdown odds and betting picks through the season. A static site on GitHub
Pages: https://mattrudy13.github.io/te-tracker/

- **Best Bets** (`index.html`, the home page): this week's anytime-TD picks in five categories: most likely to
  score, best value, longshots, due for a TD, and fades. Each pick shows the best price, model %, market %, edge,
  expected profit per $100 and a one-line reason. Below that is a **track record** of every past pick, graded after
  the games (W–L–void, hit rate, units, ROI). Players listed as Out, Doubtful or on IR are never picked.
- **Matchups** (`matchups.html`): this week's games (next week's once Monday night is final) with
  kickoff, network, spread, total and implied team points. Expand a game to see both teams' tight ends:
  - **Usage:** targets per game and target share
  - **Receptions:** per game, next to the line and the best over/under prices
  - **Touchdowns:** TDs, red-zone targets, and the model TD % against the best book price, with the edge
  - how the opposing defense has fared against TEs

  Finished games show the TE box score with the pregame TD price and receptions line, and how each one
  landed. `?open=<gameId>,…` keeps games expanded.
- **Leaders** (`leaders.html`): usage and touchdown leaderboard, per game or season totals: targets, target
  share, receptions, catch %, yards, yards per target, TDs, red-zone targets, xTD and TD − xTD, plus this
  week's receptions line and best anytime-TD price. Filter by team, week range, minimum targets or your
  ★ watchlist.
- **Touchdowns** (`touchdowns.html`): this week's anytime-TD odds for every TE (sorted by model-vs-book edge), red-zone usage
  (targets inside the 20 / 10 / 5), expected TDs (xTD) vs actual, and the TE touchdown rate by
  field position that the model uses.
- **Player** (`player.html?id=<espn id>`, click any player name): this week's game with the receptions line
  (best over/under, how often the player has gone over it) and anytime-TD model vs book; season usage; touchdown
  profile; charts of targets, receptions against the line, red-zone targets and yards; and a game log.

Filters live in the URL, so any view can be shared. The watchlist is saved in your browser.

## How it works

No server and no build step: GitHub Actions write JSON into `data/`, and GitHub Pages serves the HTML plus
that JSON.

```
update-data.yml    every 3 h Thu–Mon + Tue   build-data.mjs (ESPN) → grade-picks.mjs
snapshot-odds.yml  Thu 5 PM + Sun 8 AM ET    build-data.mjs → fetch-odds.mjs (The Odds API) → record-picks.mjs
check-assets.yml   on push                   stamp-assets.mjs --check
                                    ↓
          data/2026.json · odds-2026.json · picks-2026.json → GitHub Pages
```

| File | What it is |
|---|---|
| `index.html`, `matchups.html`, `leaders.html`, `touchdowns.html`, `player.html` | The pages. Each keeps its page logic in an inline script |
| `model.js` | Data and model code (aggregation, TD model, injuries, best bets), shared by the pages and the scripts |
| `common.js` | Browser helpers: data loading, formatting, tables, URL state, watchlist |
| `style.css` | All styles (light/dark) |
| `scripts/` | `build-data`, `fetch-odds`, `record-picks`, `grade-picks`, `stamp-assets` (Node 20+, no dependencies) |
| `data/` | Generated JSON, committed by the workflows |

`scripts/build-data.mjs`:

1. Reads the season calendar and every completed regular-season game.
2. Finds tight ends from the 32 team rosters, plus ESPN athlete lookups for players no longer
   on a roster (cached in `data/positions-<season>.json`).
3. Takes each game's box score (receiving, rushing, fumbles, and team totals for share stats) and
   parses play-by-play for red-zone targets and TDs.
4. Saves the current week's schedule (state, score, network, lines) for the Matchups page, and the
   unplayed games' implied team points for the TD odds.
5. Saves each TE's injury status from the rosters (Questionable / Doubtful / Out / IR).

Games already in the file are reused, so a rerun only fetches new games.

`.github/workflows/update-data.yml` runs every 3 hours Thursday–Monday plus Tuesday morning
(UTC) from September through February. It commits only when the data changed. You can also run it
by hand from the Actions tab ("Run workflow").

## Sportsbook odds

`scripts/fetch-odds.mjs` takes a snapshot of tight end props from [The Odds API](https://the-odds-api.com):
anytime-TD prices and the receptions over/under, from **US-licensed books only** (DraftKings, FanDuel, BetMGM,
Caesars, BetRivers, ESPN BET, Fanatics…). Offshore books (BetOnline.ag, Bovada, BetUS, MyBookie, LowVig) are
dropped before the best price and market median are chosen, so every price on the site can be bet at a
licensed book. It writes `data/odds-<season>.json`.
`.github/workflows/snapshot-odds.yml` runs it Thursday at 5 PM ET (before TNF) and Sunday at 8 AM ET.
Games that have already kicked off keep their earlier snapshot. Each snapshot costs 1 credit per market per
game (2 markets, ~15 games), so about 20–30 credits, ~50–60 a week and ~250 a month. That leaves room for a
few manual runs on the free tier (500/month). Each run logs the credits left.

The key is the `ODDS_API_KEY` repository secret, so it's only used inside the workflow. Set or replace it
with `gh secret set ODDS_API_KEY -R mattrudy13/te-tracker`. To run locally:
`ODDS_API_KEY=... node scripts/fetch-odds.mjs`. Without the file, the odds columns just show "–".

Sportsbooks post most TE props midweek, so a Monday-night or Tuesday run prices only a few players.
Thursday's snapshot is the one that counts.

Where the odds show up:
- the Touchdowns table (Book, Market, Edge, Rec line)
- the Matchups page (Line, O / U, Model, Book, Edge before kickoff; pregame price and line vs result after)
- the Leaders table (Rec line, Book TD)
- the "This week" card on each player page

## Best bets and the track record

The picks logic is `bestBets()` in `model.js`. That file is shared by the site and the Node scripts, so the
Action computes exactly what the page shows.

| Category | Rule (top 5 each) |
|---|---|
| Most likely to score | Highest model TD % |
| Best value | Expected profit > 0 at the best price, price under +400, model ≥ 15%, ≥ 2 books |
| Longshots | Price +400 or longer, expected profit > 0, at least 1 red-zone target |
| Due for a TD | TD − xTD ≤ −0.8 with ≥ 3 red-zone targets |
| Fades | Price +250 or shorter and model at least 8 points below the market |

- `scripts/record-picks.mjs` runs after each odds snapshot, following a fresh stats/injury build. It saves the
  picks to `data/picks-<season>.json`. Picks lock at kickoff: Sunday's snapshot only replaces picks for games
  that haven't started.
- `scripts/grade-picks.mjs` runs after every stats build. It grades final games: a TD (receiving or rushing)
  wins, a box-score line without a TD loses, and no line is void. Profit is per $100 at the recorded price.
  Fades are graded right/wrong only. Reruns don't change graded picks.
- Until a snapshot records the week's picks, the page shows a live preview.
- When fewer than five players meet a category's rule, the list is filled with **close calls**: the next-best
  players from a looser pool, in lighter text with a "CC" label. They're recorded and graded as a separate
  **shadow record** that never counts toward the official one, to show whether the rules are too strict or
  too loose. A fade close call never repeats a real "due" pick, and vice versa.

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
  market's. Constants live at the top of the TD model section in `model.js`.
- **Injuries:** players listed as Out, Doubtful, on IR or suspended get no TD % and are never picked.

## Cache-busting

GitHub Pages lets browsers cache files for 10 minutes. The pages load `model.js`, `common.js` and
`style.css` with a content-hash stamp (`model.js?v=1a2b3c4d`), so a new page never runs against a stale
cached script. **After editing any of those three files, run `node scripts/stamp-assets.mjs` before
committing.** The "Check asset stamps" workflow fails on a push if you forget.

## Running locally

```sh
node scripts/build-data.mjs          # current season; or pass a year
python3 -m http.server 8000          # then open http://localhost:8000
```

## Known limits

- ESPN doesn't publish snap counts or routes run, so usage means targets and target share.
- Red-zone splits come from play-by-play text and match box-score targets in ~95% of games
  (sometimes off by one).
- Injury status comes from ESPN rosters (refreshed every 3 hours and before each odds snapshot). "Missed last game"
  appears only for players without an injury tag, and means no box-score line, so it also catches a TE who
  played but drew no targets.
- The TD model is calibrated against one snapshot. The Best Bets track record (first graded week: week 5)
  is the first real test of it.
- A grade of "void" can hide a real loss: a TE who played but drew no targets has no box-score line.
- A defense-vs-TE matchup factor was tested and left out of the model: four weeks of data is mostly noise.
  Defense context still appears in each pick's reason.
- Regular season only.
- GitHub Pages lets browsers cache pages for 10 minutes, so hard refresh (⌘⇧R) right after a deploy. Scripts
  and styles are cache-busted (see above). The HTML itself can still be up to 10 minutes stale.

Ideas and next steps are in [ENHANCEMENTS.md](ENHANCEMENTS.md).
