import pytest

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


def test_clock_waits_for_the_first_click(game):
    pg = game(test=False)
    pg.wait_for_timeout(1200)
    assert pg.evaluate("() => S.t") == 0
    assert pg.inner_text("#clock").startswith("0:00")
    pg.click("#answer")
    pg.wait_for_timeout(1200)
    assert pg.evaluate("() => S.t") > 0.5


def test_saved_games_keep_ticking_without_a_click(game):
    pg = game(MID, test=False)
    t0 = pg.evaluate("() => S.t")
    pg.wait_for_timeout(1200)
    assert pg.evaluate("() => S.t") > t0


def test_answer_is_clickable_before_the_clock_starts_even_with_no_queries(game):
    pg = game({"queue": 0, "logV2": True, "coolingV2": True}, test=False)   # e.g. an old save or a mixed-version load
    pg.wait_for_timeout(300)
    assert pg.is_enabled("#answer")
    pg.click("#answer")
    pg.wait_for_timeout(1500)
    assert pg.evaluate("() => S.t") > 0.5                                   # the click started the clock: no deadlock


def test_speed_param_fast_forwards_play(page, server):
    page.goto(server + "?speed=10")
    page.click("#answer")                               # starts the clock
    page.wait_for_timeout(1000)
    assert page.evaluate("() => S.t") > 6               # ~10 game-seconds per real second


def test_answer_never_greys_out(game):
    pg = game(MID)
    pg.evaluate("() => { S.queue = 0; clockOn = true; render(); }")
    assert pg.is_enabled("#answer")
    funds, price = pg.evaluate("() => [S.funds, S.price]")
    pg.click("#answer")
    assert pg.evaluate("() => S.funds") == pytest.approx(funds + price)


@pytest.mark.parametrize("hype,cls", [(20, "bad"), (60, "good"), (120, "warn"), (170, "bad")])
def test_hype_meter_colors(game, hype, cls):
    pg = game({**MID, "hype": hype})
    pg.evaluate("() => render()")
    assert cls in pg.get_attribute("#hypeMeter", "class").split()


@pytest.mark.parametrize("fill,cls", [(0.5, "good"), (0.9, "warn"), (1.0, "bad")])
def test_power_meter_colors(game, fill, cls):
    pg = game(MID)
    pg.evaluate(f"() => {{ S.fleet = {{3: Math.floor(capKW() * {fill} / chip(3).kw)}}; S.gpus = S.fleet[3]; render(); }}")
    assert cls in pg.get_attribute("#powerMeter", "class").split()
