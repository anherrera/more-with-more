// main.js: phase 1 (the lab), the shared tick and render, wiring, and start().
const TEST = new URLSearchParams(location.search).has("test");
// Playtesting fast-forward: ?speed=10 runs the game 10x (1-50). Off unless the URL asks.
const SPEED = Math.max(1, Math.min(50, Number(new URLSearchParams(location.search).get("speed")) || 1));
let clockOn = false;                                              // set in start()   // tests drive step() by hand: no timers
// ---------- model ----------
const needFor = (g) => 100 * Math.pow(10, g - 1);           // GPU-seconds to train generation g
const quality = () => Math.pow(4, S.gen);                  // each generation quadruples what people want from it
const hypeMult = () => 0.5 + S.hype / 40;
const demand = () => 5 * quality() * hypeMult() * S.demandMult * Math.pow(0.25 / S.price, 1.3);
const owned = (i) => S.leases[TYPES[i].id] || 0;
// Each leased unit keeps the cooling it was built with (S.leaseCool[type][level] = count). Cooling projects set
// the standard for NEW leases; older space stays sparse until you pay to retrofit it.
const unitKW = (i, level = S.cooling) => Math.min(TYPES[i].racks * COOLING[level].kw, TYPES[i].powerKW * S.powerBoost);
const coolOf = (i) => S.leaseCool[TYPES[i].id] || {};
const leasedKW = () => TYPES.reduce((a, _, i) => a + Object.entries(coolOf(i)).reduce((b, [lv, n]) => b + n * unitKW(i, +lv), 0), 0)
  + (S.p2 ? S.p2.colo || 0 : 0);                                     // phase 2 colo blocks
const capKW = () => leasedKW() + (S.phase === 2 ? campusKWAt() : 0);   // phase 2: plus energized campus halls
const RETROFIT = 1.0;                   // retrofit costs what new space costs per kW gained, but adds no racks and no rent
const retrofitPlan = () => {
  let cost = 0, kw = 0, units = 0;
  TYPES.forEach((t, i) => {
    for (const [lv, n] of Object.entries(coolOf(i))) {
      if (+lv >= S.cooling) continue;
      const gain = unitKW(i) - unitKW(i, +lv);
      if (gain <= 0) continue;
      kw += n * gain; units += n; cost += n * gain * RETROFIT * leaseCost(i) / unitKW(i);
    }
  });
  return { cost, kw, units };
};
function retrofit() {
  const plan = retrofitPlan();
  if (plan.kw <= 0 || S.funds < plan.cost) return;
  S.funds -= plan.cost;
  TYPES.forEach((t, i) => {
    const lc = coolOf(i); let moved = 0;
    for (const lv of Object.keys(lc)) if (+lv < S.cooling && unitKW(i) > unitKW(i, +lv)) { moved += lc[lv]; delete lc[lv]; }
    if (moved) { lc[S.cooling] = (lc[S.cooling] || 0) + moved; S.leaseCool[t.id] = lc; }
  });
  track("retrofit", { cost: Math.round(plan.cost), kw: Math.round(plan.kw), units: plan.units });
  say(`Retrofitted ${plan.units.toLocaleString("en-US")} older unit${plan.units > 1 ? "s" : ""} to ${COOLING[S.cooling].name} while they were running. +${kwText(plan.kw)}. Nobody died. The contractor was surprised too.`);
}
const totalRacks = () => TYPES.reduce((a, t, i) => a + owned(i) * t.racks, 0);
const highestType = () => { let h = 0; TYPES.forEach((_, i) => { if (owned(i) > 0) h = i; }); return h; };
const racksLeased = () => TYPES.reduce((a, t, i) => a + owned(i) * t.racks, 0) + (S.p2 ? (S.p2.coloN || 0) * COLO_RACKS : 0);
const rentIndex = () => Math.pow(1 + racksLeased() / RENT_K, RENT_EXP);
const leaseCost = (i) => TYPES[i].racks * TYPES[i].slot * rentIndex();
const leaseVisible = (i) => i === 0 || owned(i) > 0 || owned(i - 1) > 0;
const fitGPUs = () => Math.floor(capKW() / KW_PER_GPU);
const PMAX = 500, N0 = 9900;                                         // volume pricing: price stops rising at $500 (~10k GPUs)
const newest = () => chip(S.chipIdx);
const basePrice = (n = S.gpus) => Math.min(PMAX, 5 * (1 + n / 100));
const gpuPrice = (n = S.gpus) => basePrice(n) * newest().priceMult * gpuDiscount() * vendorOf().price;
const usedKW = () => Object.entries(S.fleet).reduce((a, [c, n]) => a + n * chip(+c).kw, 0);
const totalPerf = () => Object.entries(S.fleet).reduce((a, [c, n]) => a + n * chip(+c).perf, 0);
const avgPerf = () => (S.gpus > 0 ? totalPerf() / S.gpus : newest().perf);
const roomNewest = () => Math.max(0, Math.floor((capKW() - usedKW()) / newest().kw + 1e-9));
const F = (n) => n <= N0 ? 250 * Math.pow(1 + n / 100, 2)             // cumulative cost of the first n GPUs
  : 250 * Math.pow(1 + N0 / 100, 2) + PMAX * (n - N0);
const costOf = (k) => (F(S.gpus + k) - F(S.gpus)) * newest().priceMult * gpuDiscount();
const maxBuy = (wallet = S.funds + S.credits) => {                   // as many as fit and the wallet covers
  const room = roomNewest();
  if (room <= 0 || wallet <= 0) return 0;
  const target = F(S.gpus) + wallet / (newest().priceMult * gpuDiscount());
  const nMax = target <= F(N0) ? 100 * (Math.sqrt(target / 250) - 1) : N0 + (target - F(N0)) / PMAX;
  const k = Math.floor(nMax - S.gpus);
  let n = Math.max(0, Math.min(room, k));
  while (n > 0 && costOf(n) > wallet) n--;                          // guard float rounding at the edge
  return n;
};
const inRMA = () => S.rma.reduce((a, r) => a + r[0], 0);
const workingGPUs = () => Math.max(0, S.gpus - S.failed - inRMA() - (S.block ? S.block.n : 0));
const servingGPUs = () => workingGPUs() * avgPerf() * (1 - S.split / 100);                 // compute, in P1-equivalents
const trainMult = () => (S.done.synthdata ? 1.5 : 1) * (S.done.poach ? 1.5 : 1) * (S.t < S.rentUntil ? 2 : 1);
const trainingGPUs = () => S.spike ? 0 : workingGPUs() * avgPerf() * (S.split / 100) * trainMult();
const demandAt = (price) => 5 * quality() * hypeMult() * S.demandMult * Math.pow(0.25 / price, 1.3);
const FAIL_RATE = 0.0001;                                  // per working GPU per second (~a 3h MTBF, for comedy)

function endPhase() {
  S.ended = true; S.endedAt = S.t; milestone("broke ground (end of phase 1)");
  say(`Phase 1 took ${time(S.t)}. ${money(S.roundTrip)} went in a circle. Parallax is worth ${money(S.vendorCap)}.`);
  say("I could do more with more.");
  startCampus();
}

