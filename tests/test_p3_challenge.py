import pytest

from conftest import run, planet, nationwide


def test_held_tiles_stand_out(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.tiles[0].state = 'online'; render(); }")
    b = pg.query_selector("#p3map button[data-tile='0']")
    assert "held" in b.get_attribute("class") and "✓" in b.inner_text()
    assert "held" not in (pg.get_attribute("#p3map button[data-tile='1']", "class") or "")


def test_a_furious_tile_gets_unplugged_and_can_be_plugged_back_in(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e12; S.p3.tiles[0].state = 'online'; S.p3.tiles[0].opp = 95; }")
    gw = pg.evaluate("() => onlineGW()")
    run(pg, 31)
    assert pg.evaluate("() => S.p3.tiles[0].state") == "unplugged"
    assert pg.evaluate("() => onlineGW()") < gw
    assert "unplugged" in " ".join(pg.evaluate("() => S.log.slice(-4)")).lower()
    full = pg.evaluate("() => { S.p3.tiles[0].state = 'wild'; const c = claimCost(0); S.p3.tiles[0].state = 'unplugged'; return c; }")
    assert pg.evaluate("() => claimCost(0)") == pytest.approx(full / 2)
    pg.evaluate("() => { S.p3.tiles[0].moratorium = null; S.p3.tiles[0].opp = 40; claim(0); }")   # once the moratorium is over
    assert pg.evaluate("() => S.p3.tiles[0].state") == "building"


def test_very_low_goodwill_gets_tiles_unplugged(game):
    pg = planet(game)
    pg.evaluate("() => { for (let i = 0; i < 3; i++) S.p3.tiles[i].state = 'online'; for (const t of S.p3.tiles) t.opp = 0; S.p3.goodwill = 10; S.p3.nextUnplug = S.t + 1; }")
    run(pg, 2)
    assert pg.evaluate("() => S.p3.tiles.filter((t) => t.state === 'unplugged').length") == 1


def test_disasters_knock_tiles_offline_for_a_while(game):
    pg = nationwide(game)
    pg.evaluate("() => { S.p3.tiles[0].state = 'online'; S.p3.nextDisaster = S.t + 1; }")
    run(pg, 2)
    assert pg.evaluate("() => S.p3.tiles[0].state") == "down"
    assert any(w in " ".join(pg.evaluate("() => S.log.slice(-3)")).lower() for w in ["heatwave", "hurricane", "drought", "flood", "wildfire"])
    pg.evaluate("() => render()")
    assert pg.is_visible("#alerts")
    run(pg, 46)
    assert pg.evaluate("() => S.p3.tiles[0].state") == "online"


def test_no_disasters_at_the_county_level(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.tiles[0].state = 'online'; S.p3.nextDisaster = S.t + 1; }")
    run(pg, 3)
    assert pg.evaluate("() => S.p3.tiles[0].state") == "online"


def test_research_makes_ef_faster(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e12; render(); }")
    assert pg.is_visible("#p3research")
    assert pg.query_selector("#p3research button[data-tech='weights']")
    rate = pg.evaluate("() => computeRate()")
    pg.click("#p3research button[data-tech='weights']")
    assert pg.evaluate("() => computeRate()") == pytest.approx(rate * 1.25)
    pg.evaluate("() => render()")
    assert not pg.query_selector("#p3research button[data-tech='weights']")


def test_autoclaim_claims_for_me(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e12; buyTech('autoclaim'); for (const t of S.p3.tiles) t.opp = 0; }")
    run(pg, 11)
    assert pg.evaluate("() => S.p3.tiles.filter((t) => t.state !== 'wild').length") >= 1


def test_every_parallax_chip_brings_new_tech(game):
    pg = planet(game)
    before = set(pg.evaluate("() => availableTech().map((t) => t.id)"))
    pg.evaluate("() => { S.nextChip = S.t; }")
    run(pg, 1)
    after = set(pg.evaluate("() => availableTech().map((t) => t.id)"))
    new = after - before
    assert len(new) == 1 and list(new)[0].startswith("chip")
    assert "Parallax" in " ".join(pg.evaluate("() => S.log.slice(-2)"))


