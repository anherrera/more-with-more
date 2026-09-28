from conftest import READY


def campus(game):
    pg = game({**READY, "debt": 0, "hype": 80})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    return pg


def test_series_e_needs_backlog(game):
    pg = campus(game)
    assert "Series E needs 100 MW of signed backlog" in pg.inner_text("#raise")
    assert pg.is_disabled("#raise")
    pg.evaluate("() => { S.p2.offers = []; makeOffer(); const o = S.p2.offers[0]; o.mw = 100; acceptOffer(o.id); render(); }")
    assert "Series E needs 150 MW of campus" in pg.inner_text("#raise")      # backlog alone isn't enough
    assert pg.is_disabled("#raise")
    pg.evaluate("() => { S.p2.grid = 99999; for (let i = 0; i < 3; i++) S.p2.builds.push({kind: 'hall', done: 0, announced: true}); render(); }")
    funds = pg.evaluate("() => S.funds")
    pg.click("#raise")
    assert pg.evaluate("() => S.funds") - funds == 100e6
    assert pg.evaluate("() => S.p2.round") == 1
    assert "Series F" in pg.inner_text("#raise")
