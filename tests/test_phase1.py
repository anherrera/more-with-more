from conftest import MID, READY


def test_fresh_start(game):
    pg = game(test=False)
    assert pg.inner_text("#gpuCount") == "0"
    assert pg.is_visible("#answer")
    assert "Nothing yet. Train a model." in pg.inner_text("#projects")
    assert "A model with no name" in pg.inner_text("#console")


def test_mid_game_panels(game):
    pg = game(MID, test=False)
    assert pg.inner_text("#gpuCount") == "5,000"
    assert len(pg.query_selector_all("#leases button")) == 5
    assert pg.inner_text("#cooling") == "Two-phase immersion, 200 kW/rack for new leases"
    assert "next: Gen 7, then break ground" in pg.inner_text("#hypeNote")
    ground = pg.locator("button[data-id='ground']")
    assert "Still need to: train Gen 7" in ground.inner_text()
    assert not ground.is_enabled()


def test_buy_ten(game):
    pg = game(MID, test=False)
    pg.click("button[data-buy='10']")
    assert pg.inner_text("#gpuCount") == "5,010"


def test_ground_ready(game):
    pg = game(READY, test=False)
    ground = pg.locator("button[data-id='ground']")
    assert "Ready." in ground.inner_text()
    assert ground.is_enabled()


def test_reload_keeps_state(game):
    pg = game(MID, test=False)
    pg.click("button[data-buy='10']")
    pg.reload()
    assert pg.inner_text("#gpuCount") == "5,010"


def test_phase1_capacity_unchanged(game):
    pg = game(MID)
    assert pg.evaluate("() => capKW() === leasedKW()")


def test_spot_market_sits_in_the_middle_column(game):
    pg = game(MID)
    col = pg.evaluate("() => { const cols = [...document.querySelectorAll('.cols > .col')].filter((c) => c.offsetParent); "
                      "return cols.findIndex((c) => c.contains(document.getElementById('spotBox'))); }")
    assert col == 1


def test_projects_list_never_moves_what_is_below_it(game):
    pg = game(MID)
    top = lambda: pg.evaluate("() => document.querySelector('#projects').nextElementSibling?.getBoundingClientRect().top ?? document.querySelector('#projects').parentElement.nextElementSibling.getBoundingClientRect().top")
    before = top()
    pg.evaluate("() => { for (const p of PROJECTS) p._when = p.when; for (const p of PROJECTS) p.when = () => true; S.done = {}; render(); }")
    assert top() == before


def test_new_games_start_training_at_half(game):
    pg = game()
    assert pg.evaluate("() => S.split") == 50
    assert pg.input_value("#split") == "50"
