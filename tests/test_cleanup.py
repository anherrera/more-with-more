from conftest import READY, run


def campus(game):
    pg = game({**READY, "debt": 0, "fails": 3})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("() => render()")
    return pg


def test_phase2_drops_phase1_leftovers_but_keeps_the_rack_strip(game):
    pg = campus(game)
    assert not pg.is_visible("#failRow")
    assert not pg.is_visible("#rentLine")
    assert pg.is_visible("#rackStrip")
    assert "/kW" in pg.inner_text("#leaseColo")
