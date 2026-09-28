import functools, http.server, json, pathlib, socketserver, threading

import pytest
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]

# Deterministic Math.random for the page (mulberry32).
SEEDED_RNG = """(() => { let a = 12345; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();"""

# A mid-game phase 1 save: Gen 6, all rounds raised, one data hall, 5k P4s (room to buy more).
MID = {"leases": {"rack": 3, "cage": 1, "row": 4, "hall": 1},
       "leaseCool": {"rack": {"3": 3}, "cage": {"3": 1}, "row": {"3": 4}, "hall": {"3": 1}},
       "funds": 2.5e8, "tier": 3, "gen": 6, "round": 6, "cooling": 5, "done": {"dynprice": True},
       "chipIdx": 3, "nextChip": 99999, "t": 1000, "fleet": {"3": 5000}, "gpus": 5000, "split": 95,
       "hype": 80, "rival": {"px": 40, "prev": 40, "next": 99999, "n": 0}, "logV2": True, "coolingV2": True}
# Ready to break ground: Gen 7, 40k P4s (2.744 kW each, ~110 MW) in ~220 MW of leased space (incl. a building).
READY = {**MID, "gen": 7, "fleet": {"3": 40000}, "gpus": 40000, "tier": 4,
         "leases": {**MID["leases"], "building": 1}, "leaseCool": {**MID["leaseCool"], "building": {"5": 1}}}


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@pytest.fixture(scope="session")
def server():
    httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/"
    httpd.shutdown()


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True)
        yield b
        b.close()


@pytest.fixture
def page(browser):
    ctx = browser.new_context()
    pg = ctx.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    yield pg
    ctx.close()
    assert not pg.errors, pg.errors


@pytest.fixture
def game(page, server):
    def open_game(state=None, test=True):
        js = SEEDED_RNG
        if state is not None:
            # Seed once per tab so a reload keeps whatever the game saved.
            js += ("if (!sessionStorage.seeded) { sessionStorage.seeded = 1; "
                   f"localStorage.setItem('more-with-more-v1', {json.dumps(json.dumps(state))}); }}")
        page.add_init_script(js)
        page.goto(server + ("?test" if test else ""))
        return page
    return open_game


def run(page, secs, dt=1):
    """Advance game time by secs in steps of dt (test mode only), then render."""
    page.evaluate(f"() => {{ for (let i = 0; i < {secs}; i++) step({dt}); render(); }}")
