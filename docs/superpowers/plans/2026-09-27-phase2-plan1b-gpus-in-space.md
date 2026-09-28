# Phase 2, Plan 1b: capacity is GPUs in space (leased or owned), on-demand with depreciation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Work on `main` (solo repo; see memory).

**Goal:** Rework the phase 2 core loop to match how an AI infra company works: contracts are delivered from GPUs racked in leased colo space or on your own campus; uncontracted GPUs sell on-demand (older generations cheaper, still busy) and on spot; raises continue.

**Architecture:** Same files as Plan 1. `capKW()` becomes leased space + energized campus halls, so phase 1's GPU buying and leasing UI keeps working in phase 2. Campus halls become powered shells. A per-generation allocation (`freeKWByGen()`) decides which GPUs are under contract; everything else earns on-demand. Leasable MW in phase 2 is a finite, slowly regrowing market.

**Tech Stack:** unchanged (vanilla JS, pytest + Playwright via `uv run --with`, Python sim).

**Spec:** `docs/superpowers/specs/2026-09-27-phase2-campus-design.md` (see "Capacity: GPUs in space", revised 2026-09-27).

## Global Constraints

- Everything from Plan 1's Global Constraints still holds (no build step, script order, `S.p2` boundary, save keys, low-stress deadlines, copy style, `uv`).
- GPUs are a separate purchase from space in both phases. Campus halls do not include GPUs and do not take Parallax credits.
- Old GPUs never earn zero: on-demand rate = `OD_RATE × max(OD_FLOOR, OD_DECAY^(generations behind))` at utilization `OD_UTIL`.
- Legacy colo (flat fee) is removed. Old saves with `S.p2.legacyMW` must still load (the field is ignored).
- Tests: `cd /Users/alexa/workspace/paloma-labs/more-with-more && uv run --with pytest --with playwright pytest -q`.

## Review Focus

1. **A contract that needs newer chips than you own** must not activate from old GPUs, and its forecast must say so (not "on hand"). Test: Task 3 `test_min_gen_respected`.
2. **Phase 1 players** must see no change from moving chip releases, spot and `capKW` to shared code. Test: existing `tests/test_phase1.py` + Task 1 `test_phase1_capacity_unchanged`.
3. **The leased market running out** must disable lease buttons with a named reason, and regrow. Test: Task 1 `test_leased_market_is_finite_and_regrows`.
4. **Spot sales in phase 2** must pause on-demand revenue for the sold block and restore it after 30 s. Test: Task 2 `test_spot_pauses_on_demand_then_restores`.
5. **Old phase 2 saves from Plan 1** (with `legacyMW`, halls that included GPUs) must load without errors. Test: Task 1 `test_plan1_save_loads`.

---

### Task 1: One capacity pool: leased space + campus halls; panels stay; finite lease market; chips keep shipping

**Files:** Modify `campus.js`, `main.js`, `index.html`, `tests/conftest.py`, `tests/test_handoff.py`, `tests/test_power.py`

**Interfaces:**
- Produces: `leasedKW()` (main), `capKW()` = `leasedKW() + (S.phase === 2 ? campusKWAt() : 0)`; `campusKWAt(at?)` (kW); `HALL.cost = 10e6` (shell); `S.p2.market` (MW), `marketHas(i)`, `takeFromMarket(i)`, `MARKET_START_MW = 150`, `MARKET_REGROW = 10/60` MW/s; chip releases in shared `step()`.

- [ ] **Step 1: Update fixtures and write failing tests**

`tests/conftest.py`: replace the `READY = ...` line with
```python
# Ready to break ground: Gen 7, 40k P4s (2.744 kW each, ~110 MW) in ~220 MW of leased space (incl. a building).
READY = {**MID, "gen": 7, "fleet": {"3": 40000}, "gpus": 40000, "tier": 4,
         "leases": {**MID["leases"], "building": 1}, "leaseCool": {**MID["leaseCool"], "building": {"5": 1}}}
```
`tests/test_handoff.py`: replace `test_break_ground_starts_campus` and `test_legacy_colo_pays` with
```python
def test_break_ground_starts_campus(game):
    pg = game(READY)
    break_ground(pg)
    assert pg.evaluate("() => [S.phase, S.gpus]") == [2, 40000]
    assert pg.is_visible("#countyBox")
    for hidden in ["#trainingBox", "#p1biz", "#ending", "#answer"]:
        assert not pg.is_visible(hidden), hidden
    for shown in ["#computeBox", "#facilitiesBox", "#hypeNum", "#funds"]:
        assert pg.is_visible(shown), shown
    assert "We are an infrastructure company now." in pg.inner_text("#console")


def test_plan1_save_loads(game):
    pg = game({**READY, "phase": 2, "ended": True, "p2": {"county": "cheap", "legacyMW": 110, "grid": 50, "queue": None,
               "queueN": 0, "builds": [{"kind": "hall", "done": 0}], "offers": [], "contracts": [], "nextOffer": 0,
               "offerN": 0, "contractN": 0, "earned": 0}})
    run(pg, 2)
    assert pg.evaluate("() => [S.phase, S.p2.county, typeof S.p2.market]") == [2, "cheap", "number"]
    assert pg.is_visible("#campusBox")
```
In `test_inherited_debt_is_refinanced`, change `S.p2.legacyMW = 0;` to `S.fleet = {}; S.gpus = 0;`.

