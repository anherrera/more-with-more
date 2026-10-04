from conftest import MID


def test_pause_is_obvious_and_stops_the_clock(game):
    pg = game(MID)
    assert pg.is_visible("#pause") and "Pause" in pg.inner_text("#pause")
    pg.click("#pause")
    assert pg.evaluate("() => [S.paused, running()]") == [True, False]
    assert pg.is_visible("#pausedBanner") and "Paused" in pg.inner_text("#pausedBanner")
    assert "Resume" in pg.inner_text("#pause")
    assert "paused" in pg.evaluate("() => document.body.className")
    pg.click("#pause")
    assert pg.evaluate("() => S.paused") is False and not pg.is_visible("#pausedBanner")


def test_pause_survives_reload(game):
    pg = game(MID)
    pg.click("#pause")
    pg.evaluate("() => save()")
    pg.reload()
    assert pg.evaluate("() => S.paused") is True and pg.is_visible("#pausedBanner")


def test_p_key_toggles_pause(game):
    pg = game(MID)
    pg.keyboard.press("p")
    assert pg.evaluate("() => S.paused") is True
    pg.keyboard.press("p")
    assert pg.evaluate("() => S.paused") is False
