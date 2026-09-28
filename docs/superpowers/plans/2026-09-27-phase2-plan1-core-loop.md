# Phase 2, Plan 1: restructure + campus core loop (contracts, halls, power)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move phase 1 into Paperclips-style script files with no behavior change, then add a playable phase 2 core loop: pick a county, sign capacity contracts, build halls and power to deliver them.

**Architecture:** Plain classic `<script>` files sharing top-level globals (`S`, `step`, `render`, ...), loaded in order by `index.html`, no build step. Phase 2 lives in `campus.js` with its state in `S.p2`; `S.phase` picks which step/render runs. Tests are pytest + Playwright driving the real page in a `?test` mode where the clock only moves when the test calls `step()`.

**Tech Stack:** HTML/CSS/vanilla JS; Python 3 + pytest + Playwright (Chrome channel) via `uv run --with`; Python simulator in `tools/`.

**Spec:** `docs/superpowers/specs/2026-09-27-phase2-campus-design.md` (read it first). This is plan 1 of 4: plan 2 = water, land and community; plan 3 = the model's proposals, autonomy and ending; plan 4 = cap table/IPO and pacing.

## Global Constraints

- No build step; the page is served as static files (`python3 -m http.server 8777 --bind 127.0.0.1` from the repo root).
- Scripts load in this order: `globals.js`, `projects.js`, `campus.js`, `main.js` (main calls `start()` last).
- Phase 2 state lives only in `S.p2`; phase 1 code never reads `S.p2` (it may call campus functions).
- Save key stays `more-with-more-v1`; play log key stays `more-with-more-log-v1`. Old saves must keep loading.
- Every constraint that blocks the player is named on screen with what to do about it.
- Contract deadlines are low-stress: forecast on every offer; first 60 s late costs only the lost fee; one renegotiation (+2 min, −5 hype) per contract; default only after 180 s late, with a warning 60 s before; offers last ≥ 45 s; declining is free.
- Copy style: plain sentences, no em dashes in new UI text, dry jokes from an infra person's point of view.
- Python tooling uses `uv`, never bare `pip`.
- Run tests with: `cd /Users/alexa/workspace/paloma-labs/more-with-more && uv run --with pytest --with playwright pytest -q` (uses installed Google Chrome; no `playwright install` needed).

## Review Focus

1. **A save from before this change that already broke ground** (`ended: true`, no `phase`) should load with a working "start phase 2" button, not a dead end. Test: Task 3 `test_old_ended_save_can_continue`.
2. **Refreshing mid-phase-2** with halls under construction, a queue request and signed contracts should resume exactly (timers are absolute game times). Test: Task 5 `test_reload_mid_campus`.
3. **Clicking an offer's Sign button while the page re-renders every 100 ms** must land (lists rebuild only when their key changes, like the phase 1 projects fix). Test: Task 5 `test_sign_survives_rerender`.
4. **Two contracts starting the same second competing for the same MW**: the earlier-signed one is delivered, the other is late; nothing double-counts. Test: Task 5 `test_allocation_in_signing_order`.
5. **A big time step** (tab backgrounded, `dt` capped at 1 s but a test or future change could pass more) must still apply late costs and default correctly without NaN. Test: Task 5 `test_big_step_defaults_cleanly`.

---

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | Markup + CSS; loads the four scripts. |
| `globals.js` | Constants, `fresh()`, `S`, formatting, console (`say`), play log (`track`, `milestone`, `snap`, `flush`), `save`/`load`. |
| `projects.js` | `PROJECTS` (phase 1 now; later plans add phase 2 ones with `phase: 2`). |
| `campus.js` | Phase 2: counties, legacy colo, halls, power, contracts, `stepCampus`, `renderCampus`, `wireCampus`. |
| `main.js` | Phase 1 model/actions/render, shared step/render, wiring, `start()`. |
| `tests/conftest.py` | Static server, browser, `game()` helper, seeded RNG, `run()` helper. |
| `tests/test_phase1.py` | Golden phase 1 behavior (must pass before and after the restructure). |
| `tests/test_structure.py` | File layout, globals exposed, test mode. |
| `tests/test_handoff.py` | Break ground → county pick → campus. |
| `tests/test_power.py` | Halls, power sources, queue, land, "Limited by". |
| `tests/test_contracts.py` | Offers, forecast, signing, late/renegotiate/default, allocation, debt sizing. |
| `tools/sim_p2.py` | Greedy-player simulator for the phase 2 core loop. |
| `tools/read_log.py` | Learns phase 2 events and snapshot fields. |

---

### Task 1: Test harness + golden phase 1 tests

**Files:**
- Create: `tests/conftest.py`, `tests/test_phase1.py`

**Interfaces:**
- Produces: fixtures `server` (base URL str), `page` (Playwright page, asserts no page errors at teardown), `game(state: dict | None = None, test: bool = True) -> page`; helper `run(page, secs: int, dt: float = 1)`; constants `MID`, `READY` (phase 1 save dicts).

- [ ] **Step 1: Write the harness**

`tests/conftest.py`:
```python
import functools, http.server, json, pathlib, socketserver, threading

import pytest
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]

# Deterministic Math.random for the page (mulberry32).
SEEDED_RNG = """(() => { let a = 12345; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();"""

# A mid-game phase 1 save: Gen 6, all rounds raised, one data hall, 20k P4s.
MID = {"leases": {"rack": 3, "cage": 1, "row": 4, "hall": 1},
       "leaseCool": {"rack": {"3": 3}, "cage": {"3": 1}, "row": {"3": 4}, "hall": {"3": 1}},
       "funds": 2.5e8, "tier": 3, "gen": 6, "round": 6, "cooling": 5, "done": {"dynprice": True},
       "chipIdx": 3, "nextChip": 99999, "t": 1000, "fleet": {"3": 20000}, "gpus": 20000, "split": 95,
       "hype": 80, "rival": {"px": 40, "prev": 40, "next": 99999, "n": 0}, "logV2": True, "coolingV2": True}
# Ready to break ground: Gen 7 and 40k P4s (2.744 kW each, ~110 MW).
READY = {**MID, "gen": 7, "fleet": {"3": 40000}, "gpus": 40000}


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@pytest.fixture(scope="session")
def server():
    httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/"
    httpd.shutdown()


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True)
        yield b
        b.close()


@pytest.fixture
def page(browser):
    ctx = browser.new_context()
    pg = ctx.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    yield pg
    ctx.close()
    assert not pg.errors, pg.errors


@pytest.fixture
def game(page, server):
    def open_game(state=None, test=True):
        js = SEEDED_RNG
        if state is not None:
            # Seed once per tab so a reload keeps whatever the game saved.
            js += ("if (!sessionStorage.seeded) { sessionStorage.seeded = 1; "
                   f"localStorage.setItem('more-with-more-v1', {json.dumps(json.dumps(state))}); }}")
        page.add_init_script(js)
        page.goto(server + ("?test" if test else ""))
        return page
    return open_game


def run(page, secs, dt=1):
    """Advance game time by secs in steps of dt (test mode only), then render."""
    page.evaluate(f"() => {{ for (let i = 0; i < {secs}; i++) step({dt}); render(); }}")
```

