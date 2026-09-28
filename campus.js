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
