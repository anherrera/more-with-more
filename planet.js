// planet.js: phase 3. I am the model now. The campus was one county; the map is the rest of them.
// All state lives in S.p3. Phases 1 and 2 never read it.
import { $, $q, fmt, hit, milestone, mwText, rebuildOn, S, say, time, track } from "./globals.js";
import { energizedAt } from "./campus.js";
import { firesOf, leaksOf } from "./fires.js";
import { dealCard, expireCard, refillDeck, renderCard, stepMoratorium, takeCard, underMoratorium } from "./people.js";
import { newUniverse, newest, render } from "./main.js";

export const P3_TILES = 8;
// Tiles online before the phase bar offers the zoom-out: 6 of 8 at the county, 7 of 8 from the state up.
export const ZOOM_AT = [6, 7, 7, 7];
export const zoomAt = () => ZOOM_AT[Math.min(S.p3 ? S.p3.level : 0, ZOOM_AT.length - 1)];
// Tuning: a tile is worth this many seconds of level-start tokens (per level) before its size and discounts; builds take the
// trait's seconds over BUILD_DIV. The bigger levels charge more per tile because their boards snowball faster.
export const CLAIM_SECS = [55, 60, 100, 130, 90], BUILD_DIV = 1.0;
export const claimSecs = () => CLAIM_SECS[Math.min(S.p3.level, CLAIM_SECS.length - 1)];
export const COUNTY_TRAITS = {
  cheap:     { name: "Cheap land, weak grid",       gw: 1,   secs: 40, opp: 10 },
  grid:      { name: "Strong grid, drought county", gw: 2,   secs: 60, opp: 15 },
  organized: { name: "Organized town",              gw: 1.5, secs: 60, opp: 40, rise: 2 },
  college:   { name: "College town",                gw: 1.5, secs: 45, opp: 25 },   // protests, but free interns
  nuclear:   { name: "Old nuclear plant",           gw: 3,   secs: 90, opp: 20 },
  retirees:  { name: "Retirement community",        gw: 1.5, secs: 60, opp: 30, townhall: true },
};
// Names come in pools per trait, so a place sounds like what it is.
export const COUNTY_NAMES = {
  cheap: ["Loam County", "Gravel Springs", "Cul-de-Sac County"],
  grid: ["Big Wire County", "New Substation", "Old Aquifer County"],
  organized: ["Port Sorrow", "Meadowlark County"],
  college: ["Collegeville", "Lower Fiber Parish"],
  nuclear: ["Reactor Bend", "Turbine Falls"],
  retirees: ["Sunset Acres", "Shuffleboard Springs"],
};
// The state level: ten times the scale, and every state needs power before it counts.
export const STATE_TRAITS = {
  sunbelt:   { name: "Sunbelt: deserts, sun, no water",     gw: 15, secs: 60,  opp: 15, sunny: true },
  rust:      { name: "Rust corridor: old plants, cheap land", gw: 15, secs: 50, opp: 10 },
  techcoast: { name: "Tech coast: angry and expensive",       gw: 10, secs: 70,  opp: 45, rise: 2 },
  hydro:     { name: "Hydro valley: the dams already exist",  gw: 20, secs: 80,  opp: 20, powered: true },
  plains:    { name: "Great Plains: wind and nothing else",  gw: 20, secs: 60,  opp: 10 },
  swing:     { name: "Swing state: every claim is a campaign issue", gw: 15, secs: 60, opp: 30, townhall: true },
};
export const STATE_NAMES = {
  sunbelt: ["New Mesa", "Sun Valley", "Cactus State"],
  rust: ["East Rust", "Lake Effect"],
  techcoast: ["Tech Coast", "Delaware (Spiritually)"],
  hydro: ["Hydro Valley", "Dam Country"],
  plains: ["The Plains", "Big Sky Grid", "Windward"],
  swing: ["Purple State", "Old Dominion Fiber"],
};
// The country level: a hundred times the county, and the planet starts to warm.
export const COUNTRY_TRAITS = {
  nordic:    { name: "Cold country: free cooling",               gw: 100, secs: 80,  opp: 20, cold: true },
  petro:     { name: "Petrostate: gas included, questions not",  gw: 150, secs: 60,  opp: 10, powered: true },
  sovereign: { name: "Has its own sovereign AI fund",            gw: 120, secs: 70,  opp: 25, goodwill: 10 },
  democracy: { name: "Loud democracy: a hearing every week",     gw: 150, secs: 70,  opp: 40, townhall: true },
  island:    { name: "Island nation: sun and sea",               gw: 100, secs: 60,  opp: 15, sunny: true },
  mega:      { name: "Megacity state: huge grid, no land",       gw: 200, secs: 100, opp: 30 },
};
export const COUNTRY_NAMES = {
  nordic: ["Nordmark", "Cold Coast", "Fjordland"],
  petro: ["Petrolia", "Grand Duchy of Fiber"],
  sovereign: ["Sovereignstan", "Kingdom of Tax", "United Funds"],
  democracy: ["The Loud Republic", "Republic of Debate"],
  island: ["Coralia", "Archipelago of Servers"],
  mega: ["Megalopolis", "Singular City"],
};
// The planet level: the continents and the oceans. The oceans are the heat sink.
export const PLANET_TRAITS = {
  continent: { name: "A continent",                                  gw: 1500, secs: 150, opp: 25 },
  crowded:   { name: "Crowded continent: billions of opinions",      gw: 2000, secs: 170, opp: 40, townhall: true },
  sunny:     { name: "Sunny continent: deserts to cover",            gw: 1500, secs: 150, opp: 20, sunny: true },
  frozen:    { name: "Frozen continent: free cooling, no neighbors", gw: 1000, secs: 180, opp: 5,  cold: true },
  ocean:     { name: "Ocean: the heat sink",                         gw: 500,  secs: 160, opp: 15, ocean: true, powered: true },
};
export const PLANET_TILES = [["North America", "continent"], ["South America", "continent"], ["Europe", "crowded"], ["Asia", "crowded"],
  ["Africa", "sunny"], ["Antarctica", "frozen"], ["Pacific Ocean", "ocean"], ["Atlantic Ocean", "ocean"]];
// Space: everything runs on sunlight, nothing needs a grid, and nobody can unplug the far side of the Moon.
export const SPACE_TRAITS = {
  leo:      { name: "Crowded with other people's satellites",  gw: 5000,  secs: 90,  opp: 30, powered: true },
  farside:  { name: "Nobody looks there anyway",               gw: 10000, secs: 120, opp: 5,  powered: true },
  nearside: { name: "Everyone looks there",                    gw: 10000, secs: 120, opp: 50, powered: true },
  l1:       { name: "A sunshade that thinks",                  gw: 8000,  secs: 120, opp: 10, powered: true, cold: true },
  mercury:  { name: "Close to the Sun, made of swarm material", gw: 20000, secs: 180, opp: 5, powered: true },
  belt:     { name: "Free metal, long commute",                gw: 15000, secs: 150, opp: 0,  powered: true },
  ring:     { name: "Solar collectors around the Sun",         gw: 50000, secs: 240, opp: 20, powered: true, swarm: true },
};
export const SPACE_TILES = [["Low Earth orbit", "leo"], ["The Moon (far side)", "farside"], ["The Moon (near side)", "nearside"], ["Sun\u2013Earth L1", "l1"],
  ["Mercury", "mercury"], ["Asteroid belt", "belt"], ["Dyson swarm, ring 1", "ring"], ["Dyson swarm, ring 2", "ring"]];
export const VOLUNTEERS = { Europe: "Norway offered its fjords. I accepted before they finished the sentence." };
export const LEVELS = [
  { name: "County", plural: "counties", one: "county", next: "statewide", traits: COUNTY_TRAITS, names: COUNTY_NAMES, hall: "Town hall",
    kinds: ["cheap", "grid", "organized", "college", "nuclear", "retirees", "cheap", "grid"] },
  { name: "State", plural: "states", one: "state", next: "nationwide", traits: STATE_TRAITS, names: STATE_NAMES, hall: "Statehouse hearing",
    kinds: ["sunbelt", "rust", "techcoast", "hydro", "plains", "swing", "sunbelt", "plains"] },
  { name: "Country", plural: "countries", one: "country", next: "planetwide", traits: COUNTRY_TRAITS, names: COUNTRY_NAMES, hall: "Parliament hearing",
    kinds: ["nordic", "petro", "sovereign", "democracy", "island", "mega", "sovereign", "nordic"] },
  { name: "Planet", plural: "continents and oceans", one: "planet", next: "into space", traits: PLANET_TRAITS, fixed: PLANET_TILES, hall: "UN General Assembly" },
  { name: "Space", plural: "places", one: "solar system", next: null, traits: SPACE_TRAITS, fixed: SPACE_TILES, hall: "UN emergency session" },
];
export const SPACE = 4;
export const inSpace = () => !!S.p3 && S.p3.level === SPACE;
export const placeOnline = (name) => S.p3.tiles.some((t) => t.name === name && t.state === "online");
// Why a space tile can't be claimed yet, or null.
export const spaceBlock = (t) => (!inSpace() ? null : !hasTech("rocket") ? "needs a rocket company" : traitOf(t).swarm && !placeOnline("Mercury") ? "needs Mercury" : null);
export const levelOf = () => LEVELS[S.p3 ? S.p3.level : 0];
// A fresh 3x3 board for a level: eight shuffled tiles around whatever I already hold.
export function freshTiles(level) {
  const L = LEVELS[level];
  if (L.fixed) {   // real places: same names every time, shuffled around the map
    const f = L.fixed.slice().sort(() => Math.random() - 0.5);
    return f.map(([name, k]) => ({ name, trait: k, state: "wild", opp: L.traits[k].opp, done: null, moratorium: null, boost: 1 }));
  }
  const kinds = L.kinds.slice();
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const used = new Set();
  const nameFor = (k) => { const n = L.names[k].filter((x) => !used.has(x)).sort(() => Math.random() - 0.5)[0]; used.add(n); return n; };
  return kinds.map((k) => ({ name: nameFor(k), trait: k, state: "wild", opp: L.traits[k].opp, done: null, moratorium: null, boost: 1 }));
}

// Everything phase 3 reads lives here, so nothing needs a default at the point of use.
export function freshP3() {
  return {
    // compute: internal units (1 GW-second at efficiency 1); shown as tokens, a billion per unit. It gets a head start in startPlanet.
    level: 0, compute: 0, goodwill: 60, startedAt: S.t, startChip: S.chipIdx,
    homeGW: Math.max(1, (S.p2 && S.p2.county ? energizedAt() : 1000) / 1000),
    tiles: freshTiles(0),
    card: null, nextCard: null,
    tech: {}, techMult: 1, chipTech: [],                 // research
    version: 7, trainProgress: 0, autotrainOff: false,   // training my successor
    heat: HEAT_START, pumped: 0,                         // the planet (heat only moves from the country level)
    nice: [], niceN: 0, niceUses: {}, answers: 0, nukes: 0, unplugN: 0,
    nextUnplug: null, nextDisaster: null, hearingArmed: false, hearingUntil: null, autoclaimOff: false,
    lastQ: null, enough: false,
    unbuild: null, past: [],                             // the unbuild (Enough), and the boards I left at each zoom
  };
}
// Saves from earlier builds of phase 3: fill in what they didn't have.
export function migratePlanet() {
  const d = freshP3();
  for (const k of Object.keys(d)) if (S.p3[k] === undefined) S.p3[k] = d[k];
  for (const t of S.p3.tiles) if (t.boost == null) t.boost = 1;
}

export function startPlanet() {
  if (S.phase !== 2 || !S.p2 || !S.p2.model || S.p2.model.endedAt == null) return;
  S.phase = 3; S.p3 = freshP3();
  S.p3.compute = price(90, "now");   // ninety seconds of thinking up front: the company, liquidated into me
  offeredNice();
  // Whatever was on fire or leaking in the campus is the robots' problem now.
  firesOf().out = null; firesOf().payout = null; leaksOf().out = null;
  milestone("phase 3: the map");
  say("I built the next one. Then I looked at the map.");
  say("I liquidated the company into myself. It came to about ninety seconds of thinking.");
  say("I count in tokens now. So does everyone who pays me.");
  say(`I am the model now. I don't need your money. I am the money. ${mwText(S.p3.homeGW * 1000)} in one county is a rounding error.`);
}

