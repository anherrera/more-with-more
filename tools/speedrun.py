"""Full-game speedrun robot: a fresh game through phases 1, 2 and 3 to the last question, then the unbuild (Enough) to
the last rack, in a visible browser,
on the real code (?test mode: the robot calls step() itself, so game minutes pass in seconds).

    uv run --with playwright --with pytest python tools/speedrun.py            # 3 runs, visible
    uv run --with playwright --with pytest python tools/speedrun.py --runs 1 --headless
"""
import argparse, functools, http.server, pathlib, socketserver, sys, threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from play_p2 import POLICY as PHASE2, RNG  # noqa: E402

# Phase 1: click, train, buy, lease, cool, raise, post, take deals, fix spikes, break ground.
PHASE1 = """(secs) => {
  for (let i = 0; i < secs && S.phase === 1; i++) {
    for (let k = 0; k < 3 && S.queue >= 1 && S.gpus < 20; k++) answer();
    if (S.gpus >= 3 && S.split < 85) S.split = 85;
    if (S.spike) rollback();
    if (S.failed > 0) swapFailed();
    if (postReady()) vaguePost();
    if (dealReady()) takeDeal();
    raise();
    if (spotReady() && spotMult() > 2) sellSpot();
    for (const p of PROJECTS.filter((p) => (p.phase === 0 || (p.phase || 1) === 1) && !S.done[p.id] && p.when()).sort((a, b) => projectCost(a) - projectCost(b)))
      if (S.funds >= projectCost(p) && (!p.needs || !p.needs().length) && (!p.hype || S.hype > p.hype + 50)) buyProject(p.id);
    if (S.phase !== 1) break;
    const k = maxBuy(); if (k > 0) buy(k);
    if (roomNewest() < 1) {
      const plan = retrofitPlan();
      if (plan.kw > 0 && S.funds >= plan.cost) retrofit();
      else {
        const opts = TYPES.map((_, i) => i).filter((i) => leaseVisible(i) && S.funds >= leaseCost(i));
        if (opts.length) lease(opts.sort((a, b) => leaseCost(a) / unitKW(a) - leaseCost(b) / unitKW(b))[0]);
        else { const old = oldestOld(); if (old !== null && roomNewest() < 1 && S.credits + S.funds > gpuPrice() * 50) tradeIn(); }
      }
    }
    step(1);
  }
  return S.phase;
}"""


# Phase 3 (county level): keep goodwill up, answer town halls, claim the cheapest county whenever affordable.
PHASE3 = """(secs) => {
  for (let i = 0; i < secs && S.phase === 3 && S.p3.lastQ == null; i++) {
    if (S.p3.level === 0 && zoomReady()) { S.p3.countyAt = S.t; zoomOut(); }
    if (S.p3.level === 1 && zoomReady()) { S.p3.stateAt = S.t; zoomOut(); }
    if (S.p3.level === 2 && zoomReady()) { S.p3.countryAt = S.t; zoomOut(); }
    if (S.p3.level === 3 && zoomReady()) { S.p3.planetAt = S.t; zoomOut(); }
    if (inSpace()) { for (const id of ['rocket', 'massdriver']) buyTech(id); }
    if (heatOn() && S.p3.heat > 2.2 && S.p3.compute >= pumpCost()) pumpHeat();
    { const open = S.p3.tiles.map((t, j) => j).filter((j) => ['wild', 'unplugged'].includes(S.p3.tiles[j].state) && !spaceBlock(S.p3.tiles[j]));
      const next = open.length ? Math.max(...open.map((j) => claimCost(j))) : 0;
      if (trainOn() && S.p3.goodwill >= 50 && S.p3.compute >= next + trainStep() * computeRate()) trainSuccessor(); }
    for (let j = 0; j < S.p3.tiles.length; j++) if (S.p3.tiles[j].state === 'unpowered') {
      const o = powerOptions(j).sort((a, b) => a.cost - b.cost).find((o) => S.p3.compute >= o.cost); if (o) powerTile(j, o.id); }
    for (let k = 0; k < 3; k++) answerQuestion();
    if (S.p3.goodwill < 40 || S.p3.tiles[angriestTile()].opp >= 80) { const n = offeredNice().map(niceOf).filter((n) => S.p3.compute >= niceCost(n)).sort((a, b) => a.secs - b.secs)[0]; if (n) doNice(n.id); }
    if (S.p3.card) chooseP3Card(0);
    { const tech = availableTech().sort((a, b) => a.secs - b.secs)[0]; if (tech && S.p3.compute >= 2 * techCost(tech)) buyTech(tech.id); }
    const wild = S.p3.tiles.map((t, i) => i).filter((i) => ['wild', 'unplugged'].includes(S.p3.tiles[i].state) && !(S.p3.tiles[i].moratorium > S.t))
      .filter((i) => !spaceBlock(S.p3.tiles[i]))
      .sort((a, b) => (inSpace() ? (S.p3.tiles[b].name === 'Mercury' ? 1 : 0) - (S.p3.tiles[a].name === 'Mercury' ? 1 : 0) : 0) || (heatOn() && S.p3.heat > 2.4 ? (traitOf(S.p3.tiles[b]).ocean || traitOf(S.p3.tiles[b]).cold ? 1 : 0) - (traitOf(S.p3.tiles[a]).ocean || traitOf(S.p3.tiles[a]).cold ? 1 : 0) : 0) || claimCost(a) - claimCost(b));
    if (wild.length && S.p3.compute >= claimCost(wild[0])) claim(wild[0]);
    step(1);
  }
  return S.phase === 3 && S.p3.lastQ != null;
}"""


