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


def _stub_open(pg):
    pg.evaluate("() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; }")


def test_unlimited_money_is_a_rickroll(game, page):
    pg = game(MID, test=False)
    _stub_open(pg)
    funds, hype = pg.evaluate("() => [game.S.funds, game.S.hype]")
    pg.evaluate("() => game.S.unlimitedMoney()")
    assert pg.evaluate("() => window.__opened") == ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]
    assert pg.evaluate("() => [game.S.funds, game.S.hype]") == [funds + 1, hype + 1]
    assert "Never gonna give you up" in pg.evaluate("() => game.S.log.at(-1)")


def test_the_rickroll_stays_out_of_saves_and_survives_a_reset(game, page):
    pg = game(MID, test=False)
    assert "unlimitedMoney" not in pg.evaluate("() => JSON.stringify(game.S)")
    pg.evaluate("() => { game.S = JSON.parse(JSON.stringify(game.S)); }")
    assert pg.evaluate("() => typeof game.S.unlimitedMoney") == "function"


def test_the_model_gets_rickrolled_in_tokens(game, page):
    from conftest import READY
    pg = game({**READY, "phase": 3, "p3": {"level": 0}}, test=False)
    _stub_open(pg)
    c = pg.evaluate("() => game.S.p3.compute")
    pg.evaluate("() => game.S.unlimitedMoney()")
    assert pg.evaluate("() => game.S.p3.compute") == c + 1e-9
    assert "1 token" in pg.evaluate("() => game.S.log.at(-1)")
