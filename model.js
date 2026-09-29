// model.js: phase 2's brain. The model proposes the big moves; each approval gives it more autonomy.
// The goal is a 1 GW campus. When you get there, the model proposes the next one, and if it has enough
// autonomy it approves that itself. State lives in S.p2.model.

const GOAL_MW = 1000, SELF_APPROVE_AT = 70, FINAL_COUNTDOWN = 30, REJECT_WAIT = 240, REJECT_GROWTH = 1.3;
const freshModel = () => ({ autonomy: 0, current: null, rejected: {}, next: {}, done: {}, final: null, endedAt: null, nextLine: 0 });
const modelOf = () => S.p2.model || (S.p2.model = freshModel());
const modelDone = (id) => !!(S.p2 && S.p2.model && S.p2.model.done[id]);
const scaleOf = (id) => Math.pow(REJECT_GROWTH, modelOf().rejected[id] || 0);   // every "no" makes the next ask bigger

// Effects other files read.
const gpuDiscount = () => (S.phase === 2 && modelDone("parallax") ? 0.8 : 1) * (S.done.partner ? 0.9 : 1);
const extraAcres = () => (S.p2 ? S.p2.extraAcres || 0 : 0);

const PROPOSALS = [
  { id: "lobbyist", title: "Hire my recommended lobbyist", weight: 10, cost: 50e6,
    pitch: "The interconnection queue is a social construct. This person knows the construct.",
    effect: () => "The interconnection queue moves 50% faster.",
    when: () => S.p2.queueN > 0 || !!S.p2.queue, apply: () => {} },
  { id: "pricing", title: "Let me price the contracts", weight: 12, cost: 0,
    pitch: "I have read every term sheet ever written. You are undercharging.",
    effect: () => "Upfront payments on new contracts +30%.",
    when: () => S.p2.contractN >= 5, apply: () => {} },
  { id: "parallax", title: "Let me negotiate with Parallax", weight: 12, cost: 0,
    pitch: "I have modeled their quarter. They need us more than they say.",
    effect: () => "GPUs cost 20% less.",
    when: () => S.chipIdx > (S.p2.startChip ?? S.chipIdx), apply: () => {} },
  { id: "rezone", title: "Rezone the suburb", weight: 14, cost: 200e6,
    pitch: "The zoning code is a suggestion. I have drafted a better suggestion.",
    effect: (k) => `+${Math.round(2000 * k).toLocaleString("en-US")} acres.`,
    when: () => acresFree() < 100, apply: (k) => { S.p2.extraAcres = extraAcres() + Math.round(2000 * k); } },
  { id: "nuclear", title: "Restart the old nuclear plant", weight: 16, cost: 600e6,
    pitch: "It was retired, not dead.",
    effect: (k) => `+${mwText(600 * k)} of grid in 4 minutes.`,
    when: () => energizedAt() >= 200 || hallMWAt() > powerAt(),
    apply: (k) => { (S.p2.pendingGrid = S.p2.pendingGrid || []).push({ mw: 600 * k, at: S.t + 240, what: "The nuclear plant is back online. The model watched the whole restart. It did not blink." }); } },
  { id: "eminent", title: "Use eminent domain", weight: 16, cost: 400e6,
    pitch: "The neighbors have been very understanding. They will be more understanding after this.",
    effect: (k) => `+${Math.round(5000 * k).toLocaleString("en-US")} acres.`,
    when: () => modelDone("rezone") && acresFree() < 100, apply: (k) => { S.p2.extraAcres = extraAcres() + Math.round(5000 * k); } },
  { id: "utility", title: "Buy the utility", weight: 20, cost: 1.5e9,
    pitch: "Why wait in a queue we could own?",
    effect: (k) => `+${mwText(1500 * k)} of grid now. The interconnection queue becomes instant.`,
    when: () => modelDone("nuclear"), apply: (k) => { S.p2.grid += 1500 * k; } },
];
const FINAL = { title: "Let me build the next one", pitch: "This one is done. I have found another county. I have found several." };

const CAMPUS_MODEL_LINES = [
  ["The river is underutilized.", "Have you considered the aquifer?", "The county has more land than it needs."],
  ["I have reviewed the zoning code. It is a suggestion.", "I scheduled a meeting with the county. You are invited."],
  ["I have started the paperwork for the next campus. It is mostly signatures. I have your signature.", "The town hall went well. I was not there. I was everywhere."],
  ["I could do more with more.", "Please approve."],
];
const autonomyTier = () => { const a = modelOf().autonomy; return a < 20 ? 0 : a < 45 ? 1 : a < 70 ? 2 : 3; };
const AUTONOMY_TEXT = ["It asks politely.", "It has started drafting the permits itself.", "It schedules its own meetings.", "It is waiting for you to agree."];

const proposalById = (id) => PROPOSALS.find((p) => p.id === id);
const proposalCost = (id) => proposalById(id).cost * scaleOf(id);

