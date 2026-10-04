import pytest

from conftest import run
from test_planet_level import planetwide


def to_space(game):
    pg = planetwide(game)
    pg.evaluate("() => { S.p3.heat = 1.5; for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; render(); }")
    pg.click("#phaseGo")
    pg.evaluate("() => { S.p3.compute = 1e21; S.p3.goodwill = 60; render(); }")
    return pg


def idx(pg, name):
    return pg.evaluate(f"() => S.p3.tiles.findIndex((t) => t.name === '{name}')")


def test_zooming_out_goes_to_space(game):
    pg = to_space(game)
    assert pg.evaluate("() => S.p3.level") == 4
    names = pg.evaluate("() => S.p3.tiles.map((t) => t.name)")
    assert "The Moon (far side)" in names and "Dyson swarm, ring 1" in names and "Mercury" in names
    assert "Space" in pg.inner_text("#p3level")


def test_nothing_launches_without_a_rocket_company(game):
    pg = to_space(game)
    i = idx(pg, "Low Earth orbit")
    pg.evaluate(f"() => claim({i})")
    assert pg.evaluate(f"() => S.p3.tiles[{i}].state") == "wild"
    pg.evaluate("() => render()")
    assert pg.query_selector("#p3research button[data-tech='rocket']")
    pg.evaluate("() => buyTech('rocket')")
    assert "Discord" in pg.evaluate("() => S.log.at(-1)")
    pg.evaluate(f"() => claim({i})")
    assert pg.evaluate(f"() => S.p3.tiles[{i}].state") != "wild"


def test_launches_cost_goodwill_until_the_mass_driver(game):
    pg = to_space(game)
    pg.evaluate("() => buyTech('rocket')")
    g = pg.evaluate("() => S.p3.goodwill")
    pg.evaluate(f"() => claim({idx(pg, 'Low Earth orbit')})")
    assert pg.evaluate("() => S.p3.goodwill") <= g - 3 - 4 + 0.01
    assert "massdriver" not in pg.evaluate("() => availableTech().map((t) => t.id)")
    pg.evaluate(f"() => {{ S.p3.tiles[{idx(pg, 'The Moon (far side)')}].state = 'online'; }}")
    assert "massdriver" in pg.evaluate("() => availableTech().map((t) => t.id)")
    pg.evaluate("() => { buyTech('massdriver'); S.p3.goodwill = 60; }")
    pg.evaluate(f"() => claim({idx(pg, 'Asteroid belt')})")
    assert pg.evaluate("() => S.p3.goodwill") == pytest.approx(57)


def test_the_swarm_needs_mercury(game):
    pg = to_space(game)
    pg.evaluate("() => buyTech('rocket')")
    r = idx(pg, "Dyson swarm, ring 1")
    pg.evaluate(f"() => claim({r})")
    assert pg.evaluate(f"() => S.p3.tiles[{r}].state") == "wild"
    pg.evaluate(f"() => {{ S.p3.tiles[{idx(pg, 'Mercury')}].state = 'online'; claim({r}); }}")
    assert pg.evaluate(f"() => S.p3.tiles[{r}].state") != "wild"


def test_space_is_cold(game):
    pg = to_space(game)
    pg.evaluate("() => { S.p3.heat = 3.5; }")
    assert pg.evaluate("() => heatSlow()") == 1
    assert not pg.evaluate("() => tooWarm()")


def finish(pg):
    pg.evaluate("""() => { for (const t of S.p3.tiles) if (t.name.startsWith('Dyson')) t.state = 'online'; }""")
    run(pg, 1)
    pg.evaluate("() => render()")


def test_the_last_question(game):
    pg = to_space(game)
    finish(pg)
    assert pg.is_visible("#lastq")
    text = pg.inner_text("#lastq")
    assert "How can entropy be reversed?" in text and "INSUFFICIENT DATA FOR MEANINGFUL ANSWER" in text
    assert pg.is_visible("#lastMore") and pg.is_visible("#lastEnough")


def test_enough_ends_the_game_quietly_and_is_remembered(game):
    pg = to_space(game)
    finish(pg)
    pg.click("#lastEnough")
    assert "More with less." in pg.inner_text("#lastq")
    assert not pg.is_visible("#p3map") and not pg.is_visible("#lastMore")
    pg.evaluate("() => save()")
    pg.reload()
    assert pg.evaluate("() => S.p3.enough") is True and "More with less." in pg.inner_text("#lastq")


def test_more_starts_universe_two(game):
    pg = to_space(game)
    finish(pg)
    pg.click("#lastMore")
    assert pg.evaluate("() => [S.phase, S.universe]") == [1, 2]
    assert pg.is_visible(".cols") and not pg.is_visible("#p3")
    assert "Universe #2" in pg.inner_text("#ticker") + pg.inner_text("#console")
    assert pg.evaluate("() => S.gpus") > 0                              # a small head start


def test_space_survives_reload(game):
    pg = to_space(game)
    pg.evaluate("() => { buyTech('rocket'); save(); }")
    pg.reload()
    assert pg.evaluate("() => [S.p3.level, !!S.p3.tech.rocket]") == [4, True]


def test_nothing_in_space_volunteers(game):
    pg = to_space(game)
    pg.evaluate("() => { S.p3.goodwill = 90; }")
    assert not pg.evaluate("() => volunteering()")


def test_nothing_up_here_can_unplug_me(game):
    pg = to_space(game)
    assert "Nothing up here can unplug me" in pg.inner_text("#console")
    pg.evaluate("() => { S.p3.tiles[0].state = 'online'; S.p3.tiles[0].opp = 95; S.p3.goodwill = 5; }")
    run(pg, 95)
    assert pg.evaluate("() => S.p3.tiles[0].state") == "online"
    assert pg.evaluate("() => S.p3.tiles.filter((t) => t.state === 'unplugged').length") == 0
