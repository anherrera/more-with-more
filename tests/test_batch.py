import pytest

from conftest import MID, READY, run


def campus(game, county="strong", **extra):
    pg = game({**READY, "debt": 0, "funds": 5e9, **extra})
    pg.click("button[data-id='ground']")
    pg.click(f"button[data-county='{county}']")
    pg.evaluate("""() => { S.rival.next = 1e9; S.nextChip = 1e9; S.p2.nextOffer = 1e9; S.p2.nextColo = 1e9; S.p2.offers = [];
      firesOf().next = 1e9; S.p2.nextDrought = 1e9; S.nextBuzz = 1e9; }""")
    return pg


def test_periodic_nonsense_gives_hype(game):
    pg = game({**MID, "hype": 30})
    pg.evaluate("() => { S.rival.next = 1e9; firesOf().next = 1e9; S.nextBuzz = S.t + 1; }")
    hype = pg.evaluate("() => S.hype")
    run(pg, 2)
    assert pg.evaluate("() => S.hype") > hype + 3
    assert pg.evaluate("() => S.nextBuzz - S.t") > 60


def test_hype_projects_are_spread_out(game):
    pg = campus(game)
    pg.evaluate("() => render()")
    ids = pg.evaluate("() => [...document.querySelectorAll('#projects button')].map((b) => b.dataset.id)")
    assert "rebrand" not in ids and "pledge2" not in ids and "silicon" not in ids


def test_phase2_ends_only_after_ipo_and_1gw(game):
    pg = campus(game)
    pg.evaluate("() => { S.p2.grid = 99999; S.p2.extraWater = 999; for (let i = 0; i < 20; i++) S.p2.builds.push({kind: 'hall', done: 0, announced: true}); }")
    run(pg, 2)
    assert pg.evaluate("() => S.p2.model.final") is None
    assert "IPO" in pg.inner_text("#goalLine")
    pg.evaluate("() => { S.p2.ipo = {at: S.t, px0: 1, walk: 1, shock: 1, lastFollowOn: -1e9, lastSecondary: -1e9, lockupSaid: false}; }")
    run(pg, 1)
    assert pg.evaluate("() => S.p2.model.final") is not None


def test_campus_meters_show_the_bottleneck(game):
    pg = campus(game)                                   # strong: 5 MGD water, 200 MW grid
    pg.evaluate("() => { for (let i = 0; i < 12; i++) S.p2.builds.push({kind: 'hall', done: 0, announced: true}); S.p2.grid = 99999; }")
    run(pg, 1)
    assert "bad" in pg.get_attribute("#mWater", "class")          # water is the limit (500 MW of 600)
    assert "bad" not in pg.get_attribute("#mPower", "class")
    width = pg.evaluate("() => document.querySelector('#mHalls > i').style.width")
    assert width.startswith("83")                                   # 10 of 12 halls lit