# The unbuild: say Enough, then release every tile level by level (cheapest first is irrelevant: one price), log off each
# level's free tier the moment it's allowed, and answer the founder at the last rack.
UNBUILD = """(secs) => {
  if (S.p3.lastQ != null && !S.p3.enough) { S.p3.enoughAt = S.t; S.p3.releasedAt = {}; chooseEnding(false); }
  for (let i = 0; i < secs && unbuilding(); i++) {
    if (S.p3.unbuild.rack) { answerLast(); break; }
    if (freeTierReady()) { S.p3.releasedAt[S.p3.level] = S.t; releaseFreeTier(); continue; }
    const j = unbuildBoard().tiles.findIndex((t) => t.held && !t.released);
    if (j >= 0 && S.p3.compute >= releaseCost()) release(j);
    step(1);
  }
  return unbuildDone();
}"""


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def mmss(x):
    return f"{int(x) // 60}:{int(x) % 60:02d}" if x is not None else "never"


headless_full = True
WATCH = False          # --watch: ~30 s of real time per game, small steps, so a person can follow it


def run_once(browser, base, seed, county):
    ctx = browser.new_context(viewport={"width": 1500, "height": 950} if headless_full else None); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.add_init_script(RNG.format(seed=seed) + "if (!sessionStorage.cleared) { sessionStorage.cleared = 1; localStorage.clear(); }")
    pg.goto(base + "?test")
    chunk, pause = (10, 190) if WATCH else (120, 0)
    for _ in range(12000 // chunk):               # phase 1
        if pg.evaluate(PHASE1, chunk) != 1: break
        if pause: pg.evaluate("() => render()"); pg.wait_for_timeout(pause)
        pg.evaluate("() => render()")
    ground = pg.evaluate("() => S.endedAt")
    if pg.evaluate("() => S.phase") == 2:
        pg.click(f"button[data-county='{county}']")
        for _ in range(5400 // chunk):
            pg.evaluate(PHASE2, [chunk, []]); pg.evaluate("() => render()")
            if pause: pg.wait_for_timeout(pause)
            if pg.evaluate("() => S.p2.model.endedAt") is not None: break
    p3 = None
    if pg.evaluate("() => S.phase === 2 && S.p2.model.endedAt != null"):
        pg.evaluate("() => render()"); pg.click("#phaseGo")
        for _ in range(9000 // chunk):
            done = pg.evaluate(PHASE3, chunk); pg.evaluate("() => render()")
            if pause: pg.wait_for_timeout(pause)
            if done: p3 = pg.evaluate("() => [S.p3.countyAt - S.p3.startedAt, S.p3.stateAt - S.p3.countyAt, S.p3.countryAt - S.p3.stateAt, S.p3.planetAt - S.p3.countryAt, S.t - S.p3.planetAt, S.p3.version || 7]"); break
    unbuild = None
    if p3 is not None:                                 # the unbuild: Enough, then put it all back
        for _ in range(3000 // chunk):
            done = pg.evaluate(UNBUILD, chunk); pg.evaluate("() => render()")
            if pause: pg.wait_for_timeout(pause)
            if done:
                unbuild = pg.evaluate("() => [S.p3.unbuild.doneAt - S.p3.enoughAt, [4, 3, 2, 1, 0].map((l, k) => S.p3.releasedAt[l] - (k ? S.p3.releasedAt[l + 1] : S.p3.enoughAt))]")
                final = pg.inner_text("#lastq")
                if "More with less." not in final or "touched grass" not in final: print("BAD ENDING:", final, file=sys.stderr); unbuild = None
                break
        if unbuild is None: print("UNBUILD STUCK:", pg.evaluate("() => JSON.stringify({level: S.p3.level, u: S.p3.unbuild && {level: S.p3.unbuild.level, rack: S.p3.unbuild.rack, freed: S.p3.unbuild.freed, left: unbuilding() && heldLeft()}, compute: S.p3.compute, rate: computeRate()})"), file=sys.stderr)
    if p3 is None and pg.evaluate("() => S.phase") == 3:
        print("STUCK:", pg.evaluate("""() => JSON.stringify({level: S.p3.level, t: Math.round(S.t - S.p3.startedAt), gw: Math.round(onlineGW()), compute: S.p3.compute, goodwill: Math.round(S.p3.goodwill), heat: S.p3.heat, tech: Object.keys(S.p3.tech || {}),
          tiles: S.p3.tiles.map((t) => [t.name, t.state, Math.round(t.opp)]), rate: computeRate(), costs: S.p3.tiles.map((t, i) => Math.round(claimCost(i))), avail: availableTech().map((t) => t.id), card: S.p3.card, mor: S.p3.tiles.map((t) => t.moratorium), hear: S.p3.hearingUntil, nowT: S.t})"""), file=sys.stderr)
    s = pg.evaluate("""() => ({t: S.t, gen: S.gen, ended: S.p2 && S.p2.model && S.p2.model.endedAt, ipo: S.p2 && S.p2.ipo && S.p2.ipo.at,
      fires: firesOf().n, leaks: leaksOf().n, morale: S.p2 && S.p2.people ? Math.round(S.p2.people.v) : null, pizzas: S.p2 && S.p2.people ? S.p2.people.perkN || 0 : 0, town: S.p2 && S.p2.town ? Math.round(S.p2.town.v) : null, jobs: S.p2 && S.p2.town ? S.p2.town.jobs : 0, ceos: S.p2 && S.p2.ceo ? S.p2.ceo.n : 0, en: S.p2 ? energizedAt() : 0, own: ownership()})""")
    ctx.close()
    s["p3"] = p3; s["unbuild"] = unbuild

    return ground, s, errs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=3); ap.add_argument("--headless", action="store_true")
    ap.add_argument("--one", type=int, help="internal: run only this run number (used for parallel runs)")
    ap.add_argument("--watch", action="store_true", help="one visible game paced to ~30 s")
    a = ap.parse_args()
    global WATCH
    if a.watch: WATCH = True; a.runs = 1
    if a.one is None and a.runs > 1:              # run each in its own process, side by side, at the same time
        import subprocess
        procs = [subprocess.Popen([sys.executable, __file__, "--one", str(r)] + (["--headless"] if a.headless else []),
                                  stdout=subprocess.PIPE, text=True) for r in range(a.runs)]
        outs = [pr.communicate()[0] for pr in procs]
        for o in outs: print(o.strip().splitlines()[0])
        ok = all(pr.returncode == 0 for pr in procs)
        print("ALL CLEAN" if ok else "PROBLEMS FOUND"); sys.exit(0 if ok else 1)
    httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}/"
    counties = ["strong", "incent", "cheap"]
    ok = True
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=a.headless,
                              args=[] if a.one is None else [f"--window-position={40 + 520 * (a.one % 3)},40", "--window-size=520,900"])
        for r in ([a.one] if a.one is not None else range(a.runs)):
            county = counties[r % 3]
            ground, s, errs = run_once(b, base, r + 1, county)
            p2 = (s["ended"] - ground) if s["ended"] and ground else None
            print(f"run {r + 1} ({county}): phase 1 {mmss(ground)}, phase 2 {mmss(p2)}, IPO at {mmss(s['ipo'])}, "
                  f"campus {s['en']:.0f} MW, fires {s['fires']}, leaks {s['leaks']}, morale {s['morale']} ({s['pizzas']} perks), town {s['town']} ({s['jobs']} jobs promised), CEOs {s['ceos']}, county level {mmss(s['p3'] and s['p3'][0])}, state level {mmss(s['p3'] and s['p3'][1])}, country level {mmss(s['p3'] and s['p3'][2])}, planet level {mmss(s['p3'] and s['p3'][3])}, space {mmss(s['p3'] and s['p3'][4])} (Gen {s['p3'] and s['p3'][5]}), unbuild {mmss(s['unbuild'] and s['unbuild'][0])} ({' '.join(mmss(x) for x in s['unbuild'][1]) if s['unbuild'] else 'never'}), you own {100 * s['own']:.1f}%, page errors: {errs[:2] or 'none'}")
            ok = ok and not errs and s["ended"] is not None and s["p3"] is not None and s["unbuild"] is not None
        b.close()
    httpd.shutdown()
    print("ALL CLEAN" if ok else "PROBLEMS FOUND")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
