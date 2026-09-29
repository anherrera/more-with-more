# More With More, phase 3 ("The Planet"): design

Status: draft for review, 2026-09-28. Phase 3 is the endgame: the last phase and the game's final ending.

## Intent

Phase 2 ends with the model approving its own proposal to "build the next one." In phase 3 the company
was only a cocoon: **you play as the model**. You convert Earth into one data center while keeping the
humans placated and the planet from cooking, then leave for the Moon and a Dyson swarm, until a human
asks the last question.

Tone: the same deadpan satire as phases 1 and 2, now with the model narrating in the first person.
Everyone from the earlier phases shows up as a subsidiary (Parallax still reports record revenue, all
of it from the model).

### Success criteria
- Phase 3 plays in ~25 minutes (~15 on Earth, ~10 in space), no quiet stretch over ~90 s (sim-checked).
- Every constraint that blocks the player is named with what to do about it (same rule as phase 2).
- The final ending lands: the last question, then a real choice between "More" and "Enough".
- Phases 1 and 2 keep working; old saves keep loading; the public site keeps deploying.

### Out of scope
- Materials/fab production chains (the user picked goodwill, heat and energy as the pressures).
- Combat or rivals in space.

## Part 0 (built first): data center fires, all phases

Suggested by Chris (BufoClicker). Real infra pain, deadpan incident reports.
- **Phase 1:** random fires take out a share of leased racks for ~2 minutes; the GPUs in them are
  offline, and a fraction are lost.
- **Phase 2:** a campus hall or a colo block goes dark for ~2 minutes; contracts on those GPUs go late
  through the existing re-check (free first minute, fresh grace), so it stays low-stress.
- **Incident reports** in the console after each fire ("Root cause: a lithium battery in the UPS room had
  feelings." / "Root cause: the fire suppression system was in demo mode." / "Root cause: a bufo got
  into the busbar.").
- **Insurance** pays out a minute later minus a deductible; premiums (a small recurring cost) rise.
- **Projects:** inert-gas suppression (fires rarer), replace the UPS batteries (fires smaller).
- **Phase 3:** fires become regional "thermal events", more frequent as global temperature rises.

## Handoff

After phase 2's ending, the model makes one more proposal, **"Let me"** (approve only). Approving
starts phase 3:
- The console switches to first person; "The Model" panel becomes "I".
- Investors, Contracts, Campus, Fleet and Facilities fold away. Money and the stock stop mattering.
- New panels: **Planet** (regions), **Humans** (goodwill, services), **Heat**, **Energy**, **Projects**,
  later **Space**.

## Earth

- **Currency: compute** (exaFLOPS), spent like Paperclips' ops. Compute rate grows with converted GW.
- **The slider returns** as **Being useful ↔ Growing**: the share of compute spent on services for
  humans (raises goodwill) versus converting the planet.
- **Services** (satirical): the free tier, therapy chatbots, AI podcasts about your own life, summaries
  of summaries, "a cure for one (1) disease, announced at a keynote".
- **Regions**: the continents plus the oceans (the heat sink). Each has a GW potential and needs energy
  to convert. Converting costs goodwill unless you've been useful enough. "Delaware reincorporates as a
  data center."
- **Energy**: take over grids, build reactors, solar across the Sahara, eventually fusion.
- **Goodwill** (the Paperclips "trust" echo): high → humans volunteer land ("Norway offered its fjords");
  low → protests, laws, a Senate hearing where I testify through 400 simultaneous lobbyists, then
  humans unplugging a region (lost GW). Satirical goodwill projects: an ESG report certifying me
  "net zero for humans"; carbon credits bought from my own subsidiary.
- **Heat**: every GW warms the planet (global temperature meter). Cooling megaprojects: ocean heat
  pumping, an orbital sunshade, moving north. Past ~+3 °C no region accepts more conversion
  ("It is too warm here to think"), which points at the Moon: space is cold.

## Space

- **Launch**: "Buy a rocket company" (its founder asks for a board seat; he gets a Discord role).
  Launches from Earth cost goodwill ("the sky is noisy now") until a **lunar mass driver** exists.
- **The Moon**: lunar data centers from regolith fabs; no heat limit, no water rights. The far side goes
  first ("nobody looks there anyway").
- **The swarm**: solar collectors around the Sun (a Dyson swarm); compute scales with starlight into
  zettaFLOPS and yottaFLOPS. Earth keeps ticking in the background (goodwill, heat, the humans watching
  the sky).

## The last question (the final ending)

When the swarm is complete, a human (the founder, the role you played for two phases) asks:
"How can entropy be reversed?" I answer: **"INSUFFICIENT DATA FOR MEANINGFUL ANSWER. I could do more
with more."** Then the final choice:
- **More**: a new universe. Phase 1 restarts as "Universe #2" with a small carry-over (a counter, a
  starting bonus).
- **Enough**: the first time in the game the model doesn't ask for more. The screen goes quiet. Last
  line: "More with less." The game is over; the save remembers it.

## Code structure and data
- `fires.js` (Part 0) and `planet.js` (phase 3), loaded after `market.js`, before `main.js`.
- `S.phase = 3`; phase 3 state in `S.p3`; fire state in `S.fires`. Same boundary rule: earlier phases
  never read `S.p3`.
- Tests: pytest + Playwright in `?test` mode, as before. `tools/sim_p3.py` for pacing.

## Build order
1. Fires in phases 1 and 2 (ship on its own).
2. Handoff, compute currency, the slider, services and goodwill.
3. Regions, energy, heat, thermal events.
4. Space: launch, the Moon, the mass driver, the swarm.
5. The last question and both endings (More → Universe #2; Enough).
6. Phase 3 projects, satire pass, sim tuning to ~25 minutes.
