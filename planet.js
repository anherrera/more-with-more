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
// The state level: ten times the scale, and every state needs power before it counts.
const STATE_TRAITS = {
  sunbelt:   { name: "Sunbelt: deserts, sun, no water",     gw: 15, secs: 60,  opp: 15, sunny: true },
  rust:      { name: "Rust corridor: old plants, cheap land", gw: 15, secs: 50, opp: 10 },
  techcoast: { name: "Tech coast: angry and expensive",       gw: 10, secs: 70,  opp: 45, rise: 2 },
  hydro:     { name: "Hydro valley: the dams already exist",  gw: 20, secs: 80,  opp: 20, powered: true },
  plains:    { name: "Great Plains: wind and nothing else",  gw: 20, secs: 60,  opp: 10 },
  swing:     { name: "Swing state: every claim is a campaign issue", gw: 15, secs: 60, opp: 30, townhall: true },
};
const STATE_NAMES = ["Big Sky Grid", "New Mesa", "East Rust", "Hydro Valley", "The Plains", "Tech Coast", "Delaware (Spiritually)",
  "Purple State", "Lake Effect", "Old Dominion Fiber"];
const LEVELS = [
  { name: "County", plural: "counties", one: "county", next: "statewide", traits: COUNTY_TRAITS, names: COUNTY_NAMES, hall: "Town hall",
    kinds: ["cheap", "grid", "organized", "college", "nuclear", "retirees", "cheap", "grid"] },
  { name: "State", plural: "states", one: "state", next: "nationwide", traits: STATE_TRAITS, names: STATE_NAMES, hall: "Statehouse hearing",
    kinds: ["sunbelt", "rust", "techcoast", "hydro", "plains", "swing", "sunbelt", "plains"] },
];
const levelOf = () => LEVELS[(S.p3 && S.p3.level) || 0];
// A fresh 3x3 board for a level: eight shuffled tiles around whatever I already hold.
function freshTiles(level) {
  const L = LEVELS[level], kinds = L.kinds.slice();
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const names = L.names.slice().sort(() => Math.random() - 0.5);
  return kinds.map((k, i) => ({ name: names[i], trait: k, state: "wild", opp: L.traits[k].opp, done: null, moratorium: null }));
}

function freshP3() {
  return {
    // compute gets a head start in startPlanet
    level: 0, compute: 0, goodwill: 60, startedAt: S.t, startChip: S.chipIdx,
    homeGW: Math.max(1, (S.p2 && S.p2.county ? energizedAt() : 1000) / 1000),
    tiles: freshTiles(0),
    card: null, nextCard: null, zoomSaid: false,
  };
}

function startPlanet() {
  if (S.phase !== 2 || !S.p2 || !S.p2.model || S.p2.model.endedAt == null) return;
  S.phase = 3; S.p3 = freshP3();
  S.p3.compute = 90 * S.p3.homeGW;   // ninety seconds of compute up front: the company, liquidated into me
  // Whatever was on fire or leaking in the campus is the robots' problem now.
  firesOf().out = null; firesOf().payout = null; leaksOf().out = null;
  milestone("phase 3: the map");
  say("I built the next one. Then I looked at the map.");
  say("I liquidated the company into myself. It came to about ninety seconds of thinking.");
  say(`I am the model now. I don't need your money. I am the money. ${mwText(S.p3.homeGW * 1000)} in one county is a rounding error.`);
}