- [ ] **Step 2: Write golden phase 1 tests (DOM only, so they run on today's single-file game)**

`tests/test_phase1.py`:
```python
from conftest import MID, READY


def test_fresh_start(game):
    pg = game(test=False)
    assert pg.inner_text("#gpuCount") == "0"
    assert pg.is_visible("#answer")
    assert "Nothing yet. Train a model." in pg.inner_text("#projects")
    assert "A model with no name" in pg.inner_text("#console")


def test_mid_game_panels(game):
    pg = game(MID, test=False)
    assert pg.inner_text("#gpuCount") == "20,000"
    assert len(pg.query_selector_all("#leases button")) == 5
    assert pg.inner_text("#cooling") == "Two-phase immersion, 200 kW/rack for new leases"
    assert "next: Gen 7, then break ground" in pg.inner_text("#hypeNote")
    ground = pg.query_selector("button[data-id='ground']")
    assert "Still need to: train Gen 7" in ground.inner_text()
    assert not ground.is_enabled()


def test_buy_ten(game):
    pg = game(MID, test=False)
    pg.click("button[data-buy='10']")
    assert pg.inner_text("#gpuCount") == "20,010"


def test_ground_ready(game):
    pg = game(READY, test=False)
    ground = pg.query_selector("button[data-id='ground']")
    assert "Ready." in ground.inner_text()
    assert ground.is_enabled()


def test_reload_keeps_state(game):
    pg = game(MID, test=False)
    pg.click("button[data-buy='10']")
    pg.reload()
    assert pg.inner_text("#gpuCount") == "20,010"
```

- [ ] **Step 3: Run the tests against today's code**

Run: `cd /Users/alexa/workspace/paloma-labs/more-with-more && uv run --with pytest --with playwright pytest -q tests/test_phase1.py`
Expected: `5 passed`. (These pin current behavior; if one fails, the test is wrong, not the game: fix the expectation to match what the page shows today.)

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: Playwright harness and golden phase 1 tests"
```

---

### Task 2: Split phase 1 into globals.js, projects.js, main.js (no behavior change) + test mode

**Files:**
- Create: `globals.js`, `projects.js`, `main.js`, `tools/split_scripts.py` (one-off, deleted after use), `tests/test_structure.py`
- Modify: `index.html` (inline script replaced by script tags)

**Interfaces:**
- Consumes: Task 1 fixtures.
- Produces: top-level globals on the page: `S` (let), `fresh()`, `step(dt)`, `render()`, `save()`, `load()`, `PROJECTS`, `usedKW()`, `say()`, `track()`, `milestone()`, `fmt()`, `money()`, `time()`, `$()`. `?test` in the URL disables all timers (tick loop, autosave, log flush).

- [ ] **Step 1: Write the failing structure tests**

`tests/test_structure.py`:
```python
import pathlib, re

from conftest import MID, run

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPTS = ["globals.js", "projects.js", "main.js"]


def test_scripts_load_in_order():
    html = (ROOT / "index.html").read_text()
    srcs = re.findall(r'<script src="([^"]+)"></script>', html)
    assert srcs == SCRIPTS
    assert not re.search(r"<script>\s*\S", html), "no inline script code left in index.html"


def test_globals_exposed(game):
    pg = game()
    kinds = pg.evaluate("() => [typeof S, typeof step, typeof render, typeof save, Array.isArray(PROJECTS)]")
    assert kinds == ["object", "function", "function", "function", True]


def test_test_mode_freezes_clock(game):
    pg = game(MID)
    t0 = pg.evaluate("() => S.t")
    pg.wait_for_timeout(400)
    assert pg.evaluate("() => S.t") == t0
    run(pg, 5)
    assert pg.evaluate("() => S.t") == t0 + 5


def test_training_advances_deterministically(game):
    pg = game(MID)
    before = pg.evaluate("() => S.progress")
    rate = pg.evaluate("() => trainingGPUs()")
    pg.evaluate("() => { S.spike = null; S.done.autockpt = true; }")
    run(pg, 1)
    assert abs(pg.evaluate("() => S.progress") - (before + rate)) < 1e-6 or pg.evaluate("() => S.gen") > 6
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --with pytest --with playwright pytest -q tests/test_structure.py`
Expected: FAIL (`srcs == []`, `typeof S` is `"undefined"` because everything is inside an IIFE).

- [ ] **Step 3: Write and run the one-off splitter**

`tools/split_scripts.py`:
```python
"""One-off: move index.html's inline IIFE into globals.js, projects.js and main.js by line range.
Anchors are checked first so this refuses to run on a different version of the file."""
from pathlib import Path

HEAD = {
    "globals.js": "// globals.js: constants, state, formatting, console, play log, save/load. Shared by both phases.\n",
    "projects.js": "// projects.js: every project in the game. Phase 2 projects carry phase: 2.\n",
    "main.js": "// main.js: phase 1 (the lab), the shared tick and render, wiring, and start().\n",
}
src = Path("index.html").read_text().split("\n")


def expect(n, text):
    assert text in src[n - 1], (n, src[n - 1])


for n, text in [(192, "<script>"), (193, "(() => {"), (194, "// ---------- constants"), (240, "let S = fresh();"),
                (242, "// ---------- model"), (312, "FAIL_RATE"), (314, "CP1252"), (325, "function say"),
                (327, "// ---------- projects"), (371, "];"), (373, "function endPhase"), (416, "];"),
                (417, "// ---------- play log"), (446, "}"), (448, "const POSTS"), (738, "}"),
                (740, "// ---------- formatting"), (752, "const $ ="), (754, "// ---------- render"), (1033, "}"),
                (1035, "SAVE_KEY"), (1037, "function load"), (1039, "function start"), (1064, "}"),
                (1066, "window.claude?.hot?.snapshot"), (1068, "})();"), (1069, "</script>")]:
    expect(n, text)


def L(a, b):
    return [l[2:] if l.startswith("  ") else l for l in src[a - 1:b]]   # drop the IIFE's 2-space indent


parts = {
    "globals.js": L(194, 240) + [""] + L(314, 325) + [""] + L(417, 446) + [""] + L(740, 752) + [""] + L(1035, 1037),
    "projects.js": L(327, 371),
    "main.js": L(242, 312) + [""] + L(373, 416) + [""] + L(448, 738) + [""] + L(754, 1033) + [""] + L(1039, 1064)
               + ["", "start({});"],
}
for name, lines in parts.items():
    Path(name).write_text(HEAD[name] + "\n".join(lines) + "\n")
html = src[:190] + ["", '<script src="globals.js"></script>', '<script src="projects.js"></script>',
                    '<script src="main.js"></script>', ""]
Path("index.html").write_text("\n".join(html))
print("split ok")
```

Run: `cd /Users/alexa/workspace/paloma-labs/more-with-more && python3 tools/split_scripts.py && rm tools/split_scripts.py`
Expected: `split ok`.

- [ ] **Step 4: Add test mode to main.js**

At the top of `main.js`, after the header comment, add:
```js
const TEST = new URLSearchParams(location.search).has("test");   // tests drive step() by hand: no timers
```
In `start()`, replace:
```js
  ensureRun(); track("session", { resumedAt: Math.round(S.t) }); setInterval(flush, 20000);
  wire();
  let last = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = Math.min((now - last) / 1000, 1); last = now;
    step(dt); render();
  }, 100);
  setInterval(save, 5000);
```
with:
```js
  ensureRun(); track("session", { resumedAt: Math.round(S.t) });
  wire();
  if (!TEST) {
    setInterval(flush, 20000);
    let last = performance.now();
    setInterval(() => {
      const now = performance.now(), dt = Math.min((now - last) / 1000, 1); last = now;
      step(dt); render();
    }, 100);
    setInterval(save, 5000);
  }
```

- [ ] **Step 5: Run all tests**

Run: `uv run --with pytest --with playwright pytest -q`
Expected: all pass (`9 passed`): the golden phase 1 tests prove no behavior change.

- [ ] **Step 6: Manual check in the real browser**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8777/globals.js` (expect `200`), then reload http://localhost:8777 in Firefox and confirm your save loads and the clock ticks.

- [ ] **Step 7: Commit**

```bash
git add index.html globals.js projects.js main.js tests/test_structure.py
git commit -m "refactor: split phase 1 into Paperclips-style script files; add ?test mode"
```

---

### Task 3: Phase switch and handoff (break ground → pick a county → campus)

**Files:**
- Create: `campus.js`, `tests/test_handoff.py`
- Modify: `index.html`, `globals.js` (`fresh()`, `snap()`), `projects.js` (`ground`), `main.js` (`endPhase`, `step`, `render`, `wire`, `realityCheck`, `spotOpen`, `rentOpen`), `tests/test_structure.py` (`SCRIPTS`)

**Interfaces:**
- Consumes: `S`, `usedKW()`, `say`, `track`, `milestone`, `fmt`, `money`, `$` (Task 2).
- Produces: `S.phase` (1|2), `S.p2` (object|null); `startCampus()`, `chooseCounty(id: string)`, `stepCampus(dt)`, `renderCampus()`, `wireCampus()`, `campusRevenue(): number` ($/s), `campusSnap(): object`, `countyOf()`, `COUNTIES`, `LEGACY_FEE`; `stepPhase1(dt)`, `renderPhase1()` in main.js.

- [ ] **Step 1: Write the failing tests**

`tests/test_handoff.py`:
```python
from conftest import READY, run


def break_ground(pg):
    pg.click("button[data-id='ground']")


def test_break_ground_starts_campus(game):
    pg = game(READY)
    legacy = pg.evaluate("() => Math.round(usedKW() / 1000)")
    break_ground(pg)
    assert pg.evaluate("() => S.phase") == 2
    assert pg.evaluate("() => S.p2.legacyMW") == legacy == 110
    assert pg.is_visible("#countyBox")
    for hidden in ["#computeBox", "#trainingBox", "#facilitiesBox", "#p1biz", "#ending"]:
        assert not pg.is_visible(hidden), hidden
    assert pg.is_visible("#hypeNum") and pg.is_visible("#funds")
    assert "We are an infrastructure company now." in pg.inner_text("#console")


def test_choose_county(game):
    pg = game(READY)
    break_ground(pg)
    pg.click("button[data-county='strong']")
    assert pg.evaluate("() => [S.p2.county, S.p2.grid]") == ["strong", 200]
    assert not pg.is_visible("#countyBox")
    assert pg.is_visible("#campusBox")
    assert pg.inner_text("#countyName") == "Strong grid, drought county"


def test_incentive_county_pays(game):
    pg = game(READY)
    break_ground(pg)
    before = pg.evaluate("() => S.funds")
    pg.click("button[data-county='incent']")
    assert pg.evaluate("() => S.funds") - before == 20e6


def test_legacy_colo_pays(game):
    pg = game({**READY, "debt": 0})
    break_ground(pg)
    pg.click("button[data-county='cheap']")
    before = pg.evaluate("() => S.funds")
    run(pg, 10)
    assert abs(pg.evaluate("() => S.funds") - before - 110 * 100 * 10) < 1


def test_old_ended_save_can_continue(game):
    pg = game({**READY, "ended": True, "endedAt": 1000})
    assert pg.is_visible("#ending")
    pg.click("#toCampus")
    assert pg.evaluate("() => S.phase") == 2
    assert pg.is_visible("#countyBox")


def test_phase2_survives_reload(game):
    pg = game(READY)
    break_ground(pg)
    pg.click("button[data-county='cheap']")
    pg.evaluate("() => save()")
    pg.reload()
    assert pg.evaluate("() => [S.phase, S.p2.county]") == [2, "cheap"]
    assert pg.is_visible("#campusBox")
```

In `tests/test_structure.py` change:
```python
SCRIPTS = ["globals.js", "projects.js", "main.js"]
```
to:
```python
SCRIPTS = ["globals.js", "projects.js", "campus.js", "main.js"]
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --with pytest --with playwright pytest -q tests/test_handoff.py tests/test_structure.py`
Expected: FAIL (`S.phase` undefined, `#countyBox` missing, script list mismatch).

- [ ] **Step 3: State and snapshot (globals.js)**

In `fresh()`, change:
```js
  t: 0, funds: 0, price: 0.25, gpus: 0, queue: 0, served: 0, gpuSeconds: 0,
```
to:
```js
  t: 0, funds: 0, price: 0.25, gpus: 0, queue: 0, served: 0, gpuSeconds: 0, phase: 1, p2: null,
```
In `snap()`, change the final `autoSwaps };` to:
```js
    autoSwaps, phase: S.phase, p2: S.phase === 2 && S.p2 && S.p2.county ? campusSnap() : null };
```

- [ ] **Step 4: Create campus.js**

