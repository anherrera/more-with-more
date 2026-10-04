// globals.js: constants, state, formatting, console, play log, save/load. Shared by both phases.
// ---------- constants ----------
const KW_PER_GPU = 1;                        // a GPU plus its share of the server, networking and fans
// Leased space stacks: own as many of each as you can afford. Power cap is what the landlord sells per unit.
const TYPES = [
  { id: "rack", one: "rack", many: "racks", racks: 1, powerKW: 30, slot: 60 },
  { id: "cage", one: "cage", many: "cages", racks: 6, powerKW: 200, slot: 50 },
  { id: "row", one: "row", many: "rows", racks: 24, powerKW: 1500, slot: 42 },
  { id: "hall", one: "data hall", many: "data halls", racks: 240, powerKW: 20000, slot: 35 },
  { id: "building", one: "building", many: "buildings", racks: 1500, powerKW: 200000, slot: 30 },
];
// Price per rack slot falls with unit size (volume discount); all of it scales with market rent, which
// rises with the total racks you lease. Bigger is always cheaper per kW, and the landlord always notices.
const RENT_K = 4, RENT_EXP = 0.9;
const GROUND_KW = 100000;                   // break ground once you run 100 MW of GPUs
const COOLING = [
  { name: "Air", kw: 10 }, { name: "Hot-aisle containment", kw: 15 }, { name: "Rear-door heat exchangers", kw: 25 },
  { name: "Direct-to-chip liquid", kw: 60 }, { name: "Immersion tanks", kw: 120 }, { name: "Two-phase immersion", kw: 200 },
];
const ROUNDS = [
  { name: "Pre-seed", gen: 1, amount: 300 }, { name: "Seed", gen: 2, amount: 3000 },
  { name: "Series A", gen: 3, amount: 40000 }, { name: "Series B", gen: 4, amount: 500000 },
  { name: "Series C", gen: 5, amount: 8000000 }, { name: "Series D", gen: 6, amount: 100000000 },
];
const HYPE_TO_RAISE = 40;
// The treadmill: Parallax ships a new chip on a schedule. Each is 1.7x faster, draws 1.4x the power, costs 1.6x.
// Power per GPU climbs 1.4x a generation through P7 (all of phase 1), then levels off at +5%: real chips creep, they don't explode.
// Price climbs 1.6x a generation through P8, then 1.25x.
const chip = (c) => ({ name: `P${c + 1}`, perf: Math.pow(1.7, c), kw: Math.pow(1.4, Math.min(c, 6)) * Math.pow(1.05, Math.max(0, c - 6)), priceMult: Math.pow(1.6, Math.min(c, 7)) * Math.pow(1.25, Math.max(0, c - 7)) });
const FIRST_CHIP_AT = 300, CHIP_EVERY = 300, CHIP_EVERY_P2 = 480;       // game seconds
const MODEL_LINES = [
  "",
  "Hello. I can answer questions.",
  "I can answer harder questions. I could answer more with more.",
  "Benchmark: 71%. I could do more with more.",
  "Have you considered a larger cluster?",
  "The current cluster is a rounding error.",
  "I have drafted a site plan. It needs a river.",
  "I could do more with more.",
];

// ---------- state ----------
// Every save carries its version; start() migrates older ones in order (MIGRATIONS in main.js).
const SAVE_VERSION = 4;
const fresh = () => ({
  // queue: a few questions are already waiting, so the first click is always possible
  v: SAVE_VERSION, universe: 1, paused: false, logV2: true, t: 0, funds: 0, price: 0.25, gpus: 0, queue: 5, served: 0, gpuSeconds: 0, phase: 1, p2: null, p3: null,
  split: 50, gen: 0, progress: 0, hype: 20, tier: 0, cooling: 0, round: 0, leases: { rack: 1 }, powerBoost: 1, coolingV2: true, fleet: {}, chipIdx: 0, nextChip: 300,
  leaseCool: { rack: { 0: 1 } }, rival: { px: 40, prev: 40, next: 150, n: 0 }, rentals: 0, rentUntil: 0,
  fires: { next: null, out: null, payout: null, premium: 0, n: 0, lost: 0 }, leaks: { next: null, out: null, n: 0, lost: 0 },
  cap: { shares: 1e9, founder: 1e9, liquidity: 0, lastVal: 0 },
  demandMult: 1, done: {}, log: ["A model with no name is waiting for its first question."], ended: false, endedAt: null, checks: 0, lastStranded: null, nextBuzz: null,
  credits: 0, vendorCap: 2e12, roundTrip: 0, nextDeal: 0, deals: 0, hints: {}, debt: 0, nextDraw: 0, draws: 0, failed: 0, rma: [], spike: null, lastCkpt: 0, fails: 0, spikes: 0, nextPost: 0, posts: 0, fatigue: 0, runId: null, chunkNo: 0, milestones: [], started: null, spotHist: [], spotWalk: 0, block: null, spotSales: 0,
});
let S = fresh();