`tests/test_power.py`: replace `test_hall_costs_money_and_time` and `test_hall_uses_credits_first` with
```python
def test_hall_is_a_shell_that_adds_room(game):
    pg = campus(game)
    funds, room = pg.evaluate("() => [S.funds, roomNewest()]")
    pg.click("#buildHall")
    assert pg.evaluate("() => S.funds") == pytest.approx(funds - 10e6)
    run(pg, 89)
    assert pg.evaluate("() => roomNewest()") == room
    run(pg, 1)
    assert pg.evaluate("() => energizedAt()") == 50
    assert pg.evaluate("() => roomNewest()") == pytest.approx(room + 50000 / 2.744, abs=1)
    assert "Hall 1 is up" in pg.inner_text("#console")


def test_hall_does_not_take_credits(game):
    pg = campus(game, credits=10e6)
    pg.click("#buildHall")
    assert pg.evaluate("() => S.credits") == 10e6


def test_leased_market_is_finite_and_regrows(game):
    pg = campus(game)
    pg.evaluate("() => { S.p2.market = 25; }")
    run(pg, 1)
    hall_btn = "#leases button[data-lease='3']"            # data hall: 240 racks, 20 MW at this cooling
    assert pg.is_enabled(hall_btn)
    pg.click(hall_btn)
    assert pg.evaluate("() => S.p2.market") == pytest.approx(25 + 10 / 60 - 20, abs=0.01)
    assert not pg.is_enabled(hall_btn)
    assert "left in this market" in pg.inner_text("#facilitiesBox")
    run(pg, 90)
    assert pg.is_enabled(hall_btn)


def test_chips_keep_shipping_in_phase2(game):
    pg = campus(game)
    pg.evaluate("() => { S.nextChip = S.t + 1; }")
    run(pg, 2)
    assert pg.evaluate("() => S.chipIdx") == 4
```
Add to `tests/test_phase1.py`:
```python
def test_phase1_capacity_unchanged(game):
    pg = game(MID)
    assert pg.evaluate("() => capKW() === leasedKW()")
```

- [ ] **Step 2: Run to verify they fail** — `uv run --with pytest --with playwright pytest -q tests/test_handoff.py tests/test_power.py tests/test_phase1.py`. Expected: FAIL (`leasedKW` undefined, compute panel hidden, hall costs 30M, no market).

- [ ] **Step 3: main.js**

a) Replace
```js
const capKW = () => TYPES.reduce((a, _, i) => a + Object.entries(coolOf(i)).reduce((b, [lv, n]) => b + n * unitKW(i, +lv), 0), 0);
```
with
```js
const leasedKW = () => TYPES.reduce((a, _, i) => a + Object.entries(coolOf(i)).reduce((b, [lv, n]) => b + n * unitKW(i, +lv), 0), 0);
const capKW = () => leasedKW() + (S.phase === 2 ? campusKWAt() : 0);   // phase 2: plus energized campus halls
```
b) In `step()`, add `if (S.t >= S.nextChip) releaseChip();` right after the `S.fatigue = ...` line, and delete the same line from the top of `stepPhase1()`.
c) In `lease(i)`, change `if (!t || !leaseVisible(i) || S.funds < c) return;` to
```js
  if (!t || !leaseVisible(i) || S.funds < c || (S.phase === 2 && !marketHas(i))) return;
```
and after `S.funds -= c; S.leases[t.id] = owned(i) + 1; S.tier = highestType();` add `if (S.phase === 2) takeFromMarket(i);`.
d) In `renderLeases()`, change `b.disabled = S.funds < leaseCost(i);` to
```js
    b.disabled = S.funds < leaseCost(i) || (S.phase === 2 && !marketHas(i));
```
and after `$("rent").textContent = rentIndex().toFixed(1);` add
```js
  $("marketLeft").textContent = S.phase === 2 && S.p2 ? ` · landlords have ${fmt(Math.max(0, S.p2.market))} MW left in this market` : "";
```
e) In `render()`, replace
```js
  for (const id of ["p1biz", "computeBox", "trainingBox", "facilitiesBox"]) $(id).hidden = S.phase !== 1;
  if (S.phase === 1) { renderPhase1(); $("countyBox").hidden = $("campusBox").hidden = $("contractsBox").hidden = true; }
  else renderCampus();
```
with
```js
  for (const id of ["p1biz", "trainingBox", "answer"]) $(id).hidden = S.phase !== 1;
  renderPhase1();                                   // compute and leased space work in both phases
  if (S.phase === 1) $("countyBox").hidden = $("campusBox").hidden = $("contractsBox").hidden = true;
  else renderCampus();
```
f) In `render()`, change `$("creditsNote").textContent = S.phase === 1 ? "(GPUs only)" : "(pays for halls' GPUs)";` to `$("creditsNote").textContent = "(GPUs only)";`.

- [ ] **Step 4: index.html** — in `#facilitiesBox`, change `<div class="line sub">Market rent: <span id="rent">1.0</span>x (rises with every rack you lease)</div>` to
```html
        <div class="line sub">Market rent: <span id="rent">1.0</span>x (rises with every rack you lease)<span id="marketLeft"></span></div>
```
In `#campusBox`, replace `<div class="line">Legacy colo: <span id="legacy"></span></div>` with
```html
        <div class="line">Capacity: <span id="p2cap"></span></div>
```

- [ ] **Step 5: campus.js**