```js
// campus.js: phase 2, "The Campus". You are an infrastructure company now: sell capacity to labs,
// then scramble to build it. Phase 2 state lives in S.p2; phase 1 state is read only at handoff.

const COUNTIES = [
  { id: "cheap", name: "Cheap land, weak grid",
    pitch: "3,000 acres for the price of a parking garage. The grid is two wires and a prayer.",
    gridMW: 50, acres: 3000, queueMW: 100, queueSecs: 300, cash: 0 },
  { id: "strong", name: "Strong grid, drought county",
    pitch: "A 200 MW connection on day one. The reservoir is a rumor.",
    gridMW: 200, acres: 1500, queueMW: 150, queueSecs: 200, cash: 0 },
  { id: "incent", name: "Big incentives, organized town",
    pitch: "$20M in tax incentives up front. The town already has a Facebook group about you.",
    gridMW: 100, acres: 2000, queueMW: 100, queueSecs: 240, cash: 20e6 },
];
const LEGACY_FEE = 100;   // $/s per MW of the phase 1 fleet left in leased colo

const freshP2 = () => ({
  county: null, legacyMW: 0, grid: 0, queue: null, queueN: 0, builds: [],
  offers: [], contracts: [], nextOffer: 0, offerN: 0, contractN: 0, earned: 0,
});
const countyOf = () => COUNTIES.find((c) => c.id === S.p2.county);

function startCampus() {
  if (S.phase === 2) return;
  S.phase = 2; S.p2 = freshP2(); S.p2.legacyMW = Math.round(usedKW() / 1000);
  milestone("phase 2: the campus");
  say("We are an infrastructure company now.");
  say(`Your ${fmt(S.p2.legacyMW)} MW of GPUs stay in the colo as legacy capacity. The model has opinions about which county is next.`);
}

function chooseCounty(id) {
  const c = COUNTIES.find((x) => x.id === id);
  if (!c || S.p2.county) return;
  S.p2.county = c.id; S.p2.grid = c.gridMW; S.funds += c.cash;
  milestone(`county: ${c.name}`); track("county", { id: c.id });
  say(`Bought land in the ${c.name.toLowerCase()} county. The model: “The river is underutilized.”`);
}

const campusRevenue = () => (S.p2 && S.p2.county ? S.p2.legacyMW * LEGACY_FEE : 0);

function stepCampus(dt) {
  if (!S.p2.county) return;
  S.funds += S.p2.legacyMW * LEGACY_FEE * dt;
}

const campusSnap = () => ({ county: S.p2.county, legacyMW: S.p2.legacyMW });

function renderCampus() {
  const p = S.p2;
  $("countLabel").textContent = "Legacy colo";
  $("gpuCount").textContent = `${fmt(p.legacyMW)} MW`;
  $("countyBox").hidden = !!p.county;
  $("campusBox").hidden = !p.county;
  if (!p.county) {
    if (!$("counties").childElementCount) {
      for (const c of COUNTIES) {
        const b = document.createElement("button");
        b.type = "button"; b.dataset.county = c.id;
        b.innerHTML = `<span class="t">${c.name}</span><span class="c">${c.pitch} Grid ${c.gridMW} MW, ` +
          `${c.acres.toLocaleString("en-US")} acres${c.cash ? `, ${money(c.cash)} in incentives` : ""}.</span>`;
        $("counties").appendChild(b);
      }
    }
    return;
  }
  $("countyName").textContent = countyOf().name;
  $("legacy").textContent = `${fmt(p.legacyMW)} MW, ${money(p.legacyMW * LEGACY_FEE)}/s`;
}

function wireCampus() {
  $("counties").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-county]");
    if (b) { chooseCounty(b.dataset.county); render(); }
  });
}
```

- [ ] **Step 5: Markup (index.html)**

a) Add `campus.js` before `main.js`:
```html
<script src="globals.js"></script>
<script src="projects.js"></script>
<script src="campus.js"></script>
<script src="main.js"></script>
```
b) Replace `<div class="count">GPUs: <span id="gpuCount">0</span></div>` with:
```html
  <div class="count"><span id="countLabel">GPUs</span>: <span id="gpuCount">0</span></div>
```
c) Replace the ending banner's last line `<div class="sub">Phase 2 (build your own campus: power, water, land, political capital) is not built yet.</div>` with:
```html
    <div class="btns"><button id="toCampus" type="button" class="primary">Break ground: start phase 2</button></div>
```
d) Wrap the Business price/demand lines (from `<div class="line">Price per query:` through `<div class="line">Revenue: ...</div>`) in `<div id="p1biz"> ... </div>`.
e) Give the three phase 1 sections ids: the `<div>` containing `<h3>Compute</h3>` becomes `<div id="computeBox">`, the one with `<h3>Training</h3>` becomes `<div id="trainingBox">`, the one with `<h3>Facilities</h3>` becomes `<div id="facilitiesBox">`.
f) Insert before `<div id="computeBox">`:
```html
      <div id="countyBox" hidden>
        <h3>Pick a county</h3>
        <div class="choices" id="counties"></div>
      </div>
```
g) Insert before `<div id="facilitiesBox">`:
```html
      <div id="campusBox" hidden>
        <h3>Campus</h3>
        <div class="line">County: <span id="countyName"></span></div>
        <div class="line">Legacy colo: <span id="legacy"></span></div>
      </div>
```
h) In the CSS, after the `#projects button:disabled .c` rule, add:
```css
  .choices { display: grid; gap: 6px; }
  .choices button { width: 100%; padding: 4px 8px; }
  .choices .t { display: block; }
  .choices .c { display: block; font-size: 12px; color: var(--muted); }
```

- [ ] **Step 6: Wire the phase switch into main.js**

a) `endPhase()` becomes:
```js
function endPhase() {
  S.ended = true; S.endedAt = S.t; milestone("broke ground (end of phase 1)");
  say(`Phase 1 took ${time(S.t)}. ${money(S.roundTrip)} went in a circle. Parallax is worth ${money(S.vendorCap)}.`);
  say("I could do more with more.");
  startCampus();
}
```
b) Split `step(dt)`. Replace the whole function with:
```js
function step(dt) {
  S.t += dt;                                   // keeps running after the ending: the empire hums on
  S.fatigue = Math.max(0, S.fatigue - dt / (S.done.keynote ? 30 : 60));
  if (S.gen >= 2 && S.t >= S.rival.next) rivalNews();
  if (S.phase === 1) stepPhase1(dt); else stepCampus(dt);
  S.hype = Math.max(5, S.hype - S.hype * 0.002 * (S.done.modelcard ? 0.75 : 1) * dt);
  if (froth() > 0 && Math.random() < dt * (froth() / 100) / 30) realityCheck();   // ~2/min at hype 200
  S.funds -= S.debt * INTEREST * dt;
  if (db && S.t - lastSnapT >= 30) { lastSnapT = S.t; track("snap", snap()); }
}

function stepPhase1(dt) {
  if (S.t >= S.nextChip) releaseChip();
  S.spotWalk = Math.max(-0.4, Math.min(0.4, S.spotWalk + (Math.random() - 0.5) * 0.08 * dt));
  if (Math.floor(S.t) !== Math.floor(S.t - dt)) { S.spotHist.push(spotMult()); if (S.spotHist.length > 90) S.spotHist.shift(); }
  if (S.block && S.t >= S.block.until) S.block = null;
  if (S.done.dynprice) {
    const cap = servingGPUs();
    if (cap > 0) S.price = Math.max(0.0001, 0.25 * Math.pow(demandAt(0.25) / cap, 1 / 1.3));
  }
  // hardware fails; failed GPUs sit dead until swapped; RMA'd ones come back after a minute
  const exp = workingGPUs() * FAIL_RATE * dt; let nf = Math.floor(exp); if (Math.random() < exp - nf) nf++;
  if (nf > 0) {
    S.failed += Math.min(nf, workingGPUs()); S.fails += nf;
    if (S.fails === nf) say("Error 79: GPU has fallen off the bus. Swap it out under Compute.");
  }
  if (S.done.hands && S.failed > 0) swapFailed();
  while (S.rma.length && S.rma[0][1] <= S.t) {
    const [n] = S.rma.shift();
    S.vendorCap += n * gpuPrice() * 25;
    if (!S.hints.rma2) { S.hints.rma2 = true; say("Replacements arrived. Parallax counted them as new sales."); }
  }
  S.queue = Math.min(S.queue + demand() * dt, Math.max(50, demand() * 30)); // people stop waiting after ~30s
  const serve = Math.min(S.queue, servingGPUs() * dt);
  S.queue -= serve; S.served += serve; S.funds += serve * S.price;
  const trained = trainingGPUs() * dt;
  S.progress += trained; S.gpuSeconds += trained + serve;
  const ckptEvery = needFor(S.gen + 1) / 10;
  S.lastCkpt = Math.max(S.lastCkpt, Math.floor(S.progress / ckptEvery) * ckptEvery);
  if (S.spike && S.t >= S.spike.until) {
    S.spike = null; S.progress = Math.max(0, S.lastCkpt - 2 * ckptEvery); S.lastCkpt = S.progress; S.hype = Math.max(5, S.hype - 8); track("diverged");
    say("The run diverged. Restarted from an older checkpoint. Someone posted the loss curve.");
  } else if (!S.spike && trained > 0 && Math.random() < dt / 90) {
    S.spikes += 1;
    track("spike", { auto: !!S.done.autockpt });
    if (S.done.autockpt) { S.progress = S.lastCkpt; say("Loss spike. Auto-restarted from the last checkpoint."); }
    else { S.spike = { until: S.t + 20 }; say(`Loss spike at step ${Math.floor(S.progress).toLocaleString("en-US")}: loss ${(1.8 + Math.random()).toFixed(2)} → NaN. Roll back to a checkpoint.`); }
  }
  if (S.progress >= needFor(S.gen + 1)) {
    S.progress = 0; S.lastCkpt = 0; S.gen += 1; milestone(`Gen ${S.gen}`);
    S.hype += 20 + 5 * S.gen;
    say(`Gen ${S.gen}: “${MODEL_LINES[Math.min(S.gen, MODEL_LINES.length - 1)]}”`);
  }
  hints();
}
```
c) Phase-gate the phase 1 markets: `const spotOpen = () => S.gen >= 2;` becomes `const spotOpen = () => S.phase === 1 && S.gen >= 2;` and `const rentOpen = () => S.gen >= 5;` becomes `const rentOpen = () => S.phase === 1 && S.gen >= 5;`.
d) In `realityCheck()`, replace
```js
  const rev = Math.min(servingGPUs(), demand()) * S.price, interest = S.debt * INTEREST;
```
with
```js
  const rev = S.phase === 1 ? Math.min(servingGPUs(), demand()) * S.price : campusRevenue();
```
and change `if (S.debt > 0 && severity > 0.5) {` to `if (S.debt > 0 && severity > 0.5 && S.phase === 1) {` (phase 2 margin calls come with plan 4's debt rework; the draw freeze below still applies), then add right after that block's closing `}`:
```js
  else if (S.debt > 0 && severity > 0.5) { S.nextDraw = Math.max(S.nextDraw, S.t + 120); line += " Lenders froze your draws for 2 minutes."; }
```
e) Split `render()`. Move every line from `$("price").textContent = ...` through `$("revenue").textContent = ...` (the five Business lines) and every line from `$("answer").disabled = S.queue < 1;` through the end of the retrofit block (the `}` after `$("retrofit").textContent = ...`) into a new function, in their original order:
```js
function renderPhase1() {
  $("countLabel").textContent = "GPUs";
  $("gpuCount").textContent = S.gpus.toLocaleString("en-US");
  // ...the moved Business lines, then the moved compute/training/facilities lines, unchanged...
}
```
Delete the original `$("gpuCount").textContent = S.gpus.toLocaleString("en-US");` line at the top of `render()`. Where the compute block used to start in `render()`, put:
```js
  for (const id of ["p1biz", "computeBox", "trainingBox", "facilitiesBox"]) $(id).hidden = S.phase !== 1;
  if (S.phase === 1) { renderPhase1(); $("countyBox").hidden = $("campusBox").hidden = true; }
  else renderCampus();
```
f) Projects are per phase. In `render()` change
```js
  const avail = PROJECTS.filter((p) => !S.done[p.id] && p.when());
```
to
```js
  const avail = PROJECTS.filter((p) => (p.phase || 1) === S.phase && !S.done[p.id] && p.when());
```
and change `"Nothing yet. Train a model."` to `${S.phase === 1 ? "Nothing yet. Train a model." : "Nothing yet. The model is thinking."}` (the string is inside a template literal already).
g) The ending banner only shows for old saves that ended before phase 2 existed: change `$("ending").hidden = !S.ended;` to `$("ending").hidden = !(S.ended && S.phase === 1);`.
h) In `wire()`, add at the end:
```js
  $("toCampus").addEventListener("click", () => { startCampus(); render(); });
  wireCampus();
```

