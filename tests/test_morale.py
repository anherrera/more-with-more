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


def test_three_perks_on_offer_and_using_one_swaps_it_out(game):
    pg = campus(game, funds=1e10)
    pg.evaluate("() => { moraleOf().v = 30; render(); }")
    btns = pg.query_selector_all("#perks button")
    assert len(btns) == 3
    first = btns[0].get_attribute("data-perk")
    btns[0].click()
    assert pg.evaluate("() => moraleOf().v") > 30
    pg.evaluate("() => render()")
    offered = [b.get_attribute("data-perk") for b in pg.query_selector_all("#perks button")]
    assert first not in offered and len(offered) == 3
    assert all(b.is_disabled() for b in pg.query_selector_all("#perks button"))   # one perk at a time
    run(pg, 46)
    pg.evaluate("() => render()")
    assert any(b.is_enabled() for b in pg.query_selector_all("#perks button"))


def test_repeating_a_perk_helps_less(game):
    pg = campus(game, funds=1e10)
    gains = []
    for _ in range(3):
        pg.evaluate("() => { moraleOf().v = 10; moraleOf().perkAt = -1e9; usePerk('pizza'); }")
        gains.append(pg.evaluate("() => moraleOf().v") - 10)
    assert gains[0] > gains[1] > gains[2] > 0


def test_offsite_delays_builds(game):
    pg = campus(game, funds=1e10)
    pg.evaluate("() => { moraleOf().v = 30; build('hall'); }")
    done = pg.evaluate("() => S.p2.builds.at(-1).done")
    pg.evaluate("() => usePerk('offsite')")
    assert pg.evaluate("() => S.p2.builds.at(-1).done") > done
    assert pg.evaluate("() => moraleOf().v") > 45


def test_rsu_refresh_only_once_public(game):
    pg = campus(game, funds=1e10)
    assert not pg.evaluate("() => PERKS.find((p) => p.id === 'rsu').when()")
    pg.evaluate("() => { S.p2.ipo = {at: S.t}; }")
    assert pg.evaluate("() => PERKS.find((p) => p.id === 'rsu').when()")


def test_crunch_levels_off_with_many_builds(game):
    pg = campus(game, funds=1e10)
    pg.evaluate("() => { for (let i = 0; i < 12; i++) S.p2.builds.push({kind: 'hall', done: S.t + 100}); }")
    assert pg.evaluate("() => moraleDrain()") < 0.15


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


def test_a_used_perk_does_not_come_straight_back(game):
    pg = campus(game, funds=1e10)
    for _ in range(12):
        pg.evaluate("() => { moraleOf().v = 30; moraleOf().perkAt = -1e9; }")
        first = pg.evaluate("() => offeredPerks()[0]")
        pg.evaluate(f"() => usePerk('{first}')")
        assert first not in pg.evaluate("() => moraleOf().perks")