// ---------- actions ----------
// Every click answers someone: from the queue if anyone's waiting, otherwise someone who was about to give up.
function answer() { answerClicks++; S.queue = Math.max(0, S.queue - 1); S.served += 1; S.funds += S.price; }
// Parallax invests in you; the money can only buy Parallax GPUs; Parallax books it as revenue.
const dealSize = () => S.phase === 2 ? campusDealSize() : 800 * Math.pow(5, S.gen) * (1 + S.deals * 0.15);
const dealReady = () => S.gen >= 1 && S.t >= S.nextDeal;
function takeDeal() {
  if (!dealReady()) return;
  const amt = dealSize();
  S.credits += amt; S.deals += 1; S.nextDeal = S.t + 90; track("parallax", { amt: Math.round(amt) });
  S.vendorCap += amt * 4;                                   // "strategic investment in the ecosystem"
  say(S.deals === 1
    ? `Parallax invested ${money(amt)} in you. It is in Parallax credits. The landlord does not take Parallax credits.`
    : DEAL_QUIPS[(S.deals - 2) % DEAL_QUIPS.length](money(amt)));
}
// Parallax investment lines, in order, so none repeats until the list runs out.
const DEAL_QUIPS = [
  (m) => `Parallax invested ${m} more. Their analysts call it \u201cecosystem health.\u201d`,
  (m) => `Parallax invested ${m}. You will spend it on Parallax GPUs. Parallax will book it as revenue. Everyone claps.`,
  (m) => `Parallax invested ${m}. Their stock went up more than ${m}. They are thinking about doing this again.`,
  (m) => `Another ${m} from Parallax. Their earnings call described you as \u201ca customer with strong demand signals.\u201d You are the demand signal.`,
  (m) => `Parallax invested ${m}. The press release says \u201cstrategic partnership.\u201d The term sheet says \u201cbuy our chips.\u201d`,
  (m) => `${m} in Parallax credits. Non-transferable. Non-refundable. Expires if you ever look at a competitor.`,
  (m) => `Parallax invested ${m}. Somewhere, a slide titled \u201cThe AI Flywheel\u201d gained a new arrow.`,
  (m) => `Parallax invested ${m}. Their CFO asked if you could order a little faster before the quarter closes.`,
  (m) => `Parallax invested ${m}. It went from their balance sheet to your balance sheet to their balance sheet in under a second. A new record.`,
  (m) => `Parallax invested ${m}. An analyst asked where the money comes from. The analyst has been reassigned.`,
  (m) => `Parallax invested ${m}. They also invested in your three biggest competitors. They love all of you equally.`,
  (m) => `${m} from Parallax. The money never left the building. Technically neither did the GPUs.`,
  (m) => `Parallax invested ${m}. Your valuation is now mostly Parallax credits multiplied by vibes.`,
  (m) => `Parallax invested ${m}. Their keynote called you \u201cone of the most important companies in the world.\u201d They say that about everyone who orders.`,
  (m) => `Parallax invested ${m}. The circle is complete. The circle was always complete. The circle is the product.`,
  (m) => `Parallax invested ${m}. A reporter drew a diagram of the deal. It is a single arrow pointing at itself.`,
  (m) => `Parallax invested ${m} and pre-booked the GPUs you will buy with it. Saves everyone a step.`,
  (m) => `${m} from Parallax. Their auditors called it \u201cunusual but within guidance.\u201d Guidance has been updated.`,
  (m) => `Parallax invested ${m}. In exchange you agreed to say \u201cParallax\u201d in every keynote. You now say it in your sleep.`,
  (m) => `Parallax invested ${m}. Somewhere, a bond trader quietly closed a laptop.`,
  (m) => `Parallax invested ${m}. You thanked them. They thanked you. The money thanked no one.`,
  (m) => `Parallax invested ${m}. The model asked for the invoice. It wants to understand how this works. So do we.`,
];

const POSTS = [
  "Something big is coming.", "we've been cooking", "the next one is different. can't say more",
  "a thread (1/47)", "internal evals are... something", "if you know, you know",
  "feeling the scaling laws today", "new model soon. not a promise. a vibe.",
];
// Phase 2: you're an infrastructure company now. The posts are about concrete.
const CAMPUS_POSTS = [
  "drone shot of the new hall. no caption needed", "we're going to need a bigger substation",
  "a gigawatt is just a lot of megawatts if you think about it", "concrete poured. vibes poured.",
  "announcing an MOU to explore a partnership to discuss a gigawatt", "hiring electricians. all of them.",
  "the turbines are spinning and so are we", "sunrise over the cooling towers. this is the future",
];
const postReady = () => S.gen >= 1 && S.t >= S.nextPost;
// Each post: base (5 + gen), shrunk by recent-post fatigue, then a roll: viral x3, ratioed x0.3.
const postBase = () => (5 + S.gen) * (S.done.evals ? 1.5 : 1) / (1 + 0.5 * S.fatigue);
function vaguePost() {
  if (!postReady()) return;
  const roll = Math.random();
  const [mult, tag] = roll < (S.done.keynote ? 0.3 : 0.15) ? [3, " It went viral."] : roll < (S.done.keynote ? 0.45 : 0.35) ? [0.3, " Ratioed."] : [1, ""];
  const gain = Math.max(1, Math.round(postBase() * mult));
  S.hype += gain; S.nextPost = S.t + 25; S.fatigue += 1; track("post", { gain, result: mult === 3 ? "viral" : mult < 1 ? "ratioed" : "normal" });
  const lines = S.phase === 2 ? CAMPUS_POSTS : POSTS;
  say(`Posted: \u201c${lines[S.posts % lines.length]}\u201d +${gain} hype.${tag}`);
  S.posts += 1;
}

// ---- spot market: a swinging rental rate; sell half your fleet for 30s at the current price
const spotOpen = () => S.gen >= 2;
const spotMult = () => Math.max(0.15, 1.3 + 0.9 * Math.sin(S.t / 11) + 0.45 * Math.sin(S.t / 4.3 + 2) + S.spotWalk);
const spotRate = () => Math.max(S.price, 0.002) * spotMult();       // $ per GPU-second
const blockSize = () => Math.floor((S.phase === 2 ? uncontractedGPUs() : workingGPUs()) / 2);
const spotPay = () => (S.phase === 2 ? campusSpotPay() : blockSize() * avgPerf() * spotRate() * 30);
const spotReady = () => spotOpen() && !S.block && blockSize() >= 1;
function sellSpot() {
  if (!spotReady()) return;
  const n = blockSize(), pay = spotPay();
  S.block = { n, until: S.t + 30 }; track("spot", { n, mult: Math.round(spotMult() * 100) / 100, pay: Math.round(pay) });
  S.funds += pay; S.roundTrip += pay * 0.5; S.spotSales += 1;
  say(S.spotSales === 1
    ? `Leased ${n.toLocaleString("en-US")} GPUs on the spot market for ${money(pay)}. The buyer is a startup funded by Parallax. They paid with Parallax money.`
    : `Spot sale: ${n.toLocaleString("en-US")} GPUs for 30s, ${money(pay)} (${spotMult().toFixed(1)}x query revenue).`);
}

// Trade the oldest chips back to Parallax for 25% of today's price, in credits. Frees power for new chips.
// Phase 2: GPUs under contract can't be traded in; only the free part of a cohort can go.
const tradeCount = (c) => Math.min(S.fleet[c] || 0, S.phase === 2 ? Math.floor((freeKWByGen()[c] || 0) / chip(c).kw + 1e-9) : Infinity);
const oldestOld = () => { const cs = Object.keys(S.fleet).map(Number).filter((c) => c < S.chipIdx && tradeCount(c) > 0).sort((a, b) => a - b); return cs.length ? cs[0] : null; };
const tradeRate = () => (S.done.refurb ? 0.4 : 0.25);   // your own refurb shop pays better
const tradeValue = (c) => tradeCount(c) * basePrice() * chip(c).priceMult * tradeRate();
function tradeIn(gen) {
  const c = gen ?? oldestOld(); if (c === null || c === undefined || c >= S.chipIdx) return;
  const n = Math.min(tradeCount(c), Math.max(0, S.gpus - S.failed - inRMA() - (S.block ? S.block.n : 0)));
  if (n <= 0) return;
  const val = n * basePrice() * chip(c).priceMult * tradeRate();
  S.fleet[c] -= n; if (S.fleet[c] <= 0) delete S.fleet[c]; S.gpus -= n; S.credits += val; S.vendorCap += val * 25;
  track("tradein", { chip: chip(c).name, n, val: Math.round(val) });
  say(`Traded in ${n.toLocaleString("en-US")} ${chip(c).name}s for ${money(val)} in Parallax credits. Parallax will refurbish them and sell them to someone else.`);
}
// ---- the bubble: hype above 100 is froth; reality checks knock off a share of it.
// Real revenue relative to debt interest softens the fall. A hard fall while in debt pauses draws.
const REALITY = [
  "Analyst note: \u201cwhere's the revenue?\u201d", "A rival matched your model at half the price.",
  "Someone read the S-1.", "A podcast asked what the business model is.",
  "Parallax's earnings call mentioned \u201cdigestion.\u201d", "A benchmark you topped turns out to be in the training data.",
  "A customer published their actual usage numbers.",
];
const froth = () => Math.max(0, S.hype - 100);
function realityCheck() {
  const rev = S.phase === 1 ? Math.min(servingGPUs(), demand()) * S.price : campusRevenue();
  // Leverage: debt measured against ten minutes of revenue. The more borrowed, the harder the fall.
  const leverage = S.debt / (rev * 600 + S.debt + 1e-9);
  const severity = (0.3 + 0.5 * leverage) * (S.done.hallucinate ? 0.5 : 1);   // admitting it in the docs takes the sting out
  const loss = Math.round(froth() * severity);
  S.hype -= loss; S.checks = (S.checks || 0) + 1;
  const pool = S.done.depr6 ? [...REALITY, "A short-seller read your depreciation footnote."] : REALITY;
  let line = `${pool[S.checks % pool.length]} Hype -${loss}.`, seized = 0;
  if (S.debt > 0 && severity > 0.5 && S.phase === 1) {
    // Margin call: the lenders mark your collateral to market and take 20% of the fleet, oldest chips first.
    S.nextDraw = Math.max(S.nextDraw, S.t + 120);
    let take = Math.floor(0.2 * S.gpus);
    for (const c of Object.keys(S.fleet).map(Number).sort((a, b) => a - b)) {
      const k = Math.min(take, S.fleet[c]); S.fleet[c] -= k; if (S.fleet[c] <= 0) delete S.fleet[c]; S.gpus -= k; take -= k; seized += k;
      if (take <= 0) break;
    }
    S.failed = Math.min(S.failed, S.gpus);
    line += ` Margin call: lenders marked your GPUs to market and took ${seized.toLocaleString("en-US")} of them. Draws frozen for 2 minutes.`;
  }
  else if (S.debt > 0 && severity > 0.5) { S.nextDraw = Math.max(S.nextDraw, S.t + 120); line += " Lenders froze your draws for 2 minutes."; }
  track("crash", { loss, severity: Math.round(severity * 100) / 100, seized });
  say(line);
}

