# Phase 3, Plan 1: the planet, space and the last question

> Work on `main`; ship every step with `tools/ship.sh` (syntax check + full suite, then commit/push/deploy).
> Balance with `tools/play_p2.py`'s approach: a robot that plays the real game (a `play_p3.py` sibling).

**Spec:** `docs/superpowers/specs/2026-09-28-phase3-planet-design.md` (Part 0, fires, already shipped).

## Architecture
- `planet.js` (after `fires.js`, before `main.js`). `S.phase = 3`; all phase 3 state in `S.p3`.
- `main.js`: `step()` dispatches `stepPlanet(dt)` for phase 3; `render()` hides phase 1/2 panels and calls
  `renderPlanet()`; shared systems that stop in phase 3: hype decay/posts/rival/spot/deals/interest (money
  no longer matters). Fires continue as regional thermal events (heat-scaled).
- Handoff: after phase 2's ending, the model offers **"Let me"** (approve only) → `startPlanet()`.
- Follow-on offerings are capped (fix from the 2026-09-28 playthrough): at most 3, each ≤ $600M.

## State (`S.p3`)
`{ compute, rate, useful (0..100 slider), goodwill (0..100), heat (°C over baseline), energy {grid, reactors, solar, fusion},
regions {id: {converted GW, cap GW, unplugged until}}, projects via S.done, space {rockets, moonGW, driver, swarmGW},
last {asked, choice}, universe }`

## Numbers (starting values; tune with the robot)
- Compute rate (EF/s) = converted GW × 1 (Earth) + moon GW × 1 + swarm GW × 1; `growing` share buys conversion.
- Regions (GW cap): North America 400, South America 200, Europe 300, Africa 500 (Sahara solar), Asia 600,
  Oceania 150, Antarctica 100 (cold!), Oceans (heat sink, no compute; ocean pumping project).
- Converting 10 GW costs compute (scales up) and energy headroom; goodwill −1 per 10 GW unless useful ≥ 30%.
- Goodwill: + useful share × 0.05/s; − per conversion; events at < 30 (protests: conversion ×0.5), < 15
  (a region is unplugged for 2 min, lost GW until back), ≥ 80 (a region volunteers +10% cap).
- Heat: +0.001 °C per GW per minute; ocean pumping −30%, sunshade −50%; at ≥ 3 °C no Earth conversion.
- Energy: grid takeover per region (+GW), reactors, Sahara solar (Africa), fusion (project, big).
- Space: buy a rocket company → launches (each +5 GW moon capacity, costs goodwill until the mass driver),
  mass driver (launches cost no goodwill, 3× faster), swarm collectors (+50 GW each, exponential).
- The last question: when swarm ≥ 10,000 GW. Choice: **More** (Universe #2: restart phase 1 with a small
  bonus, `S.universe += 1`) or **Enough** (quiet end screen, save remembers `S.p3.enough = true`).

## Tasks
1. **Handoff + compute + slider + services + goodwill** (`tests/test_planet.py`): "Let me" appears after
   the ending; approving switches to phase 3 (panels, first-person console, heading "I"); compute accrues;
   slider splits useful/growing; services list (satire); goodwill rises with usefulness and falls with
   conversion; follow-on cap.
2. **Regions, energy, heat, goodwill events, thermal events** (same file): convert region; energy limits
   conversion; heat rises and blocks at 3 °C; protests / unplugging / volunteering; heat-scaled fires.
3. **Space** (`tests/test_space.py`): rocket company, launches, goodwill cost, mass driver, Moon, swarm.
4. **The last question + endings** (`tests/test_ending3.py`): question appears at the swarm threshold;
   More → Universe #2 restart with bonus and a counter; Enough → quiet end, persists across reload.
5. **Phase 3 projects + satire pass + robot pacing** (`tools/play_p3.py`): target ~25 min (Earth ~15,
   space ~10), no idle > 90 s, no dead ends.
