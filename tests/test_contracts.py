import pytest

from conftest import READY, run


def campus(game, county="strong", **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click(f"button[data-county='{county}']")
    pg.evaluate("() => { S.p2.legacyMW = 0; }")        # isolate contract money from the legacy fee
    return pg


def first_offer(pg):
    return pg.evaluate("() => S.p2.offers[0]")


def test_first_offer_is_your_old_lab(game):
    pg = campus(game)
    o = first_offer(pg)
    assert o["who"].startswith("Your old lab") and o["mw"] == 30
    assert "Your old lab" in pg.inner_text("#offers")


def test_sign_pays_upfront_and_adds_backlog(game):
    pg = campus(game)
    o = first_offer(pg)
    funds = pg.evaluate("() => S.funds")
    pg.click(f"button[data-accept='{o['id']}']")
    assert pg.evaluate("() => S.funds") == pytest.approx(funds + o["upfront"])
    assert pg.evaluate("() => backlogMW()") == 30
    assert o["upfront"] == 30 * o["term"] * 550


def test_forecast_red_then_green(game):
    pg = campus(game)
    o = first_offer(pg)
    assert "Short 30 MW by then" in pg.inner_text("#offers")
    pg.evaluate(f"() => S.p2.builds.push({{kind: 'hall', done: {o['start'] - 10}}})")
    run(pg, 1)
    assert "You'll have 30 MW free by then" in pg.inner_text("#offers")


def test_delivered_contract_pays_fee(game):
    pg = campus(game)
    o = first_offer(pg)
    pg.evaluate("() => S.p2.builds.push({kind: 'hall', done: 0})")
    pg.click(f"button[data-accept='{o['id']}']")
    pg.evaluate(f"() => {{ S.t = {o['start']} - 1; }}")
    run(pg, 1)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "active"
    funds = pg.evaluate("() => S.funds")
    run(pg, 10)
    assert pg.evaluate("() => S.funds") == pytest.approx(funds + 10 * 30 * 275, rel=1e-6)
    assert pg.inner_text("#gpuCount") == "30 MW"


def test_late_is_free_for_the_first_minute_then_costs(game):
    pg = campus(game)
    o = first_offer(pg)
    pg.click(f"button[data-accept='{o['id']}']")
    pg.evaluate(f"() => {{ S.t = {o['start']}; }}")
    run(pg, 1)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "late"
    funds = pg.evaluate("() => S.funds")
    run(pg, 59)
    assert pg.evaluate("() => S.funds") == pytest.approx(funds)
    run(pg, 10)
    assert pg.evaluate("() => S.funds") < funds
    assert "LATE" in pg.inner_text("#contracts")


def test_warning_then_default(game):
    pg = campus(game)
    o = first_offer(pg)
    pg.click(f"button[data-accept='{o['id']}']")
    pg.evaluate(f"() => {{ S.t = {o['start']}; }}")
    run(pg, 121)
    assert "walks in 60s" in pg.inner_text("#console")
    funds = pg.evaluate("() => S.funds")
    run(pg, 60)
    c = pg.evaluate("() => S.p2.contracts[0]")
    assert c["status"] == "defaulted"
    assert pg.evaluate("() => S.funds") < funds - o["upfront"] / 2 + 1
    assert pg.evaluate("() => S.nextDraw - S.t") >= 119


def test_renegotiate_once(game):
    pg = campus(game)
    o = first_offer(pg)
    pg.click(f"button[data-accept='{o['id']}']")
    hype = pg.evaluate("() => S.hype")
    cid = pg.evaluate("() => S.p2.contracts[0].id")
    pg.click(f"button[data-reneg='{cid}']")
    c = pg.evaluate("() => S.p2.contracts[0]")
    assert c["start"] == o["start"] + 120 and c["reneg"] is True
    assert pg.evaluate("() => S.hype") == pytest.approx(hype - 5)
    assert not pg.is_visible(f"button[data-reneg='{cid}']")


def test_decline_is_free_and_offers_expire_no_sooner_than_45s(game):
    pg = campus(game)
    run(pg, 200)                                   # let normal offers arrive
    offers = pg.evaluate("() => S.p2.offers.filter((o) => !o.who.startsWith('Your old lab'))")
    assert offers and all(o["expires"] - o["start"] < 0 for o in offers)
    assert all(o["expires"] >= 0 for o in offers)
    fresh = pg.evaluate("() => { makeOffer(); render(); return S.p2.offers[S.p2.offers.length - 1]; }")
    assert fresh["expires"] - pg.evaluate("() => S.t") >= 45
    funds, hype = pg.evaluate("() => [S.funds, S.hype]")
    pg.click(f"button[data-decline='{fresh['id']}']")
    assert pg.evaluate("() => [S.funds, S.hype]") == [funds, hype]


def test_allocation_in_signing_order(game):
    pg = campus(game)
    pg.evaluate("""() => { S.p2.offers = []; S.p2.builds.push({kind: 'hall', done: 0});
      for (let i = 0; i < 2; i++) { makeOffer(); const o = S.p2.offers[S.p2.offers.length - 1];
        o.mw = 30; o.start = S.t + 5; acceptOffer(o.id); } }""")
    run(pg, 6)
    assert pg.evaluate("() => S.p2.contracts.map((c) => c.status)") == ["active", "late"]
    assert pg.evaluate("() => deliveredMW()") == 30


def test_sign_survives_rerender(game):
    pg = campus(game)
    o = first_offer(pg)
    pg.evaluate("() => { for (let i = 0; i < 5; i++) render(); }")
    pg.click(f"button[data-accept='{o['id']}']")
    assert pg.evaluate("() => S.p2.contracts.length") == 1


def test_big_step_defaults_cleanly(game):
    pg = campus(game)
    o = first_offer(pg)
    pg.click(f"button[data-accept='{o['id']}']")
    pg.evaluate(f"() => {{ S.t = {o['start']}; step(1); step(200); render(); }}")
    assert pg.evaluate("() => S.p2.contracts[0].status") == "defaulted"
    assert pg.evaluate("() => Number.isFinite(S.funds) && Number.isFinite(S.hype)")


def test_reload_mid_campus(game):
    pg = campus(game)
    o = first_offer(pg)
    pg.click(f"button[data-accept='{o['id']}']")
    pg.click("#buildHall")
    pg.click("#requestQueue")
    before = pg.evaluate("() => JSON.stringify(S.p2)")
    pg.evaluate("() => save()")
    pg.reload()
    assert pg.evaluate("() => JSON.stringify(S.p2)") == before


def test_debt_sized_on_backlog(game):
    pg = campus(game, hype=80)
    pg.evaluate("""() => { S.p2.offers = []; makeOffer(); const o = S.p2.offers[0]; o.mw = 100; acceptOffer(o.id); }""")
    assert pg.evaluate("() => drawSize()") == pytest.approx(0.8 * 100 * 300000)
    assert pg.is_visible("#draw")


def test_default_is_never_profitable(game):
    pg = campus(game)
    o = first_offer(pg)
    funds = pg.evaluate("() => S.funds")
    pg.click(f"button[data-accept='{o['id']}']")
    pg.evaluate(f"() => {{ S.t = {o['start']}; }}")
    run(pg, 181)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "defaulted"
    assert pg.evaluate("() => S.funds") < funds


def test_push_date_when_late_counts_from_now(game):
    pg = campus(game)
    o = first_offer(pg)
    pg.click(f"button[data-accept='{o['id']}']")
    pg.evaluate(f"() => {{ S.t = {o['start']} + 150; }}")
    run(pg, 1)
    cid = pg.evaluate("() => S.p2.contracts[0].id")
    now = pg.evaluate("() => S.t")
    pg.click(f"button[data-reneg='{cid}']")
    c = pg.evaluate("() => S.p2.contracts[0]")
    assert c["status"] == "waiting"
    assert c["start"] == now + 120
    assert c["end"] - c["start"] == o["term"]