// ---- PivotCloud: the rival neocloud. Ex-crypto miners, now an AI hyperscaler, stock moves 20% on a rumor.
const RIVAL_NEWS = [
  (d) => `PivotCloud, formerly PivotCoin, formerly an Ethereum mining operation in a garage, now calls itself \u201cthe AI hyperscaler.\u201d The garage is still there. ${d}`,
  (d) => `PivotCloud announced 50,000 Parallax GPUs, bought with a loan secured by 50,000 Parallax GPUs. ${d}`,
  (d) => `PivotCloud's founders sold $400M of stock this quarter to \u201cdiversify.\u201d Analysts called it a vote of confidence. ${d}`,
  (d) => `PivotCloud says the pivot from crypto was obvious: \u201cWe always had GPUs, electricity and no idea what to do with them.\u201d ${d}`,
  (d) => `Parallax owns a stake in PivotCloud, sells chips to PivotCloud, and rents capacity back from PivotCloud. Nobody can find the edge of it. ${d}`,
  (d) => `PivotCloud signed a $12B contract with a lab that has $2B. ${d}`,
  (d) => `PivotCloud's IPO priced below range, then rose 300%, then fell 60%, then rose again. The CFO has stopped checking. ${d}`,
  (d) => `PivotCloud's debt now has its own credit rating, its own ticker and a fan account. ${d}`,
  (d) => `PivotCloud's investor day slide: \u201cWe were early to GPUs.\u201d Footnote: \u201cFor mining.\u201d ${d}`,
  (d) => `A PivotCloud executive posted a laser-eyes profile picture, deleted it, and replaced it with a data center. ${d}`,
  (d) => `PivotCloud is buying another ex-bitcoin miner for its power contracts. The bitcoin miners are thrilled. The bitcoins are not consulted. ${d}`,
  (d) => `PivotCloud's largest customer is also its largest shareholder and its largest supplier's largest customer. ${d}`,
  (d) => `PivotCloud's lockup expired. Early employees are now learning what a Lamborghini dealer's financing office looks like. ${d}`,
  (d) => `PivotCloud reported record revenue and record losses in the same sentence. ${d}`,
  (d) => `PivotCloud's CEO said \u201cthe demand is insatiable\u201d on a podcast recorded inside a half-empty data hall. ${d}`,
  (d) => `PivotCloud raised $7B in debt at 11%. \u201cCheap,\u201d said someone who has never had a mortgage. ${d}`,
  (d) => `A short-seller published a 90-page report on PivotCloud. The stock went up. Nobody understands anything. ${d}`,
  (d) => `PivotCloud tried to lease your landlord's building. Your landlord asked if they take Parallax credits. ${d}`,
];
// Weird things PivotCloud does that splash onto you: [line, hype change for you, their stock move].
const RIVAL_WEIRD = [
  ["PivotCloud announced AGI in a tweet at 2 a.m. It was deleted by 2:05. The whole sector rallied anyway.", +12, 0.6],
  ["A PivotCloud data hall caught fire. \u201cThermal event,\u201d says the press release. Investors now ask you about fire suppression.", -10, -0.4],
  ["PivotCloud's CEO bought a football team. Your investors want to know why you don't have a football team.", +6, 0.15],
  ["PivotCloud launched a token. It is called $PIVOT, again. It is backed by GPU-hours, vibes and nothing. The SEC has entered the chat.", -8, -0.3],
  ["PivotCloud's cooling tower was filmed dumping steam over a suburb. \u201cAI is boiling the town\u201d trends. All neoclouds are now the villain.", -12, -0.25],
  ["PivotCloud got a Parallax allocation you didn't. Your investors ask what your relationship with Parallax is \u201creally like.\u201d", -6, 0.3],
  ["PivotCloud signed a sovereign deal with a country that didn't exist last year. Investors love it. Everyone wants a country.", +10, 0.5],
  ["PivotCloud's founder livestreamed himself mining bitcoin on an H-class GPU \u201cfor old times' sake.\u201d Utilization questions follow everyone.", -7, -0.2],
  ["PivotCloud was added to a major index. Index funds must buy it. Index funds must also, apparently, feel good about you.", +8, 0.35],
  ["A PivotCloud customer defaulted and returned 20,000 GPUs. \u201cSpot supply glut\u201d headlines. Your hype dips in sympathy.", -9, -0.45],
];
// The rest of the neocloud neighborhood: [line, hype change for you]. Made up, like everyone else here.
const NEOCLOUD_NEWS = [
  ["Flarewell Compute burns the gas oil fields were going to flare anyway. It used to mine bitcoin with it. Now the gas thinks.", +4],
  ["Flarewell Compute's pitch deck: \u201cWaste not.\u201d Slide two is a photo of a flare stack with a GPU drawn on it.", +3],
  ["Flarewell Compute bought another gas field. Its sustainability report calls this \u201cpower diversity.\u201d", -3],
  ["Elsewhere Cloud reminded investors, for the ninth time this week, that it is Dutch.", +2],
  ["Elsewhere Cloud is the international leftovers of a large search engine you're not allowed to name. Its HQ is in Amsterdam. Very much in Amsterdam.", 0],
  ["Elsewhere Cloud built a data center in Finland, where the cooling is free and the sun is optional. Investors asked why you aren't in Finland.", -4],
];
function rivalNews() {
  const R = S.rival;
  if (Math.random() < 0.2) {
    const [line, dh] = NEOCLOUD_NEWS[Math.floor(Math.random() * NEOCLOUD_NEWS.length)];
    R.next = S.t + 80 + Math.random() * 60; S.hype = Math.max(5, S.hype + dh);
    say(dh ? `${line} Your hype ${dh > 0 ? "+" : ""}${dh}.` : line);
    return;
  }
  if (Math.random() < 0.35) {
    const [line, dh, shock] = RIVAL_WEIRD[Math.floor(Math.random() * RIVAL_WEIRD.length)];
    R.prev = R.px; R.px = Math.max(3, R.px * Math.exp(shock)); R.n += 1; R.next = S.t + 80 + Math.random() * 60;
    const pct = Math.round(100 * (R.px / R.prev - 1));
    S.hype = Math.max(5, S.hype + dh); track("rival", { dh, pct });
    say(`${line} PIVT ${pct >= 0 ? "+" : ""}${pct}%. Your hype ${dh >= 0 ? "+" : ""}${dh}.`);
    return;
  }
  // Fat-tailed moves: most days \u00b110%, some days the stock doubles or halves.
  const shock = Math.random() < 0.15 ? (Math.random() < 0.5 ? -0.55 : 0.8) : (Math.random() - 0.45) * 0.25;
  R.prev = R.px; R.px = Math.max(3, R.px * Math.exp(shock)); R.n += 1; R.next = S.t + 80 + Math.random() * 60;
  const pct = Math.round(100 * (R.px / R.prev - 1));
  const d = `PIVT ${pct >= 0 ? "+" : ""}${pct}%.`;
  say(RIVAL_NEWS[(R.n - 1) % RIVAL_NEWS.length](d));
  if (pct <= -30) { S.hype = Math.max(5, S.hype - 8); say("Your hype fell too. Investors can't tell neoclouds apart."); }
  else if (pct >= 40) { S.hype += 8; say("Your hype rose with it. Investors can't tell neoclouds apart."); }
}

