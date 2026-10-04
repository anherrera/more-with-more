import pathlib, re

from conftest import MID, run

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPTS = ["globals.js", "projects.js", "campus.js", "model.js", "market.js", "fires.js", "people.js", "planet.js", "hud.js", "main.js"]


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


# render() only reads: it never creates state or rolls dice, so a redraw can't change the game or a save.
RNG_COUNTER = "() => { window.__rng = 0; const r = Math.random; Math.random = () => { window.__rng++; return r(); }; }"


def assert_render_is_read_only(pg):
    pg.evaluate(RNG_COUNTER)
    before = pg.evaluate("() => JSON.stringify(S)")
    pg.evaluate("() => { window.__rng = 0; render(); render(); }")
    assert pg.evaluate("() => JSON.stringify(S)") == before
    assert pg.evaluate("() => window.__rng") == 0


def test_render_is_read_only_in_phase1(game):
    assert_render_is_read_only(game(MID))


def test_render_is_read_only_in_phase2(game):
    from test_phasebar import campus
    pg = campus(game)
    pg.evaluate("() => { moraleOf().perks = []; }")   # an empty perk deck is refilled by step(), not by a redraw
    assert_render_is_read_only(pg)


def test_render_is_read_only_in_phase3(game):
    from test_planet import planet
    pg = planet(game)
    pg.evaluate("() => { S.p3.nice = []; }")
    assert_render_is_read_only(pg)


def test_render_is_read_only_in_space(game):
    from test_space import to_space
    assert_render_is_read_only(to_space(game))


def test_a_loaded_save_has_every_field_before_the_first_render(game):
    from test_phasebar import campus
    pg = campus(game)
    pg.evaluate("() => { delete S.v; delete S.fires; delete S.leaks; delete S.cap; delete S.p2.people; delete S.p2.town; delete S.p2.ceo; delete S.p2.model; save(); }")
    pg.reload()
    have = pg.evaluate("() => [S.fires, S.leaks, S.cap, S.p2.people, S.p2.town, S.p2.ceo, S.p2.model].map((x) => !!x)")
    assert have == [True] * 7
    assert pg.evaluate("() => S.p2.town.v") == 20                        # the strong-grid county's starting opposition
    assert pg.evaluate("() => ownership()") < 1                           # the cap table is rebuilt from the rounds raised


def test_each_phase_dispatches_through_the_phases_table(game):
    pg = game()
    assert pg.evaluate("() => Object.keys(PHASES)") == ["1", "2", "3"]
    kinds = pg.evaluate("() => Object.values(PHASES).map((p) => [typeof p.step, typeof p.render, typeof p.wire, typeof p.go])")
    assert kinds == [["function"] * 4] * 3
    assert pg.evaluate("() => PHASES[1].step === stepPhase1 && PHASES[2].step === stepCampus && PHASES[3].step === stepPlanet")
    assert pg.evaluate("() => PHASES[3].render === renderPlanet && PHASES[3].wire === wirePlanet && PHASES[2].wire === wireCampus")
    hud = (ROOT / "hud.js").read_text()
    assert "function renderAlerts" in hud and "function renderPhaseBar" in hud
    assert "function renderAlerts" not in (ROOT / "fires.js").read_text() and "function renderPhaseBar" not in (ROOT / "model.js").read_text()


def test_one_render_cache_idiom_and_no_leftover_module_caches(game):
    pg = game(MID)
    assert pg.evaluate("() => typeof rebuildOn === 'function' && typeof setHtml === 'function'")
    assert pg.evaluate("() => ['lastRackKey', 'lastProjectKey', 'lastLeaseKey', 'lastOfferKey', 'lastContractKey', 'lastFleetKey', 'lastLogLen'].every((n) => typeof window[n] === 'undefined')")
    assert pg.evaluate("() => document.querySelectorAll('[data-key]').length") >= 3      # the console, leases, projects...
    assert not any("dataset.html" in (ROOT / f).read_text() for f in SCRIPTS)
    pg.evaluate("() => { S = fresh(); clearCaches(); }")
    assert pg.evaluate("() => document.querySelectorAll('[data-key]').length") == 0


def test_dead_code_is_gone(game):
    pg = game()
    assert pg.evaluate("() => ['coldGW', 'P3_CHOICES', 'ensureRunIfDb', 'db', 'COOLDOWN'].every((n) => typeof window[n] === 'undefined')")
    assert pg.evaluate("() => typeof SPONSOR_COOLDOWN === 'number' && typeof ensureRun === 'function'")
    for f in SCRIPTS:
        assert "next build" not in (ROOT / f).read_text(), f
    assert "zoomSaid" not in (ROOT / "planet.js").read_text() and "levelAt" not in (ROOT / "planet.js").read_text()
    assert "fresh = " not in (ROOT / "market.js").read_text()


def test_phase3_toggles_have_clear_names_and_old_ones_migrate(game):
    pg = game()
    assert pg.evaluate("() => { S.p3 = null; const d = freshP3(); return [d.autoclaimOff, d.autotrainOff, 'autoOff' in d, 'zoomSaid' in d]; }") == [False, False, False, False]
    from test_planet import planet
    pg = planet(game)
    pg.evaluate("() => { S.v = 4; S.p3.autoOff = true; S.p3.autoTrainOff = true; S.p3.zoomSaid = false; S.p3.levelAt = 1; save(); }")
    pg.reload()
    assert pg.evaluate("() => [S.p3.autoclaimOff, S.p3.autotrainOff, 'autoOff' in S.p3, 'zoomSaid' in S.p3, 'levelAt' in S.p3]") == [True, True, False, False, False]