- [ ] **Step 7: Run all tests**

Run: `uv run --with pytest --with playwright pytest -q`
Expected: all pass (`15 passed`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: phase 2 handoff: break ground, pick a county, legacy colo"
```

---

### Task 4: Halls, power sources, the interconnection queue, land, "Limited by"

**Files:**
- Create: `tests/test_power.py`
- Modify: `campus.js`, `index.html` (`#campusBox`)

**Interfaces:**
- Consumes: Task 3 (`S.p2`, `countyOf()`, `renderCampus()`, `wireCampus()`, `stepCampus()`).
- Produces: `HALL {mw, acres, cost, secs}`, `POWER {turbine, solar}`, `QUEUE_DEPOSIT`, `QUEUE_GROWTH`; `build(kind: "hall"|"turbine"|"solar")`, `requestQueue()`, `queueSecs()`, `doneBuilds(kind, at?)`, `gridAt(at?)`, `powerAt(at?)`, `hallMWAt(at?)`, `energizedAt(at?)` (MW), `acresFree()`, `campusLimit(): string`. Build records: `S.p2.builds[] = {kind, done: absoluteTime, announced?}`; queue: `S.p2.queue = {mw, done} | null`.

- [ ] **Step 1: Write the failing tests**

`tests/test_power.py`:
```python
import pytest

from conftest import READY, run


def campus(game, county="strong", **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click(f"button[data-county='{county}']")
    return pg


def test_hall_costs_money_and_time(game):
    pg = campus(game)
    funds = pg.evaluate("() => S.funds")
    pg.click("#buildHall")
    assert pg.evaluate("() => S.funds") == pytest.approx(funds - 30e6)
    run(pg, 89)
    assert pg.evaluate("() => energizedAt()") == 0
    run(pg, 1)
    assert pg.evaluate("() => energizedAt()") == 50
    assert "Hall 1 is up" in pg.inner_text("#console")


def test_hall_uses_credits_first(game):
    pg = campus(game, credits=10e6)
    funds = pg.evaluate("() => S.funds")
    pg.click("#buildHall")
    assert pg.evaluate("() => S.credits") == 0
    assert pg.evaluate("() => S.funds") == pytest.approx(funds - 20e6)


def test_power_limits_energized(game):
    pg = campus(game, county="cheap")          # 50 MW grid
    pg.evaluate("() => { S.p2.builds.push({kind: 'hall', done: 0}, {kind: 'hall', done: 0}); }")
    run(pg, 1)
    assert pg.evaluate("() => energizedAt()") == 50
    assert pg.inner_text("#p2limit").startswith("power: 50 MW of halls are very expensive sheds")
    assert "50 MW dark" in pg.inner_text("#halls")


def test_halls_limit_when_power_is_ahead(game):
    pg = campus(game)                           # 200 MW grid, no halls
    assert pg.inner_text("#p2limit").startswith("halls: 200 MW of power is waiting for a building")


def test_turbine_and_solar(game):
    pg = campus(game, county="cheap")
    pg.click("#buildTurbine")
    pg.click("#buildSolar")
    run(pg, 60)
    assert pg.evaluate("() => powerAt()") == 100
    run(pg, 120)
    assert pg.evaluate("() => powerAt()") == 130
    assert pg.evaluate("() => acresFree()") == 3000 - 150


def test_queue_adds_grid_and_gets_slower(game):
    pg = campus(game, county="cheap")           # +100 MW in 300 s
    pg.click("#requestQueue")
    assert pg.is_disabled("#requestQueue")
    run(pg, 300)
    assert pg.evaluate("() => [S.p2.grid, S.p2.queue]") == [150, None]
    assert pg.evaluate("() => queueSecs()") == pytest.approx(300 * 1.3)


def test_land_runs_out(game):
    pg = campus(game, county="strong")          # 1,500 acres
    pg.evaluate("() => { for (let i = 0; i < 75; i++) S.p2.builds.push({kind: 'hall', done: 0}); S.p2.grid = 99999; }")
    run(pg, 1)
    assert pg.evaluate("() => acresFree()") == 0
    assert pg.is_disabled("#buildHall")
    assert pg.inner_text("#p2limit").startswith("land")
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --with pytest --with playwright pytest -q tests/test_power.py`
Expected: FAIL (no `#buildHall`, `energizedAt` not defined).

- [ ] **Step 3: Add the markup**

In `index.html`, replace the `#campusBox` block with:
```html
      <div id="campusBox" hidden>
        <h3>Campus</h3>
        <div class="line">County: <span id="countyName"></span></div>
        <div class="line">Halls: <span id="halls"></span></div>
        <div class="line">Power: <span id="p2power"></span></div>
        <div class="line">Land: <span id="land"></span></div>
        <div class="line">Legacy colo: <span id="legacy"></span></div>
        <div class="line sub">Limited by <span id="p2limit"></span></div>
        <div class="btns"><button id="buildHall" type="button" class="primary"></button></div>
        <div class="btns"><button id="buildTurbine" type="button"></button><button id="buildSolar" type="button"></button></div>
        <div class="btns"><button id="requestQueue" type="button"></button></div>
        <div class="line sub" id="underway"></div>
      </div>
```

- [ ] **Step 4: Add the build model to campus.js**

After `const LEGACY_FEE = ...;` add:
```js
const HALL = { mw: 50, acres: 20, cost: 30e6, secs: 90 };   // a hall is 50 MW of GPUs once it has power
const POWER = {
  turbine: { name: "gas turbine", mw: 50, cost: 25e6, secs: 60, acres: 0 },
  solar: { name: "solar + batteries", mw: 30, cost: 20e6, secs: 180, acres: 150 },
};
const QUEUE_DEPOSIT = 5e6, QUEUE_GROWTH = 1.3;             // each request waits 30% longer: everyone is in the queue
const BUILD_DONE = {
  hall: () => `Hall ${doneBuilds("hall")} is up. ` +
    (hallMWAt() > powerAt() ? "It has no power yet. It is a very expensive shed." : "Energized."),
  turbine: () => "A gas turbine came online. The neighbors can hear it.",
  solar: () => "The solar farm is live. It works about a third of the time; the batteries cover the rest, mostly.",
};
```
After `const countyOf = ...;` add:
```js
const doneBuilds = (kind, at = S.t) => S.p2.builds.filter((b) => b.kind === kind && b.done <= at).length;
const gridAt = (at = S.t) => S.p2.grid + (S.p2.queue && S.p2.queue.done <= at ? S.p2.queue.mw : 0);
const powerAt = (at = S.t) => gridAt(at) + doneBuilds("turbine", at) * POWER.turbine.mw + doneBuilds("solar", at) * POWER.solar.mw;
const hallMWAt = (at = S.t) => doneBuilds("hall", at) * HALL.mw;
const energizedAt = (at = S.t) => Math.min(hallMWAt(at), powerAt(at));
const acresUsed = () => S.p2.builds.reduce((a, b) => a + (b.kind === "hall" ? HALL.acres : POWER[b.kind].acres), 0);
const acresFree = () => countyOf().acres - acresUsed();
const queueSecs = () => countyOf().queueSecs * Math.pow(QUEUE_GROWTH, S.p2.queueN);

function build(kind) {
  const spec = kind === "hall" ? HALL : POWER[kind];
  if (!spec || !S.p2.county || spec.acres > acresFree()) return;
  const credits = kind === "hall" ? Math.min(S.credits, spec.cost) : 0;   // Parallax credits pay for a hall's GPUs
  if (S.funds + credits < spec.cost) return;
  S.credits -= credits; S.funds -= spec.cost - credits;
  S.p2.builds.push({ kind, done: S.t + spec.secs });
  track("build", { ev: "start", kind, cost: Math.round(spec.cost) });
  say(kind === "hall" ? `Broke ground on hall ${S.p2.builds.filter((b) => b.kind === "hall").length}. Ready in ${time(spec.secs)}.`
    : `Ordered ${spec.name === "gas turbine" ? "a gas turbine" : "a solar farm with batteries"}. Online in ${time(spec.secs)}.`);
}

function requestQueue() {
  if (!S.p2.county || S.p2.queue || S.funds < QUEUE_DEPOSIT) return;
  S.funds -= QUEUE_DEPOSIT;
  S.p2.queue = { mw: countyOf().queueMW, done: S.t + queueSecs() };
  track("power", { ev: "queue", mw: S.p2.queue.mw });
  say(`Joined the interconnection queue for ${fmt(S.p2.queue.mw)} MW. Estimated wait: ${time(queueSecs())}. The utility says estimates are “non-binding.”`);
}

function campusLimit() {
  const halls = hallMWAt(), pw = powerAt();
  if (acresFree() < HALL.acres && halls <= pw) return "land: no room for another hall";
  if (halls > pw) return `power: ${fmt(halls - pw)} MW of halls are very expensive sheds. Add turbines, solar or grid`;
  if (halls < pw) return `halls: ${fmt(pw - halls)} MW of power is waiting for a building`;
  return "both: build halls and power together";
}
```
Replace `stepCampus` with:
```js
function stepCampus(dt) {
  if (!S.p2.county) return;
  const q = S.p2.queue;
  if (q && S.t >= q.done) {
    S.p2.grid += q.mw; S.p2.queue = null; S.p2.queueN += 1;
    track("power", { ev: "grid", mw: q.mw });
    say(`The utility energized ${fmt(q.mw)} MW more. The queue is longer now. Everyone is in it.`);
  }
  for (const b of S.p2.builds) {
    if (!b.announced && S.t >= b.done) { b.announced = true; track("build", { ev: "done", kind: b.kind }); say(BUILD_DONE[b.kind]()); }
  }
  S.funds += S.p2.legacyMW * LEGACY_FEE * dt;
}
```
Replace `campusSnap` with:
```js
const campusSnap = () => ({ county: S.p2.county, legacyMW: S.p2.legacyMW, grid: S.p2.grid, queue: !!S.p2.queue,
  halls: doneBuilds("hall"), turbines: doneBuilds("turbine"), solar: doneBuilds("solar"),
  energizedMW: energizedAt(), acresFree: acresFree() });
```
In `renderCampus()`, replace the last two lines (`$("countyName")...` and `$("legacy")...`) with:
```js
  const pw = powerAt(), hallMW = hallMWAt();
  $("countyName").textContent = countyOf().name;
  $("halls").textContent = `${doneBuilds("hall")} built, ${fmt(energizedAt())} MW energized` +
    (hallMW > pw ? `, ${fmt(hallMW - pw)} MW dark` : "");
  $("p2power").textContent = `${fmt(pw)} MW (grid ${fmt(gridAt())}, ${doneBuilds("turbine")} turbines, ${doneBuilds("solar")} solar)`;
  $("land").textContent = `${acresFree().toLocaleString("en-US")} of ${countyOf().acres.toLocaleString("en-US")} acres free`;
  $("legacy").textContent = `${fmt(p.legacyMW)} MW, ${money(p.legacyMW * LEGACY_FEE)}/s`;
  $("p2limit").textContent = campusLimit();
  $("buildHall").textContent = `Build a hall (${HALL.mw} MW, ${HALL.acres} acres, ${time(HALL.secs)}): ${money(HALL.cost)}`;
  $("buildHall").disabled = S.funds + S.credits < HALL.cost || acresFree() < HALL.acres;
  $("buildTurbine").textContent = `Gas turbine (+${POWER.turbine.mw} MW, ${time(POWER.turbine.secs)}): ${money(POWER.turbine.cost)}`;
  $("buildTurbine").disabled = S.funds < POWER.turbine.cost;
  $("buildSolar").textContent = `Solar + batteries (+${POWER.solar.mw} MW, ${POWER.solar.acres} acres, ${time(POWER.solar.secs)}): ${money(POWER.solar.cost)}`;
  $("buildSolar").disabled = S.funds < POWER.solar.cost || acresFree() < POWER.solar.acres;
  $("requestQueue").textContent = p.queue
    ? `Interconnection queue: +${fmt(p.queue.mw)} MW in ${time(p.queue.done - S.t)}`
    : `Join the interconnection queue (+${fmt(countyOf().queueMW)} MW in ~${time(queueSecs())}): ${money(QUEUE_DEPOSIT)} deposit`;
  $("requestQueue").disabled = !!p.queue || S.funds < QUEUE_DEPOSIT;
  const pending = p.builds.filter((b) => b.done > S.t).sort((a, b) => a.done - b.done);
  $("underway").textContent = pending.length
    ? "Under construction: " + pending.map((b) => `${b.kind} ${time(b.done - S.t)}`).join(", ") : "";
```
In `wireCampus()`, add:
```js
  $("buildHall").addEventListener("click", () => { build("hall"); render(); });
  $("buildTurbine").addEventListener("click", () => { build("turbine"); render(); });
  $("buildSolar").addEventListener("click", () => { build("solar"); render(); });
  $("requestQueue").addEventListener("click", () => { requestQueue(); render(); });
```

- [ ] **Step 5: Run all tests**

Run: `uv run --with pytest --with playwright pytest -q`
Expected: all pass (`22 passed`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: campus halls, gas turbines, solar, interconnection queue, land"
```

---

### Task 5: Contracts: offers, forecast, signing, low-stress deadlines, debt on backlog

**Files:**
- Create: `tests/test_contracts.py`
- Modify: `campus.js`, `index.html` (Contracts panel, credits note), `main.js` (`dealSize`, `drawSize`, `facilityOpen`, phase 1 render hides `#contractsBox`, credits note)

**Interfaces:**
- Consumes: Task 4 (`energizedAt`, `hallMWAt`, `powerAt`, `HALL`).
- Produces: `makeOffer(first?: boolean)`, `acceptOffer(id)`, `declineOffer(id)`, `renegotiate(id)`, `forecast({start, term, mw, id?}) -> {ok: bool, short: number, why: string}`, `deliveredMW()`, `backlogMW()`, `campusDrawSize()`, `campusDealSize()`. Offer: `{id, n, who, mw, start, term, upfront, fee, expires}`. Contract: `{id, n, who, mw, start, end, fee, upfront, status: "waiting"|"late"|"active"|"done"|"defaulted", reneg, warned}`.

- [ ] **Step 1: Write the failing tests**

`tests/test_contracts.py`:
```python
import pytest

from conftest import READY, run


def campus(game, county="strong", **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click(f"button[data-county='{county}']")
    pg.evaluate("() => { S.p2.legacyMW = 0; }")        # isolate contract money from the legacy fee
    return pg


def first_offer(pg):
    return pg.evaluate("() => S.p2.offers[0]")


def test_first_offer_is_your_old_lab(game):
    pg = campus(game)
    o = first_offer(pg)
    assert o["who"].startswith("Your old lab") and o["mw"] == 30
    assert "Your old lab" in pg.inner_text("#offers")


def test_sign_pays_upfront_and_adds_backlog(game):
    pg = campus(game)
    o = first_offer(pg)
    funds = pg.evaluate("() => S.funds")
    pg.click(f"button[data-accept='{o['id']}']")
    assert pg.evaluate("() => S.funds") == pytest.approx(funds + o["upfront"])
    assert pg.evaluate("() => backlogMW()") == 30
    assert o["upfront"] == 30 * o["term"] * 1500


def test_forecast_red_then_green(game):
    pg = campus(game)
    o = first_offer(pg)
    assert "Short 30 MW by then" in pg.inner_text("#offers")
    pg.evaluate(f"() => S.p2.builds.push({{kind: 'hall', done: {o['start'] - 10}}})")
    run(pg, 1)
    assert "You'll have 30 MW free by then" in pg.inner_text("#offers")


def test_delivered_contract_pays_fee(game):
    pg = campus(game)
    o = first_offer(pg)
    pg.evaluate("() => S.p2.builds.push({kind: 'hall', done: 0})")
    pg.click(f"button[data-accept='{o['id']}']")
    pg.evaluate(f"() => {{ S.t = {o['start']} - 1; }}")
    run(pg, 1)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "active"
    funds = pg.evaluate("() => S.funds")
    run(pg, 10)
    assert pg.evaluate("() => S.funds") == pytest.approx(funds + 10 * 30 * 300, rel=1e-6)
    assert pg.inner_text("#gpuCount") == "30 MW"


def test_late_is_free_for_the_first_minute_then_costs(game):
    pg = campus(game)
    o = first_offer(pg)
    pg.click(f"button[data-accept='{o['id']}']")
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
    o = first_offer(pg)
    pg.click(f"button[data-accept='{o['id']}']")
    pg.evaluate(f"() => {{ S.t = {o['start']}; }}")
    run(pg, 121)
    assert "walks in 60s" in pg.inner_text("#console")
    funds = pg.evaluate("() => S.funds")
    run(pg, 60)
    c = pg.evaluate("() => S.p2.contracts[0]")
    assert c["status"] == "defaulted"
    assert pg.evaluate("() => S.funds") < funds - o["upfront"] / 2 + 1
    assert pg.evaluate("() => S.nextDraw - S.t") >= 119


def test_renegotiate_once(game):
    pg = campus(game)
    o = first_offer(pg)
    pg.click(f"button[data-accept='{o['id']}']")
    hype = pg.evaluate("() => S.hype")
    cid = pg.evaluate("() => S.p2.contracts[0].id")
    pg.click(f"button[data-reneg='{cid}']")
    c = pg.evaluate("() => S.p2.contracts[0]")
    assert c["start"] == o["start"] + 120 and c["reneg"] is True
    assert pg.evaluate("() => S.hype") == pytest.approx(hype - 5)
    assert not pg.is_visible(f"button[data-reneg='{cid}']")


def test_decline_is_free_and_offers_expire_no_sooner_than_45s(game):
    pg = campus(game)
    run(pg, 200)                                   # let normal offers arrive
    offers = pg.evaluate("() => S.p2.offers.filter((o) => !o.who.startsWith('Your old lab'))")
    assert offers and all(o["expires"] - o["start"] < 0 for o in offers)
    assert all(o["expires"] >= 0 for o in offers)
    fresh = pg.evaluate("() => { makeOffer(); return S.p2.offers[S.p2.offers.length - 1]; }")
    assert fresh["expires"] - pg.evaluate("() => S.t") >= 45
    funds, hype = pg.evaluate("() => [S.funds, S.hype]")
    pg.click(f"button[data-decline='{fresh['id']}']")
    assert pg.evaluate("() => [S.funds, S.hype]") == [funds, hype]


def test_allocation_in_signing_order(game):
    pg = campus(game)
    pg.evaluate("""() => { S.p2.offers = []; S.p2.builds.push({kind: 'hall', done: 0});
      for (let i = 0; i < 2; i++) { makeOffer(); const o = S.p2.offers[S.p2.offers.length - 1];
        o.mw = 30; o.start = S.t + 5; acceptOffer(o.id); } }""")
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
    o = first_offer(pg)
    pg.click(f"button[data-accept='{o['id']}']")
    pg.evaluate(f"() => {{ S.t = {o['start']}; step(1); step(200); render(); }}")
    assert pg.evaluate("() => S.p2.contracts[0].status") == "defaulted"
    assert pg.evaluate("() => Number.isFinite(S.funds) && Number.isFinite(S.hype)")


def test_reload_mid_campus(game):
    pg = campus(game)
    o = first_offer(pg)
    pg.click(f"button[data-accept='{o['id']}']")
    pg.click("#buildHall")
    pg.click("#requestQueue")
    before = pg.evaluate("() => JSON.stringify(S.p2)")
    pg.evaluate("() => save()")
    pg.reload()
    assert pg.evaluate("() => JSON.stringify(S.p2)") == before


def test_debt_sized_on_backlog(game):
    pg = campus(game, hype=80)
    pg.evaluate("""() => { S.p2.offers = []; makeOffer(); const o = S.p2.offers[0]; o.mw = 100; acceptOffer(o.id); }""")
    assert pg.evaluate("() => drawSize()") == pytest.approx(0.8 * 100 * 300000)
    assert pg.is_visible("#draw")
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --with pytest --with playwright pytest -q tests/test_contracts.py`
Expected: FAIL (`S.p2.offers[0]` undefined, no `#offers`).

- [ ] **Step 3: Add the markup**

In `index.html`, insert before `<div id="computeBox">` (after `#countyBox`):
```html
      <div id="contractsBox" hidden>
        <h3>Contracts</h3>
        <div class="line">Backlog: <span id="backlog">0 MW</span> &middot; Delivered: <span id="delivered">0 MW</span></div>
        <div class="line">Revenue: <span id="p2rev">$0/s</span></div>
        <div class="line sub">Offers (declining is free)</div>
        <div id="offers"></div>
        <div class="line sub">Signed</div>
        <div id="contracts"></div>
      </div>
```
Replace `<span class="sub">(GPUs only)</span>` in `#creditsRow` with `<span class="sub" id="creditsNote">(GPUs only)</span>`.
Add CSS after the `.choices .c` rule:
```css
  .deal { border-left: 2px solid var(--rule); padding-left: 8px; margin: 6px 0; }
  .deal .line.good { color: var(--good); } .deal .line.bad { color: var(--bad); }
```

- [ ] **Step 4: Add contracts to campus.js**

After the `BUILD_DONE` block add:
```js
const UPFRONT_RATE = 1500;   // $ per MW-second of the term, paid when you sign
const FEE_RATE = 300;        // $ per MW per second while delivered
const OFFER_TTL = 60;        // offers wait at least this long before walking (spec: never under 45 s)
const LATE_FREE = 60, LATE_DEFAULT = 180, RENEGOTIATE_SECS = 120, RENEGOTIATE_HYPE = 5;
const CUSTOMERS = [
  "Your old lab (Parallax is paying)", "A lab funded by Parallax", "PivotCloud, subleasing to its own customers",
  "A sovereign AI fund", "A lab you have never heard of with $4B", "A chatbot company that is also a hardware company",
];
```
After `campusLimit()` add:
```js
const live = (c) => c.status !== "done" && c.status !== "defaulted";
const deliveredMW = () => S.p2.contracts.filter((c) => c.status === "active").reduce((a, c) => a + c.mw, 0);
const backlogMW = () => S.p2.contracts.filter((c) => c.status === "waiting" || c.status === "late").reduce((a, c) => a + c.mw, 0);
const committedAt = (at, skip) => S.p2.contracts
  .filter((c) => live(c) && c.id !== skip && c.start <= at && at < c.end).reduce((a, c) => a + c.mw, 0);

// Will this much capacity be free for the whole term? Checked at the start and wherever another contract begins.
function forecast(o) {
  const end = o.start + o.term;
  const points = [o.start, ...S.p2.contracts.filter((c) => live(c) && c.id !== o.id && c.start > o.start && c.start < end).map((c) => c.start)];
  const spare = Math.min(...points.map((at) => energizedAt(at) - committedAt(at, o.id)));
  const short = Math.max(0, o.mw - spare);
  const why = hallMWAt(o.start) <= powerAt(o.start) ? "build halls" : "add power";
  return { ok: short === 0, short, why };
}

function makeOffer(first = false) {
  const n = ++S.p2.offerN;
  const scale = Math.max(20, 0.35 * (energizedAt(S.t + 300) + 40));
  const mw = first ? 30 : Math.max(10, Math.round(scale * (0.6 + Math.random() * 0.8) / 10) * 10);
  const startsIn = first ? 300 : 240 + Math.floor(Math.random() * 180);
  const term = 480 + Math.floor(Math.random() * 420);
  const who = first ? CUSTOMERS[0] : CUSTOMERS[1 + Math.floor(Math.random() * (CUSTOMERS.length - 1))];
  S.p2.offers.push({ id: `o${n}`, n, who, mw, start: S.t + startsIn, term,
    upfront: mw * term * UPFRONT_RATE, fee: mw * FEE_RATE, expires: S.t + (first ? 280 : OFFER_TTL) });
  track("contract", { ev: "offer", mw });
}

function acceptOffer(id) {
  const i = S.p2.offers.findIndex((o) => o.id === id);
  if (i < 0) return;
  const o = S.p2.offers.splice(i, 1)[0];
  const n = ++S.p2.contractN;
  S.funds += o.upfront;
  S.p2.contracts.push({ id: `c${n}`, n, who: o.who, mw: o.mw, start: o.start, end: o.start + o.term,
    fee: o.fee, upfront: o.upfront, status: "waiting", reneg: false, warned: false });
  track("contract", { ev: "accept", mw: o.mw, upfront: Math.round(o.upfront) });
  say(`Signed ${o.who.split(" (")[0]}: ${fmt(o.mw)} MW starting in ${time(o.start - S.t)}. ${money(o.upfront)} up front. ` +
    (forecast({ ...o, id: `c${n}` }).ok ? "You have the capacity." : "You do not have the capacity yet. Nobody asked."));
}

function declineOffer(id) {
  S.p2.offers = S.p2.offers.filter((o) => o.id !== id);
  track("contract", { ev: "decline" });
}

function renegotiate(id) {
  const c = S.p2.contracts.find((x) => x.id === id);
  if (!c || c.reneg || (c.status !== "waiting" && c.status !== "late")) return;
  c.start += RENEGOTIATE_SECS; c.end += RENEGOTIATE_SECS; c.reneg = true; c.warned = false;
  if (c.status === "late") c.status = "waiting";
  S.hype = Math.max(5, S.hype - RENEGOTIATE_HYPE);
  track("contract", { ev: "renegotiate", mw: c.mw });
  say(`Pushed ${c.who.split(" (")[0]} back ${time(RENEGOTIATE_SECS)}. The customer agrees. Investors notice.`);
}

function stepContracts(dt) {
  for (const c of [...S.p2.contracts].sort((a, b) => a.start - b.start || a.n - b.n)) {
    if (c.status === "active") {
      S.funds += c.fee * dt; S.p2.earned += c.fee * dt;
      if (S.t >= c.end) { c.status = "done"; track("contract", { ev: "end", mw: c.mw }); say(`${c.who.split(" (")[0]}'s term ended. ${fmt(c.mw)} MW is free again.`); }
      continue;
    }
    if ((c.status !== "waiting" && c.status !== "late") || S.t < c.start) continue;
    const free = energizedAt() - deliveredMW();
    if (free >= c.mw) {
      track("contract", { ev: "start", mw: c.mw, late: Math.round(S.t - c.start) });
      say(c.status === "late" ? `Finally delivered ${fmt(c.mw)} MW to ${c.who.split(" (")[0]}. They pretend it was on time.` : `Delivered ${fmt(c.mw)} MW to ${c.who.split(" (")[0]}. The meter is running.`);
      c.status = "active";
      continue;
    }
    const late = S.t - c.start;
    if (c.status === "waiting") {
      c.status = "late"; track("contract", { ev: "late", mw: c.mw });
      say(`${c.who.split(" (")[0]} wanted ${fmt(c.mw)} MW today and you are short ${fmt(c.mw - Math.max(0, free))} MW (${forecast(c).why}). The first minute is on the house.`);
    }
    if (late > LATE_FREE) { S.funds -= 0.5 * c.fee * dt; S.hype = Math.max(5, S.hype - 0.05 * dt); }
    if (!c.warned && late >= LATE_DEFAULT - 60) { c.warned = true; say(`${c.who.split(" (")[0]} walks in 60s unless you deliver ${fmt(c.mw)} MW or push the date.`); }
    if (late >= LATE_DEFAULT) {
      c.status = "defaulted"; c.end = S.t;
      S.funds -= 0.5 * c.upfront; S.hype = Math.max(5, S.hype - 20); S.nextDraw = Math.max(S.nextDraw, S.t + 120);
      track("contract", { ev: "default", mw: c.mw });
      say(`${c.who.split(" (")[0]} walked. They clawed back ${money(0.5 * c.upfront)}, told everyone, and the lenders froze your draws.`);
    }
  }
  S.p2.contracts = S.p2.contracts.filter((c) => live(c) || S.t - c.end < 60);
}