a) Replace `const LEGACY_FEE = 100;   // $/s per MW of the phase 1 fleet left in leased colo` with
```js
const MARKET_START_MW = 150, MARKET_REGROW = 10 / 60;   // leasable MW left in this market; new colos open slowly
```
b) Replace the `HALL` line with
```js
const HALL = { mw: 50, acres: 20, cost: 10e6, secs: 90 };   // a powered shell: GPUs are bought separately and racked in it
```
c) In `BUILD_DONE.hall`, change `"Energized."` to `"Energized. Rack some GPUs in it."`.
d) `freshP2` becomes
```js
const freshP2 = () => ({
  county: null, market: MARKET_START_MW, round: 0, grid: 0, queue: null, queueN: 0, builds: [],
  offers: [], contracts: [], nextOffer: 0, offerN: 0, contractN: 0, earned: 0,
});
```
e) After `const energizedAt = ...;` add
```js
const campusKWAt = (at = S.t) => (S.p2 && S.p2.county ? energizedAt(at) * 1000 : 0);
const marketHas = (i) => unitKW(i) / 1000 <= S.p2.market;
function takeFromMarket(i) { S.p2.market -= unitKW(i) / 1000; }
```
f) `build()` becomes
```js
function build(kind) {
  const spec = kind === "hall" ? HALL : POWER[kind];
  if (!spec || !S.p2.county || spec.acres > acresFree() || S.funds < spec.cost) return;
  S.funds -= spec.cost;
  S.p2.builds.push({ kind, done: S.t + spec.secs });
  track("build", { ev: "start", kind, cost: Math.round(spec.cost) });
  say(kind === "hall" ? `Broke ground on hall ${S.p2.builds.filter((b) => b.kind === "hall").length}. Ready in ${time(spec.secs)}.`
    : `Ordered ${spec.name === "gas turbine" ? "a gas turbine" : "a solar farm with batteries"}. Online in ${time(spec.secs)}.`);
}
```
g) `startCampus()` becomes
```js
function startCampus() {
  if (S.phase === 2) return;
  S.phase = 2; S.p2 = freshP2();
  milestone("phase 2: the campus");
  say("We are an infrastructure company now.");
  say(`Your ${fmt(usedKW() / 1000)} MW of GPUs stay in the space you already lease. Whatever isn't under contract sells on-demand. The model has opinions about which county is next.`);
  if (S.debt > 0) say(`Lenders love infrastructure. Your ${money(S.debt)} was refinanced as project finance at a quarter of the rate.`);
}
```
h) `campusDealSize` becomes `const campusDealSize = () => 20e6;   // Parallax credits: GPUs only`.
i) In `stepCampus`, replace `  S.funds += S.p2.legacyMW * LEGACY_FEE * dt;` with `  S.p2.market += MARKET_REGROW * dt;`, and add at the very top of `stepCampus` (before `if (!S.p2.county) return;`): `if (S.p2.market == null) S.p2.market = MARKET_START_MW;` (Plan 1 saves).
j) `campusRevenue` becomes contracts only for now:
```js
const campusRevenue = () => (S.p2 && S.p2.county ? S.p2.contracts.filter((c) => c.status === "active").reduce((a, c) => a + c.fee, 0) : 0);
```
k) `campusSnap`: replace `legacyMW: S.p2.legacyMW, ` with `fleetMW: Math.round(usedKW() / 1000), leasedMW: Math.round(leasedKW() / 1000), market: Math.round(S.p2.market), `.
l) In `renderCampus()`: replace the first line `if (!p.county) { $("countLabel")...legacyMW...}` with
```js
  if (!p.county) { $("countLabel").textContent = "Fleet"; $("gpuCount").textContent = `${fmt(usedKW() / 1000)} MW`; }
```
and replace `$("legacy").textContent = ...;` with
```js
  $("p2cap").textContent = `${fmt(leasedKW() / 1000)} MW leased + ${fmt(energizedAt())} MW campus; ${fmt(usedKW() / 1000)} MW of GPUs racked, room for ${fmt(Math.max(0, capKW() - usedKW()) / 1000)} MW more`;
```
and change the `$("buildHall").disabled = ...` line to `$("buildHall").disabled = S.funds < HALL.cost || acresFree() < HALL.acres;`.

- [ ] **Step 6: Run everything** — `uv run --with pytest --with playwright pytest -q`. Expected: the new Task 1 tests pass. Contract tests that relied on halls-as-capacity may fail; they are rewritten in Task 3. Record the failing test names in the commit message if any.

- [ ] **Step 7: Commit** — `git commit -am "feat: phase 2 capacity is GPUs in leased or campus space; finite lease market"` then `git push`.

---

### Task 2: On-demand revenue by generation, spot in phase 2, depreciation project

**Files:** Modify `campus.js`, `main.js`, `projects.js`; Create `tests/test_ondemand.py`

**Interfaces:**
- Produces: `OD_RATE = 300`, `OD_DECAY = 0.7`, `OD_FLOOR = 0.15`, `OD_UTIL = 0.8`; `freeKWByGen(): {gen: kW}` (GPUs not under active contracts, allocated oldest-eligible-first in activation order); `odRate(gen)`; `onDemandRevenue()` ($/s); `uncontractedGPUs()`; `campusSpotPay()`; project `depr6` (phase 2).