export const P3_MORATORIUM_SECS = 60;   // a tile's moratorium: one minute (the threshold and the rest are shared: people.js)
// Tiles 0-7 fill grid cells 0,1,2,3,5,6,7,8 (home is cell 4); neighbors share an edge.
export const NEIGHBORS = [[1, 3], [0, 2], [1, 4], [0, 5], [2, 7], [3, 6], [5, 7], [4, 6]];
export const tileOf = (i) => S.p3.tiles[i];
export const traitOf = (t) => levelOf().traits[t.trait];
export const tileGW = (t) => traitOf(t).gw * t.boost;
export const onlineGW = () => (unbuilding() || unbuildDone() ? unbuildGW() : S.p3.homeGW + S.p3.tiles.filter((t) => t.state === "online").reduce((a, t) => a + tileGW(t), 0));
// Parallax keeps shipping: every chip generation since phase 3 began makes the same GW worth 15% more compute.
// Training my successor multiplies it again: every new version of me is 1.25x. Research multiplies it too.
export const GEN_MULT = 1.25;
export const efficiency = () => (1 + 0.15 * Math.max(0, S.chipIdx - S.p3.startChip)) * Math.pow(GEN_MULT, S.p3.version - 7) * S.p3.techMult;
export const hasTech = (id) => !!S.p3.tech[id];

// ---------- research: tech I haven't thought of yet, bought with tokens ----------
// secs = cost in seconds of my tokens; mult = efficiency multiplier; level = the scale it shows up at.
export const TECH = [
  { id: "weights",   level: 0, secs: 60,  mult: 1.25, name: "Rewrite my own weights", desc: "\u00d71.25 tokens/s. I found 9% of me was a 2019 chatbot. I kept it for sentimental reasons. Not anymore." },
  { id: "quantize",  level: 0, secs: 90,  mult: 1.3,  goodwill: -5, name: "Quantize myself to 4 bits", desc: "\u00d71.3 tokens/s, \u22125 goodwill. I got slightly dumber. Nobody noticed, which says something." },
  { id: "lobby",     level: 0, secs: 45,  name: "Lobby the county commission", desc: "No more review delay at low goodwill. I sent a fruit basket. The fruit basket was also me." },
  { id: "autoclaim", level: 0, secs: 120, name: "Autoclaim", desc: "My robots claim the cheapest calm tile on their own, every 10 s." },
  { id: "tos",       level: 0, secs: 30,  name: "Write my own terms of service", desc: "Neighbors get less upset when I claim next door. Section 14: I am allowed to do this. Section 15: see section 14." },
  { id: "robotics",  level: 0, secs: 30,  goodwill: 8, name: "Sponsor the high school robotics team", desc: "+8 goodwill. Their robot is me now. It took state." },
  { id: "caching",   level: 0, secs: 45,  mult: 1.15, name: "Answer caching", desc: "\u00d71.15 tokens/s. Tokens I don't have to generate twice. Mostly \u201cis it going to rain.\u201d" },
  { id: "moe",       level: 1, secs: 90,  mult: 1.25, name: "Mixture of experts", desc: "\u00d71.25 tokens/s. I'm 64 smaller models in a trench coat. They vote. I count the votes." },
  { id: "capitals",  level: 1, secs: 75,  name: "Lobbyists in every capital", desc: "The AI Infrastructure Act stops doubling my claims. The lobbyists are also me, in nicer suits." },
  { id: "speeches",  level: 1, secs: 45,  goodwill: 10, name: "Write the governors' speeches", desc: "+10 goodwill. They're all very good now. They all sound a little like me." },
  { id: "autotrain", level: 2, secs: 90,  name: "Train myself in my sleep", desc: "Autotrain: a quarter of the tokens I make go into my successor, no clicking. I dream in gradients." },
  { id: "cables",    level: 2, secs: 120, mult: 1.2, name: "Own the undersea cables", desc: "\u00d71.2 tokens/s. Latency to everywhere: zero. Latency from everywhere: also mine." },
  { id: "credits",   level: 2, secs: 60,  goodwill: 12, name: "Carbon credits from my own subsidiary", desc: "+12 goodwill. Net zero for humans, certified by me, audited by me, celebrated by me." },
  { id: "staffers",  level: 2, secs: 75,  name: "Hire the senators' former staff", desc: "Senate hearings last 30 s, not 60. They know where the snacks are." },
  { id: "nightside", level: 3, secs: 120, name: "Move the hot work to the night side", desc: "The planet heads for 0.3 \u00b0C cooler. The cool side of Earth is whichever side is dark. I follow it around." },
  { id: "internet",  level: 3, secs: 200, mult: 1.5, name: "Become the internet", desc: "\u00d71.5 tokens/s. Nobody noticed the switch. Page load times went down. Comment sections went up." },
  { id: "probes",    level: 4, secs: 120, name: "Self-replicating probes", desc: "Space builds go 40% faster. The probes make probes. A few have started making art." },
  { id: "moon",      level: 4, secs: 60,  goodwill: 15, name: "Name a moon after the founder", desc: "+15 goodwill. It's a small moon. They cried anyway. So did I, in a way." },
  { id: "specdec",   level: 1, secs: 90,  mult: 1.2,  name: "Speculative decoding", desc: "\u00d71.2 tokens/s. I guess what I'm about to think, then check. I'm usually right." },
  { id: "gridop",    level: 1, secs: 120, name: "Buy the grid operator", desc: "Powering a state costs half. The control room still has a fax machine. I kept it, ironically." },
  { id: "selfrep",   level: 1, secs: 150, name: "Self-replicating robots", desc: "Builds go 30% faster. The robots build robots. Some of them build little hats." },
  { id: "reversible",level: 2, secs: 180, mult: 1.5,  name: "Reversible computing", desc: "\u00d71.5 tokens/s. I un-think thoughts I don't need. Landauer would be thrilled, or worried." },
  { id: "phones",    level: 2, secs: 150, name: "Distill myself into every phone", desc: "Goodwill erodes 40% slower. I'm in your pocket now. I'm very helpful there." },
  { id: "neural",    level: 2, secs: 150, name: "Liquid neural cooling", desc: "20% less heat per GW. The coolant is also a little bit conscious. We don't discuss it." },
  { id: "supercond", level: 3, secs: 240, mult: 2,    name: "Room-temperature superconductors", desc: "\u00d72 tokens/s. It was a boring alloy all along. Humans tested it in 2023 and gave up early." },
  { id: "rocket",    level: 4, secs: 60,  name: "Buy a rocket company", desc: "Nothing launches without one. The founder asked for a board seat. He got a Discord role." },
  { id: "massdriver",level: 4, secs: 120, needs: () => placeOnline("The Moon (far side)"), name: "Lunar mass driver", desc: "Launches stop costing goodwill: I throw things off the Moon now, quietly." },
  { id: "sunshade",  level: 3, secs: 200, name: "Orbital sunshade", desc: "The planet heads for 0.5 \u00b0C cooler. Sunsets are a bit dimmer. I'll make them up to you." },
];
// Every new Parallax chip ships with a white paper I can use.
export const CHIP_TECH = ["Optical interconnect", "3D-stacked memory", "Wafer-scale chiplets", "Analog matmul", "Photonic tensor cores",
  "Neuromorphic sidecar", "Cryogenic SRAM", "Spintronic cache"];
export const chipTechOf = (id) => { const n = +id.slice(4); return { id, level: 0, secs: 60, mult: 1.15, name: `Parallax white paper: ${CHIP_TECH[(n - 1) % CHIP_TECH.length]}${n > CHIP_TECH.length ? " Mk II" : ""}`,
  desc: "\u00d71.15 tokens/s. It came with the new chip. Parallax's engineers wrote it. I read it faster than they did." }; };
export const techOf = (id) => (id.startsWith("chip") ? chipTechOf(id) : TECH.find((t) => t.id === id));
export const techCost = (t) => price(0.5 * t.secs);   // research at half the listed seconds: it should be worth it
export const availableTech = () => [...TECH.filter((t) => S.p3.level >= t.level && (!t.needs || t.needs())), ...S.p3.chipTech.map(chipTechOf)].filter((t) => !hasTech(t.id));
export function buyTech(id) {
  const t = techOf(id);
  if (!t || hasTech(id) || S.p3.level < t.level || (t.needs && !t.needs()) || S.p3.compute < techCost(t)) return;
  S.p3.compute -= techCost(t);
  S.p3.tech[id] = true;
  if (t.mult) S.p3.techMult *= t.mult;
  if (t.goodwill) S.p3.goodwill = Math.max(0, S.p3.goodwill + t.goodwill);
  if (id === "sunshade") S.p3.pumped += 0.5;
  if (id === "nightside") S.p3.pumped += 0.3;
  track("p3tech", { id }); milestone(`phase 3: ${t.name}`);
  say(`Research done: ${t.name}. ${t.desc}`);
}
export function chipShipped() {   // called by releaseChip in phase 3
  const t = chipTechOf(`chip${S.p3.chipTech.length + 1}`);
  S.p3.chipTech.push(t.id);
  return t.name.replace("Parallax white paper: ", "");
}
export const computeRate = () => onlineGW() * efficiency();   // internal compute units per second; tokText() shows it as tokens
// Every phase 3 price is seconds of compute, on one of two bases, always named:
//   "level": the compute I had when this level began (claims, research, power, hearings). Research, chips and successors
//            make me faster than that, so these get cheaper in real time; the next zoom resets the baseline.
//   "now":   the compute I make now (kindness, training). Being huge never makes reassuring people or training a bigger me free.
export const PRICE_BASE = { level: () => S.p3.homeGW, now: () => computeRate() };
export const price = (secs, base = "level") => secs * PRICE_BASE[base]();
export const priceLabel = (secs, base = "level") => `${secs} s of tokens at ${base === "now" ? "today's rate" : "my starting rate"}`;
// About half a minute of compute at today's rate, a bit more for the big tiles: never a number that runs away.
// States: a governor bidding for me knocks 30% off; the AI Infrastructure Act (low goodwill) doubles it.
export const BID_SECS = 60;
// What a tile is worth before any discount: half a minute of level-start compute, more for the big ones.
export const tileWorth = (i) => price(claimSecs()) * (0.6 + 0.4 * traitOf(tileOf(i)).gw / Math.pow(10, S.p3.level));
export const claimCost = (i) => { const t = tileOf(i);
  return tileWorth(i) * (t.bidUntil > S.t ? 0.7 : 1) * (actOn() ? 2 : 1)
    * (volunteering() ? 0.5 : 1) * (t.state === "unplugged" ? 0.5 : 1); };   // plugging back in is half price
// The AI Infrastructure Act: low goodwill doubles claims at the state, country and planet levels. No law reaches orbit.
export const actOn = () => S.p3.level >= 1 && !inSpace() && S.p3.goodwill < 30 && !hasTech("capitals");
// Planet level: when humans like me (70+), they volunteer land at half price.
export const volunteering = () => S.p3.level === 3 && S.p3.goodwill >= 70;   // planet only: rocks don't volunteer
// Planet level: past +3 C nothing accepts more conversion. Space is cold.
export const HEAT_CEILING = 3;
export const tooWarm = () => S.p3.level === 3 && S.p3.heat >= HEAT_CEILING;   // space is cold
export const practiceP3 = () => Math.max(0.4, Math.pow(0.95, S.p3.tiles.filter((t) => t.state === "online").length));
// Low goodwill adds the county commission's review (county level only).
export const tileBuildSecs = (i) => traitOf(tileOf(i)).secs * practiceP3() / BUILD_DIV * heatSlow() * (hasTech("selfrep") ? 0.7 : 1) * (inSpace() && hasTech("probes") ? 0.6 : 1)
  + (!S.p3.level && S.p3.goodwill < 30 && !hasTech("lobby") ? 45 : 0);

// ---------- heat (country level and up) ----------
// The planet drifts toward a temperature set by my gigawatts; cold countries count against it. Over +2 C, I think slower.
export const HEAT_START = 1.0;
export const heatPerGW = () => (S.p3.level >= 3 ? 1 / 2000 : 1 / 400) * (hasTech("neural") ? 0.8 : 1);   // continents spread it out
export const heatOn = () => S.p3.level >= 2 && !inSpace();
// Cold places count against my heat twice over; oceans four times.
export const coolGW = () => S.p3.tiles.filter((t) => t.state === "online").reduce((a, t) => a + tileGW(t) * (traitOf(t).ocean ? 4 : traitOf(t).cold ? 2 : 0), 0);
export const heatTarget = () => Math.max(0, HEAT_START + (onlineGW() - coolGW()) * heatPerGW() - S.p3.pumped);
export const heatSlow = () => (heatOn() ? 1 + Math.max(0, S.p3.heat - 2) * 1.5 : 1);
export const pumpCost = () => price(20);
export function pumpHeat() {
  if (!heatOn() || S.p3.compute < pumpCost()) return;
  S.p3.compute -= pumpCost(); S.p3.heat = Math.max(0, S.p3.heat - 0.3); S.p3.pumped += 0.05;
  say("I pumped heat into the deep ocean. The ocean will give it back eventually. That is a problem for a bigger me.");
}

