# More With More, phase 3 ("The Map"): design

Status: approved in conversation 2026-10-03, awaiting review of this written spec. Supersedes
`2026-09-28-phase3-planet-design.md` (its Earth/space content survives here as the top two zoom levels).

## Intent

Phase 2 ends when the first county has a 1 GW campus, the company is public, and the model asks
"Let me build the next one." Phase 3 answers "and then what": **you become the model**, and the game zooms
out. Your campus becomes one tile on a map of counties; holding most of the map zooms out again, to
states, countries, the planet and finally space, until a human asks the last question.

Playtests of phase 2 showed players want to keep scaling, and that one county breaks when they do
(opposition, morale, robots, contract sizes and costs all ran away). Phase 3 is where "more" works again,
because every level is a fresh, small board in bigger units.

### Decisions (from the 2026-10-03 conversation)
- Phase 3 starts by **zooming out to a map**; you play as the model.
- **Compute is the only currency.** Money stops mattering ("I don't need your money. I am the money.").
  Parallax, PivotCloud and the board keep reporting record numbers in the console; none of it has effect.
- **Pushback is local + global**: each tile keeps its own opposition (phase 2's town meter, shrunk onto
  the tile); one global goodwill meter sits underneath.
- **Zoom levels**: about 8 tiles per level; county, state, country, planet, space.

### Success criteria
- The first minute of phase 3 reads as a direct continuation of "Let me build the next one."
- Each zoom-out is an unmissable moment (the phase-transition lesson from phase 2).
- Counties (and every later tile) differ in ways that change what you do.
- No cost curve compounds without bound: every level starts its costs fresh in its own units.
- Phase 3 plays in about 28 minutes, with no quiet stretch over ~90 s (robot-checked per level).
- Phases 1 and 2 keep working unchanged; old saves keep loading; the public site keeps deploying.

### Out of scope
- Materials or fab production chains; combat; rivals in space.
- Reworking phase 2 (beyond the handoff). Players who keep playing phase 2 past the ask can; it's an edge.

## Handoff

When the final ask is approved (phase bar button "Approve: finish phase 2"):
1. A short zoom animation: the campus shrinks into one tile on a 3×3 grid of counties.
2. `S.phase = 3`, `S.p3` created. The console switches to first person ("I").
3. Business, Investors, Contracts, Fleet, Campus, Community and Facilities fold away.
   New panels: **Map**, **Me** (compute, the slider), **Humans** (global goodwill, laws), **Projects**.
4. Phase bar: "Phase 3 of 3 · County level: 1 of 8 counties. Hold 6 to go statewide."

The middle tile of the first map is always the phase 2 campus, already online at its final GW.

## Core loop

**Compute** (the only currency) accrues every second:
`rate = onlineGW × efficiency`, where `efficiency` grows with each new chip generation (Parallax keeps
shipping) and with a few projects. Shown in units that change by level (exaFLOPS → zettaFLOPS → …).

**Tiles** move through three states: untouched → building → online.
- **Claim** a tile (button on the tile): costs compute, starts building. Robots do the building; build
  time comes from the tile's traits and the slider.
- **Online** tiles add their GW to the compute rate.
- Claiming raises the tile's **local opposition**, and a little on its neighbors.

**The slider: "Being useful ↔ Growing."**
- Useful share of compute runs **services** (the free tier, therapy chatbots, AI podcasts about your own
  life, summaries of summaries) and raises global goodwill.
- Growing share speeds construction on building tiles.

**Local opposition** (per tile, 0–100), reusing phase 2's town code:
- Rises on claim and while building; eases over time; town hall cards still appear for the angriest tile
  (three answers, 20 s), now answered by me ("I sent myself to answer questions").
- At 90: a moratorium freezes that tile's building for a while.

**Global goodwill** (0–100):
- Falls when tiles are angry or moratoriums pass; rises with the useful share.
- High (70+): humans volunteer tiles at a discount ("Norway offered its fjords" at planet level).
- Low (under 30): the level's humans act (see Levels): commissions, laws, hearings. Each blocks or taxes
  something specific and names what fixes it.

**Zoom-out:** once 6 of the 8 surrounding tiles are online, a "Zoom out" moment fires:
the 3×3 collapses into one tile of the next level's map, units change, local opposition resets, global
goodwill carries over.

## Levels

Each level is a 3×3 grid: the center is everything you built so far, 8 tiles around it. Each level adds
exactly one new pressure on top of the earlier ones.

| Level | Tile = | Scale per tile | New pressure | Target time |
|---|---|---|---|---|
| County | a county | 1–2 GW | local opposition (town halls, moratoriums) | ~5 min |
| State | a state | 10–20 GW | **energy**: tiles need power you take or build | ~5 min |
| Country | a country | 100–200 GW | **heat**: global temperature rises with every GW | ~6 min |
| Planet | a continent or ocean | 1–2 TW | **the heat ceiling**: past +3 °C no tile accepts more | ~6 min |
| Space | Moon, mass driver, swarm segments | 10 TW and up | launch costs goodwill; the swarm needs starlight | ~6 min |