- [ ] **Step 1: Write failing tests** — `tests/test_ondemand.py`:
```python
import pytest

from conftest import READY, run

OD = 300 * 0.8          # $/MW/s for the newest generation at utilization


def campus(game, **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("() => { S.p2.offers = []; S.p2.nextOffer = 1e9; S.rival.next = 1e9; S.nextChip = 1e9; }")
    return pg


def fleet_mw(pg):
    return pg.evaluate("() => usedKW() / 1000")


def test_old_fleet_earns_on_demand(game):
    pg = campus(game)
    assert pg.evaluate("() => onDemandRevenue()") == pytest.approx(fleet_mw(pg) * OD)
    funds = pg.evaluate("() => S.funds")
    run(pg, 10)
    assert pg.evaluate("() => S.funds") == pytest.approx(funds + 10 * fleet_mw(pg) * OD, rel=1e-6)


def test_older_generations_earn_less_but_still_earn(game):
    pg = campus(game)
    pg.evaluate("() => { S.chipIdx = 4; }")
    assert pg.evaluate("() => onDemandRevenue()") == pytest.approx(fleet_mw(pg) * OD * 0.7)
    pg.evaluate("() => { S.chipIdx = 20; }")
    assert pg.evaluate("() => onDemandRevenue()") == pytest.approx(fleet_mw(pg) * OD * 0.15)


def test_contracted_gpus_leave_on_demand(game):
    pg = campus(game)
    pg.evaluate("() => { makeOffer(true); const o = S.p2.offers[0]; o.start = S.t + 1; acceptOffer(o.id); }")
    run(pg, 2)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "active"
    assert pg.evaluate("() => onDemandRevenue()") == pytest.approx((fleet_mw(pg) - 30) * OD)


def test_spot_pauses_on_demand_then_restores(game):
    pg = campus(game)
    full = pg.evaluate("() => onDemandRevenue()")
    funds = pg.evaluate("() => S.funds")
    pg.click("#spot")
    assert pg.evaluate("() => S.funds") > funds
    assert pg.evaluate("() => onDemandRevenue()") == pytest.approx(full / 2)
    run(pg, 31)
    assert pg.evaluate("() => onDemandRevenue()") == pytest.approx(full)


def test_depreciation_project(game):
    pg = campus(game)
    assert not pg.query_selector("button[data-id='depr6']")
    pg.evaluate("() => { S.chipIdx = 4; }")
    run(pg, 1)
    hype = pg.evaluate("() => S.hype")
    pg.click("button[data-id='depr6']")
    assert pg.evaluate("() => S.hype") == pytest.approx(hype + 20)
```
- [ ] **Step 2: Run to verify they fail** — `uv run --with pytest --with playwright pytest -q tests/test_ondemand.py`. Expected: FAIL (`onDemandRevenue` undefined, spot hidden in phase 2).

- [ ] **Step 3: campus.js** — after `const MARKET_START_MW ...` add
```js
const OD_RATE = 300, OD_DECAY = 0.7, OD_FLOOR = 0.15, OD_UTIL = 0.8;   // on-demand $/MW/s for the newest chip; older gens earn less but stay busy
```
After `function takeFromMarket...` add
```js
// Which GPUs are under contract: active contracts take MW from the oldest generation they accept, in activation order.
function freeKWByGen() {
  const free = {};
  for (const [g, n] of Object.entries(S.fleet)) if (n > 0) free[g] = n * chip(+g).kw;
  const active = S.p2 ? S.p2.contracts.filter((k) => k.status === "active") : [];
  for (const c of active.sort((a, b) => (a.activeAt || 0) - (b.activeAt || 0) || a.n - b.n)) {
    let need = c.mw * 1000;
    for (const g of Object.keys(free).map(Number).sort((a, b) => a - b)) {
      if (g < (c.minGen || 0) || need <= 0) continue;
      const take = Math.min(need, free[g]); free[g] -= take; need -= take;
    }
  }
  return free;
}
const odRate = (g) => OD_RATE * Math.max(OD_FLOOR, Math.pow(OD_DECAY, S.chipIdx - g));
const onDemandRevenue = () => Object.entries(freeKWByGen()).reduce((a, [g, kw]) => a + kw / 1000 * odRate(+g) * OD_UTIL, 0) * (S.block ? 0.5 : 1);
const uncontractedGPUs = () => Math.floor(Object.entries(freeKWByGen()).reduce((a, [g, kw]) => a + kw / chip(+g).kw, 0));
const campusSpotPay = () => Object.entries(freeKWByGen()).reduce((a, [g, kw]) => a + kw / 1000 * odRate(+g), 0) * 0.5 * spotMult() * 30;
```
`campusRevenue` becomes
```js
const campusRevenue = () => (S.p2 ? S.p2.contracts.filter((c) => c.status === "active").reduce((a, c) => a + c.fee, 0) + onDemandRevenue() : 0);
```
In `stepCampus`, add as the second line (right after the `S.p2.market == null` guard, before the county check): `S.funds += onDemandRevenue() * dt;`
In `renderContracts`, change the `$("p2rev")` line to
```js
  $("p2rev").textContent = `${money(campusRevenue())}/s (${money(onDemandRevenue())}/s of it on-demand)`;
```
- [ ] **Step 4: main.js (spot in both phases; shared spot clock)**
a) `const spotOpen = () => S.phase === 1 && S.gen >= 2;` becomes `const spotOpen = () => S.gen >= 2;`
b) `const blockSize = () => Math.floor(workingGPUs() / 2);` becomes
```js
const blockSize = () => Math.floor((S.phase === 2 ? uncontractedGPUs() : workingGPUs()) / 2);
const spotPay = () => (S.phase === 2 ? campusSpotPay() : blockSize() * avgPerf() * spotRate() * 30);
```
c) In `sellSpot()`, change `const n = blockSize(), pay = n * avgPerf() * spotRate() * 30;` to `const n = blockSize(), pay = spotPay();`.
d) Move these three lines from the top of `stepPhase1()` into `step()`, right after the `releaseChip` line:
```js
  S.spotWalk = Math.max(-0.4, Math.min(0.4, S.spotWalk + (Math.random() - 0.5) * 0.08 * dt));
  if (Math.floor(S.t) !== Math.floor(S.t - dt)) { S.spotHist.push(spotMult()); if (S.spotHist.length > 90) S.spotHist.shift(); }
  if (S.block && S.t >= S.block.until) S.block = null;
```
e) In `render()`'s spot block, change the `$("spotNow").textContent = ...` line to
```js
      $("spotNow").textContent = S.phase === 2 ? `${money(OD_RATE * m)}/MW-s for ${newest().name}s (${m.toFixed(1)}x on-demand)`
        : `${money(spotRate() * 60)} per GPU-minute (${m.toFixed(1)}x query revenue)`;
```
and in the `$("spot").textContent = ...` line change `${money(blockSize() * avgPerf() * spotRate() * 30)}` to `${money(spotPay())}`.
f) In `realityCheck()`, change `let line = \`${REALITY[S.checks % REALITY.length]} Hype -${loss}.\`, seized = 0;` to
```js
  const pool = S.done.depr6 ? [...REALITY, "A short-seller read your depreciation footnote."] : REALITY;
  let line = `${pool[S.checks % pool.length]} Hype -${loss}.`, seized = 0;
```
- [ ] **Step 5: projects.js** — before the closing `];`, add
```js
  { id: "depr6", phase: 2, title: "Extend the depreciation schedule to 6 years", cost: 0,
    desc: "Reported earnings jump. The GPUs are exactly as old as they were. +20 hype.",
    when: () => Object.keys(S.fleet).some((g) => +g < S.chipIdx && S.fleet[g] > 0), buy: () => { S.hype += 20; } },
```
- [ ] **Step 6: Run everything** — expected: `tests/test_ondemand.py` passes; Task 1 tests still pass. Commit `feat: on-demand revenue by chip generation, spot in phase 2, depreciation project`; push.

