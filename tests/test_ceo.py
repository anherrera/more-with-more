from conftest import MID, READY, run


def campus(game, **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("""() => { S.rival.next = 1e9; S.nextChip = 1e9; firesOf().next = 1e9; leaksOf().next = 1e9;
      S.p2.offers = []; S.p2.nextOffer = 1e9; S.p2.nextDrought = 1e9; moraleOf().lastTender = 1e9; townOf().nextHall = 1e9; render(); }""")
    return pg


def test_founding_ceo_line_in_investors(game):
    pg = campus(game)
    assert pg.is_visible("#ceoLine")
    assert "CEO" in pg.inner_text("#ceoLine")
    assert pg.evaluate("() => ceoOf().mandate") is None


def test_no_ceo_line_in_phase1(game):
    pg = game(MID)
    assert not pg.is_visible("#ceoLine")


def test_three_crises_and_the_board_brings_in_a_new_ceo(game):
    pg = campus(game)
    pg.evaluate("() => { ceoStrike('a fire'); ceoStrike('a leak'); }")
    assert pg.evaluate("() => ceoOf().n") == 0
    pg.evaluate("() => { ceoStrike('a moratorium'); render(); }")
    assert pg.evaluate("() => ceoOf().n") == 1
    assert pg.evaluate("() => ceoOf().mandate") in ["visionary", "costcutter", "hyperscaler"]
    assert "New CEO, who dis?" in pg.inner_text("#console")
    assert pg.evaluate("() => ceoOf().strikes") == 0


def test_board_waits_between_ceos(game):
    pg = campus(game)
    pg.evaluate("() => { for (let i = 0; i < 6; i++) ceoStrike('chaos'); }")
    assert pg.evaluate("() => ceoOf().n") == 1


def test_a_fire_counts_as_a_crisis(game):
    pg = campus(game)
    pg.evaluate("() => { S.fleet = {3: 1000}; S.gpus = 1000; firesOf().next = S.t + 1; }")
    run(pg, 2)
    assert pg.evaluate("() => ceoOf().strikes") == 1


def test_mandates_change_the_rules(game):
    pg = campus(game, funds=1e10)
    base_cost = pg.evaluate("() => buildCost('hall')")
    pg.evaluate("() => { const c = ceoOf(); c.mandate = 'costcutter'; }")
    assert pg.evaluate("() => buildCost('hall')") < base_cost
    pg.evaluate("() => { ceoOf().mandate = 'visionary'; }")
    assert pg.evaluate("() => buildCost('hall')") > base_cost
    pg.evaluate("() => { ceoOf().mandate = null; build('hall'); }")
    t0 = pg.evaluate("() => S.p2.builds.at(-1).done - S.t")
    pg.evaluate("() => { ceoOf().mandate = 'hyperscaler'; build('hall'); }")
    assert pg.evaluate("() => S.p2.builds.at(-1).done - S.t") > t0
    pg.evaluate("() => render()")
    assert "slower" in pg.inner_text("#ceoLine")