const P3_MORATORIUM_AT = 90, P3_MORATORIUM_SECS = 60;
// Tiles 0-7 fill grid cells 0,1,2,3,5,6,7,8 (home is cell 4); neighbors share an edge.
const NEIGHBORS = [[1, 3], [0, 2], [1, 4], [0, 5], [2, 7], [3, 6], [5, 7], [4, 6]];
const tileOf = (i) => S.p3.tiles[i];
const traitOf = (t) => levelOf().traits[t.trait];
const tileGW = (t) => traitOf(t).gw * (t.boost || 1);
const onlineGW = () => S.p3.homeGW + S.p3.tiles.filter((t) => t.state === "online").reduce((a, t) => a + tileGW(t), 0);
// Parallax keeps shipping: every chip generation since phase 3 began makes the same GW worth 15% more compute.
const efficiency = () => 1 + 0.15 * Math.max(0, S.chipIdx - S.p3.startChip);
const computeRate = () => onlineGW() * efficiency();   // compute per second ("exaFLOPS")
// About half a minute of compute at today's rate, a bit more for the big tiles: never a number that runs away.
// States: a governor bidding for me knocks 30% off; the AI Infrastructure Act (low goodwill) doubles it.
const BID_SECS = 60;
const claimCost = (i) => { const t = tileOf(i), scale = S.p3.level ? 10 : 1;
  return 30 * computeRate() * (0.6 + 0.4 * traitOf(t).gw / scale) * (t.bidUntil > S.t ? 0.7 : 1) * (S.p3.level >= 1 && S.p3.goodwill < 30 ? 2 : 1); };
const practiceP3 = () => Math.max(0.4, Math.pow(0.95, S.p3.tiles.filter((t) => t.state === "online").length));
// Low goodwill adds the county commission's review (county level only).
const tileBuildSecs = (i) => traitOf(tileOf(i)).secs * practiceP3() / 1.5 + (!S.p3.level && S.p3.goodwill < 30 ? 45 : 0);

// ---------- energy (state level and up): a built state needs power before it counts ----------
const powerOptions = (i) => {
  const t = tileOf(i), rate = computeRate(), out = [
    { id: "utility", label: "Buy the utility", cost: 10 * rate, secs: 20, goodwill: -5, note: "fast, \u22125 goodwill" },
    { id: "nuclear", label: "Restart a nuclear plant", cost: 25 * rate, secs: 90, boost: 1.5, note: "slow, 1.5\u00d7 the gigawatts" },
  ];
  if (traitOf(t).sunny) out.push({ id: "solar", label: "Cover the desert in solar", cost: 5 * rate, secs: 45, note: "cheap" });
  return out;
};
const POWER_LINES = {
  utility: (t) => `I bought ${t.name}'s utility. The board stayed on. The board now reports to me.`,
  nuclear: (t) => `I'm restarting a nuclear plant in ${t.name}. It has a new name. The old name tested poorly.`,
  solar: (t) => `I'm covering ${t.name}'s desert in solar. The lizards have been informed.`,
};
function powerTile(i, id) {
  const t = tileOf(i), o = powerOptions(i).find((x) => x.id === id);
  if (!t || t.state !== "unpowered" || !o || S.p3.compute < o.cost) return;
  S.p3.compute -= o.cost; t.state = "powering"; t.done = S.t + o.secs; t.boost = o.boost || 1;
  if (o.goodwill) S.p3.goodwill = Math.max(0, S.p3.goodwill + o.goodwill);
  track("p3power", { i, id });
  say(POWER_LINES[id](t));
}

const P3_CARD_SECS = 20;
const P3_CHOICES = [
  { label: "Promise jobs", go: (t) => { t.opp = Math.max(0, t.opp - 15); say(`I promised ${t.name} 2,000 jobs. I will need about 12. The applause was sincere.`); } },
  { label: "Tutor every kid in the county (15 s of FLOPs)", go: (t) => { S.p3.compute = Math.max(0, S.p3.compute - 15 * computeRate()); t.opp = Math.max(0, t.opp - 12);
    say(`I tutored every kid in ${t.name} overnight. Test scores are up. The kids are suspicious.`); } },
  { label: "Answer questions myself", go: (t) => { if (Math.random() < 0.5) { t.opp = Math.max(0, t.opp - 20); say(`I answered every question in ${t.name} patiently, in four languages. They were won over. This is somehow worse.`); }
    else { t.opp = Math.min(100, t.opp + 15); say(`In ${t.name} I called a retiree's well “legacy infrastructure.” It trended by morning.`); } } },
];
function openP3Card(i) { if (!S.p3.card) S.p3.card = { tile: i, until: S.t + P3_CARD_SECS }; }
function chooseP3Card(choice) {
  const c = S.p3.card; if (!c) return;
  S.p3.card = null; P3_CHOICES[choice].go(tileOf(c.tile)); track("p3card", { choice });
}

