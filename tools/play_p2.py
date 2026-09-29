"""A robot that plays the real phase 2 (the actual game code, headless, in ?test mode) with a greedy policy.
No hand-copied math to drift: every project, proposal, fire, drought and the IPO are whatever the game does.

    uv run --with playwright python tools/play_p2.py                       # all counties, 2 seeds
    uv run --with playwright python tools/play_p2.py --ablate              # also: goal time without each project
    uv run --with playwright python tools/play_p2.py --county strong --seeds 3 --minutes 50
"""
import argparse, functools, http.server, json, pathlib, socketserver, sys, threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests"))
from conftest import READY  # noqa: E402  a realistic end of phase 1

RNG = """(() => {{ let a = {seed}; Math.random = () => {{ a |= 0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; }}; }})();"""

# One decision per game-second, then step(1). `banned` projects are never bought (for ablation).
POLICY = """(args) => {
  const [secs, banned] = args; let acted = 0;
  const reserve = () => 30e6;
  for (let i = 0; i < secs; i++) {
    const m = S.p2.model;
    if (m && m.endedAt != null) break;
    // money in
    if (S.phase === 2) { const r = campusRound(); if ((r && !roundGap(r)) || (!r && !isPublic() && !ipoGap()) || (isPublic() && S.t >= S.p2.ipo.lastFollowOn + 300 && S.funds < 100e6)) { const f = S.funds; raise(); if (S.funds !== f) acted++; } }
    if (postReady()) { vaguePost(); }
    if (spotReady() && spotMult() > 2) { sellSpot(); acted++; }
    // the model's proposals and projects
    if (m && m.current && S.funds >= proposalCost(m.current) + reserve()) { approveProposal(); acted++; }
    if (m && m.final && m.final.at == null) { approveProposal(); acted++; }
    for (const p of PROJECTS.filter((p) => (p.phase === 0 || (p.phase || 1) === 2) && !S.done[p.id] && !banned.includes(p.id) && p.when()).sort((a, b) => projectCost(a) - projectCost(b))) {
      if (S.funds - projectCost(p) > reserve()) { buyProject(p.id); acted++; }
    }
    // contracts: sign what we can deliver; buy GPUs for what's due
    for (const o of [...S.p2.offers]) if (forecast(o).ok) { acceptOffer(o.id); acted++; }
    for (const c of S.p2.contracts.filter((c) => (c.status === "waiting" || c.status === "late") && c.start - S.t < 90)) {
      const short = c.mw - eligibleFreeMW(c.minGen || 0);
      if (short <= 0) continue;
      if (roomMWAt(S.t) < short) { const old = Object.keys(S.fleet).map(Number).filter((g) => g < (c.minGen || 0)).sort((a, b) => a - b)[0]; if (old != null) { tradeIn(old); acted++; } }
      if (roomMWAt(S.t) < short && S.p2.market >= COLO_MW) { leaseColo(); acted++; }
      const k = Math.min(maxBuy(), Math.ceil(short * 1000 / newest().kw)); if (k > 0) { buy(k); acted++; }
    }
    // chase the 1 GW goal: land, halls, power, water (whichever is short), keeping a reserve
    if (energizedAt(S.t + 1e6) < GOAL_MW && S.funds > reserve() + 20e6) {
      const halls = hallMWAt(1e12), power = powerAt(1e12), water = waterMWAt(1e12);
      const n = S.p2.builds.length;
      if (acresFree() < HALL.acres && S.funds > landCost() + reserve()) buyLand();
      else if (halls <= Math.min(power, water)) build("hall");
      else if (power <= water) build("turbine");
      else build("reclaimed");
      if (S.p2.builds.length > n) acted++;
      if (!S.p2.queue && S.funds > QUEUE_DEPOSIT + reserve()) requestQueue();
    }
    // spare room earns on-demand
    if (roomMWAt(S.t) > 20 && S.funds > 150e6) { const k = Math.min(maxBuy(S.funds - 100e6), Math.floor((roomMWAt(S.t) - 10) * 1000 / newest().kw)); if (k > 0) buy(k); }
    step(1);
  }
  return acted;
}"""


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def play(browser, base, county, seed, minutes, banned=()):
    ctx = browser.new_context(); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    state = {**READY, "debt": 0}
    pg.add_init_script(RNG.format(seed=seed) + f"localStorage.setItem('more-with-more-v1', {json.dumps(json.dumps(state))});")
    pg.goto(base + "?test")
    pg.click("button[data-id='ground']"); pg.click(f"button[data-county='{county}']")
    t0 = pg.evaluate("() => S.t"); idle, longest, marks = 0, 0, {}
    for minute in range(minutes):
        acted = pg.evaluate(POLICY, [60, list(banned)])
        idle = 0 if acted else idle + 60; longest = max(longest, idle)
        s = pg.evaluate("""() => ({ended: S.p2.model.endedAt, ipo: S.p2.ipo && S.p2.ipo.at, en: energizedAt(),
          defaults: S.milestones.length, late: S.p2.contracts.filter((c) => c.status === 'defaulted').length})""")
        if s["ipo"] and "ipo" not in marks: marks["ipo"] = s["ipo"] - t0
        if s["ended"]: marks["end"] = s["ended"] - t0; break
    fires = pg.evaluate("() => firesOf().n")
    ctx.close()
    if errs: print("  page errors:", errs[:2])
    return marks, fires


def mmss(x):
    return f"{int(x) // 60}:{int(x) % 60:02d}" if x is not None else "never"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--county", default="all"); ap.add_argument("--seeds", type=int, default=2)
    ap.add_argument("--minutes", type=int, default=60); ap.add_argument("--ablate", action="store_true")
    a = ap.parse_args()
    httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}/"
    counties = ["cheap", "strong", "incent"] if a.county == "all" else [a.county]
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True)
        base_end = {}
        for c in counties:
            for seed in range(1, a.seeds + 1):
                marks, fires = play(b, base, c, seed, a.minutes)
                base_end[(c, seed)] = marks.get("end")
                print(f"{c:6} seed {seed}: IPO {mmss(marks.get('ipo'))}, 1 GW ending {mmss(marks.get('end'))}, fires {fires}")
        if a.ablate:
            pg = b.new_page(); pg.goto(base + "?test")
            ids = pg.evaluate("() => PROJECTS.filter((p) => p.phase === 2 || p.phase === 0).map((p) => p.id)"); pg.close()
            print("\nproject ablation (ending time without it, minus with it; + means the project helps):")
            for pid in ids:
                deltas = []
                for (c, seed), end in base_end.items():
                    marks, _ = play(b, base, c, seed, a.minutes, banned=(pid,))
                    if end and marks.get("end"): deltas.append(marks["end"] - end)
                avg = sum(deltas) / len(deltas) if deltas else None
                print(f"  {pid:12} {('%+.0fs' % avg) if avg is not None else 'n/a':>8}  over {len(deltas)} runs")
        b.close()
    httpd.shutdown()


if __name__ == "__main__":
    main()
