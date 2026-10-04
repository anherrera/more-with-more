// fires.js: data center fires, phases 1 and 2 (thanks, Chris). Racks go dark for two minutes, most GPUs come
// back, some don't. Insurance pays late and remembers. State lives in S.fires.

const FIRE_EVERY = [300, 600], FIRE_DOWN = 120, FIRE_LOSS = 0.2, FIRE_SHARE = [0.05, 0.15];
const INSURANCE = 0.7, INSURANCE_DELAY = 60, PREMIUM_RATE = 0.0002;
const ROOT_CAUSES = [
  "a lithium battery in the UPS room had feelings",
  "the fire suppression system was in demo mode",
  "a bufo got into the busbar",
  "a contractor tested the generator by starting it indoors",
  "someone zip-tied a power cable to a heat pipe “for tidiness”",
  "the hot aisle was, in fact, hot",
  "a GPU was asked to summarize the fire code",
  "the thermal camera was pointed at the break room",
];

const firesOf = () => S.fires;   // created in fresh()
const firesOn = () => (S.phase === 1 ? S.gen >= 2 : S.phase === 2 && !!S.p2 && !!S.p2.county);
// r in [0, 1): where in the range this fire lands. Suppression makes them rarer; new UPS batteries make them smaller.
const fireGap = (r) => (FIRE_EVERY[0] + r * (FIRE_EVERY[1] - FIRE_EVERY[0])) * (S.done.suppression ? 2 : 1) * vendorOf().fire;
const fireShare = (r) => (FIRE_SHARE[0] + r * (FIRE_SHARE[1] - FIRE_SHARE[0])) * (S.done.ups ? 0.5 : 1);
const fireWhere = () => (S.phase === 2 && S.p2.builds.some((b) => b.kind === "hall" && b.done <= S.t)
  ? `hall ${1 + Math.floor(Math.random() * S.p2.builds.filter((b) => b.kind === "hall" && b.done <= S.t).length)}`
  : `row ${1 + Math.floor(Math.random() * 40)}`);

function startFire() {
  const f = firesOf();
  let share = fireShare(Math.random());
  if (S.phase === 2) share = Math.max(share, Math.min(1, 50000 / Math.max(1, usedKW())) * (S.done.ups ? 0.5 : 1));   // at least a hall
  const gens = {}; let n = 0, value = 0;
  for (const [g, count] of Object.entries(S.fleet)) {
    const k = Math.min(count, Math.max(1, Math.round(count * share)));
    if (count <= 0) continue;
    gens[g] = k; S.fleet[g] -= k; if (S.fleet[g] <= 0) delete S.fleet[g];
    n += k; value += k * basePrice() * chip(+g).priceMult;
  }
  if (!n) return;
  S.gpus -= n;
  const where = fireWhere();
  f.out = { gens, n, value, where, until: S.t + (S.done.firecrew ? 60 : FIRE_DOWN) }; f.n += 1;   // an on-site crew halves the downtime
  track("fire", { n });
  if (S.phase === 2) ceoStrike("a fire");
  say(`Fire in ${where}: ${n.toLocaleString("en-US")} GPUs down for about ${time(FIRE_DOWN)}. Everyone is fine. The GPUs are less fine.`);
}

function endFire() {
  const f = firesOf(), out = f.out;
  let lost = 0, lostValue = 0;
  for (const [g, k] of Object.entries(out.gens)) {
    const gone = Math.round(k * FIRE_LOSS), back = k - gone;
    lost += gone; lostValue += gone * out.value / out.n;
    S.fleet[g] = (S.fleet[g] || 0) + back; S.gpus += back;
  }
  f.out = null; f.lost += lost;
  f.payout = lostValue > 0 ? { amt: lostValue * INSURANCE, at: S.t + INSURANCE_DELAY } : null;
  say(`Incident report: ${lost.toLocaleString("en-US")} GPUs were a total loss. Root cause: ${ROOT_CAUSES[(f.n - 1) % ROOT_CAUSES.length]}.`);
}

function stepFires(dt) {
  const f = firesOf();
  if (f.out && S.t >= f.out.until) endFire();
  if (f.payout && S.t >= f.payout.at) {
    S.funds += f.payout.amt; f.premium += f.payout.amt * PREMIUM_RATE;
    say(`The insurance paid ${money(f.payout.amt)}, after the deductible. Your premium went up to ${money(f.premium)}/s. They called it “a partnership.”`);
    f.payout = null;
  }
  S.funds -= f.premium * dt;
  if (!firesOn()) return;
  if (f.next == null) f.next = S.t + fireGap(Math.random());
  if (!f.out && S.t >= f.next) { startFire(); f.next = S.t + fireGap(Math.random()); }
}

