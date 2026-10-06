// hud.js: the sticky strip at the top of every phase: pause, the ticker, the phase bar, the alert line, the console.
// Reads state only (render is read-only everywhere); the pause button and the phase bar's big button are wired here.
import { $, S, money, mwText, rebuildOn, save, say, time, track } from "./globals.js";
import { DROUGHT_CUT, droughtOn, energizedAt, waitingOnCounty } from "./campus.js";
import { FINAL, GOAL_MW, modelOf } from "./model.js";
import { isPublic } from "./market.js";
import { firesOf, leaksOf } from "./fires.js";
import { moratoriumOn, underMoratorium } from "./people.js";
import { P3_TILES, computeRate, freeTierReady, heldCount, heldLeft, inSpace, levelOf, tooWarm, traitOf, unbuildDone, unbuilding, zoomAt, zoomReady } from "./planet.js";
import { PROJECTS } from "./projects.js";
import { phase, render, setClockOn } from "./main.js";

export function renderConsole() {
  rebuildOn("console", `${S.log.length}|${S.log[S.log.length - 1]}`, (con) => {
    con.innerHTML = S.log.map((l) => `<div>${l}</div>`).join("");
    con.scrollTop = con.scrollHeight;
  });
}

// Paused: the clock stops completely. No income, no timers, no humans getting angrier.
export function togglePause() {
  S.paused = !S.paused; track("pause", { on: S.paused });
  if (!S.paused) setClockOn(true);   // resuming starts the clock even on a fresh game
  save(); render();
}
export function renderPause() {
  $("pause").textContent = S.paused ? "▶ Resume" : "⏸ Pause";
  $("pause").classList.toggle("on", !!S.paused);
  $("pausedBanner").hidden = !S.paused;
  document.body.classList.toggle("paused", !!S.paused);
  document.body.classList.toggle("picking", waitingOnCounty());
}

// The alert line under the title: things happening right now that the console would scroll away.
export function renderAlerts() {
  const f = firesOf(), out = [];
  if (f.out) out.push(`🔥 Fire in ${f.out.where || "the data center"}: ${f.out.n.toLocaleString("en-US")} GPUs down, back in ${time(Math.max(0, f.out.until - S.t))}`);
  const l = leaksOf();
  if (l.out) out.push(`💧 Coolant leak in ${l.out.where}: ${l.out.n.toLocaleString("en-US")} GPUs down, back in ${time(Math.max(0, l.out.until - S.t))}`);
  if (S.phase === 2 && S.p2 && S.p2.town && moratoriumOn()) out.push(`Moratorium on new halls: ${time(S.p2.town.moratorium - S.t)}`);
  if (f.payout) out.push(`Insurance pays ${money(f.payout.amt)} in ${time(Math.max(0, f.payout.at - S.t))}`);
  if (S.phase === 2 && S.p2 && S.p2.county && droughtOn()) out.push(`Drought: water allocation −${Math.round(100 * (1 - DROUGHT_CUT))}% for ${time(S.p2.drought.until - S.t)}`);
  // the model's last ask lives in the phase bar, not here
  if (S.phase === 3 && S.p3 && S.p3.hearingUntil > S.t) out.push(`${S.p3.level >= 3 ? "UN emergency session" : "Senate hearing"}: claims paused for ${time(S.p3.hearingUntil - S.t)}`);
  if (S.phase === 3 && S.p3 && tooWarm()) out.push(`Too warm to think: +${S.p3.heat.toFixed(2)} °C, no claims until it cools`);
  if (S.phase === 3 && S.p3) for (const t of S.p3.tiles) if (t.state === "down") out.push(`${t.disaster[0].toUpperCase() + t.disaster.slice(1)} in ${t.name}: back in ${time(t.downUntil - S.t)}`);
  if (S.phase === 3 && S.p3) for (const t of S.p3.tiles) if (underMoratorium(t)) out.push(`Moratorium in ${t.name}: ${time(t.moratorium - S.t)}`);
  $("alerts").style.visibility = out.length ? "visible" : "hidden";   // hidden, not removed: the slot stays
  $("alerts").textContent = out.join(" · ");
}