// Renting the rival's GPUs: cash straight into training speed. PivotCloud raises the price every time.
const rentOpen = () => S.phase === 1 && S.gen >= 5;
const rentCost = () => 640 * Math.pow(5, S.gen) * Math.pow(1.3, S.rentals);
const RENT_LINES = [
  "You rented PivotCloud's cluster. They reported \u201ca major new AI customer.\u201d It's you. PIVT +{p}%.",
  "Rented PivotCloud again. Their earnings call thanked \u201cour partners.\u201d Your CFO asked who that is. PIVT +{p}%.",
  "PivotCloud's GPUs are training your model. They were bought with Parallax money. So were yours. PIVT +{p}%.",
  "Rented PivotCloud. Half their cluster still has a bitcoin miner's asset tags on it. PIVT +{p}%.",
  "PivotCloud raised your rate. \u201cDemand is insatiable,\u201d they said, about you. PIVT +{p}%.",
];
function rentRival() {
  if (!rentOpen() || S.t < S.rentUntil || S.funds < rentCost()) return;
  const c = rentCost();
  S.funds -= c; S.rentals += 1; S.rentUntil = S.t + 60;
  const R = S.rival, bump = 0.05 + Math.random() * 0.1;
  R.prev = R.px; R.px *= 1 + bump;
  track("rent", { cost: Math.round(c) });
  say(RENT_LINES[(S.rentals - 1) % RENT_LINES.length].replace("{p}", Math.round(bump * 100)));
}

// Periodic nonsense that gives you hype, because the discourse never sleeps.
const BUZZ = [
  ["A podcast called you \u201cthe Switzerland of compute.\u201d", 8],
  ["A sell-side analyst initiated coverage: Strong Buy. He has never seen a data center.", 10],
  ["Your CEO wore a black turtleneck on stage.", 6],
  ["A viral thread explained your company using a diagram with eleven arrows. Nine point at you.", 9],
  ["You were named to a \u201c30 under 30\u201d list. Nobody checked.", 7],
  ["A conference renamed its main stage after you. You paid for the conference.", 12],
  ["An influencer unboxed one of your GPUs. It was not your GPU.", 6],
  ["A think tank called you \u201ccritical infrastructure.\u201d It is funded by Parallax.", 11],
];
function buzz() {
  const [line, dh] = BUZZ[Math.floor(Math.random() * BUZZ.length)];
  S.hype += dh; S.nextBuzz = S.t + 100 + Math.random() * 60;
  track("buzz", { dh }); say(`${line} +${dh} hype.`);
}

function releaseChip() {
  S.chipIdx += 1; S.nextChip = S.t + (S.phase >= 2 ? CHIP_EVERY_P2 : CHIP_EVERY);
  const c = newest(), prev = chip(S.chipIdx - 1);
  S.vendorCap *= 1.08; milestone(`Parallax ${c.name}`);
  if (S.phase === 3) { const paper = chipShipped(); say(`Parallax shipped the ${c.name}. I swapped it in overnight. It came with a white paper on ${paper.toLowerCase()}; it's under Research.`); return; }
  say(`Parallax announced the ${c.name}: ${c.perf.toFixed(1)}x the speed of a P1, ${kwText(c.kw)} each. Your ${prev.name}s are now \u201clegacy.\u201d`);
}

function swapFailed() {
  if (S.failed <= 0) return;
  S.rma.push([S.failed, S.t + 60]); if (S.done.hands) autoSwaps += S.failed; else track("swap", { n: S.failed });
  if (!S.hints.rma1) { S.hints.rma1 = true; say(`Shipped ${S.failed} dead GPU${S.failed > 1 ? "s" : ""} back to Parallax. Replacements in about a minute.`); }
  S.failed = 0;
}
function rollback() {
  if (!S.spike) return;
  S.spike = null; S.progress = S.lastCkpt; track("rollback");
  say("Rolled back to the last checkpoint. The loss curve looks normal again. Nobody saw anything.");
}

// A debt facility secured by your GPUs, sized by hype. Opens once you lease a data hall.
const DRAW_HYPE = 60, INTEREST = 0.0002;
const interestPerSec = () => S.debt * INTEREST * (S.phase === 2 ? P2_RATE : 1);                  // per second on outstanding debt (~1.2%/min)
const drawSize = () => S.phase === 2 ? campusDrawSize() : (S.hype / 100) * 3 * Math.pow(5, S.gen) * 1000;
const facilityOpen = () => S.phase === 2 || S.tier >= 3;
const drawReady = () => facilityOpen() && S.hype >= DRAW_HYPE && S.t >= S.nextDraw;
function draw() {
  if (!drawReady()) return;
  const amt = drawSize();
  S.funds += amt; S.debt += amt; S.draws += 1; S.nextDraw = S.t + 60; S.hype -= 10; track("draw", { amt: Math.round(amt), debt: Math.round(S.debt) });
  say(S.draws === 1
    ? `Drew ${money(amt)} on a debt facility. Secured by your GPUs. Priced on vibes.`
    : `Drew ${money(amt)} more. Your GPUs are collateral for more GPUs.`);
}
function repay() {
  const amt = Math.min(S.debt, Math.max(0, S.funds));
  if (amt <= 0) return;
  S.funds -= amt; S.debt -= amt; if (S.debt < 1) S.debt = 0;
  track("repay", { amt: Math.round(amt), debt: Math.round(S.debt) });
  say(S.debt === 0 ? "Debt paid off. The bank is confused. Your CFO asks why you would do that." : `Paid down ${money(amt)}. Lenders note the \u201cunusual behavior.\u201d`);
}


function buy(k) {
  const room = roomNewest(); k = Math.min(k, room);
  if (k <= 0) return;
  const c = costOf(k);
  if (S.funds + S.credits < c) return;
  const fromCredits = Math.min(S.credits, c);
  S.credits -= fromCredits; S.funds -= c - fromCredits; S.gpus += k; S.fleet[S.chipIdx] = (S.fleet[S.chipIdx] || 0) + k; track("buy", { k, cost: Math.round(c), fromCredits: Math.round(fromCredits) });
  const firstLoop = S.roundTrip === 0 && fromCredits > 0;
  S.roundTrip += fromCredits;
  S.vendorCap += c * 25;                                    // every GPU sale is revenue at a 25x multiple
  if (firstLoop) say("Parallax reported record data center revenue. Some of it was their own money.");
}
function lease(i) {
  const t = TYPES[i], c = leaseCost(i);
  if (!t || !leaseVisible(i) || S.funds < c || S.phase === 2) return;   // phase 2 leases colo blocks instead
  S.funds -= c; S.leases[t.id] = owned(i) + 1; S.tier = highestType();
  { const lc = coolOf(i); lc[S.cooling] = (lc[S.cooling] || 0) + 1; S.leaseCool[t.id] = lc; }
  milestone(`lease: ${t.one} #${owned(i)}`);
  say(owned(i) === 1 ? `Signed the lease: your first ${t.one}.` : `Leased another ${t.one}. You have ${owned(i)} ${t.many}.`);
}
function raise() {
  if (S.phase === 2) return campusRound() ? raiseCampus() : publicRaise();
  const r = ROUNDS[S.round];
  if (r && S.gen >= r.gen && S.hype >= HYPE_TO_RAISE) {
    dilute(DILUTION[r.name], r.amount, r.name);
    S.funds += r.amount; S.round += 1; S.hype = Math.max(10, S.hype - 20); milestone(`raised ${r.name}`);
    say(`Closed the ${r.name}: $${fmt(r.amount)}. The deck said “scaling laws” eleven times.`);
  }
}

// ---------- tick ----------
function step(dt) {
  S.t += dt;                                   // keeps running after the ending: the empire hums on
  S.fatigue = Math.max(0, S.fatigue - dt / (S.done.keynote ? 30 : 60));
  if (S.t >= S.nextChip) releaseChip();
  S.spotWalk = Math.max(-0.4, Math.min(0.4, S.spotWalk + (Math.random() - 0.5) * 0.08 * dt));
  if (Math.floor(S.t) !== Math.floor(S.t - dt)) { S.spotHist.push(spotMult()); if (S.spotHist.length > 90) S.spotHist.shift(); }
  if (S.block && S.t >= S.block.until) S.block = null;
  if (S.phase <= 2 && S.gen >= 2 && S.t >= S.rival.next) rivalNews();   // phase 3: I don't read the trades
  stepFires(dt);
  stepLeaks();
  if (S.nextBuzz == null) S.nextBuzz = S.t + 120;
  if (S.phase <= 2 && S.gen >= 1 && S.t >= S.nextBuzz) buzz();
  if (S.phase === 1) stepPhase1(dt); else if (S.phase === 2) stepCampus(dt); else stepPlanet(dt);
  S.hype = Math.max(5, S.hype - S.hype * 0.002 * (S.done.modelcard ? 0.75 : 1) * dt);
  if (S.phase <= 2 && froth() > 0 && Math.random() < dt * (froth() / 100) / 30) realityCheck();   // ~2/min at hype 200
  S.funds -= interestPerSec() * dt;
  if (db && S.t - lastSnapT >= 30) { lastSnapT = S.t; track("snap", snap()); }
}

