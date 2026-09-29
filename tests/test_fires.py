import pytest

from conftest import MID, READY, run


def ignite(pg):
    pg.evaluate("() => { firesOf().next = S.t + 1; }")
    run(pg, 2)


def phase1(game):
    pg = game({**MID, "debt": 0})
    pg.evaluate("() => { S.nextChip = 1e9; S.rival.next = 1e9; firesOf().next = 1e9; }")
    return pg


def test_fire_takes_gpus_offline_then_most_come_back(game):
    pg = phase1(game)
    ignite(pg)
    n = pg.evaluate("() => S.fires.out.n")
    assert n > 0 and pg.evaluate("() => S.gpus") == 5000 - n
    assert "Fire in" in pg.inner_text("#console")
    run(pg, 120)
    lost = pg.evaluate("() => S.fires.lost")
    assert lost == pytest.approx(n * 0.2, abs=2)
    assert pg.evaluate("() => S.gpus") == 5000 - lost
    assert "Root cause:" in pg.inner_text("#console")


def test_insurance_pays_later_and_premium_rises(game):
    pg = phase1(game)
    ignite(pg)
    run(pg, 120)
    owed = pg.evaluate("() => S.fires.payout.amt")
    funds = pg.evaluate("() => S.funds")
    run(pg, 60)
    assert pg.evaluate("() => S.fires.payout") is None
    assert pg.evaluate("() => S.fires.premium") > 0
    assert "insurance" in pg.inner_text("#console").lower()
    assert owed > 0 and pg.evaluate("() => S.funds") > funds


def test_suppression_and_batteries(game):
    pg = phase1(game)
    base_gap, base_share = pg.evaluate("() => [fireGap(0.5), fireShare(0.5)]")
    pg.evaluate("() => { S.done.suppression = true; S.done.ups = true; }")
    assert pg.evaluate("() => fireGap(0.5)") == pytest.approx(base_gap * 2)
    assert pg.evaluate("() => fireShare(0.5)") == pytest.approx(base_share / 2)


def test_fire_projects_appear_after_the_first_fire(game):
    pg = phase1(game)
    assert not pg.query_selector("button[data-id='suppression']")
    ignite(pg)
    pg.evaluate("() => render()")
    assert pg.query_selector("button[data-id='suppression']") and pg.query_selector("button[data-id='ups']")


def test_phase2_fire_makes_contract_late(game):
    pg = game({**READY, "debt": 0})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("""() => { S.rival.next = 1e9; S.nextChip = 1e9; firesOf().next = 1e9; S.fleet = {3: Math.round(30000 / chip(3).kw)};
      S.gpus = S.fleet[3]; const o = S.p2.offers[0]; o.start = S.t + 1; acceptOffer(o.id); }""")
    run(pg, 2)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "active"
    ignite(pg)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "late"


def test_fire_survives_reload(game):
    pg = phase1(game)
    ignite(pg)
    before = pg.evaluate("() => JSON.stringify(S.fires)")
    pg.evaluate("() => save()")
    pg.reload()
    assert pg.evaluate("() => JSON.stringify(S.fires)") == before


def test_fire_projects_are_priced_for_the_phase(game):
    pg = game({**MID, "gen": 2, "funds": 30000, "debt": 0})
    pg.evaluate("() => { firesOf().n = 1; render(); }")
    b = pg.query_selector("button[data-id='suppression']")
    assert "$10.0K" in b.inner_text() and b.is_enabled()
    assert pg.evaluate("() => projectCost(PROJECTS.find((p) => p.id === 'ups'))") == 25000
    pg.evaluate("() => { S.gen = 7; S.phase = 2; }")
    assert pg.evaluate("() => projectCost(PROJECTS.find((p) => p.id === 'suppression'))") == 2e6


def test_fires_show_in_the_alert_line_until_they_are_over(game):
    pg = phase1(game)
    assert not pg.is_visible("#alerts")
    ignite(pg)
    text = pg.inner_text("#alerts")
    assert "Fire in" in text and "GPUs down" in text and "back in" in text
    run(pg, 120)
    assert "Insurance pays" in pg.inner_text("#alerts")
    run(pg, 60)
    assert not pg.is_visible("#alerts")


def test_droughts_show_in_the_alert_line(game):
    pg = game({**READY, "debt": 0})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("() => { S.rival.next = 1e9; firesOf().next = 1e9; S.p2.nextDrought = S.t + 1; }")
    run(pg, 2)
    assert "Drought" in pg.inner_text("#alerts")
