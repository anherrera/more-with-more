// people.js: the humans. Shared by both phases: rotating decks (perks, kindnesses), cards (decisions that show up, wait
// a few seconds, and go away: the tender offer, town halls, hearings) and opposition with moratoriums (the town, the
// tiles). Phase 2's own: morale (crunch drains it, calm restores it, perks help, less each time), the town (opposition
// rises with every build, slows construction, prices land up, and can stop halls cold) and the CEO.
import { $, S, money, say, setHtml, time, track } from "./globals.js";
import { countyOf } from "./campus.js";
import { isPublic } from "./market.js";
import { firesOf, leaksOf } from "./fires.js";

// ---------- shared: decks, cards, moratoriums ----------
// A rotating deck: `n` cards from `pool` on offer, in the order they were dealt, dropping any the `ok` filter no longer
// allows; the card just `used` doesn't come straight back. Returns the new hand (ids).
export function refillDeck(hand, pool, ok, n, used) {
  const kept = hand.filter((id) => pool.some((c) => c.id === id && ok(c)));
  const rest = pool.filter((c) => ok(c) && !kept.includes(c.id) && c.id !== used);
  while (kept.length < n && rest.length) kept.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0].id);
  return kept;
}
// A card lives on its phase's state (`holder.card`) with a deadline. Its kind: { title(), text(), choices: [{ label, go }], expire() }.
export function dealCard(holder, card, secs) { if (!holder.card) holder.card = { ...card, until: S.t + secs }; }
export function takeCard(holder) { const c = holder.card; holder.card = null; return c; }
export function expireCard(holder) { const c = holder.card; if (c && S.t >= c.until) { holder.card = null; return c; } return null; }
// ids: { box, title, text, btns, data }: the card's panel and the data attribute its buttons answer with.
export function renderCard(ids, card, kind) {
  $(ids.box).hidden = !card;
  if (!card) return;
  $(ids.title).textContent = `${kind.title()} (${Math.max(0, Math.ceil(card.until - S.t))}s)`;
  $(ids.text).textContent = kind.text();
  setHtml(ids.btns, kind.choices.map((ch, i) => `<button type="button" data-${ids.data}="${i}"${i === 0 ? ' class="primary"' : ""}>${ch.label}</button>`).join(""));
}
// Opposition (0-100) passes a moratorium at 90; when it lifts after `secs`, the meter settles at 70.
// Returns "passed" or "lifted" so the caller can say its line and take its own hit, or null.
export const MORATORIUM_AT = 90, MORATORIUM_REST = 70;
export const underMoratorium = (o) => !!(o && o.moratorium != null && S.t < o.moratorium);
export function stepMoratorium(o, key, secs) {
  if (o.moratorium != null && S.t >= o.moratorium) { o.moratorium = null; o[key] = Math.min(o[key], MORATORIUM_REST); return "lifted"; }
  if (o.moratorium == null && o[key] >= MORATORIUM_AT) { o.moratorium = S.t + secs; return "passed"; }
  return null;
}

// ---------- phase 2: morale ----------

export const MORALE_START = 80, MORALE_REST = 0.08;
export const QUIT_LINES = [
  "Your head of facilities quit to start a podcast about burnout.",
  "A senior electrician left for a rival. The rival's campus is two counties over and also on fire.",
  "Your best network engineer quit to raise a seed round for “Slack, but for grief.”",
  "The construction lead left to farm alpacas. He sent a photo. The alpacas look rested.",
];