---

### Task 3: Contracts are served from GPUs of a minimum generation

**Files:** Modify `campus.js`; Rewrite `tests/test_contracts.py`

**Interfaces:**
- Consumes: `freeKWByGen()` (Task 2), `capKW`, `leasedKW`, `campusKWAt` (Task 1).
- Produces: offer/contract field `minGen`; `genName(g)`; `eligibleFreeMW(minGen)`; `roomMWAt(at)`; `forecast(o) -> {ok, kind: "hand"|"buy"|"space", text, buy?, short?}`; contract field `activeAt`.

- [ ] **Step 1: Rewrite the contract tests** — replace `tests/test_contracts.py` with
```python
import pytest

from conftest import READY, run


def campus(game, county="strong", **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click(f"button[data-county='{county}']")
    pg.evaluate("() => { S.rival.next = 1e9; S.nextChip = 1e9; }")
    return pg


def no_gpus(pg):
    """Empty fleet: nothing on hand, no on-demand income, so contract money is isolated."""
    pg.evaluate("() => { S.fleet = {}; S.gpus = 0; render(); }")


def first_offer(pg):
    return pg.evaluate("() => S.p2.offers[0]")


def sign_first(pg):
    o = first_offer(pg)
    pg.click(f"button[data-accept='{o['id']}']")
    return o


def test_first_offer_is_your_old_lab_and_any_gpus_will_do(game):
    pg = campus(game)
    o = first_offer(pg)
    assert o["who"].startswith("Your old lab") and o["mw"] == 30 and o["minGen"] == 0
    assert "30 MW of any GPUs on hand" in pg.inner_text("#offers")


def test_sign_pays_upfront_and_adds_backlog(game):
    pg = campus(game)
    funds = pg.evaluate("() => S.funds")
    o = sign_first(pg)
    assert pg.evaluate("() => S.funds") == pytest.approx(funds + o["upfront"])
    assert pg.evaluate("() => backlogMW()") == 30
    assert o["upfront"] == 30 * o["term"] * 550


def test_forecast_hand_then_buy_then_space(game):
    pg = campus(game)
    assert "on hand" in pg.inner_text("#offers")
    no_gpus(pg)
    assert "Covered if you buy 30 MW" in pg.inner_text("#offers")
    pg.evaluate("() => { S.leases = {rack: 1}; S.leaseCool = {rack: {0: 1}}; render(); }")
    assert "Short 30 MW of space: lease or build" in pg.inner_text("#offers")


def test_delivered_contract_pays_fee(game):
    pg = campus(game)
    o = sign_first(pg)
    pg.evaluate(f"() => {{ S.t = {o['start']} - 1; }}")
    run(pg, 1)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "active"
    earned = pg.evaluate("() => S.p2.earned")
    run(pg, 10)
    assert pg.evaluate("() => S.p2.earned") == pytest.approx(earned + 10 * 30 * 275, rel=1e-6)
    assert pg.inner_text("#gpuCount") == "30 MW"


def test_min_gen_respected(game):
    pg = campus(game)
    pg.evaluate("""() => { S.chipIdx = 5; S.p2.offers = []; makeOffer(); const o = S.p2.offers[0];
      o.minGen = 5; o.mw = 30; o.start = S.t + 5; render(); }""")
    assert "Covered if you buy 30 MW of P6s" in pg.inner_text("#offers")
    pg.evaluate("() => acceptOffer(S.p2.offers[0].id)")
    run(pg, 6)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "late"


def test_late_is_free_for_the_first_minute_then_costs(game):
    pg = campus(game)
    no_gpus(pg)
    o = sign_first(pg)
    pg.evaluate(f"() => {{ S.t = {o['start']}; }}")
    run(pg, 1)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "late"
    funds = pg.evaluate("() => S.funds")
    run(pg, 59)
    assert pg.evaluate("() => S.funds") == pytest.approx(funds)
    run(pg, 10)
    assert pg.evaluate("() => S.funds") < funds
    assert "LATE" in pg.inner_text("#contracts")


def test_warning_then_default(game):
    pg = campus(game)
    no_gpus(pg)
    o = sign_first(pg)
    pg.evaluate(f"() => {{ S.t = {o['start']}; }}")
    run(pg, 121)
    assert "walks in 60s" in pg.inner_text("#console")
    run(pg, 60)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "defaulted"
    assert pg.evaluate("() => S.nextDraw - S.t") >= 119


def test_default_is_never_profitable(game):
    pg = campus(game)
    no_gpus(pg)
    funds = pg.evaluate("() => S.funds")
    o = sign_first(pg)
    pg.evaluate(f"() => {{ S.t = {o['start']}; }}")
    run(pg, 181)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "defaulted"
    assert pg.evaluate("() => S.funds") < funds


def test_renegotiate_once(game):
    pg = campus(game)
    o = sign_first(pg)
    hype = pg.evaluate("() => S.hype")
    cid = pg.evaluate("() => S.p2.contracts[0].id")
    pg.click(f"button[data-reneg='{cid}']")
    c = pg.evaluate("() => S.p2.contracts[0]")
    assert c["start"] == o["start"] + 120 and c["reneg"] is True
    assert pg.evaluate("() => S.hype") == pytest.approx(hype - 5)
    assert not pg.is_visible(f"button[data-reneg='{cid}']")


def test_push_date_when_late_counts_from_now(game):
    pg = campus(game)
    no_gpus(pg)
    o = sign_first(pg)
    pg.evaluate(f"() => {{ S.t = {o['start']} + 150; }}")
    run(pg, 1)
    cid = pg.evaluate("() => S.p2.contracts[0].id")
    now = pg.evaluate("() => S.t")
    pg.click(f"button[data-reneg='{cid}']")
    c = pg.evaluate("() => S.p2.contracts[0]")
    assert c["status"] == "waiting" and c["start"] == now + 120 and c["end"] - c["start"] == o["term"]


def test_decline_is_free_and_offers_last_at_least_45s(game):
    pg = campus(game)
    fresh = pg.evaluate("() => { makeOffer(); render(); return S.p2.offers[S.p2.offers.length - 1]; }")
    assert fresh["expires"] - pg.evaluate("() => S.t") >= 45
    funds, hype = pg.evaluate("() => [S.funds, S.hype]")
    pg.click(f"button[data-decline='{fresh['id']}']")
    assert pg.evaluate("() => [S.funds, S.hype]") == [funds, hype]


def test_allocation_in_signing_order(game):
    pg = campus(game)
    pg.evaluate("""() => { S.fleet = {3: 18300}; S.gpus = 18300; S.p2.offers = [];
      for (let i = 0; i < 2; i++) { makeOffer(); const o = S.p2.offers[S.p2.offers.length - 1];
        o.mw = 30; o.minGen = 0; o.start = S.t + 5; acceptOffer(o.id); } }""")
    run(pg, 6)
    assert pg.evaluate("() => S.p2.contracts.map((c) => c.status)") == ["active", "late"]
    assert pg.evaluate("() => deliveredMW()") == 30


def test_sign_survives_rerender(game):
    pg = campus(game)
    o = first_offer(pg)
    pg.evaluate("() => { for (let i = 0; i < 5; i++) render(); }")
    pg.click(f"button[data-accept='{o['id']}']")
    assert pg.evaluate("() => S.p2.contracts.length") == 1


def test_big_step_defaults_cleanly(game):
    pg = campus(game)
    no_gpus(pg)
    o = sign_first(pg)
    pg.evaluate(f"() => {{ S.t = {o['start']}; step(1); step(200); render(); }}")
    assert pg.evaluate("() => S.p2.contracts[0].status") == "defaulted"
    assert pg.evaluate("() => Number.isFinite(S.funds) && Number.isFinite(S.hype)")


def test_reload_mid_campus(game):
    pg = campus(game)
    sign_first(pg)
    pg.click("#buildHall")
    pg.click("#requestQueue")
    before = pg.evaluate("() => JSON.stringify(S.p2)")
    pg.evaluate("() => save()")
    pg.reload()
    assert pg.evaluate("() => JSON.stringify(S.p2)") == before


def test_debt_sized_on_backlog(game):
    pg = campus(game, hype=80)
    pg.evaluate("() => { S.p2.offers = []; makeOffer(); const o = S.p2.offers[0]; o.mw = 100; acceptOffer(o.id); }")
    assert pg.evaluate("() => drawSize()") == pytest.approx(0.8 * 100 * 300000)
    assert pg.is_visible("#draw")
```
- [ ] **Step 2: Run to verify they fail** — expected: FAIL (`minGen` undefined; forecast text differs).