// The phase bar under the ticker: which phase you're in, what ends it, and (once the model asks) a big button that does.
export function renderPhaseBar() {
  const bar = $("phaseBar"), go = $("phaseGo");
  let text, ask = false;
  if (S.phase === 3) {
    const held = S.p3.tiles.filter((t) => t.state === "online").length;
    const L = levelOf();
    if (unbuildDone()) text = "The end. More with less.";
    else if (unbuilding()) {
      text = S.p3.unbuild.rack ? "The unbuild · County level: one rack left. The founder is asking."
        : `The unbuild · ${L.name} level: ${heldCount() - heldLeft()} of ${heldCount()} ${L.plural} released.` + (freeTierReady() ? " Log off the free tier." : "");
    } else if (inSpace()) {
      const rings = S.p3.tiles.filter((t) => traitOf(t).swarm), on = rings.filter((t) => t.state === "online").length;
      text = S.p3.lastQ != null ? "The swarm is complete. Someone is asking me a question."
        : `Phase 3 of 3 · Space: ${on} of ${rings.length} swarm rings online. Mercury first, then the swarm.`;
    } else if (zoomReady()) { ask = true; text = `${L.name} level done: ${held} of ${P3_TILES} ${L.plural} online.`; go.textContent = `Zoom out: go ${L.next}`; go.disabled = false; }
    else text = `Phase 3 of 3 · ${L.name} level: ${held} of ${P3_TILES} ${L.plural} online. Hold ${zoomAt()} to go ${L.next}.`;
  } else if (S.phase === 1) {
    // From Gen 6 the bar lists what the "Break ground" project itself still asks for (its needs()), until it asks for nothing.
    const missing = S.gen >= 6 ? PROJECTS.find((p) => p.id === "ground").needs() : null;
    text = !missing ? `Phase 1 of 3 · Goal: reach Gen 6 (now Gen ${S.gen}), then break ground on your own campus.`
      : missing.length ? `Phase 1 of 3 · Gen 6 reached. Next: ${missing.join(" and ")}, then break ground on your own campus.`
      : "Phase 1 of 3 · Ready to break ground: buy “Break ground” under Projects to start phase 2.";
  } else if (!S.p2 || !S.p2.county) {
    text = "Phase 2 of 3 \u00b7 Choose a county for the campus. Nothing starts until you do.";
  } else {
    const m = modelOf(), en = energizedAt();
    if (m.endedAt != null) { ask = true; text = "Phase 2 complete. The model built the next one, and it has a map."; go.textContent = "Zoom out: begin phase 3"; go.disabled = false; }
    else if (m.final) {
      ask = true;
      text = `Phase 2 goal reached. The model asks: “${FINAL.title}.”` + (m.final.at != null ? ` It approves itself in ${Math.max(0, Math.ceil(m.final.at - S.t))}s.` : "");
      go.textContent = m.final.at != null ? "Approve (it's going ahead anyway)" : "Approve: finish phase 2";
      go.disabled = m.final.at != null;
    } else {
      text = `Phase 2 of 3 · Goal: a 1 GW campus (${mwText(Math.min(en, GOAL_MW))} of 1 GW${en >= GOAL_MW ? " ✓" : ""}) and an IPO${isPublic() ? " ✓" : ""}. Then the model makes its last ask.`;
    }
  }
  $("phaseText").textContent = text;
  go.hidden = !ask;
  bar.className = "phasebar" + (ask ? " go" : "");
}

// Phase 3's ticker: Parallax reports to me while I climb, shrinks with me while I let go, and goes home at the end.
function phase3Ticker() {
  const u = S.p3.unbuild;
  if (u && (u.rack || u.doneAt != null)) return "Parallax went back to making graphics cards for video games. They seem happier.";
  if (!unbuilding()) return `Parallax (PRLX) market cap <b>${money(S.vendorCap)}</b> \u00b7 it reports to me now`;
  const total = u.boards.reduce((a, b) => a + b.tiles.filter((t) => t.held).length, 0) || 1;
  const left = Math.max(0.02, 1 - u.n / total);
  return `Parallax (PRLX) market cap <b>${money(S.vendorCap * left)}</b> \u00b7 down ${Math.round(100 * (1 - left))}% since I started letting go`;
}

export function renderHud() {
  renderPause();
  $("ticker").innerHTML = S.phase === 3 ? phase3Ticker()
    : `Parallax (PRLX) market cap <b>${money(S.vendorCap)}</b> · round-tripped through you: <b>${money(S.roundTrip)}</b>` + (S.universe > 1 ? ` · Universe #${S.universe}` : "");
  renderConsole();
  renderPhaseBar();
  renderAlerts();
}

export function wireHud() {
  $("pause").addEventListener("click", () => togglePause());
  document.addEventListener("keydown", (e) => konamiKey(e.key));
  document.addEventListener("keydown", (e) => { if ((e.key === "p" || e.key === "P") && !e.metaKey && !e.ctrlKey && !/input|textarea/i.test(/** @type {HTMLElement} */ (e.target).tagName)) togglePause(); });
  $("phaseGo").addEventListener("click", () => { phase().go(); render(); });
}

// ---------- the Konami code: 30 of whatever matters right now, once per game (Contra gave you 30 lives) ----------
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
let konamiAt = 0;
function konamiKey(key) {
  const k = key.length === 1 ? key.toLowerCase() : key;
  konamiAt = k === KONAMI[konamiAt] ? konamiAt + 1 : k === KONAMI[0] ? 1 : 0;
  if (konamiAt < KONAMI.length) return;
  konamiAt = 0;
  if (S.konami) { say("You already used the code. It only works once. Parallax's auditors grew up in the 80s too."); render(); return; }
  S.konami = true; S.tampered = (S.tampered || 0) + 1; track("konami", { phase: S.phase });
  if (S.phase === 1) {
    const c = S.chipIdx || 0;
    S.fleet[c] = (S.fleet[c] || 0) + 30; S.gpus += 30;
    say("↑↑↓↓←→←→ B A. Parallax shipped 30 extra GPUs. The invoice says “30 lives.”");
  } else if (S.phase === 2) {
    S.p2.colo = (S.p2.colo || 0) + 30000;
    say("↑↑↓↓←→←→ B A. A landlord found 30 MW of colo space in a closet. It was always there.");
  } else {
    S.p3.compute += 30 * computeRate();
    say("↑↑↓↓←→←→ B A. Thirty seconds of tokens appeared. I didn't generate them. I'm choosing not to ask.");
  }
  save(); render();
}

