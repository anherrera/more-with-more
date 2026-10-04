"""Full-game speedrun robot: a fresh game through phase 1 and phase 2 to the ending, in a visible browser,
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
    if (trainOn() && S.p3.goodwill >= 50 && S.p3.compute >= 3 * Math.min(...S.p3.tiles.map((t, j) => claimCost(j)))) trainSuccessor();
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
        for _ in range(3600 // chunk):
            done = pg.evaluate(PHASE3, chunk); pg.evaluate("() => render()")
            if pause: pg.wait_for_timeout(pause)
            if done: p3 = pg.evaluate("() => [S.p3.countyAt - S.p3.startedAt, S.p3.stateAt - S.p3.countyAt, S.p3.countryAt - S.p3.stateAt, S.p3.planetAt - S.p3.countryAt, S.t - S.p3.planetAt, S.p3.version || 7]"); break
    s = pg.evaluate("""() => ({t: S.t, gen: S.gen, ended: S.p2 && S.p2.model && S.p2.model.endedAt, ipo: S.p2 && S.p2.ipo && S.p2.ipo.at,
      fires: firesOf().n, leaks: leaksOf().n, morale: S.p2 && S.p2.people ? Math.round(S.p2.people.v) : null, pizzas: S.p2 && S.p2.people ? S.p2.people.perkN || 0 : 0, town: S.p2 && S.p2.town ? Math.round(S.p2.town.v) : null, jobs: S.p2 && S.p2.town ? S.p2.town.jobs : 0, ceos: S.p2 && S.p2.ceo ? S.p2.ceo.n : 0, en: S.p2 ? energizedAt() : 0, own: ownership()})""")
    ctx.close()
    s["p3"] = p3
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
                  f"campus {s['en']:.0f} MW, fires {s['fires']}, leaks {s['leaks']}, morale {s['morale']} ({s['pizzas']} perks), town {s['town']} ({s['jobs']} jobs promised), CEOs {s['ceos']}, county level {mmss(s['p3'] and s['p3'][0])}, state level {mmss(s['p3'] and s['p3'][1])}, country level {mmss(s['p3'] and s['p3'][2])}, planet level {mmss(s['p3'] and s['p3'][3])}, space {mmss(s['p3'] and s['p3'][4])} (Gen {s['p3'] and s['p3'][5]}), you own {100 * s['own']:.1f}%, page errors: {errs[:2] or 'none'}")
            ok = ok and not errs and s["ended"] is not None and s["p3"] is not None
        b.close()
    httpd.shutdown()
    print("ALL CLEAN" if ok else "PROBLEMS FOUND")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
