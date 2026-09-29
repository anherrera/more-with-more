# Plan 5: finish phase 2 (fires, water, community + town halls, tender offer, dependent proposals)

> Work on `main`. Push only green commits (each push redeploys the public Pages site). Deploy locally with
> `git -C ../more-with-more-play checkout -q --detach main`.

**Goal:** Every county choice has a real downside, phase 2 has friction beyond money/land/power, and the
unbuilt parts of the phase 2 spec ship: water, community opposition, town halls, the tender offer, the
water/land proposals. Plus data center fires in phases 1 and 2 (phase 3 spec, Part 0).

**Spec:** `docs/superpowers/specs/2026-09-27-phase2-campus-design.md` (Water, Land and community, town
halls, tender offer) and `docs/superpowers/specs/2026-09-28-phase3-planet-design.md` (Part 0: fires).

## Global constraints
- Low-stress rule holds: every new pressure is announced, named in "Limited by"/Next move with its fix,
  and has a way out that isn't luck.
- Old saves load: all new state defaults in `migrateCampus()` / lazily.
- Sim (`tools/sim_p2.py`) keeps the 1 GW goal inside ~25–45 min with no defaults and no idle > 90 s.

## Task 1: Fires (`fires.js`, phases 1 and 2)
- A fire every 5–10 min (phase 1 from Gen 2; phase 2 after the county pick): takes 5–15% of the fleet
  (phase 2: at least a hall's worth, 50 MW) offline for 120 s; 20% of those GPUs are lost for good.
  Offline GPUs leave `S.fleet` into `S.fires.out` and come back; phase 2 contracts on them go late via
  the existing re-check.
- Incident report in the console after it's out (list incl. "a bufo got into the busbar").
- Insurance pays 70% of the lost GPUs' value 60 s later; each fire adds a small premium ($/s).
- Projects (any phase, appear after the first fire): inert-gas suppression (fires half as often), replace
  the UPS batteries (fires half as big).
- Tests `tests/test_fires.py`: offline and return; loss; insurance; premium; suppression halves rate;
  batteries halve size; phase 2 contract goes late; save/reload mid-fire.

## Task 2: Water (phase 2)
- Each MW of energized hall needs `0.01 MGD`. County allocation: cheap 12 MGD, strong (drought) 5,
  incentives 10. Droughts: strong county every 4–6 min, others every 10–15 min; allocation ×0.6 for 3 min.
- Sources: wells (+2 MGD, $15M ×1.03ⁿ, drain an aquifer meter; dry wells give nothing), reclaimed water
  plant (+3 MGD, $40M ×1.03ⁿ).
- `energizedAt = min(halls, power, water / 0.01)`; halls line, "Limited by" and forecast name water.
- Tests `tests/test_water.py`.

## Task 3: Community opposition + town halls (phase 2)
- Opposition 0–100: county start (organized 40, others 10); +2 per hall, +3 per turbine, +1 per solar,
  +15 rezone, +30 eminent domain; organized town ×2; decays 0.5/min.
- Effects: build time ×(1 + opp/50); land ×(1 + opp/100); at 100 a 2-minute moratorium (no building),
  then 70.
- Town halls every 3–5 min (organized town every ~2 min): 20 s to pick one: promise 10,000 jobs
  (+10 capital, −10 opp, jobs promised +10k), fund the high school gym ($ scaled, −20 opp), say "AI"
  forty times (+15 hype, +10 opp). Missing it: +10 opp. "Jobs promised: X. Jobs delivered: 41."
- Political capital: spend 10 to halve the remaining interconnection queue wait.
- Tests `tests/test_community.py`.

## Task 4: Tender offer + dependent proposals
- Tender offer (after Series E, before the IPO, once): approve → builds 20% faster for 5 min (morale),
  hype −5; decline → builds 20% slower for 3 min ("engineers updated LinkedIn").
- Proposals: fund a new high school (opp ≥ 60; −40 opp; $50M; weight 8), buy the lake (water-limited;
  +20 MGD; $150M; weight 14), desalination (lake done and water-limited; +30 MGD, uses 200 MW; $300M;
  weight 12).
- Tests in `tests/test_community.py` / `tests/test_model.py`.

## Task 5: Next move + sim + review
- Next move names: town hall waiting, moratorium, water limit (wells/reclaimed/lake), drought.
- `sim_p2.py`: water, opposition (build slowdown, moratorium), fires; greedy town-hall answers.
- Final fresh whole-branch review (Plans 3–5), fix Critical/Important with tests first.
