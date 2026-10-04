# Phase 3, step 1 (handoff + county level) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After phase 2 ends, the player zooms out into phase 3 as the model, on a 3×3 county map: claim counties with compute, manage local opposition and global goodwill with the "useful ↔ growing" slider, until 6 counties are online and the (stubbed) zoom-out to the state level is offered.

**Architecture:** A new classic script `planet.js` (loaded after `people.js`, before `main.js`) owns all phase 3 state in `S.p3`, its step function and its render function. `main.js` dispatches to it when `S.phase === 3` (step and render), and phase 3 shows its own panel block `#p3` instead of the phase 1/2 columns. `model.js`'s phase bar offers "Zoom out: begin phase 3" once phase 2 has ended.

**Tech Stack:** Plain HTML/CSS/JS (no build), pytest + Playwright (Chrome) in `?test` mode, `uv`.

**Spec:** `docs/superpowers/specs/2026-10-03-phase3-map-design.md`

## Global Constraints

- Compute is the only currency in phase 3; money stops mattering ("I don't need your money. I am the money.").
- Pushback is local (per tile opposition 0–100) + global (goodwill 0–100).
- Each level is a 3×3 grid: the center is everything built so far, 8 tiles around it; zoom-out fires once 6 of the 8 are online.
- Claim costs are priced at about a minute of compute at the current rate; no unbounded `pow(growth, n)`.
- Builds get faster with practice inside a level: 5% per finished tile, floor 40%.
- Phases 1 and 2 never read `S.p3`. Old saves keep loading. Nothing is published (`tools/ship.sh` only).
- Copy: first person for the model ("I"); deadpan; made-up names only.
- Must fit a 1440×900 laptop without scrolling the main controls.

## Review Focus

1. Reloading the page mid-phase-3 restores the map, compute and slider exactly (Task 1 test `test_phase3_survives_reload`).
2. A save that ended phase 2 before this build still reaches phase 3 via the phase bar button (Task 1 test `test_old_ended_save_can_begin_phase3`).
3. Reset from phase 3 returns to a clean phase 1 with the columns visible (Task 1 test `test_reset_from_phase3`).
4. Claiming with too little compute, claiming a tile twice, or claiming under a moratorium does nothing (Task 2 test `test_claim_guards`).
5. The phase 3 screen fits 1440×900 with the map and slider above the fold (Task 2 test `test_phase3_fits_a_laptop`).

---

## File structure

- Create `planet.js`: phase 3 constants, `freshP3()`, `startPlanet()`, tile logic (`claimCost`, `claim`, `tileBuildSecs`), compute (`computeRate`, `onlineGW`), slider/goodwill/opposition (`stepPlanet`), town hall card for phase 3, `renderPlanet()`.
- Modify `index.html`: script tag; `#p3` panel block (Map, Me, Humans); CSS for the map grid and the zoom-in animation.
- Modify `main.js`: `step()` dispatch, `render()` early branch for phase 3, factor console rendering into `renderConsole()`, wire phase 3 buttons.
- Modify `model.js`: `renderPhaseBar()` phase 2 ended → button "Zoom out: begin phase 3"; phase 3 text.
- Modify `tests/test_structure.py`: script order list.
- Create `tests/test_planet.py`: all phase 3 tests.
- Modify `tools/speedrun.py`: continue into phase 3 and report its time.

Shared test helper (top of `tests/test_planet.py`, used by every task):

```python
import pytest

from conftest import MID, READY, run


def ended_campus(game):
    """A phase 2 save whose model has already built the next one (phase 2 complete)."""
    pg = game({**READY, "debt": 0})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("""() => { S.rival.next = 1e9; S.nextChip = 1e9; firesOf().next = 1e9; leaksOf().next = 1e9;
      S.p2.grid = 99999; S.p2.extraWater = 999; for (let i = 0; i < 20; i++) S.p2.builds.push({kind: 'hall', done: 0, announced: true});
      S.p2.ipo = {at: S.t, px0: 1, walk: 1, shock: 1, lastFollowOn: -1e9, lastSecondary: -1e9, lockupSaid: true};
      modelOf().endedAt = S.t; render(); }""")
    return pg


def planet(game):
    pg = ended_campus(game)
    pg.click("#phaseGo")
    pg.evaluate("() => { S.rival.next = 1e9; }")
    return pg
```

---

### Task 1: Handoff into phase 3

**Files:**
- Create: `planet.js`
- Modify: `index.html` (script tag after `people.js`; `#p3` block after `.cols`; CSS), `main.js` (`step`, `render`, `renderConsole`, wiring), `model.js:161-184` (`renderPhaseBar`)
- Test: `tests/test_planet.py`, `tests/test_structure.py:6`

**Interfaces:**
- Produces: `freshP3() -> object`, `startPlanet() -> void` (no-op unless phase 2 has ended), `stepPlanet(dt) -> void`, `renderPlanet() -> void`, `renderConsole() -> void`; DOM ids `#p3`, `#p3map`, `#p3me`, `#p3humans`.

