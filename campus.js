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
const MARKET_START_MW = 150, MARKET_REGROW = 10 / 60;   // leasable MW left in this market; new colos open slowly
const OD_RATE = 300, OD_DECAY = 0.7, OD_FLOOR = 0.15, OD_UTIL = 0.8;   // on-demand $/MW/s for the newest chip; older gens earn less but stay busy
const P2_RATE = 0.25;     // phase 1 debt is refinanced as project finance at a quarter of the facility's rate
const HALL = { mw: 50, acres: 20, cost: 10e6, secs: 90 };   // a powered shell: GPUs are bought separately and racked in it
const POWER = {
  turbine: { name: "gas turbine", mw: 50, cost: 25e6, secs: 60, acres: 0 },
  solar: { name: "solar + batteries", mw: 30, cost: 20e6, secs: 180, acres: 150 },
};
const QUEUE_DEPOSIT = 5e6, QUEUE_GROWTH = 1.3;             // each request waits 30% longer: everyone is in the queue
const BUILD_DONE = {
  hall: () => `Hall ${doneBuilds("hall")} is up. ` +
    (hallMWAt() > powerAt() ? "It has no power yet. It is a very expensive shed." : "Energized. Rack some GPUs in it."),
  turbine: () => "A gas turbine came online. The neighbors can hear it.",
  solar: () => "The solar farm is live. It works about a third of the time; the batteries cover the rest, mostly.",
};
const UPFRONT_RATE = 550;    // $ per MW-second of the term, paid when you sign
const FEE_RATE = 275;        // $ per MW per second while delivered
const OFFER_TTL = 60;        // offers wait at least this long before walking (spec: never under 45 s)
const LATE_FREE = 60, LATE_DEFAULT = 180, RENEGOTIATE_SECS = 120, RENEGOTIATE_HYPE = 5;
const CUSTOMERS = [
  "Your old lab (Parallax is paying)", "A lab funded by Parallax", "PivotCloud, subleasing to its own customers",
  "A sovereign AI fund", "A lab you have never heard of with $4B", "A chatbot company that is also a hardware company",
];

const freshP2 = () => ({
  county: null, market: MARKET_START_MW, round: 0, grid: 0, queue: null, queueN: 0, builds: [],
  offers: [], contracts: [], nextOffer: 0, offerN: 0, contractN: 0, earned: 0,
});
const countyOf = () => COUNTIES.find((c) => c.id === S.p2.county);
const doneBuilds = (kind, at = S.t) => S.p2.builds.filter((b) => b.kind === kind && b.done <= at).length;
const gridAt = (at = S.t) => S.p2.grid + (S.p2.queue && S.p2.queue.done <= at ? S.p2.queue.mw : 0);
const powerAt = (at = S.t) => gridAt(at) + doneBuilds("turbine", at) * POWER.turbine.mw + doneBuilds("solar", at) * POWER.solar.mw;
const hallMWAt = (at = S.t) => doneBuilds("hall", at) * HALL.mw;
const energizedAt = (at = S.t) => Math.min(hallMWAt(at), powerAt(at));
const campusKWAt = (at = S.t) => (S.p2 && S.p2.county ? energizedAt(at) * 1000 : 0);
const marketHas = (i) => unitKW(i) / 1000 <= S.p2.market;
function takeFromMarket(i) { S.p2.market -= unitKW(i) / 1000; }
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
const acresUsed = () => S.p2.builds.reduce((a, b) => a + (b.kind === "hall" ? HALL.acres : POWER[b.kind].acres), 0);
const acresFree = () => countyOf().acres - acresUsed();
const queueSecs = () => countyOf().queueSecs * Math.pow(QUEUE_GROWTH, S.p2.queueN);