// ---------- coolant leaks (phase 2, once anything runs on liquid) ----------
// A hall goes dark while the plumbers work; some GPUs drown. Insurance excludes water. State lives in S.leaks.
const LEAK_EVERY = [240, 480], LEAK_DOWN = 60, LEAK_LOSS = 0.1;
const LEAK_CAUSES = [
  "a quick-disconnect fitting disconnected, quickly",
  "the coolant was mixed to the vendor's recipe, which was for margaritas",
  "a technician hung a jacket on a manifold",
  "the leak detection rope was still in its box, in the leak",
  "a bufo sat on a valve and would not be moved",
  "someone asked the model whether the pipes were fine and it said yes",
];
const leakGap = (r) => (LEAK_EVERY[0] + r * (LEAK_EVERY[1] - LEAK_EVERY[0])) * vendorOf().leak;
const leaksOf = () => S.leaks;   // created in fresh()
const leaksOn = () => S.phase === 2 && !!S.p2 && !!S.p2.county && ["dlc", "immersion", "twophase", "liquid"].some((k) => S.done[k]);

function startLeak() {
  const l = leaksOf();
  const share = Math.min(1, Math.max(0.05, 50000 / Math.max(1, usedKW())));   // about one hall's worth
  const gens = {}; let n = 0;
  for (const [g, count] of Object.entries(S.fleet)) {
    if (count <= 0) continue;
    const k = Math.min(count, Math.max(1, Math.round(count * share)));
    gens[g] = k; S.fleet[g] -= k; if (S.fleet[g] <= 0) delete S.fleet[g]; n += k;
  }
  if (!n) return;
  S.gpus -= n;
  const where = fireWhere(), down = S.done.leakdetect ? LEAK_DOWN / 2 : LEAK_DOWN;   // sensors find it before the floor does
  l.out = { gens, n, where, until: S.t + down }; l.n += 1;
  track("leak", { n });
  ceoStrike("a leak");
  say(`Coolant leak in ${where}: ${n.toLocaleString("en-US")} GPUs powered down for about ${time(down)}. The raised floor is now a water feature.`);
}

function endLeak() {
  const l = leaksOf(), out = l.out;
  let lost = 0;
  for (const [g, k] of Object.entries(out.gens)) {
    const gone = S.done.driptrays ? 0 : Math.round(k * LEAK_LOSS);
    lost += gone; S.fleet[g] = (S.fleet[g] || 0) + k - gone; S.gpus += k - gone;
  }
  l.out = null; l.lost += lost;
  say(`Water damage: ${lost.toLocaleString("en-US")} GPUs did not dry out. Root cause: ${LEAK_CAUSES[(l.n - 1) % LEAK_CAUSES.length]}. The insurer pointed at page 214: water is excluded.`);
}

function stepLeaks() {
  const l = leaksOf();
  if (l.out && S.t >= l.out.until) endLeak();
  if (!leaksOn()) return;
  if (l.next == null) l.next = S.t + leakGap(Math.random());
  if (!l.out && S.t >= l.next) { startLeak(); l.next = S.t + leakGap(Math.random()); }
}

// The alert line under the title: things happening right now that the console would scroll away.
function renderAlerts() {
  const f = firesOf(), out = [];
  if (f.out) out.push(`\ud83d\udd25 Fire in ${f.out.where || "the data center"}: ${f.out.n.toLocaleString("en-US")} GPUs down, back in ${time(Math.max(0, f.out.until - S.t))}`);
  const l = leaksOf();
  if (l.out) out.push(`\ud83d\udca7 Coolant leak in ${l.out.where}: ${l.out.n.toLocaleString("en-US")} GPUs down, back in ${time(Math.max(0, l.out.until - S.t))}`);
  if (S.phase === 2 && S.p2 && S.p2.town && moratoriumOn()) out.push(`Moratorium on new halls: ${time(S.p2.town.moratorium - S.t)}`);
  if (f.payout) out.push(`Insurance pays ${money(f.payout.amt)} in ${time(Math.max(0, f.payout.at - S.t))}`);
  if (S.phase === 2 && S.p2 && S.p2.county && droughtOn()) out.push(`Drought: water allocation \u2212${Math.round(100 * (1 - DROUGHT_CUT))}% for ${time(S.p2.drought.until - S.t)}`);
  // the model's last ask lives in the phase bar (model.js), not here
  if (S.phase === 3 && S.p3 && S.p3.hearingUntil > S.t) out.push(`${S.p3.level >= 3 ? "UN emergency session" : "Senate hearing"}: claims paused for ${time(S.p3.hearingUntil - S.t)}`);
  if (S.phase === 3 && S.p3 && tooWarm()) out.push(`Too warm to think: +${S.p3.heat.toFixed(2)} \u00b0C, no claims until it cools`);
  if (S.phase === 3 && S.p3) for (const t of S.p3.tiles) if (t.state === "down") out.push(`${t.disaster[0].toUpperCase() + t.disaster.slice(1)} in ${t.name}: back in ${time(t.downUntil - S.t)}`);
  if (S.phase === 3 && S.p3) for (const t of S.p3.tiles) if (t.moratorium != null && S.t < t.moratorium) out.push(`Moratorium in ${t.name}: ${time(t.moratorium - S.t)}`);
  $("alerts").hidden = !out.length;
  $("alerts").textContent = out.join(" \u00b7 ");
}
