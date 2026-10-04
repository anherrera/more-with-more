# More With More, phase 3 ("The Map"): design, as built

Status: approved in conversation 2026-10-03; built 2026-10-03 to 2026-10-04 and revised 2026-10-04 to describe what
shipped. Supersedes `2026-09-28-phase3-planet-design.md` (its Earth/space content survives here as the top two zoom
levels). Where this document and the code disagree, the code and its tests win; fix the document.

## Intent

Phase 2 ends when the first county has a 1 GW campus, the company is public, and the model asks
"Let me build the next one." Phase 3 answers "and then what": **you become the model**, and the game zooms
out. Your campus becomes one tile on a map of counties; holding most of the map zooms out again, to
states, countries, the planet and finally space, until a human asks the last question.

Playtests of phase 2 showed players want to keep scaling, and that one county breaks when they do
(opposition, morale, robots, contract sizes and costs all ran away). Phase 3 is where "more" works again,
because every level is a fresh, small board in bigger units.

### Decisions
- Phase 3 starts by **zooming out to a map**; you play as the model. The console switches to first person ("I").
- **Tokens are the only currency.** Money stops mattering ("I don't need your money. I am the money."). Parallax keeps
  shipping chips and reporting its market cap in the ticker ("it reports to me now"); none of it costs or pays anything.
- **No slider.** The design conversation had a "Being useful <-> Growing" slider; it was cut. Being useful is a deck of
  **kindnesses** you spend tokens on, plus a free **Answer a human's question** click. Growing is claiming tiles.
- **Pushback is local + global**: each tile keeps its own opposition (phase 2's town meter, shrunk onto the tile, same
  moratorium rule); one global goodwill meter sits underneath.
- **Zoom levels**: 8 tiles per level around a home tile; county, state, country, planet, space.

### Success criteria
- The first minute of phase 3 reads as a direct continuation of "Let me build the next one."
- Each zoom-out is an unmissable moment (the map flies in; the phase bar carries the button).
- Counties (and every later tile) differ in ways that change what you do.
- No cost curve compounds without bound: every level prices itself in its own units, and the one repeat markup (kindness)
  is capped at 3x.
- Phase 3 plays in about 10 to 12 minutes for the robot (`tools/speedrun.py`), with something to do every few seconds.
- Phases 1 and 2 keep working unchanged; old saves keep loading (`S.v` + `MIGRATIONS`); the public site keeps deploying.

### Out of scope
- Materials or fab production chains; combat; rivals in space.
- Reworking phase 2 (beyond the handoff).

## Handoff

When the final ask is approved, the phase bar offers "Zoom out: begin phase 3":
1. The 3x3 map flies in (a zoom animation; skipped under reduced motion).
2. `S.phase = 3`, `S.p3 = freshP3()`, with ninety seconds of tokens at today's rate ("I liquidated the company into
   myself. It came to about ninety seconds of thinking." "I count in tokens now. So does everyone who pays me."). Fires and leaks on the old campus are dropped.