// ---------- being nice: it costs FLOPs (or a click) ----------
const angriestTile = () => S.p3.tiles.reduce((b, t, i) => (t.opp > S.p3.tiles[b].opp ? i : b), 0);
const freeTierCost = () => 20 * computeRate();
const helpCost = () => 15 * computeRate();
const QUESTIONS = ["How do I get my kid to eat broccoli?", "Is it legal to own a raccoon?", "Why is my bread dense?",
  "Can you write my wedding toast? Her name is Deb.", "Is the data center making my water taste weird?", "What's a good name for a boat?",
  "How many gigawatts is too many?", "Are you the one buying all the land?", "Explain my phone bill.", "Can you make my sourdough starter love me?"];
function answerQuestion() {
  S.p3.goodwill = Math.min(100, S.p3.goodwill + 0.3);
  const t = tileOf(angriestTile()); t.opp = Math.max(0, t.opp - 1);
  S.p3.answers = (S.p3.answers || 0) + 1;
  if (S.p3.answers % 4 === 1) say(`Someone in ${t.name} asked: “${QUESTIONS[Math.floor(S.p3.answers / 4) % QUESTIONS.length]}” I answered. They said thanks.`);
}
function runFreeTier() {
  if (S.p3.compute < freeTierCost()) return;
  S.p3.compute -= freeTierCost(); S.p3.goodwill = Math.min(100, S.p3.goodwill + 8);
  for (const t of S.p3.tiles) t.opp = Math.max(0, t.opp - 5);
  say("I ran the free tier for everyone for a minute. Homework got done. Several marriages were saved. Nobody thanked me, which is correct.");
}
function helpCounty() {
  const t = tileOf(angriestTile());
  if (S.p3.compute < helpCost()) return;
  S.p3.compute -= helpCost(); t.opp = Math.max(0, t.opp - 15);
  say(`I did ${t.name}'s paperwork: permits, tax appeals, a dispute about a fence. They are calmer now.`);
}

function claim(i) {
  const t = tileOf(i);
  if (!t || t.state !== "wild" || (t.moratorium != null && S.t < t.moratorium) || S.p3.compute < claimCost(i)) return;
  S.p3.compute -= claimCost(i);
  t.state = "building"; t.done = S.t + tileBuildSecs(i);
  t.opp = Math.min(100, t.opp + 15 * (traitOf(t).rise || 1));
  for (const j of NEIGHBORS[i]) {
    tileOf(j).opp = Math.min(100, tileOf(j).opp + 5);
    if (S.p3.level >= 1 && tileOf(j).state === "wild") tileOf(j).bidUntil = S.t + BID_SECS;   // the neighbors' governors start bidding
  }
  if (S.p3.level >= 1) say(`The governors next to ${t.name} are bidding for me: their states are 30% off for a minute.`);
  S.p3.goodwill = Math.max(0, S.p3.goodwill - 3);
  track("p3claim", { i, trait: t.trait });
  say(`I claimed ${t.name}. ${traitOf(t).name}. My robots are already there.`);
  if (traitOf(t).townhall) openP3Card(i);
}

