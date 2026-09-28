# Plan 4: cap table, IPO after Series E, follow-ons, lockup, secondaries

> Work on `main`; deploy to the play checkout only after a green suite. TDD per task.

**Goal:** Ownership that dilutes with every round, an IPO right after Series E (user's call, 2026-09-28), a public stock with the classic pop-then-slide, follow-on offerings instead of Series F/G, lockup expiry, secondaries into personal liquidity, and an ending that reports what you personally cleared.

**Architecture:** New `market.js` (after `model.js`, before `main.js`). State: `S.cap = {shares, founder, liquidity}` (both phases), `S.p2.ipo = {at, px0, lastFollowOn, lockupSaid}`. Phase 1's `raise()` and phase 2's `raiseCampus()` call `dilute(fraction, why)`. Ownership = `founder / shares`.

## Constants
- `DILUTION = { "Pre-seed": 0.10, Seed: 0.15, "Series A": 0.20, "Series B": 0.15, "Series C": 0.12, "Series D": 0.10, "Series E": 0.08 }`
- Market cap = annualized revenue (`campusRevenue() × 3.15e7`) × `MULTIPLE = 8` × `(0.5 + hype/100)`; before any revenue, a floor of the last private valuation.
- IPO gate: Series E raised, backlog ≥ 300 MW, campus ≥ 400 MW, hype ≥ 40. Sells `IPO_FLOAT = 0.10` of post-money shares at `0.85 ×` fundamental price ("priced below range").
- Arc multiplier on the fundamental price: 0 → 60 s: 0.85 → 3.4 (the pop); 60 → 360 s: 3.4 → 1.36 (−60%); then 1.0 drifting with a bounded random walk. Lockup at +300 s: one-time −15% shock, console joke, secondaries open.
- Follow-on: raise `0.08 × market cap`, dilutes 8%, stock −5%, cooldown 300 s, needs hype ≥ 40.
- Secondary: sell 1% of your founder shares at the current price into `S.cap.liquidity`; stock −2%; cooldown 60 s; only after lockup.
- ROUNDS2 becomes Series E only; the raise button shows "Ring the bell" (IPO) then "Follow-on offering".

## Tasks
1. **Cap table** (`tests/test_captable.py`): phase 1 rounds dilute per table; ownership line in Investors; old saves derive ownership from rounds raised; 409A console line per round.
2. **IPO** (`tests/test_ipo.py`): gate text; ringing the bell pays proceeds and dilutes 10%; ticker "MORE $px"; arc pop at +60 s and slide by +360 s; lockup at +300 s (−15%, console, secondaries open); reload mid-arc resumes (absolute times).
3. **After the IPO** (same file): follow-on raises 8% of cap with cooldown; secondaries move money to personal liquidity and dilute you, never the company's funds; ending banner reports personal liquidity and ownership.
4. **Sim**: replace Series F/G with IPO + follow-ons; confirm the 1 GW goal time stays in the 25–40 min band and that there's no post-E money gap.
