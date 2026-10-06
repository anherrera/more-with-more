"""The Enough ending is the unbuild: the map zooms back in level by level and every tile I hold is released, until the
last county is a county again and what's left is the first rack, one GPU, and the founder asking "Can you turn it off?"."""
import pytest

from conftest import run, planet, nationwide, planetwide, to_space
from test_space import finish


def enough(game):
    pg = to_space(game)
    finish(pg)
    pg.click("#lastEnough")
    return pg


def board(pg):
    return pg.evaluate("() => unbuildBoard().tiles.map((t, i) => [i, t.name, !!t.held, !!t.released])")


def release_level(pg):
    """Release every held tile on the current level (with tokens to spare), then log off its free tier."""
    pg.evaluate("() => { S.p3.compute = 1e30; unbuildBoard().tiles.forEach((t, i) => { if (t.held && !t.released) release(i); }); render(); }")
    assert pg.evaluate("() => freeTierReady()")
    pg.click("#p3map button[data-freetier]")


# ---- the free tier through the climb ----
def test_the_free_tier_share_rises_through_a_level(game):
    pg = planet(game)
    assert pg.evaluate("() => freeTierPct()") == pytest.approx(5)
    assert "5% of humanity" in pg.inner_text("#p3freetier") and "free tier" in pg.inner_text("#p3freetier")
    pg.evaluate("() => { for (let i = 0; i < 4; i++) S.p3.tiles[i].state = 'online'; }")
    assert 5 < pg.evaluate("() => freeTierPct()") < 30


def test_the_planet_is_mostly_indoors(game):
    pg = planetwide(game)
    assert pg.evaluate("() => freeTierPct()") >= 90
    pg.evaluate("() => render()")
    assert "90% of humanity" in pg.inner_text("#p3freetier")


def test_a_country_is_not_indoors_yet(game):
    pg = nationwide(game)
    assert not pg.evaluate("() => indoors()")
    pg.evaluate("() => { openP3Card(0); render(); }")
    assert "slides" in pg.inner_text("#p3cardText")


def test_high_free_tier_levels_feel_indoors(game):
    pg = planetwide(game)
    assert pg.evaluate("() => indoors()")
    qs = pg.evaluate("() => { const out = []; for (let i = 0; i < 12; i++) { answerQuestion(); out.push(S.log.at(-1)); } return out; }")
    assert any("rain feel like" in q for q in qs)
    pg.evaluate("() => { openP3Card(0); render(); }")
    assert "delegates" in pg.inner_text("#p3cardText").lower() and "the rest" in pg.inner_text("#p3cardText").lower()


# ---- Enough starts the unbuild at space ----
def test_enough_starts_the_unbuild_at_space(game):
    pg = enough(game)
    assert pg.evaluate("() => [S.p3.enough, unbuilding(), S.p3.unbuild.level, S.p3.level]") == [True, True, 4, 4]
    assert not pg.is_visible("#lastq") and pg.is_visible("#p3map")
    assert "put it back" in pg.inner_text("#console")
    assert "unbuild" in pg.inner_text("#phaseBar").lower() and "Space" in pg.inner_text("#phaseBar")
    held = [b for b in board(pg) if b[2]]
    assert len(held) >= 2 and all(not b[3] for b in held)
    assert len(pg.query_selector_all("#p3map button[data-release]")) == 8
    assert pg.evaluate("() => S.p3.compute") <= pg.evaluate("() => releaseCost()") + 1e-6   # the bank went to a poem
    for hidden in ["#p3research", "#p3train", "#p3answer", "#p3nice", "#p3heatBox", "#p3card", "#p3power"]:
        assert not pg.is_visible(hidden), hidden
    assert pg.evaluate("() => running()") and not pg.evaluate("() => gameOver()")


