from conftest import MID, READY, run


def campus(game, **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("() => { S.rival.next = 1e9; S.nextChip = 1e9; render(); }")
    return pg


def test_phase1_bar_names_the_phase_and_the_way_out(game):
    pg = game(MID)
    text = pg.inner_text("#phaseBar")
    assert "Phase 1 of 3" in text and "Gen 6" in text


def test_phase1_bar_points_at_break_ground_when_ready(game):
    pg = game(READY)
    assert "Break ground" in pg.inner_text("#phaseBar")


def test_phase2_bar_shows_goal_progress(game):
    pg = campus(game)
    text = pg.inner_text("#phaseBar")
    assert "Phase 2 of 3" in text and "1 GW" in text and "IPO" in text
    assert not pg.is_visible("#phaseGo")


def test_final_ask_takes_over_the_bar_with_its_own_button(game):
    pg = campus(game)
    pg.evaluate("() => { const m = modelOf(); m.current = null; m.final = {at: null}; render(); }")
    assert "Let me build the next one" in pg.inner_text("#phaseBar")
    assert "phase" in pg.inner_text("#phaseGo").lower()
    assert "go" in pg.get_attribute("#phaseBar", "class")
    pg.click("#phaseGo")
    assert pg.evaluate("() => modelOf().endedAt") is not None
    assert "go" not in (pg.get_attribute("#phaseBar", "class") or "")


def test_self_approving_countdown_shows_in_the_bar(game):
    pg = campus(game)
    pg.evaluate("() => { const m = modelOf(); m.current = null; m.final = {at: S.t + 30}; render(); }")
    assert "30s" in pg.inner_text("#phaseBar")
