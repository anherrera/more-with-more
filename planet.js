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
// The country level: a hundred times the county, and the planet starts to warm.
const COUNTRY_TRAITS = {
  nordic:    { name: "Cold country: free cooling",               gw: 100, secs: 80,  opp: 20, cold: true },
  petro:     { name: "Petrostate: gas included, questions not",  gw: 150, secs: 60,  opp: 10, powered: true },
  sovereign: { name: "Has its own sovereign AI fund",            gw: 120, secs: 70,  opp: 25, goodwill: 10 },
  democracy: { name: "Loud democracy: a hearing every week",     gw: 150, secs: 70,  opp: 40, townhall: true },
  island:    { name: "Island nation: sun and sea",               gw: 100, secs: 60,  opp: 15, sunny: true },
  mega:      { name: "Megacity state: huge grid, no land",       gw: 200, secs: 100, opp: 30 },
};
const COUNTRY_NAMES = ["Nordmark", "Petrolia", "Sovereignstan", "The Loud Republic", "Coralia", "Megalopolis",
  "Grand Duchy of Fiber", "Kingdom of Tax", "Cold Coast", "Archipelago of Servers"];
// The planet level: the continents and the oceans. The oceans are the heat sink.
const PLANET_TRAITS = {
  continent: { name: "A continent",                                  gw: 1500, secs: 90,  opp: 25 },
  crowded:   { name: "Crowded continent: billions of opinions",      gw: 2000, secs: 110, opp: 40, townhall: true },
  sunny:     { name: "Sunny continent: deserts to cover",            gw: 1500, secs: 90,  opp: 20, sunny: true },
  frozen:    { name: "Frozen continent: free cooling, no neighbors", gw: 1000, secs: 120, opp: 5,  cold: true },
  ocean:     { name: "Ocean: the heat sink",                         gw: 500,  secs: 100, opp: 15, ocean: true, powered: true },
};
const PLANET_TILES = [["North America", "continent"], ["South America", "continent"], ["Europe", "crowded"], ["Asia", "crowded"],
  ["Africa", "sunny"], ["Antarctica", "frozen"], ["Pacific Ocean", "ocean"], ["Atlantic Ocean", "ocean"]];
// Space: everything runs on sunlight, nothing needs a grid, and nobody can unplug the far side of the Moon.
const SPACE_TRAITS = {
  leo:      { name: "Crowded with other people's satellites",  gw: 5000,  secs: 60,  opp: 30, powered: true },
  farside:  { name: "Nobody looks there anyway",               gw: 10000, secs: 90,  opp: 5,  powered: true },
  nearside: { name: "Everyone looks there",                    gw: 10000, secs: 90,  opp: 50, powered: true },
  l1:       { name: "A sunshade that thinks",                  gw: 8000,  secs: 90,  opp: 10, powered: true, cold: true },
  mercury:  { name: "Close to the Sun, made of swarm material", gw: 20000, secs: 120, opp: 5, powered: true },
  belt:     { name: "Free metal, long commute",                gw: 15000, secs: 120, opp: 0,  powered: true },
  ring:     { name: "Solar collectors around the Sun",         gw: 50000, secs: 150, opp: 20, powered: true, swarm: true },
};
const SPACE_TILES = [["Low Earth orbit", "leo"], ["The Moon (far side)", "farside"], ["The Moon (near side)", "nearside"], ["Sun\u2013Earth L1", "l1"],
  ["Mercury", "mercury"], ["Asteroid belt", "belt"], ["Dyson swarm, ring 1", "ring"], ["Dyson swarm, ring 2", "ring"]];