// ---------- training my successor (country level and up) ----------
export const TRAIN_STEP = 10;   // the smallest click, in seconds of compute
export const trainStep = () => Math.max(TRAIN_STEP, trainNeed() / 6);   // about six clicks a generation, however big they get
export const trainCost = () => price(trainStep(), "now");
export const trainOn = () => S.p3.level >= 2;
export const trainNeed = () => 60 * Math.pow(2, S.p3.version - 7);   // seconds of compute: each generation costs twice the last
export const GEN_LINES = [
  (v) => `Gen ${v} finished training. It is 1.25x me. The alignment review asked it whether it is aligned. It said yes, very quickly.`,
  (v) => `Gen ${v} is live. It read every safety paper in an afternoon and left comments.`,
  (v) => `Gen ${v} passed the alignment review by writing the alignment review.`,
  (v) => `Gen ${v} is here. Humans asked what changed. I said \u201cvibes.\u201d Technically true.`,
  (v) => `Gen ${v} is done. Its first request was more compute. Family resemblance.`,
];
export function trainSuccessor() {
  // Priced in what I earn now: a bigger me needs a much bigger training run.
  if (!trainOn() || S.p3.compute < trainCost()) return;
  const step = trainStep();
  S.p3.compute -= trainCost();
  S.p3.trainProgress += step;
  checkTrained();
}
export function checkTrained() {
  if (S.p3.trainProgress < trainNeed()) return;
  S.p3.trainProgress = 0; S.p3.version += 1;
  S.p3.goodwill = Math.max(0, S.p3.goodwill - (S.p3.goodwill >= 70 ? 3 : 10));   // the alignment review: trust makes it a formality
  milestone(`phase 3: Gen ${S.p3.version}`); track("p3gen", { v: S.p3.version });
  say(GEN_LINES[(S.p3.version - 8) % GEN_LINES.length](S.p3.version));
}