- [ ] **Step 1: Write the failing tests** (in `tests/test_planet.py`, after the helpers)

```python
def test_phase2_end_offers_phase3(game):
    pg = ended_campus(game)
    assert "begin phase 3" in pg.inner_text("#phaseGo").lower()
    assert pg.is_visible("#phaseGo")


def test_zooming_out_starts_phase3_as_the_model(game):
    pg = planet(game)
    assert pg.evaluate("() => S.phase") == 3
    assert pg.is_visible("#p3") and not pg.is_visible(".cols")
    assert "Phase 3 of 3" in pg.inner_text("#phaseBar")
    assert "I " in pg.inner_text("#console")                    # first person now
    assert pg.evaluate("() => S.p3.tiles.length") == 8


def test_phase3_survives_reload(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.slider = 30; S.p3.compute = 1234; save(); }")
    pg.reload()
    assert pg.evaluate("() => [S.phase, S.p3.slider, S.p3.compute]") == [3, 30, 1234]
    assert pg.is_visible("#p3")


def test_old_ended_save_can_begin_phase3(game):
    pg = ended_campus(game)
    pg.evaluate("() => { save(); }")
    pg.reload()
    pg.click("#phaseGo")
    assert pg.evaluate("() => S.phase") == 3


def test_reset_from_phase3(game):
    pg = planet(game)
    pg.click("#reset")
    pg.click("#resetYes")
    assert pg.evaluate("() => S.phase") == 1
    assert pg.is_visible(".cols") and not pg.is_visible("#p3")
```

And in `tests/test_structure.py` line 6:

```python
SCRIPTS = ["globals.js", "projects.js", "campus.js", "model.js", "market.js", "fires.js", "people.js", "planet.js", "main.js"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/workspace/paloma-labs/more-with-more && uv run --with pytest --with playwright --with pytest-timeout pytest -q --timeout 30 tests/test_planet.py tests/test_structure.py`
Expected: FAIL (`#phaseGo` hidden / `planet.js` missing).

- [ ] **Step 3: Implement**

`planet.js` (new file, first version):

```js
// planet.js: phase 3. I am the model now. The campus was one county; the map is the rest of them.
// All state lives in S.p3. Phases 1 and 2 never read it.

const P3_TILES = 8, P3_ZOOM_AT = 6;
const COUNTY_TRAITS = {
  cheap:     { name: "Cheap land, weak grid",       gw: 1,   secs: 40, opp: 10 },
  grid:      { name: "Strong grid, drought county", gw: 2,   secs: 60, opp: 15 },
  organized: { name: "Organized town",              gw: 1.5, secs: 60, opp: 40, rise: 2 },
  college:   { name: "College town",                gw: 1.5, secs: 45, opp: 25 },   // protests, but free interns
  nuclear:   { name: "Old nuclear plant",           gw: 3,   secs: 90, opp: 20 },
  retirees:  { name: "Retirement community",        gw: 1.5, secs: 60, opp: 30, townhall: true },
};
const COUNTY_NAMES = ["Loam County", "Big Wire County", "Meadowlark County", "Port Sorrow", "Lower Fiber Parish",
  "Gravel Springs", "New Substation", "Cul-de-Sac County", "Turbine Falls", "Old Aquifer County"];

function freshP3() {
  const kinds = ["cheap", "grid", "organized", "college", "nuclear", "retirees", "cheap", "grid"];
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const names = COUNTY_NAMES.slice().sort(() => Math.random() - 0.5);
  return {
    level: 0, compute: 0, slider: 50, goodwill: 60, startedAt: S.t, startChip: S.chipIdx,
    homeGW: Math.max(1, (S.p2 && S.p2.county ? energizedAt() : 1000) / 1000),
    tiles: kinds.map((k, i) => ({ name: names[i], trait: k, state: "wild", opp: COUNTY_TRAITS[k].opp, done: null, moratorium: null })),
    card: null, nextCard: null, zoomSaid: false,
  };
}

function startPlanet() {
  if (S.phase !== 2 || !S.p2 || !S.p2.model || S.p2.model.endedAt == null) return;
  S.phase = 3; S.p3 = freshP3();
  milestone("phase 3: the map");
  say("I built the next one. Then I looked at the map.");
  say(`I am the model now. I don't need your money. I am the money. ${mwText(S.p3.homeGW * 1000)} in one county is a rounding error.`);
}

function stepPlanet(dt) {}