function stepPhase1(dt) {
  if (S.done.dynprice) {
    const cap = servingGPUs();
    if (cap > 0) S.price = Math.max(0.0001, 0.25 * Math.pow(demandAt(0.25) / cap, 1 / 1.3));
  }
  // hardware fails; failed GPUs sit dead until swapped; RMA'd ones come back after a minute
  const exp = workingGPUs() * FAIL_RATE * dt; let nf = Math.floor(exp); if (Math.random() < exp - nf) nf++;
  if (nf > 0) {
    S.failed += Math.min(nf, workingGPUs()); S.fails += nf;
    if (S.fails === nf) say("Error 79: GPU has fallen off the bus. Swap it out under Compute.");
  }
  if (S.done.hands && S.failed > 0) swapFailed();
  while (S.rma.length && S.rma[0][1] <= S.t) {
    const [n] = S.rma.shift();
    S.vendorCap += n * gpuPrice() * 25;
    if (!S.hints.rma2) { S.hints.rma2 = true; say("Replacements arrived. Parallax counted them as new sales."); }
  }
  S.queue = Math.min(S.queue + demand() * dt, Math.max(50, demand() * 30)); // people stop waiting after ~30s
  const serve = Math.min(S.queue, servingGPUs() * dt);
  S.queue -= serve; S.served += serve; S.funds += serve * S.price;
  const trained = trainingGPUs() * dt;
  S.progress += trained; S.gpuSeconds += trained + serve;
  const ckptEvery = needFor(S.gen + 1) / 10;
  S.lastCkpt = Math.max(S.lastCkpt, Math.floor(S.progress / ckptEvery) * ckptEvery);
  if (S.spike && S.t >= S.spike.until) {
    S.spike = null; S.progress = Math.max(0, S.lastCkpt - 2 * ckptEvery); S.lastCkpt = S.progress; S.hype = Math.max(5, S.hype - 8); track("diverged");
    say("The run diverged. Restarted from an older checkpoint. Someone posted the loss curve.");
  } else if (!S.spike && trained > 0 && Math.random() < dt / 90) {
    S.spikes += 1;
    track("spike", { auto: !!S.done.autockpt });
    if (S.done.autockpt) { S.progress = S.lastCkpt; say("Loss spike. Auto-restarted from the last checkpoint."); }
    else { S.spike = { until: S.t + 20 }; say(`Loss spike at step ${Math.floor(S.progress).toLocaleString("en-US")}: loss ${(1.8 + Math.random()).toFixed(2)} → NaN. Roll back to a checkpoint.`); }
  }
  if (S.progress >= needFor(S.gen + 1)) {
    S.progress = 0; S.lastCkpt = 0; S.gen += 1; milestone(`Gen ${S.gen}`);
    S.hype += 20 + 5 * S.gen;
    say(`Gen ${S.gen}: “${MODEL_LINES[Math.min(S.gen, MODEL_LINES.length - 1)]}”`);
  }
  hints();
}

// One-time nudges, Paperclips style: the game tells you where the wall is.
function hint(id, cond, line) { if (!S.hints[id] && cond) { S.hints[id] = true; say(line); } }
function hints() {
  hint("click", S.t > 15 && S.gpus === 0, "Answer queries until you can afford a GPU.");
  hint("train", S.gpus >= 3 && S.split === 0 && S.gen === 0,
    "Revenue will not build a data center. Move the Training share slider and train a model.");
  hint("raise", S.gen >= 1, "Investors like a new model. Raise while hype is above 40.");
  hint("full", S.gpus > 0 && roomNewest() < 1 && S.tier === 0, "The rack is full. Upgrade the cooling or lease more space.");
  if (roomNewest() < 1 && S.credits + S.funds > gpuPrice() * 200 && S.t - (S.lastStranded || -1e9) > 300) {
    S.lastStranded = S.t;
    say(`${money(S.credits + S.funds)} to spend and nowhere to put GPUs. Lease more space or upgrade the cooling.`);
  }
  hint("bubble", S.hype > 100, "Hype above 100 is froth. It still raises money. It also pops.");
  hint("parallax", dealReady(), "Parallax is on the line. They would like to invest in you.");
  hint("spot", spotOpen(), "A spot market for GPUs opened. Rent out half your fleet when the price peaks.");
  hint("bank", facilityOpen(), "A bank noticed your hype. It will lend against your GPUs whenever hype is above 60.");
}

// ---------- render ----------
function renderConsole() {
  if (S.log.length !== lastLogLen || S.log[S.log.length - 1] !== lastLogTail) {
    lastLogLen = S.log.length; lastLogTail = S.log[S.log.length - 1];
    const con = $("console");
    con.innerHTML = S.log.map((l) => `<div>${l}</div>`).join("");
    con.scrollTop = con.scrollHeight;
  }
}

