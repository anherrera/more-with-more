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

const firesOf = () => S.fires || (S.fires = { next: null, out: null, payout: null, premium: 0, n: 0, lost: 0 });
const firesOn = () => (S.phase === 1 ? S.gen >= 2 : S.phase === 2 && !!S.p2 && !!S.p2.county);
// r in [0, 1): where in the range this fire lands. Suppression makes them rarer; new UPS batteries make them smaller.
const fireGap = (r) => (FIRE_EVERY[0] + r * (FIRE_EVERY[1] - FIRE_EVERY[0])) * (S.done.suppression ? 2 : 1);
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
  f.out = { gens, n, value, until: S.t + (S.done.firecrew ? 60 : FIRE_DOWN) }; f.n += 1;   // an on-site crew halves the downtime
  track("fire", { n });
  say(`Fire in ${fireWhere()}: ${n.toLocaleString("en-US")} GPUs down for about ${time(FIRE_DOWN)}. Everyone is fine. The GPUs are less fine.`);
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