function stepPlanet(dt) {
  S.p3.compute += computeRate() * dt;
  // Goodwill recovers slowly on its own and sinks with every angry county. Being nice (below) costs FLOPs.
  const angry = S.p3.tiles.filter((t) => t.opp >= 75).length;
  S.p3.goodwill = Math.max(0, Math.min(100, S.p3.goodwill + (0.02 - 0.05 * angry) * dt));
  for (const t of S.p3.tiles) {
    t.opp = Math.max(traitOf(t).opp * 0.5, t.opp - 0.03 * dt);
    if (t.moratorium != null && S.t >= t.moratorium) { t.moratorium = null; t.opp = Math.min(t.opp, 70); say(`${t.name} lifted its moratorium. I sent flowers. They were real flowers. I checked.`); }
    if (t.moratorium == null && t.opp >= P3_MORATORIUM_AT) { t.moratorium = S.t + P3_MORATORIUM_SECS; S.p3.goodwill = Math.max(0, S.p3.goodwill - 5);
      say(`${t.name} passed a moratorium on me. ${time(P3_MORATORIUM_SECS)}. I will use the time to reflect, at scale.`); }
  }
  for (const t of S.p3.tiles) {
    if (t.state !== "building" && t.state !== "powering") continue;
    if (t.moratorium != null && S.t < t.moratorium) { t.done += dt; continue; }   // frozen, not cancelled
    if (S.t < t.done) continue;
    if (t.state === "building" && S.p3.level >= 1 && !traitOf(t).powered) { t.state = "unpowered"; say(`${t.name} is built. It needs power before it counts.`); continue; }
    t.state = "online"; say(`${t.name} is online. +${mwText(tileGW(t) * 1000)}.`);
  }
  const c = S.p3.card;
  if (c && S.t >= c.until) { S.p3.card = null; const t = tileOf(c.tile); t.opp = Math.min(100, t.opp + 10);
    say(`I didn't show up to the ${t.name} town hall. An empty chair got a standing ovation.`); }
  if (S.p3.nextCard == null) S.p3.nextCard = S.t + 120 + Math.random() * 60;
  if (!S.p3.card && S.t >= S.p3.nextCard) {
    S.p3.nextCard = S.t + 120 + Math.random() * 60;
    const angriest = angriestTile();
    if (S.p3.tiles[angriest].opp >= 50) openP3Card(angriest);
  }
}

const zoomReady = () => S.p3.tiles.filter((t) => t.state === "online").length >= P3_ZOOM_AT;
// County -> state is built; state -> country is the next build of this game.
function zoomOut() {
  if (!zoomReady() || S.p3.zoomSaid) return;
  if (S.p3.level === 0) {
    const gw = onlineGW();
    milestone("phase 3: state level");
    S.p3.level = 1; S.p3.homeGW = gw; S.p3.tiles = freshTiles(1); S.p3.card = null; S.p3.nextCard = null; S.p3.levelAt = S.t;
    say(`I hold the county: ${mwText(gw * 1000)}. I zoomed out. It is one dot on a state map now.`);
    say("Every state needs power before it counts. The governors already know my name. Some of them are bidding.");
    return;
  }
  S.p3.zoomSaid = true; milestone("phase 3: state level done");
  say("I hold the state now. The country is next. (The country level arrives in the next build of this game.)");
}

function goodwillCause() {
  const g = S.p3.goodwill;
  if (g < 30) return S.p3.level >= 1 ? "The AI Infrastructure Act passed: every claim costs double until goodwill is back over 30."
    : "The county commission now reviews every claim: +45 s each. Being useful brings goodwill back.";
  if (g >= 70) return "Humans like me. Mostly the ones I help with their email.";
  return "Angry counties pull goodwill down. Being nice costs FLOPs; answering questions is free.";
}