- [ ] **Step 3: campus.js** — replace `committedAt` and `forecast` (from `const committedAt = ...` through the end of `function forecast`) with
```js
const genName = (g) => (g <= 0 ? "any GPUs" : `${chip(g).name}+ GPUs`);
const eligibleFreeMW = (minGen) => Object.entries(freeKWByGen()).reduce((a, [g, kw]) => a + (+g >= minGen ? kw : 0), 0) / 1000;
const roomMWAt = (at) => Math.max(0, (leasedKW() + campusKWAt(at) - usedKW()) / 1000);
const pendingBefore = (o) => S.p2.contracts
  .filter((c) => (c.status === "waiting" || c.status === "late") && c.id !== o.id && c.start < o.start + o.term).reduce((a, c) => a + c.mw, 0);

// Can you deliver this? From GPUs on hand, by buying GPUs into space you'll have, or not without more space.
function forecast(o) {
  const eligible = eligibleFreeMW(o.minGen), pending = pendingBefore(o), onHand = eligible - pending;
  if (onHand >= o.mw) return { ok: true, kind: "hand", text: `✓ ${fmt(o.mw)} MW of ${genName(o.minGen)} on hand.` };
  const buy = o.mw - Math.max(0, onHand);
  const room = roomMWAt(o.start) - Math.max(0, pending - eligible);
  if (room >= buy) {
    return { ok: true, kind: "buy", buy, text: `✓ Covered if you buy ${fmt(buy)} MW of ${newest().name}s ` +
      `(≈${money(buy * 1000 / newest().kw * gpuPrice())}); you have the space.` };
  }
  const short = buy - Math.max(0, room);
  return { ok: false, kind: "space", short, text: `Short ${fmt(short)} MW of space: lease or build.` };
}
```
In `makeOffer`, replace the `const scale = ...` line with
```js
  const scale = Math.max(20, 0.3 * (usedKW() / 1000 + 40));
  const minGen = first ? 0 : Math.max(0, S.chipIdx - (Math.random() < 0.4 ? 1 : 0));   // labs want current chips
```
and in the `S.p2.offers.push({ ... })` object add `minGen, ` right after `mw, `. In `acceptOffer`, add `minGen: o.minGen, ` right after `mw: o.mw, ` in the pushed contract. In `stepContracts`, replace
```js
    const free = energizedAt() - deliveredMW();
    if (free >= c.mw) {
```
with
```js
    const free = eligibleFreeMW(c.minGen || 0);
    if (free >= c.mw) {
      c.activeAt = S.t;
```
and in the late message replace `(${forecast(c).why})` with `of ${genName(c.minGen || 0)} (${roomMWAt(S.t) > 0 ? "buy GPUs" : "lease or build space"})`.
In `renderContracts`: change the `$("delivered")` line to
```js
  $("delivered").textContent = `${fmt(deliveredMW())} of ${fmt(usedKW() / 1000)} MW of GPUs`;
```
In the offers loop, change the `.what` line to
```js
    d.querySelector(".what").textContent = `${o.who}: ${fmt(o.mw)} MW of ${genName(o.minGen)} for ${time(o.term)}, starts in ${time(o.start - S.t)}. ${money(o.fee)}/s while delivered.`;
```
and change the `fc.textContent = ...` statement to
```js
    fc.textContent = `${f.text} Offer good for ${Math.ceil(o.expires - S.t)}s.`;
```
In the contracts loop's waiting branch, change the `st.textContent = ...` line to
```js
      st.textContent = `${who}: ${fmt(c.mw)} MW, starts in ${time(c.start - S.t)}. ` +
        (f.kind === "hand" ? "✓ covered" : f.ok ? `✓ buy ${fmt(f.buy)} MW of GPUs` : f.text);
```
In `acceptOffer`'s `say`, `forecast({ ...o, id: \`c${n}\` }).ok` stays valid.
Remove `const committedAt` and any remaining reference to `f.why`.

