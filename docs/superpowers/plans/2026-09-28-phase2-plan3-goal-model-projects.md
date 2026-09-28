# Phase 2, Plan 3: a goal, the model's proposals, an ending, more projects

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Work on `main`; deploy to the play checkout (`git -C ../more-with-more-play checkout -q --detach main`) only after a green suite.

**Goal:** Give phase 2 a visible goal (a 1 GW campus), the model's proposals with autonomy and a self-approving ending, about 16 phase 2 projects, and stop the late-game runaway.

**Architecture:** New file `model.js` (loaded after `campus.js`, before `main.js`) holds proposals, autonomy, the goal line and the ending; its state lives in `S.p2.model`. Phase 2 projects go in `projects.js` with `phase: 2` and read `S.done` flags from `campus.js` formulas. Escalating campus costs and contract re-checks live in `campus.js`.

**Spec:** `docs/superpowers/specs/2026-09-27-phase2-campus-design.md` ("The model's proposals", ending) plus the in-chat design approved 2026-09-28 (projects list, 1 GW goal, runaway fixes).

## Global Constraints
- Plan 1/1b constraints hold. Script order: globals, projects, campus, model, main.
- Every proposal shows cost, effect and what rejecting does. Rejecting is free now; the proposal returns bigger.
- The ending never blocks play: a banner over a running game (like phase 1).
- Tests: `uv run --with pytest --with playwright pytest -q` must be green before any deploy.

## Review Focus
1. **Reload during a pending proposal or the final countdown** resumes it exactly (absolute times). Test: Task 2 `test_proposal_survives_reload`.
2. **Old saves without `S.p2.model`** load and start with autonomy 0. Test: Task 2 `test_old_save_gets_a_model`.
3. **Contracts whose GPUs vanish** go late with a fresh grace clock, never keep paying. Test: Task 1 `test_active_contract_rechecked`.
4. **Project effects stack correctly with proposal effects** (e.g. queue −30% lawyer and −50% lobbyist multiply). Test: Task 3 `test_queue_discounts_stack`.
5. **The ending fires once**, and phase 2 keeps running after it. Test: Task 2 `test_ending_once_and_game_continues`.

---

### Task 1: Runaway fixes: escalating campus costs; re-check active contracts
- `buildCost(kind)` = base × 1.03^(number of that kind already built or building). Buttons and `build()` use it.
- In `stepContracts`, before activating waiting contracts, re-run the allocation for active contracts in activation order; any active contract that can't be fully served goes to `late` with `start = S.t` (fresh 60 s free minute, fresh 180 s grace) and a console line "Lost GPUs under <who>'s contract: <MW> short."
- Tests (`tests/test_runaway.py`): `test_halls_cost_three_percent_more_each`, `test_active_contract_rechecked` (active 30 MW contract; fleet emptied → status late, `start == S.t`, earns nothing).

### Task 2: model.js: goal, proposals, autonomy, ending
- State: `S.p2.model = {autonomy: 0, current: null, offered: {}, rejected: {}, next: {}, done: {}, final: null, endedAt: null}`.
- `GOAL_MW = 1000`; goal line `#goalLine`: "Goal: a 1 GW campus (now X). The model has plans for it."
- `PROPOSALS` (id, title, desc(scale), cost(scale), weight, when(), apply(scale)); `scale = 1.3^times rejected`:
  - `lobbyist`: after first queue request; $50M; queue ×0.5; weight 10.
  - `pricing`: after 5 contracts signed; free; upfronts ×1.3; weight 12.
  - `parallax`: after first phase 2 chip release; free; GPU price ×0.8; weight 12.
  - `rezone`: acres free < 100; $200M; +2,000 acres; weight 14.
  - `nuclear`: campus ≥ 200 MW or halls dark; $600M; +600 MW grid after 240 s; weight 16.
  - `eminent`: rezone done and acres free < 100; $400M; +5,000 acres; weight 16.
  - `utility`: nuclear done; $1.5B; +1,500 MW grid, queue instant; weight 20.
- One proposal at a time; `offerNext()` picks the first eligible, not done, whose `next` time passed. Approve: pay, apply, autonomy += weight. Reject: `rejected[id]++`, `next[id] = S.t + 240`, console quotes it back.
- Autonomy line `#autonomy`: <20 "It asks politely." <45 "It has started drafting the permits itself." <70 "It schedules its own meetings." else "It is waiting for you to agree." Model console lines every ~90 s by tier.
- Final: when campus energized ≥ GOAL_MW, `final = {at: S.t + 30}` if autonomy ≥ 70 (self-approves at `at`, buttons disabled, countdown shown) else a normal Approve button. On approve: `endedAt = S.t`, milestone, banner `#ending2` with stats + "The Moon has no water rights."
- Tests (`tests/test_model.py`): goal line text; lobbyist appears after queue and approving halves `queueSecs()`; reject returns bigger after 240 s and quotes; autonomy text tiers; final self-approves with countdown when autonomy ≥ 70 and needs a click when < 70; `test_ending_once_and_game_continues`; `test_proposal_survives_reload`; `test_old_save_gets_a_model`.

### Task 3: Phase 2 projects
Implement in `projects.js` (`phase: 2`) with effects read in `campus.js`/`main.js`:
`resdesk` upfront ×1.2 ($25M; ≥1 contract) · `sales2` offers 30% more often ($40M; ≥3 contracts) · `vp` offer size ×1.2 ($30M; Series E) · `sovereign2` sovereign fees ×1.3 ($150M; ≥5 contracts) · `partner` GPUs ×0.9 ($60M; a phase 2 chip release) · `refurb` trade-ins 40% ($50M; an old generation) · `inference` on-demand floor 0.3 ($80M; a generation 2+ behind) · `liquid` halls 75 MW ($100M; ≥2 halls) · `prefab` hall build ×0.6 ($30M; ≥1 hall) · `lawyer` queue ×0.7 ($20M; a queue request) · `btm` turbines 70 MW ($40M; ≥2 turbines) · `nuclearppa` +200 MW grid ($500M; Series F) · `securitize` draws ×1.5 ($10M; backlog ≥200 MW) · `rebrand` +30 hype ($5M; phase 2) · `silicon` +50 hype ($100M; Series F) · `pledge2` +15 hype (free; ≥200 acres used).
Tests (`tests/test_projects_p2.py`): each project appears only when its condition holds (parametrized), and one assertion per effect family; `test_queue_discounts_stack` (lawyer × lobbyist = 0.35).

### Task 4: Sim + tune
Model proposals (approve when eligible and affordable), projects (buy when affordable and useful), escalating costs, and the ending in `tools/sim_p2.py`; report minute of 1 GW campus and ending per county. Target: ending at 25–30 min into phase 2. Tune GOAL/weights/costs in both places.
