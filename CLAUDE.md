# te-tracker: project notes

NFL tight end stats/usage/TD-odds site on GitHub Pages: https://mattrudy13.github.io/te-tracker/
See README.md for features, the TD model and how to run it. Same conventions as `../h2h`: plain HTML/CSS/JS,
no build step, globals in `common.js`, Barlow Condensed + Inter, dark top bar.

## Layout

- `scripts/build-data.mjs`: the only thing that talks to ESPN. Writes `data/<season>.json`,
  `data/positions-<season>.json` (athlete position cache) and `data/seasons.json` (`{current}`, read
  by the site to pick the file).
- `.github/workflows/update-data.yml`: scheduled build; commits `data/` only if something other
  than `updated` changed.
- `common.js`: data loading, `aggregate()`, `fantasyPoints()`, `tdModel()` / `tdOdds()`,
  `renderTable()` (sortable), URL params, watchlist (localStorage), markup helpers.
- Pages: `index.html` (leaders), `matchups.html`, `touchdowns.html`, `player.html`, `compare.html`;
  each keeps its page logic in an inline script. The nav is copied into each page; add new tabs to all of them.
- `defenseVsTe()` in common.js: TE fantasy points allowed per game by each defense (rank 1 = fewest).

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
- Commit prefixes: `feat:`, `fix:`, `docs:`, `data:` (the bot uses `data:`).
