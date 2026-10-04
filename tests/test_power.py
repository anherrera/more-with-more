import pytest

from conftest import READY, run


def campus(game, county="strong", **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click(f"button[data-county='{county}']")
    return pg


def test_power_limits_energized(game):
    pg = campus(game, county="cheap")          # 50 MW grid
    pg.evaluate("() => { S.p2.builds.push({kind: 'hall', done: 0}, {kind: 'hall', done: 0}); }")
    run(pg, 1)
    assert pg.evaluate("() => energizedAt()") == 50
    assert pg.inner_text("#p2limit").startswith("power: 50 MW of halls are very expensive sheds")
    assert "1 dark (need 50 MW more power)" in pg.inner_text("#halls")


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
    pg.evaluate("() => { for (let i = 0; i < 75; i++) S.p2.builds.push({kind: 'hall', done: 0}); S.p2.grid = 99999; S.p2.extraWater = 999; }")
    run(pg, 1)
    assert pg.evaluate("() => acresFree()") == 0
    assert pg.is_disabled("#buildHall")
    assert pg.inner_text("#p2limit").startswith("land")


def test_hall_is_a_shell_that_adds_room(game):
    pg = campus(game)
    funds, room = pg.evaluate("() => [S.funds, roomNewest()]")
    pg.click("#buildHall")
    assert pg.evaluate("() => S.funds") == pytest.approx(funds - 10e6)
    run(pg, 89)
    assert pg.evaluate("() => roomNewest()") == room
    run(pg, 1)
    assert pg.evaluate("() => energizedAt()") == 50
    assert pg.evaluate("() => roomNewest()") == pytest.approx(room + 50000 / 2.744, abs=1)
    assert "Hall 1 is up" in pg.inner_text("#console")


def test_hall_does_not_take_credits(game):
    pg = campus(game, credits=10e6)
    pg.click("#buildHall")
    assert pg.evaluate("() => S.credits") == 10e6


def test_chips_keep_shipping_in_phase2(game):
    pg = campus(game)
    pg.evaluate("() => { S.nextChip = S.t + 1; }")
    run(pg, 2)
    assert pg.evaluate("() => S.chipIdx") == 4


def test_buy_adjacent_land(game):
    pg = campus(game, county="strong")
    acres, funds = pg.evaluate("() => [acresFree(), S.funds]")
    pg.click("#buyLand")
    assert pg.evaluate("() => acresFree()") == acres + 200
    assert pg.evaluate("() => S.funds") == pytest.approx(funds - 15e6)
    assert "$16.5M" in pg.inner_text("#buyLand")          # next parcel costs 10% more


def test_big_power_reads_in_gw(game):
    pg = campus(game)
    pg.evaluate("() => { S.p2.offers = []; makeOffer(); const o = S.p2.offers[0]; o.mw = 2650; render(); }")
    assert "2.65 GW" in pg.inner_text("#offers")
    assert "K MW" not in pg.inner_text("body")
    assert "K kW" not in pg.inner_text("body")


def test_colo_leases_in_20mw_blocks(game):
    pg = campus(game)
    pg.evaluate("() => { S.p2.market = 150; render(); }")
    leased, funds = pg.evaluate("() => [leasedKW(), S.funds]")
    cost = pg.evaluate("() => coloCost()")
    pg.click("#leaseColo")
    assert pg.evaluate("() => leasedKW()") == pytest.approx(leased + 20000)
    assert pg.evaluate("() => [S.p2.market, S.funds]") == pytest.approx([130, funds - cost])
    assert not pg.is_visible("#leases")                     # rack/cage/row buttons are a phase 1 thing


def test_colo_market_opens_in_chunks_not_a_trickle(game):
    pg = campus(game)
    pg.evaluate("() => { S.p2.market = 10; S.p2.nextColo = S.t + 100; render(); }")
    assert pg.is_disabled("#leaseColo") and "sold out" in pg.inner_text("#leaseColo")
    run(pg, 60)
    assert pg.evaluate("() => S.p2.market") == 10               # no trickle, so the button doesn't flicker
    run(pg, 41)
    assert pg.evaluate("() => S.p2.market") >= 50
    assert "A new colo opened" in pg.inner_text("#console")
    assert pg.is_enabled("#leaseColo")


def test_sold_out_market_is_named(game):
    pg = campus(game)
    pg.evaluate("() => { S.p2.market = 0; S.p2.nextColo = 1e9; S.fleet = {3: Math.floor(capKW() / chip(3).kw)}; S.gpus = S.fleet[3]; }")
    run(pg, 1)
    assert pg.inner_text("#limit").startswith("Leased capacity is sold out in this market")


def test_halls_line_counts_the_sheds(game):
    pg = campus(game, county="cheap")          # 50 MW grid
    pg.evaluate("() => { for (let i = 0; i < 4; i++) S.p2.builds.push({kind: 'hall', done: 0}); }")
    run(pg, 1)
    text = pg.inner_text("#halls")
    assert "4 built: 1 energized, 3 dark (need 150 MW more power)" in text


def test_land_total_includes_bought_parcels(game):
    pg = campus(game, county="strong")          # 1,500 acres
    pg.click("#buyLand")
    pg.click("#buyLand")
    assert pg.inner_text("#land") == "1,900 of 1,900 acres free (2 parcels bought)"


def test_owning_the_utility_makes_the_queue_fast_not_instant(game):
    pg = campus(game, county="strong")
    pg.evaluate("() => { S.funds = 1e10; S.p2.model.done.utility = true; S.p2.queueN = 40; render(); }")
    assert pg.evaluate("() => queueSecs()") == 30
    grid = pg.evaluate("() => S.p2.grid")
    pg.click("#requestQueue")
    pg.evaluate("() => { for (let i = 0; i < 4; i++) requestQueue(); }")   # spamming does nothing
    run(pg, 2)
    assert pg.evaluate("() => S.p2.grid") == grid               # nothing yet
    assert "your utility" in pg.inner_text("#requestQueue").lower()
    run(pg, 30)
    assert pg.evaluate("() => S.p2.grid") > grid