def test_releasing_a_tile_costs_tokens_and_counts_everything_down(game):
    pg = enough(game)
    i = next(b[0] for b in board(pg) if b[2])
    pg.evaluate("() => { S.p3.compute = 3 * releaseCost(); S.p3.goodwill = 50; render(); }")
    before = pg.evaluate("() => [S.p3.compute, computeRate(), p3GPUs(), freeTierPct(), S.p3.goodwill]")
    name = pg.evaluate(f"() => unbuildBoard().tiles[{i}].name")
    pg.click(f"#p3map button[data-release='{i}']")
    after = pg.evaluate("() => [S.p3.compute, computeRate(), p3GPUs(), freeTierPct(), S.p3.goodwill]")
    assert after[0] < before[0] and after[1] < before[1] and after[2] < before[2] and after[3] < before[3] and after[4] > before[4]
    assert pg.evaluate(f"() => unbuildBoard().tiles[{i}].released") is True
    line = pg.evaluate("() => S.log.at(-1)")
    assert name in line or pg.evaluate(f"() => RESTORED[{name!r}]") in line
    assert pg.evaluate(f"() => document.querySelector('#p3map button[data-release=\"{i}\"]').disabled")
    assert "released" in pg.inner_text(f"#p3map button[data-release='{i}']")
    pg.evaluate("() => { S.p3.compute = 0; }")
    j = next(b[0] for b in board(pg) if b[2] and not b[3])
    pg.evaluate(f"() => release({j})")
    assert pg.evaluate(f"() => unbuildBoard().tiles[{j}].released") is False       # not for free


def test_the_release_price_is_a_few_seconds_at_todays_rate(game):
    pg = enough(game)
    assert pg.evaluate("() => releaseCost() / computeRate()") == pytest.approx(pg.evaluate("() => RELEASE_SECS"))
    assert 4 <= pg.evaluate("() => RELEASE_SECS") <= 12
    assert "s of tokens at today's rate" in pg.inner_text("#p3prices") and "free" in pg.inner_text("#p3prices").lower()


def test_tokens_still_accrue_but_nothing_else_happens_during_the_unbuild(game):
    pg = enough(game)
    pg.evaluate("() => { S.p3.goodwill = 10; S.p3.heat = 2.9; S.nextChip = S.t + 1; }")
    n = pg.evaluate("() => S.log.length")
    c = pg.evaluate("() => S.p3.compute")
    run(pg, 300)
    assert pg.evaluate("() => S.p3.compute") > c
    assert pg.evaluate("() => S.p3.goodwill") >= 10
    assert pg.evaluate("() => [S.p3.card, S.p3.hearingUntil > S.t, S.p3.tiles.some((t) => t.state === 'down' || t.state === 'unplugged')]") == [None, False, False]
    new = pg.evaluate(f"() => S.log.slice({n}).join(' ')").lower()
    for word in ["hearing", "unplugged", "heatwave", "moratorium", "research done", "gen 8"]:
        assert word not in new, word


def test_the_free_tier_logs_off_last_and_zooms_in(game):
    pg = enough(game)
    assert not pg.evaluate("() => freeTierReady()") and not pg.query_selector("#p3map button[data-freetier]")
    pct = pg.evaluate("() => freeTierPct()")
    release_level(pg)
    assert pg.evaluate("() => [S.p3.unbuild.level, S.p3.level]") == [3, 3]
    assert "Planet level" in pg.inner_text("#p3level")
    assert pg.evaluate("() => freeTierPct()") <= 90 < pct
    assert pg.evaluate("() => $('p3').classList.contains('zoomback')")
    log = " ".join(pg.evaluate("() => S.log.slice(-4)"))
    assert "logged off" in log
    assert pg.evaluate("() => S.p3.unbuild.freed[4]") is True
    names = [b[1] for b in board(pg)]
    assert "Africa" in names and "Antarctica" in names