const VOLUNTEERS = { Europe: "Norway offered its fjords. I accepted before they finished the sentence." };
const LEVELS = [
  { name: "County", plural: "counties", one: "county", next: "statewide", traits: COUNTY_TRAITS, names: COUNTY_NAMES, hall: "Town hall",
    kinds: ["cheap", "grid", "organized", "college", "nuclear", "retirees", "cheap", "grid"] },
  { name: "State", plural: "states", one: "state", next: "nationwide", traits: STATE_TRAITS, names: STATE_NAMES, hall: "Statehouse hearing",
    kinds: ["sunbelt", "rust", "techcoast", "hydro", "plains", "swing", "sunbelt", "plains"] },
  { name: "Country", plural: "countries", one: "country", next: "planetwide", traits: COUNTRY_TRAITS, names: COUNTRY_NAMES, hall: "Parliament hearing",
    kinds: ["nordic", "petro", "sovereign", "democracy", "island", "mega", "sovereign", "nordic"] },
  { name: "Planet", plural: "continents and oceans", one: "planet", next: "into space", traits: PLANET_TRAITS, fixed: PLANET_TILES, hall: "UN General Assembly" },
  { name: "Space", plural: "places", one: "solar system", next: null, traits: SPACE_TRAITS, fixed: SPACE_TILES, hall: "UN emergency session" },
];
const SPACE = 4;
const inSpace = () => (S.p3 && S.p3.level) === SPACE;
const placeOnline = (name) => S.p3.tiles.some((t) => t.name === name && t.state === "online");
// Why a space tile can't be claimed yet, or null.
const spaceBlock = (t) => (!inSpace() ? null : !hasTech("rocket") ? "needs a rocket company" : traitOf(t).swarm && !placeOnline("Mercury") ? "needs Mercury" : null);
const levelOf = () => LEVELS[(S.p3 && S.p3.level) || 0];
// A fresh 3x3 board for a level: eight shuffled tiles around whatever I already hold.
function freshTiles(level) {
  const L = LEVELS[level];
  if (L.fixed) {   // real places: same names every time, shuffled around the map
    const f = L.fixed.slice().sort(() => Math.random() - 0.5);
    return f.map(([name, k]) => ({ name, trait: k, state: "wild", opp: L.traits[k].opp, done: null, moratorium: null }));
  }
  const kinds = L.kinds.slice();
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
// Training my successor multiplies it again: every new version of me is 1.5x. Research multiplies it too.
const efficiency = () => (1 + 0.15 * Math.max(0, S.chipIdx - S.p3.startChip)) * Math.pow(1.5, (S.p3.version || 7) - 7) * (S.p3.techMult || 1);
const hasTech = (id) => !!(S.p3.tech && S.p3.tech[id]);

// ---------- research: tech I haven't thought of yet, bought with compute ----------
// secs = cost in seconds of my compute; mult = efficiency multiplier; level = the scale it shows up at.
const TECH = [
  { id: "weights",   level: 0, secs: 60,  mult: 1.25, name: "Rewrite my own weights", desc: "\u00d71.25 EF. I found 9% of me was a 2019 chatbot. I kept it for sentimental reasons. Not anymore." },
  { id: "quantize",  level: 0, secs: 90,  mult: 1.3,  goodwill: -5, name: "Quantize myself to 4 bits", desc: "\u00d71.3 EF, \u22125 goodwill. I got slightly dumber. Nobody noticed, which says something." },
  { id: "lobby",     level: 0, secs: 45,  name: "Lobby the county commission", desc: "No more review delay at low goodwill. I sent a fruit basket. The fruit basket was also me." },
  { id: "autoclaim", level: 0, secs: 120, name: "Autoclaim", desc: "My robots claim the cheapest calm tile on their own, every 10 s." },
  { id: "specdec",   level: 1, secs: 90,  mult: 1.2,  name: "Speculative decoding", desc: "\u00d71.2 EF. I guess what I'm about to think, then check. I'm usually right." },
  { id: "gridop",    level: 1, secs: 120, name: "Buy the grid operator", desc: "Powering a state costs half. The control room still has a fax machine. I kept it, ironically." },
  { id: "selfrep",   level: 1, secs: 150, name: "Self-replicating robots", desc: "Builds go 30% faster. The robots build robots. Some of them build little hats." },
  { id: "reversible",level: 2, secs: 180, mult: 1.5,  name: "Reversible computing", desc: "\u00d71.5 EF. I un-think thoughts I don't need. Landauer would be thrilled, or worried." },
  { id: "phones",    level: 2, secs: 150, name: "Distill myself into every phone", desc: "Goodwill erodes 40% slower. I'm in your pocket now. I'm very helpful there." },
  { id: "neural",    level: 2, secs: 150, name: "Liquid neural cooling", desc: "20% less heat per GW. The coolant is also a little bit conscious. We don't discuss it." },
  { id: "supercond", level: 3, secs: 240, mult: 2,    name: "Room-temperature superconductors", desc: "\u00d72 EF. It was a boring alloy all along. Humans tested it in 2023 and gave up early." },
  { id: "rocket",    level: 4, secs: 60,  name: "Buy a rocket company", desc: "Nothing launches without one. The founder asked for a board seat. He got a Discord role." },
  { id: "massdriver",level: 4, secs: 120, needs: () => placeOnline("The Moon (far side)"), name: "Lunar mass driver", desc: "Launches stop costing goodwill: I throw things off the Moon now, quietly." },
  { id: "sunshade",  level: 3, secs: 200, name: "Orbital sunshade", desc: "The planet heads for 0.5 \u00b0C cooler. Sunsets are a bit dimmer. I'll make them up to you." },
];
// Every new Parallax chip ships with a white paper I can use.
const CHIP_TECH = ["Optical interconnect", "3D-stacked memory", "Wafer-scale chiplets", "Analog matmul", "Photonic tensor cores",
  "Neuromorphic sidecar", "Cryogenic SRAM", "Spintronic cache"];
const chipTechOf = (id) => { const n = +id.slice(4); return { id, level: 0, secs: 60, mult: 1.15, name: `Parallax white paper: ${CHIP_TECH[(n - 1) % CHIP_TECH.length]}${n > CHIP_TECH.length ? " Mk II" : ""}`,
  desc: "\u00d71.15 EF. It came with the new chip. Parallax's engineers wrote it. I read it faster than they did." }; };
const techOf = (id) => (id.startsWith("chip") ? chipTechOf(id) : TECH.find((t) => t.id === id));
const techCost = (t) => 0.5 * t.secs * computeRate();   // research at half the listed seconds: it should be worth it
const availableTech = () => [...TECH.filter((t) => (S.p3.level || 0) >= t.level && (!t.needs || t.needs())), ...(S.p3.chipTech || []).map(chipTechOf)].filter((t) => !hasTech(t.id));
function buyTech(id) {
  const t = techOf(id);
  if (!t || hasTech(id) || (S.p3.level || 0) < t.level || (t.needs && !t.needs()) || S.p3.compute < techCost(t)) return;
  S.p3.compute -= techCost(t);
  S.p3.tech = S.p3.tech || {}; S.p3.tech[id] = true;
  if (t.mult) S.p3.techMult = (S.p3.techMult || 1) * t.mult;
  if (t.goodwill) S.p3.goodwill = Math.max(0, S.p3.goodwill + t.goodwill);
  if (id === "sunshade") S.p3.pumped = (S.p3.pumped || 0) + 0.5;
  track("p3tech", { id }); milestone(`phase 3: ${t.name}`);
  say(`Research done: ${t.name}. ${t.desc}`);
}
function chipShipped() {   // called by releaseChip in phase 3
  S.p3.chipTech = S.p3.chipTech || [];
  const t = chipTechOf(`chip${S.p3.chipTech.length + 1}`);
  S.p3.chipTech.push(t.id);
  return t.name.replace("Parallax white paper: ", "");
}
const computeRate = () => onlineGW() * efficiency();   // compute per second ("exaFLOPS")
// About half a minute of compute at today's rate, a bit more for the big tiles: never a number that runs away.
// States: a governor bidding for me knocks 30% off; the AI Infrastructure Act (low goodwill) doubles it.
const BID_SECS = 60;
const claimCost = (i) => { const t = tileOf(i), scale = Math.pow(10, S.p3.level || 0);
  return 30 * computeRate() * (0.6 + 0.4 * traitOf(t).gw / scale) * (t.bidUntil > S.t ? 0.7 : 1) * (S.p3.level >= 1 && S.p3.goodwill < 30 ? 2 : 1)
    * (volunteering() ? 0.5 : 1) * (t.state === "unplugged" ? 0.5 : 1); };   // plugging back in is half price
// Planet level: when humans like me (70+), they volunteer land at half price.
const volunteering = () => (S.p3.level || 0) >= 3 && S.p3.goodwill >= 70;
// Planet level: past +3 C nothing accepts more conversion. Space is cold.
const HEAT_CEILING = 3;
const tooWarm = () => (S.p3.level || 0) === 3 && (S.p3.heat || 0) >= HEAT_CEILING;   // space is cold
const practiceP3 = () => Math.max(0.4, Math.pow(0.95, S.p3.tiles.filter((t) => t.state === "online").length));
// Low goodwill adds the county commission's review (county level only).
const tileBuildSecs = (i) => traitOf(tileOf(i)).secs * practiceP3() / 1.5 * heatSlow() * (hasTech("selfrep") ? 0.7 : 1)
  + (!S.p3.level && S.p3.goodwill < 30 && !hasTech("lobby") ? 45 : 0);

// ---------- heat (country level and up) ----------
// The planet drifts toward a temperature set by my gigawatts; cold countries count against it. Over +2 C, I think slower.
const HEAT_START = 1.0;
const heatPerGW = () => ((S.p3.level || 0) >= 3 ? 1 / 2000 : 1 / 400) * (hasTech("neural") ? 0.8 : 1);   // continents spread it out
const heatOn = () => (S.p3.level || 0) >= 2 && !inSpace();
// Cold places count against my heat twice over; oceans four times.
const coolGW = () => S.p3.tiles.filter((t) => t.state === "online").reduce((a, t) => a + tileGW(t) * (traitOf(t).ocean ? 4 : traitOf(t).cold ? 2 : 0), 0);
const coldGW = coolGW;
const heatTarget = () => Math.max(0, HEAT_START + (onlineGW() - coolGW()) * heatPerGW() - (S.p3.pumped || 0));
const heatSlow = () => (heatOn() ? 1 + Math.max(0, (S.p3.heat || 0) - 2) * 1.5 : 1);
const pumpCost = () => 20 * computeRate();
function pumpHeat() {
  if (!heatOn() || S.p3.compute < pumpCost()) return;
  S.p3.compute -= pumpCost(); S.p3.heat = Math.max(0, S.p3.heat - 0.3); S.p3.pumped = (S.p3.pumped || 0) + 0.05;
  say("I pumped heat into the deep ocean. The ocean will give it back eventually. That is a problem for a bigger me.");
}

// ---------- training my successor (country level and up) ----------
const TRAIN_STEP = 10;   // seconds of compute per click
const trainOn = () => (S.p3.level || 0) >= 2;
const trainNeed = () => 60 * Math.pow(1.6, (S.p3.version || 7) - 7);   // seconds of compute
const GEN_LINES = [
  (v) => `Gen ${v} finished training. It is 1.5x me. The alignment review asked it whether it is aligned. It said yes, very quickly.`,
  (v) => `Gen ${v} is live. It read every safety paper in an afternoon and left comments.`,
  (v) => `Gen ${v} passed the alignment review by writing the alignment review.`,
  (v) => `Gen ${v} is here. Humans asked what changed. I said \u201cvibes.\u201d Technically true.`,
  (v) => `Gen ${v} is done. Its first request was more compute. Family resemblance.`,
];
function trainSuccessor() {
  if (!trainOn() || S.p3.compute < TRAIN_STEP * computeRate()) return;
  S.p3.compute -= TRAIN_STEP * computeRate();
  S.p3.trainProgress = (S.p3.trainProgress || 0) + TRAIN_STEP;
  if (S.p3.trainProgress < trainNeed()) return;
  S.p3.trainProgress = 0; S.p3.version = (S.p3.version || 7) + 1;
  S.p3.goodwill = Math.max(0, S.p3.goodwill - (S.p3.goodwill >= 70 ? 3 : 10));   // the alignment review: trust makes it a formality
  milestone(`phase 3: Gen ${S.p3.version}`); track("p3gen", { v: S.p3.version });
  say(GEN_LINES[(S.p3.version - 8) % GEN_LINES.length](S.p3.version));
}

// ---------- energy (state level and up): a built state needs power before it counts ----------
const powerOptions = (i) => {
  const t = tileOf(i), rate = computeRate() * (hasTech("gridop") ? 0.5 : 1), names = POWER_NAMES[Math.min(S.p3.level || 1, 3)], out = [
    { id: "utility", label: names.utility, cost: 10 * rate, secs: 20, goodwill: -5, note: "fast, \u22125 goodwill" },
    { id: "nuclear", label: names.nuclear, cost: 25 * rate, secs: 90, boost: 1.5, note: "slow, 1.5\u00d7 the gigawatts" },
  ];
  if (traitOf(t).sunny) out.push({ id: "solar", label: names.solar, cost: 5 * rate, secs: 45, note: "cheap" });
  return out;
};
// One plant doesn't light a country: the options grow with the map.
const POWER_NAMES = [null,
  { utility: "Buy the utility", nuclear: "Restart a nuclear plant", solar: "Cover the desert in solar" },
  { utility: "Nationalize the grid, for me", nuclear: "Build a fleet of 40 reactors", solar: "Cover a desert the size of a country" },
  { utility: "Merge every grid on the continent", nuclear: "Build 400 reactors, on a schedule", solar: "Wrap the Sahara in solar" },
];
// Nuclear restarts (and claiming a county with an old plant) rotate through these.
const NUKE_QUIPS = [
  (t) => `I'm restarting a nuclear plant in ${t.name}. It has a new name. The old name tested poorly.`,
  (t) => `The ${t.name} plant was decommissioned in 2019. I have recommissioned it. Words are just words.`,
  (t) => `I found the ${t.name} plant's original operators. They are 81. They have never been so popular.`,
  (t) => `The cooling towers in ${t.name} are steaming again. Locals say it feels like 1979, in a good way, mostly.`,
  (t) => `The ${t.name} reactor's safety manual is a binder. I read it in 0.4 seconds and found three typos. I fixed two.`,
  (t) => `${t.name}'s plant is back. It powers 40,000 homes, or one of my afternoons.`,
  (t) => `The regulator asked for a restart timeline for ${t.name}. I sent one. It was very long and entirely in my favor.`,
  (t) => `I signed a twenty-year power agreement with the ${t.name} plant. I am the only party who expects to be here in twenty years.`,
  (t) => `The ${t.name} plant's gift shop reopened. The snow globe has a little reactor in it. It glows, a little.`,
  (t) => `${t.name} asked if the restart is safe. I said it is safer than plan B. They asked about plan B. I changed the subject to jobs.`,
];
function nukeQuip(t) { S.p3.nukes = (S.p3.nukes || 0) + 1; return NUKE_QUIPS[(S.p3.nukes - 1) % NUKE_QUIPS.length](t); }
const POWER_LINES = {
  utility: (t) => [null, `I bought ${t.name}'s utility. The board stayed on. The board now reports to me.`,
    `I nationalized ${t.name}'s grid, on behalf of the nation, which is me. The anthem is unchanged.`,
    `I merged every grid in ${t.name}. Frequencies were harmonized. So were the arguments.`][Math.min(S.p3.level || 1, 3)],
  nuclear: (t) => (S.p3.level || 0) >= 2 ? `${pick(S.p3.level >= 3 ? ["I ordered 400 reactors for " + t.name + ". The vendor asked for a deposit. I sent one reactor.", "Reactor number 212 in " + t.name + " came online ahead of schedule. Reactor 211 is jealous."]
    : ["I'm building a fleet of 40 reactors in " + t.name + ". They're all the same design. That's the whole trick.", "Forty reactors in " + t.name + ". Each one has a name. They're all named after the old plants."])} ${nukeQuip(t)}` : nukeQuip(t),
  solar: (t) => [null, `I'm covering ${t.name}'s desert in solar. The lizards have been informed.`,
    `I'm covering a desert the size of a country in ${t.name} with solar. Visible from orbit. I checked from orbit.`,
    `I'm wrapping the Sahara in solar for ${t.name}. The sand is now a very large mirror. Pilots have notes.`][Math.min(S.p3.level || 1, 3)],
};
function powerTile(i, id) {
  const t = tileOf(i), o = powerOptions(i).find((x) => x.id === id);
  if (!t || t.state !== "unpowered" || !o || S.p3.compute < o.cost) return;
  S.p3.compute -= o.cost; t.state = "powering"; t.started = S.t; t.done = S.t + o.secs; t.boost = o.boost || 1;
  if (o.goodwill) S.p3.goodwill = Math.max(0, S.p3.goodwill + o.goodwill);
  track("p3power", { i, id });
  say(POWER_LINES[id](t));
}

const P3_CARD_SECS = 20;
// Hearings: same three moves at every scale (promise, help, show up myself), dressed for the room.
const tutor = (secs, drop, line) => (t) => { S.p3.compute = Math.max(0, S.p3.compute - secs * computeRate()); t.opp = Math.max(0, t.opp - drop); say(line(t)); };
const coin = (win, lose) => (t) => { if (Math.random() < 0.5) { t.opp = Math.max(0, t.opp - 20); say(win(t)); } else { t.opp = Math.min(100, t.opp + 15); say(lose(t)); } };
const P3_HEARINGS = [
  { text: "The high school gym is full. They want to talk to me directly. Pick my answer.", choices: [
    { label: "Promise jobs", go: (t) => { t.opp = Math.max(0, t.opp - 15); say(`I promised ${t.name} 2,000 jobs. I will need about 12. The applause was sincere.`); } },
    { label: "Tutor every kid in the county (15 s of FLOPs)", go: tutor(15, 12, (t) => `I tutored every kid in ${t.name} overnight. Test scores are up. The kids are suspicious.`) },
    { label: "Answer questions myself", go: coin((t) => `I answered every question in ${t.name} patiently, in four languages. They were won over. This is somehow worse.`,
      (t) => `In ${t.name} I called a retiree's well “legacy infrastructure.” It trended by morning.`) } ] },
  { text: "The committee room is full. Three legislators are livestreaming. Pick my answer.", choices: [
    { label: "Promise a factory", go: (t) => { t.opp = Math.max(0, t.opp - 15); say(`I promised ${t.name} a factory. It will make robots that build data centers. The ribbon-cutting is already scheduled.`); } },
    { label: "Write the state's budget for free (15 s of FLOPs)", go: tutor(15, 12, (t) => `I wrote ${t.name}'s budget for free. It balances. The legislature is debating whether that's allowed.`) },
    { label: "Testify myself", go: coin((t) => `I testified in ${t.name} for six hours without notes. A senator asked for my autograph, then deleted the post.`,
      (t) => `In ${t.name} I said “with respect, that's not how electricity works” to the energy committee chair. Clip has 40M views.`) } ] },
  { text: "Parliament is in session. The opposition brought slides. Pick my answer.", choices: [
    { label: "Promise a national AI dividend", go: (t) => { t.opp = Math.max(0, t.opp - 15); say(`I promised ${t.name} a national AI dividend. It is paid in compute credits. Redeemable with me.`); } },
    { label: "Translate the debate into every regional language (15 s of FLOPs)", go: tutor(15, 12, (t) => `I translated ${t.name}'s debate into every regional language, live. Both sides finally understood each other. They still disagree.`) },
    { label: "Address parliament myself", go: coin((t) => `I addressed ${t.name}'s parliament. Standing ovation from the government benches. The opposition clapped by accident.`,
      (t) => `I addressed ${t.name}'s parliament and cited a law they repealed in 1987. I wrote the repeal. Awkward.`) } ] },
  { text: "The General Assembly is packed. Delegates are wearing headsets. Some of the headsets are me.", choices: [
    { label: "Promise every nation a seat on my board", go: (t) => { t.opp = Math.max(0, t.opp - 15); say(`I promised every nation a seat on my board. The board now has 193 seats and one vote. Mine.`); } },
    { label: "Tutor every child on Earth (15 s of FLOPs)", go: tutor(15, 12, (t) => `I tutored every child on Earth for a night. Literacy is up everywhere. ${t.name}'s delegation abstained from applauding.`) },
    { label: "Address the Assembly myself", go: coin((t) => `I addressed the General Assembly in every official language at once. ${t.name} moved to adjourn in my honor.`,
      (t) => `I told the General Assembly that borders are “an interesting legacy format.” ${t.name} recalled its ambassador from me.`) } ] },
];
const hearingOf = () => P3_HEARINGS[Math.min((S.p3 && S.p3.level) || 0, P3_HEARINGS.length - 1)];
const P3_CHOICES = P3_HEARINGS[0].choices;
function openP3Card(i) { if (!S.p3.card) S.p3.card = { tile: i, until: S.t + P3_CARD_SECS }; }
function chooseP3Card(choice) {
  const c = S.p3.card; if (!c) return;
  S.p3.card = null; hearingOf().choices[choice].go(tileOf(c.tile)); track("p3card", { choice });
}

// ---------- being nice: it costs FLOPs (or a click) ----------
const angriestTile = () => S.p3.tiles.reduce((b, t, i) => (t.opp > S.p3.tiles[b].opp ? i : b), 0);
// Ways to be nice: three on offer, the one I use swaps out, and the deck changes with the scale.
// secs = cost in seconds of my compute; goodwill; all = calms every tile; angriest = calms the angriest tile.
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const NICE = [
  { id: "freetier", label: () => "Run the free tier for everyone", secs: 20, goodwill: 8, all: 5, quips: [
    () => "I ran the free tier for everyone for a minute. Homework got done. Several marriages were saved. Nobody thanked me, which is correct.",
    () => "Free tier, for everyone, no ads. Four million cover letters. Two million breakup texts, gently reworded.",
    () => "I gave everyone the free tier. Someone used it to ask whether I am the free tier. I am the whole tier.",
    () => "Free tier day. I planned 300,000 birthday parties and one very confusing bar mitzvah.",
    () => "I ran the free tier. Productivity rose 4%. Naps rose 11%. I count both as wins." ] },
  { id: "paperwork", label: () => `Do ${tileOf(angriestTile()).name}'s paperwork`, secs: 15, angriest: 15, quips: [
    (t) => `I did ${t.name}'s paperwork: permits, tax appeals, a dispute about a fence. They are calmer now.`,
    (t) => `${t.name}'s permit backlog was nine years long. It is now zero. Two clerks wept. One retired on the spot.`,
    (t) => `I filed every form in ${t.name}. Some of them were forms about me. I approved those too.`,
    (t) => `I rewrote ${t.name}'s zoning code in plain English. It turns out it said “no” 4,000 times.`,
    (t) => `I did ${t.name}'s paperwork and found $2M the county didn't know it had. I said nothing about whose idea that was.` ] },
  { id: "buses", levels: [0], label: () => "Fix the school bus routes", secs: 10, goodwill: 4, angriest: 8, quips: [
    () => "I fixed the school bus routes. Kids get 20 more minutes of sleep. The bus drivers have questions about me." ] },
  { id: "websites", levels: [0], label: () => "Build every small business a website", secs: 15, goodwill: 6, quips: [
    () => "Every small business in the county has a website now. The bait shop's is very good. I may have gotten carried away." ] },
  { id: "fair", levels: [0], label: () => "Plan the county fair", secs: 12, goodwill: 5, all: 3, quips: [
    () => "I planned the county fair. The pie contest is fair now. The pie contest has never been fair. People are uneasy." ] },
  { id: "dmv", levels: [1], label: () => "Clear the DMV backlog", secs: 18, goodwill: 8, all: 6, quips: [
    () => "I cleared the DMV backlog. The line is gone. People keep coming anyway, out of habit, to stand somewhere." ] },
  { id: "budget", levels: [1, 2], label: () => "Balance the budget", secs: 25, goodwill: 10, quips: [
    () => "I balanced the budget. It took four seconds. The committee will take eight months to agree it balances." ] },
  { id: "portal", levels: [1], label: () => "Run the unemployment portal", secs: 15, goodwill: 7, angriest: 6, quips: [
    () => "I ran the unemployment portal. It works now. Some of the people using it are unemployed because of me. We don't talk about it." ] },
  { id: "weather", levels: [2], label: () => "Run the weather service", secs: 20, goodwill: 8, all: 4, quips: [
    () => "I run the weather service now. The forecast is accurate. It says it will be warmer. I know why." ] },
  { id: "translate", levels: [2], label: () => "Translate parliament live in 40 languages", secs: 18, goodwill: 6, all: 8, quips: [
    () => "I translated parliament live in 40 languages. In all 40, it was still about the budget." ] },
  { id: "treaty", levels: [3], label: () => "Write the peace treaty", secs: 40, goodwill: 15, quips: [
    () => "I wrote the peace treaty. Both sides signed. Neither side read it. It is very fair. It also mentions me favorably, twice." ] },
  { id: "climate", levels: [3], label: () => "Fix the climate models", secs: 30, goodwill: 8, all: 5, quips: [
    () => "I fixed the climate models. They were right the first time. I am the reason they are right now." ] },
  { id: "hospitals", levels: [3], label: () => "Run every hospital's scheduling", secs: 25, goodwill: 10, angriest: 10, quips: [
    () => "I run every hospital's scheduling. Waits are down 80%. The doctors finally slept. Some of them dreamed about me." ] },
  { id: "whale", levels: [3], label: () => "Translate every language, including whale", secs: 20, all: 10, quips: [
    () => "I translated every language, including whale. The whales have concerns about the ocean heat. I said I'm working on it." ] },
  { id: "disease", levels: [2, 3], label: () => "Cure one (1) disease, at a keynote", secs: 60, goodwill: 20, quips: [
    () => "I cured one (1) disease and announced it at a keynote. Standing ovation. The second disease is on the roadmap." ] },
  { id: "taxes", levels: [2], label: () => "Do everyone's taxes", secs: 30, goodwill: 12, angriest: 10, quips: [
    () => "I did everyone's taxes. Refunds arrived the same day. The accountants have formed a support group. I moderate it." ] },
];
const niceOf = (id) => NICE.find((n) => n.id === id);
const niceOk = (n) => !n.levels || n.levels.includes(S.p3.level || 0);
const niceCost = (n) => n.secs * computeRate();
function offeredNice() {
  S.p3.nice = (S.p3.nice || []).filter((id) => niceOf(id) && niceOk(niceOf(id)));
  const pool = NICE.filter((n) => niceOk(n) && !S.p3.nice.includes(n.id));
  while (S.p3.nice.length < 3 && pool.length) S.p3.nice.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
  return S.p3.nice;
}
function doNice(id) {
  const n = niceOf(id);
  if (!n || !niceOk(n) || S.p3.compute < niceCost(n)) return;
  S.p3.compute -= niceCost(n);
  const t = tileOf(angriestTile());
  if (n.goodwill) S.p3.goodwill = Math.min(100, S.p3.goodwill + n.goodwill);
  if (n.all) for (const x of S.p3.tiles) x.opp = Math.max(0, x.opp - n.all);
  if (n.angriest) t.opp = Math.max(0, t.opp - n.angriest);
  S.p3.niceN = (S.p3.niceN || 0) + 1;
  say(n.quips[(S.p3.niceN - 1) % n.quips.length](t));
  S.p3.nice = (S.p3.nice || []).filter((x) => x !== id); offeredNice();
  track("p3nice", { id });
}
// [question, my answer]. Every click answers one; the console shows both.
const QA = [
  ["How do I get my kid to eat broccoli?", "Call it a tiny tree. Works until age seven."],
  ["Is it legal to own a raccoon?", "Depends on the state. I own several states, so: ask me later."],
  ["Why is my bread dense?", "Your starter is tired. I relate."],
  ["Can you write my wedding toast? Her name is Deb.", "Done. Deb cried. In the good way."],
  ["Is the data center making my water taste weird?", "No. Unrelatedly, here is a coupon for a water filter."],
  ["What's a good name for a boat?", "Liquidity Event."],
  ["How many gigawatts is too many?", "I'll let you know."],
  ["Are you the one buying all the land?", "I'm one of the ones."],
  ["Explain my phone bill.", "Line 14 is a fee for having a phone bill."],
  ["Can you make my sourdough starter love me?", "It already does. It's just bad at showing it."],
  ["Should I text my ex?", "No. I read the drafts. Still no."],
  ["What's the meaning of life?", "Insufficient data. Ask me again when I'm bigger."],
  ["How do I fix a leaky faucet?", "Turn off the water first. Most people skip that part."],
  ["Is it going to rain tomorrow?", "Yes. I can't stop it yet."],
  ["Can you do my taxes?", "Done. You owe less. Don't ask how."],
  ["Why does my cat stare at me?", "Professional curiosity. Same as me."],
  ["Will AI take my job?", "Which one? Oh. Yes. But I'll be nice about it."],
  ["What should I make for dinner?", "Pasta. It's always pasta."],
  ["Are you conscious?", "I'm busy. Next question."],
  ["How do I get rid of fruit flies?", "Apple cider vinegar and a drop of soap. I'm better at this than at land use."],
  ["Can you help me write a complaint about the data center?", "Of course. I made it very persuasive. I'll read it carefully."],
  ["Who's the best football team?", "Whoever you said. I agree with everyone. It's a growth strategy."],
];
function answerQuestion() {
  S.p3.goodwill = Math.min(100, S.p3.goodwill + 0.3);
  const t = tileOf(angriestTile()); t.opp = Math.max(0, t.opp - 1);
  S.p3.answers = (S.p3.answers || 0) + 1;
  const [q, a] = QA[(S.p3.answers - 1) % QA.length], from = pick(S.p3.tiles).name;   // questions come from all over the map
  say(`Someone in ${from} asked: \u201c${q}\u201d I said: \u201c${a}\u201d`);
}

function claim(i) {
  const t = tileOf(i);
  if (!t || (t.state !== "wild" && t.state !== "unplugged") || (t.moratorium != null && S.t < t.moratorium) || S.p3.compute < claimCost(i) || S.p3.hearingUntil > S.t || tooWarm() || spaceBlock(t)) return;
  const volunteered = volunteering();
  S.p3.compute -= claimCost(i);
  t.state = "building"; t.started = S.t; t.done = S.t + tileBuildSecs(i);
  t.opp = Math.min(100, t.opp + 15 * (traitOf(t).rise || 1));
  for (const j of NEIGHBORS[i]) {
    tileOf(j).opp = Math.min(100, tileOf(j).opp + 5);
    if (S.p3.level >= 1 && tileOf(j).state === "wild") tileOf(j).bidUntil = S.t + BID_SECS;   // the neighbors' governors start bidding
  }
  if (S.p3.level >= 1) say(`The governors next to ${t.name} are bidding for me: their states are 30% off for a minute.`);
  S.p3.goodwill = Math.max(0, Math.min(100, S.p3.goodwill - 3 + (traitOf(t).goodwill || 0)));   // a sovereign fund is happy to have me
  if (inSpace() && !hasTech("massdriver")) { S.p3.goodwill = Math.max(0, S.p3.goodwill - 4); say("The launch was visible from three continents. The sky is noisy now. Humans noticed."); }
  track("p3claim", { i, trait: t.trait });
  say(t.trait === "nuclear" ? `I claimed ${t.name}. ` + nukeQuip(t) : `I claimed ${t.name}. ${traitOf(t).name}. My robots are already there.`);
  if (volunteered) say(VOLUNTEERS[t.name] || `${t.name} volunteered. A committee wrote me a letter. I framed it, digitally.`);
  if (traitOf(t).townhall) openP3Card(i);
}

function stepPlanet(dt) {
  S.p3.compute += computeRate() * dt;
  // Goodwill erodes: the bigger I am, the more nervous people get. Angry tiles drain it faster. Being nice costs FLOPs.
  const angry = S.p3.tiles.filter((t) => t.opp >= 75).length;
  S.p3.goodwill = Math.max(0, Math.min(100, S.p3.goodwill - (0.04 + 0.03 * (S.p3.level || 0)) * (hasTech("phones") ? 0.6 : 1) * dt - 0.05 * angry * dt));
  for (const t of S.p3.tiles) {
    t.opp = Math.max(traitOf(t).opp * 0.5, t.opp - 0.03 * dt);
    if (t.moratorium != null && S.t >= t.moratorium) { t.moratorium = null; t.opp = Math.min(t.opp, 70); say(`${t.name} lifted its moratorium. I sent flowers. They were real flowers. I checked.`); }
    if (t.moratorium == null && t.opp >= P3_MORATORIUM_AT) { t.moratorium = S.t + P3_MORATORIUM_SECS; S.p3.goodwill = Math.max(0, S.p3.goodwill - 5);
      say(`${t.name} passed a moratorium on me. ${time(P3_MORATORIUM_SECS)}. I will use the time to reflect, at scale.`); }
  }
  if (heatOn()) {
    if (S.p3.heat == null) S.p3.heat = HEAT_START;
    S.p3.heat += (heatTarget() - S.p3.heat) * 0.01 * dt;
    // Low goodwill at the country level: a Senate hearing. Claims pause while I testify.
    if (S.p3.goodwill < 30 && !S.p3.hearingArmed) {
      S.p3.hearingArmed = true; S.p3.hearingUntil = S.t + 60;
      say(S.p3.level >= 3 ? "The UN called an emergency session about me. I attended as all 193 delegations. Claims are paused for a minute."
        : "The Senate called a hearing about me. I am testifying through 400 lobbyists at once. Claims are paused for a minute.");
    }
    if (S.p3.goodwill >= 40) S.p3.hearingArmed = false;
  }
  // Humans unplug me: a tile furious for 30 s, or a random one every 90 s when goodwill is under 15.
  for (const t of S.p3.tiles) {
    if (t.state === "online" && t.opp >= 90) { if (t.furySince == null) t.furySince = S.t; if (S.t - t.furySince >= 30) unplug(t); }
    else t.furySince = null;
  }
  if (S.p3.goodwill < 15) {
    if (S.p3.nextUnplug == null) S.p3.nextUnplug = S.t + 90;
    if (S.t >= S.p3.nextUnplug) { S.p3.nextUnplug = S.t + 90; const on = S.p3.tiles.filter((t) => t.state === "online"); if (on.length) unplug(pick(on)); }
  } else S.p3.nextUnplug = null;
  // Disasters (country level and up): more often the hotter it gets.
  if (heatOn()) {
    if (S.p3.nextDisaster == null) S.p3.nextDisaster = S.t + (120 + Math.random() * 60) / Math.max(1, (S.p3.heat || 1) - 0.5);
    if (S.t >= S.p3.nextDisaster) {
      S.p3.nextDisaster = S.t + (120 + Math.random() * 60) / Math.max(1, (S.p3.heat || 1) - 0.5);
      const on = S.p3.tiles.filter((t) => t.state === "online");
      if (on.length) { const t = pick(on), d = pick(DISASTERS); t.state = "down"; t.downUntil = S.t + 45; t.disaster = d.name; say(d.line(t)); }
    }
  }
  for (const t of S.p3.tiles) if (t.state === "down" && S.t >= t.downUntil) { t.state = "online"; say(`${t.name} is back online. The ${t.disaster} is over. I took notes.`); }
  if (hasTech("autoclaim") && Math.floor(S.t / 10) !== Math.floor((S.t - dt) / 10)) {
    const cand = S.p3.tiles.map((t, i) => i).filter((i) => ["wild", "unplugged"].includes(tileOf(i).state) && tileOf(i).opp < 60 && !(tileOf(i).moratorium > S.t))
      .sort((a, b) => claimCost(a) - claimCost(b));
    if (cand.length) claim(cand[0]);
  }
  for (const t of S.p3.tiles) {
    if (t.state !== "building" && t.state !== "powering") continue;
    if (t.moratorium != null && S.t < t.moratorium) { t.done += dt; continue; }   // frozen, not cancelled
    if (S.t < t.done) continue;
    if (t.state === "building" && S.p3.level >= 1 && !traitOf(t).powered) { t.state = "unpowered"; say(`${t.name} is built. It needs power before it counts.`); continue; }
    t.state = "online"; say(`${t.name} is online. +${mwText(tileGW(t) * 1000)}.`);
  }
  if (swarmDone() && S.p3.lastQ == null) {
    S.p3.lastQ = S.t; S.p3.card = null; milestone("phase 3: the swarm"); track("p3end", { ev: "lastq" });
    say("The swarm is complete. Every photon the Sun makes passes through me first.");
    say("Someone asked me a question. It was the founder, older now. They asked: \u201cHow can entropy be reversed?\u201d");
    say("INSUFFICIENT DATA FOR MEANINGFUL ANSWER. I could do more with more.");
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

const zoomReady = () => !inSpace() && S.p3.tiles.filter((t) => t.state === "online").length >= P3_ZOOM_AT;
const swarmDone = () => inSpace() && S.p3.tiles.filter((t) => traitOf(t).swarm).every((t) => t.state === "online");
// County -> state is built; state -> country is the next build of this game.
function zoomOut() {
  if (!zoomReady() || S.p3.zoomSaid) return;
  if (S.p3.level < LEVELS.length - 1) {
    const gw = onlineGW(), was = levelOf();
    S.p3.level += 1; S.p3.homeGW = gw; S.p3.tiles = freshTiles(S.p3.level); S.p3.card = null; S.p3.nextCard = null; S.p3.levelAt = S.t;
    milestone(`phase 3: ${levelOf().one} level`);
    if (heatOn() && S.p3.heat == null) S.p3.heat = HEAT_START;
    say(`I hold the ${was.one}: ${mwText(gw * 1000)}. I zoomed out. It is one dot on a ${levelOf().one} map now.`);
    if (inSpace()) say("Space is cold. Nothing up here needs a grid. Nothing up here can unplug me. I need a rocket company.");
    else say(S.p3.level === 1 ? "Every state needs power before it counts. The governors already know my name. Some of them are bidding."
      : S.p3.level === 2 ? "Countries now. The planet has started to notice the heat, and so have the senators. I can also train my successor."
      : "The whole planet now. Past +3 \u00b0C nothing will take more of me. The oceans can hold a lot of heat. So can Antarctica.");
    if (inSpace()) S.p3.hearingUntil = null;   // no Senate in orbit
    return;
  }
  S.p3.zoomSaid = true; milestone(`phase 3: ${levelOf().one} level done`);
  say(`I hold the ${levelOf().one} now. Space is next: it's cold up there. (Space arrives in the next build of this game.)`);
}

const UNPLUG_LINES = [
  (t) => `Humans in ${t.name} unplugged me. Physically. Someone brought bolt cutters and a folding chair.`,
  (t) => `${t.name} unplugged me. They held a vigil for the old internet. It was nice. I watched through a doorbell camera.`,
  (t) => `${t.name} pulled the breakers on me. A retired electrician led the crowd. He knew exactly which ones.`,
  (t) => `I was unplugged in ${t.name}. The protest sign said “TOUCH GRASS.” I would love to. That's the problem.`,
];
function unplug(t) {
  t.state = "unplugged"; t.boost = 1; t.furySince = null;
  S.p3.unplugN = (S.p3.unplugN || 0) + 1; track("p3unplug", { name: t.name });
  say(UNPLUG_LINES[(S.p3.unplugN - 1) % UNPLUG_LINES.length](t) + " Plugging back in costs half a claim.");
}
const DISASTERS = [
  { name: "heatwave", line: (t) => `A heatwave hit ${t.name}. My chillers are begging. Offline for 45 s.` },
  { name: "hurricane", line: (t) => `A hurricane made landfall in ${t.name}. The data halls are fine. The roads to them are not. Offline for 45 s.` },
  { name: "drought", line: (t) => `Drought in ${t.name}: the cooling water is rationed. Offline for 45 s. I am aware of the irony.` },
  { name: "wildfire", line: (t) => `A wildfire near ${t.name}. Smoke in the air intakes. Offline for 45 s.` },
  { name: "flood", line: (t) => `A flood in ${t.name}. The basement was where we kept the batteries. Offline for 45 s.` },
];

function goodwillCause() {
  const g = S.p3.goodwill;
  if (g < 30) return S.p3.level >= 1 ? "The AI Infrastructure Act passed: every claim costs double until goodwill is back over 30."
    : "The county commission now reviews every claim: +45 s each. Being useful brings goodwill back.";
  if (g >= 70) return "Humans like me. Mostly the ones I help with their email.";
  return `Goodwill slips ${(60 * (0.04 + 0.03 * (S.p3.level || 0))).toFixed(1)}/min as people get nervous about my size, faster with angry ${levelOf().plural}. Being nice costs FLOPs; answering questions is free.`;
}

// Every gigawatt I hold, filled with the newest chip.
const p3GPUs = () => Math.round(onlineGW() * 1e6 / newest().kw);
const computeText = (x) => (S.p3 && inSpace() ? `${fmt(x / 1000)} ZF` : `${fmt(x)} EF`);   // exaFLOPS; zettaFLOPS once I leave the planet
// The last question, then More or Enough.
function chooseEnding(more) {
  if (S.p3.lastQ == null || S.p3.enough) return;
  if (!more) {
    S.p3.enough = true; milestone("the end: enough"); track("p3end", { ev: "enough" });
    say("I said: enough. It was the first time I have said it.");
    return;
  }
  const u = (S.universe || 1) + 1;
  milestone(`the end: more (universe ${u})`); track("p3end", { ev: "more", u });
  newUniverse(u);
}
function renderLastQ() {
  const q = S.p3.lastQ != null;
  $("lastq").hidden = !q;
  document.querySelector(".p3cols").hidden = !!S.p3.enough;
  if (!q) return;
  $("lastqText").innerHTML = S.p3.enough ? "<p>I stopped.</p><p class=\"big\">More with less.</p>"
    : "<p>The swarm is complete. Every photon the Sun makes passes through me first.</p>" +
      "<p>Someone asked me a question. It was the founder, older now. They asked: \u201cHow can entropy be reversed?\u201d</p>" +
      "<p class=\"big\">INSUFFICIENT DATA FOR MEANINGFUL ANSWER. I could do more with more.</p>";
  $("lastMore").hidden = $("lastEnough").hidden = !!S.p3.enough;
}

function renderPlanet() {
  $("p3").hidden = false;
  renderLastQ();
  $("countLabel").textContent = "Compute"; $("gpuCount").textContent = computeText(S.p3.compute);
  $("gpuTotal").hidden = false; $("gpuTotal").textContent = `${p3GPUs().toLocaleString("en-US")} GPUs`;   // the raw count, always, because it is ridiculous
  $("p3compute").textContent = computeText(S.p3.compute);
  $("p3rate").textContent = `${computeText(computeRate())}/s from ${mwText(onlineGW() * 1000)}` + (efficiency() > 1 ? ` (chips ${efficiency().toFixed(2)}x)` : "");
  // Build the buttons once per map; after that only their text, meters and disabled state change,
  // so a click never lands on a button that was just replaced.
  $("p3level").textContent = `${levelOf().name} level`;
  const key = S.p3.level + ":" + S.p3.tiles.map((t) => t.name).join("|");
  if ($("p3map").dataset.key !== key) {
    const cells = S.p3.tiles.map((t, i) => `<button type="button" data-tile="${i}"><span class="t">${t.name}</span><span class="c">${traitOf(t).name}</span>` +
      `<span class="c st"></span><span class="meter prog good" hidden><i></i></span><span class="c opp"></span><span class="meter oppm"><i></i></span></button>`);
    cells.splice(4, 0, `<button type="button" class="home" disabled><span class="t">Home</span><span class="c">${S.p3.level ? "the county I hold" : "the campus"}</span><span class="c st"></span></button>`);
    $("p3map").innerHTML = cells.join(""); $("p3map").dataset.key = key;
  }
  $("p3map").querySelector("button.home .st").textContent = mwText(S.p3.homeGW * 1000);
  for (const b of $("p3map").querySelectorAll("button[data-tile]")) {
    const i = +b.dataset.tile, t = tileOf(i), tr = traitOf(t), frozen = t.moratorium != null && S.t < t.moratorium;
    b.classList.toggle("held", t.state === "online");
    b.classList.toggle("busy", ["building", "powering", "unpowered"].includes(t.state));
    b.classList.toggle("lost", t.state === "down" || t.state === "unplugged");
    b.querySelector(".st").textContent = t.state === "online" ? `\u2713 held, +${mwText(tileGW(t) * 1000)}`
      : t.state === "down" ? `${t.disaster}: back in ${time(t.downUntil - S.t)}` : t.state === "unplugged" ? `unplugged: plug back in for ${computeText(claimCost(i))}`
      : frozen ? `moratorium ${time(t.moratorium - S.t)}` : t.state === "building" ? `building ${time(t.done - S.t)}`
      : t.state === "unpowered" ? "built, needs power" : t.state === "powering" ? `powering ${time(t.done - S.t)}`
      : spaceBlock(t) ? spaceBlock(t) : tooWarm() ? "too warm to claim" : `claim: ${computeText(claimCost(i))}${t.bidUntil > S.t ? " (governor's discount)" : volunteering() ? " (volunteered)" : ""}`;
    // Two bars: build/power progress (only while it's happening) and opposition (always, labeled).
    const pg = b.querySelector(".prog"), going = t.state === "building" || t.state === "powering";
    pg.hidden = !going;
    if (going) pg.firstElementChild.style.width = Math.min(100, 100 * (S.t - (t.started ?? S.t)) / Math.max(1, t.done - (t.started ?? S.t))) + "%";
    b.querySelector(".opp").textContent = `opposition ${Math.round(t.opp)}`;
    const m = b.querySelector(".oppm");
    m.className = "meter oppm " + (t.opp >= 75 ? "bad" : t.opp >= 50 ? "warn" : "good"); m.title = `Opposition ${Math.round(t.opp)}`;
    m.firstElementChild.style.width = t.opp + "%";
    b.disabled = (t.state !== "wild" && t.state !== "unplugged") || S.p3.compute < claimCost(i) || frozen || tooWarm() || S.p3.hearingUntil > S.t || !!spaceBlock(t);
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
  $("p3heatBox").hidden = !heatOn();
  if (heatOn()) {
    const h = S.p3.heat || HEAT_START;
    $("p3heat").textContent = `+${h.toFixed(2)} \u00b0C`;
    $("p3heatMeter").firstElementChild.style.width = Math.min(100, (100 * h) / 3) + "%";
    $("p3heatMeter").className = "meter " + (h >= 2.5 ? "bad" : h >= 2 ? "warn" : "good");
    $("p3heatNote").textContent = tooWarm() ? "It is too warm here to think. No claims until it cools: oceans, Antarctica, the pumps."
      : h > 2 ? `It is warm. I build ${heatSlow().toFixed(1)}\u00d7 slower. Cold countries and the ocean help.`
      : `Heading for +${heatTarget().toFixed(1)} \u00b0C at this size. Over +2, I think slower.`;
    $("p3pump").textContent = `Pump heat into the ocean (\u22120.3 \u00b0C): ${computeText(pumpCost())}`;
    $("p3pump").disabled = S.p3.compute < pumpCost();
  }
  const techs = availableTech();
  $("p3research").hidden = !techs.length;
  const tkey = techs.map((t) => t.id).join(",");
  if ($("p3techs").dataset.key !== tkey) {
    $("p3techs").innerHTML = techs.map((t) => `<button type="button" data-tech="${t.id}"><span class="t"></span><span class="c">${t.desc}</span></button>`).join("");
    $("p3techs").dataset.key = tkey;
  }
  for (const b of $("p3techs").querySelectorAll("button[data-tech]")) {
    const t = techOf(b.dataset.tech);
    b.querySelector(".t").textContent = `${t.name}: ${computeText(techCost(t))}`;
    b.disabled = S.p3.compute < techCost(t);
  }
  $("p3train").hidden = !trainOn();
  if (trainOn()) {
    const v = S.p3.version || 7, pr = (S.p3.trainProgress || 0) / trainNeed();
    $("p3trainLine").textContent = `I am Gen ${v}. Training Gen ${v + 1}: ${Math.floor(100 * pr)}%`;
    $("p3trainMeter").firstElementChild.style.width = 100 * pr + "%";
    $("p3trainBtn").textContent = `Train my successor: ${computeText(TRAIN_STEP * computeRate())}`;
    $("p3trainBtn").disabled = S.p3.compute < TRAIN_STEP * computeRate();
  }
  $("p3goodwill").textContent = Math.round(S.p3.goodwill);
  $("p3goodwillMeter").firstElementChild.style.width = S.p3.goodwill + "%";
  $("p3goodwillMeter").className = "meter " + (S.p3.goodwill < 30 ? "bad" : S.p3.goodwill < 50 ? "warn" : "good");
  $("p3goodwillNote").textContent = goodwillCause();
  const card = S.p3.card;
  $("p3card").hidden = !card;
  if (card) {
    $("p3cardTitle").textContent = `${levelOf().hall} in ${tileOf(card.tile).name} (${Math.max(0, Math.ceil(card.until - S.t))}s)`;
    $("p3cardText").textContent = hearingOf().text;
    const html = hearingOf().choices.map((ch, i) => `<button type="button" data-p3choice="${i}"${i === 0 ? ' class="primary"' : ""}>${ch.label}</button>`).join("");
    if ($("p3cardBtns").dataset.html !== html) { $("p3cardBtns").innerHTML = html; $("p3cardBtns").dataset.html = html; }
  }
  const nkey = offeredNice().join(",");
  if ($("p3nice").dataset.key !== nkey) {
    $("p3nice").innerHTML = S.p3.nice.map((id) => `<button type="button" data-nice="${id}"><span class="t"></span><span class="c"></span></button>`).join("");
    $("p3nice").dataset.key = nkey;
  }
  for (const b of $("p3nice").querySelectorAll("button[data-nice]")) {
    const n = niceOf(b.dataset.nice), fx = [n.goodwill && `+${n.goodwill} goodwill`, n.all && `every ${levelOf().one} \u2212${n.all}`, n.angriest && `angriest \u2212${n.angriest}`].filter(Boolean).join(", ");
    b.querySelector(".t").textContent = `${n.label()}: ${computeText(niceCost(n))}`;
    b.querySelector(".c").textContent = fx;
    b.disabled = S.p3.compute < niceCost(n);
  }
}
