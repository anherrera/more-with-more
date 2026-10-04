import pytest

from conftest import MID, READY, run


def ended_campus(game):
    """A phase 2 save whose model has already built the next one (phase 2 complete)."""
    pg = game({**READY, "debt": 0})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("""() => { S.rival.next = 1e9; S.nextChip = 1e9; firesOf().next = 1e9; leaksOf().next = 1e9;
      S.p2.grid = 99999; S.p2.extraWater = 999; for (let i = 0; i < 20; i++) S.p2.builds.push({kind: 'hall', done: 0, announced: true});
      S.p2.ipo = {at: S.t, px0: 1, walk: 1, shock: 1, lastFollowOn: -1e9, lastSecondary: -1e9, lockupSaid: true};
      modelOf().endedAt = S.t; render(); }""")
    return pg


def planet(game):
    pg = ended_campus(game)
    pg.click("#phaseGo")
    pg.evaluate("() => { S.rival.next = 1e9; }")
    return pg


def test_phase2_end_offers_phase3(game):
    pg = ended_campus(game)
    assert "begin phase 3" in pg.inner_text("#phaseGo").lower()
    assert pg.is_visible("#phaseGo")


def test_zooming_out_starts_phase3_as_the_model(game):
    pg = planet(game)
    assert pg.evaluate("() => S.phase") == 3
    assert pg.is_visible("#p3") and not pg.is_visible(".cols")
    assert "Phase 3 of 3" in pg.inner_text("#phaseBar")
    assert "I " in pg.inner_text("#console")                    # first person now
    assert pg.evaluate("() => S.p3.tiles.length") == 8


def test_phase3_survives_reload(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.slider = 30; S.p3.compute = 1234; save(); }")
    pg.reload()
    assert pg.evaluate("() => [S.phase, S.p3.slider, S.p3.compute]") == [3, 30, 1234]
    assert pg.is_visible("#p3")


def test_old_ended_save_can_begin_phase3(game):
    pg = ended_campus(game)
    pg.evaluate("() => { save(); }")
    pg.reload()
    pg.click("#phaseGo")
    assert pg.evaluate("() => S.phase") == 3


def test_reset_from_phase3(game):
    pg = planet(game)
    pg.click("#reset")
    pg.click("#resetYes")
    assert pg.evaluate("() => S.phase") == 1
    assert pg.is_visible(".cols") and not pg.is_visible("#p3")
