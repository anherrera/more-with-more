import pathlib, re

from conftest import MID, run

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPTS = ["globals.js", "projects.js", "campus.js", "model.js", "market.js", "fires.js", "people.js", "planet.js", "main.js"]


def test_scripts_load_in_order():
    html = (ROOT / "index.html").read_text()
    srcs = re.findall(r'<script src="([^"]+)"></script>', html)
    assert srcs == SCRIPTS
    assert not re.search(r"<script>\s*\S", html), "no inline script code left in index.html"


def test_globals_exposed(game):
    pg = game()
    kinds = pg.evaluate("() => [typeof S, typeof step, typeof render, typeof save, Array.isArray(PROJECTS)]")
    assert kinds == ["object", "function", "function", "function", True]


def test_test_mode_freezes_clock(game):
    pg = game(MID)
    t0 = pg.evaluate("() => S.t")
    pg.wait_for_timeout(400)
    assert pg.evaluate("() => S.t") == t0
    run(pg, 5)
    assert pg.evaluate("() => S.t") == t0 + 5


def test_training_advances_deterministically(game):
    pg = game(MID)
    before = pg.evaluate("() => S.progress")
    pg.evaluate("() => { S.spike = null; S.done.autockpt = true; }")
    run(pg, 1)
    # GPUs can fail inside the step before training runs, so compare against the post-step rate.
    rate = pg.evaluate("() => trainingGPUs()")
    assert rate > 0
    assert abs(pg.evaluate("() => S.progress") - (before + rate)) < 1e-6 or pg.evaluate("() => S.gen") > 6


def test_project_ids_are_unique(game):
    pg = game(MID)
    assert pg.evaluate("() => { const ids = PROJECTS.map((p) => p.id); return ids.filter((x, i) => ids.indexOf(x) !== i); }") == []


def test_project_titles_are_unique(game):
    pg = game(MID)
    assert pg.evaluate("() => { const t = PROJECTS.map((p) => p.title); return t.filter((x, i) => t.indexOf(x) !== i); }") == []


def test_page_is_standards_mode_with_a_viewport(game):
    html = (ROOT / "index.html").read_text()
    assert html.lstrip().lower().startswith("<!doctype html>")
    assert re.search(r'<meta name="viewport" content="width=device-width, initial-scale=1">', html)
    pg = game()
    assert pg.evaluate("() => document.compatMode") == "CSS1Compat"
