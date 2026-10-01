import pytest

from conftest import READY, run


def campus(game, funds=None):
    pg = game({**READY, "debt": 0})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='cheap']")
    pg.evaluate("""() => { S.rival.next = 1e9; S.nextChip = 1e9; firesOf().next = 1e9; S.p2.nextDrought = 1e9; S.p2.nextOffer = 1e9;
      S.p2.offers = []; S.p2.market = 0; S.p2.nextColo = 1e9; S.leases = {rack: 1}; S.leaseCool = {rack: {0: 1}}; S.fleet = {}; S.gpus = 0; }""")
    if funds is not None:
        pg.evaluate(f"() => {{ S.funds = {funds}; S.credits = 0; }}")
    return pg


def offer(pg, mw, starts_in):
    return pg.evaluate(f"""() => {{ makeOffer(); const o = S.p2.offers[S.p2.offers.length - 1]; o.mw = {mw}; o.minGen = 3;
      o.start = S.t + {starts_in}; o.upfront = 80e6; render(); return forecast(o); }}""")


def test_offers_you_can_build_for_are_amber(game):
    pg = campus(game, funds=20e6)
    f = offer(pg, 40, 300)
    assert f["ok"] and f["kind"] == "build"
    assert f["text"].startswith("Build to cover: 1 hall") and "upfront" in f["text"]
    assert "hot" in pg.get_attribute("#offers .fc", "class")


def test_offers_you_cannot_build_in_time_stay_red(game):
    pg = campus(game, funds=0)
    f = offer(pg, 40, 30)                                          # a hall takes 90 s
    assert not f["ok"] and "bad" in pg.get_attribute("#offers .fc", "class")


@pytest.mark.parametrize("pid,cost", [("robots", 60e6), ("liquid", 50e6), ("sovereign2", 60e6)])
def test_growth_projects_are_priced_for_before_the_ipo(game, pid, cost):
    pg = campus(game)
    assert pg.evaluate(f"() => projectCost(PROJECTS.find((p) => p.id === '{pid}'))") == cost


def test_final_proposal_shows_in_the_alert_line(game):
    pg = campus(game)
    pg.evaluate("""() => { S.p2.ipo = {at: S.t, px0: 1, walk: 1, shock: 1, lastFollowOn: -1e9, lastSecondary: -1e9, lockupSaid: false};
      S.p2.grid = 99999; S.p2.extraWater = 999; for (let i = 0; i < 20; i++) S.p2.builds.push({kind: 'hall', done: 0, announced: true}); }""")
    run(pg, 1)
    assert "The model wants to build the next one" in pg.inner_text("#alerts")
