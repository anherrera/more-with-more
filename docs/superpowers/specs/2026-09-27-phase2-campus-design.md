# More With More, phase 2 ("The Campus"): design

Status: approved 2026-09-27. Supersedes the loose notes in `PHASE2.md` where they disagree.

## Intent

Phase 1 plays the AI lab as a tenant: you lease space from landlords, beg Parallax for GPUs, and chase
model generations. Breaking ground ends it. Phase 2 flips you into the **infra company**: you sell
capacity to labs and then scramble to build it, on land you had to buy, powered by electricity you had
to find, cooled by water someone else was using.

The game is written from an infra person's point of view. The lab satire (hype, benchmarks, rounds)
stays broad and recognizable; the infra jokes (interconnection queues, kW per rack, water rights,
backlog-backed debt, retrofits, town halls) carry the detail.

Your model stops training and becomes **the campus's brain**. It proposes the big moves; you approve
or reject. Each approval gives it more autonomy. At full autonomy it approves its own proposal, and
phase 2 ends. Phase 3 (not in scope) is the model deciding Earth should be one data center.

### Success criteria
- Phase 2 plays in **20 to 30 minutes** for a first-time player, with no quiet stretch over ~90 s where
  there is nothing useful to click (checked with the play log, as in phase 1).
- Every constraint that blocks you is **named on screen** with what to do about it (the lesson from
  phase 1's hidden "lease a building" gate).
- The model's proposals feel like the Paperclips probe moment: a real choice, escalating, ending in
  the model no longer asking.
- Phase 1 behaves exactly as before the code restructure (verified by smoke tests and a saved run).

### Out of scope (first version)
- Supply chain (transformer and switchgear lead times). Listed as a later addition.
- Phase 3.
- Multiple campuses/counties at once (one county, chosen at the start).

## Code structure (like Paperclips)

No build step; plain scripts loaded in order by `index.html`, served by `python3 -m http.server`.

| File | Holds |
|---|---|
| `index.html` | Markup and CSS only. Loads the scripts below. |
| `globals.js` | `S` state, `fresh()`, constants shared by both phases, formatting (`money`, `fmt`, `time`), save/load and migrations, play log (`track`, `milestone`, `flush`), console (`say`). |
| `projects.js` | The `PROJECTS` list for both phases (each has `phase`, `when`, optional `needs`, `buy`). |
| `main.js` | Phase 1 loop, rendering and actions (today's inline code, moved, not rewritten), the main `tick`, event wiring, and the phase switch. |
| `campus.js` | Phase 2 systems: contracts, halls, power, water, land/community, town halls, the model's proposals and autonomy, cap table and IPO, and phase 2 rendering. |

Boundary: phase 2 state lives in `S.p2`. `campus.js` reads phase 1 state only at handoff
(`startCampus()`), plus the shared Investors fields (`S.hype`, `S.debt`, `S.funds`, `S.rival`). Phase 1
code never reads `S.p2`. `S.phase` (1 or 2) picks which panels render and which `step` runs; shared
systems (hype decay, posts, PivotCloud, spot market, debt interest) keep running in both phases.

The restructure is step one and ships alone: phase 1 moved into files with no behavior change, verified
before any phase 2 code is written.

## Handoff

Breaking ground calls `startCampus()`:
- `S.phase = 2`. Training and the query business hide (the model is no longer trained); Compute
  (buy GPUs, chips, trade-ins) and Facilities (leased space) **stay**, because an infra company still
  buys GPUs and leases space. Investors and the console stay. New panels: **Contracts**, **Campus**
  (power, water, land), later **Community** and **The Model**.
- The phase 1 fleet and its leased space carry over unchanged. Those GPUs are your first inventory:
  whatever isn't under contract is sold **on-demand** (and on **spot**).
- Your old lab spins out as **your first tenant**: the first contract offer is from it, pre-funded by
  Parallax ("paying you with money that came from Parallax").
- County choice (one decision, three options with trade-offs), shown before anything else:
  - **Cheap land, weak grid**: land is cheap, starting grid connection 50 MW, long queue.
  - **Strong grid, drought county**: 200 MW grid, low water allocation, frequent droughts.
  - **Big incentives, organized town**: political capital bonus, opposition starts high, town halls
    more often.
- The console line: "We are an infrastructure company now." The model: "I could do more with more."

## Core loop: sell capacity, then build it

### Capacity: GPUs in space (revised 2026-09-27 after the user described the real business)

Capacity is **GPUs deployed somewhere**. There are two kinds of somewhere:
1. **Leased space** in someone else's data center: phase 1's Facilities panel, now at scale. Fast
   (power and cooling included). In phase 2 the market is **finite**: landlords have a limited number
   of MW to lease, regrowing slowly as new colos open, and market rent keeps rising. When it's gone:
   "Leased capacity is sold out in this market."
2. **Your own site** (the campus, like the Kansas City build): land, power, grid queue, turbines,
   halls. Slow, cheaper per MW once up, and the only way past what landlords will lease you. A campus
   hall is a powered shell; GPUs are bought separately and racked in it.

GPUs are always a **separate purchase** from space (Parallax, the Compute panel), in both phases.
Parallax keeps shipping new chips in phase 2.

**Old GPUs get cheaper, not idle.** Uncontracted GPUs earn on-demand revenue at a rate that drops
with each newer generation (×0.7 per generation behind, with a floor), while utilization stays high:
older chips stay busy with inference and smaller jobs. A free project, "Extend the depreciation
schedule to 6 years", raises reported earnings and hype while changing nothing about the hardware.

### Contracts (the money)
Offers arrive every 60 to 120 s. Each: `MW`, `startsIn` (seconds), `term` (seconds), `upfront` ($),
`fee` ($/s while delivered), and the customer (a lab, a Parallax-funded lab, PivotCloud subleasing,
a sovereign).
- **Accept**: `upfront` paid now; contract added to **backlog**. You can sell capacity you haven't built.
- Each offer names a **minimum chip generation** (the newest, or one behind): labs want current GPUs.
  Contracts are served from GPUs of that generation or newer, wherever they are racked.
- At `startsIn = 0` the contract **starts**: it claims its MW from eligible GPUs. If short, it's
  **late** and a warning names the shortfall ("Short 30 MW: power"). Costs escalate slowly (see
  "Keep deadlines low-stress" below): first only the lost fee, then a penalty per second and hype,
  and only after a long grace period a **default** (clawback of part of the upfront, a big hype hit,
  lenders review and freeze draws).
- While delivered it pays `fee`/s; at the end of `term` the MW frees up.
- Starting values: `upfront = MW × term × 400`, `fee = MW × 200`/s (tune in `sim_p2.py`). Offer size
  grows with backlog and hype.
- **Backlog** = total MW signed but not yet delivered. It sizes the debt facility.

**Keep deadlines low-stress** (a design rule, not a tuning knob):
- Every offer shows a **delivery forecast**: "✓ 40 MW of P5+ on hand", "✓ covered if you buy 20 MW of
  P6 (≈$15M); you have the space", or "Short 20 MW of space: lease or build". Signing only green offers
  means never being late.
- **Late is mild at first**: for the first 60 s late, the only cost is the fee not being paid. No
  penalty, no hype hit.
- **Renegotiate once** per contract: push the start date back (e.g. +2 min) for a small hype cost
  ("The customer agrees. Investors notice.").
- **Default only after a long grace period** (e.g. 3 min late), with console warnings well before it.
- Offers never expire faster than ~45 s, and there is no penalty for declining or ignoring them.

### Halls (the spend)
Capacity is built as **halls**, 50 MW each. A hall costs money, takes build time, and needs:
- **Land**: 20 acres.
- **Permits**: build time × `(1 + opposition / 50)`.
- To be **energized** it also needs 50 MW of **power** and its **water** at the current cooling
  standard. A built hall with no power or water is just a very expensive shed (named as such).
- **Energized MW** = min over the constraints; the Campus panel shows "Limited by: power / water /
  land / permits" with the fix, like phase 1's "Limited by" line.
- Cooling standard carries over from phase 1 (per-hall, set at build time, retrofittable): denser
  cooling uses more water per MW until the model proposes dry cooling.

### Money
- Contracts' upfront cash and fees are the main income; on-demand and spot sales of uncontracted
  GPUs are the rest.
- **Raises continue** in phase 2 (Series E onward), gated on backlog and hype.
- **Debt** is sized on backlog, not hype ("GPU-backed securities"), with phase 1's leverage-based
  margin calls still in force.
- Hype still gates raises and debt draws and still has froth, reality checks and PivotCloud.

## Constraints

Each is a meter with a capacity and uses. Starting values are placeholders for the simulator to tune.

### Power (MW)
- **Grid connection**: county-dependent start (50 to 200 MW).
- **Interconnection queue**: request more grid MW; a countdown (minutes). Skip ahead with political
  capital. Only one request in flight.
- **Gas turbines**: +50 MW each, fast to build, cost money, +opposition.
- **Solar + batteries**: +30 MW effective, slow, needs acres, no opposition.
- Via proposals only: **restart a nuclear plant** (big, slow), **buy the utility** (grid cap gone,
  queue instant).

### Water (million gallons/day, MGD)
- **Municipal allocation**: a cap; **drought events** cut it for a while (named in the console).
- **Wells**: + MGD each; an **aquifer** meter that only goes down; at zero the wells stop.
- **Reclaimed water**: + MGD, costs money.
- Via proposals only: **desalination** (lots of water, costs power), **buy the lake**, **dry cooling**
  (water per MW drops a lot, power use rises).

### Land and community
- **Acres**: county start; buy more at a price that rises with opposition.
- **Political capital**: earned from promises ("10,000 jobs", jobs delivered counted separately and
  shown: "Jobs promised: 10,000. Jobs delivered: 41."), incentive deals, and town halls. Spent to skip
  the queue, speed permits, and on some proposals.
- **Community opposition** (0 to 100): rises with power, water and land use and with some choices;
  slows permits; high opposition raises land prices and blocks some actions (named on screen).
- **Town halls** (the phase 2 counterpart to vague-posting): every few minutes, a timed choice (~20 s)
  among three answers, e.g. promise jobs (+capital, +promises owed), fund the high school gym ($,
  −opposition), say "AI" forty times (+hype, +opposition). Missing it: +opposition.
- Via proposals only: **rezone the suburb** (lots of acres, big opposition), **eminent domain**.

## The model's proposals

- The model makes a **proposal** every few minutes and when you hit a wall it can solve. Each has a
  title, a cost (money, capital, opposition), and an effect. The big moves above arrive only this way.
- **Approve**: pay, unlock, and **autonomy** rises (by the proposal's weight).
- **Reject**: nothing lost now; the model returns later with a bigger, stranger version. Rejections
  are remembered and quoted back.
- **Autonomy** (0 to 100) is shown as a plain-language line, not a number ("It asks politely." →
  "It has started drafting the permits itself." → "It is waiting for you to agree.").
- Its console lines get pushier with autonomy: "The river is underutilized." "Have you considered
  the aquifer?" "I have reviewed the zoning code. It is a suggestion."
- **Ending**: at full autonomy the model issues a proposal and approves it itself. The approve and
  reject buttons go gray. Final line: "I could do more with more." Ending screen with phase 2 stats
  and a phase 3 teaser ("The Moon has no water rights."). Like phase 1, the game keeps running under
  the banner.

## Cap table and IPO

- **Ownership**: starts at a phase 1-derived founder share (each phase 1 round diluted it); phase 2
  raises dilute further. Shown in Investors.
- **Secondaries**: sell a slice of your shares into **your liquidity**, a personal counter that does
  nothing for the company. The ending screen reports both: "The company owes $X. You personally
  cleared $Y."
- **409A**: employee options priced at a fraction of the preferred price; a console joke when it
  updates.
- **Tender offer**: an event; approve (employees sell, morale up, hype cost) or decline.
- **IPO** (midway, once backlog passes a threshold): a big money event; the stock prices below range,
  pops ~300%, falls ~60% over the next minutes, then **lockup expiry** (a console event and a
  secondaries window). PIVT moves in sympathy.

## Layout

Same visual language as phase 1 (serif body, mono console, amber accents, meters with ticks, light and
dark tokens). Phase 2 panels:
- **Contracts**: offers (accept/decline with countdown), active contracts with start/late/delivered
  state, backlog.
- **Campus**: power, water, land meters with sources and their buttons; halls (built, energized,
  under construction with timers); "Limited by".
- **Community**: opposition meter, political capital, promises vs delivered, town hall when active.
- **The Model**: current proposal with approve/reject, autonomy line.
- **Investors** (carried over): hype, raises, debt, PivotCloud, spot market, plus ownership,
  secondaries and IPO.

## Save, migration, log

- `S.phase` defaults to 1. Saves that ended phase 1 before this change load at the phase 1 ending
  banner with a "Break ground" continue button that calls `startCampus()`.
- `S.p2` holds all phase 2 state (JSON-serializable, like phase 1).
- The play log gains phase 2 events: `contract` (offer/accept/start/late/default/end), `hall`
  (build/energize), `power`, `water`, `land`, `townhall`, `proposal` (offered/approved/rejected/self),
  `secondary`, `ipo`, plus phase 2 fields in `snap()`. `tools/read_log.py` learns to print them.

## Testing

- **Restructure check**: headless smoke tests (Playwright, as used this session) load seeded phase 1
  saves at several stages and compare key UI text and state with the pre-restructure commit; no page
  errors.
- **Phase 2 smoke tests**: seeded saves at handoff, mid-phase, IPO and ending; exercise accept
  contract, build hall, each constraint's "Limited by", a proposal approve and reject, a town hall, a
  late contract, the self-approval ending.
- **`tools/sim_p2.py`**: a greedy player for phase 2 (accepts contracts it can plausibly deliver,
  builds the binding constraint, approves proposals when blocked) to tune pacing to 20 to 30 minutes
  and to find dead stretches, as `sim2.py` did for phase 1.
- **Play log review** after the first real playthrough.

## Build order

1. Restructure phase 1 into `globals.js`, `projects.js`, `main.js` (no behavior change); verify; commit.
2. Phase switch and handoff (`startCampus()`, county choice, panels hide/show), legacy colo, the first
   contract; commit.
3. Contracts and halls with power only; `sim_p2.py` for that loop; commit.
4. Water and land/community (including town halls); commit.
5. The model's proposals, autonomy and the ending; commit.
6. Cap table, secondaries, tender offer, IPO; commit.
7. Pacing pass with `sim_p2.py` and a real playthrough.