const campusDrawSize = () => (S.hype / 100) * Math.max(backlogMW(), 10) * 300000;   // lenders size on signed backlog
const campusDealSize = () => HALL.cost * 0.5;                                        // Parallax credits: half a hall of GPUs
```
In `chooseCounty()`, add before the `milestone(...)` line:
```js
  makeOffer(true); S.p2.nextOffer = S.t + 90;
```
and add after the existing `say(...)`:
```js
  say("Your old lab spun out. It wants 30 MW in five minutes. Parallax is paying for it, which means Parallax is paying you.");
```
Replace `campusRevenue` with:
```js
const campusRevenue = () => (S.p2 && S.p2.county
  ? S.p2.legacyMW * LEGACY_FEE + S.p2.contracts.filter((c) => c.status === "active").reduce((a, c) => a + c.fee, 0) : 0);
```
In `stepCampus`, after the legacy fee line, add:
```js
  S.p2.offers = S.p2.offers.filter((o) => o.expires > S.t && o.start > S.t);
  if (S.t >= S.p2.nextOffer && S.p2.offers.length < 3) { makeOffer(); S.p2.nextOffer = S.t + 60 + Math.random() * 60; }
  stepContracts(dt);
```
Add to `campusSnap` (inside the object): `deliveredMW: deliveredMW(), backlogMW: backlogMW(), offers: S.p2.offers.length, late: S.p2.contracts.filter((c) => c.status === "late").length, earned: Math.round(S.p2.earned),`.

Add the contracts renderer after `renderCampus`:
```js
let lastOfferKey = null, lastContractKey = null;
function renderContracts() {
  const p = S.p2;
  $("countLabel").textContent = "Delivered";
  $("gpuCount").textContent = `${fmt(deliveredMW())} MW`;
  $("backlog").textContent = `${fmt(backlogMW())} MW`;
  $("delivered").textContent = `${fmt(deliveredMW())} of ${fmt(energizedAt())} MW`;
  $("p2rev").textContent = `${money(campusRevenue())}/s`;
  // Rebuild rows only when the set changes, so a click never lands on a button that was just replaced.
  const oKey = p.offers.map((o) => o.id).join(",");
  if (oKey !== lastOfferKey) {
    lastOfferKey = oKey;
    $("offers").innerHTML = p.offers.length ? "" : `<div class="empty">No offers right now. They come every minute or two.</div>`;
    for (const o of p.offers) {
      const d = document.createElement("div"); d.className = "deal"; d.dataset.offer = o.id;
      d.innerHTML = `<div class="line what"></div><div class="line sub fc"></div><div class="btns">` +
        `<button type="button" class="primary" data-accept="${o.id}"></button><button type="button" data-decline="${o.id}">Pass</button></div>`;
      $("offers").appendChild(d);
    }
  }
  for (const d of $("offers").querySelectorAll("[data-offer]")) {
    const o = p.offers.find((x) => x.id === d.dataset.offer); if (!o) continue;
    const f = forecast(o);
    d.querySelector(".what").textContent = `${o.who}: ${fmt(o.mw)} MW for ${time(o.term)}, starts in ${time(o.start - S.t)}. ${money(o.fee)}/s while delivered.`;
    const fc = d.querySelector(".fc");
    fc.className = "line sub fc " + (f.ok ? "good" : "bad");
    fc.textContent = (f.ok ? `✓ You'll have ${fmt(o.mw)} MW free by then.` : `Short ${fmt(f.short)} MW by then: ${f.why}.`) +
      ` Offer good for ${Math.ceil(o.expires - S.t)}s.`;
    d.querySelector("[data-accept]").textContent = `Sign: ${money(o.upfront)} up front`;
  }
  const shown = p.contracts.filter((c) => c.status !== "done" && c.status !== "defaulted");
  const cKey = shown.map((c) => `${c.id}:${c.status}:${c.reneg}`).join(",");
  if (cKey !== lastContractKey) {
    lastContractKey = cKey;
    $("contracts").innerHTML = shown.length ? "" : `<div class="empty">Nothing signed.</div>`;
    for (const c of shown) {
      const d = document.createElement("div"); d.className = "deal"; d.dataset.contract = c.id;
      d.innerHTML = `<div class="line st"></div>` + (!c.reneg && c.status !== "active"
        ? `<div class="btns"><button type="button" data-reneg="${c.id}">Push the date ${time(RENEGOTIATE_SECS)} (−${RENEGOTIATE_HYPE} hype)</button></div>` : "");
      $("contracts").appendChild(d);
    }
  }
  for (const d of $("contracts").querySelectorAll("[data-contract]")) {
    const c = p.contracts.find((x) => x.id === d.dataset.contract); if (!c) continue;
    const st = d.querySelector(".st"), who = c.who.split(" (")[0], late = S.t - c.start;
    if (c.status === "active") { st.className = "line st good"; st.textContent = `${who}: ${fmt(c.mw)} MW delivered, ${money(c.fee)}/s, ends in ${time(c.end - S.t)}`; }
    else if (c.status === "late") {
      st.className = "line st bad";
      st.textContent = `LATE ${time(late)}: ${who}, ${fmt(c.mw)} MW. ` +
        (late < LATE_FREE ? "Free for now." : `Paying penalties. Walks in ${time(Math.max(0, LATE_DEFAULT - late))}.`);
    } else {
      const f = forecast(c);
      st.className = "line st " + (f.ok ? "" : "bad");
      st.textContent = `${who}: ${fmt(c.mw)} MW, starts in ${time(c.start - S.t)}. ` + (f.ok ? "✓ covered" : `Short ${fmt(f.short)} MW: ${f.why}`);
    }
  }
}
```
In `renderCampus()`, change `$("campusBox").hidden = !p.county;` to `$("campusBox").hidden = $("contractsBox").hidden = !p.county;`, and add `renderContracts();` as the last line of the function (after the `$("underway")` line). Remove the `$("countLabel")`/`$("gpuCount")` lines from the top of `renderCampus()` only for the county-chosen path: change them to
```js
  if (!p.county) { $("countLabel").textContent = "Legacy colo"; $("gpuCount").textContent = `${fmt(p.legacyMW)} MW`; }