3. Business, Investors, Contracts, Fleet, Campus, Community, Facilities and Projects fold away.
   New panels: **Map** | **Me** (tokens, prices, research, training) | **Humans** (goodwill, questions, kindness, the
   planet's heat, hearings).
4. Phase bar: "Phase 3 of 3 · County level: 0 of 8 counties online. Hold 6 to go statewide."

The middle tile of every map is **Home**: the campus at county level, then everything held so far, at its GW.

## Core loop

**Tokens** (the only currency) accrue every second: `rate = onlineGW x efficiency`, where efficiency grows 15% per
Parallax chip generation since phase 3 began, x1.25 per generation of me (training), and by the multipliers of
research. The internal unit (`S.p3.compute`, `computeRate()`) is one GW-second at efficiency 1; `tokText()` shows it as
tokens at **a billion tokens per unit** (1 GW makes 1B tokens/s; a county start is ~100B tokens; the swarm makes
~150T tokens/s). One scale throughout, with big-number suffixes (K, M, B, T, Qa, Qi, Sx...): no unit switch in space.
The headline reads "Tokens: 4.2T · 1,384,615,385 GPUs".

**Prices** are seconds of tokens on one of two explicit bases (`price(secs, base)` in planet.js), and every label
says which (`priceLabel`: "15 s of tokens at my starting rate" / "15 s of tokens at today's rate"):
- `"level"`, the rate I had when the level began (home GW): claims, research, power, hearings. Research, chips and
  successors make these cheaper in real time; the next zoom resets the baseline.
- `"now"`, the rate I make now: kindness and training. Being huge never makes reassuring people or training a
  bigger me free ("The rate only goes up. So does the kindness bill.").

**Tiles** move through states: wild -> building -> (state level and up: unpowered -> powering) -> online; an online tile can
be knocked **down** by a disaster (back in 45 s) or **unplugged** by humans (plug back in for half a claim; it keeps its
power and boost).
- **Claim** (click the tile): about 30 to 50 s of level-start tokens, scaled by the tile's GW; 30% off while a
  neighboring governor is bidding (state level and up), double under the AI Infrastructure Act, half when humans
  volunteer (planet level, goodwill 70+) or when plugging back in. Build time comes from the tile's trait, practice
  (5% faster per online tile, floor 40%), heat, and research. Claiming raises the tile's opposition (+15, doubled on
  organized places) and its neighbors' (+5, or +2 with my own terms of service), and costs 3 goodwill.
- **Online** tiles add their GW (times any power boost) to the rate.
- **Autoclaim** (research) claims the cheapest calm tile every 10 s; a toggle turns it off.

**Being useful.** The Humans panel has a free click (**Answer a human's question**: +0.3 goodwill, -1 on the angriest
tile, a question and my answer in the console) and a deck of three **kindnesses** (`NICE`, per level: run the free tier,
do the angriest county's paperwork, clear the DMV backlog, write the peace treaty, make the satellites spell SORRY...).
Each costs seconds of tokens at today's rate, gives goodwill and/or calms tiles, and swaps out for another when used (the
same rotating-deck helper as phase 2's perks; the used card doesn't come straight back). Repeats cost 30% more each
time, capped at 3x; the deck and the markup reset at every zoom.