export const freshPeople = () => ({ v: MORALE_START, nextQuit: null, lastTender: -1e9 });
export const moraleOf = () => S.p2.people;   // created with the campus (startCampus) or on load (migrateCampus)
export const buildsInFlight = () => S.p2.builds.filter((b) => b.done > S.t).length;
export const lateContracts = () => S.p2.contracts.filter((c) => c.status === "late").length;
export const incidents = () => (firesOf().out ? 1 : 0) + (leaksOf().out ? 1 : 0);
// Points per second lost to crunch. A second shift halves what construction costs people.
// Crunch levels off: the twelfth build in flight hurts less than the second.
export const moraleDrain = () => (0.04 * Math.sqrt(buildsInFlight()) * (S.done.secondshift ? 0.5 : 1) + 0.12 * lateContracts() + 0.2 * incidents()) * ceoDrain();
// Builds started below 50 morale take longer, up to twice as long at zero.
export const moraleSlow = () => 1 + Math.max(0, 50 - (S.p2 && S.p2.people ? S.p2.people.v : MORALE_START)) / 50;
// Perks: three on offer at a time; using one swaps it for another. One perk per 45 s, and each helps
// less every time you repeat it (the third offsite is a Zoom call). The deck is refilled by step() and usePerk(), never by a redraw.
export const PERK_COOLDOWN = 45, PERK_FADE = 0.7;
export const PERKS = [
  { id: "pizza", name: "Pizza party", cost: 1e6, gain: 8, line: "Pizza party. People were genuinely happy, which surprised everyone." },
  { id: "dogs", name: "Bring your dog to the data center", cost: 0, gain: 6, line: "Dog day at the campus. One dog is now on the badge system." },
  { id: "standup", name: "Cancel the 7 a.m. standup", cost: 0, gain: 8, line: "You cancelled the 7 a.m. standup. Nobody noticed it was gone, which was the point." },
  { id: "vests", name: "Branded fleece vests", cost: 3e6, gain: 6, hype: 2, line: "Everyone got a vest with the logo on it. The vests are on LinkedIn now." },
  { id: "ramen", name: "Nap pods and a ramen bar", cost: 10e6, gain: 12, line: "Nap pods and a ramen bar. Productivity is down 3%. Retention is up. Someone lives in pod 4." },
  { id: "spot", name: "Spot bonuses", cost: 20e6, gain: 15, line: "Spot bonuses. Everyone checked their bank app at the same moment." },
  { id: "offsite", name: "Offsite in Tahoe", cost: 15e6, gain: 25, slip: 30,
    line: "Offsite in Tahoe: trust falls, a hot tub, one sprained ankle. Everything under construction slipped 30 s." },
  { id: "pto", name: "Unlimited PTO", cost: 0, gain: 4, line: "You announced unlimited PTO. Nobody has taken a day since." },
  { id: "happiness", name: "Hire a chief happiness officer", cost: 5e6, gain: 3, line: "The chief happiness officer scheduled a mandatory joy workshop. It's on Saturday." },
  { id: "rsu", name: "RSU refresh", cost: 100e6, gain: 30, when: () => isPublic(), line: "RSU refresh. The golden handcuffs got a fresh polish. Morale is up and so is the vesting schedule." },
];
export const perkOf = (id) => PERKS.find((p) => p.id === id);
export const perkWait = () => Math.max(0, (moraleOf().perkAt ?? -1e9) + PERK_COOLDOWN - S.t);
export const perkGain = (p) => p.gain * Math.pow(PERK_FADE, (moraleOf().perkUses || {})[p.id] || 0);
export function offeredPerks(used) {   // used: the perk just spent, which doesn't come straight back
  const m = moraleOf();
  m.perks = refillDeck(m.perks || [], PERKS, (p) => !p.when || p.when(), 3, used);
  return m.perks;
}
export function usePerk(id) {
  const m = moraleOf(), p = perkOf(id);
  if (!p || (p.when && !p.when()) || S.funds < p.cost || perkWait() > 0) return;
  S.funds -= p.cost;
  m.v = Math.min(100, m.v + perkGain(p));
  m.perkUses = m.perkUses || {}; m.perkUses[id] = (m.perkUses[id] || 0) + 1; m.perkN = (m.perkN || 0) + 1; m.perkAt = S.t;
  if (p.hype) S.hype += p.hype;
  if (p.slip) for (const b of S.p2.builds) if (b.done > S.t) b.done += p.slip;
  m.perks = (m.perks || []).filter((x) => x !== id); offeredPerks(id);
  track("perk", { id });
  say(p.line);
}

export function moraleCause() {
  const bits = [], b = buildsInFlight(), l = lateContracts(), i = incidents();
  if (b) bits.push(`${b} build${b > 1 ? "s" : ""} in flight`);
  if (l) bits.push(`${l} late contract${l > 1 ? "s" : ""}`);
  if (i) bits.push("an incident on the floor");
  if (!bits.length) return "Calm. People are taking lunch.";
  return "Crunch: " + bits.join(", ") + (moraleSlow() > 1 ? `. New builds take ${moraleSlow().toFixed(1)}× as long.` : ".");
}

