// people.js: the humans of phase 2. Morale (crunch drains it, calm restores it, pizza helps less every time) and
// temporary cards: decisions that show up, wait a few seconds, and go away (the tender offer, town halls). Also the
// town: community opposition rises with every build, slows construction, prices land up, and can stop halls cold.

const MORALE_START = 80, MORALE_REST = 0.08;
const QUIT_LINES = [
  "Your head of facilities quit to start a podcast about burnout.",
  "A senior electrician left for a rival. The rival's campus is two counties over and also on fire.",
  "Your best network engineer quit to raise a seed round for “Slack, but for grief.”",
  "The construction lead left to farm alpacas. He sent a photo. The alpacas look rested.",
];

const moraleOf = () => S.p2.people || (S.p2.people = { v: MORALE_START, pizzas: 0, nextQuit: null, lastTender: -1e9 });
const buildsInFlight = () => S.p2.builds.filter((b) => b.done > S.t).length;
const lateContracts = () => S.p2.contracts.filter((c) => c.status === "late").length;
const incidents = () => (firesOf().out ? 1 : 0) + (leaksOf().out ? 1 : 0);
// Points per second lost to crunch. A second shift halves what construction costs people.
const moraleDrain = () => 0.03 * buildsInFlight() * (S.done.secondshift ? 0.5 : 1) + 0.12 * lateContracts() + 0.2 * incidents();
// Builds started below 50 morale take longer, up to twice as long at zero.
const moraleSlow = () => 1 + Math.max(0, 50 - (S.p2 && S.p2.people ? S.p2.people.v : MORALE_START)) / 50;
const pizzaCost = () => 500000 * Math.pow(2, moraleOf().pizzas);
const pizzaGain = () => 10 / (1 + 0.6 * moraleOf().pizzas);

function pizzaParty() {
  const m = moraleOf();
  if (S.funds < pizzaCost()) return;
  S.funds -= pizzaCost();
  const gain = pizzaGain();
  m.v = Math.min(100, m.v + gain); m.pizzas += 1;
  say(m.pizzas === 1 ? "Pizza party. People were genuinely happy, which surprised everyone."
    : `Pizza party number ${m.pizzas}. Someone asked whether the pizza counts as compensation. It does, legally.`);
}

function moraleCause() {
  const bits = [], b = buildsInFlight(), l = lateContracts(), i = incidents();
  if (b) bits.push(`${b} build${b > 1 ? "s" : ""} in flight`);
  if (l) bits.push(`${l} late contract${l > 1 ? "s" : ""}`);
  if (i) bits.push("an incident on the floor");
  if (!bits.length) return "Calm. People are taking lunch.";
  return "Crunch: " + bits.join(", ") + (moraleSlow() > 1 ? `. New builds take ${moraleSlow().toFixed(1)}× as long.` : ".");
}

