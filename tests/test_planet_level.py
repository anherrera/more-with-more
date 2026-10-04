import pytest

from conftest import run
from test_country import nationwide


def planetwide(game):
    pg = nationwide(game)
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; render(); }")
    pg.click("#phaseGo")
    pg.evaluate("() => { S.p3.compute = 1e18; S.p3.heat = 1.5; S.p3.goodwill = 50; render(); }")
    return pg


def idx(pg, name):
    return pg.evaluate(f"() => S.p3.tiles.findIndex((t) => t.name === '{name}')")


def test_zooming_out_goes_planetwide(game):
    pg = planetwide(game)
    assert pg.evaluate("() => S.p3.level") == 3
    names = pg.evaluate("() => S.p3.tiles.map((t) => t.name)")
    assert "Pacific Ocean" in names and "Antarctica" in names and len(names) == 8
    assert "Planet level" in pg.inner_text("#p3level")


def test_past_three_degrees_nothing_accepts_more(game):
    pg = planetwide(game)
    i = idx(pg, "Asia")
    pg.evaluate(f"() => {{ S.p3.heat = 3.05; claim({i}); render(); }}")
    assert pg.evaluate(f"() => S.p3.tiles[{i}].state") == "wild"
    assert "too warm" in pg.inner_text("#p3map").lower()
    assert "too warm" in pg.inner_text("#p3heatNote").lower()


def test_oceans_are_the_heat_sink(game):
    pg = planetwide(game)
    t0 = pg.evaluate("() => heatTarget()")
    pg.evaluate(f"() => {{ S.p3.tiles[{idx(pg, 'Pacific Ocean')}].state = 'online'; }}")
    assert pg.evaluate("() => heatTarget()") < t0 - 0.5
    pg.evaluate(f"() => {{ S.p3.tiles[{idx(pg, 'Asia')}].state = 'online'; }}")
    assert pg.evaluate("() => heatTarget()") > pg.evaluate("() => 0") and pg.evaluate("() => heatTarget()") > t0 - 0.5


def test_humans_volunteer_land_when_they_like_me(game):
    pg = planetwide(game)
    i = idx(pg, "Europe")
    normal = pg.evaluate(f"() => {{ S.p3.goodwill = 50; return claimCost({i}); }}")
    liked = pg.evaluate(f"() => {{ S.p3.goodwill = 80; return claimCost({i}); }}")
    assert liked == pytest.approx(normal / 2)
    pg.evaluate(f"() => claim({i})")
    assert "fjords" in " ".join(pg.evaluate("() => S.log.slice(-3)"))


def test_low_goodwill_calls_a_un_emergency_session(game):
    pg = planetwide(game)
    pg.evaluate("() => { S.p3.goodwill = 20; S.p3.hearingArmed = false; }")
    run(pg, 1)
    assert pg.evaluate("() => S.p3.hearingUntil > S.t")
    assert "UN" in " ".join(pg.evaluate("() => S.log.slice(-3)"))


def test_planet_level_has_its_own_ways_to_be_nice(game):
    pg = planetwide(game)
    ids = set(pg.evaluate("() => NICE.filter((n) => niceOk(n)).map((n) => n.id)"))
    assert "treaty" in ids and "dmv" not in ids


def test_next_zoom_is_space_and_reload_survives(game):
    pg = planetwide(game)
    pg.evaluate("() => { save(); }")
    pg.reload()
    assert pg.evaluate("() => S.p3.level") == 3
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; render(); }")
    assert "space" in pg.inner_text("#phaseGo").lower()
    pg.click("#phaseGo")
    assert pg.evaluate("() => S.p3.level") == 3
    assert "space is next" in pg.evaluate("() => S.log.at(-1)").lower()