// ---------- temporary cards ----------
export const CARDS = {
  tender: {
    secs: 30,
    title: () => "Tender offer",
    text: () => "Parallax will buy employee shares at the last round's price. Nobody dilutes. Several engineers have already picked out boats.",
    choices: [
      { label: "Approve the tender", go: () => { moraleOf().v = Math.min(100, moraleOf().v + 35); S.hype += 3;
        say("Tender offer closed. Morale is up. Three engineers bought boats. One named his after the model."); } },
      { label: "Not now", go: () => tenderNo() },
    ],
    expire: () => tenderNo(),
  },
};
export function tenderNo() {
  moraleOf().v = Math.max(0, moraleOf().v - 5);
  say("The tender offer quietly died. Everyone saw the email anyway.");
}
export function openCard(kind) { dealCard(S.p2, { kind }, CARDS[kind].secs); }
export function chooseCard(i) {
  const c = S.p2 && S.p2.card && takeCard(S.p2);
  if (!c) return;
  CARDS[c.kind].choices[i].go();
  track("card", { kind: c.kind, choice: i });
}

// ---------- the town ----------
export const TOWN_RISE = { hall: 4, turbine: 2, well: 3, solar: 0, reclaimed: 0 }, TOWN_EASE = 0.04, MORATORIUM_SECS = 120;   // the county's: two minutes
export const freshTown = () => ({ v: countyOf() ? countyOf().town : 20, jobs: 0, promises: 0, nextHall: null, moratorium: null });
export const townOf = () => S.p2.town;   // created when the county is picked (chooseCounty) or on load (migrateCampus)
export const moratoriumOn = () => underMoratorium(S.p2.town);
// Builds started above 50 opposition take longer: permits, lawsuits, a guy with a sign.
export const townSlow = () => 1 + Math.max(0, (S.p2 && S.p2.town ? S.p2.town.v : 0) - 50) / 50;
export function townBuilt(kind) {
  const t = townOf();
  // The town gets used to you: every finished build makes the next one a little less of an event.
  const familiar = 1 / (1 + S.p2.builds.filter((b) => b.done <= S.t).length / 20);
  t.v = Math.min(100, t.v + (TOWN_RISE[kind] || 0) * countyOf().rise * (S.done.cba2 ? 0.5 : 1) * familiar);
}
// Sponsorships: press any time; each costs double the last and helps a bit less. Late-game money still buys goodwill.
export const SPONSOR_COOLDOWN = 60;   // sponsorships: one a minute, flat prices
/** @type {[string, number][]} */
export const SPONSORED = [["the county fair", 3e6], ["the Little League team", 1e6], ["a new fire truck", 2e6], ["the library's 3D printer", 1e6],
  ["the Fourth of July fireworks", 2e6], ["a splash pad", 3e6], ["the high school's prom", 1e6], ["a mural of the model, which the model designed", 5e6]];
export const sponsorNext = () => SPONSORED[(townOf().sponsors || 0) % SPONSORED.length];
export const sponsorCost = () => sponsorNext()[1];
export const sponsorGain = () => 10;
export const sponsorWait = () => Math.max(0, (townOf().sponsorAt ?? -1e9) + SPONSOR_COOLDOWN - S.t);
export function sponsor() {
  const t = townOf();
  if (S.funds < sponsorCost() || sponsorWait() > 0) return;
  S.funds -= sponsorCost();
  const gain = sponsorGain(), what = sponsorNext()[0];
  t.v = Math.max(0, t.v - gain); t.sponsors = (t.sponsors || 0) + 1; t.sponsorAt = S.t;
  say(`You sponsored ${what}. Your logo is on it now. Opposition −${Math.round(gain)}.`);
}

export function townCause() {
  const t = townOf();
  const jobs = t.jobs ? `Jobs promised: ${Math.round(t.jobs).toLocaleString("en-US")}. Jobs delivered: 41.` : "";
  const mood = t.v >= 90 ? "They're voting on a moratorium." : t.v >= 50 ? `Lawsuits and yard signs: builds take ${townSlow().toFixed(1)}× as long, land costs more.`
    : "Mostly curious. Some yard signs.";
  const how = t.v >= 50 ? "Lower it: sponsor something, show up to town halls, or ease off building." : "";
  return [mood, how, jobs].filter(Boolean).join(" ");
}
CARDS.townhall = {
  secs: 20,
  title: () => "Town hall tonight",
  text: () => "The high school gym is full. Someone brought a poster of a dead fish. Pick your answer.",
  choices: [
    { label: "Promise jobs", go: () => { const t = townOf(); t.v = Math.max(0, t.v - 15 / (1 + 0.3 * t.promises)); t.promises += 1;
      const n = Math.round(400 + Math.random() * 1100); t.jobs += n;
      say(`You promised ${n.toLocaleString("en-US")} jobs. A data center needs about 41. Applause, mostly.`); } },
    { label: "Fund the robotics team ($2M)", go: () => { S.funds -= 2e6; townOf().v = Math.max(0, townOf().v - 10);
      say("You funded the high school robotics team. Their robot is named after you. It is also a protest robot."); } },
    { label: "Send the model to answer questions", go: () => {
      if (Math.random() < 0.5) { townOf().v = Math.max(0, townOf().v - 20); say("The model answered every question patiently, in Spanish and English. The room was won over. This is somehow worse."); }
      else { townOf().v = Math.min(100, townOf().v + 15); say("The model called a retiree's well “legacy infrastructure.” It was trending by morning."); }
    } },
  ],
  expire: () => { townOf().v = Math.min(100, townOf().v + 10); say("Nobody from the company showed up to the town hall. The empty chair got a standing ovation."); },
};

