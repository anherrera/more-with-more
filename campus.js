// campus.js: phase 2, "The Campus". You are an infrastructure company now: sell capacity to labs,
// then scramble to build it. Phase 2 state lives in S.p2; phase 1 state is read only at handoff.
import { $, $q, chip, fmt, hit, HYPE_TO_RAISE, kwText, milestone, money, mwText, rebuildOn, S, say, setHtml, time, track } from "./globals.js";
import { PROJECTS, projectCost } from "./projects.js";
import { GOAL_MW, extraAcres, freshModel, modelDone, renderModel, stepModel, wireModel } from "./model.js";
import { DILUTION, dilute, isPublic, renderPublicRaise, stepMarket, wireMarket } from "./market.js";
import { ceoBuild, ceoFee, ceoSlow, ceoStrike, chooseCard, freshCeo, freshPeople, freshTown, moraleSlow, moratoriumOn, offeredPerks, sponsor, stepPeople, townBuilt, townOf, townSlow, usePerk } from "./people.js";
import { capKW, gpuPrice, leasedKW, newest, render, rentIndex, spotMult, tradeCount, tradeIn, tradeValue, usedKW } from "./main.js";

export const COUNTIES = [
  { id: "cheap", name: "Cheap land, weak grid",
    pitch: "3,000 acres for the price of a parking garage. The grid is two wires and a prayer.",
    gridMW: 50, acres: 3000, queueMW: 100, queueSecs: 300, cash: 0, water: 12, drought: [600, 900], town: 15, rise: 1 },
  { id: "strong", name: "Strong grid, drought county",
    pitch: "A 200 MW connection on day one. The reservoir is a rumor.",
    gridMW: 200, acres: 1500, queueMW: 150, queueSecs: 200, cash: 0, water: 5, drought: [240, 360], town: 20, rise: 1 },
  { id: "incent", name: "Big incentives, organized town",
    pitch: "$20M in tax incentives up front. The town already has a Facebook group about you.",
    gridMW: 100, acres: 2000, queueMW: 100, queueSecs: 240, cash: 20e6, water: 10, drought: [600, 900], town: 40, rise: 2 },
];
export const MARKET_START_MW = 150, MARKET_CAP_MW = 300;       // leasable colo MW in this market
export const COLO_MW = 20, COLO_RACKS = 240, COLO_SLOT = 35;   // you lease colo in 20 MW blocks (a data hall's worth)
export const COLO_EVERY = [120, 180], COLO_OPENS = [40, 80];   // a new colo opens every 2-3 minutes with 40-80 MW
export const OD_RATE = 300, OD_DECAY = 0.7, OD_FLOOR = 0.15, OD_UTIL = 0.8;   // on-demand $/MW/s for the newest chip; older gens earn less but stay busy
export const P2_RATE = 0.25;     // phase 1 debt is refinanced as project finance at a quarter of the facility's rate
export const HALL = { mw: 50, acres: 20, cost: 10e6, secs: 90 };   // a powered shell: GPUs are bought separately and racked in it
export const POWER = {
  turbine: { name: "gas turbine", mw: 50, cost: 25e6, secs: 60, acres: 0 },
  solar: { name: "solar + batteries", mw: 30, cost: 20e6, secs: 180, acres: 150 },
};
export const LAND = { acres: 200, cost: 15e6, growth: 1.03 };      // adjacent parcels: each one costs 3% more than the last, like builds
// Water: every MW of energized hall evaporates cooling water. Measured in million gallons a day (MGD).
export const WATER_PER_MW = 0.01, DROUGHT_CUT = 0.6, DROUGHT_SECS = 180, AQUIFER_DRAIN = 0.05;   // aquifer % per second per well
export const WATER = {
  well: { name: "well", mgd: 2, cost: 15e6, secs: 45, acres: 0 },
  reclaimed: { name: "reclaimed water plant", mgd: 3, cost: 40e6, secs: 120, acres: 0 },
};
export const QUEUE_DEPOSIT = 5e6, QUEUE_GROWTH = 1.1, QUEUE_MAX_SECS = 600;   // each request waits 10% longer (everyone is in the queue), up to 10 minutes
export const BUILD_DONE = {
  hall: () => `Hall ${doneBuilds("hall")} is up. ` +
    (hallMWAt() > powerAt() ? "It has no power yet. It is a very expensive shed." : "Energized. Rack some GPUs in it."),
  turbine: () => "A gas turbine came online. The neighbors can hear it.",
  solar: () => "The solar farm is live. It works about a third of the time; the batteries cover the rest, mostly.",
  well: () => "A new well is pumping. The aquifer has opinions about this, slowly.",
  reclaimed: () => "The reclaimed water plant is online. Nobody asks where the water was before.",
};
export const UPFRONT_RATE = 550;    // $ per MW-second of the term, paid when you sign
export const FEE_RATE = 275;        // $ per MW per second while delivered
export const OFFER_TTL = 60;        // offers wait at least this long before walking (spec: never under 45 s)
export const LATE_FREE = 60, LATE_DEFAULT = 180, RENEGOTIATE_SECS = 120, RENEGOTIATE_HYPE = 5;
export const CUSTOMERS = [
  "Your old lab (Parallax is paying)", "A lab funded by Parallax", "PivotCloud, subleasing to its own customers",
  "A sovereign AI fund", "A lab you have never heard of with $4B", "A chatbot company that is also a hardware company",
];
// The most each customer can sign for. ~2 kW per GPU all-in, so $4B buys about 20k GPUs: ~50 MW.
export const CUSTOMER_MAX_MW = {
  "Your old lab (Parallax is paying)": 1000, "A lab funded by Parallax": 1500, "PivotCloud, subleasing to its own customers": 300,
  "A sovereign AI fund": 500, "A lab you have never heard of with $4B": 50, "A chatbot company that is also a hardware company": 200,
};
export const ROUNDS2 = [
  { name: "Series E", backlog: 100, campus: 150, amount: 100e6 },   // then the IPO (market.js)
];
export const campusRound = () => ROUNDS2[S.p2.round || 0];
// Investors fund build-outs: a round needs signed backlog AND a campus to show for it. Returns what's missing, or null.
export const roundGap = (r) => backlogMW() < r.backlog ? `${mwText(r.backlog)} of signed backlog (have ${mwText(backlogMW())})`
  : energizedAt() < r.campus ? `${mwText(r.campus)} of campus (have ${mwText(energizedAt())})` : null;
export function raiseCampus() {
  const r = campusRound();
  if (!r || roundGap(r) || S.hype < HYPE_TO_RAISE) return;
  dilute(DILUTION[r.name], r.amount, r.name);
  S.funds += r.amount; S.p2.round = (S.p2.round || 0) + 1; S.hype = Math.max(10, S.hype - 20); milestone(`raised ${r.name}`);
  say(`Closed the ${r.name}: ${money(r.amount)}. The deck said “backlog” eleven times. Most of the backlog is labs funded by Parallax.`);
}

export const freshP2 = () => ({
  county: null, market: MARKET_START_MW, nextColo: null, colo: 0, coloN: 0, round: 0, grid: 0, queue: null, queueN: 0, builds: [],
  offers: [], contracts: [], nextOffer: 0, offerN: 0, contractN: 0, earned: 0,
});
export const countyOf = () => COUNTIES.find((c) => c.id === S.p2.county);
export const doneBuilds = (kind, at = S.t) => S.p2.builds.filter((b) => b.kind === kind && b.done <= at).length;
export const gridAt = (at = S.t) => S.p2.grid + (S.p2.queue && S.p2.queue.done <= at ? S.p2.queue.mw : 0);
export const hallSize = () => (S.done.liquid ? 75 : HALL.mw);            // liquid-cooling standard packs more into each hall
export const turbineMW = () => (S.done.btm ? 70 : POWER.turbine.mw);   // behind-the-meter turbines
export const solarMW = () => (S.done.bifacial ? 50 : POWER.solar.mw);   // panels that catch light on both sides
export const powerAt = (at = S.t) => gridAt(at) + doneBuilds("turbine", at) * turbineMW() + doneBuilds("solar", at) * solarMW();
export const hallMWAt = (at = S.t) => doneBuilds("hall", at) * hallSize();
export const droughtOn = (at = S.t) => !!(S.p2.drought && at < S.p2.drought.until);
export const waterAt = (at = S.t) => countyOf().water * (S.done.disclosewater ? 1.2 : 1) * (droughtOn(at) ? DROUGHT_CUT : 1) + (S.done.golfcourse ? 2 : 0)
  + (S.p2.aquifer > 0 ? doneBuilds("well", at) * WATER.well.mgd : 0) + doneBuilds("reclaimed", at) * WATER.reclaimed.mgd + (S.p2.extraWater || 0);