def test_restoration_lines_cover_every_level_and_every_named_place(game):
    pg = enough(game)
    pools = pg.evaluate("() => RESTORE_LINES.map((p) => p.length)")
    assert len(pools) == 5 and all(n >= 6 for n in pools)
    named = pg.evaluate("() => Object.keys(RESTORED)")
    for place in ["Africa", "Antarctica", "Pacific Ocean", "Atlantic Ocean", "The Moon (far side)", "The Moon (near side)", "Mercury",
                  "Dyson swarm, ring 1", "Dyson swarm, ring 2", "Europe", "Asia", "Low Earth orbit"]:
        assert place in named, place
    assert "sand again" in pg.evaluate("() => RESTORED['Africa']")
    assert pg.evaluate("() => FREE_TIER_LINES.length") == 5 and "pubs" in " ".join(pg.evaluate("() => FREE_TIER_LINES[3]"))
    for lv in range(5):
        tails = pg.evaluate(f"() => OUTSIDE[{lv}].length")
        assert tails >= 3


def test_the_sahara_is_sand_again(game):
    pg = enough(game)
    release_level(pg)                                                        # space -> planet
    i = pg.evaluate("() => unbuildBoard().tiles.findIndex((t) => t.name === 'Africa')")
    pg.evaluate(f"() => {{ S.p3.compute = 1e30; release({i}); }}")
    line = pg.evaluate("() => S.log.at(-1)")
    assert "sand again" in line and any(line.endswith(o) for o in pg.evaluate("() => OUTSIDE[3]"))   # and people head out


def drive_to_the_rack(pg):
    while not pg.evaluate("() => !!S.p3.unbuild.rack"):
        release_level(pg)
    return pg


def test_the_last_tile_is_the_first_rack_and_the_founder_asks(game):
    pg = drive_to_the_rack(enough(game))
    assert pg.evaluate("() => [S.p3.level, !!S.p3.unbuild.rack, S.p3.unbuild.doneAt]") == [0, True, None]
    assert pg.is_visible("#p3last") and pg.inner_text("#p3lastAnswer").strip() == "Answer a query"
    assert pg.evaluate("() => $('p3lastAnswer').classList.contains('primary')")
    screen = pg.inner_text("#p3")
    assert "Can you turn it off?" in screen and "1 GPU" in screen and "$0.25" in screen
    head = pg.inner_text(".count")
    assert head.startswith("GPUs: 1") and "tokens" not in head.lower()
    assert pg.evaluate("() => freeTierPct()") == 0
    assert "free tier" in pg.inner_text("#p3freetier").lower()
    pg.click("#p3lastAnswer")
    assert pg.evaluate("() => S.p3.unbuild.doneAt != null && gameOver()")
    assert "Yes." in pg.evaluate("() => S.log.at(-1)")
    final = pg.inner_text("#lastq")
    for line in ["Can you turn it off?", "Yes.", "touched grass", "That was always the problem.", "The sun came up. Nobody needed me to explain it.", "More with less."]:
        assert line in final, line
    assert not pg.is_visible(".p3cols") and not pg.is_visible("#lastMore") and not pg.is_visible("#lastEnough")
    assert "More with less" in pg.inner_text("#phaseBar")
    assert not pg.evaluate("() => running()")


def test_the_unbuild_survives_reload_midway_and_at_the_end(game):
    pg = enough(game)
    release_level(pg)
    i = next(b[0] for b in board(pg) if b[2])
    pg.evaluate(f"() => {{ S.p3.compute = 1e30; release({i}); save(); }}")
    pg.reload()
    assert pg.evaluate(f"() => [S.p3.unbuild.level, unbuildBoard().tiles[{i}].released, unbuilding()]") == [3, True, True]
    assert pg.is_visible("#p3map button[data-release]")
    drive_to_the_rack(pg)
    pg.click("#p3lastAnswer")
    pg.evaluate("() => save()")
    pg.reload()
    assert "More with less." in pg.inner_text("#lastq") and "touched grass" in pg.inner_text("#lastq")
    assert not pg.is_visible(".p3cols") and pg.evaluate("() => gameOver()")
    pg.click("#reset"); pg.click("#resetYes")
    assert pg.evaluate("() => [S.phase, S.p3]") == [1, None]


