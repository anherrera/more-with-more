from conftest import MID, planet

KEYS = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]


def konami(pg):
    for k in KEYS:
        pg.keyboard.press(k)


def test_konami_in_phase1_gives_thirty_gpus_once(game):
    pg = game(MID)
    g = pg.evaluate("() => S.gpus")
    konami(pg)
    assert pg.evaluate("() => S.gpus") == g + 30
    assert "30" in pg.evaluate("() => S.log.at(-1)") and pg.evaluate("() => S.tampered") >= 1
    konami(pg)
    assert pg.evaluate("() => S.gpus") == g + 30                    # once per game
    assert "already" in pg.evaluate("() => S.log.at(-1)").lower()


def test_konami_in_phase3_gives_thirty_seconds_of_tokens(game):
    pg = planet(game)
    c, rate = pg.evaluate("() => [S.p3.compute, computeRate()]")
    konami(pg)
    assert abs(pg.evaluate("() => S.p3.compute") - (c + 30 * rate)) < 1e-6 * (c + 30 * rate)


def test_a_wrong_key_resets_the_sequence(game):
    pg = game(MID)
    g = pg.evaluate("() => S.gpus")
    for k in KEYS[:5] + ["x"] + KEYS[5:]:
        pg.keyboard.press(k)
    assert pg.evaluate("() => S.gpus") == g
