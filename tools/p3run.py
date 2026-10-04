"""Phase 3 only, for tuning: start from a finished phase 2 campus (the tests' READY save, broken ground, 1.1 GW), play the
robot's phase 3 policy to the last question, then the unbuild; print the time per level, the longest quiet stretch per
level and the unbuild's length. Much faster than tools/speedrun.py (no phases 1 and 2), same policies.

    uv run --with playwright --with pytest python tools/p3run.py            # 3 seeds
    uv run --with playwright --with pytest python tools/p3run.py --seeds 5 --mw 1500
"""
import argparse, functools, http.server, json, pathlib, socketserver, sys, threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools")); sys.path.insert(0, str(ROOT / "tests"))
from play_p2 import RNG  # noqa: E402
from speedrun import PHASE3, UNBUILD, mmss  # noqa: E402
from conftest import READY  # noqa: E402


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def run_once(browser, base, seed, mw):
    ctx = browser.new_context(); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    state = {**READY, "debt": 0}
    pg.add_init_script(RNG.format(seed=seed) + f"localStorage.setItem('more-with-more-v1', {json.dumps(json.dumps(state))});")
    pg.goto(base + "?test")
    pg.click("button[data-id='ground']"); pg.click("button[data-county='strong']")
    pg.evaluate(f"""() => {{ S.rival.next = 1e9; firesOf().next = 1e9; leaksOf().next = 1e9;
      S.p2.grid = 99999; S.p2.extraWater = 999; for (let i = 0; i < {mw // 60 + 1}; i++) S.p2.builds.push({{kind: 'hall', done: 0, announced: true}});
      S.p2.ipo = {{at: S.t, px0: 1, walk: 1, shock: 1, lastFollowOn: -1e9, lastSecondary: -1e9, lockupSaid: true}};
      modelOf().endedAt = S.t; render(); }}""")
    pg.click("#phaseGo")
    p3 = None
    for _ in range(9000 // 120):
        if pg.evaluate(PHASE3, 120):
            p3 = pg.evaluate("() => [S.p3.countyAt - S.p3.startedAt, S.p3.stateAt - S.p3.countyAt, S.p3.countryAt - S.p3.stateAt, S.p3.planetAt - S.p3.countryAt, S.t - S.p3.planetAt, S.p3.version || 7, S.p3.quiet.max, S.p3.quiet.at]"); break
    if p3 is None:
        print("STUCK at level", pg.evaluate("() => [S.p3.level, Math.round(S.t - S.p3.startedAt), S.p3.tiles.map((t) => [t.name, t.state]), Math.round(S.p3.goodwill)]"), file=sys.stderr)
        ctx.close(); return None, None, errs
    unbuild = None
    for _ in range(3000 // 120):
        if pg.evaluate(UNBUILD, 120): unbuild = pg.evaluate("() => S.p3.unbuild.doneAt - S.p3.enoughAt"); break
    ctx.close()
    return p3, unbuild, errs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=3); ap.add_argument("--mw", type=int, default=1100, help="campus size at the handoff")
    a = ap.parse_args()
    httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}/"
    tot = [0.0] * 5; n = 0
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True)
        for seed in range(1, a.seeds + 1):
            p3, unbuild, errs = run_once(b, base, seed * 7, a.mw)
            if p3 is None: print(f"seed {seed}: stuck, errors {errs[:2]}"); continue
            n += 1; tot = [x + y for x, y in zip(tot, p3[:5])]
            print(f"seed {seed}: county {mmss(p3[0])}, state {mmss(p3[1])}, country {mmss(p3[2])}, planet {mmss(p3[3])}, space {mmss(p3[4])} = {mmss(sum(p3[:5]))} (Gen {p3[5]}); "
                  f"quiet {' '.join(f'{q}s@{mmss(t)}' for q, t in zip(p3[6], p3[7]))}; unbuild {mmss(unbuild)}; errors {errs[:2] or 'none'}")
        b.close()
    if n: print("mean: " + ", ".join(f"{name} {mmss(x / n)}" for name, x in zip(["county", "state", "country", "planet", "space"], tot)) + f" = {mmss(sum(tot) / n)}")
    httpd.shutdown()


if __name__ == "__main__":
    main()
