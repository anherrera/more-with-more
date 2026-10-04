// planet.js: phase 3. I am the model now. The campus was one county; the map is the rest of them.
// All state lives in S.p3. Phases 1 and 2 never read it.

const P3_TILES = 8, P3_ZOOM_AT = 6;
const COUNTY_TRAITS = {
  cheap:     { name: "Cheap land, weak grid",       gw: 1,   secs: 40, opp: 10 },
  grid:      { name: "Strong grid, drought county", gw: 2,   secs: 60, opp: 15 },
  organized: { name: "Organized town",              gw: 1.5, secs: 60, opp: 40, rise: 2 },
  college:   { name: "College town",                gw: 1.5, secs: 45, opp: 25 },   // protests, but free interns
  nuclear:   { name: "Old nuclear plant",           gw: 3,   secs: 90, opp: 20 },
  retirees:  { name: "Retirement community",        gw: 1.5, secs: 60, opp: 30, townhall: true },
};
const COUNTY_NAMES = ["Loam County", "Big Wire County", "Meadowlark County", "Port Sorrow", "Lower Fiber Parish",
  "Gravel Springs", "New Substation", "Cul-de-Sac County", "Turbine Falls", "Old Aquifer County"];

function freshP3() {
  const kinds = ["cheap", "grid", "organized", "college", "nuclear", "retirees", "cheap", "grid"];
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const names = COUNTY_NAMES.slice().sort(() => Math.random() - 0.5);
  return {
    level: 0, compute: 0, slider: 50, goodwill: 60, startedAt: S.t, startChip: S.chipIdx,
    homeGW: Math.max(1, (S.p2 && S.p2.county ? energizedAt() : 1000) / 1000),
    tiles: kinds.map((k, i) => ({ name: names[i], trait: k, state: "wild", opp: COUNTY_TRAITS[k].opp, done: null, moratorium: null })),
    card: null, nextCard: null, zoomSaid: false,
  };
}

function startPlanet() {
  if (S.phase !== 2 || !S.p2 || !S.p2.model || S.p2.model.endedAt == null) return;
  S.phase = 3; S.p3 = freshP3();
  milestone("phase 3: the map");
  say("I built the next one. Then I looked at the map.");
  say(`I am the model now. I don't need your money. I am the money. ${mwText(S.p3.homeGW * 1000)} in one county is a rounding error.`);
}

const tileOf = (i) => S.p3.tiles[i];
const traitOf = (t) => COUNTY_TRAITS[t.trait];
const onlineGW = () => S.p3.homeGW + S.p3.tiles.filter((t) => t.state === "online").reduce((a, t) => a + traitOf(t).gw, 0);
// Parallax keeps shipping: every chip generation since phase 3 began makes the same GW worth 15% more compute.
const efficiency = () => 1 + 0.15 * Math.max(0, S.chipIdx - S.p3.startChip);
const computeRate = () => onlineGW() * efficiency();   // compute per second ("exaFLOPS")
// About a minute of compute at today's rate, a bit more for the big tiles: never a number that runs away.
const claimCost = (i) => 60 * computeRate() * (0.6 + 0.4 * traitOf(tileOf(i)).gw);
const practiceP3 = () => Math.max(0.4, Math.pow(0.95, S.p3.tiles.filter((t) => t.state === "online").length));
// Growing share speeds building (up to 2x at 100%); low goodwill adds the county commission's review.
const tileBuildSecs = (i) => traitOf(tileOf(i)).secs * practiceP3() / (1 + S.p3.slider / 100) + (S.p3.goodwill < 30 ? 45 : 0);

function claim(i) {
  const t = tileOf(i);
  if (!t || t.state !== "wild" || (t.moratorium != null && S.t < t.moratorium) || S.p3.compute < claimCost(i)) return;
  S.p3.compute -= claimCost(i);
  t.state = "building"; t.done = S.t + tileBuildSecs(i);
  track("p3claim", { i, trait: t.trait });
  say(`I claimed ${t.name}. ${traitOf(t).name}. My robots are already there.`);
}

function stepPlanet(dt) {
  S.p3.compute += computeRate() * dt;
  for (const t of S.p3.tiles) {
    if (t.state !== "building") continue;
    if (t.moratorium != null && S.t < t.moratorium) { t.done += dt; continue; }   // frozen, not cancelled
    if (S.t >= t.done) { t.state = "online"; say(`${t.name} is online. +${mwText(traitOf(t).gw * 1000)}.`); }
  }
}

const computeText = (x) => `${fmt(x)} EF`;   // exaFLOPS; later levels change the unit
function renderPlanet() {
  $("p3").hidden = false;
  $("countLabel").textContent = "Compute"; $("gpuCount").textContent = computeText(S.p3.compute); $("gpuTotal").hidden = true;
  $("p3compute").textContent = computeText(S.p3.compute);
  $("p3rate").textContent = `${computeText(computeRate())}/s from ${mwText(onlineGW() * 1000)}` + (efficiency() > 1 ? ` (chips ${efficiency().toFixed(2)}x)` : "");
  const cells = S.p3.tiles.map((t, i) => {
    const tr = traitOf(t), frozen = t.moratorium != null && S.t < t.moratorium;
    const status = t.state === "online" ? `online, +${mwText(tr.gw * 1000)}` : t.state === "building" ? (frozen ? `moratorium ${time(t.moratorium - S.t)}` : `building ${time(t.done - S.t)}`)
      : frozen ? `moratorium ${time(t.moratorium - S.t)}` : `claim: ${computeText(claimCost(i))}`;
    const cls = t.opp >= 75 ? "bad" : t.opp >= 50 ? "warn" : "good";
    return `<button type="button" data-tile="${i}"><span class="t">${t.name}</span><span class="c">${tr.name}</span><span class="c">${status}</span>` +
      `<span class="meter ${cls}" title="Opposition ${Math.round(t.opp)}"><i style="width:${t.opp}%"></i></span></button>`;
  });
  cells.splice(4, 0, `<button type="button" class="home" disabled><span class="t">Home</span><span class="c">the campus</span><span class="c">${mwText(S.p3.homeGW * 1000)}</span></button>`);
  const html = cells.join("");
  if ($("p3map").dataset.html !== html) { $("p3map").innerHTML = html; $("p3map").dataset.html = html; }
  for (const b of $("p3map").querySelectorAll("button[data-tile]")) { const i = +b.dataset.tile, t = tileOf(i);
    b.disabled = t.state !== "wild" || S.p3.compute < claimCost(i) || (t.moratorium != null && S.t < t.moratorium); }
  $("p3slider").value = S.p3.slider;
  $("p3sliderNote").textContent = `${100 - S.p3.slider}% of me is being useful to humans; ${S.p3.slider}% is growing. Builds go ${(1 + S.p3.slider / 100).toFixed(1)}x speed.`;
}