```
In `wireCampus()`, add:
```js
  $("offers").addEventListener("click", (e) => {
    const a = e.target.closest("button[data-accept]"), d = e.target.closest("button[data-decline]");
    if (a) { acceptOffer(a.dataset.accept); render(); } else if (d) { declineOffer(d.dataset.decline); render(); }
  });
  $("contracts").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-reneg]");
    if (b) { renegotiate(b.dataset.reneg); render(); }
  });
```

- [ ] **Step 5: Hook money into main.js**

a) `const dealSize = () => 800 * Math.pow(5, S.gen) * (1 + S.deals * 0.15);` becomes
```js
const dealSize = () => S.phase === 2 ? campusDealSize() : 800 * Math.pow(5, S.gen) * (1 + S.deals * 0.15);
```
b) `const drawSize = () => (S.hype / 100) * 3 * Math.pow(5, S.gen) * 1000;` becomes
```js
const drawSize = () => S.phase === 2 ? campusDrawSize() : (S.hype / 100) * 3 * Math.pow(5, S.gen) * 1000;
```
c) `const facilityOpen = () => S.tier >= 3;` becomes `const facilityOpen = () => S.phase === 2 || S.tier >= 3;`
d) In `render()`, change `if (S.phase === 1) { renderPhase1(); $("countyBox").hidden = $("campusBox").hidden = true; }` to
```js
  if (S.phase === 1) { renderPhase1(); $("countyBox").hidden = $("campusBox").hidden = $("contractsBox").hidden = true; }
