# More With More

An incremental game about the AI compute bubble, in the spirit of Universal Paperclips.
You start with one GPU answering queries for $0.25. It does not stay one GPU.

**Play:** https://anherrera.github.io/more-with-more/

## The game

1. **The lab.** Rent racks, buy GPUs, train models, raise rounds. Parallax, your GPU vendor, is also your investor.
   Money goes in a circle.
2. **The campus.** Pick a county and build a 1 GW campus: land, halls, turbines, water, an interconnection queue,
   a town that has opinions. Sign capacity contracts, go public. The model starts proposing things. You approve them.
3. **The map.** You are the model now. The county was one tile.

It saves to your browser as you play.

## Running it locally

No build step and no dependencies: plain HTML and native ES modules.

```bash
python3 tools/serve.py 8777     # a static server that never caches, so a refresh picks up edits
open http://localhost:8777/
```

Any static server works. Opening `index.html` as a file does not (browsers block module imports from `file://`).

## Code

| File | What's in it |
|---|---|
| `index.html` | the page, all the CSS, one `<script type="module" src="main.js">` |
| `main.js` | phase 1, the tick, the phase table, wiring, the `window.game` debug surface |
| `globals.js` | constants, state (`S`), formatting, the console, save/load |
| `projects.js` | every project in the game |
| `campus.js` | phase 2: counties, contracts, building, power, water, land |
| `model.js` | phase 2's model: proposals, autonomy, the handoff |
| `market.js` | cap table, IPO, stock, follow-ons |
| `people.js` | the humans: morale, the town, opposition, cards |
| `fires.js` | fires and coolant leaks |
| `planet.js` | phase 3 and the endings |
| `hud.js` | the top strip: pause, ticker, phase bar, alerts |

`S` is the whole game state. It changes only through `setState()`, and saves carry a version (`S.v`) with
ordered migrations. The JavaScript is type-checked with `tsc` in checkJs mode (`tsconfig.json`, `types.d.ts`),
with no build output.

## Tests

pytest + Playwright drive the real game in Chrome, in `?test` mode (game functions on `window`, no wall clock).

```bash
uv run --with pytest --with playwright --with pytest-xdist pytest -q -n 4
npx --yes -p typescript@5.6 tsc -p .
```

## Shipping

```bash
tools/ship.sh "feat: ..."   # syntax check, tsc, full test suite, commit (does not push)
tools/publish.sh            # push; CI tests again and deploys to GitHub Pages
```

The Pages workflow (`.github/workflows/pages.yml`) publishes only `index.html` and the scripts, and stamps every
script and import with the commit so browsers never mix old and new files.

## Robots

Players that use the real game code to check pacing:

```bash
uv run --with playwright --with pytest python tools/speedrun.py --runs 3 --headless   # the whole game, timed per phase
uv run --with playwright --with pytest python tools/play_p2.py                        # phase 2 in each county
uv run --with playwright --with pytest python tools/p3run.py                          # phase 3 alone
uv run --with python-snappy tools/read_log.py                                          # the play log from Firefox
```

Design notes live in `PHASE2.md` and `docs/superpowers/` (specs and plans).

## Devtools

Open the console. The game notices.
