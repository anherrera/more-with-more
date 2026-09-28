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
    ground = pg.query_selector("button[data-id='ground']")
    assert "Still need to: train Gen 7" in ground.inner_text()
    assert not ground.is_enabled()


def test_buy_ten(game):
    pg = game(MID, test=False)
    pg.click("button[data-buy='10']")
    assert pg.inner_text("#gpuCount") == "5,010"


def test_ground_ready(game):
    pg = game(READY, test=False)
    ground = pg.query_selector("button[data-id='ground']")
    assert "Ready." in ground.inner_text()
    assert ground.is_enabled()


def test_reload_keeps_state(game):
    pg = game(MID, test=False)
    pg.click("button[data-buy='10']")
    pg.reload()
    assert pg.inner_text("#gpuCount") == "5,010"
