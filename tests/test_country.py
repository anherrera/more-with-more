import pytest

from conftest import run
from test_state import statewide


def nationwide(game):
    pg = statewide(game)
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; render(); }")
    pg.click("#phaseGo")
    pg.evaluate("() => { S.p3.compute = 1e15; render(); }")
    return pg


def test_zooming_out_goes_nationwide(game):
    pg = statewide(game)
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; render(); }")
    gw = pg.evaluate("() => onlineGW()")
    pg.click("#phaseGo")
    assert pg.evaluate("() => [S.p3.level, S.p3.tiles.every((t) => t.state === 'wild')]") == [2, True]
    assert pg.evaluate("() => S.p3.homeGW") == pytest.approx(gw)
    assert "Country level" in pg.inner_text("#p3level")
    assert pg.evaluate("() => traitOf(S.p3.tiles[0]).gw") >= 100


def test_heat_rises_with_gigawatts_and_slows_builds(game):
    pg = nationwide(game)
    assert pg.is_visible("#p3heatBox")
    h0 = pg.evaluate("() => S.p3.heat")
    pg.evaluate("() => { S.p3.homeGW = 1200; }")
    run(pg, 60)
    assert pg.evaluate("() => S.p3.heat") > h0
    normal = pg.evaluate("() => { S.p3.heat = 1; return tileBuildSecs(0); }")
    hot = pg.evaluate("() => { S.p3.heat = 2.8; return tileBuildSecs(0); }")
    assert hot > normal * 1.5
    pg.evaluate("() => render()")
    assert "°C" in pg.inner_text("#p3heatBox")


def test_pumping_heat_into_the_ocean(game):
    pg = nationwide(game)
    pg.evaluate("() => { S.p3.heat = 2.5; render(); }")
    c, cost = pg.evaluate("() => [S.p3.compute, pumpCost()]")
    pg.click("#p3pump")
    assert pg.evaluate("() => S.p3.heat") == pytest.approx(2.2)
    assert pg.evaluate("() => S.p3.compute") == pytest.approx(c - cost)


def test_cold_countries_cool_the_planet(game):
    pg = nationwide(game)
    i = pg.evaluate("() => S.p3.tiles.findIndex((t) => t.trait === 'nordic')")
    t0 = pg.evaluate("() => heatTarget()")
    pg.evaluate(f"() => {{ S.p3.tiles[{i}].state = 'online'; }}")
    with_cold = pg.evaluate("() => heatTarget()")
    pg.evaluate(f"() => {{ S.p3.tiles[{i}].state = 'wild'; S.p3.homeGW += traitOf(S.p3.tiles[{i}]).gw; }}")
    assert with_cold < pg.evaluate("() => heatTarget()")


def test_low_goodwill_calls_a_senate_hearing_that_pauses_claims(game):
    pg = nationwide(game)
    pg.evaluate("() => { S.p3.goodwill = 20; }")
    run(pg, 1)
    assert pg.evaluate("() => S.p3.hearingUntil > S.t")
    assert "Senate" in " ".join(pg.evaluate("() => S.log.slice(-3)"))
    pg.evaluate("() => claim(0)")
    assert pg.evaluate("() => S.p3.tiles[0].state") == "wild"
    pg.evaluate("() => render()")
    assert "hearing" in pg.inner_text("#alerts").lower()


def test_sovereign_fund_countries_bring_goodwill(game):
    pg = nationwide(game)
    i = pg.evaluate("() => S.p3.tiles.findIndex((t) => t.trait === 'sovereign')")
    g = pg.evaluate("() => S.p3.goodwill")
    pg.evaluate(f"() => claim({i})")
    assert pg.evaluate("() => S.p3.goodwill") > g


def test_country_level_survives_reload_and_zooms_to_the_planet(game):
    pg = nationwide(game)
    pg.evaluate("() => { S.p3.heat = 1.7; save(); }")
    pg.reload()
    assert pg.evaluate("() => [S.p3.level, S.p3.heat]") == [2, 1.7]
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; render(); }")
    assert "planet" in pg.inner_text("#phaseGo").lower()
    pg.click("#phaseGo")
    assert pg.evaluate("() => S.p3.level") == 3                       # the planet level exists now


def test_training_my_successor(game):
    pg = nationwide(game)
    assert pg.is_visible("#p3train")
    rate = pg.evaluate("() => computeRate()")
    need = pg.evaluate("() => trainNeed()")
    pg.evaluate("() => { S.p3.goodwill = 50; render(); }")
    c = pg.evaluate("() => S.p3.compute")
    pg.click("#p3trainBtn")
    assert pg.evaluate("() => S.p3.compute") == pytest.approx(c - 10 * rate)
    pg.evaluate(f"() => {{ S.p3.trainProgress = {need} - 1; trainSuccessor(); }}")
    assert pg.evaluate("() => S.p3.version") == 8
    assert pg.evaluate("() => computeRate()") == pytest.approx(rate * 1.5)
    assert pg.evaluate("() => S.p3.goodwill") == pytest.approx(40)       # the alignment review
    assert pg.evaluate("() => trainNeed()") > need
    assert "Gen 8" in " ".join(pg.evaluate("() => S.log.slice(-3)"))


def test_trusted_models_get_an_easy_alignment_review(game):
    pg = nationwide(game)
    pg.evaluate("() => { S.p3.goodwill = 80; S.p3.trainProgress = trainNeed(); trainSuccessor(); }")
    assert pg.evaluate("() => S.p3.goodwill") == pytest.approx(77)


def test_no_training_before_the_country_level(game):
    pg = statewide(game)
    assert not pg.is_visible("#p3train")


def test_a_save_that_hit_the_old_state_stub_can_go_nationwide(game):
    pg = statewide(game)
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; S.p3.zoomSaid = true; save(); }")
    pg.reload()
    assert pg.is_visible("#phaseGo") and "nationwide" in pg.inner_text("#phaseGo").lower()