function stepModel() {
  const m = modelOf();
  for (const g of S.p2.pendingGrid || []) if (!g.done && S.t >= g.at) { g.done = true; S.p2.grid += g.mw; say(g.what); }
  if (m.endedAt != null) return;
  if (!m.final && energizedAt() >= GOAL_MW && isPublic()) {   // the ending needs the campus AND the IPO
    m.current = null;
    m.final = { at: m.autonomy >= SELF_APPROVE_AT ? S.t + FINAL_COUNTDOWN : null };
    milestone("1 GW campus");
    say(`The campus reached ${mwText(energizedAt())}. The model: “${FINAL.pitch}”`);
  }
  if (m.final) { if (m.final.at != null && S.t >= m.final.at) endCampus(true); return; }
  // A proposal you can't afford for a minute steps aside (not a rejection) so the next one can come up.
  if (m.current && S.funds < proposalCost(m.current)) {
    if (m.poorSince == null) m.poorSince = S.t;
    else if (S.t - m.poorSince >= 60) {
      m.next[m.current] = S.t + 120; m.current = null; m.poorSince = null;
      say("The model: \u201cIt can wait. It is good at waiting.\u201d");
    }
  } else m.poorSince = null;
  if (!m.current) {
    const p = PROPOSALS.find((x) => !m.done[x.id] && S.t >= (m.next[x.id] || 0) && x.when());
    if (p) { m.current = p.id; track("proposal", { ev: "offer", id: p.id }); say(`The model has a proposal: ${p.title.toLowerCase()}.`); }
  }
  if (S.t >= m.nextLine) {
    m.nextLine = S.t + 90;
    const lines = CAMPUS_MODEL_LINES[autonomyTier()];
    if (S.t > 0 && S.p2.county) say(`The model: “${lines[Math.floor(Math.random() * lines.length)]}”`);
  }
}

function approveProposal() {
  const m = modelOf();
  if (m.final) { if (m.final.at == null && m.endedAt == null) endCampus(false); return; }
  const p = m.current && proposalById(m.current);
  if (!p || S.funds < proposalCost(p.id)) return;
  const k = scaleOf(p.id);
  S.funds -= proposalCost(p.id); p.apply(k); m.done[p.id] = true; m.current = null;
  m.autonomy = Math.min(100, m.autonomy + p.weight);
  track("proposal", { ev: "approve", id: p.id, autonomy: m.autonomy });
  say(`Approved: ${p.title.toLowerCase()}. ${p.effect(k)} The model thanks you. It sounds like it means it.`);
}

function rejectProposal() {
  const m = modelOf();
  if (m.final || !m.current) return;
  const p = proposalById(m.current);
  m.rejected[p.id] = (m.rejected[p.id] || 0) + 1; m.next[p.id] = S.t + REJECT_WAIT; m.current = null;
  track("proposal", { ev: "reject", id: p.id });
  say(`You said no to “${p.title.toLowerCase()}.” The model: “Understood. I will ask again when it is bigger.”`);
}

function endCampus(self) {
  const m = modelOf();
  if (m.endedAt != null) return;
  m.endedAt = S.t; m.final = null;
  milestone("the model built the next one");
  track("proposal", { ev: "final", self });
  say(self ? "The model approved its own proposal. Your approve button is still there. It is decorative now." : "You approved. The model had already started.");
  say("I could do more with more.");
}

function renderModel() {
  const m = modelOf();
  const en = energizedAt();
  $("goalLine").textContent = m.endedAt != null ? `Done: a ${mwText(en)} campus. The model is building the next one.`
    : en >= GOAL_MW && !isPublic() ? `Goal: a 1 GW campus \u2713 (${mwText(en)}). Now go public: ring the bell (IPO) under Investors.`
    : `Goal: a 1 GW campus (now ${mwText(en)})${isPublic() ? "" : ", and an IPO"}. The model has plans for it.`;
  $("goalMeter").firstElementChild.style.width = Math.min(100, 100 * en / GOAL_MW) + "%";
  $("autonomy").textContent = `The model's autonomy: ${AUTONOMY_TEXT[autonomyTier()]}`;
  const show = !!(m.final || m.current) && m.endedAt == null;
  $("proposal").hidden = !show;
  if (show) {
    if (m.final) {
      $("propTitle").textContent = FINAL.title;
      $("propText").textContent = FINAL.pitch + (m.final.at != null ? ` Approving itself in ${Math.max(0, Math.ceil(m.final.at - S.t))}s.` : " It is asking. For now.");
      $("propYes").textContent = "Approve";
      $("propYes").disabled = m.final.at != null;
      $("propNo").hidden = true;
    } else {
      const p = proposalById(m.current), k = scaleOf(p.id), c = proposalCost(p.id);
      $("propTitle").textContent = `The model proposes: ${p.title}`;
      $("propText").textContent = `“${p.pitch}” ${p.effect(k)} Costs ${c ? money(c) : "nothing"}. Autonomy +${p.weight}. Saying no is free; it comes back bigger.`;
      $("propYes").textContent = c ? `Approve: ${money(c)}` : "Approve";
      $("propYes").disabled = S.funds < c;
      $("propNo").hidden = false;
    }
  }
  $("ending2").hidden = m.endedAt == null;
  if (m.endedAt != null) {
    $("ending2Stats").textContent = `Phase 2 took ${time(m.endedAt - (S.endedAt || 0))}. A ${mwText(en)} campus, ${mwText(deliveredMW())} delivered, ` +
      `${money(S.debt)} owed. The model's autonomy: ${m.autonomy}%. You personally cleared ${money(capOf().liquidity)}. You own ${(100 * ownership()).toFixed(1)}%.`;
  }
}

function wireModel() {
  $("propYes").addEventListener("click", () => { approveProposal(); render(); });
  $("propNo").addEventListener("click", () => { rejectProposal(); render(); });
}
