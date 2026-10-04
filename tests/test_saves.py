"""Old saves keep loading. Every save carries S.v; start() runs the ordered migrations a save still needs."""
import json

import pytest

from conftest import MID, run, planet, statewide, nationwide, planetwide, to_space
from test_phasebar import campus

# What a phase 3 save looked like when the map first shipped: nothing beyond the original freshP3().
P3_OLD = ["level", "compute", "goodwill", "startedAt", "startChip", "homeGW", "tiles", "card", "nextCard", "zoomSaid"]
TILE_OLD = ["name", "trait", "state", "opp", "done", "moratorium"]
# Fields a current phase 3 save always has (the planet code reads them without defaults).
P3_NOW = ["tech", "techMult", "chipTech", "version", "trainProgress", "heat", "pumped", "nukes", "nice", "niceN", "niceUses",
          "answers", "unplugN", "nextUnplug", "nextDisaster", "hearingArmed", "hearingUntil", "autoclaimOff", "autotrainOff", "lastQ", "enough", "unbuild", "past"]


def old_p3_save(pg, **extra):
    """Rewrite the loaded phase 3 state as that first build would have saved it, then reload."""
    pg.evaluate(f"""() => {{ delete S.v; const keep = {json.dumps(P3_OLD)}, tk = {json.dumps(TILE_OLD)};
      for (const k of Object.keys(S.p3)) if (!keep.includes(k)) delete S.p3[k];
      S.p3.tiles = S.p3.tiles.map((t) => Object.fromEntries(Object.entries(t).filter(([k]) => tk.includes(k))));
      Object.assign(S.p3, {json.dumps(extra)}); save(); }}""")
    pg.reload()
    return pg


def assert_current(pg, level):
    assert pg.evaluate("() => S.v === SAVE_VERSION")
    assert pg.evaluate("() => S.p3.level") == level
    missing = pg.evaluate(f"() => {json.dumps(P3_NOW)}.filter((k) => !(k in S.p3))")
    assert missing == []
    assert pg.evaluate("() => S.p3.tiles.every((t) => t.boost === 1)")
    assert pg.evaluate("() => Number.isFinite(claimCost(0)) && Number.isFinite(computeRate()) && efficiency() > 0")
    run(pg, 3)
    pg.evaluate("() => render()")
    assert pg.is_visible("#p3map")


def test_migrations_are_ordered_and_end_at_the_current_version(game):
    pg = game()
    vs = pg.evaluate("() => MIGRATIONS.map((m) => m.v)")
    assert vs == sorted(vs) and len(set(vs)) == len(vs) and vs[-1] == pg.evaluate("() => SAVE_VERSION")
    assert pg.evaluate("() => S.v === SAVE_VERSION")


def test_a_phase1_save_without_a_version_loads(game):
    pg = game(MID)                                                       # MID predates S.v
    assert pg.evaluate("() => S.v === SAVE_VERSION")
    assert pg.evaluate("() => [S.fires, S.leaks, S.cap, S.universe, S.checks].every((x) => x != null)")
    run(pg, 5)
    pg.evaluate("() => save()")
    pg.reload()
    assert pg.evaluate("() => [S.v === SAVE_VERSION, S.phase, S.gen]") == [True, 1, 6]


def test_a_phase2_save_from_before_people_and_the_cap_table_loads(game):
    pg = campus(game)
    pg.evaluate("""() => { delete S.v; delete S.cap; delete S.fires; delete S.leaks; delete S.p2.people; delete S.p2.town; delete S.p2.ceo;
      delete S.p2.market; delete S.p2.startChip; for (const o of S.p2.offers) delete o.minGen; save(); }""")
    pg.reload()
    assert pg.evaluate("() => S.v === SAVE_VERSION")
    assert pg.evaluate("() => [S.p2.people.v, S.p2.town.v, S.p2.ceo.n, S.p2.market, S.p2.startChip]") == [80, 20, 0, 150, 3]
    assert pg.evaluate("() => S.p2.offers.every((o) => o.minGen === 0)")
    assert pg.evaluate("() => ownership()") < 1
    run(pg, 5)
    pg.evaluate("() => render()")
    assert pg.is_visible("#campusBox")


def test_an_old_county_level_save_loads(game):
    assert_current(old_p3_save(planet(game)), 0)


def test_an_old_state_level_save_loads(game):
    assert_current(old_p3_save(statewide(game)), 1)


def test_an_old_country_level_save_loads_with_heat(game):
    pg = old_p3_save(nationwide(game))
    assert_current(pg, 2)
    assert pg.evaluate("() => typeof S.p3.heat === 'number' && heatOn()")


def test_an_old_planet_level_save_with_the_space_placeholder_can_go_to_space(game):
    pg = old_p3_save(planetwide(game), zoomSaid=True)                  # saved when "space arrives in the next build"
    assert_current(pg, 3)
    assert pg.evaluate("() => 'zoomSaid' in S.p3") is False
    pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; render(); }")
    assert "into space" in pg.inner_text("#phaseGo").lower()


def test_an_old_space_save_loads(game):
    pg = old_p3_save(to_space(game))
    assert_current(pg, 4)
    assert pg.evaluate("() => inSpace() && !heatOn()")


def test_a_current_save_is_not_migrated_again(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.techMult = 2.5; S.p3.version = 9; S.p3.heat = 1.7; save(); }")
    pg.reload()
    assert pg.evaluate("() => [S.p3.techMult, S.p3.version, S.p3.heat]") == [2.5, 9, 1.7]


def test_a_save_that_already_said_enough_starts_the_unbuild(game):
    """Before the unbuild existed, Enough was a quiet screen. Those saves pick up where the new ending begins: at space."""
    pg = to_space(game)
    pg.evaluate("""() => { for (const t of S.p3.tiles) if (t.name.startsWith('Dyson')) t.state = 'online'; step(1);
      S.p3.enough = true; delete S.p3.unbuild; delete S.p3.past; S.v = 5; save(); }""")
    pg.reload()
    assert pg.evaluate("() => [S.v === SAVE_VERSION, unbuilding(), S.p3.unbuild.level, S.p3.unbuild.boards.length]") == [True, True, 4, 5]
    assert "standing here since" in pg.inner_text("#console")
    assert pg.is_visible("#p3map button[data-release]") and not pg.is_visible("#lastq")
    run(pg, 3)


def test_a_v5_save_mid_climb_gets_the_unbuild_fields(game):
    pg = nationwide(game)
    pg.evaluate("() => { delete S.p3.unbuild; delete S.p3.past; S.v = 5; save(); }")
    pg.reload()
    assert pg.evaluate("() => [S.v === SAVE_VERSION, S.p3.unbuild, S.p3.past, unbuilding()]") == [True, None, [], False]
    assert_current(pg, 2)
