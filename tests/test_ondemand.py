import pytest

from conftest import READY, run

OD = 300 * 0.8          # $/MW/s for the newest generation at utilization


def campus(game, **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("() => { S.p2.offers = []; S.p2.nextOffer = 1e9; S.rival.next = 1e9; S.nextChip = 1e9; }")
    return pg


def fleet_mw(pg):
    return pg.evaluate("() => usedKW() / 1000")


def test_old_fleet_earns_on_demand(game):
    pg = campus(game)
    assert pg.evaluate("() => onDemandRevenue()") == pytest.approx(fleet_mw(pg) * OD)
    funds = pg.evaluate("() => S.funds")
    run(pg, 10)
    assert pg.evaluate("() => S.funds") == pytest.approx(funds + 10 * fleet_mw(pg) * OD, rel=1e-6)


def test_older_generations_earn_less_but_still_earn(game):
    pg = campus(game)
    pg.evaluate("() => { S.chipIdx = 4; }")
    assert pg.evaluate("() => onDemandRevenue()") == pytest.approx(fleet_mw(pg) * OD * 0.7)
    pg.evaluate("() => { S.chipIdx = 20; }")
    assert pg.evaluate("() => onDemandRevenue()") == pytest.approx(fleet_mw(pg) * OD * 0.15)


def test_contracted_gpus_leave_on_demand(game):
    pg = campus(game)
    pg.evaluate("() => { makeOffer(true); const o = S.p2.offers[0]; o.start = S.t + 1; acceptOffer(o.id); }")
    run(pg, 2)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "active"
    assert pg.evaluate("() => onDemandRevenue()") == pytest.approx((fleet_mw(pg) - 30) * OD)


def test_spot_pauses_on_demand_then_restores(game):
    pg = campus(game)
    full = pg.evaluate("() => onDemandRevenue()")
    funds = pg.evaluate("() => S.funds")
    pg.click("#spot")
    assert pg.evaluate("() => S.funds") > funds
    assert pg.evaluate("() => onDemandRevenue()") == pytest.approx(full / 2)
    run(pg, 31)
    assert pg.evaluate("() => onDemandRevenue()") == pytest.approx(full)


def test_depreciation_project(game):
    pg = campus(game)
    assert not pg.query_selector("button[data-id='depr6']")
    pg.evaluate("() => { S.chipIdx = 4; }")
    run(pg, 1)
    hype = pg.evaluate("() => S.hype")
    pg.click("button[data-id='depr6']")
    assert pg.evaluate("() => S.hype") == pytest.approx(hype + 20)


def test_newer_chips_rent_for_more(game):
    pg = campus(game)
    pg.evaluate("() => { S.chipIdx = 4; S.fleet = {4: 10000}; S.gpus = 10000; }")
    mw = fleet_mw(pg)
    assert pg.evaluate("() => onDemandRevenue()") == pytest.approx(mw * OD * (1.6 / 1.4))
    offer = pg.evaluate("() => { S.p2.offers = []; makeOffer(); return S.p2.offers[0]; }")
    assert offer["fee"] == pytest.approx(offer["mw"] * 275 * (1.6 / 1.4) ** (offer["minGen"] - 3))


def test_parallax_deals_keep_pace_with_the_treadmill(game):
    pg = campus(game)
    for idx in (3, 12):
        mw = pg.evaluate(f"() => {{ S.chipIdx = {idx}; return dealSize() / gpuPrice() * newest().kw / 1000; }}")
        assert mw == pytest.approx(20, rel=0.05)
