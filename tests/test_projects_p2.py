import pytest

from conftest import READY, run


def campus(game, **extra):
    pg = game({**READY, "debt": 0, "funds": 5e9, **extra})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("() => { S.rival.next = 1e9; S.nextChip = 1e9; S.p2.nextOffer = 1e9; S.p2.nextColo = 1e9; S.p2.offers = []; }")
    return pg


def has(pg, pid):
    pg.evaluate("() => render()")
    return pg.query_selector(f"button[data-id='{pid}']") is not None


# project id -> JS that makes its trigger true
TRIGGERS = {
    "resdesk": "S.p2.contractN = 1",
    "sales2": "S.p2.contractN = 3",
    "vp": "S.p2.round = 1",
    "sovereign2": "S.p2.contractN = 5",
    "partner": "S.chipIdx = S.p2.startChip + 1",
    "refurb": "S.chipIdx = 5",
    "inference": "S.chipIdx = 6",
    "liquid": "S.p2.builds.push({kind: 'hall', done: 0}, {kind: 'hall', done: 0})",
    "prefab": "S.p2.builds.push({kind: 'hall', done: 0})",
    "lawyer": "S.p2.queueN = 1",
    "btm": "S.p2.builds.push({kind: 'turbine', done: 0}, {kind: 'turbine', done: 0})",
    "nuclearppa": "S.p2.ipo = {at: S.t, px0: 1, walk: 1, shock: 1, lastFollowOn: -1e9, lastSecondary: -1e9, lockupSaid: false}",
    "securitize": "S.p2.contracts.push({id: 'cx', n: 99, who: 'A lab', mw: 250, minGen: 0, start: S.t + 999, end: S.t + 2000, fee: 1, upfront: 1, status: 'waiting'})",
    "silicon": "S.p2.ipo = {at: S.t, px0: 1, walk: 1, shock: 1, lastFollowOn: -1e9, lastSecondary: -1e9, lockupSaid: false}",
    "pledge2": "for (let i = 0; i < 20; i++) S.p2.builds.push({kind: 'hall', done: 0})",
}


@pytest.mark.parametrize("pid,trigger", TRIGGERS.items())
def test_project_appears_only_when_triggered(game, pid, trigger):
    pg = campus(game)
    assert not has(pg, pid), f"{pid} showed before its trigger"
    pg.evaluate(f"() => {{ {trigger}; }}")
    assert has(pg, pid)


def test_rebrand_comes_after_series_e(game):
    pg = campus(game)
    assert not has(pg, "rebrand")
    pg.evaluate("() => { S.p2.round = 1; }")
    assert has(pg, "rebrand")


def buy(pg, pid, trigger=None):
    if trigger: pg.evaluate(f"() => {{ {trigger}; }}")
    pg.evaluate("() => render()")
    pg.click(f"button[data-id='{pid}']")


def test_hall_projects(game):
    pg = campus(game)
    buy(pg, "liquid", TRIGGERS["liquid"])
    assert pg.evaluate("() => hallMWAt()") == 150                  # two halls at 75 MW
    buy(pg, "prefab")
    pg.click("#buildHall")
    assert pg.evaluate("() => S.p2.builds[S.p2.builds.length - 1].done - S.t") == pytest.approx(90 * 0.6)


def test_turbines_and_grid_projects(game):
    pg = campus(game)
    buy(pg, "btm", TRIGGERS["btm"])
    assert pg.evaluate("() => powerAt() - gridAt()") == 140
    grid = pg.evaluate("() => S.p2.grid")
    buy(pg, "nuclearppa", TRIGGERS["nuclearppa"])
    assert pg.evaluate("() => S.p2.grid") == grid + 200


def test_queue_discounts_stack(game):
    pg = campus(game)
    base = pg.evaluate("() => queueSecs()")
    buy(pg, "lawyer", TRIGGERS["lawyer"])
    pg.evaluate("() => { S.p2.model.done.lobbyist = true; }")
    assert pg.evaluate("() => queueSecs()") == pytest.approx(base * 1.3 * 0.7 * 0.5)   # queueN went 0 -> 1 in the trigger