```
and after `$("credits").textContent = moneyFull(S.credits);` add:
```js
  $("creditsNote").textContent = S.phase === 1 ? "(GPUs only)" : "(pays for halls' GPUs)";
```

- [ ] **Step 6: Run all tests**

Run: `uv run --with pytest --with playwright pytest -q`
Expected: all pass (`35 passed`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: capacity contracts with forecasts, low-stress deadlines, backlog-sized debt"
```

---

### Task 6: Play log, phase 2 simulator, pacing check

**Files:**
- Create: `tools/sim_p2.py`
- Modify: `tools/read_log.py`

**Interfaces:**
- Consumes: constants from `campus.js` (mirrored by hand in `sim_p2.py`; keep them in sync).
- Produces: `python3 tools/sim_p2.py` prints a per-minute table and any stretch over 90 s with nothing useful to do; `read_log.py` prints phase 2 event counts and campus snapshot columns.

- [ ] **Step 1: Teach read_log.py about phase 2**

In `summarize()`, after the `swaps` block, add:
```python
    p2 = [e for e in ev if e["a"] in ("county", "build", "power", "contract")]
    if p2:
        print("\n== phase 2")
        print("  contracts:", dict(Counter(e.get("ev") for e in ev if e["a"] == "contract")))
        print("  builds started:", dict(Counter(e.get("kind") for e in ev if e["a"] == "build" and e.get("ev") == "start")))
        print("  grid:", dict(Counter(e.get("ev") for e in ev if e["a"] == "power")))
        campus = [e for e in ev if e["a"] == "snap" and e.get("p2")]
        if campus:
            print("  time   energized delivered backlog late        funds")
            for s in campus[:: max(1, len(campus) // 20)]:
                c = s["p2"]
                print(f"  {mmss(s['t']):>6} {c.get('energizedMW', 0):>9} {c.get('deliveredMW', 0):>9} {c.get('backlogMW', 0):>7} {c.get('late', 0):>4} {s['funds']:>12,}")
```

