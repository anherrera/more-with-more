// market.js: the cap table, the IPO (right after Series E), the public stock, follow-ons, lockup and secondaries.
// Ownership = founder shares / all shares. Every raise mints shares; secondaries move your shares into your pocket.

const DILUTION = { "Pre-seed": 0.10, Seed: 0.15, "Series A": 0.20, "Series B": 0.15, "Series C": 0.12, "Series D": 0.10, "Series E": 0.08 };
const REV_MULTIPLE = 20000, IPO_FLOAT = 0.10, IPO_DISCOUNT = 0.85, LOCKUP = 120;
const IPO_BACKLOG = 400, IPO_CAMPUS = 600;
const FOLLOW_ON = 0.08, FOLLOW_ON_EVERY = 300, SECONDARY = 0.01, SECONDARY_EVERY = 60;

// Saves from before the cap table: rebuild it from the rounds already raised.
function deriveCap() {
  const c = { shares: 1e9, founder: 1e9, liquidity: 0, lastVal: 0 };
  const raised = ROUNDS.slice(0, S.round).map((r) => r.name).concat(S.p2 && S.p2.round ? ["Series E"] : []);
  for (const name of raised) c.shares /= 1 - DILUTION[name];
  const last = ROUNDS[S.round - 1];
  if (last) c.lastVal = last.amount / DILUTION[last.name];
  return c;
}
const capOf = () => S.cap || (S.cap = deriveCap());
const ownership = () => capOf().founder / capOf().shares;

// Mint shares for a raise: the new holders get `fraction` of the company after the round.
function dilute(fraction, amount, name) {
  const c = capOf(), before = c.shares;
  c.shares = before / (1 - fraction);
  c.lastVal = amount / fraction;
  if (name) {
    const pref = amount / (c.shares - before);
    say(`New 409A for the ${name}: employee options priced at ${money(pref * 0.1)} a share. The ${name} paid ${money(pref)}. Everyone agrees this is normal.`);
  }
}

// ---- the public company ----
// Game-scale valuation: ~30,000 seconds of revenue, times hype. (Real multiples would make the IPO dwarf the whole economy.)
const fundamentalCap = () => Math.max(capOf().lastVal, (S.phase === 2 ? campusRevenue() : 0) * REV_MULTIPLE * (0.5 + S.hype / 100));
// The classic arc: priced below range, pops 300% on day one, gives back 60%, settles.
function ipoArc(tau) {
  if (tau < 60) return 0.85 + (3.4 - 0.85) * tau / 60;
  if (tau < 360) return 3.4 - (3.4 - 1.36) * (tau - 60) / 300;
  if (tau < 660) return 1.36 - 0.36 * (tau - 360) / 300;
  return 1;
}
const isPublic = () => !!(S.p2 && S.p2.ipo);
const stockPrice = () => {
  const ipo = S.p2.ipo;
  return fundamentalCap() / capOf().shares * ipoArc(S.t - ipo.at) * ipo.walk * ipo.shock;
};
const marketCap = () => (isPublic() ? stockPrice() * capOf().shares : fundamentalCap());

const ipoGap = () => backlogMW() < IPO_BACKLOG ? `${mwText(IPO_BACKLOG)} of signed backlog (have ${mwText(backlogMW())})`
  : energizedAt() < IPO_CAMPUS ? `${mwText(IPO_CAMPUS)} of campus (have ${mwText(energizedAt())})` : null;

function ringTheBell() {
  if (isPublic() || ipoGap() || S.hype < HYPE_TO_RAISE) return;
  const c = capOf(), px = IPO_DISCOUNT * fundamentalCap() / c.shares, fresh = c.shares * IPO_FLOAT / (1 - IPO_FLOAT);
  S.p2.ipo = { at: S.t, px0: px, walk: 1, shock: 1, lastFollowOn: -1e9, lastSecondary: -1e9, lockupSaid: false };
  c.shares += fresh; S.funds += fresh * px;
  milestone("IPO"); track("ipo", { proceeds: Math.round(fresh * px) });
  say(`You rang the bell. MORE priced at ${money(px)}, below the range. The bankers call that “leaving room for the pop.” The pop is for their other clients.`);
}

