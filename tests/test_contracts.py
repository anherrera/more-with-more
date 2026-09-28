import pytest

from conftest import READY, run


def campus(game, county="strong", **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click(f"button[data-county='{county}']")
    pg.evaluate("() => { S.rival.next = 1e9; S.nextChip = 1e9; }")
    return pg


def no_gpus(pg):
    """Empty fleet: nothing on hand, no on-demand income, so contract money is isolated."""
    pg.evaluate("() => { S.fleet = {}; S.gpus = 0; render(); }")


def first_offer(pg):
    return pg.evaluate("() => S.p2.offers[0]")


def sign_first(pg):
    o = first_offer(pg)
    pg.click(f"button[data-accept='{o['id']}']")
    return o


def test_first_offer_is_your_old_lab_and_any_gpus_will_do(game):
    pg = campus(game)
    o = first_offer(pg)
    assert o["who"].startswith("Your old lab") and o["mw"] == 30 and o["minGen"] == 0
    assert "30 MW of any GPUs on hand" in pg.inner_text("#offers")


def test_sign_pays_upfront_and_adds_backlog(game):
    pg = campus(game)
    funds = pg.evaluate("() => S.funds")
    o = sign_first(pg)
    assert pg.evaluate("() => S.funds") == pytest.approx(funds + o["upfront"])
    assert pg.evaluate("() => backlogMW()") == 30
    assert o["upfront"] == pytest.approx(30 * o["term"] * 550 * (1.6 / 1.4) ** -3)   # old lab: any GPUs, P1 pricing


def test_forecast_hand_then_buy_then_space(game):
    pg = campus(game)
    assert "on hand" in pg.inner_text("#offers")
    no_gpus(pg)
    assert "Covered if you buy 30 MW" in pg.inner_text("#offers")
    pg.evaluate("() => { S.leases = {rack: 1}; S.leaseCool = {rack: {0: 1}}; render(); }")
    assert "Short 30 MW of space: lease or build" in pg.inner_text("#offers")


def test_delivered_contract_pays_fee(game):
    pg = campus(game)
    o = sign_first(pg)
    pg.evaluate(f"() => {{ S.t = {o['start']} - 1; }}")
    run(pg, 1)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "active"
    earned = pg.evaluate("() => S.p2.earned")
    run(pg, 10)
    assert pg.evaluate("() => S.p2.earned") == pytest.approx(earned + 10 * 30 * 275 * (1.6 / 1.4) ** -3, rel=1e-6)
    assert pg.inner_text("#gpuCount") == "30 MW"


def test_min_gen_respected(game):
    pg = campus(game)
    pg.evaluate("""() => { S.chipIdx = 5; S.p2.offers = []; makeOffer(); const o = S.p2.offers[0];
      o.minGen = 5; o.mw = 30; o.start = S.t + 5; render(); }""")
    assert "Covered if you buy 30 MW of P6s" in pg.inner_text("#offers")
    pg.evaluate("() => acceptOffer(S.p2.offers[0].id)")
    run(pg, 6)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "late"


def test_late_is_free_for_the_first_minute_then_costs(game):
    pg = campus(game)
    no_gpus(pg)
    o = sign_first(pg)
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
    no_gpus(pg)
    o = sign_first(pg)
    pg.evaluate(f"() => {{ S.t = {o['start']}; }}")
    run(pg, 121)
    assert "walks in 60s" in pg.inner_text("#console")
    run(pg, 60)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "defaulted"
    assert pg.evaluate("() => S.nextDraw - S.t") >= 119


def test_default_is_never_profitable(game):
    pg = campus(game)
    no_gpus(pg)
    funds = pg.evaluate("() => S.funds")
    o = sign_first(pg)
    pg.evaluate(f"() => {{ S.t = {o['start']}; }}")
    run(pg, 181)
    assert pg.evaluate("() => S.p2.contracts[0].status") == "defaulted"
    assert pg.evaluate("() => S.funds") < funds


def test_renegotiate_once(game):
    pg = campus(game)
    o = sign_first(pg)
    hype = pg.evaluate("() => S.hype")
    cid = pg.evaluate("() => S.p2.contracts[0].id")
    pg.click(f"button[data-reneg='{cid}']")
    c = pg.evaluate("() => S.p2.contracts[0]")
    assert c["start"] == o["start"] + 120 and c["reneg"] is True
    assert pg.evaluate("() => S.hype") == pytest.approx(hype - 5)
    assert not pg.is_visible(f"button[data-reneg='{cid}']")


def test_push_date_when_late_counts_from_now(game):
    pg = campus(game)
    no_gpus(pg)
    o = sign_first(pg)
    pg.evaluate(f"() => {{ S.t = {o['start']} + 150; }}")
    run(pg, 1)
    cid = pg.evaluate("() => S.p2.contracts[0].id")
    now = pg.evaluate("() => S.t")
    pg.click(f"button[data-reneg='{cid}']")
    c = pg.evaluate("() => S.p2.contracts[0]")
    assert c["status"] == "waiting" and c["start"] == now + 120 and c["end"] - c["start"] == o["term"]


def test_decline_is_free_and_offers_last_at_least_45s(game):
    pg = campus(game)
    fresh = pg.evaluate("() => { makeOffer(); render(); return S.p2.offers[S.p2.offers.length - 1]; }")
    assert fresh["expires"] - pg.evaluate("() => S.t") >= 45
    funds, hype = pg.evaluate("() => [S.funds, S.hype]")
    pg.click(f"button[data-decline='{fresh['id']}']")
    assert pg.evaluate("() => [S.funds, S.hype]") == [funds, hype]


def test_allocation_in_signing_order(game):
    pg = campus(game)
    pg.evaluate("""() => { S.fleet = {3: 18300}; S.gpus = 18300; S.p2.offers = [];
      for (let i = 0; i < 2; i++) { makeOffer(); const o = S.p2.offers[S.p2.offers.length - 1];
        o.mw = 30; o.minGen = 0; o.start = S.t + 5; acceptOffer(o.id); } }""")
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
    no_gpus(pg)
    o = sign_first(pg)
    pg.evaluate(f"() => {{ S.t = {o['start']}; step(1); step(200); render(); }}")
    assert pg.evaluate("() => S.p2.contracts[0].status") == "defaulted"
    assert pg.evaluate("() => Number.isFinite(S.funds) && Number.isFinite(S.hype)")


def test_reload_mid_campus(game):
    pg = campus(game)
    sign_first(pg)
    pg.click("#buildHall")
    pg.click("#requestQueue")
    before = pg.evaluate("() => JSON.stringify(S.p2)")
    pg.evaluate("() => save()")
    pg.reload()
    assert pg.evaluate("() => JSON.stringify(S.p2)") == before


def test_debt_sized_on_backlog(game):
    pg = campus(game, hype=80)
    pg.evaluate("() => { S.p2.offers = []; makeOffer(); const o = S.p2.offers[0]; o.mw = 100; acceptOffer(o.id); }")
    assert pg.evaluate("() => drawSize()") == pytest.approx(0.8 * 100 * 300000)
    assert pg.is_visible("#draw")


def test_forecast_suggests_trade_in_when_old_chips_fill_the_space(game):
    pg = campus(game)
    # Space is full of old P4s (gen 3); the offer wants P6+ (gen 5). Trading P4s in is the only way to make room.
    pg.evaluate("""() => { S.chipIdx = 5; S.fleet = {3: Math.floor(leasedKW() / chip(3).kw)}; S.gpus = S.fleet[3];
      S.p2.market = 0; S.p2.offers = []; makeOffer(); const o = S.p2.offers[0]; o.minGen = 5; o.mw = 30; render(); }""")
    text = pg.inner_text("#offers")
    assert "Trade in older chips" in text and "✓" in text


def test_offers_never_exceed_what_you_could_deliver(game):
    pg = campus(game, county="strong")
    pg.evaluate("""() => { S.p2.market = 0; S.leases = {rack: 1}; S.leaseCool = {rack: {0: 1}}; S.fleet = {}; S.gpus = 0;
      S.p2.builds = []; for (let i = 0; i < 74; i++) S.p2.builds.push({kind: 'hall', done: 1e9}); }""")   # land nearly gone
    cap = pg.evaluate("() => deliverableMW(S.chipIdx)")
    sizes = pg.evaluate("() => { const out = []; for (let i = 0; i < 40; i++) { S.p2.offers = []; makeOffer(); out.push(S.p2.offers[0].mw); } return out; }")
    assert cap < 100
    assert max(sizes) <= max(10, cap)
