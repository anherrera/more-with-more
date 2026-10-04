"""Phase 3 pacing: the levers that set how long a level takes (tools/speedrun.py and tools/p3run.py measure the result)."""
import pytest

from conftest import planet


def test_the_county_zooms_at_six_and_every_later_level_at_seven(game):
    pg = planet(game)
    assert pg.evaluate("() => ZOOM_AT") == [6, 7, 7, 7] and pg.evaluate("() => zoomAt()") == 6
    assert "Hold 6" in pg.inner_text("#phaseBar")
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; render(); }")
    assert pg.evaluate("() => zoomReady()")
    pg.click("#phaseGo")
    assert pg.evaluate("() => zoomAt()") == 7 and "Hold 7" in pg.inner_text("#phaseBar")
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; render(); }")
    assert not pg.evaluate("() => zoomReady()") and not pg.is_visible("#phaseGo")
    pg.evaluate("() => { S.p3.tiles[6].state = 'online'; render(); }")
    assert pg.evaluate("() => zoomReady()") and pg.is_visible("#phaseGo")


def test_claims_cost_more_per_tile_at_the_bigger_levels(game):
    pg = planet(game)
    secs = pg.evaluate("() => CLAIM_SECS")
    assert len(secs) == 5 and secs == sorted(secs[:4]) + [secs[4]] and secs[0] >= 50
    assert pg.evaluate("() => claimSecs()") == secs[0]
    pg.evaluate("() => { S.p3.level = 2; }")
    assert pg.evaluate("() => claimSecs()") == secs[2]


def test_the_opening_bank_still_buys_the_first_county(game):
    pg = planet(game)
    cheapest = pg.evaluate("() => Math.min(...S.p3.tiles.map((t, i) => claimCost(i)))")
    assert pg.evaluate("() => S.p3.compute") >= cheapest
