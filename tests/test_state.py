import pytest

from conftest import run
from test_planet import planet


def statewide(game):
    pg = planet(game)
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; render(); }")
    pg.click("#phaseGo")
    pg.evaluate("() => { S.p3.compute = 1e12; render(); }")
    return pg


def built(pg, i):
    pg.evaluate(f"() => {{ claim({i}); S.p3.tiles[{i}].done = S.t; }}")
    run(pg, 1)


def test_zooming_out_goes_statewide(game):
    pg = planet(game)
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; render(); }")
    county_gw = pg.evaluate("() => onlineGW()")
    pg.click("#phaseGo")
    assert pg.evaluate("() => S.p3.level") == 1
    assert pg.evaluate("() => S.p3.homeGW") == pytest.approx(county_gw)
    assert pg.evaluate("() => S.p3.tiles.every((t) => t.state === 'wild')")
    assert "State level" in pg.inner_text("#phaseBar") and "State level" in pg.inner_text("#p3level")
    assert pg.evaluate("() => traitOf(S.p3.tiles[0]).gw") >= 10


def test_a_built_state_needs_power_before_it_counts(game):
    pg = statewide(game)
    gw = pg.evaluate("() => onlineGW()")
    built(pg, 0)
    assert pg.evaluate("() => S.p3.tiles[0].state") == "unpowered"
    assert pg.evaluate("() => onlineGW()") == pytest.approx(gw)
    pg.evaluate("() => render()")
    assert pg.is_visible("#p3power") and pg.evaluate("() => S.p3.tiles[0].name") in pg.inner_text("#p3power")


def test_buying_the_utility_is_fast_and_costs_goodwill(game):
    pg = statewide(game)
    built(pg, 0)
    g = pg.evaluate("() => S.p3.goodwill")
    pg.evaluate("() => render()")
    pg.click("#p3power button[data-power='utility']")
    assert pg.evaluate("() => S.p3.tiles[0].state") == "powering"
    assert pg.evaluate("() => S.p3.goodwill") == pytest.approx(g - 5)
    run(pg, 21)
    assert pg.evaluate("() => S.p3.tiles[0].state") == "online"


def test_solar_only_where_its_sunny_and_nuclear_is_bigger(game):
    pg = statewide(game)
    sunny = pg.evaluate("() => S.p3.tiles.findIndex((t) => t.trait === 'sunbelt')")
    other = pg.evaluate("() => S.p3.tiles.findIndex((t) => t.trait !== 'sunbelt')")
    assert pg.evaluate(f"() => powerOptions({sunny}).map((o) => o.id)").count("solar") == 1
    assert "solar" not in pg.evaluate(f"() => powerOptions({other}).map((o) => o.id)")
    built(pg, other)
    gw = pg.evaluate("() => onlineGW()")
    pg.evaluate(f"() => powerTile({other}, 'nuclear')")
    run(pg, 91)
    assert pg.evaluate(f"() => S.p3.tiles[{other}].state") == "online"
    assert pg.evaluate("() => onlineGW()") - gw == pytest.approx(1.5 * pg.evaluate(f"() => traitOf(S.p3.tiles[{other}]).gw"))


def test_governors_bid_against_each_other(game):
    pg = statewide(game)
    before = pg.evaluate("() => claimCost(1)")
    pg.evaluate("() => claim(0)")
    assert pg.evaluate("() => claimCost(1)") < before * 0.85
    run(pg, 61)
    assert pg.evaluate("() => claimCost(1) / computeRate()") == pytest.approx(before / pg.evaluate("() => computeRate()"), rel=0.05)


def test_low_goodwill_passes_the_ai_infrastructure_act(game):
    pg = statewide(game)
    normal = pg.evaluate("() => { S.p3.goodwill = 60; return [claimCost(0), tileBuildSecs(0)]; }")
    low = pg.evaluate("() => { S.p3.goodwill = 20; return [claimCost(0), tileBuildSecs(0)]; }")
    assert low[0] == pytest.approx(2 * normal[0]) and low[1] == pytest.approx(normal[1])
    pg.evaluate("() => render()")
    assert "AI Infrastructure Act" in pg.inner_text("#p3goodwillNote")


def test_state_level_survives_reload(game):
    pg = statewide(game)
    built(pg, 0)
    pg.evaluate("() => save()")
    pg.reload()
    assert pg.evaluate("() => [S.p3.level, S.p3.tiles[0].state]") == [1, "unpowered"]


def test_next_zoom_is_a_stub_for_the_country(game):
    pg = statewide(game)
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; render(); }")
    assert "nationwide" in pg.inner_text("#phaseGo").lower()
    pg.click("#phaseGo")
    pg.evaluate("() => { zoomOut(); render(); }")
    assert pg.evaluate("() => S.p3.level") == 1
    assert len([l for l in pg.evaluate("() => S.log") if "country is next" in l]) == 1


def test_a_save_that_hit_the_old_county_stub_can_go_statewide(game):
    pg = planet(game)
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; S.p3.zoomSaid = true; save(); }")
    pg.reload()
    assert pg.is_visible("#phaseGo") and "statewide" in pg.inner_text("#phaseGo").lower()
