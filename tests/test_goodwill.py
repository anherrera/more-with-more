import pytest

from conftest import MID, READY, run


def campus(game, **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("() => { S.rival.next = 1e9; S.nextChip = 1e9; townOf().v = 60; render(); }")
    return pg


@pytest.mark.parametrize("pid,drop", [("ratepayer", 15), ("waterpositive", 10), ("paytaxes", 10)])
def test_goodwill_projects_lower_opposition(game, pid, drop):
    pg = campus(game, funds=1e10, hype=200)
    assert pg.query_selector(f"button[data-id='{pid}']")
    pg.evaluate(f"() => buyProject('{pid}')")
    assert pg.evaluate("() => townOf().v") == 60 - drop


def test_water_positive_fixes_the_towns_pipes(game):
    pg = campus(game, funds=1e10)
    w = pg.evaluate("() => S.p2.extraWater || 0")
    pg.evaluate("() => buyProject('waterpositive')")
    assert pg.evaluate("() => S.p2.extraWater") > w


def test_moratorium_gets_the_principles_quip(game):
    pg = campus(game)
    pg.evaluate("() => { townOf().v = 95; }")
    run(pg, 2)
    assert "principles" in pg.inner_text("#console")


def test_nuclear_restart_gets_a_new_name(game):
    pg = campus(game)
    pg.evaluate("() => { PROPOSALS.find((p) => p.id === 'nuclear').apply(1); }")
    run(pg, 241)
    assert "tested poorly" in pg.inner_text("#console")


def test_other_neoclouds_make_the_news(game):
    pg = game(MID)
    names = pg.evaluate("() => NEOCLOUD_NEWS.map(([l]) => l).join(' ')")
    assert "Flarewell" in names and "Elsewhere Cloud" in names
    pg.evaluate("() => { const r = Math.random; Math.random = () => 0.01; S.rival.next = S.t; rivalNews(); Math.random = r; render(); }")
    text = pg.inner_text("#console")
    assert "Flarewell" in text or "Elsewhere" in text
