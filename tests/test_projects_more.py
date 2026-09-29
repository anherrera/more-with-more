import pytest

from conftest import MID, READY, run


def campus(game, county="strong", **extra):
    pg = game({**READY, "debt": 0, "funds": 5e9, "hype": 90, **extra})
    pg.click("button[data-id='ground']")
    pg.click(f"button[data-county='{county}']")
    pg.evaluate("""() => { S.rival.next = 1e9; S.nextChip = 1e9; S.p2.nextOffer = 1e9; S.p2.nextColo = 1e9; S.p2.offers = [];
      firesOf().next = 1e9; S.p2.nextDrought = 1e9; }""")
    return pg


def btn(pg, pid):
    pg.evaluate("() => render()")
    return pg.query_selector(f"button[data-id='{pid}']")


def test_hype_projects_cost_hype_not_money(game):
    pg = campus(game)
    b = btn(pg, "benchmarks")
    assert "−20 hype" in b.inner_text()
    funds, hype = pg.evaluate("() => [S.funds, S.hype]")
    b.click()
    assert pg.evaluate("() => [S.funds, S.hype]") == pytest.approx([funds, hype - 20])


def test_hype_projects_need_hype_to_spare(game):
    pg = campus(game, hype=15)
    assert btn(pg, "benchmarks").is_disabled()


@pytest.mark.parametrize("pid,check", [
    ("benchmarks", "() => { S.p2.offers = []; makeOffer(); const o = S.p2.offers[0]; return o.fee / o.mw / genPrice(o.minGen) / 275; }"),
    ("disclosewater", "() => waterAt() / 5"),
    ("paytaxes", "() => landCost() / LAND.cost"),
])
def test_hype_project_effects(game, pid, check):
    pg = campus(game)
    before = pg.evaluate(check)
    btn(pg, pid).click()
    after = pg.evaluate(check)
    expected = {"benchmarks": 1.1, "disclosewater": 1.2, "paytaxes": 0.8}[pid]
    assert after == pytest.approx(before * expected)


def test_honest_earnings_call_needs_the_ipo(game):
    pg = campus(game)
    assert btn(pg, "honestcall") is None
    pg.evaluate("() => { S.p2.ipo = {at: S.t, px0: 1, walk: 1, shock: 1, lastFollowOn: -1e9, lastSecondary: -1e9, lockupSaid: false}; }")
    assert btn(pg, "honestcall") is not None


def test_phase1_benchmark_honesty(game):
    pg = game({**MID, "hype": 90})
    b = pg.query_selector("button[data-id='benchmarks1']")
    demand = pg.evaluate("() => S.demandMult")
    b.click()
    assert pg.evaluate("() => S.demandMult") == pytest.approx(demand * 1.3)


def test_refurb_and_inference_unlock_one_generation_behind(game):
    pg = campus(game)
    pg.evaluate("() => { S.chipIdx = 4; }")          # the P4 fleet is now one behind
    assert btn(pg, "refurb") is not None and btn(pg, "inference") is not None


def test_water_and_fire_projects(game):
    pg = campus(game)
    pg.evaluate("() => { S.p2.builds.push({kind: 'hall', done: 0}, {kind: 'hall', done: 0}); S.p2.drought = {until: S.t + 1}; }")
    before = pg.evaluate("() => waterMWAt()")
    btn(pg, "drycooling").click()
    assert pg.evaluate("() => waterMWAt()") == pytest.approx(before * 2)
    btn(pg, "golfcourse").click()
    assert pg.evaluate("() => waterMWAt()") == pytest.approx(before * 2 + 2 / 0.005)
    pg.evaluate("() => { firesOf().n = 1; }")
    btn(pg, "firecrew").click()
    pg.evaluate("() => { firesOf().next = S.t + 1; }")
    run(pg, 2)
    assert pg.evaluate("() => S.fires.out.until - S.t") == pytest.approx(59, abs=1)


def test_follow_ons_are_capped(game):
    pg = campus(game)
    pg.evaluate("""() => { S.p2.round = 1; S.p2.ipo = {at: S.t - 1e4, px0: 1, walk: 1, shock: 1, lastFollowOn: -1e9, lastSecondary: -1e9, lockupSaid: true};
      S.cap = S.cap || capOf(); S.cap.lastVal = 1e12; }""")
    got = []
    for _ in range(4):
        f = pg.evaluate("() => S.funds"); pg.evaluate("() => { followOn(); S.p2.ipo.lastFollowOn = -1e9; }")
        got.append(pg.evaluate("() => S.funds") - f)
    assert [g <= 600e6 + 1 for g in got[:3]] == [True] * 3 and got[3] == 0
