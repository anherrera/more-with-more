import pytest

from conftest import MID, READY, run


def campus(game, **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("""() => { S.rival.next = 1e9; S.nextChip = 1e9; firesOf().next = 1e9; leaksOf().next = 1e9;
      S.p2.offers = []; S.p2.nextOffer = 1e9; S.p2.nextDrought = 1e9; }""")
    return pg


def test_no_morale_meter_in_phase1(game):
    pg = game(MID)
    assert not pg.is_visible("#moraleBox")


def test_morale_meter_in_phase2(game):
    pg = campus(game)
    pg.evaluate("() => render()")
    assert pg.is_visible("#moraleBox")
    assert pg.evaluate("() => moraleOf().v") == 80


def test_crunch_drains_morale_and_the_cause_line_says_why(game):
    pg = campus(game, funds=1e10)
    pg.evaluate("() => { for (let i = 0; i < 6; i++) build('hall'); }")
    before = pg.evaluate("() => moraleOf().v")
    run(pg, 60)
    assert pg.evaluate("() => moraleOf().v") < before
    pg.evaluate("() => render()")
    assert "builds in flight" in pg.inner_text("#moraleCause")


def test_calm_campus_recovers(game):
    pg = campus(game)
    pg.evaluate("() => { moraleOf().v = 40; moraleOf().lastTender = S.t; }")   # no tender card in the way
    run(pg, 60)
    assert pg.evaluate("() => moraleOf().v") > 40


def test_low_morale_slows_new_builds(game):
    pg = campus(game, funds=1e10)
    pg.evaluate("() => { moraleOf().v = 80; build('hall'); }")
    fast = pg.evaluate("() => S.p2.builds.at(-1).done - S.t")
    pg.evaluate("() => { moraleOf().v = 10; build('hall'); }")
    slow = pg.evaluate("() => S.p2.builds.at(-1).done - S.t")
    assert slow > fast * 1.5


def test_pizza_party_helps_less_each_time(game):
    pg = campus(game, funds=1e10)
    pg.evaluate("() => { moraleOf().v = 30; render(); }")
    pg.click("#pizza")
    first = pg.evaluate("() => moraleOf().v") - 30
    pg.evaluate("() => { moraleOf().v = 30; render(); }")
    pg.click("#pizza")
    second = pg.evaluate("() => moraleOf().v") - 30
    assert first > second > 0


def test_tender_offer_card_appears_when_morale_sags_and_lifts_it(game):
    pg = campus(game)
    pg.evaluate("() => { moraleOf().v = 40; }")
    run(pg, 2)
    pg.evaluate("() => render()")
    assert pg.is_visible("#card")
    assert "tender" in pg.inner_text("#card").lower()
    pg.click("#card button >> nth=0")
    assert pg.evaluate("() => moraleOf().v") > 60
    assert pg.evaluate("() => S.p2.card") is None
    pg.evaluate("() => render()")
    assert not pg.is_visible("#card")


def test_ignored_tender_offer_expires_and_stings(game):
    pg = campus(game)
    pg.evaluate("() => { moraleOf().v = 40; }")
    run(pg, 2)
    assert pg.evaluate("() => S.p2.card.kind") == "tender"
    m = pg.evaluate("() => moraleOf().v")
    run(pg, 31)
    assert pg.evaluate("() => S.p2.card") is None
    assert pg.evaluate("() => moraleOf().v") < m + 2


def test_no_tender_offer_once_public(game):
    pg = campus(game)
    pg.evaluate("() => { S.p2.ipo = {at: S.t}; moraleOf().v = 40; }")
    run(pg, 2)
    assert pg.evaluate("() => S.p2.card") is None
