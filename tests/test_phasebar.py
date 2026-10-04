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
    assert "begin phase 3" in pg.inner_text("#phaseGo").lower()       # the bar now offers phase 3


def test_self_approving_countdown_shows_in_the_bar(game):
    pg = campus(game)
    pg.evaluate("() => { const m = modelOf(); m.current = null; m.final = {at: S.t + 30}; render(); }")
    assert "30s" in pg.inner_text("#phaseBar")


def test_phase2_posts_like_an_infra_company(game):
    pg = campus(game)
    pg.evaluate("() => { S.nextPost = 0; render(); }")
    label = pg.inner_text("#post")
    assert "next model" not in label and "campus" in label
    pg.click("#post")
    last = pg.evaluate("() => S.log.at(-1)")
    assert last.startswith("Posted:") and pg.evaluate("() => CAMPUS_POSTS.some((p) => S.log.at(-1).includes(p))")


def test_headline_shows_delivered_and_gpu_count_in_phase2(game):
    pg = campus(game)
    pg.evaluate("() => { S.fleet = {3: 12345}; S.gpus = 12345; render(); }")
    head = pg.inner_text(".count")
    assert "Delivered" in head and "12,345 GPUs" in head