export const waterMWAt = (at = S.t) => waterAt(at) / (WATER_PER_MW * (S.done.drycooling ? 0.5 : 1));   // dry cooling halves the water per MW
export const energizedAt = (at = S.t) => (S.p2 && S.p2.county ? Math.min(hallMWAt(at), powerAt(at), waterMWAt(at)) : 0);
export const campusKWAt = (at = S.t) => (S.p2 && S.p2.county ? energizedAt(at) * 1000 : 0);
export const coloCost = () => COLO_RACKS * COLO_SLOT * rentIndex();
export function leaseColo() {
  if (!S.p2 || S.p2.market < COLO_MW || S.funds < coloCost()) return;
  S.funds -= coloCost(); S.p2.market -= COLO_MW; S.p2.colo = (S.p2.colo || 0) + COLO_MW * 1000; S.p2.coloN = (S.p2.coloN || 0) + 1;
  track("lease", { ev: "colo", mw: COLO_MW });
  say(`Leased ${mwText(COLO_MW)} of colo space. The landlord asked what you were building. You said \u201cthe future.\u201d`);
}
export function openColo() {
  const mw = Math.min(MARKET_CAP_MW - S.p2.market, COLO_OPENS[0] + Math.floor(Math.random() * ((COLO_OPENS[1] - COLO_OPENS[0]) / 10 + 1)) * 10);
  S.p2.nextColo = S.t + COLO_EVERY[0] + Math.random() * (COLO_EVERY[1] - COLO_EVERY[0]);
  if (mw <= 0) return;
  S.p2.market += mw; track("lease", { ev: "open", mw });
  say(`A new colo opened across town: ${mwText(mw)} available at ${money(coloCost() / (COLO_MW * 1000))}/kW. PivotCloud is already on the phone.`);
}
// Which GPUs are under contract: active contracts take MW from the oldest generation they accept, in activation order.
export function freeKWByGen() {
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
export const genPrice = (g) => (chip(g).priceMult / chip(g).kw) / (chip(3).priceMult / chip(3).kw);   // rates track each chip's launch price per kW (P4 = 1)
export const odRate = (g) => OD_RATE * genPrice(g) * Math.max(S.done.inference ? OD_FLOOR * 2 : OD_FLOOR, Math.pow(OD_DECAY, S.chipIdx - g));
export const onDemandRevenue = () => Object.entries(freeKWByGen()).reduce((a, [g, kw]) => a + kw / 1000 * odRate(+g) * OD_UTIL, 0) * (S.block ? 0.5 : 1);
export const uncontractedGPUs = () => Math.floor(Object.entries(freeKWByGen()).reduce((a, [g, kw]) => a + kw / chip(+g).kw, 0));
export const campusSpotPay = () => Object.entries(freeKWByGen()).reduce((a, [g, kw]) => a + kw / 1000 * odRate(+g), 0) * 0.5 * spotMult() * 30;
export const specOf = (kind) => (kind === "hall" ? HALL : POWER[kind] || WATER[kind]);
// Practice: every finished build of a kind makes the next one 5% quicker, down to 40% of the original time.
export const LEARN = 0.95, LEARN_FLOOR = 0.4;
export const practice = (kind) => Math.max(LEARN_FLOOR, Math.pow(LEARN, S.p2.builds.filter((b) => b.kind === kind && b.done <= S.t).length));
// How long a build started now takes: base time, prefab halls, practice, and the people slowing it down.
export const buildSecs = (kind) => specOf(kind).secs * (kind === "hall" && S.done.prefab ? 0.6 : 1) * practice(kind) * (S.done.secondshift ? 0.75 : 1) * moraleSlow() * townSlow() * ceoSlow();
export const acresUsed = () => S.p2.builds.reduce((a, b) => a + specOf(b.kind).acres, 0);
export const acresFree = () => countyOf().acres + (S.p2.landN || 0) * LAND.acres + extraAcres() - acresUsed();
export const landCost = () => LAND.cost * Math.pow(LAND.growth, S.p2.landN || 0) * (S.done.paytaxes ? 0.8 : 1) * townSlow();   // above 50 opposition, sellers want a premium too   // the county likes taxpayers
export function buyLand() {
  if (!S.p2.county || S.funds < landCost()) return;
  S.funds -= landCost(); S.p2.landN = (S.p2.landN || 0) + 1;
  track("land", { n: S.p2.landN });
  say(S.p2.landN === 1 ? "Bought the adjacent parcel. The farmer said it had been in the family for four generations. The check cleared in one."
    : `Bought another ${LAND.acres} acres. The county assessor has started waving at you.`);
}
// Owning the utility skips the line, but energizing still takes 30 s a request.
export const queueSecs = () => modelDone("utility") ? 30
  : Math.min(QUEUE_MAX_SECS, countyOf().queueSecs * Math.pow(QUEUE_GROWTH, S.p2.queueN)) * (modelDone("lobbyist") ? 0.5 : 1) * (S.done.lawyer ? 0.7 : 1);

// Each hall, turbine or solar farm costs 3% more than the last: transformers, turbines and crews are backordered,
// ...until 5x the first one: by then the supply chain has caught up with you.
export const BUILD_GROWTH = 1.03, BUILD_MAX = 5;
export const buildCost = (kind) => specOf(kind).cost * Math.min(BUILD_MAX, Math.pow(BUILD_GROWTH, S.p2.builds.filter((b) => b.kind === kind).length)) * ceoBuild();

export function build(kind) {
  const spec = specOf(kind);
  const cost = buildCost(kind);
  if (!spec || !S.p2.county || spec.acres > acresFree() || S.funds < cost || (kind === "hall" && moratoriumOn())) return;
  S.funds -= cost;
  const secs = buildSecs(kind);
  S.p2.builds.push({ kind, done: S.t + secs });
  townBuilt(kind);
  track("build", { ev: "start", kind, cost: Math.round(cost) });
  say(kind === "hall" ? `Broke ground on hall ${S.p2.builds.filter((b) => b.kind === "hall").length}. Ready in ${time(spec.secs)}.`
    : `Ordered ${spec.name === "gas turbine" ? "a gas turbine" : "a solar farm with batteries"}. Online in ${time(spec.secs)}.`);
}

export function requestQueue() {
  if (!S.p2.county || S.p2.queue || S.funds < QUEUE_DEPOSIT) return;
  S.funds -= QUEUE_DEPOSIT;
  S.p2.queue = { mw: countyOf().queueMW, done: S.t + queueSecs() };
  track("power", { ev: "queue", mw: S.p2.queue.mw });
  say(`Joined the interconnection queue for ${mwText(S.p2.queue.mw)}. Estimated wait: ${time(queueSecs())}. The utility says estimates are “non-binding.”`);
}

export function campusLimit() {
  const halls = hallMWAt(), pw = powerAt(), wa = waterMWAt();
  if (halls > wa && wa <= pw) return `water: ${mwText(halls - wa)} of halls have no cooling water${droughtOn() ? " (drought)" : ""}. Drill wells, build a reclaimed water plant, or wait out the drought`;
  if (acresFree() < HALL.acres && halls <= pw) return "land: buy the adjacent parcel";
  if (halls > pw) return `power: ${mwText(halls - pw)} of halls are very expensive sheds. Add turbines, solar or grid`;
  if (halls < pw) return `halls: ${mwText(pw - halls)} of power is waiting for a building`;
  return "both: build halls and power together";
}

export const live = (c) => c.status !== "done" && c.status !== "defaulted";
export const deliveredMW = () => S.p2.contracts.filter((c) => c.status === "active").reduce((a, c) => a + c.mw, 0);
export const backlogMW = () => S.p2.contracts.filter((c) => c.status === "waiting" || c.status === "late").reduce((a, c) => a + c.mw, 0);
export const genName = (g) => (g <= 0 ? "any GPUs" : `${chip(g).name}+ GPUs`);
export const eligibleFreeMW = (minGen) => Object.entries(freeKWByGen()).reduce((a, [g, kw]) => a + (+g >= minGen ? kw : 0), 0) / 1000;
export const roomMWAt = (at) => Math.max(0, (leasedKW() + campusKWAt(at) - usedKW()) / 1000);
// Older chips not under contract: trading them in frees their space for newer ones.
export const tradeableMW = (minGen) => Object.entries(freeKWByGen()).reduce((a, [g, kw]) => a + (+g < minGen ? kw : 0), 0) / 1000;
// The most you could deliver of this generation by the start date: on hand, free room, the lease market and
// trade-ins. Empty land doesn't count: halls also need power, water, money and build time.
export const deliverableMW = (minGen) => eligibleFreeMW(minGen) + roomMWAt(S.t) + Math.max(0, S.p2.market) + tradeableMW(minGen);
// Signed contracts that get GPUs before this one: for a signed contract, those ahead of it in line;
// for an offer (last in line if signed), everything that starts during its term.
export const pendingBefore = (o) => S.p2.contracts
  .filter((c) => (c.status === "waiting" || c.status === "late") && c.id !== o.id &&
    (o.end != null ? c.start < o.start || (c.start === o.start && c.n < o.n) : c.start < o.start + o.term))
  .reduce((a, c) => a + c.mw, 0);

// What it takes to add `mw` of energized campus: halls, power and water on top of what's built or coming.
export function buildPlan(mw) {
  if (!S.p2.county) return { ok: false };
  const halls = Math.ceil(Math.max(0, mw) / hallSize()), hallsMW = hallMWAt(Infinity) + halls * hallSize();
  const turbines = Math.ceil(Math.max(0, hallsMW - powerAt(Infinity)) / turbineMW());
  const plants = Math.ceil(Math.max(0, hallsMW - waterMWAt(Infinity)) * WATER_PER_MW * (S.done.drycooling ? 0.5 : 1) / WATER.reclaimed.mgd);
  const cost = halls * buildCost("hall") + turbines * buildCost("turbine") + plants * buildCost("reclaimed");
  const lead = Math.max(halls ? HALL.secs * (S.done.prefab ? 0.6 : 1) : 0, turbines ? POWER.turbine.secs : 0, plants ? WATER.reclaimed.secs : 0);
  const what = [halls && `${halls} hall${halls > 1 ? "s" : ""}`, turbines && `${mwText(turbines * turbineMW())} of turbines`,
    plants && `${plants} reclaimed water plant${plants > 1 ? "s" : ""}`].filter(Boolean).join(" + ");
  return { ok: acresFree() >= halls * HALL.acres, cost, lead, what };
}

// Green: covered. Amber: you have to act (buy GPUs, trade in first). Red: short of space.
export const forecastClass = (f) => (!f.ok ? "bad" : f.kind === "hand" ? "good" : "hot");

// Can you deliver this? From GPUs on hand, by buying GPUs into space you'll have, or not without more space.
export function forecast(o) {
  const eligible = eligibleFreeMW(o.minGen), pending = pendingBefore(o), onHand = eligible - pending;
  if (onHand >= o.mw) return { ok: true, kind: "hand", text: `✓ ${mwText(o.mw)} of ${genName(o.minGen)} on hand.` };
  const buy = o.mw - Math.max(0, onHand);
  const room = roomMWAt(o.start) - Math.max(0, pending - eligible);
  if (room >= buy) {
    return { ok: true, kind: "buy", buy, text: `✓ Covered if you buy ${mwText(buy)} of ${newest().name}s ` +
      `(≈${money(buy * 1000 / newest().kw * gpuPrice())}); you have the space.` };
  }
  const short = buy - Math.max(0, room), trade = tradeableMW(o.minGen);
  if (trade >= short) {
    return { ok: true, kind: "trade", buy, text: `\u2713 Trade in older chips to free ${mwText(short)}, then buy ${mwText(buy)} of ${newest().name}s.` };
  }
  // Selling capacity you haven't built yet is the business: if the build fits in time and in budget, it's amber, not red.
  const plan = buildPlan(short - trade);
  const cash = S.funds + S.credits + (o.end == null ? o.upfront : 0);
  const gpuCost = buy * 1000 / newest().kw * gpuPrice();
  if (plan.ok && o.start - S.t > plan.lead + 10 && cash >= plan.cost + gpuCost) {
    return { ok: true, kind: "build", buy, text: `Build to cover: ${plan.what} (\u2248${money(plan.cost + gpuCost)} with the GPUs` +
      (o.end == null ? `; the ${money(o.upfront)} upfront ${o.upfront >= plan.cost + gpuCost ? "pays for it" : "covers part of it"}).` : ").") };
  }
  return { ok: false, kind: "space", short, text: `Short ${mwText(short - trade)} of space: lease or build${trade > 0 ? ", or trade in older chips" : ""}.` };
}

export function makeOffer(first = false) {
  const n = ++S.p2.offerN;
  const scale = Math.max(20, 0.3 * (usedKW() / 1000 + 40)) * (S.done.vp ? 1.2 : 1);
  const minGen = first ? 0 : Math.max(0, S.chipIdx - (Math.random() < 0.4 ? 1 : 0));   // labs want current chips
  const cap = Math.max(10, Math.floor(0.8 * deliverableMW(minGen) / 10) * 10);   // never ask for more than you could possibly deliver
  const who = first ? CUSTOMERS[0] : CUSTOMERS[1 + Math.floor(Math.random() * (CUSTOMERS.length - 1))];
  const most = Math.min(cap, CUSTOMER_MAX_MW[who] || cap);
  const mw = first ? 30 : Math.min(most, Math.max(10, Math.round(scale * (0.6 + Math.random() * 0.8) / 10) * 10));
  const startsIn = first ? 300 : 240 + Math.floor(Math.random() * 180);
  const term = 480 + Math.floor(Math.random() * 420);
  S.p2.offers.push({ id: `o${n}`, n, who, mw, minGen, start: S.t + startsIn, term,
    upfront: mw * term * UPFRONT_RATE * genPrice(minGen) * (modelDone("pricing") ? 1.3 : 1) * (S.done.resdesk ? 1.2 : 1), fee: mw * FEE_RATE * genPrice(minGen) * (S.done.sovereign2 && who === "A sovereign AI fund" ? 1.3 : 1) * (S.done.benchmarks ? 1.1 : 1) * ceoFee(), expires: S.t + (first ? 280 : OFFER_TTL) });
  track("contract", { ev: "offer", mw });
}

export function acceptOffer(id) {
  const i = S.p2.offers.findIndex((o) => o.id === id);
  if (i < 0) return;
  const o = S.p2.offers.splice(i, 1)[0];
  const n = ++S.p2.contractN;
  S.funds += o.upfront;
  S.p2.contracts.push({ id: `c${n}`, n, who: o.who, mw: o.mw, minGen: o.minGen, start: o.start, end: o.start + o.term,
    fee: o.fee, upfront: o.upfront, status: "waiting", reneg: false, warned: false });
  track("contract", { ev: "accept", mw: o.mw, upfront: Math.round(o.upfront) });
  say(`Signed ${o.who.split(" (")[0]}: ${mwText(o.mw)} starting in ${time(o.start - S.t)}. ${money(o.upfront)} up front. ` +
    (forecast({ ...o, id: `c${n}` }).ok ? "You have the capacity." : "You do not have the capacity yet. Nobody asked."));
}

export function declineOffer(id) {
  S.p2.offers = S.p2.offers.filter((o) => o.id !== id);
  track("contract", { ev: "decline" });
}

export function renegotiate(id) {
  const c = S.p2.contracts.find((x) => x.id === id);
  if (!c || c.reneg || (c.status !== "waiting" && c.status !== "late")) return;
  const term = c.end - c.start;
  c.start = (c.status === "late" ? S.t : c.start) + RENEGOTIATE_SECS;   // late: two minutes from now, not from the missed date
  c.end = c.start + term; c.reneg = true; c.warned = false; c.status = "waiting";
  S.hype = Math.max(5, S.hype - RENEGOTIATE_HYPE);
  track("contract", { ev: "renegotiate", mw: c.mw });
  say(`Pushed ${c.who.split(" (")[0]} back ${time(RENEGOTIATE_SECS)}. The customer agrees. Investors notice.`);
}

// If GPUs under an active contract disappear (trade-ins, re-rated chips), the contract goes late again with a fresh clock.
export function recheckActive() {
  const free = {};
  for (const [g, n] of Object.entries(S.fleet)) if (n > 0) free[g] = n * chip(+g).kw;
  const active = S.p2.contracts.filter((k) => k.status === "active").sort((a, b) => (a.activeAt || 0) - (b.activeAt || 0) || a.n - b.n);
  for (const c of active) {
    let need = c.mw * 1000;
    for (const g of Object.keys(free).map(Number).sort((a, b) => a - b)) {
      if (g < (c.minGen || 0) || need <= 0) continue;
      const take = Math.min(need, free[g]); free[g] -= take; need -= take;
    }
    if (need > 1) {
      c.status = "late"; c.start = S.t; c.warned = false;
      track("contract", { ev: "lost", mw: c.mw });
      say(`Lost GPUs under ${c.who.split(" (")[0]}'s contract: ${mwText(need / 1000)} short. The clock restarts; the first minute is on the house.`);
    }
  }
}

// Campus expansion robots: every 10 s, if cash allows, build whichever is short: halls, water or power. They read the
// room: once the town is restless (40+) they put up quiet solar instead of loud turbines, if there's land for it.
export const ROBOT_EVERY = 10, ROBOT_RESERVE = 50e6;
// What the robots would build next, and whether they can: { kind, blocked } where blocked names the reason.
// What a contract still needs, after the contracts ahead of it in line take their share.
export const contractNeed = (c) => Math.max(0, c.mw - Math.max(0, eligibleFreeMW(c.minGen || 0) - pendingBefore(c)));
// The soonest contract (due within 5 minutes) that won't have room for its GPUs in time: { c, short }.
export function urgentRoom() {
  const due = S.p2.contracts.filter((c) => (c.status === "waiting" || c.status === "late") && c.start - S.t < 300).sort((a, b) => a.start - b.start);
  let need = 0;
  for (const c of due) {
    need += contractNeed(c);
    const short = need - roomMWAt(Math.max(S.t, c.start));
    if (short > 0.01) return { c, short };
  }
  return null;
}
export function robotPlan() {
  const halls = S.p2.builds.filter((b) => b.kind === "hall").length * hallSize();
  const power = S.p2.grid + (S.p2.queue ? S.p2.queue.mw : 0) + S.p2.builds.filter((b) => b.kind === "turbine").length * turbineMW()
    + S.p2.builds.filter((b) => b.kind === "solar").length * solarMW();
  const water = waterMWAt(1e12);   // everything ordered, once it's built
  const quiet = townOf().v >= 40 && acresFree() >= POWER.solar.acres + HALL.acres;
  const u = urgentRoom();
  // Due before a hall could even finish: lease colo, it's ready today.
  const rush = u && u.c.start - S.t < buildSecs("hall") && S.p2.market >= COLO_MW;
  const kind = rush ? "colo" : halls <= Math.min(power, water) ? "hall" : water < power ? "reclaimed" : quiet ? "solar" : "turbine";
  const reserve = u ? 0 : ROBOT_RESERVE;   // a deadline is what the reserve is for
  const cost = kind === "colo" ? coloCost() : buildCost(kind);
  const blocked = kind === "hall" && acresFree() < HALL.acres ? "out of land: buying a parcel"
    : S.funds - cost < reserve ? (reserve ? `waiting for cash (keeps ${money(reserve)} in reserve)` : `waiting for ${money(cost)}`) : null;
  return { kind, blocked, u };
}
// Up to four moves per tick: buy land when they're out, energize from your utility when power is short,
// otherwise build whatever the plan says. They stop at their cash reserve (or at zero when a deadline is near).
export const ROBOT_MOVES = 4;
export function stepRobots() {
  if (!S.done.robots || S.t < (S.p2.robotsAt || 0)) return;
  S.p2.robotsAt = S.t + ROBOT_EVERY;
  for (let i = 0; i < ROBOT_MOVES; i++) {
    const { kind, blocked, u } = robotPlan(), reserve = u ? 0 : ROBOT_RESERVE;
    const n = S.p2.builds.length, colo = S.p2.colo || 0, land = S.p2.landN || 0, queued = !!S.p2.queue;
    if (blocked && blocked.startsWith("out of land")) { if (S.funds - landCost() >= reserve) buyLand(); }
    else if (blocked) break;
    else if ((kind === "turbine" || kind === "solar") && modelDone("utility") && !S.p2.queue && S.funds - QUEUE_DEPOSIT >= reserve) requestQueue();
    else if (kind === "colo") leaseColo(); else build(kind);
    const did = S.p2.builds.length > n ? kind : (S.p2.colo || 0) > colo ? "colo" : (S.p2.landN || 0) > land ? "land" : !queued && S.p2.queue ? "grid" : null;
    if (!did) break;
    S.p2.robotBuilt = S.p2.robotBuilt || {};
    S.p2.robotBuilt[did] = (S.p2.robotBuilt[did] || 0) + 1;
    if (!S.p2.robotsSaid) { S.p2.robotsSaid = true; say("The robots started building. Nobody told them to stop, so nobody will."); }
  }
}

export function stepContracts(dt) {
  recheckActive();
  for (const c of [...S.p2.contracts].sort((a, b) => a.start - b.start || a.n - b.n)) {
    if (c.status === "active") {
      S.funds += c.fee * dt; S.p2.earned += c.fee * dt;
      if (S.t >= c.end) { c.status = "done"; track("contract", { ev: "end", mw: c.mw }); say(`${c.who.split(" (")[0]}'s term ended. ${mwText(c.mw)} is free again.`); }
      continue;
    }
    if ((c.status !== "waiting" && c.status !== "late") || S.t < c.start) continue;
    const free = eligibleFreeMW(c.minGen || 0);
    if (free >= c.mw) {
      c.activeAt = S.t;
      track("contract", { ev: "start", mw: c.mw, late: Math.round(S.t - c.start) });
      say(c.status === "late" ? `Finally delivered ${mwText(c.mw)} to ${c.who.split(" (")[0]}. They pretend it was on time.` : `Delivered ${mwText(c.mw)} to ${c.who.split(" (")[0]}. The meter is running.`);
      c.status = "active";
      continue;
    }
    const late = S.t - c.start;
    if (c.status === "waiting") {
      c.status = "late"; track("contract", { ev: "late", mw: c.mw }); ceoStrike(`missing ${c.who}'s start date`);
      say(`${c.who.split(" (")[0]} wanted ${mwText(c.mw)} today and you are short ${mwText(c.mw - Math.max(0, free))} of ${genName(c.minGen || 0)} (${roomMWAt(S.t) > 0 ? "buy GPUs" : tradeableMW(c.minGen || 0) > 0 ? "trade in older chips, then buy" : "lease or build space"}). The first minute is on the house.`);
    }
    if (late > LATE_FREE) { S.funds -= 0.5 * c.fee * dt; S.hype = Math.max(5, S.hype - 0.05 * dt); }
    if (!c.warned && late >= LATE_DEFAULT - 60) { c.warned = true; say(`${c.who.split(" (")[0]} walks in 60s unless you deliver ${mwText(c.mw)} or push the date.`); }
    if (late >= LATE_DEFAULT) {
      c.status = "defaulted"; c.end = S.t;
      // Full clawback: walking away never pays.
      S.funds -= c.upfront; S.hype = Math.max(5, S.hype - 20); S.nextDraw = Math.max(S.nextDraw, S.t + 120);
      track("contract", { ev: "default", mw: c.mw });
      say(`${c.who.split(" (")[0]} walked. They clawed back the full ${money(c.upfront)}, told everyone, and the lenders froze your draws.`);
    }
  }
  S.p2.contracts = S.p2.contracts.filter((c) => live(c) || S.t - c.end < 60);
}

export const campusDrawSize = () => (S.hype / 100) * Math.max(backlogMW(), 10) * 300000 * (S.done.securitize ? 1.5 : 1);   // lenders size on signed backlog
export const campusDealSize = () => 20000 / newest().kw * gpuPrice();   // Parallax credits: about 20 MW of the newest GPUs

// Saves from before chip generations mattered: default missing fields.
export function migrateCampus() {
  if (!S.p2.model) S.p2.model = freshModel();
  if (!S.p2.people) S.p2.people = freshPeople();
  if (!S.p2.ceo) S.p2.ceo = freshCeo();
  if (!S.p2.town && S.p2.county) S.p2.town = freshTown();
  if (S.p2.startChip == null) S.p2.startChip = S.chipIdx;
  if (S.p2.market == null) S.p2.market = MARKET_START_MW;
  for (const x of [...S.p2.offers, ...S.p2.contracts]) if (x.minGen == null) x.minGen = 0;
}

export function startCampus() {
  if (S.phase === 2) return;
  S.phase = 2; S.p2 = freshP2(); S.p2.startChip = S.chipIdx; S.p2.model = freshModel(); S.p2.people = freshPeople(); S.p2.ceo = freshCeo();
  milestone("phase 2: the campus");
  say("We are an infrastructure company now.");
  say(`Your ${mwText(usedKW() / 1000)} of GPUs stay in the space you already lease. Whatever isn't under contract sells on-demand. The model has opinions about which county is next.`);
  if (S.debt > 0) say(`Lenders love infrastructure. Your ${money(S.debt)} was refinanced as project finance at a quarter of the rate.`);
}

// Phase 2 opens on one question: which county. Nothing runs until it's answered.
export const waitingOnCounty = () => S.phase === 2 && !!S.p2 && !S.p2.county;

export function chooseCounty(id) {
  const c = COUNTIES.find((x) => x.id === id);
  if (!c || S.p2.county) return;
  S.p2.county = c.id; S.p2.grid = c.gridMW; S.funds += c.cash; S.p2.town = freshTown(); offeredPerks();
  makeOffer(true); S.p2.nextOffer = S.t + 90;
  milestone(`county: ${c.name}`); track("county", { id: c.id });
  say(`Bought land in the ${c.name.toLowerCase()} county. The model: “The river is underutilized.”`);
  say("Your old lab spun out. It wants 30 MW in five minutes. Parallax is paying for it, which means Parallax is paying you.");
}

export const campusRevenue = () => (S.p2 ? S.p2.contracts.filter((c) => c.status === "active").reduce((a, c) => a + c.fee, 0) + onDemandRevenue() : 0);

export function stepCampus(dt) {
  S.funds += onDemandRevenue() * dt;
  if (!S.p2.county) return;
  const q = S.p2.queue;
  if (q && S.t >= q.done) {
    S.p2.grid += q.mw; S.p2.queue = null; S.p2.queueN += 1;
    track("power", { ev: "grid", mw: q.mw });
    say(`The utility energized ${mwText(q.mw)} more. The queue is longer now. Everyone is in it.`);
  }
  for (const b of S.p2.builds) {
    if (!b.announced && S.t >= b.done) { b.announced = true; track("build", { ev: "done", kind: b.kind }); say(BUILD_DONE[b.kind]()); }
  }
  if (S.p2.nextColo == null) S.p2.nextColo = S.t + COLO_EVERY[0];
  if (S.p2.aquifer == null) S.p2.aquifer = 100;
  S.p2.aquifer = Math.max(0, S.p2.aquifer - doneBuilds("well") * AQUIFER_DRAIN * dt);
  const dr = countyOf().drought;
  if (S.p2.nextDrought == null) S.p2.nextDrought = S.t + dr[0] + Math.random() * (dr[1] - dr[0]);
  if (S.t >= S.p2.nextDrought) {
    S.p2.drought = { until: S.t + DROUGHT_SECS }; S.p2.nextDrought = S.t + dr[0] + Math.random() * (dr[1] - dr[0]);
    track("water", { ev: "drought" });
    say(`Drought declared. The county cut your water allocation 40% for ${time(DROUGHT_SECS)}. The golf course was exempted.`);
  }
  if (S.t >= S.p2.nextColo) openColo();
  S.p2.offers = S.p2.offers.filter((o) => o.expires > S.t && o.start > S.t);
  if (S.t >= S.p2.nextOffer && S.p2.offers.length < 3) { makeOffer(); S.p2.nextOffer = S.t + (60 + Math.random() * 60) * (S.done.sales2 ? 0.7 : 1) * (S.done.opensource ? 0.8 : 1); }
  stepContracts(dt);
  stepPeople(dt);
  stepRobots();
  stepMarket(dt);
  stepModel();
}

export const campusSnap = () => ({ county: S.p2.county, fleetMW: Math.round(usedKW() / 1000), leasedMW: Math.round(leasedKW() / 1000), market: Math.round(S.p2.market), grid: S.p2.grid, queue: !!S.p2.queue,
  halls: doneBuilds("hall"), turbines: doneBuilds("turbine"), solar: doneBuilds("solar"),
  energizedMW: energizedAt(), acresFree: acresFree(),
  deliveredMW: deliveredMW(), backlogMW: backlogMW(), offers: S.p2.offers.length,
  late: S.p2.contracts.filter((c) => c.status === "late").length, earned: Math.round(S.p2.earned) });

export function renderCampus() {
  const p = S.p2;
  $("coloLine").textContent = `Colo market: ${mwText(Math.max(0, p.market))} available` +
    (p.nextColo ? ` \u00b7 next colo opens in ~${time(Math.max(0, p.nextColo - S.t))}` : "");
  $("leaseColo").textContent = p.market >= COLO_MW ? `Lease ${mwText(COLO_MW)} of colo space: ${money(coloCost())} (${money(coloCost() / (COLO_MW * 1000))}/kW)`
    : `Colo sold out: next one opens in ~${time(Math.max(0, (p.nextColo || S.t) - S.t))}`;
  $("leaseColo").disabled = p.market < COLO_MW || S.funds < coloCost();
  renderFleet();
  $("modelBox").hidden = !p.county;
  if (p.county) renderModel();
  if (!p.county) { $("countLabel").textContent = "Fleet"; $("gpuCount").textContent = `${mwText(usedKW() / 1000)}`; }
  $("countyBox").hidden = !!p.county;
  $("campusBox").hidden = $("contractsBox").hidden = !p.county;
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
  const pw = powerAt(), hallMW = hallMWAt();
  $("countyName").textContent = countyOf().name;
  {
    const wa = waterMWAt(), cap = Math.min(pw, wa);
    const built = doneBuilds("hall"), lit = Math.min(built, Math.floor(cap / hallSize())), dark = built - lit;
    $("halls").textContent = `${built} built: ${lit} energized` +
      (dark > 0 ? `, ${dark} dark (need ${mwText(hallMW - cap)} more ${wa < pw ? "water" : "power"})` : "");
    $("halls").className = dark > 0 ? "bad" : "";
  }
  $("p2power").textContent = `${mwText(pw)} (grid ${fmt(gridAt())}, ${doneBuilds("turbine")} turbines, ${doneBuilds("solar")} solar)`;
  {
    const used = Math.min(hallMWAt(), powerAt()) * WATER_PER_MW, have = waterAt();
    $("p2water").textContent = `${fmt(Math.min(used, have))} of ${fmt(have)} MGD (enough for ${mwText(waterMWAt())}) \u00b7 allocation ${fmt(countyOf().water)}` +
      (droughtOn() ? ` \u00b7 DROUGHT: ${time(p.drought.until - S.t)} left` : "") +
      (doneBuilds("well") ? ` \u00b7 ${doneBuilds("well")} wells, aquifer ${Math.max(0, Math.round(p.aquifer))}%${p.aquifer <= 0 ? " (dry)" : ""}` : "") +
      (doneBuilds("reclaimed") ? ` \u00b7 ${doneBuilds("reclaimed")} reclaimed` : "");
    $("p2water").className = droughtOn() || waterMWAt() < hallMWAt() ? "bad" : "";
    buildBtn("buildWell", "Drill a well", buildCost("well"), `+${WATER.well.mgd} MGD, drains the aquifer`);
    $("buildWell").disabled = S.funds < buildCost("well") || p.aquifer <= 0;
    buildBtn("buildReclaimed", "Reclaimed water plant", buildCost("reclaimed"), `+${WATER.reclaimed.mgd} MGD, ${time(buildSecs("reclaimed"))}`);
    $("buildReclaimed").disabled = S.funds < buildCost("reclaimed");
  }
  {
    const owned = countyOf().acres + (p.landN || 0) * LAND.acres;
    $("land").textContent = `${acresFree().toLocaleString("en-US")} of ${owned.toLocaleString("en-US")} acres free` +
      (p.landN ? ` (${p.landN} parcel${p.landN > 1 ? "s" : ""} bought)` : "");
  }
  {
    // Meters: green with headroom, amber when nearly used, red when it's the bottleneck.
    const meter = (id, used, cap, limiting) => {
      const r = cap > 0 ? used / cap : 1;
      $(id).firstElementChild.style.width = Math.min(100, 100 * r) + "%";
      $(id).className = "meter " + (limiting || r > 1 ? "bad" : r > 0.85 ? "warn" : "good");
    };
    const hallMW = hallMWAt(), pw = powerAt(), wa = waterMWAt(), built = doneBuilds("hall");
    const lit = Math.min(built, Math.floor(Math.min(pw, wa) / hallSize()));
    meter("mHalls", lit, Math.max(built, 1), built > lit);
    meter("mPower", hallMW, pw, hallMW > pw && pw <= wa);
    meter("mWater", hallMW, wa, hallMW > wa && wa < pw);
    const acres = countyOf().acres + (p.landN || 0) * LAND.acres + extraAcres();
    meter("mLand", acres - acresFree(), acres, acresFree() < HALL.acres);
  }
  $("p2limit").textContent = campusLimit();
  if (moratoriumOn()) buildBtn("buildHall", `Moratorium on new halls: ${time(townOf().moratorium - S.t)}`, null, "the county board will \u201crevisit it\u201d");
  else buildBtn("buildHall", "Build a hall", buildCost("hall"), `${hallSize()} MW shell, ${HALL.acres} acres, ${time(buildSecs("hall"))}`);
  $("buildHall").disabled = S.funds < buildCost("hall") || acresFree() < HALL.acres || moratoriumOn();
  buildBtn("buildTurbine", "Gas turbine", buildCost("turbine"), `+${turbineMW()} MW, ${time(buildSecs("turbine"))}`);
  $("buildTurbine").disabled = S.funds < buildCost("turbine");
  buildBtn("buildSolar", "Solar + batteries", buildCost("solar"), `+${solarMW()} MW, ${POWER.solar.acres} acres, ${time(buildSecs("solar"))}`);
  $("buildSolar").disabled = S.funds < buildCost("solar") || acresFree() < POWER.solar.acres;
  if (p.queue) buildBtn("requestQueue", modelDone("utility") ? "Energizing from your utility" : "In the interconnection queue", null, `+${mwText(p.queue.mw)} in ${time(p.queue.done - S.t)}`);
  else if (modelDone("utility")) buildBtn("requestQueue", "Energize from your utility", QUEUE_DEPOSIT, `+${mwText(countyOf().queueMW)}, ${time(queueSecs())}`);
  else buildBtn("requestQueue", "Join the interconnection queue", QUEUE_DEPOSIT, `+${mwText(countyOf().queueMW)} in ~${time(queueSecs())}: the cheapest power, start it early`);
  // The cheapest power in the game: it stands out whenever you're not already waiting in line.
  $("requestQueue").classList.toggle("primary", !p.queue);
  $("requestQueue").disabled = !!p.queue || S.funds < QUEUE_DEPOSIT;
  buildBtn("buyLand", "Buy the adjacent parcel", landCost(), `+${LAND.acres} acres`);
  $("buyLand").disabled = S.funds < landCost();
  const pending = p.builds.filter((b) => b.done > S.t).sort((a, b) => a.done - b.done);
  $("robotLine").hidden = !S.done.robots;
  if (S.done.robots) {
    const rb = p.robotBuilt || { hall: 0, turbine: 0 }, plan = robotPlan();
    const noun = { solar: "solar farm", reclaimed: "water plant", colo: "colo lease", land: "parcel", grid: "grid request" };
    const built = Object.entries(rb).filter(([, n]) => n).map(([k, n]) => `${n} ${noun[k] || k}${n === 1 ? "" : "s"}`);
    const why = plan.u ? ` for ${plan.u.c.who.split(" (")[0]} (${mwText(plan.u.short)} short, due ${plan.u.c.start <= S.t ? "now" : "in " + time(plan.u.c.start - S.t)})` : "";
    $("robotLine").textContent = `Robots: built ${built.length ? built.join(", ") : "nothing yet"} \u00b7 ` +
      (plan.blocked || `next: ${plan.kind === "colo" ? "a colo lease" : "a " + (noun[plan.kind] || plan.kind)} in ${Math.max(0, Math.ceil((p.robotsAt || 0) - S.t))}s`) + why;
  }
  {
    // One line, grouped by kind: "Under construction: 4 halls (next 0:37), 1 solar farm (5:07)".
    const noun = { hall: "hall", turbine: "turbine", solar: "solar farm", well: "well", reclaimed: "water plant" }, by = {};
    for (const b of pending) (by[b.kind] = by[b.kind] || []).push(b);
    $("underway").textContent = pending.length ? "Under construction: " + Object.entries(by).map(([k, bs]) =>
      `${bs.length} ${noun[k] || k}${bs.length === 1 ? "" : "s"} (${bs.length > 1 ? "next " : ""}${time(bs[0].done - S.t)})`).join(", ") : "";
  }
  renderContracts();
}

// The fleet by chip generation: what can serve new contracts, and what is old and only earns on-demand.
export const contractReady = (g) => g >= S.chipIdx - 1;   // offers ask for the newest chip or one behind
export function renderFleet() {
  const free = freeKWByGen();
  const gens = Object.keys(S.fleet).map(Number).filter((g) => S.fleet[g] > 0).sort((a, b) => b - a);
  const kwOf = (g) => S.fleet[g] * chip(g).kw;
  const ready = gens.filter(contractReady), old = gens.filter((g) => !contractReady(g));
  const sum = (list, f) => list.reduce((a, g) => a + f(g), 0);
  $("fleetSummary").textContent = `Contract-ready: ${kwText(sum(ready, kwOf))} (${kwText(sum(ready, (g) => free[g] || 0))} free) \u00b7 ` +
    `Old: ${kwText(sum(old, (g) => free[g] || 0))} free, earning on-demand \u00b7 Room: ${kwText(Math.max(0, capKW() - usedKW()))}`;
  const tradeable = (g) => g < S.chipIdx && tradeCount(g) > 0;   // any chip older than the newest, if some are free
  rebuildOn("fleetRows", gens.map((g) => `${g}:${contractReady(g)}:${tradeable(g)}`).join(","), (el) => {
    el.innerHTML = gens.length ? "" : `<div class="empty">No GPUs. Buy some under Compute.</div>`;
    for (const g of gens) {
      const d = document.createElement("div"); d.className = "deal"; d.dataset.gen = String(g);
      d.innerHTML = `<div class="line fl"></div>` + (tradeable(g)
        ? `<div class="btns"><button type="button" data-tradegen="${g}"></button></div>` : "");
      el.appendChild(d);
    }
  });
  for (const d of $("fleetRows").querySelectorAll("[data-gen]")) {
    const g = Number(d.dataset.gen); if (!S.fleet[g]) continue;
    const under = kwOf(g) - (free[g] || 0);
    const status = (contractReady(g) ? "contract-ready" : "old") + (under > 1 ? `, ${kwText(under)} under contract` : "") +
      (contractReady(g) ? "" : under >= kwOf(g) - 1 ? "" : ", the rest on-demand");
    const fl = d.querySelector(".fl");
    fl.className = "line fl " + (contractReady(g) ? "good" : "");
    fl.textContent = `${chip(g).name} \u00b7 ${S.fleet[g].toLocaleString("en-US")} GPUs \u00b7 ${kwText(kwOf(g))} \u00b7 ${status} \u00b7 ` +
      `${money(odRate(g) * OD_UTIL)}/MW-s on-demand`;
    const b = d.querySelector("[data-tradegen]");
    if (b) {
      // What a swap buys: the same megawatts of the newest chip earn more on-demand (and qualify for new contracts).
      const n = tradeCount(g), mw = n * chip(g).kw / 1000, now = mw * odRate(g) * OD_UTIL, then = mw * odRate(S.chipIdx) * OD_UTIL;
      const refill = Math.max(0, Math.floor(mw * 1000 / newest().kw) * gpuPrice() - tradeValue(g)), gain = then - now;
      const away = S.block && S.block.until > S.t;
      b.disabled = away || n <= 0;
      b.innerHTML = away
        ? `<span class="t">Out on a spot lease: back in ${time(S.block.until - S.t)}</span><span class="c">GPUs on the spot market can't be traded in until they're home.</span>`
        : `<span class="t">Trade in ${n.toLocaleString("en-US")}: ${money(tradeValue(g))} in credits, frees ${kwText(n * chip(g).kw)}</span>` +
          `<span class="c">${money(now)}/s now; newest would earn ${money(then)}/s. Refill ${money(refill)}` +
          (gain > 0 ? `, pays back in ${time(refill / gain)}` : ", never pays back") + `</span>`;
    }
  }
}

// The single most useful thing to do right now, in plain words.
export function nextMove() {
  const first = (who) => who.split(" (")[0];
  const cap = (x) => x[0].toUpperCase() + x.slice(1);
  // What a contract still needs, after the contracts ahead of it in line take their share.
  const needOf = contractNeed;
  const late = S.p2.contracts.find((c) => c.status === "late" && needOf(c) > 0.01);
  const soon = S.p2.contracts.filter((c) => c.status === "waiting" && c.start - S.t < 120).sort((a, b) => a.start - b.start)
    .find((c) => needOf(c) > 0.01);
  const target = late || soon;
  if (target) {
    const need = needOf(target);
    const how = roomMWAt(S.t) >= need ? `buy ${mwText(need)} of ${newest().name}s under Compute`
      : tradeableMW(target.minGen || 0) > 0 ? "trade in old chips under Fleet, then buy new ones"
      : S.p2.market >= COLO_MW ? "lease colo, then buy GPUs" : "build halls and power, or push the date";
    return `${late ? "Late" : "Due soon"}: ${first(target.who)} needs ${mwText(need)} more of ${genName(target.minGen || 0)}. ${cap(how)}.`;
  }
  const good = S.p2.offers.find((o) => forecast(o).ok);
  if (good) return `Sign ${first(good.who)}'s offer: ${forecast(good).text.replace("\u2713 ", "")}`;
  // The goal, counting what's already under construction and queued.
  if (S.p2.model && S.p2.model.endedAt == null && energizedAt() >= GOAL_MW && !isPublic())
    return "The campus is done. Ring the bell (IPO) under Investors to finish phase 2.";
  if (S.p2.model && S.p2.model.endedAt == null && energizedAt() < GOAL_MW) {
    const halls = Math.ceil(Math.max(0, GOAL_MW - hallMWAt(Infinity)) / hallSize());
    const power = Math.max(0, GOAL_MW - powerAt(Infinity));
    const turbines = Math.ceil(power / turbineMW());
    const nextCost = halls > 0 ? buildCost("hall") : buildCost("turbine");
    if ((halls > 0 || turbines > 0) && S.funds >= nextCost) {
      const cost = halls * buildCost("hall") + turbines * buildCost("turbine");
      const what = [halls > 0 && `${halls} more hall${halls > 1 ? "s" : ""}`, turbines > 0 && `${mwText(power)} more power`].filter(Boolean).join(" and ");
      return `Goal: ${what} reach the 1 GW goal (\u2248${money(cost)}). Build them under Campus.`;
    }
  }
  // In froth, spending hype on honesty lets the bubble down before a reality check pops it.
  if (S.hype > 100) {
    const calm = PROJECTS.find((p) => p.phase === 2 && p.hype && !S.done[p.id] && p.when() && S.hype >= p.hype + 5);
    if (calm) return `Froth: spend hype on \u201c${calm.title}\u201d (\u2212${calm.hype} hype) before a reality check does it for you. ${calm.desc}`;
  }
  const project = PROJECTS.filter((p) => p.phase === 2 && !p.hype && !S.done[p.id] && p.when() && S.funds >= projectCost(p)).sort((a, b) => projectCost(a) - projectCost(b))[0];
  if (project) return `Buy the \u201c${project.title}\u201d project (${projectCost(project) ? money(projectCost(project)) : "free"}): ${project.desc}`;
  const room = roomMWAt(S.t);
  if (room < 5) {
    const oldGens = Object.keys(S.fleet).map(Number).some((g) => !contractReady(g) && tradeCount(g) > 0);
    if (oldGens) return "Space is full. Trade in old chips under Fleet to make room for new ones, or keep them earning on-demand and add space.";
    if (S.p2.market >= COLO_MW) return "Space is full. Lease colo, or build campus halls with power, to grow.";
    return "Space is full and colo is sold out. Build halls and power on your campus.";
  }
  if (S.funds + S.credits > gpuPrice() * 10) return `You have room for ${mwText(room)}. Buy GPUs: they earn on-demand until a contract needs them.`;
  return "Wait for offers. Post to keep hype up: raises and debt draws need it.";
}

export function renderContracts() {
  const p = S.p2;
  $("nextMove").textContent = `Next: ${nextMove()}`;
  $("countLabel").textContent = "Delivered";
  $("gpuCount").textContent = `${mwText(deliveredMW())}`;
  $("gpuTotal").textContent = `${S.gpus.toLocaleString("en-US")} GPUs`;
  $("backlog").textContent = `${mwText(backlogMW())}`;
  $("delivered").textContent = `${mwText(deliveredMW())} of ${mwText(usedKW() / 1000)} of GPUs`;
  $("p2rev").textContent = `${money(campusRevenue())}/s (${money(onDemandRevenue())}/s of it on-demand)`;
  // Rebuild rows only when the set changes, so a click never lands on a button that was just replaced.
  rebuildOn("offers", p.offers.map((o) => o.id).join(","), (el) => {
    el.innerHTML = p.offers.length ? "" : `<div class="empty">No offers right now. They come every minute or two.</div>`;
    for (const o of p.offers) {
      const d = document.createElement("div"); d.className = "deal"; d.dataset.offer = o.id;
      d.innerHTML = `<div class="line what"></div><div class="row"><span class="line sub fc"></span>` +
        `<button type="button" class="primary" data-accept="${o.id}"></button><button type="button" data-decline="${o.id}">Pass</button></div>`;
      el.appendChild(d);
    }
  });
  for (const d of $("offers").querySelectorAll("[data-offer]")) {
    const o = p.offers.find((x) => x.id === d.dataset.offer); if (!o) continue;
    const f = forecast(o);
    d.querySelector(".what").textContent = `${o.who}: ${mwText(o.mw)} of ${genName(o.minGen)} for ${time(o.term)}, starts in ${time(o.start - S.t)}, ${money(o.fee)}/s.`;
    const fc = d.querySelector(".fc");
    fc.className = "line sub fc " + forecastClass(f);
    fc.textContent = f.text;
    d.querySelector("[data-accept]").textContent = `Sign: ${money(o.upfront)} up front`;
    d.querySelector("[data-decline]").textContent = `Pass (${Math.ceil(o.expires - S.t)}s left)`;
  }
  // Running contracts collapse into one line; only contracts that can still need you are listed.
  const running = p.contracts.filter((c) => c.status === "active");
  $("runningSummary").hidden = !running.length;
  if (running.length) {
    const soonest = Math.min(...running.map((c) => c.end - S.t));
    $("runningSummary").textContent = `${running.length} contract${running.length > 1 ? "s" : ""} delivering ${mwText(running.reduce((a, c) => a + c.mw, 0))} \u00b7 ` +
      `${money(running.reduce((a, c) => a + c.fee, 0))}/s \u00b7 next ends in ${time(Math.max(0, soonest))}`;
  }
  const shown = p.contracts.filter((c) => c.status === "waiting" || c.status === "late");
  rebuildOn("contracts", shown.map((c) => `${c.id}:${c.status}:${c.reneg}`).join(","), (el) => {
    el.innerHTML = shown.length || running.length ? "" : `<div class="empty">Nothing signed.</div>`;
    for (const c of shown) {
      const d = document.createElement("div"); d.className = "deal"; d.dataset.contract = c.id;
      d.innerHTML = `<div class="row"><span class="line st"></span>` + (!c.reneg && c.status !== "active"
        ? `<button type="button" data-reneg="${c.id}">Push ${time(RENEGOTIATE_SECS)} (−${RENEGOTIATE_HYPE} hype)</button>` : "") + `</div>`;
      el.appendChild(d);
    }
  });
  for (const d of $("contracts").querySelectorAll("[data-contract]")) {
    const c = p.contracts.find((x) => x.id === d.dataset.contract); if (!c) continue;
    const st = d.querySelector(".st"), who = c.who.split(" (")[0], late = S.t - c.start;
    if (c.status === "active") { st.className = "line st good"; st.textContent = `${who}: ${mwText(c.mw)} delivered, ${money(c.fee)}/s, ends in ${time(c.end - S.t)}`; }
    else if (c.status === "late") {
      st.className = "line st bad";
      st.textContent = `LATE ${time(late)}: ${who}, ${mwText(c.mw)}. ` +
        (late < LATE_FREE ? "Free for now." : `Paying penalties. Walks in ${time(Math.max(0, LATE_DEFAULT - late))}.`);
    } else {
      const f = forecast(c);
      st.className = "line st " + forecastClass(f);
      st.textContent = `${who}: ${mwText(c.mw)}, starts in ${time(c.start - S.t)}. ` +
        (f.kind === "hand" ? "✓ covered" : f.ok ? `✓ buy ${mwText(f.buy)} of GPUs` : f.text);
    }
  }
}

// Phase 2's share of the screen, after the company panels (renderCompany in main.js).
export function renderCampusPhase() { $("ending").hidden = true; renderCampus(); }
// The Investors panel's notes and buttons, dressed for an infrastructure company.
export const roundNoteCampus = () => { const nr = campusRound(); return nr ? `${nr.name} at ${HYPE_TO_RAISE} with ${mwText(nr.backlog)} backlog` : isPublic() ? `follow-ons at ${HYPE_TO_RAISE}` : `IPO at ${HYPE_TO_RAISE}`; };
export const spotLineCampus = (m) => `${money(OD_RATE * genPrice(S.chipIdx) * m)}/MW-s for ${newest().name}s (${m.toFixed(1)}x on-demand)`;
export function renderRaiseCampus() {
  const r = campusRound();
  if (!r) return renderPublicRaise();
  const gap = roundGap(r);
  $("raise").hidden = false;
  $("raise").textContent = gap ? `${r.name} needs ${gap}` : S.hype >= HYPE_TO_RAISE ? `Raise the ${r.name}: ${money(r.amount)}` : `${r.name} needs hype ${HYPE_TO_RAISE}+`;
  $("raise").disabled = !!gap || S.hype < HYPE_TO_RAISE;
}

export function wireCampus() {
  wireModel();
  wireMarket();
  $("vendors").addEventListener("click", (e) => { const b = hit(e, "button[data-vendor]"); if (b) { pickVendor(b.dataset.vendor); render(); } });
  $("sponsor").addEventListener("click", () => { sponsor(); render(); });
  $("perks").addEventListener("click", (e) => { const b = hit(e, "button[data-perk]"); if (b) { usePerk(b.dataset.perk); render(); } });
  $("cardBtns").addEventListener("click", (e) => { const b = hit(e, "button[data-choice]"); if (b) { chooseCard(Number(b.dataset.choice)); render(); } });
  $("counties").addEventListener("click", (e) => {
    const b = hit(e, "button[data-county]");
    if (b) { chooseCounty(b.dataset.county); $q(".cols").classList.add("reveal"); render(); }
  });
  $("buildHall").addEventListener("click", () => { build("hall"); render(); });
  $("buildTurbine").addEventListener("click", () => { build("turbine"); render(); });
  $("buildSolar").addEventListener("click", () => { build("solar"); render(); });
  $("buildWell").addEventListener("click", () => { build("well"); render(); });
  $("buildReclaimed").addEventListener("click", () => { build("reclaimed"); render(); });
  $("requestQueue").addEventListener("click", () => { requestQueue(); render(); });
  $("buyLand").addEventListener("click", () => { buyLand(); render(); });
  $("leaseColo").addEventListener("click", () => { leaseColo(); render(); });
  $("offers").addEventListener("click", (e) => {
    const a = hit(e, "button[data-accept]"), d = hit(e, "button[data-decline]");
    if (a) { acceptOffer(a.dataset.accept); render(); } else if (d) { declineOffer(d.dataset.decline); render(); }
  });
  $("fleetRows").addEventListener("click", (e) => {
    const b = hit(e, "button[data-tradegen]");
    if (b) { tradeIn(Number(b.dataset.tradegen)); render(); }
  });
  $("contracts").addEventListener("click", (e) => {
    const b = hit(e, "button[data-reneg]");
    if (b) { renegotiate(b.dataset.reneg); render(); }
  });
}

// ---------- server vendors (phase 2): who racks your GPUs. Made up; any resemblance is a supply-chain coincidence. ----------
export const VENDORS = [
  { id: "monolith", name: "Monolith Systems", price: 1, fire: 1, leak: 1, blurb: "list price",
    quip: "Monolith Systems it is. The racks come with a 900-page manual and a sales rep who calls on Sundays." },
  { id: "gridiron", name: "Gridiron Server Co.", price: 0.85, fire: 0.6, leak: 0.7, blurb: "15% off, more fires",
    quip: "Switched to Gridiron Server Co. The racks arrive pre-scratched and the cable management is “artisanal.” Fires will happen more often." },
  { id: "nimbus", name: "Nimbus Assembly", price: 1.15, fire: 1.6, leak: 1.6, blurb: "15% more, fewer incidents",
    quip: "Switched to Nimbus Assembly. Each rack ships with a white-glove technician who will not stop talking about torque specs." },
];
// fire/leak are multipliers on the time between incidents: below 1 means more often.
export const vendorOf = () => (S.phase === 2 && S.p2 && VENDORS.find((v) => v.id === S.p2.vendor)) || VENDORS[0];
export function pickVendor(id) {
  if (S.phase !== 2 || !VENDORS.some((v) => v.id === id) || vendorOf().id === id) return;
  S.p2.vendor = id;
  track("vendor", { id });
  say(vendorOf().quip);
}
// Campus buttons: name and price on top, the details underneath.
export function buildBtn(id, name, cost, detail) {
  setHtml(id, `<span class="t">${name}${cost != null ? ": " + money(cost) : ""}</span><span class="c">${detail}</span>`);
}
export function renderVendors() {
  const on = S.phase === 2 && !!S.p2 && !!S.p2.county;
  $("vendorRow").hidden = !on;
  if (!on) return;
  const cur = vendorOf().id;
  setHtml("vendors", VENDORS.map((v) => `<button type="button" data-vendor="${v.id}" class="${v.id === cur ? "on" : ""}" aria-pressed="${v.id === cur}" title="${v.blurb}"><span class="t">${v.name}</span><span class="c">${v.blurb}</span></button>`).join(""));
}
