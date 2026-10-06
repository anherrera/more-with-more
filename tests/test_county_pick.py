from conftest import READY


def broke_ground(game):
    pg = game({**READY, "debt": 0})
    pg.click("button[data-id='ground']")
    return pg


def test_choosing_a_county_is_the_only_thing_on_screen(game):
    pg = broke_ground(game)
    assert "picking" in pg.evaluate("() => document.body.className")
    assert pg.is_visible("#countyBox") and len(pg.query_selector_all("button[data-county]")) == 3
    for hidden in ["#computeBox", "#facilitiesBox", "#projects", "#hypeNum"]:
        assert not pg.is_visible(hidden), hidden
    assert "Choose a county" in pg.inner_text("#phaseBar")


def test_the_clock_waits_for_the_choice(game):
    pg = broke_ground(game)
    assert pg.evaluate("() => waitingOnCounty()") is True
    pg.click("button[data-county='strong']")
    assert pg.evaluate("() => waitingOnCounty()") is False


def test_panels_animate_in_after_the_choice(game):
    pg = broke_ground(game)
    pg.click("button[data-county='strong']")
    pg.evaluate("() => render()")
    assert "picking" not in pg.evaluate("() => document.body.className")
    assert "reveal" in pg.get_attribute(".cols", "class")
    assert pg.is_visible("#campusBox") and pg.is_visible("#computeBox")


def test_cheap_land_builds_cheap(game):
    """The weak-grid county makes you build your own power; building there costs a quarter less, so it doesn't stall."""
    pg = broke_ground(game)
    pg.click("button[data-county='cheap']")
    costs = pg.evaluate("""() => Object.fromEntries(['cheap', 'strong'].map((id) => { S.p2.county = id;
      return [id, {hall: buildCost('hall'), turbine: buildCost('turbine')}]; }))""")
    assert costs["cheap"]["hall"] == 0.75 * costs["strong"]["hall"]
    assert costs["cheap"]["turbine"] == 0.75 * costs["strong"]["turbine"]


def test_the_cheap_county_says_building_is_cheap(game):
    pg = broke_ground(game)
    assert "25% less" in pg.inner_text("button[data-county='cheap']")