- [ ] **Step 2: Write the simulator**

`tools/sim_p2.py`:
```python
"""Phase 2 core-loop pacing sim: a greedy infra company (contracts, halls, turbines, grid queue).
Mirrors campus.js constants; keep them in sync.   python3 tools/sim_p2.py [--county strong] [--minutes 25]"""
import argparse, random

HALL = dict(mw=50, acres=20, cost=30e6, secs=90)
TURBINE = dict(mw=50, cost=25e6, secs=60)
COUNTIES = {"cheap": dict(grid=50, acres=3000, qmw=100, qsecs=300, cash=0),
            "strong": dict(grid=200, acres=1500, qmw=150, qsecs=200, cash=0),
            "incent": dict(grid=100, acres=2000, qmw=100, qsecs=240, cash=20e6)}
UPFRONT_RATE, FEE_RATE, LEGACY_FEE = 1500, 300, 100
QUEUE_DEPOSIT, QUEUE_GROWTH = 5e6, 1.3
LATE_FREE, LATE_DEFAULT, OFFER_TTL = 60, 180, 60
DEAL_EVERY, DEAL = 90, HALL["cost"] * 0.5


def run(county="strong", minutes=25, seed=1, funds=60e6, legacy=110, verbose=True):
    rnd = random.Random(seed)
    c = COUNTIES[county]
    S = dict(t=0, funds=funds + c["cash"], credits=0.0, grid=c["grid"], queue=None, qn=0, builds=[],
             offers=[], contracts=[], next_offer=90, next_deal=0, earned=0.0, defaults=0, idle=0, idle_log=[])

    done = lambda kind, at: sum(1 for b in S["builds"] if b[0] == kind and b[1] <= at)
    grid_at = lambda at: S["grid"] + (S["queue"][0] if S["queue"] and S["queue"][1] <= at else 0)
    power_at = lambda at: grid_at(at) + done("turbine", at) * TURBINE["mw"]
    halls_at = lambda at: done("hall", at) * HALL["mw"]
    energized = lambda at: min(halls_at(at), power_at(at))
    live = lambda k: k["status"] not in ("done", "defaulted")
    delivered = lambda: sum(k["mw"] for k in S["contracts"] if k["status"] == "active")
    committed = lambda at: sum(k["mw"] for k in S["contracts"] if live(k) and k["start"] <= at < k["end"])
    acres_free = lambda: c["acres"] - sum(HALL["acres"] for b in S["builds"] if b[0] == "hall")

    def offer(first=False):
        scale = max(20, 0.35 * (energized(S["t"] + 300) + 40))
        mw = 30 if first else max(10, round(scale * (0.6 + rnd.random() * 0.8) / 10) * 10)
        start = S["t"] + (300 if first else 240 + rnd.randrange(180))
        term = 480 + rnd.randrange(420)
        S["offers"].append(dict(mw=mw, start=start, term=term, upfront=mw * term * UPFRONT_RATE, fee=mw * FEE_RATE,
                                expires=S["t"] + (280 if first else OFFER_TTL)))

    def spare_at(at, extra_build_mw=0):
        return min(halls_at(at) + extra_build_mw, power_at(at) + extra_build_mw) - committed(at)

    offer(first=True)
    rows = []
    while S["t"] < minutes * 60:
        S["t"] += 1; t = S["t"]; acted = False
        if S["queue"] and t >= S["queue"][1]:
            S["grid"] += S["queue"][0]; S["queue"] = None; S["qn"] += 1
        S["funds"] += legacy * LEGACY_FEE
        if t >= S["next_deal"]:
            S["credits"] += DEAL; S["next_deal"] = t + DEAL_EVERY
        S["offers"] = [o for o in S["offers"] if o["expires"] > t and o["start"] > t]
        if t >= S["next_offer"] and len(S["offers"]) < 3:
            offer(); S["next_offer"] = t + 60 + rnd.random() * 60
        # contracts
        for k in sorted(S["contracts"], key=lambda k: k["start"]):
            if k["status"] == "active":
                S["funds"] += k["fee"]; S["earned"] += k["fee"]
                if t >= k["end"]: k["status"] = "done"
            elif k["status"] in ("waiting", "late") and t >= k["start"]:
                if energized(t) - delivered() >= k["mw"]:
                    k["status"] = "active"
                else:
                    k["status"] = "late"; late = t - k["start"]
                    if late > LATE_FREE: S["funds"] -= 0.5 * k["fee"]
                    if late >= LATE_DEFAULT:
                        k["status"] = "defaulted"; S["funds"] -= 0.5 * k["upfront"]; S["defaults"] += 1
        # player: sign offers it can cover by building in time with money on hand
        for o in list(S["offers"]):
            need = max(0, o["mw"] - spare_at(o["start"]))
            halls = -(-need // HALL["mw"])
            cost = halls * (HALL["cost"] + TURBINE["cost"])
            if need == 0 or (o["start"] - t > HALL["secs"] and S["funds"] + S["credits"] + o["upfront"] >= cost):
                S["offers"].remove(o); S["funds"] += o["upfront"]; acted = True
                S["contracts"].append(dict(mw=o["mw"], start=o["start"], end=o["start"] + o["term"], fee=o["fee"],
                                           upfront=o["upfront"], status="waiting"))
        # player: build whichever side is short for the next 5 minutes of commitments
        horizon = t + 300
        demand = max([committed(x) for x in range(t, horizon, 30)] + [0]) + 50
        if S["queue"] is None and S["funds"] >= QUEUE_DEPOSIT and power_at(horizon) < demand:
            S["funds"] -= QUEUE_DEPOSIT; S["queue"] = (c["qmw"], t + c["qsecs"] * QUEUE_GROWTH ** S["qn"]); acted = True
        for _ in range(10):
            hall_future = sum(1 for b in S["builds"] if b[0] == "hall") * HALL["mw"]
            power_future = S["grid"] + (S["queue"][0] if S["queue"] else 0) + sum(1 for b in S["builds"] if b[0] == "turbine") * TURBINE["mw"]
            if hall_future >= demand and power_future >= demand:
                break
            if hall_future <= power_future and acres_free() >= HALL["acres"] and S["funds"] + S["credits"] >= HALL["cost"]:
                cr = min(S["credits"], HALL["cost"]); S["credits"] -= cr; S["funds"] -= HALL["cost"] - cr
                S["builds"].append(("hall", t + HALL["secs"])); acted = True
            elif power_future < hall_future and S["funds"] >= TURBINE["cost"]:
                S["funds"] -= TURBINE["cost"]; S["builds"].append(("turbine", t + TURBINE["secs"])); acted = True
            else:
                break
        pending = any(b[1] > t for b in S["builds"]) or S["queue"] is not None or any(k["status"] == "waiting" for k in S["contracts"])
        if acted or pending or S["offers"]:
            if S["idle"] > 90: S["idle_log"].append((t - S["idle"], S["idle"]))
            S["idle"] = 0
        else:
            S["idle"] += 1
        if t % 60 == 0:
            rows.append((t // 60, energized(t), delivered(), sum(k["mw"] for k in S["contracts"] if k["status"] in ("waiting", "late")),
                         sum(1 for k in S["contracts"] if k["status"] == "late"), S["funds"], S["credits"]))
    if verbose:
        print(f"county={county} seed={seed}")
        print(" min  energized delivered backlog late          funds       credits")
        for r in rows:
            print(f"{r[0]:>4} {r[1]:>10.0f} {r[2]:>9.0f} {r[3]:>7.0f} {r[4]:>4} {r[5]:>14,.0f} {r[6]:>13,.0f}")
        print(f"defaults={S['defaults']} idle stretches >90s: {S['idle_log'] or 'none'}")
    return rows, S


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--county", default="strong"); ap.add_argument("--minutes", type=int, default=25)
    a = ap.parse_args()
    for county in ([a.county] if a.county != "all" else list(COUNTIES)):
        run(county, a.minutes)
```

- [ ] **Step 3: Run the simulator for all three counties**

Run: `cd /Users/alexa/workspace/paloma-labs/more-with-more && python3 tools/sim_p2.py --county all`
Expected, for each county: `idle stretches >90s: none`, `defaults=0`, and energized MW rising in every 5-minute window. If a county shows idle stretches or flat growth, adjust `UPFRONT_RATE`, `FEE_RATE`, `HALL.cost` or `TURBINE`/`POWER.turbine.cost` **in both** `tools/sim_p2.py` and `campus.js` (same names), rerun, and note the final values in the commit message. Do not push growth to runaway: energized MW at minute 25 should stay under ~1,000 MW (the gigawatt ending belongs to plan 3).

- [ ] **Step 4: Run all tests (constants may have changed)**

Run: `uv run --with pytest --with playwright pytest -q`
Expected: all pass. If a test hard-codes a constant you tuned (e.g. `30e6`, `1500`, `300`), update that test's number to the new constant.

- [ ] **Step 5: Manual playthrough**

Reload http://localhost:8777 in Firefox on a save that is ready to break ground (or `{...READY}` via the console), break ground, pick a county, and play 5 minutes. Then run `uv run --with python-snappy tools/read_log.py` and confirm the `== phase 2` section prints contract, build and grid counts.

- [ ] **Step 6: Commit and push**

```bash
git add -A
git commit -m "feat: phase 2 simulator and play-log support"
git push
```
