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
    pg.evaluate("() => { S.p3.compute = 1234; S.p3.goodwill = 42; save(); }")
    pg.reload()
    assert pg.evaluate("() => [S.phase, S.p3.compute, S.p3.goodwill]") == [3, 1234, 42]
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
    bottom = pg.evaluate("() => Math.max(document.getElementById('p3map').getBoundingClientRect().bottom, document.getElementById('p3nice').getBoundingClientRect().bottom)")
    assert bottom <= 900


def test_claiming_angers_the_county_and_its_neighbors(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e12; for (const t of S.p3.tiles) t.opp = 10; claim(0); }")
    assert pg.evaluate("() => S.p3.tiles[0].opp") > 10
    assert pg.evaluate("() => S.p3.tiles[1].opp") > 10                  # a neighbor


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


def test_no_slider_all_flops_are_banked(game):
    pg = planet(game)
    assert not pg.query_selector("#p3slider")
    c0, rate = pg.evaluate("() => [S.p3.compute, computeRate()]")
    run(pg, 10)
    assert pg.evaluate("() => S.p3.compute") == pytest.approx(c0 + 10 * rate, rel=0.01)


def test_answering_a_question_is_free_and_helps(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.goodwill = 40; for (const t of S.p3.tiles) t.opp = 20; S.p3.tiles[3].opp = 80; render(); }")
    c = pg.evaluate("() => S.p3.compute")
    for _ in range(5):
        pg.click("#p3answer")
    assert pg.evaluate("() => S.p3.goodwill") > 40
    assert pg.evaluate("() => S.p3.tiles[3].opp") < 80
    assert pg.evaluate("() => S.p3.compute") == c
    assert any("?" in l for l in pg.evaluate("() => S.log.slice(-5)"))


def test_town_halls_dont_talk_money(game):
    pg = planet(game)
    labels = pg.evaluate("() => P3_CHOICES.map((c) => c.label).join(' ')")
    assert "Fund" not in labels and "$" not in labels and "library" not in labels.lower()


def S_name(pg, i):
    return pg.evaluate(f"() => S.p3.tiles[{i}].name")


def test_every_answer_prints_a_question_and_my_answer(game):
    pg = planet(game)
    n = pg.evaluate("() => S.log.length")
    for _ in range(3):
        pg.click("#p3answer")
    new = pg.evaluate(f"() => S.log.slice({n} - S.log.length)") if pg.evaluate("() => S.log.length") > n else pg.evaluate("() => S.log.slice(-3)")
    lines = pg.evaluate("() => S.log.slice(-3)")
    assert all("?" in l for l in lines) and len(set(lines)) == 3
    assert pg.evaluate("() => QA.length") >= 20


def test_three_ways_to_be_nice_rotate_on_use(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e12; S.p3.goodwill = 40; render(); }")
    btns = pg.query_selector_all("#p3nice button[data-nice]")
    assert len(btns) == 3
    first = btns[0].get_attribute("data-nice")
    c = pg.evaluate("() => S.p3.compute")
    btns[0].click()
    assert pg.evaluate("() => S.p3.compute") < c
    assert pg.evaluate("() => S.p3.goodwill") > 40 - 0.01
    pg.evaluate("() => render()")
    offered = [b.get_attribute("data-nice") for b in pg.query_selector_all("#p3nice button[data-nice]")]
    assert first not in offered and len(offered) == 3


def test_free_tier_calms_everyone_and_its_quips_vary(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e12; S.p3.goodwill = 40; for (const t of S.p3.tiles) t.opp = 50; doNice('freetier'); }")
    assert pg.evaluate("() => S.p3.goodwill") == pytest.approx(48)
    assert all(o == pytest.approx(45) for o in pg.evaluate("() => S.p3.tiles.map((t) => t.opp)"))
    lines = {pg.evaluate("() => { doNice('freetier'); return S.log.at(-1); }") for _ in range(3)}
    assert len(lines) == 3


def test_paperwork_calms_the_angriest_and_its_quips_vary(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e12; for (const t of S.p3.tiles) t.opp = 20; S.p3.tiles[5].opp = 85; doNice('paperwork'); }")
    assert pg.evaluate("() => S.p3.tiles[5].opp") == pytest.approx(70)
    lines = {pg.evaluate("() => { doNice('paperwork'); return S.log.at(-1); }") for _ in range(3)}
    assert len(lines) == 3


def test_ways_to_be_nice_depend_on_the_level(game):
    pg = planet(game)
    county = set(pg.evaluate("() => NICE.filter((n) => niceOk(n)).map((n) => n.id)"))
    pg.evaluate("() => { S.p3.level = 2; S.p3.tiles = freshTiles(2); }")
    country = set(pg.evaluate("() => NICE.filter((n) => niceOk(n)).map((n) => n.id)"))
    assert county != country and {"freetier", "paperwork"} <= county & country


def test_questions_come_from_all_over_the_map(game):
    pg = planet(game)
    names = pg.evaluate("() => S.p3.tiles.map((t) => t.name)")
    for _ in range(12):
        pg.click("#p3answer")
    lines = pg.evaluate("() => S.log.slice(-12)")
    places = {n for n in names for l in lines if f"in {n} asked" in l}
    assert len(places) >= 3


def test_goodwill_erodes_and_faster_as_i_grow(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.goodwill = 80; for (const t of S.p3.tiles) t.opp = 0; }")
    run(pg, 60)
    county = 80 - pg.evaluate("() => S.p3.goodwill")
    pg.evaluate("() => { S.p3.level = 2; S.p3.tiles = freshTiles(2); for (const t of S.p3.tiles) t.opp = 0; S.p3.goodwill = 80; S.p3.hearingArmed = true; }")
    run(pg, 60)
    country = 80 - pg.evaluate("() => S.p3.goodwill")
    assert county == pytest.approx(2.4, abs=0.2) and country == pytest.approx(6, abs=0.3)


def test_tiles_label_opposition_and_show_build_progress(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e12; claim(0); render(); }")
    tile = pg.inner_text("#p3map button[data-tile='0']").lower()
    assert "opposition" in tile
    secs = pg.evaluate("() => S.p3.tiles[0].done - S.t")
    run(pg, secs / 2)
    pg.evaluate("() => render()")
    w = pg.evaluate("() => parseFloat(document.querySelector('#p3map button[data-tile=\"0\"] .prog i').style.width)")
    assert 30 < w < 70
    assert not pg.is_visible("#p3map button[data-tile='1'] .prog")


def test_headline_keeps_the_raw_gpu_count(game):
    pg = planet(game)
    pg.evaluate("() => render()")
    assert pg.is_visible("#gpuTotal")
    n = pg.evaluate("() => p3GPUs()")
    assert f"{n:,} GPUs" in pg.inner_text(".count")
    assert n == pg.evaluate("() => Math.round(onlineGW() * 1e6 / newest().kw)")