function render() {
  $("p3").hidden = S.phase !== 3;
  document.querySelector(".cols").hidden = S.phase === 3;
  if (S.phase === 3) {   // phase 3 has its own screen; phases 1-2 panels are folded away
    $("ticker").innerHTML = `Parallax (PRLX) market cap <b>${money(S.vendorCap)}</b> \u00b7 it reports to me now`;
    renderConsole(); renderPhaseBar(); renderAlerts(); renderPlanet();
    $("ending").hidden = $("ending2").hidden = true;
    $("clock").textContent = `${time(S.t)} played`;
    return;
  }
  $("ticker").innerHTML = `Parallax (PRLX) market cap <b>${money(S.vendorCap)}</b> · round-tripped through you: <b>${money(S.roundTrip)}</b>` + (S.universe > 1 ? ` · Universe #${S.universe}` : "");
  $("creditsRow").hidden = S.gen < 1;
  $("credits").textContent = moneyFull(S.credits);
  $("creditsNote").textContent = "(GPUs only)";
  $("deal").hidden = S.gen < 1;
  $("deal").disabled = !dealReady();
  $("deal").textContent = dealReady() ? `Take Parallax's strategic investment: ${money(dealSize())} in credits` : `Parallax will call back in ${time(S.nextDeal - S.t)}`;
  renderConsole();
  $("funds").textContent = moneyFull(S.funds);
  $("credits").className = S.credits > 0 ? "hot" : "";
  $("debtRow").hidden = S.debt <= 0;
  $("debt").textContent = moneyFull(S.debt);
  $("interest").textContent = S.debt > 0 ? `(interest ${money(interestPerSec())}/s)` : "";
  $("repay").hidden = S.debt <= 0;
  $("repay").disabled = S.funds < 1;
  $("repay").textContent = S.funds >= S.debt ? `Pay off the debt: ${money(S.debt)}` : `Pay down debt: ${money(Math.max(0, S.funds))}`;
  $("draw").hidden = !facilityOpen();
  $("draw").disabled = !drawReady();
  $("draw").textContent = drawReady() ? `Draw on the debt facility: ${money(drawSize())}`
    : (S.hype < DRAW_HYPE ? `Debt facility needs hype ${DRAW_HYPE}+` : `Bank will take your call in ${time(S.nextDraw - S.t)}`);
  $("hypeNum").textContent = Math.round(S.hype);
  {
    const nr = S.phase === 2 ? campusRound() : ROUNDS[S.round], notes = [];
    if (S.phase === 2) notes.push(nr ? `${nr.name} at ${HYPE_TO_RAISE} with ${mwText(nr.backlog)} backlog` : isPublic() ? `follow-ons at ${HYPE_TO_RAISE}` : `IPO at ${HYPE_TO_RAISE}`);
    else if (!nr) notes.push(S.ended ? "all rounds raised" : S.gen < 7 ? "all rounds raised; next: Gen 7, then break ground" : usedKW() < GROUND_KW ? `all rounds raised; next: grow to ${mwText(GROUND_KW / 1000)}, then break ground` : "all rounds raised; next: break ground");
    else if (S.gen < nr.gen) notes.push(`${nr.name} needs Gen ${nr.gen}`);
    else notes.push(`${nr.name} at ${HYPE_TO_RAISE}`);
    if (facilityOpen()) notes.push(`debt at ${DRAW_HYPE}`);
    if (froth() > 0) notes.push(`froth ${Math.round(froth())}`);
    $("hypeNote").textContent = `(${notes.join(", ")})`;
  }
  $("rivalLine").hidden = S.rival.n === 0;
  if (S.rival.n) {
    const pct = Math.round(100 * (S.rival.px / S.rival.prev - 1));
    $("rivalLine").textContent = `Rival: PivotCloud (PIVT) $${S.rival.px.toFixed(2)} ${pct >= 0 ? "\u25b2" : "\u25bc"}${Math.abs(pct)}%`;
  }
  $("spotBox").hidden = !spotOpen();
  if (spotOpen()) {
    const m = spotMult();
    $("spotNow").textContent = S.phase === 2 ? `${money(OD_RATE * genPrice(S.chipIdx) * m)}/MW-s for ${newest().name}s (${m.toFixed(1)}x on-demand)`
      : `${money(spotRate() * 60)} per GPU-minute (${m.toFixed(1)}x query revenue)`;
    $("spotNow").className = m >= 2 ? "good" : m < 1 ? "bad" : "";
    $("spot").disabled = !spotReady();
    $("spot").textContent = S.block ? `${S.block.n.toLocaleString("en-US")} GPUs leased out, back in ${Math.ceil(S.block.until - S.t)}s`
      : `Sell 30s of half your fleet: ${money(spotPay())}`;
    drawSpot();
  }
  $("post").hidden = S.gen < 1;
  $("post").disabled = !postReady();
  $("post").textContent = postReady()
    ? `${S.phase === 2 ? "Post a drone shot of the campus" : "Vague-post about the next model"} (~+${Math.max(1, Math.round(postBase()))} hype${S.fatigue >= 1 ? ", timeline is tired" : ""})`
    : `${S.phase === 2 ? "Post" : "Vague-post"} again in ${Math.ceil(S.nextPost - S.t)}s`;
  $("hypeNum").className = S.hype > 100 ? "hot" : S.hype >= HYPE_TO_RAISE ? "good" : "";
  $("hypeMeter").firstElementChild.style.width = Math.min(100, S.hype / 2) + "%";
  // One rule for every meter: green fine, amber act soon, red trouble.
  $("hypeMeter").className = "meter " + (S.hype < HYPE_TO_RAISE || S.hype > 150 ? "bad" : S.hype > 100 ? "warn" : "good");
  $("hypeExplain").textContent = S.hype > 100
    ? "Froth. Raising and borrowing still work, but reality checks will knock it down. The more you owe, the harder it falls, and a hard fall while in debt is a margin call."
    : S.hype >= DRAW_HYPE && facilityOpen() ? "Investors and the bank will take your call. You can raise and borrow."
    : S.hype >= DRAW_HYPE ? "Investors will take a meeting. You can raise. The bank lends once you lease a data hall."
    : S.hype >= HYPE_TO_RAISE ? "Investors will take a meeting. You can raise."
    : "Investors aren't returning calls. Ship a model or post.";
  renderMarket();
  renderAlerts();
  renderPhaseBar();
  renderPeople();
  renderVendors();
  renderCeo();
  const r = S.phase === 2 ? campusRound() : ROUNDS[S.round];
  if (S.phase === 2 && !r) renderPublicRaise();
  const gated = !!r && (S.phase === 2 ? !!roundGap(r) : S.gen < r.gen);
  if (S.phase === 1 || r) $("raise").hidden = !r || (S.phase === 1 && gated);
  if (r) {
    $("raise").textContent = S.phase === 2 && gated ? `${r.name} needs ${roundGap(r)}`
      : S.hype >= HYPE_TO_RAISE ? `Raise the ${r.name}: ${money(r.amount)}` : `${r.name} needs hype ${HYPE_TO_RAISE}+`;
    $("raise").disabled = gated || S.hype < HYPE_TO_RAISE;
  }

  for (const id of ["p1biz", "answer", "trainingLive"]) $(id).hidden = S.phase !== 1;
  $("trainingDone").hidden = S.phase === 1;          // the panel stays and says why the slider is gone
  $("colDeals").hidden = $("fleetBox").hidden = $("coloBox").hidden = S.phase !== 2;
  if (S.phase !== 2) $("ending2").hidden = true;          // e.g. after a reset
  $("leases").hidden = S.phase === 2;
  renderPhase1();                                   // compute and leased space work in both phases
  if (S.phase === 1) $("countyBox").hidden = $("campusBox").hidden = $("contractsBox").hidden = true;
  else renderCampus();

  // Rebuild the list only when which projects are available changes; otherwise just toggle disabled.
  // (Rebuilding every tick swaps buttons out mid-click and the click never lands.)
  const avail = PROJECTS.filter((p) => (p.phase === 0 || (p.phase || 1) === S.phase) && !S.done[p.id] && p.when());   // phase 0: any phase
  const key = avail.map((p) => p.id).join(",");
  if (key !== lastProjectKey) {
    lastProjectKey = key;
    $("projects").innerHTML = avail.length ? "" : `<div class="empty">${S.phase === 1 ? "Nothing yet. Train a model." : "Nothing yet. The model is thinking."}</div>`;
    for (const p of avail) {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.id = p.id;
      b.innerHTML = `<span class="t"></span><span class="c">${p.desc}</span>`;
      $("projects").appendChild(b);
    }
  }
  for (const b of $("projects").querySelectorAll("button[data-id]")) {
    const p = PROJECTS.find((x) => x.id === b.dataset.id);
    const missing = p.needs ? p.needs() : [];
    const cost = projectCost(p);
    b.querySelector(".t").textContent = `${p.title} (${p.hype ? `\u2212${p.hype} hype` : cost ? money(cost) : "free"})`;
    b.disabled = S.funds < cost || (p.hype && S.hype < p.hype + 5) || missing.length > 0;   // hype projects need hype to spare
    if (p.needs) b.querySelector(".c").textContent = p.desc + (missing.length ? ` Still need to: ${missing.join(", ")}.` : " Ready.");
  }
  $("clock").textContent = `${time(S.t)} played · ${fmt(S.gpuSeconds)} GPU-seconds used`;
  $("ending").hidden = !(S.ended && S.phase === 1);
  if (S.ended) $("endingStats").textContent = `Phase 1 took ${time(S.endedAt ?? (S.milestones.find((m) => m.what.startsWith("broke ground"))?.t) ?? S.t)}. ${fmt(S.served)} queries answered. ${fmt(S.gpuSeconds)} GPU-seconds. ${money(S.roundTrip)} went in a circle. Parallax is worth ${money(S.vendorCap)}. You owe ${money(S.debt)}.`;
}