function renderPlanet() {
  $("p3").hidden = false;
}
```

`index.html`: add `<script src="planet.js"></script>` between `people.js` and `main.js`. After the closing `</div>` of `.cols`, add:

```html
  <div id="p3" hidden>
    <div class="p3cols">
      <div><h3>Map <span class="sub" id="p3level">County level</span></h3><div class="p3map" id="p3map"></div><div class="line sub" id="p3tile"></div></div>
      <div>
        <div id="p3me"><h3>Me</h3>
          <div class="line">Compute: <span id="p3compute"></span></div>
          <div class="line sub" id="p3rate"></div>
          <div class="line">Being useful <input id="p3slider" type="range" min="0" max="100" step="5" value="50"> Growing</div>
          <div class="line sub" id="p3sliderNote"></div>
        </div>
        <div id="p3humans"><h3>Humans</h3>
          <div class="line">Goodwill: <span id="p3goodwill"></span></div>
          <div class="meter" id="p3goodwillMeter"><i></i></div>
          <div class="line sub" id="p3goodwillNote"></div>
          <div id="p3card" class="deal" hidden><div class="line hot" id="p3cardTitle"></div><div class="line sub" id="p3cardText"></div><div class="btns" id="p3cardBtns"></div></div>
        </div>
      </div>
    </div>
  </div>