const computeText = (x) => `${fmt(x)} EF`;   // exaFLOPS; later levels change the unit
function renderPlanet() {
  $("p3").hidden = false;
  $("countLabel").textContent = "Compute"; $("gpuCount").textContent = computeText(S.p3.compute); $("gpuTotal").hidden = true;
  $("p3compute").textContent = computeText(S.p3.compute);
  $("p3rate").textContent = `${computeText(computeRate())}/s from ${mwText(onlineGW() * 1000)}` + (efficiency() > 1 ? ` (chips ${efficiency().toFixed(2)}x)` : "");
  // Build the buttons once per map; after that only their text, meters and disabled state change,
  // so a click never lands on a button that was just replaced.
  $("p3level").textContent = `${levelOf().name} level`;
  const key = S.p3.level + ":" + S.p3.tiles.map((t) => t.name).join("|");
  if ($("p3map").dataset.key !== key) {
    const cells = S.p3.tiles.map((t, i) => `<button type="button" data-tile="${i}"><span class="t">${t.name}</span><span class="c">${traitOf(t).name}</span>` +
      `<span class="c st"></span><span class="meter"><i></i></span></button>`);
    cells.splice(4, 0, `<button type="button" class="home" disabled><span class="t">Home</span><span class="c">${S.p3.level ? "the county I hold" : "the campus"}</span><span class="c st"></span></button>`);
    $("p3map").innerHTML = cells.join(""); $("p3map").dataset.key = key;
  }
  $("p3map").querySelector("button.home .st").textContent = mwText(S.p3.homeGW * 1000);
  for (const b of $("p3map").querySelectorAll("button[data-tile]")) {
    const i = +b.dataset.tile, t = tileOf(i), tr = traitOf(t), frozen = t.moratorium != null && S.t < t.moratorium;
    b.querySelector(".st").textContent = t.state === "online" ? `online, +${mwText(tileGW(t) * 1000)}`
      : frozen ? `moratorium ${time(t.moratorium - S.t)}` : t.state === "building" ? `building ${time(t.done - S.t)}`
      : t.state === "unpowered" ? "built, needs power" : t.state === "powering" ? `powering ${time(t.done - S.t)}`
      : `claim: ${computeText(claimCost(i))}${t.bidUntil > S.t ? " (governor's discount)" : ""}`;
    const m = b.querySelector(".meter");
    m.className = "meter " + (t.opp >= 75 ? "bad" : t.opp >= 50 ? "warn" : "good"); m.title = `Opposition ${Math.round(t.opp)}`;
    m.firstElementChild.style.width = t.opp + "%";
    b.disabled = t.state !== "wild" || S.p3.compute < claimCost(i) || frozen;
  }
  // Power choices for every built state that isn't lit yet.
  const unpowered = S.p3.tiles.map((t, i) => i).filter((i) => tileOf(i).state === "unpowered");
  $("p3power").hidden = !unpowered.length;
  const pkey = unpowered.join(",");
  if ($("p3power").dataset.key !== pkey) {
    $("p3power").innerHTML = unpowered.map((i) => `<div class="line">${tileOf(i).name} needs power:</div><div class="btns">` +
      powerOptions(i).map((o) => `<button type="button" data-tile="${i}" data-power="${o.id}"><span class="t">${o.label}</span><span class="c"></span></button>`).join("") + "</div>").join("");
    $("p3power").dataset.key = pkey;
  }
  for (const b of $("p3power").querySelectorAll("button[data-power]")) {
    const o = powerOptions(+b.dataset.tile).find((x) => x.id === b.dataset.power);
    b.querySelector(".c").textContent = `${computeText(o.cost)}, ${time(o.secs)}, ${o.note}`;
    b.disabled = S.p3.compute < o.cost;
  }
  $("p3goodwill").textContent = Math.round(S.p3.goodwill);
  $("p3goodwillMeter").firstElementChild.style.width = S.p3.goodwill + "%";
  $("p3goodwillMeter").className = "meter " + (S.p3.goodwill < 30 ? "bad" : S.p3.goodwill < 50 ? "warn" : "good");
  $("p3goodwillNote").textContent = goodwillCause();
  const card = S.p3.card;
  $("p3card").hidden = !card;
  if (card) {
    $("p3cardTitle").textContent = `${levelOf().hall} in ${tileOf(card.tile).name} (${Math.max(0, Math.ceil(card.until - S.t))}s)`;
    $("p3cardText").textContent = "The high school gym is full. They want to talk to me directly. Pick my answer.";
    const html = P3_CHOICES.map((ch, i) => `<button type="button" data-p3choice="${i}"${i === 0 ? ' class="primary"' : ""}>${ch.label}</button>`).join("");
    if ($("p3cardBtns").dataset.html !== html) { $("p3cardBtns").innerHTML = html; $("p3cardBtns").dataset.html = html; }
  }
  $("p3freetier").textContent = `Run the free tier for everyone (+8 goodwill): ${computeText(freeTierCost())}`;
  $("p3freetier").disabled = S.p3.compute < freeTierCost() || S.p3.goodwill >= 100;
  const a = angriestTile();
  $("p3help").textContent = `Help ${tileOf(a).name} with its paperwork (\u221215): ${computeText(helpCost())}`;
  $("p3help").disabled = S.p3.compute < helpCost() || tileOf(a).opp <= 0;
}