// ---------- temporary cards ----------
const CARDS = {
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
function tenderNo() {
  moraleOf().v = Math.max(0, moraleOf().v - 5);
  say("The tender offer quietly died. Everyone saw the email anyway.");
}
function openCard(kind) {
  S.p2.card = { kind, until: S.t + CARDS[kind].secs };
}
function chooseCard(i) {
  const c = S.p2 && S.p2.card;
  if (!c) return;
  S.p2.card = null;
  CARDS[c.kind].choices[i].go();
  track("card", { kind: c.kind, choice: i });
}

// ---------- the town ----------
const TOWN_RISE = { hall: 4, turbine: 2, well: 3, solar: 1, reclaimed: 0 }, TOWN_EASE = 0.02, MORATORIUM_SECS = 120;
const townOf = () => S.p2.town || (S.p2.town = { v: countyOf() ? countyOf().town : 20, jobs: 0, promises: 0, nextHall: null, moratorium: null });
const moratoriumOn = () => !!(S.p2.town && S.p2.town.moratorium != null && S.t < S.p2.town.moratorium);
// Builds started above 50 opposition take longer: permits, lawsuits, a guy with a sign.
const townSlow = () => 1 + Math.max(0, (S.p2 && S.p2.town ? S.p2.town.v : 0) - 50) / 50;
function townBuilt(kind) {
  const t = townOf();
  t.v = Math.min(100, t.v + (TOWN_RISE[kind] || 0) * countyOf().rise * (S.done.cba2 ? 0.5 : 1));
}
// Sponsorships: press any time; each costs double the last and helps a bit less. Late-game money still buys goodwill.
const SPONSORED = ["the county fair", "the Little League team", "a new fire truck", "the library's 3D printer",
  "the Fourth of July fireworks", "a splash pad", "the high school's prom", "a mural of the model, which the model designed"];
const sponsorCost = () => 2e6 * Math.pow(2, townOf().sponsors || 0);
const sponsorGain = () => 12 / (1 + 0.4 * (townOf().sponsors || 0));
function sponsor() {
  const t = townOf();
  if (S.funds < sponsorCost()) return;
  S.funds -= sponsorCost();
  const gain = sponsorGain(), what = SPONSORED[(t.sponsors || 0) % SPONSORED.length];
  t.v = Math.max(0, t.v - gain); t.sponsors = (t.sponsors || 0) + 1;
  say(`You sponsored ${what}. Your logo is on it now. Opposition −${Math.round(gain)}.`);
}

function townCause() {
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

function stepTown(dt) {
  const t = townOf(), base = countyOf().town;
  if (t.v > base) t.v = Math.max(base, t.v - TOWN_EASE * dt);
  if (t.moratorium != null && S.t >= t.moratorium) {
    t.moratorium = null; t.v = Math.min(t.v, 70);
    say("The moratorium expired. The county board voted 3–2 to “revisit it,” which means no.");
  }
  if (t.moratorium == null && t.v >= 90) {
    t.moratorium = S.t + MORATORIUM_SECS;
    say(`The county passed a moratorium on new data center halls. ${time(MORATORIUM_SECS)}, or until the next election, whichever comes first.`);
  }
  if (!S.p2.builds.some((b) => b.kind === "hall")) return;
  if (t.nextHall == null) t.nextHall = S.t + 180 + Math.random() * 120;
  if (!S.p2.card && S.t >= t.nextHall) { t.nextHall = S.t + 180 + Math.random() * 120; openCard("townhall"); }
}

function stepPeople(dt) {
  const m = moraleOf(), drain = moraleDrain();
  m.v = Math.max(0, Math.min(100, m.v + (MORALE_REST - drain) * dt));
  if (m.v < 25) {
    if (m.nextQuit == null) m.nextQuit = S.t + 60;
    if (S.t >= m.nextQuit) {
      m.nextQuit = S.t + 60 + Math.random() * 60;
      for (const b of S.p2.builds) if (b.done > S.t) b.done += 30;   // the people who knew how it worked
      say(QUIT_LINES[Math.floor(Math.random() * QUIT_LINES.length)] + " Everything under construction slipped 30 s.");
    }
  } else m.nextQuit = null;
  const c = S.p2.card;
  if (c && S.t >= c.until) { S.p2.card = null; (CARDS[c.kind].expire || (() => {}))(); }
  stepTown(dt);
  if (!S.p2.card && m.v < 45 && !isPublic() && S.t - m.lastTender > 600) { m.lastTender = S.t; openCard("tender"); }
}

function renderPeople() {
  const on = S.phase === 2 && !!S.p2 && !!S.p2.county;
  $("moraleBox").hidden = !on;
  const c = on && S.p2.card;
  $("card").hidden = !c;
  if (!on) return;
  const m = moraleOf();
  $("morale").textContent = Math.round(m.v);
  $("moraleMeter").firstElementChild.style.width = m.v + "%";
  $("moraleMeter").className = "meter " + (m.v < 25 ? "bad" : m.v < 50 ? "warn" : "good");
  $("moraleCause").textContent = moraleCause();
  $("pizza").textContent = `Pizza party (+${Math.round(pizzaGain())}): ${money(pizzaCost())}`;
  $("pizza").disabled = S.funds < pizzaCost() || m.v >= 100;
  const t = townOf();
  $("town").textContent = Math.round(t.v);
  $("townMeter").firstElementChild.style.width = t.v + "%";
  $("townMeter").className = "meter " + (t.v >= 75 ? "bad" : t.v >= 50 ? "warn" : "good");
  $("townCause").textContent = townCause();
  $("sponsor").textContent = `Sponsor ${SPONSORED[(t.sponsors || 0) % SPONSORED.length]} (\u2212${Math.round(sponsorGain())}): ${money(sponsorCost())}`;
  $("sponsor").disabled = S.funds < sponsorCost() || t.v <= 0;
  if (c) {
    const k = CARDS[c.kind];
    $("cardTitle").textContent = `${k.title()} (${Math.max(0, Math.ceil(c.until - S.t))}s)`;
    $("cardText").textContent = k.text();
    const html = k.choices.map((ch, i) => `<button type="button" data-choice="${i}"${i === 0 ? ' class="primary"' : ""}>${ch.label}</button>`).join("");
    if ($("cardBtns").dataset.html !== html) { $("cardBtns").innerHTML = html; $("cardBtns").dataset.html = html; }
  }
}