function followOn() {
  const ipo = S.p2.ipo;
  if (!isPublic() || S.t < ipo.lastFollowOn + FOLLOW_ON_EVERY || S.hype < HYPE_TO_RAISE) return;
  const amt = FOLLOW_ON * marketCap();
  dilute(FOLLOW_ON, amt, null); capOf().lastVal = 0;
  S.funds += amt; ipo.lastFollowOn = S.t; ipo.shock *= 0.95; S.hype = Math.max(10, S.hype - 10);
  track("followon", { amt: Math.round(amt) });
  say(`Follow-on offering: ${money(amt)}. The stock dipped 5%. The analyst notes say “accretive,” which nobody can define.`);
}

function sellSecondary() {
  const ipo = S.p2.ipo, c = capOf();
  if (!isPublic() || S.t < ipo.at + LOCKUP || S.t < ipo.lastSecondary + SECONDARY_EVERY) return;
  const n = c.founder * SECONDARY, px = stockPrice();
  c.founder -= n; c.liquidity += n * px; ipo.lastSecondary = S.t; ipo.shock *= 0.98;
  track("secondary", { amt: Math.round(n * px) });
  say(`Sold ${money(n * px)} of your own stock. The company got nothing. A boat broker has already called.`);
}

function stepMarket(dt) {
  if (!isPublic()) return;
  const ipo = S.p2.ipo;
  ipo.walk = Math.max(0.8, Math.min(1.25, ipo.walk + (Math.random() - 0.5) * 0.02 * dt));
  ipo.shock += (1 - ipo.shock) * 0.005 * dt;                                    // dips recover slowly
  if (!ipo.lockupSaid && S.t >= ipo.at + LOCKUP) {
    ipo.lockupSaid = true; ipo.shock *= 0.85;
    say("MORE's lockup expired. The stock fell 15%. Early employees are learning what a Lamborghini dealer's financing office looks like. You can sell now too.");
  }
}

function renderMarket() {
  const c = capOf();
  $("ownLine").textContent = `You own ${(100 * ownership()).toFixed(1)}%` + (c.liquidity > 0 ? ` · your liquidity: ${money(c.liquidity)}` : "");
  const pub = isPublic();
  $("stockLine").hidden = !pub; $("secondary").hidden = !pub;
  if (!pub) return;
  const ipo = S.p2.ipo, px = stockPrice(), since = Math.round(100 * (px / ipo.px0 - 1));
  $("stockLine").textContent = `MORE $${px.toFixed(2)} ${since >= 0 ? "▲" : "▼"}${Math.abs(since)}% since IPO · market cap ${money(marketCap())}`;
  const locked = S.t < ipo.at + LOCKUP, cool = S.t < ipo.lastSecondary + SECONDARY_EVERY;
  $("secondary").disabled = locked || cool;
  $("secondary").textContent = locked ? `Sell some of your shares (after lockup, in ${time(ipo.at + LOCKUP - S.t)})`
    : cool ? `Sell again in ${Math.ceil(ipo.lastSecondary + SECONDARY_EVERY - S.t)}s`
    : `Sell 1% of your shares: ${money(c.founder * SECONDARY * px)} to you, $0 to the company`;
}

// Phase 2's raise button after Series E: the IPO, then follow-ons.
function renderPublicRaise() {
  const b = $("raise");
  b.hidden = false;
  if (!isPublic()) {
    const gap = ipoGap();
    b.textContent = gap ? `IPO needs ${gap}` : S.hype < HYPE_TO_RAISE ? `IPO needs hype ${HYPE_TO_RAISE}+` : `Ring the bell: IPO (sell ${IPO_FLOAT * 100}% at ~${money(IPO_DISCOUNT * fundamentalCap() * IPO_FLOAT / (1 - IPO_FLOAT))})`;
    b.disabled = !!gap || S.hype < HYPE_TO_RAISE;
    return;
  }
  const ipo = S.p2.ipo, wait = ipo.lastFollowOn + FOLLOW_ON_EVERY - S.t;
  b.textContent = wait > 0 ? `Follow-on offering again in ${time(wait)}` : S.hype < HYPE_TO_RAISE ? `Follow-on needs hype ${HYPE_TO_RAISE}+`
    : `Follow-on offering: ${money(FOLLOW_ON * marketCap())} (dilutes you ${FOLLOW_ON * 100}%)`;
  b.disabled = wait > 0 || S.hype < HYPE_TO_RAISE;
}
const publicRaise = () => (isPublic() ? followOn() : ringTheBell());

function wireMarket() {
  $("secondary").addEventListener("click", () => { sellSecondary(); render(); });
}
