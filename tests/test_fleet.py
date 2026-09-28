from conftest import MID, READY, run


def campus(game, **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("() => { S.rival.next = 1e9; S.nextChip = 1e9; S.p2.offers = []; S.p2.nextOffer = 1e9; }")
    return pg


def column_lefts(pg):
    return pg.evaluate("() => [...document.querySelectorAll('.cols > .col')].filter((c) => c.offsetParent).map((c) => Math.round(c.getBoundingClientRect().left))")


def test_phase2_uses_four_full_width_columns(game, page):
    page.set_viewport_size({"width": 1600, "height": 1000})
    pg = campus(game)
    assert len(set(column_lefts(pg))) == 4
    assert pg.evaluate("() => document.querySelector('.cols').getBoundingClientRect().width") > 1400


def test_phase1_hides_the_deals_column(game, page):
    page.set_viewport_size({"width": 1600, "height": 1000})
    pg = game(MID)
    assert not pg.is_visible("#colDeals")
    assert len(set(column_lefts(pg))) == 3


def test_fleet_rows_by_generation(game):
    pg = campus(game)
    pg.evaluate("() => { S.chipIdx = 5; S.fleet = {3: 1000, 4: 1000, 5: 1000}; S.gpus = 3000; render(); }")
    rows = pg.inner_text("#fleetRows")
    assert rows.index("P6") < rows.index("P5") < rows.index("P4")          # newest first
    lines = {l.split(" ")[0]: l for l in rows.splitlines() if l[:1] == "P"}
    assert "contract-ready" in lines["P6"] and "contract-ready" in lines["P5"]
    assert "old: on-demand only" in lines["P4"]
    summary = pg.inner_text("#fleetSummary")
    assert "Contract-ready" in summary and "Old" in summary and "Room" in summary


def test_trade_in_any_old_generation(game):
    pg = campus(game)
    pg.evaluate("() => { S.chipIdx = 6; S.fleet = {3: 500, 4: 500, 6: 500}; S.gpus = 1500; render(); }")
    assert pg.is_visible("button[data-tradegen='3']") and pg.is_visible("button[data-tradegen='4']")
    assert not pg.query_selector("button[data-tradegen='6']")
    pg.click("button[data-tradegen='4']")
    assert pg.evaluate("() => [S.fleet[3], S.fleet[4] || 0]") == [500, 0]
    assert not pg.is_visible("#tradein")                                 # the phase 1 button yields to the fleet rows
