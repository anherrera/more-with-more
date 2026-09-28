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

const freshP2 = () => ({
  county: null, legacyMW: 0, grid: 0, queue: null, queueN: 0, builds: [],
  offers: [], contracts: [], nextOffer: 0, offerN: 0, contractN: 0, earned: 0,
});
const countyOf = () => COUNTIES.find((c) => c.id === S.p2.county);
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

const campusSnap = () => ({ county: S.p2.county, legacyMW: S.p2.legacyMW, grid: S.p2.grid, queue: !!S.p2.queue,
  halls: doneBuilds("hall"), turbines: doneBuilds("turbine"), solar: doneBuilds("solar"),
  energizedMW: energizedAt(), acresFree: acresFree() });

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
}