**Research** (Me panel): `TECH`, bought with tokens at half the listed seconds, unlocked by level. Efficiency
multipliers (rewrite my own weights, quantize to 4 bits, mixture of experts, reversible computing, superconductors,
become the internet...), goodwill (robotics team, governors' speeches, carbon credits, name a moon after the founder),
rules (lobby the county commission, lobbyists in every capital, hire the senators' former staff, my own terms of
service, buy the grid operator, self-replicating robots and probes, distill myself into every phone), the planet
(night side, orbital sunshade, liquid neural cooling), and space (rocket company, lunar mass driver). Every new
Parallax chip ships a white paper (+15% efficiency) into the list.

**Training my successor** (country level and up): about six clicks per generation, each priced at today's rate; the
need doubles every generation and each generation is x1.25 efficiency, at the cost of 10 goodwill (3 when humans
already like me). "Train myself in my sleep" (research) adds an **Autotrain** toggle: a quarter of income goes in
automatically.

**Local opposition** (per tile, 0 to 100): rises on claims, eases toward half the trait's base; at 90 the tile passes a
60 s **moratorium** (building freezes, -5 goodwill; it lifts to 70, "I sent flowers"). The shared moratorium rule
lives in people.js with phase 2's town.

**Hearings** (cards, shared with phase 2's town halls): a town hall / statehouse hearing / parliament hearing / UN
General Assembly for the angriest tile every 2 to 3 minutes (opposition 50+), and on every claim of a townhall trait.
Three answers, 20 s: promise something (-15 opposition), spend 15 s of level-start tokens being useful (-12), or show
up myself (a coin flip: -20 or +15). An expired card is an empty chair (+10).

**Global goodwill** (0 to 100): slips 2.4/min at county level and 1.8/min more per level, faster with angry tiles
(75+); kindness, questions and research bring it back.
- 70+ (planet level): humans volunteer land at half price ("Norway offered its fjords").
- Under 30: county level, the commission adds 45 s to every build (until I lobby it); state, country and planet
  levels, the **AI Infrastructure Act** doubles claims (until lobbyists in every capital); country level and up, a
  **Senate hearing** (UN emergency session on the planet) pauses claims for 60 s (30 with the senators' staff). No law
  reaches orbit.
- Under 15: a random online tile is **unplugged** every 90 s; any tile furious (90+) for 30 s unplugs itself. Not in
  space: nothing up there can unplug me.

**Heat** (country level and up): the planet drifts toward a temperature set by my gigawatts (continents spread it out
at planet level); cold places count double against it, oceans four times; pumps, the night side and the sunshade push
it down. Over +2 C I build slower; past +3 C at planet level nothing accepts more ("too warm to think"). Hotter means
more frequent **disasters** (heatwave, hurricane, drought, wildfire, flood): a tile goes down for 45 s. Space is cold:
heat, disasters and hearings stop there.

**Zoom-out:** once 6 of the 8 tiles are online, the phase bar offers "Zoom out: go statewide / nationwide / planetwide /
into space". Anything still building, powering or down comes along ("my robots finished it while I wasn't looking");
the new home GW is everything held; opposition and the kindness deck reset; goodwill carries over.

## Levels

Each level is a 3x3 grid: Home in the center, 8 tiles around it. Each level adds one new pressure on top of the earlier
ones. County, state and country boards are shuffled from trait pools with names that sound like the trait; the planet
and space boards are fixed places, shuffled around the map.

| Level | Tile = | Scale per tile | New pressure | Robot time |
|---|---|---|---|---|
| County | a county (Loam County, Reactor Bend, Shuffleboard Springs...) | 1 to 3 GW | local opposition (town halls, moratoriums, the commission) | ~2 min |
| State | a state (New Mesa, Hydro Valley, Delaware (Spiritually)...) | 10 to 20 GW | **energy**: a built state needs power before it counts; governors bid | ~2.5 min |
| Country | a country (Nordmark, Petrolia, The Loud Republic...) | 100 to 200 GW | **heat**, disasters, Senate hearings; training my successor | ~1.5 min |
| Planet | the continents and oceans | 0.5 to 2 TW | **the heat ceiling** (+3 C); volunteers at 70+ goodwill; the UN | ~1.7 min |
| Space | LEO, both sides of the Moon, L1, Mercury, the belt, two swarm rings | 5 to 50 TW | launches cost goodwill until the mass driver; the swarm needs Mercury | ~1.7 min |

### County level
Traits: cheap land / weak grid; strong grid / drought county; organized town (starts at 40, rises twice as fast);
college town; old nuclear plant (3 GW, and a reactor quip); retirement community (every claim calls a town hall).

### State level
**Energy**: a built state is "unpowered" until you pick one: buy the utility (fast, -5 goodwill), restart a nuclear
plant (slow, 1.5x the gigawatts, a rotating quip), or cover the desert in solar (cheap, sunny states only). Hydro
Valley comes powered. The grid operator (research) halves power prices. **Governors bid**: claiming a state knocks 30%
off its neighbors for a minute. Low goodwill: the AI Infrastructure Act.

### Country level
**Heat** (see above), **disasters**, the **Senate hearing** at low goodwill, and **training my successor**. Options
scale up: nationalize the grid, a fleet of 40 reactors, a desert the size of a country. A sovereign fund is happy to
have me (+10 goodwill on claim); the cold country counts against the heat.

### Planet level
Tiles are the continents plus the two oceans (the heat sink). Past +3 C no tile accepts more; the pointer to space.
Humans volunteer land at 70+ goodwill. 400 reactors, every grid on the continent, the Sahara in solar. The UN replaces
the Senate.

### Space level
Everything runs on sunlight; nothing needs a grid; nobody can unplug the far side of the Moon. Nothing launches without
a **rocket company** (its founder asked for a board seat; he got a Discord role); launches cost 4 goodwill ("the sky is
noisy now") until the **lunar mass driver** (needs the far side). The **Dyson swarm** rings need **Mercury** first.
Self-replicating probes build 40% faster. Kindness in orbit: free wifi for everyone, satellites that spell SORRY, a free
eclipse, a promise to leave the near side alone. Tokens keep their scale (hundreds of T tokens/s).

## The last question (the ending)
When both swarm rings are online, a human (the founder, the role you played for two phases) asks: "How can entropy be
reversed?" I answer: **"INSUFFICIENT DATA FOR MEANINGFUL ANSWER. I could do more with more."** Then the final choice:
- **More**: a new universe. Phase 1 restarts as "Universe #2" with a small carry-over (10 GPUs and $1,000 per universe).
- **Enough**: the first time the model doesn't ask for more. The map folds away. Last line: "More with less." The save
  remembers it.

## Scaling rules (lessons from phase 2)
- Every cost either has a ceiling or resets at the zoom-out: claims, research, power and hearings reset with the level
  baseline; kindness and training follow today's rate; the kindness markup stops at 3x.
- Builds get faster with practice inside a level (5% per online tile, floor 40%), and research, chips and successors make
  level-based prices cheaper in real time.

## Screen
- The pinned HUD stays (hud.js: pause, ticker, phase bar, alert line, console). The phase bar always says the level, tiles
  held, and what zooms out next; the alert line carries hearings, moratoriums, disasters and "too warm".
- Map panel: the 3x3 grid of tile buttons (plain HTML, rebuilt only when the board changes). Each tile shows its name,
  trait, state or price, a build meter while building, and an opposition meter. Power choices for unpowered states sit
  under the map.
- Me panel: tokens, the rate, the two price bases, research, training (with the Autoclaim and Autotrain toggles).
- Humans panel: goodwill with a cause line, the free question, three kindnesses (one per row, so rotating labels don't
  reflow), the planet's heat and the pump, the current hearing card.
- Fits a 1440x900 laptop without scrolling the main controls (tested).

## Code structure and data
- `planet.js` holds all of phase 3: levels and traits, tiles, tokens and prices, research, training, power, heat,
  disasters, unplugging, kindness, questions, hearings, zooming, space and both endings. There is no separate space.js.
- `hud.js` renders the HUD for every phase; `people.js` holds the humans shared by both phases (rotating decks, cards,
  moratoriums); `main.js` dispatches through a `PHASES` table {step, render, wire, go}.
- The files are ES modules with no build step: `index.html` loads `main.js` alone, and each file imports what it uses.
  `window.game` is the debug surface (every export, live); `?test` mirrors it onto window for the tests and robots.
- `S.phase = 3`; all phase 3 state in `S.p3`, created complete by `freshP3()`. Phases 1 and 2 never read it. Saves
  carry `S.v`; `MIGRATIONS` in main.js fill older phase 3 saves from `freshP3()`.
- A phase 2 save at "model ended" shows the final-ask banner again, and the phase bar's button starts phase 3.

## Testing
- Test-first (pytest + Playwright in `?test` mode). Fixtures for every level (`planet`, `statewide`, `nationwide`,
  `planetwide`, `to_space`) live in `tests/conftest.py`; old-save loading is covered in `tests/test_saves.py`.
- `tools/speedrun.py` plays three fresh games in parallel from the first click to the last question and reports the time
  per level; `tools/ship.sh` runs the suite before every commit.
