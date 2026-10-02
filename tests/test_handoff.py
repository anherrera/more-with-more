from conftest import READY, run


def break_ground(pg):
    pg.click("button[data-id='ground']")


def test_choose_county(game):
    pg = game(READY)
    break_ground(pg)
    pg.click("button[data-county='strong']")
    assert pg.evaluate("() => [S.p2.county, S.p2.grid]") == ["strong", 200]
    assert not pg.is_visible("#countyBox")
    assert pg.is_visible("#campusBox")
    assert pg.inner_text("#countyName") == "Strong grid, drought county"


def test_incentive_county_pays(game):
    pg = game(READY)
    break_ground(pg)
    before = pg.evaluate("() => S.funds")
    pg.click("button[data-county='incent']")
    assert pg.evaluate("() => S.funds") - before == 20e6


def test_old_ended_save_can_continue(game):
    pg = game({**READY, "ended": True, "endedAt": 1000})
    assert pg.is_visible("#ending")
    pg.click("#toCampus")
    assert pg.evaluate("() => S.phase") == 2
    assert pg.is_visible("#countyBox")


def test_phase2_survives_reload(game):
    pg = game(READY)
    break_ground(pg)
    pg.click("button[data-county='cheap']")
    pg.evaluate("() => save()")
    pg.reload()
    assert pg.evaluate("() => [S.phase, S.p2.county]") == [2, "cheap"]
    assert pg.is_visible("#campusBox")


def test_inherited_debt_is_refinanced(game):
    pg = game({**READY, "debt": 5e8})
    break_ground(pg)
    pg.click("button[data-county='cheap']")
    pg.evaluate("() => { S.fleet = {}; S.gpus = 0; S.p2.offers = []; S.p2.nextOffer = 1e9; }")
    before = pg.evaluate("() => S.funds")
    run(pg, 10)
    # project-finance rate: a quarter of the phase 1 facility's
    assert abs((before - pg.evaluate("() => S.funds")) - 5e8 * 0.0002 * 0.25 * 10) < 1
    assert "refinanced" in pg.inner_text("#console")


def test_break_ground_starts_campus(game):
    pg = game(READY)
    break_ground(pg)
    assert pg.evaluate("() => [S.phase, S.gpus]") == [2, 40000]
    assert pg.is_visible("#countyBox")
    for hidden in ["#trainingLive", "#p1biz", "#ending", "#answer"]:      # the Training panel stays, its controls go
        assert not pg.is_visible(hidden), hidden
    for shown in ["#computeBox", "#facilitiesBox", "#hypeNum", "#funds"]:
        assert pg.is_visible(shown), shown
    assert "We are an infrastructure company now." in pg.inner_text("#console")


def test_plan1_save_loads(game):
    pg = game({**READY, "phase": 2, "ended": True, "p2": {"county": "cheap", "legacyMW": 110, "grid": 50, "queue": None,
               "queueN": 0, "builds": [{"kind": "hall", "done": 0}], "nextOffer": 1e9, "offerN": 1, "contractN": 1, "earned": 0,
               "offers": [{"id": "o1", "n": 1, "who": "A lab funded by Parallax", "mw": 20, "start": 1400, "term": 600,
                           "upfront": 1, "fee": 1, "expires": 1300}],
               "contracts": [{"id": "c1", "n": 1, "who": "A lab funded by Parallax", "mw": 30, "start": 1500, "end": 2100,
                              "fee": 1, "upfront": 1, "status": "waiting", "reneg": False, "warned": False}]}})
    run(pg, 2)
    assert pg.evaluate("() => [S.phase, S.p2.county, typeof S.p2.market]") == [2, "cheap", "number"]
    assert pg.is_visible("#campusBox")
    assert "NaN" not in pg.inner_text("#contractsBox")
    assert "\u2713 covered" in pg.inner_text("#contracts")


def test_training_panel_explains_itself_in_phase2(game):
    pg = game(READY)
    break_ground(pg)
    assert pg.is_visible("#trainingBox")
    assert "Training is over" in pg.inner_text("#trainingBox")
    assert not pg.is_visible("#split")
