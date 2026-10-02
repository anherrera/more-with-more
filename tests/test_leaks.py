from conftest import MID, READY, run


def campus(game, **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("""() => { S.rival.next = 1e9; S.nextChip = 1e9; firesOf().next = 1e9; S.p2.offers = []; S.p2.nextOffer = 1e9;
      S.done.dlc = true; S.fleet = {3: 10000}; S.gpus = 10000; }""")
    return pg


def spring(pg):
    pg.evaluate("() => { leaksOf().next = S.t + 1; }")
    run(pg, 2)


def test_no_leaks_without_liquid_cooling(game):
    pg = campus(game)
    pg.evaluate("() => { for (const k of ['dlc', 'immersion', 'twophase', 'liquid']) delete S.done[k]; }")
    assert not pg.evaluate("() => leaksOn()")
    pg.evaluate("() => { S.done.liquid = true; }")
    assert pg.evaluate("() => leaksOn()")


def test_no_leaks_in_phase1(game):
    pg = game({**MID, "debt": 0})
    pg.evaluate("() => { S.done.dlc = true; }")
    assert not pg.evaluate("() => leaksOn()")


def test_leak_takes_gpus_down_then_most_come_back_with_no_insurance(game):
    pg = campus(game)
    spring(pg)
    n = pg.evaluate("() => S.leaks.out.n")
    assert n > 0 and pg.evaluate("() => S.gpus") == 10000 - n
    assert "leak" in pg.inner_text("#console").lower()
    alert = pg.inner_text("#alerts")
    assert "leak" in alert.lower() and "back in" in alert
    run(pg, 60)
    lost = pg.evaluate("() => S.leaks.lost")
    assert 0 < lost < n
    assert pg.evaluate("() => S.gpus") == 10000 - lost
    assert pg.evaluate("() => S.leaks.out") is None
    assert "Water damage" in pg.inner_text("#console")          # the policy excludes it
    assert pg.evaluate("() => firesOf().payout") is None


def test_leak_projects_appear_after_the_first_leak_and_work(game):
    pg = campus(game, funds=1e9)
    pg.evaluate("() => render()")
    assert not pg.query_selector("button[data-id='leakdetect']")
    spring(pg)
    run(pg, 60)
    pg.evaluate("() => render()")
    assert pg.query_selector("button[data-id='leakdetect']") and pg.query_selector("button[data-id='driptrays']")
    pg.evaluate("() => { S.done.leakdetect = true; S.done.driptrays = true; }")
    lost = pg.evaluate("() => S.leaks.lost")
    spring(pg)
    assert pg.evaluate("() => S.leaks.out.until - S.t") <= 31
    run(pg, 30)
    assert pg.evaluate("() => S.leaks.out") is None and pg.evaluate("() => S.leaks.lost") == lost


def test_leak_survives_reload(game):
    pg = campus(game)
    spring(pg)
    before = pg.evaluate("() => JSON.stringify(S.leaks)")
    pg.evaluate("() => save()")
    pg.reload()
    assert pg.evaluate("() => JSON.stringify(S.leaks)") == before