def test_level_tech_unlocks_with_scale(game):
    pg = planet(game)
    county = {t for t in pg.evaluate("() => availableTech().map((t) => t.id)")}
    assert "reversible" not in county
    pg.evaluate("() => { S.p3.level = 2; S.p3.tiles = freshTiles(2); }")
    assert "reversible" in pg.evaluate("() => availableTech().map((t) => t.id)")


def test_hearings_fit_the_level(game):
    from conftest import planetwide
    pg = planetwide(game)
    pg.evaluate("() => { openP3Card(0); render(); }")
    card = pg.inner_text("#p3card")
    assert "county" not in card.lower() and "high school" not in card.lower()
    assert "Assembly" in card
    pg.click("#p3cardBtns button >> nth=1")
    assert "county" not in pg.evaluate("() => S.log.at(-1)").lower()


def test_power_options_scale_with_the_level(game):
    pg = nationwide(game)
    labels = " ".join(pg.evaluate("() => powerOptions(0).map((o) => o.label)"))
    assert "grid" in labels.lower() and "fleet" in labels.lower()
    from conftest import planetwide


def test_getting_faster_makes_things_cheaper_in_time(game):
    pg = planet(game)
    cost = pg.evaluate("() => claimCost(0)")
    pg.evaluate("() => { S.p3.compute = 1e12; buyTech('weights'); }")
    assert pg.evaluate("() => claimCost(0)") == pytest.approx(cost)          # same price...
    assert pg.evaluate("() => claimCost(0) / computeRate()") < cost / pg.evaluate("() => onlineGW()")   # ...fewer seconds to earn it


def test_autoclaim_can_be_switched_off(game):
    pg = planet(game)
    assert not pg.is_visible("#p3auto")
    pg.evaluate("() => { S.p3.compute = 1e12; buyTech('autoclaim'); for (const t of S.p3.tiles) t.opp = 0; render(); }")
    assert pg.is_visible("#p3auto") and "on" in pg.inner_text("#p3auto").lower()
    pg.click("#p3auto")
    assert "off" in pg.inner_text("#p3auto").lower()
    run(pg, 21)
    assert pg.evaluate("() => S.p3.tiles.every((t) => t.state === 'wild')")


def test_unfinished_tiles_come_along_when_i_zoom_out(game):
    pg = planet(game)
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; S.p3.tiles[6].state = 'building'; S.p3.tiles[6].done = S.t + 50; render(); }")
    expected = pg.evaluate("() => onlineGW() + traitOf(S.p3.tiles[6]).gw")
    pg.click("#phaseGo")
    assert pg.evaluate("() => S.p3.homeGW") == pytest.approx(expected)
    assert "finished" in " ".join(pg.evaluate("() => S.log.slice(-4)")).lower()


@pytest.mark.parametrize("level,ids", [(0, ["tos", "robotics", "caching"]), (1, ["moe", "capitals", "speeches"]),
                                        (2, ["cables", "credits", "staffers"]), (3, ["nightside", "internet"]), (4, ["probes", "moon"])])
def test_more_projects_at_every_level(game, level, ids):
    pg = planet(game)
    pg.evaluate(f"() => {{ S.p3.level = {level}; S.p3.tiles = freshTiles({level}); S.p3.tiles[1].state = 'online'; }}")
    avail = pg.evaluate("() => availableTech().map((t) => t.id)")
    assert all(i in avail for i in ids)


def test_new_project_effects(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 1e15; buyTech('tos'); for (const t of S.p3.tiles) t.opp = 10; claim(0); }")
    assert pg.evaluate("() => S.p3.tiles[1].opp") == pytest.approx(12)            # neighbors +2 instead of +5
    pg.evaluate("() => { S.p3.level = 1; S.p3.tiles = freshTiles(1); S.p3.goodwill = 20; }")
    normal = pg.evaluate("() => { S.p3.tech.capitals = false; return claimCost(0); }")
    lobbied = pg.evaluate("() => { S.p3.tech.capitals = true; return claimCost(0); }")
    assert lobbied == pytest.approx(normal / 2)
    pg.evaluate("() => { S.p3.level = 2; S.p3.tiles = freshTiles(2); S.p3.tech.staffers = true; S.p3.goodwill = 20; S.p3.hearingArmed = false; }")
    run(pg, 1)
    assert pg.evaluate("() => S.p3.hearingUntil - S.t") <= 30
