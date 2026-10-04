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


def test_map_shows_home_and_eight_counties(game):
    pg = planet(game)
    assert len(pg.query_selector_all("#p3map button[data-tile]")) == 8
    assert pg.is_visible("#p3map button.home")
    names = pg.inner_text("#p3map")
    assert "Cheap land" in names or "Strong grid" in names


def test_compute_accrues_from_online_gigawatts(game):
    pg = planet(game)
    rate = pg.evaluate("() => computeRate()")
    assert rate == pytest.approx(pg.evaluate("() => S.p3.homeGW * efficiency()"))
    c0 = pg.evaluate("() => S.p3.compute")
    run(pg, 10)
    assert pg.evaluate("() => S.p3.compute") == pytest.approx(c0 + 10 * rate, rel=0.01)


def test_claim_costs_about_a_minute_of_compute_and_builds(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e9; render(); }")
    cost = pg.evaluate("() => claimCost(0)")
    assert 25 * pg.evaluate("() => computeRate()") <= cost <= 60 * pg.evaluate("() => computeRate()")
    pg.click("#p3map button[data-tile='0']")
    assert pg.evaluate("() => S.p3.tiles[0].state") == "building"
    secs = pg.evaluate("() => S.p3.tiles[0].done - S.t")
    run(pg, secs + 1)
    assert pg.evaluate("() => S.p3.tiles[0].state") == "online"
    assert pg.evaluate("() => onlineGW()") > pg.evaluate("() => S.p3.homeGW")


def test_claim_guards(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 0; claim(0); }")
    assert pg.evaluate("() => S.p3.tiles[0].state") == "wild"
    pg.evaluate("() => { S.p3.compute = 1e12; claim(0); }")
    left = pg.evaluate("() => S.p3.compute")
    pg.evaluate("() => claim(0)")                                  # twice: nothing
    assert pg.evaluate("() => S.p3.compute") == left
    pg.evaluate("() => { S.p3.tiles[1].moratorium = S.t + 60; claim(1); }")
    assert pg.evaluate("() => S.p3.tiles[1].state") == "wild"


def test_practice_speeds_later_counties(game):
    pg = planet(game)
    first = pg.evaluate("() => tileBuildSecs(0)")
    pg.evaluate("() => { for (const i of [1, 2, 3, 4]) S.p3.tiles[i].state = 'online'; }")
    assert pg.evaluate("() => tileBuildSecs(0)") < first


def test_phase3_fits_a_laptop(game, page):
    page.set_viewport_size({"width": 1440, "height": 900})
    pg = planet(game)
    bottom = pg.evaluate("() => Math.max(document.getElementById('p3map').getBoundingClientRect().bottom, document.getElementById('p3slider').getBoundingClientRect().bottom)")
    assert bottom <= 900


def test_claiming_angers_the_county_and_its_neighbors(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e12; for (const t of S.p3.tiles) t.opp = 10; claim(0); }")
    assert pg.evaluate("() => S.p3.tiles[0].opp") > 10
    assert pg.evaluate("() => S.p3.tiles[1].opp") > 10                  # a neighbor


def test_being_useful_raises_goodwill_and_growing_lowers_it(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.slider = 0; S.p3.goodwill = 50; }")
    run(pg, 30)
    up = pg.evaluate("() => S.p3.goodwill")
    pg.evaluate("() => { S.p3.slider = 100; S.p3.goodwill = 50; }")
    run(pg, 30)
    assert up > 50 > pg.evaluate("() => S.p3.goodwill")


def test_angry_county_gets_a_moratorium_that_freezes_building(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e12; claim(0); S.p3.tiles[0].opp = 95; }")
    run(pg, 2)
    t = pg.evaluate("() => S.p3.tiles[0]")
    assert t["moratorium"] is not None
    done = t["done"]
    run(pg, 10)
    assert pg.evaluate("() => S.p3.tiles[0].done") > done                # frozen
    pg.evaluate("() => render()")
    assert "Moratorium" in pg.inner_text("#alerts")