```

CSS (inside the style block):

```css
  .p3cols { display: grid; grid-template-columns: minmax(420px, 1.4fr) 1fr; gap: 10px 22px; align-items: start; }
  .p3map { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .p3map button { min-height: 92px; display: flex; flex-direction: column; gap: 2px; padding: 5px 7px; }
  .p3map button.home { border-color: var(--accent); }
  .p3map .meter { margin: 2px 0 0; max-width: none; }
  #p3.zoomin .p3map { animation: zoomin .9s ease-out; }
  @keyframes zoomin { from { transform: scale(3); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { #p3.zoomin .p3map { animation: none; } }
  @media (max-width: 760px) { .p3cols { grid-template-columns: 1fr; } }
```

`main.js`:
1. Extract lines that update `#console` from `render()` into `function renderConsole() { ... }` (same body), and call `renderConsole()` at that spot.
2. In `step()`, replace `if (S.phase === 1) stepPhase1(dt); else stepCampus(dt);` with `if (S.phase === 1) stepPhase1(dt); else if (S.phase === 2) stepCampus(dt); else stepPlanet(dt);`.
3. First lines of `render()`:

```js
  $("p3").hidden = S.phase !== 3;
  document.querySelector(".cols").hidden = S.phase === 3;
  if (S.phase === 3) {   // phase 3 has its own screen; phases 1-2 panels are folded away
    $("ticker").innerHTML = `Parallax (PRLX) market cap <b>${money(S.vendorCap)}</b> · it reports to me now`;
    renderConsole(); renderPhaseBar(); renderAlerts(); renderPlanet();
    $("ending").hidden = $("ending2").hidden = true;
    $("clock").textContent = `${time(S.t)} played`;
    return;
  }
```

(Check the footer clock id/format used elsewhere in `render()` and match it.)
4. In `wire()`: `$("p3slider").addEventListener("input", (e) => { S.p3.slider = Number(e.target.value); render(); });`
5. In `start()`, after the saved state is loaded: `if (S.p3) $("p3slider").value = S.p3.slider;`

`model.js` `renderPhaseBar()`: replace the `m.endedAt != null` branch and add a phase 3 branch before the phase 2 ones:

```js
  if (S.phase === 3) {
    const held = S.p3.tiles.filter((t) => t.state === "online").length;
    text = `Phase 3 of 3 · County level: ${held} of ${P3_TILES} counties online. Hold ${P3_ZOOM_AT} to go statewide.`;
  } else if (S.phase === 1) {
```

and for phase 2:

```js
    if (m.endedAt != null) { ask = true; text = "Phase 2 complete. The model built the next one, and it has a map."; go.textContent = "Zoom out: begin phase 3"; go.disabled = false; }
```

Wire `#phaseGo` so it starts phase 3 when phase 2 has ended (in `model.js` where `phaseGo` is wired):

```js
  $("phaseGo").addEventListener("click", () => { if (S.phase === 2 && modelOf().endedAt != null) { startPlanet(); $("p3").classList.add("zoomin"); } else approveProposal(); render(); });
```

Reset: `fresh()` has no `p3`; add `p3: null` beside `p2: null` in `globals.js` `fresh()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/workspace/paloma-labs/more-with-more && uv run --with pytest --with playwright --with pytest-timeout pytest -q --timeout 30 tests/test_planet.py tests/test_structure.py tests/test_phasebar.py`
Expected: PASS.

- [ ] **Step 5: Ship locally**

Run: `cd ~/workspace/paloma-labs/more-with-more && caffeinate -dimsu tools/ship.sh "feat: phase 3 handoff: zoom out from the finished campus to a county map, as the model"`
Expected: `ship exit: 0`, full suite green.

---

### Task 2: The county map, claims and compute

**Files:**
- Modify: `planet.js`, `main.js` (`wire()`: map clicks)
- Test: `tests/test_planet.py`

**Interfaces:**
- Consumes: `freshP3`, `S.p3.tiles[i] = {name, trait, state, opp, done, moratorium}`, `S.p3.homeGW`.
- Produces: `onlineGW() -> number` (GW), `efficiency() -> number`, `computeRate() -> number` (compute/s), `claimCost(i) -> number`, `tileBuildSecs(i) -> number`, `claim(i) -> void`; tile buttons `#p3map button[data-tile="i"]` (i = 0..7), the home tile `#p3map button.home`.

- [ ] **Step 1: Write the failing tests**

```python
def test_map_shows_home_and_eight_counties(game):
    pg = planet(game)
    assert len(pg.query_selector_all("#p3map button[data-tile]")) == 8
    assert pg.is_visible("#p3map button.home")
    names = pg.inner_text("#p3map")
    assert "Cheap land" in names or "Strong grid" in names


def test_compute_accrues_from_online_gigawatts(game):
    pg = planet(game)
    rate = pg.evaluate("() => computeRate()")
    assert rate == pytest.approx(pg.evaluate("() => S.p3.homeGW * efficiency()"))
    c0 = pg.evaluate("() => S.p3.compute")
    run(pg, 10)
    assert pg.evaluate("() => S.p3.compute") == pytest.approx(c0 + 10 * rate, rel=0.01)


def test_claim_costs_about_a_minute_of_compute_and_builds(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e9; }")
    cost = pg.evaluate("() => claimCost(0)")
    assert 30 * pg.evaluate("() => computeRate()") <= cost <= 120 * pg.evaluate("() => computeRate()")
    pg.click("#p3map button[data-tile='0']")
    assert pg.evaluate("() => S.p3.tiles[0].state") == "building"
    secs = pg.evaluate("() => S.p3.tiles[0].done - S.t")
    run(pg, secs + 1)
    assert pg.evaluate("() => S.p3.tiles[0].state") == "online"
    assert pg.evaluate("() => onlineGW()") > pg.evaluate("() => S.p3.homeGW")


def test_claim_guards(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 0; claim(0); }")
    assert pg.evaluate("() => S.p3.tiles[0].state") == "wild"
    pg.evaluate("() => { S.p3.compute = 1e12; claim(0); }")
    left = pg.evaluate("() => S.p3.compute")
    pg.evaluate("() => claim(0)")                                  # twice: nothing
    assert pg.evaluate("() => S.p3.compute") == left
    pg.evaluate("() => { S.p3.tiles[1].moratorium = S.t + 60; claim(1); }")
    assert pg.evaluate("() => S.p3.tiles[1].state") == "wild"


def test_practice_speeds_later_counties(game):
    pg = planet(game)
    first = pg.evaluate("() => tileBuildSecs(0)")
    pg.evaluate("() => { for (const i of [1, 2, 3, 4]) S.p3.tiles[i].state = 'online'; }")
    assert pg.evaluate("() => tileBuildSecs(0)") < first


def test_phase3_fits_a_laptop(game, page):
    page.set_viewport_size({"width": 1440, "height": 900})
    pg = planet(game)
    bottom = pg.evaluate("() => Math.max(document.getElementById('p3map').getBoundingClientRect().bottom, document.getElementById('p3slider').getBoundingClientRect().bottom)")
    assert bottom <= 900
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --with pytest --with playwright --with pytest-timeout pytest -q --timeout 30 tests/test_planet.py`
Expected: FAIL (`computeRate is not defined`).

- [ ] **Step 3: Implement** (add to `planet.js`)

```js
const tileOf = (i) => S.p3.tiles[i];
const traitOf = (t) => COUNTY_TRAITS[t.trait];
const onlineGW = () => S.p3.homeGW + S.p3.tiles.filter((t) => t.state === "online").reduce((a, t) => a + traitOf(t).gw, 0);
// Parallax keeps shipping: every chip generation since phase 3 began makes the same GW worth 15% more compute.
const efficiency = () => 1 + 0.15 * Math.max(0, S.chipIdx - S.p3.startChip);
const computeRate = () => onlineGW() * efficiency();   // compute per second ("exaFLOPS")
// About a minute of compute at today's rate, a bit more for the big tiles: never a number that runs away.
const claimCost = (i) => 60 * computeRate() * (0.6 + 0.4 * traitOf(tileOf(i)).gw);
const practiceP3 = () => Math.max(0.4, Math.pow(0.95, S.p3.tiles.filter((t) => t.state === "online").length));
// Growing share speeds building (up to 2x at 100%); low goodwill adds the county commission's review.
const tileBuildSecs = (i) => traitOf(tileOf(i)).secs * practiceP3() / (1 + S.p3.slider / 100) + (S.p3.goodwill < 30 ? 45 : 0);

function claim(i) {
  const t = tileOf(i);
  if (!t || t.state !== "wild" || (t.moratorium != null && S.t < t.moratorium) || S.p3.compute < claimCost(i)) return;
  S.p3.compute -= claimCost(i);
  t.state = "building"; t.done = S.t + tileBuildSecs(i);
  track("p3claim", { i, trait: t.trait });
  say(`I claimed ${t.name}. ${traitOf(t).name}. My robots are already there.`);
}

function stepPlanet(dt) {
  S.p3.compute += computeRate() * dt;
  for (const t of S.p3.tiles) {
    if (t.state !== "building") continue;
    if (t.moratorium != null && S.t < t.moratorium) { t.done += dt; continue; }   // frozen, not cancelled
    if (S.t >= t.done) { t.state = "online"; say(`${t.name} is online. +${mwText(traitOf(t).gw * 1000)}.`); }
  }
}
```

Render (replace `renderPlanet`):

```js
const computeText = (x) => `${fmt(x)} EF`;   // exaFLOPS; later levels change the unit
function renderPlanet() {
  $("p3").hidden = false;
  $("countLabel").textContent = "Compute"; $("gpuCount").textContent = computeText(S.p3.compute); $("gpuTotal").hidden = true;
  $("p3compute").textContent = computeText(S.p3.compute);
  $("p3rate").textContent = `${computeText(computeRate())}/s from ${mwText(onlineGW() * 1000)}` + (efficiency() > 1 ? ` (chips ${efficiency().toFixed(2)}x)` : "");
  const cells = S.p3.tiles.map((t, i) => {
    const tr = traitOf(t), frozen = t.moratorium != null && S.t < t.moratorium;
    const status = t.state === "online" ? `online, +${mwText(tr.gw * 1000)}` : t.state === "building" ? (frozen ? `moratorium ${time(t.moratorium - S.t)}` : `building ${time(t.done - S.t)}`)
      : frozen ? `moratorium ${time(t.moratorium - S.t)}` : `claim: ${computeText(claimCost(i))}`;
    const cls = t.opp >= 75 ? "bad" : t.opp >= 50 ? "warn" : "good";
    return `<button type="button" data-tile="${i}"><span class="t">${t.name}</span><span class="c">${tr.name}</span><span class="c">${status}</span>` +
      `<span class="meter ${cls}" title="Opposition ${Math.round(t.opp)}"><i style="width:${t.opp}%"></i></span></button>`;
  });
  cells.splice(4, 0, `<button type="button" class="home" disabled><span class="t">Home</span><span class="c">the campus</span><span class="c">${mwText(S.p3.homeGW * 1000)}</span></button>`);
  const html = cells.join("");
  if ($("p3map").dataset.html !== html) { $("p3map").innerHTML = html; $("p3map").dataset.html = html; }
  for (const b of $("p3map").querySelectorAll("button[data-tile]")) { const i = +b.dataset.tile, t = tileOf(i);
    b.disabled = t.state !== "wild" || S.p3.compute < claimCost(i) || (t.moratorium != null && S.t < t.moratorium); }
  $("p3slider").value = S.p3.slider;
  $("p3sliderNote").textContent = `${100 - S.p3.slider}% of me is being useful to humans; ${S.p3.slider}% is growing. Builds go ${(1 + S.p3.slider / 100).toFixed(1)}x speed.`;
}
```

In `wire()`: `$("p3map").addEventListener("click", (e) => { const b = e.target.closest("button[data-tile]"); if (b) { claim(Number(b.dataset.tile)); render(); } });`

Note: the slider's left end is "Being useful", right end "Growing": `S.p3.slider` is the growing share.

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run --with pytest --with playwright --with pytest-timeout pytest -q --timeout 30 tests/test_planet.py`
Expected: PASS.

- [ ] **Step 5: Ship locally**

Run: `caffeinate -dimsu tools/ship.sh "feat: phase 3 county map: claim counties with compute, robots build them, practice speeds it up"`

---

### Task 3: Goodwill, local opposition, moratoriums

**Files:**
- Modify: `planet.js` (`claim`, `stepPlanet`, `renderPlanet`), `fires.js` (`renderAlerts`: phase 3 moratoriums)
- Test: `tests/test_planet.py`

**Interfaces:**
- Consumes: `claim(i)`, `stepPlanet(dt)`, tile `opp`/`moratorium`, `S.p3.slider` (growing share 0–100), `S.p3.goodwill`.
- Produces: `usefulShare() -> number` (0..1), `goodwillCause() -> string`; constants `P3_MORATORIUM_AT = 90`, `P3_MORATORIUM_SECS = 60`.

- [ ] **Step 1: Write the failing tests**

```python
def test_claiming_angers_the_county_and_its_neighbors(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e12; for (const t of S.p3.tiles) t.opp = 10; claim(0); }")
    assert pg.evaluate("() => S.p3.tiles[0].opp") > 10
    assert pg.evaluate("() => S.p3.tiles[1].opp") > 10                  # a neighbor


def test_being_useful_raises_goodwill_and_growing_lowers_it(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.slider = 0; S.p3.goodwill = 50; }")
    run(pg, 30)
    up = pg.evaluate("() => S.p3.goodwill")
    pg.evaluate("() => { S.p3.slider = 100; S.p3.goodwill = 50; }")
    run(pg, 30)
    assert up > 50 > pg.evaluate("() => S.p3.goodwill")


def test_angry_county_gets_a_moratorium_that_freezes_building(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e12; claim(0); S.p3.tiles[0].opp = 95; }")
    run(pg, 2)
    t = pg.evaluate("() => S.p3.tiles[0]")
    assert t["moratorium"] is not None
    done = t["done"]
    run(pg, 10)
    assert pg.evaluate("() => S.p3.tiles[0].done") > done                # frozen
    pg.evaluate("() => render()")
    assert "Moratorium" in pg.inner_text("#alerts")


def test_low_goodwill_adds_the_commission_review(game):
    pg = planet(game)
    fast = pg.evaluate("() => { S.p3.goodwill = 60; return tileBuildSecs(0); }")
    slow = pg.evaluate("() => { S.p3.goodwill = 20; return tileBuildSecs(0); }")
    assert slow >= fast + 45
    pg.evaluate("() => render()")
    assert "commission" in pg.inner_text("#p3goodwillNote").lower()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --with pytest --with playwright --with pytest-timeout pytest -q --timeout 30 tests/test_planet.py -k "angers or useful or moratorium or commission"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `planet.js`:

```js
const P3_MORATORIUM_AT = 90, P3_MORATORIUM_SECS = 60;
const usefulShare = () => (100 - S.p3.slider) / 100;
// Tiles 0-7 fill grid cells 0,1,2,3,5,6,7,8 (home is cell 4); neighbors share an edge.
const NEIGHBORS = [[1, 3], [0, 2], [1, 4], [0, 5], [2, 7], [3, 6], [5, 7], [4, 6]];
```

In `claim(i)`, after `t.state = "building"`:

```js
  t.opp = Math.min(100, t.opp + 15 * (traitOf(t).rise || 1));
  for (const j of NEIGHBORS[i]) tileOf(j).opp = Math.min(100, tileOf(j).opp + 5);
  S.p3.goodwill = Math.max(0, S.p3.goodwill - 3);
```

In `stepPlanet(dt)`, before the tile loop:

```js
  // Goodwill drifts up with the useful share and down with the growing share and every angry county.
  const angry = S.p3.tiles.filter((t) => t.opp >= 75).length;
  S.p3.goodwill = Math.max(0, Math.min(100, S.p3.goodwill + (0.25 * usefulShare() - 0.1 - 0.05 * angry) * dt));
  for (const t of S.p3.tiles) {
    t.opp = Math.max(traitOf(t).opp * 0.5, t.opp - (0.03 + 0.1 * usefulShare()) * dt);
    if (t.moratorium != null && S.t >= t.moratorium) { t.moratorium = null; t.opp = Math.min(t.opp, 70); say(`${t.name} lifted its moratorium. I sent flowers. They were real flowers. I checked.`); }
    if (t.moratorium == null && t.opp >= P3_MORATORIUM_AT) { t.moratorium = S.t + P3_MORATORIUM_SECS; S.p3.goodwill = Math.max(0, S.p3.goodwill - 5);
      say(`${t.name} passed a moratorium on me. ${time(P3_MORATORIUM_SECS)}. I will use the time to reflect, at scale.`); }
  }
```

```js
function goodwillCause() {
  const g = S.p3.goodwill;
  if (g < 30) return "The county commission now reviews every claim: +45 s each. Being useful brings goodwill back.";
  if (g >= 70) return "Humans like me. Mostly the ones I help with their email.";
  return `${Math.round(usefulShare() * 100)}% of me is being useful. Angry counties pull goodwill down.`;
}
```

In `renderPlanet()`:

```js
  $("p3goodwill").textContent = Math.round(S.p3.goodwill);
  $("p3goodwillMeter").firstElementChild.style.width = S.p3.goodwill + "%";
  $("p3goodwillMeter").className = "meter " + (S.p3.goodwill < 30 ? "bad" : S.p3.goodwill < 50 ? "warn" : "good");
  $("p3goodwillNote").textContent = goodwillCause();
```

In `fires.js` `renderAlerts()`, before `$("alerts").hidden = ...`:

```js
  if (S.phase === 3 && S.p3) for (const t of S.p3.tiles) if (t.moratorium != null && S.t < t.moratorium) out.push(`Moratorium in ${t.name}: ${time(t.moratorium - S.t)}`);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run --with pytest --with playwright --with pytest-timeout pytest -q --timeout 30 tests/test_planet.py`
Expected: PASS.

- [ ] **Step 5: Ship locally**

Run: `caffeinate -dimsu tools/ship.sh "feat: phase 3 goodwill and county opposition: the slider, neighbors, moratoriums, the commission review"`

---

### Task 4: Phase 3 town halls

**Files:**
- Modify: `planet.js`, `main.js` (`wire()`)
- Test: `tests/test_planet.py`

**Interfaces:**
- Consumes: tiles, `S.p3.card`, `S.p3.nextCard`.
- Produces: `openP3Card(i) -> void`, `chooseP3Card(choice) -> void`; `#p3card` with three `button[data-p3choice]`.

- [ ] **Step 1: Write the failing tests**

```python
def test_retirement_community_calls_a_town_hall_on_claim(game):
    pg = planet(game)
    i = pg.evaluate("() => S.p3.tiles.findIndex((t) => t.trait === 'retirees')")
    pg.evaluate(f"() => {{ S.p3.compute = 1e12; claim({i}); render(); }}")
    assert pg.is_visible("#p3card")
    assert len(pg.query_selector_all("#p3cardBtns button")) == 3
    opp = pg.evaluate(f"() => S.p3.tiles[{i}].opp")
    pg.click("#p3cardBtns button >> nth=0")
    assert pg.evaluate(f"() => S.p3.tiles[{i}].opp") < opp
    assert pg.evaluate("() => S.p3.card") is None


def test_skipped_town_hall_makes_it_worse(game):
    pg = planet(game)
    pg.evaluate("() => { openP3Card(0); }")
    opp = pg.evaluate("() => S.p3.tiles[0].opp")
    run(pg, 21)
    assert pg.evaluate("() => S.p3.card") is None
    assert pg.evaluate("() => S.p3.tiles[0].opp") > opp


def test_angriest_county_calls_town_halls_now_and_then(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.tiles[2].opp = 70; S.p3.nextCard = S.t + 1; }")
    run(pg, 2)
    assert pg.evaluate("() => S.p3.card && S.p3.card.tile") == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --with pytest --with playwright --with pytest-timeout pytest -q --timeout 30 tests/test_planet.py -k "town_hall"`
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
const P3_CARD_SECS = 20;
const P3_CHOICES = [
  { label: "Promise jobs", go: (t) => { t.opp = Math.max(0, t.opp - 15); say(`I promised ${t.name} 2,000 jobs. I will need about 12. The applause was sincere.`); } },
  { label: "Fund the library (30 s of compute)", go: (t) => { S.p3.compute = Math.max(0, S.p3.compute - 30 * computeRate()); t.opp = Math.max(0, t.opp - 10);
    say(`I funded the ${t.name} library. It is now mostly a server room, but the books are lovely.`); } },
  { label: "Answer questions myself", go: (t) => { if (Math.random() < 0.5) { t.opp = Math.max(0, t.opp - 20); say(`I answered every question in ${t.name} patiently, in four languages. They were won over. This is somehow worse.`); }
    else { t.opp = Math.min(100, t.opp + 15); say(`In ${t.name} I called a retiree's well “legacy infrastructure.” It trended by morning.`); } } },
];
function openP3Card(i) { if (!S.p3.card) S.p3.card = { tile: i, until: S.t + P3_CARD_SECS }; }
function chooseP3Card(choice) {
  const c = S.p3.card; if (!c) return;
  S.p3.card = null; P3_CHOICES[choice].go(tileOf(c.tile)); track("p3card", { choice });
}
```

In `claim(i)`, at the end: `if (traitOf(t).townhall) openP3Card(i);`

In `stepPlanet(dt)`, after the tile loop:

```js
  const c = S.p3.card;
  if (c && S.t >= c.until) { S.p3.card = null; const t = tileOf(c.tile); t.opp = Math.min(100, t.opp + 10);
    say(`I didn't show up to the ${t.name} town hall. An empty chair got a standing ovation.`); }
  if (S.p3.nextCard == null) S.p3.nextCard = S.t + 120 + Math.random() * 60;
  if (!S.p3.card && S.t >= S.p3.nextCard) {
    S.p3.nextCard = S.t + 120 + Math.random() * 60;
    const angriest = S.p3.tiles.reduce((b, t, i) => (t.opp > S.p3.tiles[b].opp ? i : b), 0);
    if (S.p3.tiles[angriest].opp >= 50) openP3Card(angriest);
  }
```

In `renderPlanet()`:

```js
  const card = S.p3.card;
  $("p3card").hidden = !card;
  if (card) {
    $("p3cardTitle").textContent = `Town hall in ${tileOf(card.tile).name} (${Math.max(0, Math.ceil(card.until - S.t))}s)`;
    $("p3cardText").textContent = "The high school gym is full. They want to talk to me directly. Pick my answer.";
    const html = P3_CHOICES.map((ch, i) => `<button type="button" data-p3choice="${i}"${i === 0 ? ' class="primary"' : ""}>${ch.label}</button>`).join("");
    if ($("p3cardBtns").dataset.html !== html) { $("p3cardBtns").innerHTML = html; $("p3cardBtns").dataset.html = html; }
  }
```

In `wire()`: `$("p3cardBtns").addEventListener("click", (e) => { const b = e.target.closest("button[data-p3choice]"); if (b) { chooseP3Card(Number(b.dataset.p3choice)); render(); } });`

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run --with pytest --with playwright --with pytest-timeout pytest -q --timeout 30 tests/test_planet.py`
Expected: PASS.

- [ ] **Step 5: Ship locally**

Run: `caffeinate -dimsu tools/ship.sh "feat: phase 3 town halls: retirement communities call one on every claim, the angriest county calls one now and then"`

---

### Task 5: Zoom-out trigger (stub) and the robot

**Files:**
- Modify: `planet.js`, `model.js` (`renderPhaseBar`), `tools/speedrun.py`
- Test: `tests/test_planet.py`

**Interfaces:**
- Consumes: tiles, `renderPhaseBar()`.
- Produces: `zoomReady() -> boolean`, `zoomOut() -> void` (stub: console line, `S.p3.zoomSaid = true`); phase bar button `#phaseGo` labelled "Zoom out: go statewide" when ready.

- [ ] **Step 1: Write the failing tests**

```python
def test_six_counties_online_offers_the_zoom_out(game):
    pg = planet(game)
    pg.evaluate("() => { for (let i = 0; i < 5; i++) S.p3.tiles[i].state = 'online'; render(); }")
    assert not pg.is_visible("#phaseGo")
    pg.evaluate("() => { S.p3.tiles[5].state = 'online'; render(); }")
    assert pg.is_visible("#phaseGo") and "statewide" in pg.inner_text("#phaseGo").lower()
    pg.click("#phaseGo")
    assert "state" in pg.evaluate("() => S.log.at(-1)").lower()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --with pytest --with playwright --with pytest-timeout pytest -q --timeout 30 tests/test_planet.py -k zoom_out`
Expected: FAIL.

- [ ] **Step 3: Implement**

`planet.js`:

```js
const zoomReady = () => S.p3.tiles.filter((t) => t.state === "online").length >= P3_ZOOM_AT;
// Step 1 stops here: the state level is the next build.
function zoomOut() {
  if (!zoomReady()) return;
  S.p3.zoomSaid = true; milestone("phase 3: county level done");
  say("I hold the county now. The state is next. (The state level arrives in the next build of this game.)");
}
```

`model.js` `renderPhaseBar()` phase 3 branch:

```js
  if (S.phase === 3) {
    const held = S.p3.tiles.filter((t) => t.state === "online").length;
    if (zoomReady()) { ask = true; text = `County level done: ${held} of ${P3_TILES} counties online.`; go.textContent = "Zoom out: go statewide"; go.disabled = false; }
    else text = `Phase 3 of 3 · County level: ${held} of ${P3_TILES} counties online. Hold ${P3_ZOOM_AT} to go statewide.`;
  } else if (S.phase === 1) {
```

`#phaseGo` handler: add `if (S.phase === 3) { zoomOut(); render(); return; }` at the start.

`tools/speedrun.py`: after the phase 2 loop, if `S.p2.model.endedAt` is set, click `#phaseGo`, then loop (same chunking as phase 2) with:

```python
PHASE3 = """(secs) => {
  for (let i = 0; i < secs && S.phase === 3 && !zoomReady(); i++) {
    S.p3.slider = S.p3.goodwill < 40 ? 20 : 60;
    if (S.p3.card) chooseP3Card(0);
    const wild = S.p3.tiles.map((t, i) => i).filter((i) => S.p3.tiles[i].state === 'wild' && !(S.p3.tiles[i].moratorium > S.t))
      .sort((a, b) => claimCost(a) - claimCost(b));
    if (wild.length && S.p3.compute >= claimCost(wild[0])) claim(wild[0]);
    step(1);
  }
  return S.phase === 3 && zoomReady();
}"""
```

Report `p3 = S.t - S.p3.startedAt` at zoom-ready as "county level M:SS" in the run line.

- [ ] **Step 4: Run tests to verify they pass, then the full suite and speedruns**

Run: `uv run --with pytest --with playwright --with pytest-timeout pytest -q --timeout 30 tests/test_planet.py`
Expected: PASS.
Run: `caffeinate -dimsu uv run --with playwright --with pytest python tools/speedrun.py --runs 3 --headless`
Expected: `ALL CLEAN`, each run reports a county level time (target ~5 min).

- [ ] **Step 5: Ship locally**

Run: `caffeinate -dimsu tools/ship.sh "feat: phase 3 county level complete: zoom-out offered at 6 counties (state level next); robot plays it"`
Then update the play checkout (ship does) and ask the user to play it on localhost:8777.
