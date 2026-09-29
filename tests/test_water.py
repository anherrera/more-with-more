import pytest

from conftest import READY, run


def campus(game, county="strong", **extra):
    pg = game({**READY, "debt": 0, "funds": 5e9, **extra})
    pg.click("button[data-id='ground']")
    pg.click(f"button[data-county='{county}']")
    pg.evaluate("""() => { S.rival.next = 1e9; S.nextChip = 1e9; S.p2.nextOffer = 1e9; S.p2.nextColo = 1e9; S.p2.offers = [];
      firesOf().next = 1e9; S.p2.nextDrought = 1e9; S.p2.grid = 99999; }""")
    return pg


def halls(pg, n):
    pg.evaluate(f"() => {{ for (let i = 0; i < {n}; i++) S.p2.builds.push({{kind: 'hall', done: 0, announced: true}}); }}")


def test_drought_county_water_limits_energized(game):
    pg = campus(game, "strong")                     # 5 MGD -> 500 MW of halls
    halls(pg, 20)
    run(pg, 1)
    assert pg.evaluate("() => energizedAt()") == 500
    assert pg.inner_text("#p2limit").startswith("water")
    assert "dark" in pg.inner_text("#halls")


def test_other_counties_have_more_water(game):
    pg = campus(game, "cheap")
    assert pg.evaluate("() => waterAt() / WATER_PER_MW") == pytest.approx(1200)


def test_drought_cuts_the_allocation_for_a_while(game):
    pg = campus(game, "strong")
    pg.evaluate("() => { S.p2.nextDrought = S.t + 1; }")
    run(pg, 2)
    assert pg.evaluate("() => waterAt()") == pytest.approx(5 * 0.6)
    assert "Drought" in pg.inner_text("#console")
    run(pg, 180)
    assert pg.evaluate("() => waterAt()") == pytest.approx(5)


def test_wells_add_water_until_the_aquifer_runs_dry(game):
    pg = campus(game, "strong")
    pg.click("#buildWell")
    run(pg, 45)
    assert pg.evaluate("() => waterAt()") == pytest.approx(7)
    run(pg, 100)
    assert pg.evaluate("() => S.p2.aquifer") < 100
    pg.evaluate("() => { S.p2.aquifer = 0; }")
    run(pg, 1)
    assert pg.evaluate("() => waterAt()") == pytest.approx(5)
    assert "aquifer" in pg.inner_text("#p2water").lower()


def test_reclaimed_water_plant(game):
    pg = campus(game, "strong")
    pg.click("#buildReclaimed")
    run(pg, 120)
    assert pg.evaluate("() => waterAt()") == pytest.approx(8)


@pytest.mark.parametrize("county", ["cheap", "strong", "incent"])
def test_one_gigawatt_is_always_reachable(game, county):
    """No hard cap anywhere: with enough money, halls + power + water always get to the 1 GW goal, even in a drought."""
    pg = campus(game, county, funds=1e12)
    pg.evaluate("() => { S.p2.grid = countyOf().gridMW; S.p2.drought = {until: S.t + 1e9}; }")      # worst case: permanent drought
    for _ in range(200):
        done = pg.evaluate("""() => {
          if (energizedAt(S.t + 1e6) >= GOAL_MW) return true;
          const halls = hallMWAt(1e12), power = powerAt(1e12), water = waterMWAt(1e12);
          if (acresFree() < HALL.acres) buyLand();
          else if (halls <= Math.min(power, water)) build('hall');
          else if (power <= water) build('turbine');
          else build('reclaimed');
          return false; }""")
        if done:
            break
    run(pg, 400)
    assert pg.evaluate("() => energizedAt()") >= 1000