def test_offer_projects(game):
    pg = campus(game)
    pg.evaluate("() => { makeOffer(); }")
    before = pg.evaluate("() => { const o = S.p2.offers[0]; return o.upfront / o.mw / o.term; }")
    buy(pg, "resdesk", TRIGGERS["resdesk"])
    pg.evaluate("() => { S.p2.offers = []; makeOffer(); }")
    o = pg.evaluate("() => S.p2.offers[0]")
    gp = pg.evaluate(f"() => genPrice({o['minGen']})")
    assert o["upfront"] / o["mw"] / o["term"] == pytest.approx(550 * gp * 1.2)
    buy(pg, "sovereign2", TRIGGERS["sovereign2"])
    fee = pg.evaluate("""() => { S.p2.offers = []; for (let i = 0; i < 60; i++) { makeOffer();
      const o = S.p2.offers[S.p2.offers.length - 1]; if (o.who === 'A sovereign AI fund') return o.fee / o.mw / genPrice(o.minGen); } return null; }""")
    assert fee == pytest.approx(275 * 1.3)
    assert before > 0


def test_chip_projects(game):
    pg = campus(game)
    pg.evaluate(f"() => {{ {TRIGGERS['partner']}; }}")
    price = pg.evaluate("() => gpuPrice()")
    buy(pg, "partner")
    assert pg.evaluate("() => gpuPrice()") == pytest.approx(price * 0.9)
    pg.evaluate("() => { S.chipIdx = 6; S.fleet = {3: 1000, 6: 100}; S.gpus = 1100; }")
    v = pg.evaluate("() => tradeValue(3)")
    buy(pg, "refurb")
    assert pg.evaluate("() => tradeValue(3)") == pytest.approx(v * 0.4 / 0.25)
    pg.evaluate("() => { S.chipIdx = 20; }")
    floor = pg.evaluate("() => odRate(3) / (OD_RATE * genPrice(3))")
    buy(pg, "inference")
    assert pg.evaluate("() => odRate(3) / (OD_RATE * genPrice(3))") == pytest.approx(floor * 2)


def test_money_and_hype_projects(game):
    pg = campus(game, hype=80)
    buy(pg, "securitize", TRIGGERS["securitize"])
    assert pg.evaluate("() => drawSize()") == pytest.approx(0.8 * 250 * 300000 * 1.5, rel=0.01)
    hype = pg.evaluate("() => S.hype")
    buy(pg, "rebrand", "S.p2.round = 1")
    assert pg.evaluate("() => S.hype") == pytest.approx(hype + 30)


def test_campus_robots_build_on_their_own(game):
    pg = campus(game)
    assert not has(pg, "robots")
    pg.evaluate("() => { S.p2.ipo = {at: S.t, px0: 1, walk: 1, shock: 1, lastFollowOn: -1e9, lastSecondary: -1e9, lockupSaid: false}; S.p2.grid = 60; }")
    assert has(pg, "robots")
    pg.click("button[data-id='robots']")
    before = pg.evaluate("() => S.p2.builds.length")
    run(pg, 30)
    kinds = pg.evaluate("() => S.p2.builds.slice(%d).map((b) => b.kind)" % before)
    assert "hall" in kinds and "turbine" in kinds
    assert "robots" in pg.inner_text("#console").lower()


def test_robots_say_what_they_are_doing(game):
    pg = campus(game)
    assert not pg.is_visible("#robotLine")
    pg.evaluate("() => { S.p2.ipo = {at: S.t, px0: 1, walk: 1, shock: 1, lastFollowOn: -1e9, lastSecondary: -1e9, lockupSaid: false}; S.p2.grid = 60; render(); }")
    pg.click("button[data-id='robots']")
    run(pg, 25)
    line = pg.inner_text("#robotLine")
    assert line.startswith("Robots: built") and "hall" in line and "turbine" in line and "next:" in line
    pg.evaluate("() => { S.funds = 1e6; render(); }")
    assert "waiting for cash" in pg.inner_text("#robotLine")
