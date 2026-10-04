from conftest import MID


def test_console_greets_devtools_users(game, page):
    logs = []
    page.on("console", lambda m: logs.append(m.text))
    game(MID, test=False)
    page.wait_for_timeout(300)
    text = " ".join(logs)
    assert "You opened the console" in text and "game.S" in text


def test_touching_the_game_from_devtools_gets_noticed_once(game, page):
    pg = game(MID, test=False)
    pg.evaluate("() => { game.S.funds += 1e9; game.S.hype = 99; }")     # reading game.S at all counts as a touch
    assert sum("auditor" in l for l in pg.evaluate("() => game.S.log")) == 1
    assert pg.evaluate("() => game.S.tampered") >= 1


def test_phase3_notices_in_first_person(game, page):
    from conftest import READY
    pg = game({**READY, "phase": 3, "p3": {"level": 0}}, test=False)
    pg.evaluate("() => { game.S.p3.goodwill = 100; }")
    assert any("felt that" in l for l in pg.evaluate("() => game.S.log"))


def test_tests_and_robots_do_not_count_as_tampering(game):
    pg = game(MID)
    pg.evaluate("() => { S.funds += 1; game.S.funds += 1; }")
    assert not any("auditor" in l for l in pg.evaluate("() => S.log"))
