import pytest

from conftest import READY, run


def campus(game, **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("() => { S.rival.next = 1e9; S.nextChip = 1e9; S.p2.nextOffer = 1e9; S.p2.nextColo = 1e9; S.p2.offers = []; }")
    return pg


def gigawatt(pg):
    pg.evaluate("() => { S.p2.grid = 99999; for (let i = 0; i < 20; i++) S.p2.builds.push({kind: 'hall', done: 0, announced: true}); }")


def test_goal_line(game):
    pg = campus(game)
    run(pg, 1)
    assert pg.inner_text("#goalLine").startswith("Goal: a 1 GW campus (now 0 MW)")


def test_lobbyist_after_queue_and_halves_queue(game):
    pg = campus(game)
    pg.click("#requestQueue")
    run(pg, 1)
    assert "lobbyist" in pg.inner_text("#propTitle")
    qs, funds = pg.evaluate("() => [queueSecs(), S.funds]")
    pg.click("#propYes")
    assert pg.evaluate("() => queueSecs()") == pytest.approx(qs * 0.5)
    assert pg.evaluate("() => [S.p2.model.autonomy, S.funds]") == pytest.approx([10, funds - 50e6])
    assert not pg.is_visible("#proposal")


def test_reject_returns_bigger_and_quotes(game):
    pg = campus(game)
    pg.click("#requestQueue")
    run(pg, 1)
    pg.click("#propNo")
    assert not pg.is_visible("#proposal")
    run(pg, 238)
    assert not pg.is_visible("#proposal")
    run(pg, 3)
    assert "$65.0M" in pg.inner_text("#proposal")
    assert "You said no" in pg.inner_text("#console")


@pytest.mark.parametrize("autonomy,words", [(0, "It asks politely"), (30, "drafting the permits itself"),
                                            (50, "schedules its own meetings"), (80, "waiting for you to agree")])
def test_autonomy_tiers(game, autonomy, words):
    pg = campus(game)
    pg.evaluate(f"() => {{ S.p2.model.autonomy = {autonomy}; render(); }}")
    assert words in pg.inner_text("#autonomy")


def test_final_self_approves_when_autonomy_high(game):
    pg = campus(game)
    pg.evaluate("() => { S.p2.model.autonomy = 80; }")
    gigawatt(pg)
    run(pg, 1)
    assert "Let me build the next one" in pg.inner_text("#propTitle")
    assert pg.is_disabled("#propYes") and "Approving itself in" in pg.inner_text("#proposal")
    run(pg, 30)
    assert pg.is_visible("#ending2")
    assert pg.evaluate("() => S.p2.model.endedAt") is not None


def test_final_needs_a_click_when_autonomy_low(game):
    pg = campus(game)
    gigawatt(pg)
    run(pg, 60)
    assert pg.is_enabled("#propYes") and not pg.is_visible("#ending2")
    pg.click("#propYes")
    assert pg.is_visible("#ending2")


def test_ending_once_and_game_continues(game):
    pg = campus(game)
    gigawatt(pg)
    run(pg, 1)
    pg.click("#propYes")
    t, funds = pg.evaluate("() => [S.t, S.funds]")
    run(pg, 10)
    assert pg.evaluate("() => S.t") == t + 10
    assert pg.evaluate("() => S.milestones.filter((m) => m.what.startsWith('the model built')).length") == 1
    assert not pg.is_visible("#proposal") or "Let me build" not in pg.inner_text("#propTitle")


def test_proposal_survives_reload(game):
    pg = campus(game)
    pg.click("#requestQueue")
    run(pg, 1)
    cur = pg.evaluate("() => S.p2.model.current")
    pg.evaluate("() => save()")
    pg.reload()
    assert pg.evaluate("() => S.p2.model.current") == cur == "lobbyist"
    assert pg.is_visible("#proposal")


def test_old_save_gets_a_model(game):
    pg = game({**READY, "phase": 2, "ended": True, "p2": {"county": "cheap", "grid": 50, "queue": None, "queueN": 0,
               "builds": [], "offers": [], "contracts": [], "nextOffer": 1e9, "offerN": 0, "contractN": 0, "earned": 0}})
    run(pg, 1)
    assert pg.evaluate("() => S.p2.model.autonomy") == 0


def test_unaffordable_proposal_steps_aside(game):
    pg = campus(game)
    pg.evaluate("""() => { const m = S.p2.model; m.done.nuclear = true; m.done.lobbyist = true; S.funds = 1e6; S.p2.queueN = 1;
      S.p2.builds.push({kind: 'hall', done: 1e9}); for (let i = 0; i < 74; i++) S.p2.builds.push({kind: 'hall', done: 1e9}); }""")
    run(pg, 1)
    assert pg.evaluate("() => S.p2.model.current") == "rezone"      # first eligible (land is gone), unaffordable
    run(pg, 61)
    m = pg.evaluate("() => S.p2.model")
    assert m["current"] == "utility" and m["rejected"] == {}           # rezone parked, not rejected; next one offered
    assert "It can wait" in pg.inner_text("#console")
