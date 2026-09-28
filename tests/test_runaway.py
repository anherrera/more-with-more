import pytest

from conftest import READY, run


def campus(game, **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("() => { S.rival.next = 1e9; S.nextChip = 1e9; S.p2.nextOffer = 1e9; S.p2.nextColo = 1e9; }")
    return pg


def test_halls_cost_three_percent_more_each(game):
    pg = campus(game)
    funds = pg.evaluate("() => S.funds")
    pg.click("#buildHall")
    pg.click("#buildHall")
    assert pg.evaluate("() => S.funds") == pytest.approx(funds - 10e6 - 10e6 * 1.03)
    assert "$10.6M" in pg.inner_text("#buildHall")        # third hall: 10M x 1.03^2


def test_active_contract_rechecked(game):
    pg = campus(game)
    pg.evaluate("() => { const o = S.p2.offers[0]; o.start = S.t + 1; acceptOffer(o.id); }")
    run(pg, 2)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "active"
    pg.evaluate("() => { S.fleet = {}; S.gpus = 0; }")
    run(pg, 1)
    c = pg.evaluate("() => S.p2.contracts[0]")
    assert c["status"] == "late" and c["start"] == pg.evaluate("() => S.t")
    earned = pg.evaluate("() => S.p2.earned")
    run(pg, 5)
    assert pg.evaluate("() => S.p2.earned") == earned
    assert "Lost GPUs under" in pg.inner_text("#console")