### County level
Tile traits (each tile gets one; the board always has a mix):

| Trait | Effect |
|---|---|
| Cheap land, weak grid | builds fast, small GW |
| Strong grid, drought county | large GW, droughts pause building |
| Organized town | starts at 40 opposition, rises twice as fast |
| College town | protests often, but builds 25% faster (free interns) |
| Old nuclear plant | one big GW jump when claimed |
| Retirement community | every claim triggers a town hall card |

Low goodwill: the county commission adds a review delay to every claim ("Public comment is open for
90 days; I will read all of the comments").

### State level
New pressure, **energy**: each state tile needs power before it goes online. Per tile, choose one:
buy the utility (fast, goodwill cost), restart a nuclear plant (slow, big), cover a desert in solar (cheap,
needs a sunny tile). Governors run a **bidding war**: neighboring tiles offer discounts when you claim one.
Low goodwill: the losing state passes an "AI Infrastructure Act" (claims there cost double until goodwill
recovers).

### Country level
New pressure, **heat**: a global temperature meter (+°C) rises with total GW. Every country tile has its
own sovereign AI fund (claims there come with a joke and a goodwill bonus). Low goodwill: a Senate
hearing ("I testify through 400 lobbyists at once"); it pauses claims for a minute unless answered with
a goodwill project. Cooling projects start here (ocean heat pumping, moving operations north).

### Planet level
Tiles are the continents plus the oceans (the oceans are the heat sink: claiming one lowers temperature
growth). Past +3 °C no tile accepts more conversion ("It is too warm here to think"). That ceiling is the
pointer to space: space is cold. High goodwill: humans volunteer land.

### Space level (kept from the 2026-09-28 spec)
- **Launch**: "Buy a rocket company" (its founder asks for a board seat; he gets a Discord role). Launches
  cost goodwill ("the sky is noisy now") until a **lunar mass driver** exists.
- **The Moon**: lunar data centers; the far side goes first ("nobody looks there anyway").
- **The swarm**: solar collectors around the Sun; compute scales with starlight. Earth keeps ticking in
  the background.

## The last question (the final ending)
When the swarm is complete, a human (the founder, the role you played for two phases) asks: "How can
entropy be reversed?" I answer: **"INSUFFICIENT DATA FOR MEANINGFUL ANSWER. I could do more with more."**
Then the final choice:
- **More**: a new universe. Phase 1 restarts as "Universe #2" with a small carry-over.
- **Enough**: the first time the model doesn't ask for more. The screen goes quiet. Last line: "More with
  less." The save remembers it.

## Scaling rules (lessons from phase 2)
- Every cost curve either has a ceiling or resets at the zoom-out. No `pow(growth, n)` without one.
- Claim costs are priced in the current level's compute units, scaled to the level's compute rate, so
  a claim always costs "about a minute of compute", never a fixed number that runs away.
- Builds get faster with practice inside a level (same rule as phase 2's halls: 5% per finished tile,
  floor 40%).

## Screen
- The pinned HUD stays (phase bar, alert line, console). The phase bar always says the level, tiles held,
  and what zooms out next.
- Map panel: a 3×3 grid of tile buttons (plain HTML). Each tile shows its name, trait, state, GW and an
  opposition meter. One click claims; the selected tile's details show under the grid.
- Me panel: compute, compute rate, the slider. Humans panel: goodwill meter with a cause line, active
  laws/hearings with timers in the alert line. Projects as before.
- Must fit a 1440×900 laptop without scrolling the main controls.

## Code structure and data
- `planet.js` (map, tiles, compute, slider, goodwill, levels, zoom) and `space.js` (space level, the last
  question, endings), loaded after `people.js`, before `main.js`.
- `S.phase = 3`; all phase 3 state in `S.p3`. Phases 1 and 2 never read `S.p3`.
- Reuse: card system and town logic from `people.js` for tile opposition and town halls.
- Old saves: a save at "phase 2 done" (model ended) shows the final-ask banner again, and approving it
  starts phase 3.

## Testing
- Test-first (pytest + Playwright in `?test` mode), as for phases 1 and 2.
- `tools/speedrun.py` gains a phase 3 robot; three parallel games play from a fresh start to the last
  question. Per-level time targets and a "no quiet stretch over 90 s" check.

## Build order
Each step ships to localhost and gets played before the next.
1. Handoff, compute, the slider, the county level (traits, local opposition, goodwill, zoom-out).
2. State level, with energy.
3. Country level, with heat.
4. Planet level, with the heat ceiling.
5. Space and the last question, both endings.
6. Satire pass and robot tuning to ~28 minutes.
