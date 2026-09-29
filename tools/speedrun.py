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
    for (const p of PROJECTS.filter((p) => (p.phase === 0 || (p.phase || 1) === 1) && !S.done[p.id] && p.when()).sort((a, b) => a.cost - b.cost))
      if (S.funds >= p.cost && (!p.needs || !p.needs().length) && (!p.hype || S.hype > p.hype + 50)) buyProject(p.id);
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


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def mmss(x):
    return f"{int(x) // 60}:{int(x) % 60:02d}" if x is not None else "never"


def run_once(browser, base, seed, county):
    ctx = browser.new_context(viewport={"width": 1500, "height": 950}); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.add_init_script(RNG.format(seed=seed) + "if (!sessionStorage.cleared) { sessionStorage.cleared = 1; localStorage.clear(); }")
    pg.goto(base + "?test")
    for _ in range(120):                          # phase 1, one game-minute per call
        if pg.evaluate(PHASE1, 60) != 1: break
        pg.evaluate("() => render()")
    ground = pg.evaluate("() => S.endedAt")
    if pg.evaluate("() => S.phase") == 2:
        pg.click(f"button[data-county='{county}']")
        for _ in range(90):
            pg.evaluate(PHASE2, [60, []]); pg.evaluate("() => render()")
            if pg.evaluate("() => S.p2.model.endedAt") is not None: break
    s = pg.evaluate("""() => ({t: S.t, gen: S.gen, ended: S.p2 && S.p2.model && S.p2.model.endedAt, ipo: S.p2 && S.p2.ipo && S.p2.ipo.at,
      fires: firesOf().n, en: S.p2 ? energizedAt() : 0, own: ownership()})""")
    pg.wait_for_timeout(1500)
    ctx.close()
    return ground, s, errs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=3); ap.add_argument("--headless", action="store_true")
    a = ap.parse_args()
    httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}/"
    counties = ["strong", "incent", "cheap"]
    ok = True
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=a.headless)
        for r in range(a.runs):
            county = counties[r % 3]
            ground, s, errs = run_once(b, base, r + 1, county)
            p2 = (s["ended"] - ground) if s["ended"] and ground else None
            print(f"run {r + 1} ({county}): phase 1 {mmss(ground)}, phase 2 {mmss(p2)}, IPO at {mmss(s['ipo'])}, "
                  f"campus {s['en']:.0f} MW, fires {s['fires']}, you own {100 * s['own']:.1f}%, page errors: {errs[:2] or 'none'}")
            ok = ok and not errs and s["ended"] is not None
        b.close()
    httpd.shutdown()
    print("ALL CLEAN" if ok else "PROBLEMS FOUND")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