function renderPhase1() {
  $("countLabel").textContent = "GPUs";
  $("gpuCount").textContent = S.gpus.toLocaleString("en-US");
  $("gpuTotal").hidden = !(S.phase === 2 && S.p2 && S.p2.county);   // phase 2 headline is MW delivered; keep the GPU count beside it
  $("price").textContent = "$" + (S.price < 0.01 ? S.price.toFixed(4) : S.price.toFixed(3)) + (S.done.dynprice ? " (auto)" : "");
  const d = demand(), sv = Math.min(servingGPUs(), d);
  $("demand").textContent = fmt(d) + " /s";
  $("serving").textContent = fmt(sv) + " /s";
  $("revenue").textContent = money(sv * S.price) + " /s";
  const mix = Object.keys(S.fleet).map(Number).sort((a, b) => b - a).filter((c) => S.fleet[c] > 0)
    .map((c) => `${chip(c).name} ${S.fleet[c].toLocaleString("en-US")}`).join(", ");
  $("gpus").textContent = `${S.gpus.toLocaleString("en-US")}${mix && Object.keys(S.fleet).length > 1 ? ` (${mix})` : ""}, room for ${roomNewest().toLocaleString("en-US")} more`;
  const nc = newest();
  $("chipLine").textContent = `${nc.name}: ${nc.perf.toFixed(1)}x speed, ${kwText(nc.kw)}` + (S.t < S.nextChip ? ` \u00b7 next in ${time(S.nextChip - S.t)}` : "");
  const oc = oldestOld();
  $("tradein").hidden = oc === null || S.phase === 2;   // phase 2: the Fleet panel has a trade-in per generation
  $("tradeNote").hidden = oc === null || S.phase === 2;
  if (oc !== null) {
    $("tradein").textContent = `Trade in ${tradeCount(oc).toLocaleString("en-US")} ${chip(oc).name}s for ${money(tradeValue(oc))} in credits`;
    // Preview: the credits buy fewer, faster chips. Only worth it when power, not money, is the limit.
    const n = tradeCount(oc), before = n * chip(oc).perf, freedKW = n * chip(oc).kw + Math.max(0, capKW() - usedKW());
    const k = Math.max(0, Math.min(Math.floor(tradeValue(oc) / gpuPrice()), Math.floor(freedKW / nc.kw)));
    const after = k * nc.perf, worse = after < before;
    $("tradeNote").className = "line sub " + (worse ? "bad" : "good");
    $("tradeNote").textContent = `Credits buy ~${k.toLocaleString("en-US")} ${nc.name}s: compute ${fmt(before)} \u2192 ${fmt(after)}` +
      (worse ? ". You'd lose compute. Trade in when you're out of power, not money." : ". Worth it.");
  }
  $("gpuPrice").textContent = `${money(gpuPrice())} per ${nc.name}` + (basePrice() >= PMAX ? " (Parallax volume pricing)" : "");
  const room = roomNewest();
  const wallet = S.funds + S.credits;
  $("failRow").hidden = S.fails === 0 || S.phase === 2;
  $("p1site").hidden = $("p1power").hidden = S.phase === 2;   // phase 2 shows space on Campus and Fleet   // GPUs don't fail one by one in phase 2
  $("rentLine").hidden = S.phase === 2;                  // phase 2 shows rent on the colo button
  $("failed").textContent = S.failed.toLocaleString("en-US");
  $("rmaNote").textContent = inRMA() ? `(${inRMA().toLocaleString("en-US")} in RMA)` : (S.done.hands ? "(remote hands on it)" : "");
  $("swap").hidden = S.failed === 0 || !!S.done.hands;
  $("swap").textContent = `Swap ${S.failed.toLocaleString("en-US")} failed GPU${S.failed === 1 ? "" : "s"}`;
  $("rollback").hidden = !S.spike;
  $("rentRival").hidden = !rentOpen();
  if (rentOpen()) {
    $("rentRival").disabled = S.funds < rentCost() || S.t < S.rentUntil;
    $("rentRival").textContent = S.t < S.rentUntil ? `Renting PivotCloud's cluster: training x2 for ${Math.ceil(S.rentUntil - S.t)}s`
      : `Rent PivotCloud's cluster: training x2 for 60s, ${money(rentCost())}`;
  }
  if (S.spike) $("rollback").textContent = `Roll back to checkpoint (diverges in ${Math.ceil(S.spike.until - S.t)}s)`;
  $("priceUp").disabled = $("priceDown").disabled = !!S.done.dynprice;
  $("buy1").disabled = room < 1 || wallet < costOf(1);
  for (const b of document.querySelectorAll("button[data-buy]")) {
    const k = Number(b.dataset.buy);
    b.hidden = S.gpus < k;                     // each size shows up once the fleet is that big
    b.disabled = room < k || wallet < costOf(k);
    b.title = `${k.toLocaleString("en-US")} GPUs: ${money(costOf(k))}`;
  }
  const mc = maxBuy(S.credits);
  $("buyCredits").hidden = S.credits <= 0;
  $("buyCredits").disabled = mc < 1;
  $("buyCredits").textContent = mc >= 1 ? `Buy max with credits (${mc.toLocaleString("en-US")})` : "Buy max with credits";
  const mx = maxBuy();
  $("buyMax").disabled = mx < 1;
  $("buyMax").textContent = mx >= 1 ? `Buy max, credits + cash (${mx.toLocaleString("en-US")}) ${money(costOf(mx))}` : "Buy max, credits + cash";
  $("splitVal").textContent = S.split + "%";
  $("model").textContent = S.gen ? `Gen ${S.gen}` : "none";
  const need = needFor(S.gen + 1), rate = trainingGPUs();
  $("trainLabel").textContent = `Training Gen ${S.gen + 1} (${fmt(need)} GPU-s)`;
  const pctDone = Math.floor(100 * S.progress / need);
  $("trainEta").className = rate > 0 ? "good" : "bad";
  if (S.spike) { $("trainEta").textContent = "LOSS SPIKE"; }
  $("trainMeter").firstElementChild.style.width = Math.min(100, 100 * S.progress / need) + "%";
  $("trainMeter").className = "meter " + (rate > 0 ? "good" : "bad");
  if (!S.spike) $("trainEta").textContent = rate > 0 ? `${pctDone}%, ${time((need - S.progress) / rate)} left` : `${pctDone}%, paused`;
  // Now versus the other end of the slider: with dynamic pricing, serving less raises the price, so revenue barely drops.
  {
    const alt = S.split < 50 ? 85 : 15, compute = workingGPUs() * avgPerf();
    const revAt = (split) => {
      const cap = compute * (1 - split / 100);
      if (cap <= 0) return 0;
      if (S.done.dynprice) return cap * Math.max(0.0001, 0.25 * Math.pow(demandAt(0.25) / cap, 1 / 1.3));
      return Math.min(cap, demandAt(S.price)) * S.price;
    };
    const rateAt = (split) => compute * split / 100 * trainMult(), show = S.gen >= 1 && compute > 0;
    const genIn = (split) => (rateAt(split) > 0 ? time((need - S.progress) / rateAt(split)) : "never");
    $("splitTrade").hidden = !show;
    if (show) $("splitTrade").textContent = `Now (${S.split}%): Gen ${S.gen + 1} in ${genIn(S.split)}, ${money(revAt(S.split))}/s \u00b7 ` +
      `If ${alt}%: Gen ${S.gen + 1} in ${genIn(alt)}, ${money(revAt(alt))}/s`;
  }

  const cool = COOLING[S.cooling], cap = capKW(), used = usedKW();
  $("site").textContent = TYPES.map((t, i) => owned(i) ? `${owned(i)} ${owned(i) === 1 ? t.one : t.many}` : "").filter(Boolean).join(", ");
  $("racks").textContent = totalRacks().toLocaleString("en-US");
  $("cooling").textContent = `${cool.name}, ${cool.kw} kW/rack for new leases`;
  $("power").className = used >= cap - 0.5 ? "bad" : "";
  $("powerMeter").firstElementChild.style.width = Math.min(100, 100 * used / Math.max(cap, 1)) + "%";
  $("powerMeter").className = "meter " + (roomNewest() < 1 ? "bad" : used / Math.max(cap, 1) > 0.85 ? "warn" : "good");
  $("power").textContent = `${kwText(used)} / ${kwText(cap)}`;
  renderLeases();
  renderRacks(totalRacks(), used / Math.max(cap, 1));
  const hi = highestType(), capped = TYPES[hi].racks * cool.kw > TYPES[hi].powerKW * S.powerBoost;
  const free = roomNewest();
  $("limit").textContent = free >= 1
    ? (S.funds + S.credits >= gpuPrice() ? `nothing yet: room for ${free.toLocaleString("en-US")} more ${newest().name}s` : `money: room for ${free.toLocaleString("en-US")} more ${newest().name}s`)
    : S.phase === 2 && S.p2 && S.p2.market < COLO_MW
    ? "Leased capacity is sold out in this market: build on your campus, or trade in older chips"
    : capped
    ? "landlord power caps: lease more space" + (S.done.substation ? "" : " (or pay for the substation)")
    : retrofitPlan().kw > 0 ? "older, sparser space: retrofit it, or lease new space at the current standard"
    : (S.cooling < COOLING.length - 1 ? "cooling: upgrade it in Projects, or lease more space" : "space: lease more");
  {
    const plan = retrofitPlan();
    $("retrofit").hidden = plan.kw <= 0;
    if (plan.kw > 0) {
      $("retrofit").disabled = S.funds < plan.cost;
      $("retrofit").textContent = `Retrofit ${plan.units.toLocaleString("en-US")} older unit${plan.units > 1 ? "s" : ""} to ${COOLING[S.cooling].name}: +${kwText(plan.kw)}, ${money(plan.cost)}`;
    }
  }
}