function build(kind) {
  const spec = kind === "hall" ? HALL : POWER[kind];
  if (!spec || !S.p2.county || spec.acres > acresFree() || S.funds < spec.cost) return;
  S.funds -= spec.cost;
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

const live = (c) => c.status !== "done" && c.status !== "defaulted";
const deliveredMW = () => S.p2.contracts.filter((c) => c.status === "active").reduce((a, c) => a + c.mw, 0);
const backlogMW = () => S.p2.contracts.filter((c) => c.status === "waiting" || c.status === "late").reduce((a, c) => a + c.mw, 0);
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

function makeOffer(first = false) {
  const n = ++S.p2.offerN;
  const scale = Math.max(20, 0.3 * (usedKW() / 1000 + 40));
  const minGen = first ? 0 : Math.max(0, S.chipIdx - (Math.random() < 0.4 ? 1 : 0));   // labs want current chips
  const mw = first ? 30 : Math.max(10, Math.round(scale * (0.6 + Math.random() * 0.8) / 10) * 10);
  const startsIn = first ? 300 : 240 + Math.floor(Math.random() * 180);
  const term = 480 + Math.floor(Math.random() * 420);
  const who = first ? CUSTOMERS[0] : CUSTOMERS[1 + Math.floor(Math.random() * (CUSTOMERS.length - 1))];
  S.p2.offers.push({ id: `o${n}`, n, who, mw, minGen, start: S.t + startsIn, term,
    upfront: mw * term * UPFRONT_RATE, fee: mw * FEE_RATE, expires: S.t + (first ? 280 : OFFER_TTL) });
  track("contract", { ev: "offer", mw });
}

function acceptOffer(id) {
  const i = S.p2.offers.findIndex((o) => o.id === id);
  if (i < 0) return;
  const o = S.p2.offers.splice(i, 1)[0];
  const n = ++S.p2.contractN;
  S.funds += o.upfront;
  S.p2.contracts.push({ id: `c${n}`, n, who: o.who, mw: o.mw, minGen: o.minGen, start: o.start, end: o.start + o.term,
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
  const term = c.end - c.start;
  c.start = (c.status === "late" ? S.t : c.start) + RENEGOTIATE_SECS;   // late: two minutes from now, not from the missed date
  c.end = c.start + term; c.reneg = true; c.warned = false; c.status = "waiting";
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
    const free = eligibleFreeMW(c.minGen || 0);
    if (free >= c.mw) {
      c.activeAt = S.t;
      track("contract", { ev: "start", mw: c.mw, late: Math.round(S.t - c.start) });
      say(c.status === "late" ? `Finally delivered ${fmt(c.mw)} MW to ${c.who.split(" (")[0]}. They pretend it was on time.` : `Delivered ${fmt(c.mw)} MW to ${c.who.split(" (")[0]}. The meter is running.`);
      c.status = "active";
      continue;
    }
    const late = S.t - c.start;
    if (c.status === "waiting") {
      c.status = "late"; track("contract", { ev: "late", mw: c.mw });
      say(`${c.who.split(" (")[0]} wanted ${fmt(c.mw)} MW today and you are short ${fmt(c.mw - Math.max(0, free))} MW of ${genName(c.minGen || 0)} (${roomMWAt(S.t) > 0 ? "buy GPUs" : "lease or build space"}). The first minute is on the house.`);
    }
    if (late > LATE_FREE) { S.funds -= 0.5 * c.fee * dt; S.hype = Math.max(5, S.hype - 0.05 * dt); }
    if (!c.warned && late >= LATE_DEFAULT - 60) { c.warned = true; say(`${c.who.split(" (")[0]} walks in 60s unless you deliver ${fmt(c.mw)} MW or push the date.`); }
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

const campusDrawSize = () => (S.hype / 100) * Math.max(backlogMW(), 10) * 300000;   // lenders size on signed backlog
const campusDealSize = () => 20e6;   // Parallax credits: GPUs only

function startCampus() {
  if (S.phase === 2) return;
  S.phase = 2; S.p2 = freshP2();
  milestone("phase 2: the campus");
  say("We are an infrastructure company now.");
  say(`Your ${fmt(usedKW() / 1000)} MW of GPUs stay in the space you already lease. Whatever isn't under contract sells on-demand. The model has opinions about which county is next.`);
  if (S.debt > 0) say(`Lenders love infrastructure. Your ${money(S.debt)} was refinanced as project finance at a quarter of the rate.`);
}

function chooseCounty(id) {
  const c = COUNTIES.find((x) => x.id === id);
  if (!c || S.p2.county) return;
  S.p2.county = c.id; S.p2.grid = c.gridMW; S.funds += c.cash;
  makeOffer(true); S.p2.nextOffer = S.t + 90;
  milestone(`county: ${c.name}`); track("county", { id: c.id });
  say(`Bought land in the ${c.name.toLowerCase()} county. The model: “The river is underutilized.”`);
  say("Your old lab spun out. It wants 30 MW in five minutes. Parallax is paying for it, which means Parallax is paying you.");
}

const campusRevenue = () => (S.p2 ? S.p2.contracts.filter((c) => c.status === "active").reduce((a, c) => a + c.fee, 0) + onDemandRevenue() : 0);

function stepCampus(dt) {
  if (S.p2.market == null) S.p2.market = MARKET_START_MW;   // Plan 1 saves
  S.funds += onDemandRevenue() * dt;
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
  S.p2.market += MARKET_REGROW * dt;
  S.p2.offers = S.p2.offers.filter((o) => o.expires > S.t && o.start > S.t);
  if (S.t >= S.p2.nextOffer && S.p2.offers.length < 3) { makeOffer(); S.p2.nextOffer = S.t + 60 + Math.random() * 60; }
  stepContracts(dt);
}

const campusSnap = () => ({ county: S.p2.county, fleetMW: Math.round(usedKW() / 1000), leasedMW: Math.round(leasedKW() / 1000), market: Math.round(S.p2.market), grid: S.p2.grid, queue: !!S.p2.queue,
  halls: doneBuilds("hall"), turbines: doneBuilds("turbine"), solar: doneBuilds("solar"),
  energizedMW: energizedAt(), acresFree: acresFree(),
  deliveredMW: deliveredMW(), backlogMW: backlogMW(), offers: S.p2.offers.length,
  late: S.p2.contracts.filter((c) => c.status === "late").length, earned: Math.round(S.p2.earned) });

function renderCampus() {
  const p = S.p2;
  if (!p.county) { $("countLabel").textContent = "Fleet"; $("gpuCount").textContent = `${fmt(usedKW() / 1000)} MW`; }
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
  $("halls").textContent = `${doneBuilds("hall")} built, ${fmt(energizedAt())} MW energized` +
    (hallMW > pw ? `, ${fmt(hallMW - pw)} MW dark` : "");
  $("p2power").textContent = `${fmt(pw)} MW (grid ${fmt(gridAt())}, ${doneBuilds("turbine")} turbines, ${doneBuilds("solar")} solar)`;
  $("land").textContent = `${acresFree().toLocaleString("en-US")} of ${countyOf().acres.toLocaleString("en-US")} acres free`;
  $("p2cap").textContent = `${fmt(leasedKW() / 1000)} MW leased + ${fmt(energizedAt())} MW campus; ${fmt(usedKW() / 1000)} MW of GPUs racked, room for ${fmt(Math.max(0, capKW() - usedKW()) / 1000)} MW more`;
  $("p2limit").textContent = campusLimit();
  $("buildHall").textContent = `Build a hall (${HALL.mw} MW, ${HALL.acres} acres, ${time(HALL.secs)}): ${money(HALL.cost)}`;
  $("buildHall").disabled = S.funds < HALL.cost || acresFree() < HALL.acres;
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
  renderContracts();
}

let lastOfferKey = null, lastContractKey = null;
function renderContracts() {
  const p = S.p2;
  $("countLabel").textContent = "Delivered";
  $("gpuCount").textContent = `${fmt(deliveredMW())} MW`;
  $("backlog").textContent = `${fmt(backlogMW())} MW`;
  $("delivered").textContent = `${fmt(deliveredMW())} of ${fmt(usedKW() / 1000)} MW of GPUs`;
  $("p2rev").textContent = `${money(campusRevenue())}/s (${money(onDemandRevenue())}/s of it on-demand)`;
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
    d.querySelector(".what").textContent = `${o.who}: ${fmt(o.mw)} MW of ${genName(o.minGen)} for ${time(o.term)}, starts in ${time(o.start - S.t)}. ${money(o.fee)}/s while delivered.`;
    const fc = d.querySelector(".fc");
    fc.className = "line sub fc " + (f.ok ? "good" : "bad");
    fc.textContent = `${f.text} Offer good for ${Math.ceil(o.expires - S.t)}s.`;
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
      st.textContent = `${who}: ${fmt(c.mw)} MW, starts in ${time(c.start - S.t)}. ` +
        (f.kind === "hand" ? "✓ covered" : f.ok ? `✓ buy ${fmt(f.buy)} MW of GPUs` : f.text);
    }
  }
}

function wireCampus() {
  $("counties").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-county]");
    if (b) { chooseCounty(b.dataset.county); render(); }
  });
  $("buildHall").addEventListener("click", () => { build("hall"); render(); });
  $("buildTurbine").addEventListener("click", () => { build("turbine"); render(); });
  $("buildSolar").addEventListener("click", () => { build("solar"); render(); });
  $("requestQueue").addEventListener("click", () => { requestQueue(); render(); });
  $("offers").addEventListener("click", (e) => {
    const a = e.target.closest("button[data-accept]"), d = e.target.closest("button[data-decline]");
    if (a) { acceptOffer(a.dataset.accept); render(); } else if (d) { declineOffer(d.dataset.decline); render(); }
  });
  $("contracts").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-reneg]");
    if (b) { renegotiate(b.dataset.reneg); render(); }
  });
}