- [ ] **Step 4: Run everything** — expected: all pass. Commit `feat: contracts are served from GPUs of a minimum chip generation`; push.

---

### Task 4: Raises continue in phase 2, gated on backlog

**Files:** Modify `campus.js`, `main.js`; Create `tests/test_rounds_p2.py`

**Interfaces:** Produces `ROUNDS2`, `campusRound()`, `raiseCampus()`; `S.p2.round`.

- [ ] **Step 1: Failing tests** — `tests/test_rounds_p2.py`:
```python
from conftest import READY


def campus(game):
    pg = game({**READY, "debt": 0, "hype": 80})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    return pg


def test_series_e_needs_backlog(game):
    pg = campus(game)
    assert "Series E needs 100 MW of signed backlog" in pg.inner_text("#raise")
    assert pg.is_disabled("#raise")
    pg.evaluate("() => { S.p2.offers = []; makeOffer(); const o = S.p2.offers[0]; o.mw = 100; acceptOffer(o.id); render(); }")
    funds = pg.evaluate("() => S.funds")
    pg.click("#raise")
    assert pg.evaluate("() => S.funds") - funds == 250e6
    assert pg.evaluate("() => S.p2.round") == 1
    assert "Series F" in pg.inner_text("#raise")
```
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: campus.js** — after the `CUSTOMERS` array add
```js
const ROUNDS2 = [
  { name: "Series E", backlog: 100, amount: 250e6 }, { name: "Series F", backlog: 300, amount: 800e6 },
  { name: "Series G", backlog: 700, amount: 2e9 },
];
const campusRound = () => ROUNDS2[S.p2.round || 0];
function raiseCampus() {
  const r = campusRound();
  if (!r || backlogMW() < r.backlog || S.hype < HYPE_TO_RAISE) return;
  S.funds += r.amount; S.p2.round = (S.p2.round || 0) + 1; S.hype = Math.max(10, S.hype - 20); milestone(`raised ${r.name}`);
  say(`Closed the ${r.name}: ${money(r.amount)}. The deck said “backlog” eleven times. Most of the backlog is labs funded by Parallax.`);
}
```
- [ ] **Step 4: main.js** — at the top of `raise()` add `if (S.phase === 2) return raiseCampus();`. In `render()`, replace the raise block
```js
  const r = ROUNDS[S.round];
  $("raise").hidden = !r || S.gen < r.gen;
  if (r) {
    $("raise").textContent = S.hype >= HYPE_TO_RAISE ? `Raise the ${r.name}: ${money(r.amount)}` : `${r.name} needs hype ${HYPE_TO_RAISE}+`;
    $("raise").disabled = S.hype < HYPE_TO_RAISE;
  }
```
with
```js
  const r = S.phase === 2 ? campusRound() : ROUNDS[S.round];
  const gated = !!r && (S.phase === 2 ? backlogMW() < r.backlog : S.gen < r.gen);
  $("raise").hidden = !r || (S.phase === 1 && gated);
  if (r) {
    $("raise").textContent = S.phase === 2 && gated ? `${r.name} needs ${fmt(r.backlog)} MW of signed backlog (have ${fmt(backlogMW())})`
      : S.hype >= HYPE_TO_RAISE ? `Raise the ${r.name}: ${money(r.amount)}` : `${r.name} needs hype ${HYPE_TO_RAISE}+`;
    $("raise").disabled = gated || S.hype < HYPE_TO_RAISE;
  }
```
and in the hype-note block replace `const nr = ROUNDS[S.round], notes = [];` and the `if (!nr) ... else ...` chain with
```js
    const nr = S.phase === 2 ? campusRound() : ROUNDS[S.round], notes = [];
    if (S.phase === 2) notes.push(nr ? `${nr.name} at ${HYPE_TO_RAISE} with ${fmt(nr.backlog)} MW backlog` : "all rounds raised");
    else if (!nr) notes.push(S.ended ? "all rounds raised" : S.gen < 7 ? "all rounds raised; next: Gen 7, then break ground" : usedKW() < GROUND_KW ? `all rounds raised; next: grow to ${fmt(GROUND_KW / 1000)} MW, then break ground` : "all rounds raised; next: break ground");
    else if (S.gen < nr.gen) notes.push(`${nr.name} needs Gen ${nr.gen}`);
    else notes.push(`${nr.name} at ${HYPE_TO_RAISE}`);
```
- [ ] **Step 5: Run everything; commit `feat: Series E-G in phase 2, gated on signed backlog`; push.**