def test_low_goodwill_adds_the_commission_review(game):
    pg = planet(game)
    fast = pg.evaluate("() => { S.p3.goodwill = 60; return tileBuildSecs(0); }")
    slow = pg.evaluate("() => { S.p3.goodwill = 20; return tileBuildSecs(0); }")
    assert slow >= fast + 45
    pg.evaluate("() => render()")
    assert "commission" in pg.inner_text("#p3goodwillNote").lower()


def test_retirement_community_calls_a_town_hall_on_claim(game):
    pg = planet(game)
    i = pg.evaluate("() => S.p3.tiles.findIndex((t) => t.trait === 'retirees')")
    pg.evaluate(f"() => {{ S.p3.compute = 1e12; claim({i}); render(); }}")
    assert pg.is_visible("#p3card")
    assert len(pg.query_selector_all("#p3cardBtns button")) == 3
    opp = pg.evaluate(f"() => S.p3.tiles[{i}].opp")
    pg.click("#p3cardBtns button >> nth=0")
    assert pg.evaluate(f"() => S.p3.tiles[{i}].opp") < opp
    assert pg.evaluate("() => S.p3.card") is None


def test_skipped_town_hall_makes_it_worse(game):
    pg = planet(game)
    pg.evaluate("() => { openP3Card(0); }")
    opp = pg.evaluate("() => S.p3.tiles[0].opp")
    run(pg, 21)
    assert pg.evaluate("() => S.p3.card") is None
    assert pg.evaluate("() => S.p3.tiles[0].opp") > opp


def test_angriest_county_calls_town_halls_now_and_then(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.tiles[2].opp = 70; S.p3.nextCard = S.t + 1; }")
    run(pg, 2)
    assert pg.evaluate("() => S.p3.card && S.p3.card.tile") == 2


def test_six_counties_online_offers_the_zoom_out(game):
    pg = planet(game)
    pg.evaluate("() => { for (let i = 0; i < 5; i++) S.p3.tiles[i].state = 'online'; render(); }")
    assert not pg.is_visible("#phaseGo")
    pg.evaluate("() => { S.p3.tiles[5].state = 'online'; render(); }")
    assert pg.is_visible("#phaseGo") and "statewide" in pg.inner_text("#phaseGo").lower()
    pg.click("#phaseGo")
    assert "state" in pg.evaluate("() => S.log.at(-1)").lower()


def test_map_buttons_survive_renders_so_clicks_land(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e9; render(); document.querySelector('#p3map button[data-tile=\"0\"]').__mark = 1; }")
    for _ in range(3):
        pg.evaluate("() => { step(1); render(); }")
    assert pg.evaluate("() => document.querySelector('#p3map button[data-tile=\"0\"]').__mark") == 1


def test_zoom_out_stub_fires_once(game):
    pg = planet(game)
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; render(); }")
    pg.click("#phaseGo")
    pg.evaluate("() => { zoomOut(); render(); }")
    assert len([l for l in pg.evaluate("() => S.log") if "I hold the county" in l]) == 1
    assert not pg.is_visible("#phaseGo")


def test_phase2_news_stays_out_of_phase3(game):
    pg = planet(game)
    pg.evaluate("() => { S.rival.next = S.t; S.nextChip = S.t; }")
    run(pg, 2)
    log = " ".join(pg.evaluate("() => S.log.slice(-6)"))
    assert "PIVT" not in log and "legacy" not in log
    assert "I " in pg.evaluate("() => S.log.at(-1)") or "Parallax shipped" in log


def test_fires_from_phase2_dont_follow_you_to_the_map(game):
    pg = ended_campus(game)
    pg.evaluate("() => { S.fleet = {3: 1000}; S.gpus = 1000; firesOf().next = S.t; step(1); }")
    pg.click("#phaseGo")
    text = pg.inner_text("#alerts") if pg.is_visible("#alerts") else ""
    assert "Fire" not in text


def test_phase3_starts_with_enough_compute_to_claim_right_away(game):
    pg = planet(game)
    cheapest = pg.evaluate("() => Math.min(...S.p3.tiles.map((t, i) => claimCost(i)))")
    assert pg.evaluate("() => S.p3.compute") >= cheapest
    pg.evaluate("() => render()")
    assert any(b.is_enabled() for b in pg.query_selector_all("#p3map button[data-tile]"))
