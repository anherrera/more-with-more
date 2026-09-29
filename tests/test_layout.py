from conftest import READY, run

LAPTOP = {"width": 1440, "height": 900}


def busy_campus(game, page):
    page.set_viewport_size(LAPTOP)
    pg = game({**READY, "debt": 0, "funds": 5e8})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("""() => { S.rival.next = 1e9; S.nextChip = 1e9; firesOf().next = 1e9; S.p2.nextDrought = 1e9; S.p2.round = 1;
      S.fleet = {3: 400000}; S.gpus = 400000;
      for (let i = 0; i < 11; i++) S.p2.contracts.push({id: 'r' + i, n: 100 + i, who: 'A lab funded by Parallax', mw: 50 + 10 * i, minGen: 0,
        start: 0, end: S.t + 300 + 30 * i, fee: 1000 * i, upfront: 1, status: 'active', activeAt: 0});
      for (let i = 0; i < 2; i++) { makeOffer(); } render(); }""")
    return pg


def test_running_contracts_collapse_into_one_line(game, page):
    pg = busy_campus(game, page)
    assert "11 contracts delivering" in pg.inner_text("#runningSummary")
    assert pg.evaluate("() => document.querySelectorAll('#contracts [data-contract]').length") == 0


def test_the_important_stuff_fits_on_a_laptop_screen(game, page):
    pg = busy_campus(game, page)
    bottoms = pg.evaluate("""() => Object.fromEntries(['contractsBox', 'modelBox', 'campusBox', 'fleetBox', 'computeBox', 'projects', 'hypeNum', 'raise']
      .map((id) => [id, Math.round(document.getElementById(id).getBoundingClientRect().bottom)]))""")
    assert all(b <= 900 for b in bottoms.values()), bottoms