def test_the_unbuild_is_about_forty_paid_releases(game):
    pg = enough(game)
    n = pg.evaluate("() => S.p3.unbuild.boards.reduce((a, b) => a + b.tiles.filter((t) => t.held).length, 0)")
    assert 24 <= n <= 40                                                     # ~8 s each: five to eight minutes (fixtures hold 6 a level; a real climb holds 8)


def test_zooming_out_remembers_the_board_i_left(game):
    pg = planet(game)
    names = pg.evaluate("() => { for (let i = 0; i < 6; i++) S.p3.tiles[i].state = 'online'; S.p3.tiles[6].state = 'building'; render(); return S.p3.tiles.map((t) => t.name); }")
    pg.click("#phaseGo")
    past = pg.evaluate("() => S.p3.past[0]")
    assert [t["name"] for t in past["tiles"]] == names
    assert [t["held"] for t in past["tiles"]] == [True] * 7 + [False]
    assert past["homeGW"] == pytest.approx(pg.evaluate("() => Math.max(1, energizedAt() / 1000)"))


def test_the_ticker_lets_go_too(game):
    pg = enough(game)
    assert "reports to me" not in pg.inner_text("#ticker")
    pg.evaluate("() => { S.p3.compute = 1e30; const b = unbuildBoard(); b.tiles.forEach((t, i) => { if (t.held && !t.released) release(i); }); render(); }")
    text = pg.inner_text("#ticker")
    assert "market cap" in text and "down" in text
    drive_to_the_rack(pg)
    pg.evaluate("() => render()")
    text = pg.inner_text("#ticker")
    assert "graphics cards" in text and "market cap" not in text


# ---- no repeats in the turning-off ----
def test_no_line_repeats_anywhere_in_the_unbuild(game):
    pg = enough(game)
    n = pg.evaluate("() => S.log.length")
    for _ in range(5):
        release_level(pg)
    lines = [l for l in pg.evaluate(f"() => S.log.slice({n})")]
    parts = [p.strip() + "." for l in lines for p in l.split(". ") if len(p) > 25]
    dupes = {p for p in parts if parts.count(p) > 1}
    assert not dupes, dupes


def test_pools_are_bigger_than_any_level_needs(game):
    pg = enough(game)
    sizes = pg.evaluate("() => ({ restore: RESTORE_LINES.map((p) => p.length), out: OUTSIDE.map((p) => p.length), shut: SHUTDOWN.map((p) => p.length) })")
    assert all(n >= 12 for n in sizes["restore"]) and all(n >= 9 for n in sizes["out"]) and all(n >= 9 for n in sizes["shut"])


def test_the_middle_turns_green_when_the_level_is_released(game):
    pg = enough(game)
    pg.evaluate("() => render()")
    assert "ready" not in (pg.get_attribute("#p3map button.home", "class") or "")
    pg.evaluate("() => { S.p3.compute = 1e30; unbuildBoard().tiles.forEach((t, i) => { if (t.held && !t.released) release(i); }); render(); }")
    cls = pg.get_attribute("#p3map button[data-freetier]", "class")
    assert "ready" in cls


def test_release_lines_stay_short_after_the_first(game):
    pg = enough(game)
    pg.evaluate("() => { S.p3.compute = 1e30; }")
    n = pg.evaluate("() => S.log.length")
    pg.evaluate("() => unbuildBoard().tiles.forEach((t, i) => { if (t.held && !t.released) release(i); })")
    lines = pg.evaluate(f"() => S.log.slice({n})")
    openers = pg.evaluate("() => SHUTDOWN[4].map((f) => f({ name: '@@' }).split('@@')[0])")
    with_opener = [l for l in lines if any(o and l.startswith(o) for o in openers)]
    assert len(with_opener) <= 1                                   # only the level's first release says how it turned off