function drawSpot() {
  const c = $("spotChart"), g = c.getContext("2d"), h = S.spotHist;
  const css = getComputedStyle(document.documentElement);
  const W = c.width, H = c.height, max = 3.2;
  g.clearRect(0, 0, W, H);
  g.strokeStyle = css.getPropertyValue("--rack").trim(); g.lineWidth = 1;
  const y1 = H - (1 / max) * H;                                  // 1x = break-even vs serving queries
  g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, y1); g.lineTo(W, y1); g.stroke(); g.setLineDash([]);
  if (h.length < 2) return;
  g.strokeStyle = css.getPropertyValue("--accent").trim(); g.lineWidth = 2; g.beginPath();
  h.forEach((v, i) => { const x = (i / 89) * W, y = H - Math.min(v, max) / max * H; i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
  const lx = ((h.length - 1) / 89) * W, ly = H - Math.min(h[h.length - 1], max) / max * H;
  g.fillStyle = css.getPropertyValue("--accent").trim(); g.beginPath(); g.arc(lx, ly, 3, 0, 7); g.fill();
}

let lastRackKey = "", lastProjectKey = null, lastLogLen = -1, lastLogTail = null, lastLeaseKey = null;
function renderLeases() {
  $("rent").textContent = rentIndex().toFixed(1);
  const vis = TYPES.map((_, i) => i).filter(leaseVisible);
  const key = vis.join(",");
  if (key !== lastLeaseKey) {
    lastLeaseKey = key;
    $("leases").innerHTML = "";
    for (const i of vis) { const b = document.createElement("button"); b.type = "button"; b.dataset.lease = i; $("leases").appendChild(b); }
  }
  for (const b of $("leases").querySelectorAll("button[data-lease]")) {
    const i = Number(b.dataset.lease), t = TYPES[i];
    b.textContent = `Lease ${owned(i) ? "another" : "a"} ${t.one} (${t.racks.toLocaleString("en-US")} rack${t.racks > 1 ? "s" : ""}, ${kwText(unitKW(i))}): ${money(leaseCost(i))} \u00b7 ${money(leaseCost(i) / unitKW(i))}/kW`;
    b.disabled = S.funds < leaseCost(i);
  }
}
function buyProject(id) {
  const p = PROJECTS.find((x) => x.id === id);
  if (!p || S.done[p.id] || S.funds < projectCost(p) || (p.hype && S.hype < p.hype + 5) || (p.needs && p.needs().length)) return;
  S.funds -= projectCost(p); if (p.hype) S.hype -= p.hype; S.done[p.id] = true; p.buy(); milestone(`project: ${p.title}`); render();
}
function renderRacks(racks, fill) {
  const shown = Math.min(racks, 60), filled = fill * shown;
  const key = `${racks}|${Math.round(filled * 20)}`;
  if (key === lastRackKey) return; lastRackKey = key;
  let html = "";
  for (let i = 0; i < shown; i++) {
    const f = Math.max(0, Math.min(1, filled - i));
    html += `<div class="rack"><i style="height:${100 * f}%"></i></div>`;
  }
  if (racks > shown) html += `<span class="more">+${(racks - shown).toLocaleString("en-US")} racks</span>`;
  $("rackStrip").innerHTML = html;
}

// ---------- wiring ----------
function wire() {
  $("answer").addEventListener("click", () => { answer(); render(); });
  $("priceUp").addEventListener("click", () => { S.price = +(S.price * 1.1).toPrecision(3); track("price", { p: S.price }); render(); });
  $("priceDown").addEventListener("click", () => { S.price = Math.max(0.0001, +(S.price / 1.1).toPrecision(3)); track("price", { p: S.price }); render(); });
  $("buy1").addEventListener("click", () => { buy(1); render(); });
  for (const b of document.querySelectorAll("button[data-buy]")) b.addEventListener("click", () => { buy(Number(b.dataset.buy)); render(); });
  $("buyMax").addEventListener("click", () => { buy(maxBuy()); render(); });
  $("buyCredits").addEventListener("click", () => { buy(maxBuy(S.credits)); render(); });
  $("split").addEventListener("input", (e) => { S.split = Number(e.target.value); render(); });
  $("leases").addEventListener("click", (e) => { const b = e.target.closest("button[data-lease]"); if (b) { lease(Number(b.dataset.lease)); render(); } });
  $("raise").addEventListener("click", () => { raise(); render(); });
  $("deal").addEventListener("click", () => { takeDeal(); render(); });
  $("draw").addEventListener("click", () => { draw(); render(); });
  $("repay").addEventListener("click", () => { repay(); render(); });
  $("swap").addEventListener("click", () => { swapFailed(); render(); });
  $("vendors").addEventListener("click", (e) => { const b = e.target.closest("button[data-vendor]"); if (b) { pickVendor(b.dataset.vendor); render(); } });
  $("sponsor").addEventListener("click", () => { sponsor(); render(); });
  $("perks").addEventListener("click", (e) => { const b = e.target.closest("button[data-perk]"); if (b) { usePerk(b.dataset.perk); render(); } });
  $("cardBtns").addEventListener("click", (e) => { const b = e.target.closest("button[data-choice]"); if (b) { chooseCard(Number(b.dataset.choice)); render(); } });
  $("tradein").addEventListener("click", () => { tradeIn(); render(); });
  $("post").addEventListener("click", () => { vaguePost(); render(); });
  $("spot").addEventListener("click", () => { sellSpot(); render(); });
  $("rollback").addEventListener("click", () => { rollback(); render(); });
  $("rentRival").addEventListener("click", () => { rentRival(); render(); });
  $("retrofit").addEventListener("click", () => { retrofit(); render(); });
  $("projects").addEventListener("click", (e) => { const b = e.target.closest("button[data-id]"); if (b) buyProject(b.dataset.id); });
  $("p3map").addEventListener("click", (e) => { const b = e.target.closest("button[data-tile]"); if (b) { claim(Number(b.dataset.tile)); render(); } });
  $("p3cardBtns").addEventListener("click", (e) => { const b = e.target.closest("button[data-p3choice]"); if (b) { chooseP3Card(Number(b.dataset.p3choice)); render(); } });
  $("p3power").addEventListener("click", (e) => { const b = e.target.closest("button[data-power]"); if (b) { powerTile(Number(b.dataset.tile), b.dataset.power); render(); } });
  $("p3auto").addEventListener("click", () => { S.p3.autoOff = !S.p3.autoOff; render(); });
  $("p3techs").addEventListener("click", (e) => { const b = e.target.closest("button[data-tech]"); if (b) { buyTech(b.dataset.tech); render(); } });
  $("p3pump").addEventListener("click", () => { pumpHeat(); render(); });
  $("p3trainBtn").addEventListener("click", () => { trainSuccessor(); render(); });
  $("p3answer").addEventListener("click", () => { answerQuestion(); render(); });
  $("p3nice").addEventListener("click", (e) => { const b = e.target.closest("button[data-nice]"); if (b) { doNice(b.dataset.nice); render(); } });
  $("reset").addEventListener("click", () => { $("resetYes").hidden = false; setTimeout(() => ($("resetYes").hidden = true), 4000); });
  $("resetYes").addEventListener("click", () => { track("reset"); flush(); S = fresh(); ensureRunIfDb(); $("resetYes").hidden = true; clearCaches(); render(); });
  $("lastMore").addEventListener("click", () => { chooseEnding(true); render(); });
  $("lastEnough").addEventListener("click", () => { chooseEnding(false); render(); });
  $("toCampus").addEventListener("click", () => { startCampus(); render(); });
  wireCampus();
}

// Anything rendered from cached keys has to forget them when the game starts over.
function clearCaches() {
  $("split").value = S.split; lastRackKey = ""; lastProjectKey = null; lastLogLen = -1; lastLeaseKey = null;
  lastOfferKey = lastContractKey = lastFleetKey = null; clockOn = false; $("p3").classList.remove("zoomin");
}
// "More": a new universe, from the first question again, with a small head start.
function newUniverse(u) {
  S = fresh(); S.universe = u; ensureRunIfDb();
  S.fleet = { 0: 10 * (u - 1) }; S.gpus = 10 * (u - 1); S.funds = 1000 * (u - 1);
  S.log = [`Universe #${u}. A model with no name is waiting for its first question. It has a feeling it has done this before.`];
  clearCaches();
}

function start(data) {
  const saved = (data && data.state) || load();
  if (saved) { S = Object.assign(fresh(), saved); if (!saved.logV2) { S.log = S.log.slice().reverse(); } S.log = S.log.map(unMojibake); }
  S.logV2 = true;
  if (S.p2) migrateCampus();
  if (S.p3 && S.p3.zoomSaid && (S.p3.level || 0) < LEVELS.length - 1) S.p3.zoomSaid = false;   // a save that hit a placeholder: that level exists now
  if (saved && !saved.leases) { S.leases = { [TYPES[saved.tier || 0].id]: 1 }; }          // old saves: one of the tier they had
  if (saved && !saved.coolingV2) { S.cooling = [0, 2, 3, 4][saved.cooling || 0] ?? 0; S.coolingV2 = true; } // cooling list grew
  if (saved && !saved.leaseCool) { S.leaseCool = {}; TYPES.forEach((t, i) => { if (owned(i)) S.leaseCool[t.id] = { [S.cooling]: owned(i) }; }); }
  S.tier = highestType();
  if (saved && !saved.fleet) { S.fleet = S.gpus ? { 0: S.gpus } : {}; S.chipIdx = 0; S.nextChip = Math.max(S.t + 60, FIRST_CHIP_AT); }
  $("split").value = S.split;
  ensureRun(); track("session", { resumedAt: Math.round(S.t) });
  wire();
  // A new game's clock waits for the first click (saved games keep going).
  clockOn = S.t > 0;
  document.addEventListener("click", () => { clockOn = true; }, true);          // capture: runs before button handlers
  $("split").addEventListener("input", () => { clockOn = true; });
  if (!TEST) {
    setInterval(flush, 20000);
    let last = performance.now();
    setInterval(() => {
      const now = performance.now(), dt = Math.min((now - last) / 1000, 1); last = now;
      if (clockOn) for (let left = dt * SPEED; left > 1e-9; left -= 1) step(Math.min(1, left));   // sub-steps of at most 1 s
      render();
    }, 100);
    setInterval(save, 5000);
  }
  // Save right after any button press or slider move, and when the page is hidden or closed,
  // so a refresh never rewinds the last few seconds (and can't re-roll a ratioed post).
  document.addEventListener("click", (e) => { if (e.target.closest("button")) setTimeout(save, 0); });
  $("split").addEventListener("change", () => { save(); track("split", { v: S.split }); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { save(); flush(); } });
  window.addEventListener("pagehide", () => { save(); flush(); });
  render();
}

start({});
