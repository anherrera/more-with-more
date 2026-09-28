from conftest import READY, run


def break_ground(pg):
    pg.click("button[data-id='ground']")


def test_break_ground_starts_campus(game):
    pg = game(READY)
    legacy = pg.evaluate("() => Math.round(usedKW() / 1000)")
    break_ground(pg)
    assert pg.evaluate("() => S.phase") == 2
    assert pg.evaluate("() => S.p2.legacyMW") == legacy == 110
    assert pg.is_visible("#countyBox")
    for hidden in ["#computeBox", "#trainingBox", "#facilitiesBox", "#p1biz", "#ending"]:
        assert not pg.is_visible(hidden), hidden
    assert pg.is_visible("#hypeNum") and pg.is_visible("#funds")
    assert "We are an infrastructure company now." in pg.inner_text("#console")


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


def test_legacy_colo_pays(game):
    pg = game({**READY, "debt": 0})
    break_ground(pg)
    pg.click("button[data-county='cheap']")
    before = pg.evaluate("() => S.funds")
    run(pg, 10)
    assert abs(pg.evaluate("() => S.funds") - before - 110 * 100 * 10) < 1


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
    pg.evaluate("() => { S.p2.legacyMW = 0; S.p2.offers = []; S.p2.nextOffer = 1e9; }")
    before = pg.evaluate("() => S.funds")
    run(pg, 10)
    # project-finance rate: a quarter of the phase 1 facility's
    assert abs((before - pg.evaluate("() => S.funds")) - 5e8 * 0.0002 * 0.25 * 10) < 1
    assert "refinanced" in pg.inner_text("#console")
