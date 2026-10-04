from conftest import READY, run


def campus(game, county="strong", **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click(f"button[data-county='{county}']")
    pg.evaluate("""() => { S.rival.next = 1e9; S.nextChip = 1e9; firesOf().next = 1e9; leaksOf().next = 1e9;
      S.p2.offers = []; S.p2.nextOffer = 1e9; S.p2.nextDrought = 1e9; moraleOf().lastTender = 1e9; townOf().nextHall = 1e9; }""")
    return pg


def test_organized_town_starts_angrier_and_gets_angrier_faster(game):
    pg = campus(game, "incent", funds=1e10)
    assert pg.evaluate("() => townOf().v") == 40
    pg.evaluate("() => build('hall')")
    assert pg.evaluate("() => townOf().v") == 40 + 8


def test_calm_county_starts_lower(game):
    pg = campus(game, "cheap", funds=1e10)
    v = pg.evaluate("() => townOf().v")
    assert v < 40
    pg.evaluate("() => build('hall')")
    assert pg.evaluate("() => townOf().v") == v + 4


def test_community_meter_and_jobs_line_in_campus(game):
    pg = campus(game)
    pg.evaluate("() => { townOf().jobs = 2400; render(); }")
    assert pg.is_visible("#townMeter")
    assert "Jobs promised: 2,400. Jobs delivered: 41." in pg.inner_text("#townCause")


def test_opposition_slows_builds_and_raises_land(game):
    pg = campus(game, funds=1e10)
    pg.evaluate("() => { townOf().v = 0; }")
    land = pg.evaluate("() => landCost()")
    pg.evaluate("() => build('turbine')")
    fast = pg.evaluate("() => S.p2.builds.at(-1).done - S.t")
    pg.evaluate("() => { townOf().v = 85; build('turbine'); }")
    assert pg.evaluate("() => S.p2.builds.at(-1).done - S.t") > fast * 1.5
    assert pg.evaluate("() => landCost()") > land * 1.5


def test_moratorium_blocks_halls_then_lifts(game):
    pg = campus(game, funds=1e10)
    pg.evaluate("() => { townOf().v = 95; }")
    run(pg, 2)
    assert pg.evaluate("() => townOf().moratorium") is not None
    n = pg.evaluate("() => S.p2.builds.length")
    pg.evaluate("() => { build('hall'); render(); }")
    assert pg.evaluate("() => S.p2.builds.length") == n
    assert pg.is_disabled("#buildHall") and "Moratorium" in pg.inner_text("#buildHall")
    assert "Moratorium" in pg.inner_text("#alerts")
    run(pg, 121)
    assert pg.evaluate("() => townOf().moratorium") is None
    assert pg.evaluate("() => townOf().v") < 90


def test_town_hall_card_has_three_choices(game):
    pg = campus(game)
    pg.evaluate("() => { S.p2.builds.push({kind: 'hall', done: S.t + 50}); townOf().nextHall = S.t + 1; }")
    run(pg, 2)
    pg.evaluate("() => render()")
    assert pg.evaluate("() => S.p2.card.kind") == "townhall"
    assert "town hall" in pg.inner_text("#card").lower()
    assert len(pg.query_selector_all("#cardBtns button")) == 3
    v = pg.evaluate("() => townOf().v")
    pg.click("#cardBtns button >> nth=0")
    assert pg.evaluate("() => townOf().v") < v
    assert pg.evaluate("() => townOf().jobs") > 0


def test_skipping_the_town_hall_makes_it_worse(game):
    pg = campus(game)
    pg.evaluate("() => { S.p2.builds.push({kind: 'hall', done: S.t + 50}); townOf().nextHall = S.t + 1; }")
    run(pg, 2)
    v = pg.evaluate("() => townOf().v")
    run(pg, 21)
    assert pg.evaluate("() => S.p2.card") is None
    assert pg.evaluate("() => townOf().v") > v + 5


def test_sponsor_button_lowers_opposition_at_sane_prices_with_a_cooldown(game):
    pg = campus(game, funds=1e10)
    pg.evaluate("() => { townOf().v = 80; render(); }")
    assert pg.is_enabled("#sponsor")
    pg.click("#sponsor")
    assert pg.evaluate("() => townOf().v") < 80
    pg.evaluate("() => render()")
    assert pg.is_disabled("#sponsor")                          # the town needs a minute
    run(pg, 61)
    pg.evaluate("() => render()")
    assert pg.is_enabled("#sponsor")
    for _ in range(12):                                        # never balloons into the billions
        pg.evaluate("() => { townOf().sponsorAt = -1e9; townOf().v = 80; sponsor(); }")
    assert pg.evaluate("() => sponsorCost()") <= 10e6


def test_high_opposition_says_how_to_lower_it(game):
    pg = campus(game)
    pg.evaluate("() => { townOf().v = 70; render(); }")
    assert "Lower it" in pg.inner_text("#townCause")


def test_community_benefits_agreement_lowers_it_now(game):
    pg = campus(game, funds=1e10)
    pg.evaluate("() => { townOf().v = 80; buyProject('cba2'); }")
    assert pg.evaluate("() => townOf().v") == 60


def test_late_game_high_school(game):
    pg = campus(game, funds=1e10)
    pg.evaluate("() => { townOf().v = 80; S.p2.round = 1; render(); }")
    assert pg.query_selector("button[data-id='highschool']")
    pg.evaluate("() => buyProject('highschool')")
    assert pg.evaluate("() => townOf().v") == 50


def test_solar_does_not_anger_the_town_but_turbines_do(game):
    pg = campus(game, funds=1e10)
    v = pg.evaluate("() => townOf().v")
    pg.evaluate("() => build('solar')")
    assert pg.evaluate("() => townOf().v") == v
    pg.evaluate("() => build('turbine')")
    assert pg.evaluate("() => townOf().v") > v


def test_community_has_its_own_section(game):
    pg = campus(game)
    pg.evaluate("() => render()")
    assert pg.is_visible("#townBox")
    assert pg.inner_text("#townBox h3") == "Community"
    assert pg.evaluate("() => !!document.querySelector('#townBox #townMeter') && !document.querySelector('#campusBox #townMeter')")


def test_town_hall_card_sits_in_community_and_tender_in_deals(game):
    pg = campus(game)
    pg.evaluate("() => { openCard('townhall'); render(); }")
    assert pg.evaluate("() => !!document.querySelector('#townBox #card')")
    pg.evaluate("() => { S.p2.card = null; openCard('tender'); render(); }")
    assert pg.evaluate("() => !!document.querySelector('#colDeals #card')")


def test_the_town_gets_used_to_you(game):
    pg = campus(game, funds=1e10)
    pg.evaluate("() => { townOf().v = 30; S.p2.extraAcres = 1e5; build('hall'); }")
    first = pg.evaluate("() => townOf().v") - 30
    pg.evaluate("() => { for (let i = 0; i < 40; i++) S.p2.builds.push({kind: 'hall', done: 0, announced: true}); townOf().v = 30; build('hall'); }")
    later = pg.evaluate("() => townOf().v") - 30
    assert 0 < later < first / 2


def test_opposition_eases_faster(game):
    pg = campus(game)
    pg.evaluate("() => { townOf().v = 60; }")
    run(pg, 60)
    assert pg.evaluate("() => townOf().v") <= 60 - 2.4 + 0.01
