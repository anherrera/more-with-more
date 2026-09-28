import pytest

from conftest import READY, run


def campus(game, county="strong", **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click(f"button[data-county='{county}']")
    return pg


def test_hall_costs_money_and_time(game):
    pg = campus(game)
    funds = pg.evaluate("() => S.funds")
    pg.click("#buildHall")
    assert pg.evaluate("() => S.funds") == pytest.approx(funds - 30e6)
    run(pg, 89)
    assert pg.evaluate("() => energizedAt()") == 0
    run(pg, 1)
    assert pg.evaluate("() => energizedAt()") == 50
    assert "Hall 1 is up" in pg.inner_text("#console")


def test_hall_uses_credits_first(game):
    pg = campus(game, credits=10e6)
    funds = pg.evaluate("() => S.funds")
    pg.click("#buildHall")
    assert pg.evaluate("() => S.credits") == 0
    assert pg.evaluate("() => S.funds") == pytest.approx(funds - 20e6)


def test_power_limits_energized(game):
    pg = campus(game, county="cheap")          # 50 MW grid
    pg.evaluate("() => { S.p2.builds.push({kind: 'hall', done: 0}, {kind: 'hall', done: 0}); }")
    run(pg, 1)
    assert pg.evaluate("() => energizedAt()") == 50
    assert pg.inner_text("#p2limit").startswith("power: 50 MW of halls are very expensive sheds")
    assert "50 MW dark" in pg.inner_text("#halls")


def test_halls_limit_when_power_is_ahead(game):
    pg = campus(game)                           # 200 MW grid, no halls
    assert pg.inner_text("#p2limit").startswith("halls: 200 MW of power is waiting for a building")


def test_turbine_and_solar(game):
    pg = campus(game, county="cheap")
    pg.click("#buildTurbine")
    pg.click("#buildSolar")
    run(pg, 60)
    assert pg.evaluate("() => powerAt()") == 100
    run(pg, 120)
    assert pg.evaluate("() => powerAt()") == 130
    assert pg.evaluate("() => acresFree()") == 3000 - 150


def test_queue_adds_grid_and_gets_slower(game):
    pg = campus(game, county="cheap")           # +100 MW in 300 s
    pg.click("#requestQueue")
    assert pg.is_disabled("#requestQueue")
    run(pg, 300)
    assert pg.evaluate("() => [S.p2.grid, S.p2.queue]") == [150, None]
    assert pg.evaluate("() => queueSecs()") == pytest.approx(300 * 1.3)


def test_land_runs_out(game):
    pg = campus(game, county="strong")          # 1,500 acres
    pg.evaluate("() => { for (let i = 0; i < 75; i++) S.p2.builds.push({kind: 'hall', done: 0}); S.p2.grid = 99999; }")
    run(pg, 1)
    assert pg.evaluate("() => acresFree()") == 0
    assert pg.is_disabled("#buildHall")
    assert pg.inner_text("#p2limit").startswith("land")