---

### Task 5: Simulator for the reworked loop; tune; play-log columns

**Files:** Rewrite `tools/sim_p2.py`; Modify `tools/read_log.py`

- [ ] **Step 1: Rewrite the sim** to model: fleet MW by chip generation (start: 110 MW of gen 3, chips every 300 s), leased space (start 220 MW) plus a finite market (150 MW, +10 MW/min, lease halls of 20 MW at `LEASE_PER_MW`), campus halls (shell $10M, 90 s) + turbines + grid queue, GPU purchases at `500 × 1.6^g / 1.4^g` $ per kW, Parallax credits $20M / 90 s (GPUs only), contracts with `minGen`, on-demand by generation (`OD_*`), contract fees/upfronts, raises E–G on backlog, inherited debt at the refinanced rate. Greedy player: signs offers whose forecast is on-hand or buyable with money on hand; buys GPUs for contracts starting within 90 s; leases space when room < next need and the market has MW; builds campus halls + turbines when the market is under 40 MW; joins the grid queue whenever idle; raises when allowed. Report per-minute fleet MW, delivered MW, backlog, on-demand $/s, funds; defaults; idle stretches > 90 s.
- [ ] **Step 2: Run** `python3 tools/sim_p2.py --county all` and `--debt 500e6`. Target: fleet MW rising every 5-minute window, 600–1,500 MW at minute 25, 0 defaults, no idle stretch > 90 s, campus built at some point in every county (leased market must run out). Tune `UPFRONT_RATE`, `FEE_RATE`, `OD_RATE`, `MARKET_START_MW`/`MARKET_REGROW` in both the sim and `campus.js`; update any test that hard-codes a tuned value.
- [ ] **Step 3: read_log.py** — in the phase 2 snapshot table, print `fleetMW`, `leasedMW`, `market` instead of `energizedMW` where present.
- [ ] **Step 4: Run all tests; commit `feat: phase 2 sim for GPUs-in-space; tuned constants`; push.**
