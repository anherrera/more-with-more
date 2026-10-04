import pytest

from conftest import MID, READY, run

PHASE1_OWN = 0.9 * 0.85 * 0.8 * 0.85 * 0.88 * 0.9      # pre-seed through Series D


def test_ownership_starts_whole_and_dilutes_by_round(game):
    pg = game({"gen": 1, "hype": 50, "round": 0, "logV2": True, "coolingV2": True})
    assert pg.evaluate("() => ownership()") == pytest.approx(1)
    pg.click("#raise")
    assert pg.evaluate("() => ownership()") == pytest.approx(0.9)
    assert "409A" in pg.inner_text("#console")
    assert "You own 90.0%" in pg.inner_text("#ownLine")


def test_old_save_derives_ownership_from_rounds_raised(game):
    pg = game(MID)                                       # all six phase 1 rounds raised
    assert pg.evaluate("() => ownership()") == pytest.approx(PHASE1_OWN)


def public_ready(game, **extra):
    pg = game({**READY, "debt": 0, "hype": 80, **extra})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("""() => { S.rival.next = 1e9; S.nextChip = 1e9; S.p2.nextOffer = 1e9; S.p2.nextColo = 1e9; S.p2.offers = [];
      S.p2.grid = 99999; S.p2.extraWater = 999; for (let i = 0; i < 12; i++) S.p2.builds.push({kind: 'hall', done: 0, announced: true});
      makeOffer(); const o = S.p2.offers[0]; o.mw = 400; o.minGen = 0; o.start = S.t + 5000; acceptOffer(o.id); render(); }""")
    return pg


def test_series_e_then_ipo(game):
    pg = public_ready(game)
    assert "Series E" in pg.inner_text("#raise")
    pg.click("#raise")
    assert pg.evaluate("() => ownership()") == pytest.approx(PHASE1_OWN * 0.92)
    assert "Ring the bell" in pg.inner_text("#raise")
    funds, own = pg.evaluate("() => [S.funds, ownership()]")
    pg.click("#raise")
    assert pg.evaluate("() => S.funds") > funds
    assert pg.evaluate("() => ownership()") == pytest.approx(own * 0.9)
    assert pg.evaluate("() => S.p2.ipo.at") == pg.evaluate("() => S.t")
    assert "MORE $" in pg.inner_text("#stockLine")


def test_ipo_arc_pops_then_slides(game):
    pg = public_ready(game)
    arc = pg.evaluate("() => [0, 60, 360, 660].map(ipoArc)")
    assert arc == pytest.approx([0.85, 3.4, 1.36, 1.0])


def ipo(pg):
    pg.click("#raise")          # Series E
    pg.click("#raise")          # IPO


def test_lockup_opens_secondaries(game):
    pg = public_ready(game)
    ipo(pg)
    assert pg.is_disabled("#secondary") and "lockup" in pg.inner_text("#secondary").lower()
    run(pg, 120)
    assert "lockup expired" in pg.inner_text("#console").lower()
    assert pg.is_enabled("#secondary")
    funds, own, liq = pg.evaluate("() => [S.funds, ownership(), S.cap.liquidity]")
    px = pg.evaluate("() => stockPrice()")
    founder = pg.evaluate("() => S.cap.founder")
    pg.click("#secondary")
    assert pg.evaluate("() => S.cap.liquidity") == pytest.approx(liq + 0.01 * founder * px, rel=1e-6)
    assert pg.evaluate("() => S.funds") == pytest.approx(funds)          # the company gets nothing
    assert pg.evaluate("() => ownership()") == pytest.approx(own * 0.99)


def money_in(text):
    return "$" in text


def test_follow_on_offering(game):
    pg = public_ready(game)
    ipo(pg)
    assert "Follow-on offering" in pg.inner_text("#raise")
    amt, funds, own = pg.evaluate("() => [followOnAmt(), S.funds, ownership()]")
    assert money_in(pg.inner_text("#raise"))
    pg.click("#raise")
    assert pg.evaluate("() => S.funds") == pytest.approx(funds + amt, rel=1e-6)
    assert pg.evaluate("() => ownership()") == pytest.approx(own * 0.92)
    assert pg.is_disabled("#raise")


def test_ipo_survives_reload(game):
    pg = public_ready(game)
    ipo(pg)
    at = pg.evaluate("() => S.p2.ipo.at")
    pg.evaluate("() => save()")
    pg.reload()
    assert pg.evaluate("() => S.p2.ipo.at") == at


def test_ending_reports_personal_liquidity(game):
    pg = public_ready(game)
    pg.evaluate("() => { S.cap.liquidity = 5e8; S.p2.model.endedAt = S.t; render(); }")
    stats = pg.inner_text("#ending2Stats")
    assert "You personally cleared $500M" in stats and "You own" in stats


def test_ipo_throws_confetti(game):
    pg = public_ready(game)
    ipo(pg)
    assert pg.query_selector("#confetti") is not None
    pg.wait_for_timeout(3600)
    assert pg.query_selector("#confetti") is None                  # cleans up after itself


def test_no_confetti_with_reduced_motion(game, page):
    page.emulate_media(reduced_motion="reduce")
    pg = public_ready(game)
    ipo(pg)
    assert pg.query_selector("#confetti") is None
    assert pg.evaluate("() => S.p2.ipo !== null")