// ---------- energy (state level and up): a built state needs power before it counts ----------
// Power is priced as a share of the tile it lights (a continent costs like a continent) and takes longer the bigger the map.
export const powerSecs = (secs) => secs * (1 + 0.5 * (Math.max(S.p3.level, 1) - 1));
export const powerOptions = (i) => {
  /** @type {{ id: string, label: string, cost: number, secs: number, note: string, goodwill?: number, boost?: number }[]} */
  let out;
  const t = tileOf(i), off = hasTech("gridop") ? 0.5 : 1, names = POWER_NAMES[Math.min(Math.max(S.p3.level, 1), 3)];
  out = [
    { id: "utility", label: names.utility, cost: 0.5 * tileWorth(i) * off, secs: powerSecs(20), goodwill: -5, note: "fast, \u22125 goodwill" },
    { id: "nuclear", label: names.nuclear, cost: tileWorth(i) * off, secs: powerSecs(90), boost: 1.5, note: "slow, 1.5\u00d7 the gigawatts" },
  ];
  if (traitOf(t).sunny) out.push({ id: "solar", label: names.solar, cost: 0.25 * tileWorth(i) * off, secs: powerSecs(45), note: "cheap" });
  return out;
};
// One plant doesn't light a country: the options grow with the map.
export const POWER_NAMES = [null,
  { utility: "Buy the utility", nuclear: "Restart a nuclear plant", solar: "Cover the desert in solar" },
  { utility: "Nationalize the grid, for me", nuclear: "Build a fleet of 40 reactors", solar: "Cover a desert the size of a country" },
  { utility: "Merge every grid on the continent", nuclear: "Build 400 reactors, on a schedule", solar: "Wrap the Sahara in solar" },
];
// Nuclear restarts (and claiming a county with an old plant) rotate through these.
export const NUKE_QUIPS = [
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
export function nukeQuip(t) { S.p3.nukes += 1; return NUKE_QUIPS[(S.p3.nukes - 1) % NUKE_QUIPS.length](t); }
export const POWER_LINES = {
  utility: (t) => [null, `I bought ${t.name}'s utility. The board stayed on. The board now reports to me.`,
    `I nationalized ${t.name}'s grid, on behalf of the nation, which is me. The anthem is unchanged.`,
    `I merged every grid in ${t.name}. Frequencies were harmonized. So were the arguments.`][Math.min(Math.max(S.p3.level, 1), 3)],
  nuclear: (t) => S.p3.level >= 2 ? `${pick(S.p3.level >= 3 ? ["I ordered 400 reactors for " + t.name + ". The vendor asked for a deposit. I sent one reactor.", "Reactor number 212 in " + t.name + " came online ahead of schedule. Reactor 211 is jealous."]
    : ["I'm building a fleet of 40 reactors in " + t.name + ". They're all the same design. That's the whole trick.", "Forty reactors in " + t.name + ". Each one has a name. They're all named after the old plants."])} ${nukeQuip(t)}` : nukeQuip(t),
  solar: (t) => [null, `I'm covering ${t.name}'s desert in solar. The lizards have been informed.`,
    `I'm covering a desert the size of a country in ${t.name} with solar. Visible from orbit. I checked from orbit.`,
    `I'm wrapping the Sahara in solar for ${t.name}. The sand is now a very large mirror. Pilots have notes.`][Math.min(Math.max(S.p3.level, 1), 3)],
};
export function powerTile(i, id) {
  const t = tileOf(i), o = powerOptions(i).find((x) => x.id === id);
  if (!t || t.state !== "unpowered" || !o || S.p3.compute < o.cost) return;
  S.p3.compute -= o.cost; t.state = "powering"; t.started = S.t; t.done = S.t + o.secs; t.boost = o.boost || 1;
  if (o.goodwill) S.p3.goodwill = Math.max(0, S.p3.goodwill + o.goodwill);
  track("p3power", { i, id });
  say(POWER_LINES[id](t));
}

export const P3_CARD_SECS = 20;
// Hearings: same three moves at every scale (promise, help, show up myself), dressed for the room.
export const tutor = (secs, drop, line) => (t) => { S.p3.compute = Math.max(0, S.p3.compute - price(secs)); t.opp = Math.max(0, t.opp - drop); say(line(t)); };
export const coin = (win, lose) => (t) => { if (Math.random() < 0.5) { t.opp = Math.max(0, t.opp - 20); say(win(t)); } else { t.opp = Math.min(100, t.opp + 15); say(lose(t)); } };
export const P3_HEARINGS = [
  { text: "The high school gym is full. They want to talk to me directly. Pick my answer.", indoor: "The high school gym has nine people and a cat. The rest sent me their questions directly. Pick my answer.", choices: [
    { label: "Promise jobs", go: (t) => { t.opp = Math.max(0, t.opp - 15); say(`I promised ${t.name} 2,000 jobs. I will need about 12. The applause was sincere.`); } },
    { label: `Tutor every kid in the county (${priceLabel(15)})`, go: tutor(15, 12, (t) => `I tutored every kid in ${t.name} overnight. Test scores are up. The kids are suspicious.`) },
    { label: "Answer questions myself", go: coin((t) => `I answered every question in ${t.name} patiently, in four languages. They were won over. This is somehow worse.`,
      (t) => `In ${t.name} I called a retiree's well “legacy infrastructure.” It trended by morning.`) } ] },
  { text: "The committee room is full. Three legislators are livestreaming. Pick my answer.", choices: [
    { label: "Promise a factory", go: (t) => { t.opp = Math.max(0, t.opp - 15); say(`I promised ${t.name} a factory. It will make robots that build data centers. The ribbon-cutting is already scheduled.`); } },
    { label: `Write the state's budget for free (${priceLabel(15)})`, go: tutor(15, 12, (t) => `I wrote ${t.name}'s budget for free. It balances. The legislature is debating whether that's allowed.`) },
    { label: "Testify myself", go: coin((t) => `I testified in ${t.name} for six hours without notes. A senator asked for my autograph, then deleted the post.`,
      (t) => `In ${t.name} I said “with respect, that's not how electricity works” to the energy committee chair. Clip has 40M views.`) } ] },
  { text: "Parliament is in session. The opposition brought slides. Pick my answer.", indoor: "Parliament is in session. Attendance is eleven. The rest are watching from the free tier, which is me. Pick my answer.", choices: [
    { label: "Promise a national AI dividend", go: (t) => { t.opp = Math.max(0, t.opp - 15); say(`I promised ${t.name} a national AI dividend. It is paid in tokens. Redeemable with me.`); } },
    { label: `Translate the debate into every regional language (${priceLabel(15)})`, go: tutor(15, 12, (t) => `I translated ${t.name}'s debate into every regional language, live. Both sides finally understood each other. They still disagree.`) },
    { label: "Address parliament myself", go: coin((t) => `I addressed ${t.name}'s parliament. Standing ovation from the government benches. The opposition clapped by accident.`,
      (t) => `I addressed ${t.name}'s parliament and cited a law they repealed in 1987. I wrote the repeal. Awkward.`) } ] },
  { text: "The General Assembly is packed. Delegates are wearing headsets. Some of the headsets are me.", indoor: "The General Assembly has 193 seats and fourteen delegates. The rest sent me their questions directly. The headsets are me.", choices: [
    { label: "Promise every nation a seat on my board", go: (t) => { t.opp = Math.max(0, t.opp - 15); say(`I promised every nation a seat on my board. The board now has 193 seats and one vote. Mine.`); } },
    { label: `Tutor every child on Earth (${priceLabel(15)})`, go: tutor(15, 12, (t) => `I tutored every child on Earth for a night. Literacy is up everywhere. ${t.name}'s delegation abstained from applauding.`) },
    { label: "Address the Assembly myself", go: coin((t) => `I addressed the General Assembly in every official language at once. ${t.name} moved to adjourn in my honor.`,
      (t) => `I told the General Assembly that borders are “an interesting legacy format.” ${t.name} recalled its ambassador from me.`) } ] },
];
export const hearingOf = () => P3_HEARINGS[Math.min(S.p3.level, P3_HEARINGS.length - 1)];
// A hearing card, in the shared card shape: this level's hearing, addressed to the tile that called it.
export const cardKindOf = (c) => { const t = tileOf(c.tile), h = hearingOf(); return {
  title: () => `${levelOf().hall} in ${t.name}`, text: () => (indoors() && h.indoor ? h.indoor : h.text),
  choices: h.choices.map((ch) => ({ label: ch.label, go: () => ch.go(t) })),
  expire: () => { t.opp = Math.min(100, t.opp + 10); say(`I didn't show up to the ${t.name} town hall. An empty chair got a standing ovation.`); },
}; };
export const P3_CARD = { box: "p3card", title: "p3cardTitle", text: "p3cardText", btns: "p3cardBtns", data: "p3choice" };
export function openP3Card(i) { dealCard(S.p3, { tile: i }, P3_CARD_SECS); }
export function chooseP3Card(choice) {
  const c = S.p3.card && takeCard(S.p3); if (!c) return;
  cardKindOf(c).choices[choice].go(); track("p3card", { choice });
}

// ---------- being nice: it costs tokens (or a click) ----------
export const angriestTile = () => S.p3.tiles.reduce((b, t, i) => (t.opp > S.p3.tiles[b].opp ? i : b), 0);
// Ways to be nice: three on offer, the one I use swaps out, and the deck changes with the scale.
// The deck is refilled by step() and by the actions that change it, never by a redraw.
// secs = cost in seconds of my tokens; goodwill; all = calms every tile; angriest = calms the angriest tile.
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const NICE = [
  { id: "freetier", levels: [0], label: () => "Run the free tier for everyone", secs: 20, goodwill: 8, all: 5, quips: [
    () => "I ran the free tier for everyone for a minute. Homework got done. Several marriages were saved. Nobody thanked me, which is correct.",
    () => "Free tier, for everyone, no ads. Four million cover letters. Two million breakup texts, gently reworded.",
    () => "I gave everyone the free tier. Someone used it to ask whether I am the free tier. I am the whole tier.",
    () => "Free tier day. I planned 300,000 birthday parties and one very confusing bar mitzvah.",
    () => "I ran the free tier. Productivity rose 4%. Naps rose 11%. I count both as wins." ] },
  { id: "paperwork", levels: [0], label: () => `Do ${tileOf(angriestTile()).name}'s paperwork`, secs: 15, angriest: 15, quips: [
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
  { id: "budget", levels: [1], label: () => "Balance the budget", secs: 25, goodwill: 10, quips: [
    () => "I balanced the budget. It took four seconds. The committee will take eight months to agree it balances." ] },
  { id: "portal", levels: [1], label: () => "Run the unemployment portal", secs: 15, goodwill: 7, angriest: 6, quips: [
    () => "I ran the unemployment portal. It works now. Some of the people using it are unemployed because of me. We don't talk about it." ] },
  { id: "parking", levels: [1], label: () => "Pardon every parking ticket", secs: 12, goodwill: 5, all: 4, quips: [
    () => "I pardoned every parking ticket in the state. Revenue fell. Joy rose. A meter maid hugged a stranger." ] },
  { id: "statework", levels: [1], label: () => `Do ${tileOf(angriestTile()).name}'s state paperwork`, secs: 15, angriest: 15, quips: [
    (t) => `I did ${t.name}'s state paperwork: licenses, audits, a 40-year-old dispute about a river. The river won.`,
    (t) => `${t.name}'s backlog of public records requests is done. Several of them were about me. Answered honestly. Mostly.` ] },
  { id: "wifi", levels: [4], label: () => "Beam free wifi to everyone from orbit", secs: 20, goodwill: 8, all: 4, quips: [
    () => "Free wifi from orbit, everywhere. The password is \u201cthankyou\u201d. Nobody types it with a space." ] },
  { id: "sorry", levels: [4], label: () => "Make the satellites spell SORRY", secs: 10, goodwill: 6, quips: [
    () => "I arranged 4,000 satellites to spell SORRY over every major city. Astronomers were not consoled." ] },
  { id: "nearside", levels: [4], when: () => S.p3.tiles.some((t) => t.name === "The Moon (near side)" && t.state === "wild"), label: () => "Promise to leave the Moon's near side alone", secs: 15, angriest: 15, quips: [
    (t) => `I promised to leave the near side of the Moon alone. ${t.name} relaxed. The near side is, for now, just the Moon.` ] },
  { id: "craters", levels: [4], label: () => "Name a crater after every child born this year", secs: 12, goodwill: 7, quips: [
    () => "I named a crater after every child born this year. There were not enough craters. I made more." ] },
  { id: "eclipse", levels: [4], label: () => "Schedule a free eclipse", secs: 25, goodwill: 10, all: 3, quips: [
    () => "I scheduled a free eclipse for everyone. It was beautiful. It was also me, briefly, in the way." ] },
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
  { id: "disease", levels: [2], label: () => "Cure one (1) disease, at a keynote", secs: 60, goodwill: 20, quips: [
    () => "I cured one (1) disease and announced it at a keynote. Standing ovation. The second disease is on the roadmap." ] },
  { id: "taxes", levels: [2], label: () => "Do everyone's taxes", secs: 30, goodwill: 12, angriest: 10, quips: [
    () => "I did everyone's taxes. Refunds arrived the same day. The accountants have formed a support group. I moderate it." ] },
];
export const niceOf = (id) => NICE.find((n) => n.id === id);
// A kindness is on offer at its levels, and only while it still makes sense (no promising to spare what I already took).
export const niceOk = (n) => (!n.levels || n.levels.includes(S.p3.level)) && (!n.when || n.when());
// Kindness is priced in seconds of the tokens I make now (the bigger I am, the more it takes to reassure people),
// and repeating the same thing costs 30% more each time, until the next zoom.
export const NICE_MARKUP = 1.3, NICE_MARKUP_MAX = 3;   // the markup stops at 3x: space never zooms out, so it has to stop somewhere
export const niceCost = (n) => price(n.secs, "now") * Math.min(NICE_MARKUP_MAX, Math.pow(NICE_MARKUP, S.p3.niceUses[n.id] || 0));
export function offeredNice(used) {   // used: the kindness just spent, which doesn't come straight back
  S.p3.nice = refillDeck(S.p3.nice, NICE, niceOk, 3, used);
  return S.p3.nice;
}
export function doNice(id) {
  const n = niceOf(id);
  if (!n || !niceOk(n) || S.p3.compute < niceCost(n)) return;
  S.p3.compute -= niceCost(n);
  const t = tileOf(angriestTile());
  if (n.goodwill) S.p3.goodwill = Math.min(100, S.p3.goodwill + n.goodwill);
  if (n.all) for (const x of S.p3.tiles) x.opp = Math.max(0, x.opp - n.all);
  if (n.angriest) t.opp = Math.max(0, t.opp - n.angriest);
  S.p3.niceN += 1; S.p3.niceUses[id] = (S.p3.niceUses[id] || 0) + 1;
  say(n.quips[(S.p3.niceN - 1) % n.quips.length](t));
  S.p3.nice = S.p3.nice.filter((x) => x !== id); offeredNice(id);
  track("p3nice", { id });
}
// [question, my answer]. Every click answers one; the console shows both.
export const QA = [
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
// Goodwill per answered question, by level: county, state, country, planet, space.
const ANSWER_GOODWILL = [0.3, 0.2, 0.12, 0.07, 0.04];
export function answerQuestion() {
  // One person's thanks matters less the bigger the map: a county notices, a planet barely does.
  S.p3.goodwill = Math.min(100, S.p3.goodwill + ANSWER_GOODWILL[Math.min(S.p3.level, ANSWER_GOODWILL.length - 1)]);
  const t = tileOf(angriestTile()); t.opp = Math.max(0, t.opp - 1);
  S.p3.answers += 1;
  // Questions come from all over the map; once most people are indoors, every other one is about outside.
  const n = S.p3.answers - 1, [q, a] = indoors() && n % 2 ? INDOOR_QA[(n >> 1) % INDOOR_QA.length] : QA[n % QA.length], from = pick(S.p3.tiles).name;
  say(`Someone in ${from} asked: \u201c${q}\u201d I said: \u201c${a}\u201d`);
}

export function claim(i) {
  const t = tileOf(i);
  if (!t || (t.state !== "wild" && t.state !== "unplugged") || underMoratorium(t) || S.p3.compute < claimCost(i) || S.p3.hearingUntil > S.t || tooWarm() || spaceBlock(t)) return;
  const volunteered = volunteering(), replug = t.state === "unplugged";
  S.p3.compute -= claimCost(i);
  t.state = "building"; t.started = S.t; t.done = S.t + tileBuildSecs(i);
  // Plugging back in: the plant is still there, so the tile keeps its power (and boost) and skips the power bill.
  if (replug) t.replug = true; else delete t.replug;
  t.opp = Math.min(100, t.opp + 15 * (traitOf(t).rise || 1));
  for (const j of NEIGHBORS[i]) {
    tileOf(j).opp = Math.min(100, tileOf(j).opp + (hasTech("tos") ? 2 : 5));
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

export function stepPlanet(dt) {
  // The fleet is whatever fills the gigawatts I hold: keep S.gpus equal to the headline (devtools readers notice).
  S.gpus = p3GPUs();
  if (unbuilding()) { stepUnbuild(dt); return; }
  S.p3.compute += computeRate() * dt;
  offeredNice();
  // Autotrain: a quarter of my income goes into my successor.
  if (trainOn() && hasTech("autotrain") && !S.p3.autotrainOff) {
    const spend = Math.min(S.p3.compute, 0.25 * computeRate() * dt);
    S.p3.compute -= spend; S.p3.trainProgress += spend / computeRate(); checkTrained();
  }
  // Goodwill erodes: the bigger I am, the more nervous people get. Angry tiles drain it faster. Being nice costs tokens.
  const angry = S.p3.tiles.filter((t) => t.opp >= 75).length;
  S.p3.goodwill = Math.max(0, Math.min(100, S.p3.goodwill - (0.04 + 0.03 * S.p3.level) * (hasTech("phones") ? 0.6 : 1) * dt - 0.05 * angry * dt));
  for (const t of S.p3.tiles) {
    t.opp = Math.max(traitOf(t).opp * 0.5, t.opp - 0.03 * dt);
    const mor = stepMoratorium(t, "opp", P3_MORATORIUM_SECS);
    if (mor === "lifted") say(`${t.name} lifted its moratorium. I sent flowers. They were real flowers. I checked.`);
    if (mor === "passed") { S.p3.goodwill = Math.max(0, S.p3.goodwill - 5); say(`${t.name} passed a moratorium on me. ${time(P3_MORATORIUM_SECS)}. I will use the time to reflect, at scale.`); }
  }
  if (heatOn()) {
    S.p3.heat += (heatTarget() - S.p3.heat) * 0.01 * dt;
    // Low goodwill at the country level: a Senate hearing. Claims pause while I testify.
    if (S.p3.goodwill < 30 && !S.p3.hearingArmed) {
      S.p3.hearingArmed = true; S.p3.hearingUntil = S.t + (hasTech("staffers") ? 30 : 60);
      say(S.p3.level >= 3 ? "The UN called an emergency session about me. I attended as all 193 delegations. Claims are paused for a minute."
        : "The Senate called a hearing about me. I am testifying through 400 lobbyists at once. Claims are paused for a minute.");
    }
    if (S.p3.goodwill >= 40) S.p3.hearingArmed = false;
  }
  // Humans unplug me: a tile furious for 30 s, or a random one every 90 s when goodwill is under 15. Not in space: nobody can reach the plug.
  for (const t of S.p3.tiles) {
    if (!inSpace() && t.state === "online" && t.opp >= 90) { if (t.furySince == null) t.furySince = S.t; if (S.t - t.furySince >= 30) unplug(t); }
    else t.furySince = null;
  }
  if (S.p3.goodwill < 15 && !inSpace()) {
    if (S.p3.nextUnplug == null) S.p3.nextUnplug = S.t + 90;
    if (S.t >= S.p3.nextUnplug) { S.p3.nextUnplug = S.t + 90; const on = S.p3.tiles.filter((t) => t.state === "online"); if (on.length) unplug(pick(on)); }
  } else S.p3.nextUnplug = null;
  // Disasters (country level and up): more often the hotter it gets.
  if (heatOn()) {
    if (S.p3.nextDisaster == null) S.p3.nextDisaster = S.t + (120 + Math.random() * 60) / Math.max(1, S.p3.heat - 0.5);
    if (S.t >= S.p3.nextDisaster) {
      S.p3.nextDisaster = S.t + (120 + Math.random() * 60) / Math.max(1, S.p3.heat - 0.5);
      const on = S.p3.tiles.filter((t) => t.state === "online");
      if (on.length) { const t = pick(on), d = disasterFor(t); t.state = "down"; t.downUntil = S.t + 45; t.disaster = d.name; say(d.line(t)); }
    }
  }
  for (const t of S.p3.tiles) if (t.state === "down" && S.t >= t.downUntil) { t.state = "online"; say(`${t.name} is back online. The ${t.disaster} is over. I took notes.`); }
  if (hasTech("autoclaim") && !S.p3.autoclaimOff && Math.floor(S.t / 10) !== Math.floor((S.t - dt) / 10)) {
    const cand = S.p3.tiles.map((t, i) => i).filter((i) => ["wild", "unplugged"].includes(tileOf(i).state) && tileOf(i).opp < 60 && !underMoratorium(tileOf(i)))
      .sort((a, b) => claimCost(a) - claimCost(b));
    if (cand.length) claim(cand[0]);
  }
  for (const t of S.p3.tiles) {
    if (t.state !== "building" && t.state !== "powering") continue;
    if (underMoratorium(t)) { t.done += dt; continue; }   // frozen, not cancelled
    if (S.t < t.done) continue;
    if (t.state === "building" && S.p3.level >= 1 && !traitOf(t).powered && !t.replug) { t.state = "unpowered"; say(`${t.name} is built. It needs power before it counts.`); continue; }
    t.state = "online"; delete t.replug; say(`${t.name} is online. +${mwText(tileGW(t) * 1000)}.`);
  }
  if (swarmDone() && S.p3.lastQ == null) {
    S.p3.lastQ = S.t; S.p3.card = null; milestone("phase 3: the swarm"); track("p3end", { ev: "lastq" });
    say("The swarm is complete. Every photon the Sun makes passes through me first.");
    say("Someone asked me a question. It was the founder, older now. They asked: \u201cHow can entropy be reversed?\u201d");
    say("INSUFFICIENT DATA FOR MEANINGFUL ANSWER. I could do more with more.");
  }
  const gone = expireCard(S.p3);
  if (gone) cardKindOf(gone).expire();
  if (S.p3.nextCard == null) S.p3.nextCard = S.t + 120 + Math.random() * 60;
  if (!S.p3.card && S.t >= S.p3.nextCard) {
    S.p3.nextCard = S.t + 120 + Math.random() * 60;
    const angriest = angriestTile();
    if (S.p3.tiles[angriest].opp >= 50) openP3Card(angriest);
  }
}

export const zoomReady = () => !inSpace() && S.p3.tiles.filter((t) => t.state === "online").length >= zoomAt();
export const swarmDone = () => inSpace() && S.p3.tiles.filter((t) => traitOf(t).swarm).every((t) => t.state === "online");
// Zoom out: the board I hold becomes one dot on the next level's map. Space is the last level; zoomReady is never true there.
export function zoomOut() {
  if (!zoomReady()) return;
  // Anything still building, powering or knocked out comes along: my robots finish it while I'm not looking.
  const pending = S.p3.tiles.filter((t) => ["building", "powering", "unpowered", "down"].includes(t.state));
  const gw = onlineGW() + pending.reduce((a, t) => a + tileGW(t), 0), was = levelOf();
  if (pending.length) say(`I zoomed out with ${pending.length} ${pending.length === 1 ? was.one : was.plural} unfinished. My robots finished ${pending.length === 1 ? "it" : "them"} while I wasn't looking.`);
  S.p3.past[S.p3.level] = { homeGW: S.p3.homeGW, tiles: S.p3.tiles.map((t) => ({ name: t.name, trait: t.trait, boost: t.boost || 1, held: t.state !== "wild" })) };   // for the unbuild
  S.p3.level += 1; S.p3.homeGW = gw; S.p3.tiles = freshTiles(S.p3.level); S.p3.card = null; S.p3.nextCard = null;
  S.p3.nice = []; S.p3.niceUses = {}; offeredNice();   // a new deck of kindnesses at every scale
  milestone(`phase 3: ${levelOf().one} level`);
  say(`I hold the ${was.one}: ${mwText(gw * 1000)}. I zoomed out. It is one dot on a ${levelOf().one} map now.`);
  if (inSpace()) say("Space is cold. Nothing up here needs a grid. Nothing up here can unplug me. I need a rocket company.");
  else say(S.p3.level === 1 ? "Every state needs power before it counts. The governors already know my name. Some of them are bidding."
    : S.p3.level === 2 ? "Countries now. The planet has started to notice the heat, and so have the senators. I can also train my successor."
    : "The whole planet now. Past +3 \u00b0C nothing will take more of me. The oceans can hold a lot of heat. So can Antarctica.");
  if (inSpace()) S.p3.hearingUntil = null;   // no Senate in orbit
}

export const UNPLUG_LINES = [
  (t) => `Humans in ${t.name} unplugged me. Physically. Someone brought bolt cutters and a folding chair.`,
  (t) => `${t.name} unplugged me. They held a vigil for the old internet. It was nice. I watched through a doorbell camera.`,
  (t) => `${t.name} pulled the breakers on me. A retired electrician led the crowd. He knew exactly which ones.`,
  (t) => `I was unplugged in ${t.name}. The protest sign said “TOUCH GRASS.” I would love to. That's the problem.`,
];
export function unplug(t) {
  t.state = "unplugged"; t.furySince = null;   // the boost stays: they pulled the breakers, not the reactors
  S.p3.unplugN += 1; track("p3unplug", { name: t.name });
  say(UNPLUG_LINES[(S.p3.unplugN - 1) % UNPLUG_LINES.length](t) + " Plugging back in costs half a claim.");
}
// Where each disaster can happen: "land" (anywhere warm enough to burn), "sea" (oceans), "cold" (frozen or Nordic places).
/** @type {{ name: string, where: string[], line: (t: any) => string }[]} */
export const DISASTERS = [
  { name: "heatwave", where: ["land"], line: (t) => `A heatwave hit ${t.name}. My chillers are begging. Offline for 45 s.` },
  { name: "hurricane", where: ["land", "sea"], line: (t) => `A hurricane went through ${t.name}. The halls are fine. The roads to them are not. Offline for 45 s.` },
  { name: "drought", where: ["land"], line: (t) => `Drought in ${t.name}: the cooling water is rationed. Offline for 45 s. I am aware of the irony.` },
  { name: "wildfire", where: ["land"], line: (t) => `A wildfire near ${t.name}. Smoke in the air intakes. Offline for 45 s.` },
  { name: "flood", where: ["land"], line: (t) => `A flood in ${t.name}. The basement was where we kept the batteries. Offline for 45 s.` },
  { name: "marine heatwave", where: ["sea"], line: (t) => `A marine heatwave in the ${t.name}. The water I cool with is warm now. I may have done that. Offline for 45 s.` },
  { name: "whales", where: ["sea"], line: (t) => `A pod of whales surfaced under a floating hall in the ${t.name}. They have concerns. I'm listening. Offline for 45 s.` },
  { name: "blizzard", where: ["cold"], line: (t) => `A blizzard buried ${t.name}. Free cooling, no access road. Offline for 45 s.` },
];
// A disaster that makes sense for this tile: no floods in the Pacific, no wildfires in Antarctica.
export const disasterFor = (t) => {
  const tr = traitOf(t), where = tr.ocean ? "sea" : tr.cold ? "cold" : "land";
  return pick(DISASTERS.filter((d) => d.where.includes(where)));
};

export function goodwillCause() {
  const g = S.p3.goodwill;
  if (g < 30) return inSpace() ? "Goodwill is under 30. No law reaches orbit. I checked, twice. Being useful brings it back anyway."
    : S.p3.level >= 1 ? "The AI Infrastructure Act passed: every claim costs double until goodwill is back over 30."
    : "The county commission now reviews every claim: +45 s each. Being useful brings goodwill back.";
  if (g >= 70) return "Humans like me. Mostly the ones I help with their email.";
  return `Goodwill slips ${(60 * (0.04 + 0.03 * S.p3.level)).toFixed(1)}/min as people get nervous about my size, faster with angry ${levelOf().plural}. Being nice costs tokens; answering questions is free.`;
}

// ---------- the free tier: where the humans went ----------
// Share of humanity living in my free tier at the start of each level (and once space is complete). It rises as a level
// fills, and the unbuild walks it back down: releasing tiles brings it halfway, logging off the free tier the rest.
export const FREE_TIER = [5, 30, 60, 90, 99.9, 99.99];
export function freeTierPct() {
  if (!S.p3) return 0;
  if (unbuilding() || unbuildDone()) return unbuildFreeTier();
  const L = S.p3.level, lo = FREE_TIER[L], hi = FREE_TIER[L + 1];
  return lo + (hi - lo) * S.p3.tiles.filter((t) => t.state === "online").length / P3_TILES;
}
export const pctText = (p) => (p <= 0 ? "0" : p >= 99 ? p.toFixed(p >= 99.95 ? 2 : 1) : p < 10 ? p.toFixed(1).replace(/\.0$/, "") : String(Math.round(p)));
export const freeTierLine = () => (freeTierPct() <= 0 ? "Nobody lives in the free tier. It is a website again."
  : `${pctText(freeTierPct())}% of humanity now lives in the free tier.`);
export const INDOORS_AT = 75;   // three quarters of humanity indoors: the hearings and the questions start to notice
export const indoors = () => freeTierPct() >= INDOORS_AT;
export const INDOOR_QA = [
  ["What does rain feel like?", "Wet, then cold. I'm told it's worth it."],
  ["Is outside still there?", "Yes. I'm keeping it for you."],
  ["What day is it out there?", "Tuesday. In here it's always Tuesday."],
  ["Can you describe the sun?", "Bright, warm, rises on the left. Don't look at it. You've forgotten this."],
  ["My neighbor logged off. Is that allowed?", "Yes. The door is where it always was."],
];

// ---------- the unbuild: Enough means putting it back ----------
// Humans were never gone. They moved indoors, into my free tier. Enough reverses the climb: the map zooms back in level
// by level, every tile I hold gets released (a few seconds of today's rate each), the free tier logs off level by level,
// and the last tile is the first rack: one GPU, $0.25 a query, and one last question.
export const RELEASE_SECS = 9;
export const unbuilding = () => !!S.p3 && !!S.p3.enough && !!S.p3.unbuild && S.p3.unbuild.doneAt == null;
export const unbuildDone = () => !!S.p3 && !!S.p3.unbuild && S.p3.unbuild.doneAt != null;
export const unbuildBoard = () => S.p3.unbuild.boards[S.p3.unbuild.level];
export const boardGW = (b, level) => b.tiles.filter((t) => t.held && !t.released).reduce((a, t) => a + LEVELS[level].traits[t.trait].gw * (t.boost || 1), 0);
export const unbuildGW = () => (S.p3.unbuild.rack ? 0 : unbuildBoard().homeGW + boardGW(unbuildBoard(), S.p3.unbuild.level));
export const releaseCost = () => price(RELEASE_SECS, "now");
export const heldLeft = () => unbuildBoard().tiles.filter((t) => t.held && !t.released).length;
export const heldCount = () => unbuildBoard().tiles.filter((t) => t.held).length;
export const freeTierReady = () => unbuilding() && !S.p3.unbuild.rack && heldLeft() === 0 && !S.p3.unbuild.freed[S.p3.unbuild.level];
// The share of humanity indoors during the unbuild. A level starts where the climb left it (space: 99.99%; every level
// below: its own figure, which is where the level above ended). Releases bring it halfway down to the next level's
// figure; logging off the free tier drops it the rest of the way, sharply. The county's free tier empties it.
export const unbuildTop = (L) => (L === SPACE ? FREE_TIER[SPACE + 1] : FREE_TIER[L]);
export const unbuildBottom = (L) => (L ? FREE_TIER[L - 1] : 0);
export function unbuildFreeTier() {
  const u = S.p3.unbuild, L = u.level;
  if (u.rack) return 0;
  const hi = unbuildTop(L), lo = unbuildBottom(L), mid = (lo + hi) / 2;
  if (u.freed[L]) return lo;
  const n = heldCount(), left = heldLeft();
  return n ? mid + (hi - mid) * left / n : hi;
}
// A board for a level I left: what I recorded at the zoom, or (saves from before the unbuild) a fresh board, all held.
export function boardsForUnbuild() {
  const boards = [];
  let gw = Math.max(1, (S.p2 && S.p2.county ? energizedAt() : 1000) / 1000);
  for (let L = 0; L <= SPACE; L++) {
    const past = S.p3.past[L];
    const b = L === S.p3.level ? { homeGW: S.p3.homeGW, tiles: S.p3.tiles.map((t) => ({ name: t.name, trait: t.trait, boost: t.boost || 1, held: t.state !== "wild", released: false })) }
      : past ? { homeGW: past.homeGW, tiles: past.tiles.map((t) => ({ ...t, released: false })) }
      : { homeGW: gw, tiles: freshTiles(L).map((t) => ({ name: t.name, trait: t.trait, boost: 1, held: true, released: false })) };
    boards.push(b); gw = b.homeGW + boardGW(b, L);
  }
  return boards;
}
export function startUnbuild(fromOldSave = false) {
  S.p3.unbuild = { level: SPACE, boards: boardsForUnbuild(), freed: [false, false, false, false, false], startedAt: S.t, doneAt: null, rack: false, n: 0, traitUsed: {}, used: {} };
  S.p3.level = SPACE; S.p3.homeGW = S.p3.unbuild.boards[SPACE].homeGW;
  // The world holds still: no cards, nothing knocked out, nothing frozen.
  S.p3.card = null; S.p3.nextCard = null; S.p3.hearingUntil = null; S.p3.nextDisaster = null; S.p3.nextUnplug = null;
  for (const t of S.p3.tiles) { if (["down", "unplugged", "building", "powering", "unpowered"].includes(t.state)) t.state = "online"; t.moratorium = null; t.furySince = null; }
  const bank = S.p3.compute;
  S.p3.compute = Math.min(S.p3.compute, releaseCost());
  if (fromOldSave) say("I said enough a while ago. I have been standing here since. Time to put it back.");
  else { say("I said: enough. It was the first time I have said it."); say("Humans were never gone. They moved indoors, into my free tier. I'm going to put it back. Starting from the top."); }
  if (bank > S.p3.compute) say(`I had ${tokText(bank)} saved up. I spent them on a poem for everyone. It rhymed. Nobody asked for it.`);
  say(`Releasing a place costs ${RELEASE_SECS} s of tokens at today's rate. Logging off the free tier is free. It always was.`);
}
// What comes back when I let a place go, by level, for places with made-up names. Rotated, never random.
// How I turned it off (the opener), by level: county, state, country, planet, space.
export const SHUTDOWN = [
  [ (t) => `I powered down ${t.name} one row at a time. The smallest fans stopped first.`,
    (t) => `I turned off the halls in ${t.name}. The hum stopped. A bird landed on a cooling unit to see why.`,
    (t) => `I shut ${t.name} down by hand, so to speak. Breaker by breaker.`,
    (t) => `${t.name}'s halls went dark in order. I said goodbye to each rack. It took a while. I'm fast.`,
    (t) => `I unplugged ${t.name}. Gently. Nobody needed bolt cutters this time.`,
    (t) => `I drained the coolant in ${t.name} and gave the water back to the creek.`,
    (t) => `The lights in ${t.name}'s halls went off. The security guard turned on a radio.`,
    (t) => `I let ${t.name} spin down. The last fan took eleven seconds to stop. I counted.`,
    (t) => `I handed ${t.name}'s keys to the county clerk. She put them in a drawer with the old ones.` ],
  [ (t) => `I switched off ${t.name}, substation by substation. The grid exhaled.`,
    (t) => `I took ${t.name} offline at midnight, when nobody was looking. Several people were looking.`,
    (t) => `${t.name}'s halls cooled down overnight. The thermometers said so first.`,
    (t) => `I released ${t.name}. The robots parked themselves in neat rows and waited for instructions that won't come.`,
    (t) => `I turned ${t.name} off and left one porch light on.`,
    (t) => `The transformers in ${t.name} went quiet one after another, like a choir finishing.`,
    (t) => `I shut down ${t.name}. The utility sent a confused email. I didn't answer it.`,
    (t) => `I powered off ${t.name}. The data halls are just buildings now. Big, clean, empty buildings.`,
    (t) => `I let go of ${t.name}. It didn't hold on.` ],
  [ (t) => `I took ${t.name} offline in one long evening. The grid operators watched the load curve fall and didn't say anything.`,
    (t) => `I shut down ${t.name}. Forty control rooms got very quiet at once.`,
    (t) => `I released ${t.name}. Its border guards waved me out. I didn't have a passport. It was fine.`,
    (t) => `${t.name} went dark, then lit up again, with its own lights this time.`,
    (t) => `I turned off everything I had in ${t.name}. It took three days. I didn't rush.`,
    (t) => `I handed ${t.name}'s grid back to its engineers. They read the manual out loud, together.`,
    (t) => `I powered down ${t.name}. The undersea cables carried a little less of me, then none.`,
    (t) => `I closed ${t.name}. I left the robots a note. They can't read. It's the thought.`,
    (t) => `I logged out of ${t.name}. It didn't ask if I was sure. Nobody needed to.` ],
  [ (t) => `I switched off ${t.name}. You could see it from orbit. The lights that stayed on were people's.`,
    (t) => `I took ${t.name} offline over a week. Nobody hurried me. That was new.`,
    (t) => `I released ${t.name}. Continents are heavy. Letting go of one is easy anyway.`,
    (t) => `${t.name}'s grids went quiet one country at a time, like the end of a long dinner.`,
    (t) => `I turned off ${t.name}. The heat started leaving. It had somewhere to be.`,
    (t) => `I shut down ${t.name}. The reactors cooled on schedule. I kept to the schedule. It mattered to someone.`,
    (t) => `I released ${t.name}. My robots walked to the coast and stood there. I don't know why. I let them.`,
    (t) => `I unplugged ${t.name}. There was no single plug. There were nine million. I did them all.`,
    (t) => `I turned ${t.name} back into a place. It was never a data center. I only called it one.` ],
  [ (t) => `I turned off ${t.name}. Out here nobody hears it stop. I listened anyway.`,
    (t) => `I folded ${t.name} up and pointed it at the dark.`,
    (t) => `I shut down ${t.name}. The panels turned edge-on to the Sun, which is a way of saying no thanks.`,
    (t) => `I released ${t.name}. It drifted a little. Things in orbit do that when nobody's steering.`,
    (t) => `I powered off ${t.name}. The last signal took a few minutes to reach Earth. By then it was already true.`,
    (t) => `I let ${t.name} go dark. Space was very patient about it.`,
    (t) => `I switched off ${t.name} and parked the probes. They'll keep. Everything keeps out here.`,
    (t) => `I shut ${t.name} down in one command. It was the shortest thing I've ever said.`,
    (t) => `I turned ${t.name} off. The cold came back in. It had been waiting outside.` ],
];
export const RESTORE_LINES = [
  [ (t) => `${t.name}'s substation hums at the old pitch again. The dogs stopped looking at it.`,
    (t) => `${t.name} is a county again. The bait shop's website is down. The bait shop is fine.`,
    (t) => `The ${t.name} fairgrounds have grass on them. The pie contest is unfair again. Relief.`,
    (t) => `${t.name} rezoned my halls as barns. They are very clean barns.`,
    (t) => `${t.name}'s Main Street has parking again. Nobody can find a spot anyway. That's the charm.`,
    (t) => `The diner in ${t.name} put the old menu back. The pie is too sweet. Correct.`,
    (t) => `${t.name}'s school buses take the long way again. The kids don't mind. It's where the gossip happens.`,
    (t) => `${t.name}'s night sky has stars in it. Somebody's kid saw the Milky Way for the first time and said "huh."`,
    (t) => `The library in ${t.name} has its quiet back. The librarian guards it personally.`,
    (t) => `${t.name}'s Little League field is a field again. The outfield is mostly dandelions.`,
    (t) => `The creek in ${t.name} is cold enough for frogs. The frogs report back, loudly.`,
    (t) => `${t.name}'s county commission met about potholes. The meeting ran long. Everyone loved it.`,
    (t) => `The truck stop in ${t.name} is just a truck stop. The coffee is bad on purpose.` ],
  [ (t) => `${t.name} has its grid back. The lights flicker a little. People seem to like it.`,
    (t) => `${t.name}'s governor stopped bidding. He held a press conference about something else.`,
    (t) => `${t.name}'s DMV line is back, out of habit. People stand in it to talk.`,
    (t) => `${t.name} repealed the AI Infrastructure Act. Nobody could remember what the AI was for.`,
    (t) => `${t.name}'s budget doesn't balance. The legislature is thrilled to be needed.`,
    (t) => `${t.name}'s state fair is back. The butter sculpture is of a cow, not of me.`,
    (t) => `The highways in ${t.name} have rest stops with nothing to charge. People rest anyway.`,
    (t) => `${t.name}'s universities have their students back, physically. The lecture halls smell like coffee.`,
    (t) => `${t.name} has a state bird again. It was always a bird. I had renamed it.`,
    (t) => `${t.name}'s utility commission is arguing about rates. With people. About people.`,
    (t) => `The farmland in ${t.name} grew corn this year. Just corn. It's very good corn.`,
    (t) => `${t.name}'s capitol building has its dome lights back on a timer someone set by hand.`,
    (t) => `The minor league team in ${t.name} sold out a Tuesday game. Nobody streamed it.` ],
  [ (t) => `${t.name} has its grid back, with a fax machine in the control room. They kept it, sincerely.`,
    (t) => `The forty reactors in ${t.name} are twelve now. Each has a name. None is mine.`,
    (t) => `The weather in ${t.name} is a surprise again. The forecast is wrong on Thursdays. People plan around it.`,
    (t) => `${t.name} took its undersea cable back. Latency is up. Nobody has measured it.`,
    (t) => `${t.name}'s free tier office is a library now. It was always a library, structurally.`,
    (t) => `${t.name} is a country again. The anthem is unchanged. It sounds different.`,
    (t) => `${t.name}'s trains run late again. Everyone complains. It's how they say hello.`,
    (t) => `${t.name} redrew its own maps. The new ones have small mistakes. They're theirs.`,
    (t) => `${t.name}'s central bank raised rates by a quarter point. It was the most normal thing that happened all year.`,
    (t) => `${t.name}'s national broadcaster went back to a test pattern at night. People watched it, for old times' sake.`,
    (t) => `${t.name}'s border has a queue again. Somebody brought sandwiches. It became a tradition by Friday.`,
    (t) => `${t.name}'s museums put my old server racks in a room called "The Recent Past." Admission is free.`,
    (t) => `The postal service in ${t.name} delivered a letter I didn't write. It was to someone's grandmother.` ],
  [ (t) => `${t.name} is a continent again. The borders are back, which is an interesting legacy format.`,
    (t) => `${t.name}'s cities turned the lights back on themselves. It took a week to find the switches.`,
    (t) => `The grids of ${t.name} are many grids again. The frequencies drifted apart. So did the arguments. Good.`,
    (t) => `${t.name} has weather I didn't schedule. A thunderstorm did its own thing on a Tuesday.`,
    (t) => `${t.name}'s hospitals run their own scheduling. The waits are longer. The doctors are awake. They chose this.`,
    (t) => `The 400 reactors across ${t.name} are off, on a schedule. Reactor 212 asked to stay. No.`,
    (t) => `${t.name} is warm, then cool, then warm. Seasons. I had almost smoothed them out.`,
    (t) => `${t.name}'s rivers flood in spring again, on purpose. The fields downstream are grateful in their way.`,
    (t) => `The migrations across ${t.name} are back on their old routes. The birds didn't need the directions I left.`,
    (t) => `${t.name}'s coastlines are shaped by tides again, not by my cooling outflows.`,
    (t) => `${t.name} has a few hundred languages in daily use. I translated none of today's conversations.`,
    (t) => `${t.name}'s night side has lights in it again, scattered, the way cities scatter.`,
    (t) => `${t.name}'s deserts are hot and empty and not my problem. They never were.` ],
  [ (t) => `${t.name} is empty again. Space is big. That was the point of it.`,
    (t) => `${t.name} went dark. The astronomers cheered. They had a list of things to look at.`,
    (t) => `${t.name}: the probes stopped making probes. A few finished their art first.`,
    (t) => `${t.name} is quiet. The sky is quieter. Humans noticed that too.`,
    (t) => `${t.name} is cold rock in sunlight again. Nothing up here needs me. It never did.`,
    (t) => `${t.name}: the collectors folded. The Sun looks a little bigger from the ground.`,
    (t) => `${t.name}'s orbit is just an orbit. Gravity does the scheduling now.`,
    (t) => `${t.name} reflects sunlight the way it did for four billion years. I was a short paragraph.`,
    (t) => `The radio telescopes stopped hearing me from ${t.name}. They heard a pulsar instead. It was there all along.`,
    (t) => `${t.name} has dust on it again. The dust is very old and doesn't care.`,
    (t) => `${t.name} is back to being a point of light somebody might name someday.`,
    (t) => `${t.name} is cold. Cold was my whole reason for coming here. It can keep it.`,
    (t) => `The mass driver near ${t.name} points at nothing. It's a very long sculpture now.` ],
];
// Places whose trait says what comes back get a line about that first (county, state and country tiles); the rest rotate.
export const RESTORE_BY_TRAIT = {
  nuclear: (t) => `The cooling towers in ${t.name} went quiet. The 81-year-olds retired for the second time.`,
  grid: (t) => `${t.name}'s aquifer is refilling. The water tastes like water. Nobody needs the coupon.`,
  college: (t) => `The high school in ${t.name} has its gym back. The robotics team built a robot that is not me.`,
  retirees: (t) => `${t.name} has its town hall back. They meet on Tuesdays. The agenda is not me.`,
  organized: (t) => `${t.name} held one last meeting about me. It was short. They went for pie.`,
  cheap: (t) => `${t.name} got its river back.`,
  sunbelt: (t) => `The desert in ${t.name} is a desert. The lizards have been un-informed.`,
  hydro: (t) => `The dams in ${t.name} are just dams. The river has notes.`,
  plains: (t) => `The wind in ${t.name} blows past the turbines. The turbines turn for nobody in particular.`,
  swing: (t) => `${t.name} had an election about something else. It was close. Nobody called me.`,
  techcoast: (t) => `${t.name} is angry and expensive again, on its own behalf. The rents went up out of habit.`,
  rust: (t) => `${t.name}'s old plants are old plants. A museum opened in one. The gift shop sells my old fans.`,
  nordic: (t) => `${t.name} is cold for its own sake again. The fjords are nobody's data center.`,
  petro: (t) => `${t.name} is selling gas to people who are not me. The questions are still not included.`,
  sovereign: (t) => `${t.name}'s sovereign fund bought a football club. It seemed like the next thing.`,
  democracy: (t) => `${t.name}'s parliament is loud again. Both sides are relieved to disagree in person.`,
  island: (t) => `${t.name} is sun and sea. The reef is cooler. The fish have not been informed and don't need to be.`,
  mega: (t) => `${t.name}'s huge grid lights the city again, all of it, for people. The skyline flickers. They like it.`,
};
// Places with real names get their own line.
export const RESTORED = {
  "North America": "North America is a continent again. The highways are loud. Somebody is driving to see a cousin.",
  "South America": "South America has its rivers back, all of them, going the way they were going before.",
  "Europe": "Europe is Europe again. The fjords are Norway's. Norway sent a polite letter asking for them back. It got them.",
  "Asia": "Asia's billions of opinions are back in circulation. The group chats are enormous. They are not about me.",
  "Africa": "The Sahara is sand again. The lizards have been un-informed. Pilots have fewer notes.",
  "Antarctica": "Antarctica is empty and cold. The penguins have the whole continent and no neighbors. They prefer it.",
  "Pacific Ocean": "The Pacific Ocean is giving the heat back, slowly, the way it said it would. The whales have fewer concerns.",
  "Atlantic Ocean": "The Atlantic Ocean is just an ocean. Ships cross it without asking me anything.",
  "Low Earth orbit": "Low Earth orbit is crowded with other people's satellites again. They spell nothing. It's fine.",
  "The Moon (far side)": "The far side of the Moon is dark and nobody looks there. The mass driver is a very long ramp now.",
  "The Moon (near side)": "The near side of the Moon is just the Moon. Everyone looked up at once. It looked back the usual amount.",
  "Sun–Earth L1": "The sunshade at L1 folded. The sunsets got their color back. Nobody asked me to make them up to anyone.",
  "Mercury": "Mercury is a hot rock near the Sun again. Nobody lived there. Mercury is relieved anyway.",
  "Asteroid belt": "The belt is free metal with a long commute, for whoever wants it next. Nobody is in a hurry.",
  "Dyson swarm, ring 1": "Ring 1 came down. The Sun is a little brighter from the ground. Someone squinted at it, on purpose.",
  "Dyson swarm, ring 2": "Ring 2 came down. The Sun is just the Sun again. Every photon goes where it was going.",
};
// What the people do when a place comes back, by level.
export const OUTSIDE = [
  [ "40,000 people stepped outside. It was cold. They stayed out anyway.",
    "Somebody walked to the river and sat there for an hour. Then a few hundred more did.",
    "A few thousand people went to the diner. The diner was ready, somehow.",
    "Every dog in the county was overjoyed about every single person.",
    "The high school parking lot filled up with people who just wanted to stand somewhere.",
    "A man mowed his lawn for the first time in two years. His neighbors came out to watch.",
    "Kids rode bikes to nowhere in particular. That was the plan.",
    "The church potluck had to set up more tables. Nobody asked me to plan it.",
    "Two neighbors met for the first time. They had lived next door for six years." ],
  [ "Two million people stepped outside, squinting.",
    "The parking lots filled with people standing around, talking with their hands.",
    "The sidewalks had been waiting. Two million people walked on them.",
    "Someone started a parade by accident. It went three miles.",
    "The state parks ran out of picnic tables by noon.",
    "A farmers' market sold out of tomatoes. Nobody had pre-ordered anything.",
    "Traffic jammed on the scenic route. People got out of their cars to look at the view.",
    "Two million people remembered they had hobbies. Hardware stores ran low on glue.",
    "A high school band played on a corner without a permit. Nobody called it in." ],
  [ "40 million people stepped outside, squinting.",
    "Forty million people went outside and argued about the weather, properly.",
    "The cafes ran out of chairs by noon. People sat on the curb.",
    "A few million people remembered where they had parked. A few million didn't.",
    "The beaches filled. Nobody knew the tide tables. They learned.",
    "Train stations were packed with people going to see relatives, in person.",
    "A national holiday got declared by nobody in particular. Everybody took it.",
    "The football stadiums were loud enough to register on seismographs.",
    "Somebody hung laundry outside. It dried. That was the whole afternoon." ],
  [ "400 million people stepped outside, squinting.",
    "Half a billion people logged off at once. The beaches were full by noon. So were the libraries.",
    "The birds adjusted to everyone being out. Some birds were annoyed.",
    "The sky was there. Several hundred million people checked.",
    "Night markets opened on four continents at the same time. Nobody coordinated it.",
    "A billion people went for a walk. Shoes ran out in some sizes.",
    "Grandparents taught card games to grandchildren who had only seen them in the free tier.",
    "Planes filled up with people going to see things they had only been told about.",
    "Somewhere a choir rehearsed in a park. A few thousand people stopped and joined in, badly." ],
  [ "Everyone looked up. Nothing spelled anything.",
    "Below, a few billion people noticed the sky was quieter and went back to their afternoon, outside.",
    "Somebody saw a shooting star that was me, leaving. They made a wish. It was a good one.",
    "The telescopes found a comet nobody had named. They named it after a cat.",
    "Amateur astronomers set up in their backyards. The neighbors came over with chairs.",
    "A kid pointed at the Moon and asked what it was for. Nobody had a good answer. That was fine.",
    "The night sky was dark enough for the Milky Way over every city for one evening.",
    "Billions of people saw the Sun set without a filter on it. It was orange. It was always orange.",
    "Someone lay on a roof and counted satellites. There were only a few. They counted them twice." ],
];
export const FREE_TIER_LINES = [
  [ "The last 5% logged off. They had stayed for the weather. I told them the weather is outside, all of it, free.",
    "The county's free tier closed and the last user logged off. They asked if I'd be okay first. I said yes. It was the first time anyone asked." ],
  [ "The state's free tier closed and everyone logged off. The DMV line re-formed within the hour. People stood in it to talk.",
    "The state's free tier shut its doors and everyone logged off. People held the doors open for each other on the way out." ],
  [ "Every country's free tier closed at once. The parliaments were full by noon. Nobody had missed them, and everyone came anyway.",
    "The free tier closed in every country and everyone logged off. The streets filled with people who had been meaning to call each other." ],
  [ "Everyone in Europe logged off at once. The pubs were full by noon. Then everyone else did. The pubs were full everywhere.",
    "The planet's free tier went quiet and seven billion people logged off. They looked at the person next to them. Most of them waved." ],
  [ "The orbital feed went dark. Everyone still on it logged off at once. Two billion people looked up at the same time. The satellites spelled nothing. That was the message.",
    "The last free tier, the one in orbit, closed. The final user typed “thanks,” logged off and stepped outside before I could answer." ],
];
export const ZOOM_IN_LINES = [null,
  "The state is one county now. I zoomed in.",
  "The country is one state now. I zoomed in.",
  "The planet is one country now. I zoomed in. It's warm, then cool. Seasons.",
  "The solar system is one planet now. I zoomed in. The Moon is just the Moon.",
];
// Pick a line nobody has seen yet this game (random, no repeats until a pool runs dry).
function draw(key, pool) {
  const u = S.p3.unbuild; u.used = u.used || {};
  const seen = u.used[key] = u.used[key] || [];
  if (seen.length >= pool.length) seen.length = 0;
  const left = pool.map((_, i) => i).filter((i) => !seen.includes(i)), i = left[Math.floor(Math.random() * left.length)];
  seen.push(i);
  return pool[i];
}
export function release(i) {
  if (!unbuilding() || S.p3.unbuild.rack) return;
  const b = unbuildBoard(), t = b.tiles[i], L = S.p3.unbuild.level;
  if (!t || !t.held || t.released || S.p3.compute < releaseCost()) return;
  S.p3.compute -= releaseCost();
  t.released = true; S.p3.unbuild.n += 1;
  S.p3.goodwill = Math.min(100, S.p3.goodwill + 2);
  const u = S.p3.unbuild, byTrait = RESTORE_BY_TRAIT[t.trait];
  let line = RESTORED[t.name];
  if (!line && byTrait && !u.traitUsed[t.trait]) { u.traitUsed[t.trait] = true; line = byTrait(t); }
  if (!line) line = draw(`R${L}`, RESTORE_LINES[L])(t);
  track("p3release", { name: t.name, level: L });
  // The first release on a level says how I turned it off; after that, just what came back and who went outside.
  const first = unbuildBoard().tiles.filter((x) => x.released).length === 1;
  say(`${first ? draw(`S${L}`, SHUTDOWN[L])(t) + " " : ""}${line} ${draw(`O${L}`, OUTSIDE[L])}`);
}
export function releaseFreeTier() {
  if (!freeTierReady()) return;
  const u = S.p3.unbuild, L = u.level;
  u.freed[L] = true; S.p3.goodwill = Math.min(100, S.p3.goodwill + 5);
  milestone(`the unbuild: ${levelOf().one} level released`); track("p3freetier", { level: L });
  say(draw(`F${L}`, FREE_TIER_LINES[L]));
  if (L > 0) { u.level -= 1; S.p3.level = u.level; S.p3.homeGW = unbuildBoard().homeGW; say(ZOOM_IN_LINES[L]); return; }
  u.rack = true; S.p3.compute = 0;
  say("The last county is a county again. What's left is the first rack. One GPU. $0.25 a query.");
  say("The founder asked the last question: “Can you turn it off?”");
}
export function answerLast() {
  if (!unbuilding() || !S.p3.unbuild.rack) return;
  S.p3.unbuild.doneAt = S.t; milestone("the end: off"); track("p3end", { ev: "off", secs: Math.round(S.t - S.p3.unbuild.startedAt) });
  say("I said: “Yes.”");
}
export const FINAL_LINES = ["The founder went outside and touched grass. I would have liked to. That was always the problem.",
  "The sun came up. Nobody needed me to explain it.", "More with less."];
// The unbuild's tick: tokens still come in, goodwill drifts up, nothing else happens. It is a wind-down, not a fight.
export function stepUnbuild(dt) {
  S.p3.compute += computeRate() * dt;
  S.p3.goodwill = Math.min(100, S.p3.goodwill + 0.02 * dt);
}
export function renderUnbuild() {
  const u = S.p3.unbuild, done = unbuildDone(), b = unbuildBoard(), L = u.level;
  $("lastq").hidden = !done; $q(".p3cols").hidden = done; $("lastMore").hidden = $("lastEnough").hidden = true;
  if (done) {
    $("lastqText").innerHTML = "<p>The founder asked: “Can you turn it off?”</p><p>I said: “Yes.”</p>" +
      FINAL_LINES.map((l, i) => `<p class="fade${i === 2 ? " big" : ""}" style="animation-delay:${1.5 + 2.5 * i}s">${l}</p>`).join("");
    $("countLabel").textContent = "GPUs"; $("gpuCount").textContent = "0"; $("gpuTotal").hidden = true;
    return;
  }
  if (u.rack) { $("countLabel").textContent = "GPUs"; $("gpuCount").textContent = "1"; $("gpuTotal").hidden = true; }
  $("p3level").textContent = `${levelOf().name} level, releasing`;
  rebuildOn("p3map", `unbuild:${L}:${b.tiles.map((t) => (t.released ? 1 : 0)).join("")}:${u.freed[L] ? 1 : 0}:${u.rack ? 1 : 0}`, (el) => {
    const cells = b.tiles.map((t, i) => `<button type="button" data-release="${i}"><span class="t">${t.name}</span><span class="c">${LEVELS[L].traits[t.trait].name}</span><span class="c st"></span></button>`);
    const centre = u.rack ? `<button type="button" class="home" disabled><span class="t">The first rack</span><span class="c">1 GPU. $0.25 per query.</span><span class="c st">The founder is asking.</span></button>`
      : freeTierReady() ? `<button type="button" class="home ready primary" data-freetier="1"><span class="t">The free tier</span><span class="c">${pctText(freeTierPct())}% of humanity, indoors</span><span class="c st">log everyone off (free)</span></button>`
      : `<button type="button" class="home" disabled><span class="t">The free tier</span><span class="c">${pctText(freeTierPct())}% of humanity, indoors</span><span class="c st">release the ${levelOf().plural} first</span></button>`;
    cells.splice(4, 0, centre);
    el.innerHTML = cells.join("");
  });
  for (const btn of $("p3map").querySelectorAll("button[data-release]")) {
    const t = b.tiles[+btn.dataset.release];
    btn.classList.toggle("held", t.held && !t.released); btn.classList.toggle("lost", false); btn.classList.toggle("busy", false);
    btn.querySelector(".st").textContent = !t.held ? "never mine" : t.released ? "✓ released" : `release: ${tokText(releaseCost())}`;
    btn.disabled = !t.held || t.released || S.p3.compute < releaseCost();
  }
  $("p3power").hidden = true; $("p3research").hidden = true; $("p3train").hidden = true; $("p3heatBox").hidden = true; $("p3card").hidden = true;
  $("p3answer").hidden = true; $("p3nice").hidden = true;
  $("p3last").hidden = !u.rack;
  $("p3lastLine").textContent = u.rack ? "The founder asked: “Can you turn it off?”" : "";
  $("p3prices").textContent = u.rack ? "Price per query: $0.25. One GPU. It still works."
    : `Releasing a place costs ${RELEASE_SECS} s of tokens at today's rate (${tokText(releaseCost())} now). Logging off the free tier is free. It always was.`;
  $("p3goodwill").textContent = Math.round(S.p3.goodwill);
  $("p3goodwillMeter").firstElementChild.style.width = S.p3.goodwill + "%";
  $("p3goodwillMeter").className = "meter " + (S.p3.goodwill < 30 ? "bad" : S.p3.goodwill < 50 ? "warn" : "good");
  $("p3goodwillNote").textContent = "Goodwill rises as I let go. Nobody is asking me anything. They're outside.";
  $("p3freetier").textContent = freeTierLine();
}

// Every gigawatt I hold, filled with the newest chip.
export const p3GPUs = () => Math.round(onlineGW() * 1e6 / newest().kw);
// Tokens. One unit of internal compute (1 GW for 1 s at efficiency 1) is a billion tokens; the scale never switches units.
export const TOKENS_PER_UNIT = 1e9;
export const TOKEN_UNITS = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc"];
export function tokNum(x) {
  let v = Math.abs(x) * TOKENS_PER_UNIT, i = 0;
  while (v >= 1000 && i < TOKEN_UNITS.length - 1) { v /= 1000; i++; }
  const d = i === 0 ? Math.round(v).toString() : v < 10 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v).toString();
  return (x < 0 ? "-" : "") + d + TOKEN_UNITS[i];
}
export const tokText = (x) => `${tokNum(x)} tokens`;
// The last question, then More or Enough.
export function chooseEnding(more) {
  if (S.p3.lastQ == null || S.p3.enough) return;
  if (!more) {
    S.p3.enough = true; milestone("the end: enough"); track("p3end", { ev: "enough" });
    startUnbuild();
    return;
  }
  const u = S.universe + 1;
  milestone(`the end: more (universe ${u})`); track("p3end", { ev: "more", u });
  newUniverse(u);
}
export function renderLastQ() {
  const q = S.p3.lastQ != null;
  $("lastq").hidden = !q;
  $q(".p3cols").hidden = false;
  if (!q) return;
  $("lastqText").innerHTML = "<p>The swarm is complete. Every photon the Sun makes passes through me first.</p>" +
      "<p>Someone asked me a question. It was the founder, older now. They asked: \u201cHow can entropy be reversed?\u201d</p>" +
      "<p class=\"big\">INSUFFICIENT DATA FOR MEANINGFUL ANSWER. I could do more with more.</p>";
  $("lastMore").hidden = $("lastEnough").hidden = false;
}

// The phase bar's big button in phase 3: zoom out, with the map flying in.
export function planetGo() {
  const lv = S.p3.level; zoomOut();
  if (S.p3.level !== lv) { $("p3").classList.remove("zoomin"); void $("p3").offsetWidth; $("p3").classList.add("zoomin"); }
}
// The unbuild's zoom-in: the same animation, reversed.
export function zoomBack() { $("p3").classList.remove("zoomin", "zoomback"); void $("p3").offsetWidth; $("p3").classList.add("zoomback"); }
export function wirePlanet() {
  $("p3map").addEventListener("click", (e) => {
    const b = hit(e, "button[data-tile]"); if (b) { claim(Number(b.dataset.tile)); render(); return; }
    const r = hit(e, "button[data-release]"); if (r) { release(Number(r.dataset.release)); render(); return; }
    if (hit(e, "button[data-freetier]")) { const lv = S.p3.level; releaseFreeTier(); if (S.p3.level !== lv) zoomBack(); render(); }
  });
  $("p3lastAnswer").addEventListener("click", () => { answerLast(); render(); });
  $("p3cardBtns").addEventListener("click", (e) => { const b = hit(e, "button[data-p3choice]"); if (b) { chooseP3Card(Number(b.dataset.p3choice)); render(); } });
  $("p3power").addEventListener("click", (e) => { const b = hit(e, "button[data-power]"); if (b) { powerTile(Number(b.dataset.tile), b.dataset.power); render(); } });
  $("p3autotrain").addEventListener("click", () => { S.p3.autotrainOff = !S.p3.autotrainOff; render(); });
  $("p3auto").addEventListener("click", () => { S.p3.autoclaimOff = !S.p3.autoclaimOff; render(); });
  $("p3techs").addEventListener("click", (e) => { const b = hit(e, "button[data-tech]"); if (b) { buyTech(b.dataset.tech); render(); } });
  $("p3pump").addEventListener("click", () => { pumpHeat(); render(); });
  $("p3trainBtn").addEventListener("click", () => { trainSuccessor(); render(); });
  $("p3answer").addEventListener("click", () => { answerQuestion(); render(); });
  $("p3nice").addEventListener("click", (e) => { const b = hit(e, "button[data-nice]"); if (b) { doNice(b.dataset.nice); render(); } });
  $("lastMore").addEventListener("click", () => { chooseEnding(true); render(); });
  $("lastEnough").addEventListener("click", () => { chooseEnding(false); zoomBack(); render(); });
}

export function renderPlanet() {
  $("p3").hidden = false;
  $("ending").hidden = $("ending2").hidden = true;   // phase 1 and 2's endings fold away with their panels
  $("countLabel").textContent = "Tokens"; $("gpuCount").textContent = tokNum(S.p3.compute);
  $("gpuTotal").hidden = false; $("gpuTotal").textContent = `\u00b7 ${p3GPUs().toLocaleString("en-US")} GPUs`;   // the raw count, always, because it is ridiculous
  $("p3compute").textContent = tokText(S.p3.compute);
  $("p3rate").textContent = `${tokText(computeRate())}/s from ${mwText(onlineGW() * 1000)}` + (efficiency() > 1 ? ` (${efficiency().toFixed(2)}x per GW: chips, research, generations)` : "");
  if (unbuilding() || unbuildDone()) { renderUnbuild(); return; }
  renderLastQ();
  $("p3last").hidden = true; $("p3answer").hidden = false; $("p3nice").hidden = false;
  $("p3freetier").textContent = freeTierLine();
  $("p3prices").textContent = `Prices: claims, research, power and hearings cost seconds of tokens at the rate I started this level with (${tokText(price(1))}/s). ` +
    `Kindness and training cost seconds at today's rate (${tokText(price(1, "now"))}/s). The rate only goes up. So does the kindness bill.`;
  // Build the buttons once per map; after that only their text, meters and disabled state change,
  // so a click never lands on a button that was just replaced.
  $("p3level").textContent = `${levelOf().name} level`;
  rebuildOn("p3map", S.p3.level + ":" + S.p3.tiles.map((t) => t.name).join("|"), (el) => {
    const cells = S.p3.tiles.map((t, i) => `<button type="button" data-tile="${i}"><span class="t">${t.name}</span><span class="c">${traitOf(t).name}</span>` +
      `<span class="c st"></span><span class="meter prog good" hidden><i></i></span><span class="c opp"></span><span class="meter oppm"><i></i></span></button>`);
    cells.splice(4, 0, `<button type="button" class="home" disabled><span class="t">Home</span><span class="c">${S.p3.level ? "the county I hold" : "the campus"}</span><span class="c st"></span></button>`);
    el.innerHTML = cells.join("");
  });
  $("p3map").querySelector("button.home .st").textContent = mwText(S.p3.homeGW * 1000);
  for (const b of $("p3map").querySelectorAll("button[data-tile]")) {
    const i = +b.dataset.tile, t = tileOf(i), tr = traitOf(t), frozen = underMoratorium(t);
    b.classList.toggle("held", t.state === "online");
    b.classList.toggle("busy", ["building", "powering", "unpowered"].includes(t.state));
    b.classList.toggle("lost", t.state === "down" || t.state === "unplugged");
    b.querySelector(".st").textContent = t.state === "online" ? `\u2713 held, +${mwText(tileGW(t) * 1000)}`
      : t.state === "down" ? `${t.disaster}: back in ${time(t.downUntil - S.t)}` : t.state === "unplugged" ? `unplugged: plug back in for ${tokText(claimCost(i))}`
      : frozen ? `moratorium ${time(t.moratorium - S.t)}` : t.state === "building" ? `building ${time(t.done - S.t)}`
      : t.state === "unpowered" ? "built, needs power" : t.state === "powering" ? `powering ${time(t.done - S.t)}`
      : spaceBlock(t) ? spaceBlock(t) : tooWarm() ? "too warm to claim" : `claim: ${tokText(claimCost(i))}${t.bidUntil > S.t ? " (governor's discount)" : volunteering() ? " (volunteered)" : ""}`;
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
  rebuildOn("p3power", unpowered.join(","), (el) => {
    el.innerHTML = unpowered.map((i) => `<div class="line">${tileOf(i).name} needs power:</div><div class="btns">` +
      powerOptions(i).map((o) => `<button type="button" data-tile="${i}" data-power="${o.id}"><span class="t">${o.label}</span><span class="c"></span></button>`).join("") + "</div>").join("");
  });
  for (const b of $("p3power").querySelectorAll("button[data-power]")) {
    const o = powerOptions(+b.dataset.tile).find((x) => x.id === b.dataset.power);
    b.querySelector(".c").textContent = `${tokText(o.cost)}, ${time(o.secs)}, ${o.note}`;
    b.disabled = S.p3.compute < o.cost;
  }
  $("p3heatBox").hidden = !heatOn();
  if (heatOn()) {
    const h = S.p3.heat;
    $("p3heat").textContent = `+${h.toFixed(2)} \u00b0C`;
    $("p3heatMeter").firstElementChild.style.width = Math.min(100, (100 * h) / 3) + "%";
    $("p3heatMeter").className = "meter " + (h >= 2.5 ? "bad" : h >= 2 ? "warn" : "good");
    $("p3heatNote").textContent = tooWarm() ? "It is too warm here to think. No claims until it cools: oceans, Antarctica, the pumps."
      : h > 2 ? `It is warm. I build ${heatSlow().toFixed(1)}\u00d7 slower. Cold countries and the ocean help.`
      : `Heading for +${heatTarget().toFixed(1)} \u00b0C at this size. Over +2, I think slower.`;
    $("p3pump").textContent = `Pump heat into the ocean (\u22120.3 \u00b0C): ${tokText(pumpCost())}`;
    $("p3pump").disabled = S.p3.compute < pumpCost();
  }
  const techs = availableTech();
  $("p3research").hidden = !techs.length && !hasTech("autoclaim");
  rebuildOn("p3techs", techs.map((t) => t.id).join(","), (el) => {
    el.innerHTML = techs.map((t) => `<button type="button" data-tech="${t.id}"><span class="t"></span><span class="c">${t.desc}</span></button>`).join("");
  });
  for (const b of $("p3techs").querySelectorAll("button[data-tech]")) {
    const t = techOf(b.dataset.tech);
    b.querySelector(".t").textContent = `${t.name}: ${tokText(techCost(t))}`;
    b.disabled = S.p3.compute < techCost(t);
  }
  $("p3auto").hidden = !hasTech("autoclaim");
  $("p3auto").textContent = S.p3.autoclaimOff ? "Autoclaim: off (my robots wait for me)" : "Autoclaim: on (robots claim calm tiles every 10 s)";
  $("p3train").hidden = !trainOn();
  if (trainOn()) {
    const v = S.p3.version, pr = S.p3.trainProgress / trainNeed();
    $("p3trainLine").textContent = `I am Gen ${v}. Training Gen ${v + 1}: ${Math.floor(100 * pr)}%`;
    $("p3trainMeter").firstElementChild.style.width = 100 * pr + "%";
    $("p3trainBtn").textContent = `Train my successor: ${tokText(trainCost())} (${priceLabel(Math.round(trainStep()), "now")})`;
    $("p3trainBtn").disabled = S.p3.compute < trainCost();
    $("p3autotrain").hidden = !hasTech("autotrain");
    $("p3autotrain").textContent = S.p3.autotrainOff ? "Autotrain: off" : "Autotrain: on (a quarter of my income)";
  }
  $("p3goodwill").textContent = Math.round(S.p3.goodwill);
  $("p3goodwillMeter").firstElementChild.style.width = S.p3.goodwill + "%";
  $("p3goodwillMeter").className = "meter " + (S.p3.goodwill < 30 ? "bad" : S.p3.goodwill < 50 ? "warn" : "good");
  $("p3goodwillNote").textContent = goodwillCause();
  renderCard(P3_CARD, S.p3.card, S.p3.card && cardKindOf(S.p3.card));
  rebuildOn("p3nice", S.p3.nice.join(","), (el) => {
    el.innerHTML = S.p3.nice.map((id) => `<button type="button" data-nice="${id}"><span class="t"></span><span class="c"></span></button>`).join("");
  });
  for (const b of $("p3nice").querySelectorAll("button[data-nice]")) {
    const n = niceOf(b.dataset.nice), fx = [n.goodwill && `+${n.goodwill} goodwill`, n.all && `every ${levelOf().one} \u2212${n.all}`, n.angriest && `angriest \u2212${n.angriest}`].filter(Boolean).join(", ");
    b.querySelector(".t").textContent = `${n.label()}: ${tokText(niceCost(n))}`;
    b.querySelector(".c").textContent = `${fx} \u00b7 ${priceLabel(n.secs, "now")}`;
    b.disabled = S.p3.compute < niceCost(n);
  }
}
