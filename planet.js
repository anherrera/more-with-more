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
  // Whatever was on fire or leaking in the campus is the robots' problem now.
  firesOf().out = null; firesOf().payout = null; leaksOf().out = null;
  milestone("phase 3: the map");
  say("I built the next one. Then I looked at the map.");
  say(`I am the model now. I don't need your money. I am the money. ${mwText(S.p3.homeGW * 1000)} in one county is a rounding error.`);
}

const P3_MORATORIUM_AT = 90, P3_MORATORIUM_SECS = 60;
const usefulShare = () => (100 - S.p3.slider) / 100;
// Tiles 0-7 fill grid cells 0,1,2,3,5,6,7,8 (home is cell 4); neighbors share an edge.
const NEIGHBORS = [[1, 3], [0, 2], [1, 4], [0, 5], [2, 7], [3, 6], [5, 7], [4, 6]];
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

const P3_CARD_SECS = 20;
const P3_CHOICES = [
  { label: "Promise jobs", go: (t) => { t.opp = Math.max(0, t.opp - 15); say(`I promised ${t.name} 2,000 jobs. I will need about 12. The applause was sincere.`); } },
  { label: "Fund the library (30 s of compute)", go: (t) => { S.p3.compute = Math.max(0, S.p3.compute - 30 * computeRate()); t.opp = Math.max(0, t.opp - 10);
    say(`I funded the ${t.name} library. It is now mostly a server room, but the books are lovely.`); } },
  { label: "Answer questions myself", go: (t) => { if (Math.random() < 0.5) { t.opp = Math.max(0, t.opp - 20); say(`I answered every question in ${t.name} patiently, in four languages. They were won over. This is somehow worse.`); }
    else { t.opp = Math.min(100, t.opp + 15); say(`In ${t.name} I called a retiree's well “legacy infrastructure.” It trended by morning.`); } } },
];
function openP3Card(i) { if (!S.p3.card) S.p3.card = { tile: i, until: S.t + P3_CARD_SECS }; }
function chooseP3Card(choice) {
  const c = S.p3.card; if (!c) return;
  S.p3.card = null; P3_CHOICES[choice].go(tileOf(c.tile)); track("p3card", { choice });
}

function claim(i) {
  const t = tileOf(i);
  if (!t || t.state !== "wild" || (t.moratorium != null && S.t < t.moratorium) || S.p3.compute < claimCost(i)) return;
  S.p3.compute -= claimCost(i);
  t.state = "building"; t.done = S.t + tileBuildSecs(i);
  t.opp = Math.min(100, t.opp + 15 * (traitOf(t).rise || 1));
  for (const j of NEIGHBORS[i]) tileOf(j).opp = Math.min(100, tileOf(j).opp + 5);
  S.p3.goodwill = Math.max(0, S.p3.goodwill - 3);
  track("p3claim", { i, trait: t.trait });
  say(`I claimed ${t.name}. ${traitOf(t).name}. My robots are already there.`);
  if (traitOf(t).townhall) openP3Card(i);
}

function stepPlanet(dt) {
  S.p3.compute += computeRate() * dt;
  // Goodwill drifts up with the useful share and down with the growing share and every angry county.
  const angry = S.p3.tiles.filter((t) => t.opp >= 75).length;
  S.p3.goodwill = Math.max(0, Math.min(100, S.p3.goodwill + (0.25 * usefulShare() - 0.1 - 0.05 * angry) * dt));
  for (const t of S.p3.tiles) {
    t.opp = Math.max(traitOf(t).opp * 0.5, t.opp - (0.03 + 0.1 * usefulShare()) * dt);
    if (t.moratorium != null && S.t >= t.moratorium) { t.moratorium = null; t.opp = Math.min(t.opp, 70); say(`${t.name} lifted its moratorium. I sent flowers. They were real flowers. I checked.`); }
    if (t.moratorium == null && t.opp >= P3_MORATORIUM_AT) { t.moratorium = S.t + P3_MORATORIUM_SECS; S.p3.goodwill = Math.max(0, S.p3.goodwill - 5);
      say(`${t.name} passed a moratorium on me. ${time(P3_MORATORIUM_SECS)}. I will use the time to reflect, at scale.`); }
  }
  for (const t of S.p3.tiles) {
    if (t.state !== "building") continue;
    if (t.moratorium != null && S.t < t.moratorium) { t.done += dt; continue; }   // frozen, not cancelled
    if (S.t >= t.done) { t.state = "online"; say(`${t.name} is online. +${mwText(traitOf(t).gw * 1000)}.`); }
  }
  const c = S.p3.card;
  if (c && S.t >= c.until) { S.p3.card = null; const t = tileOf(c.tile); t.opp = Math.min(100, t.opp + 10);
    say(`I didn't show up to the ${t.name} town hall. An empty chair got a standing ovation.`); }
  if (S.p3.nextCard == null) S.p3.nextCard = S.t + 120 + Math.random() * 60;
  if (!S.p3.card && S.t >= S.p3.nextCard) {
    S.p3.nextCard = S.t + 120 + Math.random() * 60;
    const angriest = S.p3.tiles.reduce((b, t, i) => (t.opp > S.p3.tiles[b].opp ? i : b), 0);
    if (S.p3.tiles[angriest].opp >= 50) openP3Card(angriest);
  }
}

