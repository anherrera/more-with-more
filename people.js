// people.js: the humans of phase 2. Morale (crunch drains it, calm restores it, pizza helps less every time) and
// temporary cards: decisions that show up, wait a few seconds, and go away (the tender offer; town halls later).

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
  if (c) {
    const k = CARDS[c.kind];
    $("cardTitle").textContent = `${k.title()} (${Math.max(0, Math.ceil(c.until - S.t))}s)`;
    $("cardText").textContent = k.text();
    const html = k.choices.map((ch, i) => `<button type="button" data-choice="${i}"${i === 0 ? ' class="primary"' : ""}>${ch.label}</button>`).join("");
    if ($("cardBtns").dataset.html !== html) { $("cardBtns").innerHTML = html; $("cardBtns").dataset.html = html; }
  }
}
