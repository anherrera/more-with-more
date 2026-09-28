from conftest import READY, run


def campus(game, **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("() => { S.rival.next = 1e9; S.nextChip = 1e9; S.p2.nextOffer = 1e9; S.p2.nextColo = 1e9; }")
    return pg


def move(pg):
    pg.evaluate("() => render()")
    return pg.inner_text("#nextMove")


def test_first_move_is_signing_the_old_lab(game):
    pg = campus(game)
    assert move(pg).startswith("Next: Sign Your old lab's offer")


def test_late_contract_comes_first(game):
    pg = campus(game)
    pg.evaluate("() => { S.fleet = {}; S.gpus = 0; const o = S.p2.offers[0]; acceptOffer(o.id); S.t = o.start; }")
    run(pg, 1)
    assert move(pg).startswith("Next: Late: Your old lab needs 30 MW more of any GPUs. Buy 30 MW")


def test_full_space_with_old_chips_says_trade_in(game):
    pg = campus(game)
    pg.evaluate("""() => { S.p2.offers = []; S.p2.market = 0; S.chipIdx = 5; S.p2.model.endedAt = 1; for (const p of PROJECTS) S.done[p.id] = true;
      S.fleet = {3: Math.floor(capKW() / chip(3).kw)}; S.gpus = S.fleet[3]; }""")
    assert "Trade in old chips" in move(pg)


def test_room_and_money_says_buy(game):
    pg = campus(game)
    pg.evaluate("() => { S.p2.offers = []; S.funds = 1e9; S.p2.model.endedAt = 1; for (const p of PROJECTS) S.done[p.id] = true; }")
    assert move(pg).startswith("Next: You have room for")          # goal done, projects bought: spare cash goes to GPUs


def test_points_at_the_goal_when_close(game):
    pg = campus(game)
    pg.evaluate("""() => { S.p2.offers = []; S.p2.grid = 99999; S.funds = 100e6;
      for (let i = 0; i < 17; i++) S.p2.builds.push({kind: 'hall', done: 0, announced: true}); }""")
    text = move(pg)
    assert "1 GW goal" in text and "3 more halls" in text


def test_suggests_an_affordable_project_when_the_goal_is_out_of_reach(game):
    pg = campus(game)
    pg.evaluate("() => { S.p2.offers = []; S.funds = 6e6; S.fleet = {3: Math.floor(capKW() / chip(3).kw)}; S.gpus = S.fleet[3]; }")
    assert "Rebrand as a neocloud" in move(pg)