export function stepTown(dt) {
  const t = townOf(), base = countyOf().town;
  if (t.v > base) t.v = Math.max(base, t.v - TOWN_EASE * dt);
  const mor = stepMoratorium(t, "v", MORATORIUM_SECS);
  if (mor === "lifted") say("The moratorium expired. The county board voted 3–2 to “revisit it,” which means no.");
  if (mor === "passed") {
    ceoStrike("a moratorium");
    say(`The county passed a moratorium on new data center halls. ${time(MORATORIUM_SECS)}, or until the next election, whichever comes first.`);
    say("Your board's statement: \u201cWe've signed the principles.\u201d Nobody asked which principles.");
  }
  if (!S.p2.builds.some((b) => b.kind === "hall")) return;
  if (t.nextHall == null) t.nextHall = S.t + 180 + Math.random() * 120;
  if (!S.p2.card && S.t >= t.nextHall) { t.nextHall = S.t + 180 + Math.random() * 120; openCard("townhall"); }
}

export function stepPeople(dt) {
  const m = moraleOf(), drain = moraleDrain();
  offeredPerks();
  m.v = Math.max(0, Math.min(100, m.v + (MORALE_REST - drain) * dt));
  if (m.v < 25) {
    if (m.nextQuit == null) m.nextQuit = S.t + 60;
    if (S.t >= m.nextQuit) {
      m.nextQuit = S.t + 60 + Math.random() * 60;
      for (const b of S.p2.builds) if (b.done > S.t) b.done += 30;   // the people who knew how it worked
      say(QUIT_LINES[Math.floor(Math.random() * QUIT_LINES.length)] + " Everything under construction slipped 30 s.");
    }
  } else m.nextQuit = null;
  const gone = expireCard(S.p2);
  if (gone) (CARDS[gone.kind].expire || (() => {}))();
  stepTown(dt);
  if (!S.p2.card && m.v < 45 && !isPublic() && S.t - m.lastTender > 600) { m.lastTender = S.t; openCard("tender"); }
}

export function renderPeople() {
  const on = S.phase === 2 && !!S.p2 && !!S.p2.county;
  $("moraleBox").hidden = !on;
  $("townBox").hidden = !on;
  const c = on && S.p2.card;
  // Town halls show up in Community; everything else in the deals column.
  if (c && c.kind === "townhall") { if ($("card").parentElement !== $("townBox")) $("townBox").appendChild($("card")); }
  else if ($("card").parentElement !== $("colDeals")) $("colDeals").prepend($("card"));
  if (!on) return;
  const m = moraleOf();
  $("morale").textContent = Math.round(m.v);
  $("moraleMeter").firstElementChild.style.width = m.v + "%";
  $("moraleMeter").className = "meter " + (m.v < 25 ? "bad" : m.v < 50 ? "warn" : "good");
  $("moraleCause").textContent = moraleCause();
  const wait = perkWait();
  setHtml("perks", (m.perks || []).map((id) => { const p = perkOf(id);
    return `<button type="button" data-perk="${id}">${p.name} (+${Math.round(perkGain(p))}): ${p.cost ? money(p.cost) : "free"}</button>`; }).join("")
    + (wait > 0 ? `<span class="sub"> next perk in ${Math.ceil(wait)}s</span>` : ""));
  for (const btn of $("perks").querySelectorAll("button")) btn.disabled = wait > 0 || m.v >= 100 || S.funds < perkOf(btn.dataset.perk).cost;
  const t = townOf();
  $("town").textContent = Math.round(t.v);
  $("townMeter").firstElementChild.style.width = t.v + "%";
  $("townMeter").className = "meter " + (t.v >= 75 ? "bad" : t.v >= 50 ? "warn" : "good");
  $("townCause").textContent = townCause();
  $("sponsor").textContent = sponsorWait() > 0 ? `Sponsor something: again in ${Math.ceil(sponsorWait())}s`
    : `Sponsor ${sponsorNext()[0]} (\u2212${sponsorGain()} opposition): ${money(sponsorCost())}`;
  $("sponsor").disabled = S.funds < sponsorCost() || t.v <= 0 || sponsorWait() > 0;
  renderCard(P2_CARD, c, c && CARDS[c.kind]);
}
export const P2_CARD = { box: "card", title: "cardTitle", text: "cardText", btns: "cardBtns", data: "choice" };