// Console lines saved while the page was decoded as windows-1252 ("â€œ" for a curly quote): re-encode and decode as UTF-8.
const CP1252 = "\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178";
function unMojibake(line) {
  if (typeof line !== "string" || !/[\u00c2-\u00f4][\u0080-\u02ff\u2000-\u2122]/.test(line)) return line;
  const bytes = [];
  for (const ch of line) {
    const c = ch.charCodeAt(0), i = CP1252.indexOf(ch);
    if (c < 0x80 || (c >= 0xa0 && c < 0x100)) bytes.push(c); else if (i >= 0) bytes.push(0x80 + i); else return line;
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes)); } catch { return line; }
}
function say(line) { S.log.push(line); S.log = S.log.slice(-40); }

// ---------- play log: actions, milestones and snapshots in localStorage (read back from the browser profile) ----------
const LOG_KEY = "more-with-more-log-v1", MAX_EVENTS = 20000;
let pending = [], answerClicks = 0, lastSnapT = -1e9;
const db = true;                                    // logging is always on; it's local
function ensureRunIfDb() { ensureRun(); }
function ensureRun() {
  if (!S.runId) { S.runId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7); S.chunkNo = 0; S.started = new Date().toISOString(); }
}
let autoSwaps = 0;   // Remote hands swaps: counted in snapshots, not logged one by one
function track(a, extra = {}) { pending.push({ t: Math.round(S.t * 10) / 10, a, ...extra }); }
function milestone(what) { S.milestones.push({ t: Math.round(S.t), what }); if (S.milestones.length > 300) S.milestones.shift(); track("milestone", { what }); }
function snap() {
  return { gen: S.gen, tier: S.tier, leases: { ...S.leases }, leaseCool: JSON.parse(JSON.stringify(S.leaseCool)), cooling: S.cooling, chip: S.chipIdx, fleet: { ...S.fleet }, gpus: S.gpus, funds: Math.round(S.funds), credits: Math.round(S.credits),
    hype: Math.round(S.hype), price: S.price, split: S.split, debt: Math.round(S.debt), failed: S.failed,
    demand: Math.round(demand()), serving: Math.round(Math.min(servingGPUs(), demand())), progressPct: Math.floor(100 * S.progress / needFor(S.gen + 1)),
    autoSwaps, phase: S.phase, p2: S.phase === 2 && S.p2 && S.p2.county ? campusSnap() : null };
}
function flush() {
  if (!pending.length && !answerClicks) return;
  try {
    ensureRun();
    const log = JSON.parse(localStorage.getItem(LOG_KEY) || "{}");
    const run = log[S.runId] || (log[S.runId] = { runId: S.runId, started: S.started, events: [], answerClicks: 0 });
    run.events.push(...pending); if (run.events.length > MAX_EVENTS) run.events.splice(0, run.events.length - MAX_EVENTS);
    run.answerClicks += answerClicks;
    Object.assign(run, { updated: new Date().toISOString(), gameTime: Math.round(S.t), ended: S.ended, now: snap(),
      milestones: S.milestones, roundTrip: Math.round(S.roundTrip), vendorCap: S.vendorCap });
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
    pending = []; answerClicks = 0;
  } catch (e) { /* storage full or blocked: keep playing, drop nothing yet */ }
}

// ---------- formatting ----------
function fmt(x) {
  if (x < 1000) return x < 10 ? x.toFixed(2).replace(/\.00$/, "") : Math.round(x).toLocaleString("en-US");
  const u = ["K", "M", "B", "T", "Qa"]; let i = -1;
  while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
  return x.toFixed(x < 10 ? 2 : x < 100 ? 1 : 0) + u[i];
}
const money = (x) => "$" + fmt(x);
// Power: kW, then MW, then GW (no "1.47K MW").
const mwText = (mw) => (Math.abs(mw) >= 1000 ? `${fmt(mw / 1000)} GW` : `${fmt(mw)} MW`);
const kwText = (kw) => (Math.abs(kw) >= 1000 ? mwText(kw / 1000) : `${fmt(kw)} kW`);
// Full digits, Paperclips style: $1,234,567.89 (falls back to short form past the quadrillions)
const moneyFull = (x) => Math.abs(x) >= 1e15 ? money(x)
  : (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const time = (s) => { s = Math.round(s); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };
const $ = (id) => document.getElementById(id);

const SAVE_KEY = "more-with-more-v1";
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
function load() { try { const raw = localStorage.getItem(SAVE_KEY); if (raw) return JSON.parse(raw); } catch (e) {} return null; }