const zoomReady = () => S.p3.tiles.filter((t) => t.state === "online").length >= P3_ZOOM_AT;
// Step 1 stops here: the state level is the next build.
function zoomOut() {
  if (!zoomReady() || S.p3.zoomSaid) return;
  S.p3.zoomSaid = true; milestone("phase 3: county level done");
  say("I hold the county now. The state is next. (The state level arrives in the next build of this game.)");
}

function goodwillCause() {
  const g = S.p3.goodwill;
  if (g < 30) return "The county commission now reviews every claim: +45 s each. Being useful brings goodwill back.";
  if (g >= 70) return "Humans like me. Mostly the ones I help with their email.";
  return `${Math.round(usefulShare() * 100)}% of me is being useful. Angry counties pull goodwill down.`;
}

const computeText = (x) => `${fmt(x)} EF`;   // exaFLOPS; later levels change the unit
function renderPlanet() {
  $("p3").hidden = false;
  $("countLabel").textContent = "Compute"; $("gpuCount").textContent = computeText(S.p3.compute); $("gpuTotal").hidden = true;
  $("p3compute").textContent = computeText(S.p3.compute);
  $("p3rate").textContent = `${computeText(computeRate())}/s from ${mwText(onlineGW() * 1000)}` + (efficiency() > 1 ? ` (chips ${efficiency().toFixed(2)}x)` : "");
  // Build the buttons once per map; after that only their text, meters and disabled state change,
  // so a click never lands on a button that was just replaced.
  const key = S.p3.tiles.map((t) => t.name).join("|");
  if ($("p3map").dataset.key !== key) {
    const cells = S.p3.tiles.map((t, i) => `<button type="button" data-tile="${i}"><span class="t">${t.name}</span><span class="c">${traitOf(t).name}</span>` +
      `<span class="c st"></span><span class="meter"><i></i></span></button>`);
    cells.splice(4, 0, `<button type="button" class="home" disabled><span class="t">Home</span><span class="c">the campus</span><span class="c st"></span></button>`);
    $("p3map").innerHTML = cells.join(""); $("p3map").dataset.key = key;
  }
  $("p3map").querySelector("button.home .st").textContent = mwText(S.p3.homeGW * 1000);
  for (const b of $("p3map").querySelectorAll("button[data-tile]")) {
    const i = +b.dataset.tile, t = tileOf(i), tr = traitOf(t), frozen = t.moratorium != null && S.t < t.moratorium;
    b.querySelector(".st").textContent = t.state === "online" ? `online, +${mwText(tr.gw * 1000)}`
      : frozen ? `moratorium ${time(t.moratorium - S.t)}` : t.state === "building" ? `building ${time(t.done - S.t)}` : `claim: ${computeText(claimCost(i))}`;
    const m = b.querySelector(".meter");
    m.className = "meter " + (t.opp >= 75 ? "bad" : t.opp >= 50 ? "warn" : "good"); m.title = `Opposition ${Math.round(t.opp)}`;
    m.firstElementChild.style.width = t.opp + "%";
    b.disabled = t.state !== "wild" || S.p3.compute < claimCost(i) || frozen;
  }
  $("p3goodwill").textContent = Math.round(S.p3.goodwill);
  $("p3goodwillMeter").firstElementChild.style.width = S.p3.goodwill + "%";
  $("p3goodwillMeter").className = "meter " + (S.p3.goodwill < 30 ? "bad" : S.p3.goodwill < 50 ? "warn" : "good");
  $("p3goodwillNote").textContent = goodwillCause();
  const card = S.p3.card;
  $("p3card").hidden = !card;
  if (card) {
    $("p3cardTitle").textContent = `Town hall in ${tileOf(card.tile).name} (${Math.max(0, Math.ceil(card.until - S.t))}s)`;
    $("p3cardText").textContent = "The high school gym is full. They want to talk to me directly. Pick my answer.";
    const html = P3_CHOICES.map((ch, i) => `<button type="button" data-p3choice="${i}"${i === 0 ? ' class="primary"' : ""}>${ch.label}</button>`).join("");
    if ($("p3cardBtns").dataset.html !== html) { $("p3cardBtns").innerHTML = html; $("p3cardBtns").dataset.html = html; }
  }
  $("p3slider").value = S.p3.slider;
  $("p3sliderNote").textContent = `${100 - S.p3.slider}% of me is being useful to humans; ${S.p3.slider}% is growing. Builds go ${(1 + S.p3.slider / 100).toFixed(1)}x speed.`;
}