// ---------- CEO churn: three crises and the board brings in someone new. New CEO, who dis? ----------
export const CEO_STRIKES = 3, CEO_COOLDOWN = 480;
export const MANDATES = {
  visionary: { title: "a visionary", build: 1.1, slow: 1, fee: 1, drain: 1, hype: 20,
    effect: "hype +20, builds cost 10% more (everything is gold-plated)",
    hello: "says the campus is “a cathedral.” Hype +20. The cathedral has marble floors now." },
  costcutter: { title: "a cost-cutter", build: 0.85, slow: 1, fee: 1, drain: 1.5, hype: 0,
    effect: "builds cost 15% less, crunch hits morale 1.5× harder",
    hello: "cancelled the snack budget on day one. Builds are cheaper. Nobody is smiling." },
  hyperscaler: { title: "an ex-hyperscaler exec", build: 1, slow: 1.2, fee: 1.1, drain: 1, hype: 0,
    effect: "contracts pay 10% more, builds 20% slower (process)",
    hello: "brought 400 slides of process. Customers love it. Every build needs three more sign-offs." },
};
export const CEO_NAMES = ["Brentley Vance", "Dana Okafor-Reyes", "Chip Hollister", "Margaux Lindqvist", "Tad Pemberton III", "Priya Castellano", "Rex Moldova"];
export const freshCeo = () => ({ n: 0, strikes: 0, mandate: null, name: "you", lastAt: -1e9 });
export const ceoOf = () => S.p2.ceo;   // created with the campus (startCampus) or on load (migrateCampus)
export const mandate = () => (S.phase === 2 && S.p2 && S.p2.ceo && S.p2.ceo.mandate ? MANDATES[S.p2.ceo.mandate] : null);
export const ceoBuild = () => (mandate() ? mandate().build : 1);
export const ceoSlow = () => (mandate() ? mandate().slow : 1);
export const ceoFee = () => (mandate() ? mandate().fee : 1);
export const ceoDrain = () => (mandate() ? mandate().drain : 1);
export function ceoStrike(why) {
  if (S.phase !== 2 || !S.p2 || !S.p2.county || (S.p2.model && S.p2.model.endedAt != null)) return;
  const c = ceoOf();
  if (S.t - c.lastAt < CEO_COOLDOWN) return;   // the board just did this; it needs a quarter to forget
  c.strikes += 1;
  if (c.strikes < CEO_STRIKES) { if (c.strikes === CEO_STRIKES - 1) say(`After ${why}, the board scheduled a “quick sync.” Nobody schedules a quick sync.`); return; }
  const keys = Object.keys(MANDATES).filter((k) => k !== c.mandate), k = keys[Math.floor(Math.random() * keys.length)];
  const name = CEO_NAMES[c.n % CEO_NAMES.length], old = c.name;
  c.n += 1; c.strikes = 0; c.mandate = k; c.name = name; c.lastAt = S.t;
  S.hype += MANDATES[k].hype;
  track("ceo", { n: c.n, mandate: k });
  say(`New CEO, who dis? The board replaced ${old === "you" ? "you (you're “Founder & Chief Vibes Officer” now)" : old} with ${name}, ${MANDATES[k].title}.`);
  say(`${name} ${MANDATES[k].hello}`);
}
export function renderCeo() {
  const on = S.phase === 2 && !!S.p2 && !!S.p2.county;
  $("ceoLine").hidden = !on;
  if (!on) return;
  const c = ceoOf(), m = mandate(), left = CEO_STRIKES - c.strikes;
  const patience = c.strikes ? ` Board patience: ${left} more ${left === 1 ? "crisis" : "crises"}.` : m ? "" : " The board is happy, for now.";
  $("ceoLine").textContent = (m ? `CEO: ${c.name}, ${m.title}: ${m.effect}.` : "CEO: you, the founder.") + patience;
}
