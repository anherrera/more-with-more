"""Phase 3's currency is tokens: the model generates tokens per second from its gigawatts, and everything it buys is
priced in seconds of tokens. One unit of internal compute (1 GW for one second at efficiency 1) is a billion tokens."""
import pytest

from conftest import run, planet, nationwide, to_space

OLD_UNITS = ["EF", "ZF", "FLOP", "exaFLOPS", "compute"]


def test_a_gigawatt_makes_a_billion_tokens_a_second(game):
    pg = planet(game)
    assert pg.evaluate("() => TOKENS_PER_UNIT") == 1e9
    assert pg.evaluate("() => tokText(1)") == "1B tokens"
    assert pg.evaluate("() => tokText(4200)") == "4.2T tokens"
    assert pg.evaluate("() => tokText(380)") == "380B tokens"
    assert pg.evaluate("() => tokText(2.5e9)") == "2.5Qi tokens"          # no unit switch in space: the scale just keeps going
    assert pg.evaluate("() => tokText(0)") == "0 tokens"


def test_the_headline_counts_tokens_and_gpus(game):
    pg = planet(game)
    pg.evaluate("() => { S.p3.compute = 4200; render(); }")
    head = pg.inner_text(".count")
    assert head.startswith("Tokens: 4.2T") and "GPUs" in head
    assert "tokens/s" in pg.inner_text("#p3rate")
    assert pg.inner_text("#p3me").startswith("Me\nTokens:")


@pytest.mark.parametrize("where", [planet, nationwide, to_space])
def test_no_old_units_anywhere_on_the_phase_3_screen(game, where):
    pg = where(game)
    pg.evaluate("() => { S.p3.compute = 1e6; S.p3.goodwill = 20; S.p3.tiles[0].state = 'unplugged'; for (let i = 0; i < 3; i++) openP3Card(0); render(); }")
    text = pg.inner_text("#p3") + pg.inner_text(".count") + pg.inner_text("#phaseBar")
    for u in OLD_UNITS:
        assert u not in text, u
    assert "tokens" in text
    labels = pg.evaluate("() => P3_HEARINGS.flatMap((h) => h.choices.map((c) => c.label)).filter((l) => /\\d+ s/.test(l))")
    assert len(labels) == 4 and all("tokens" in l for l in labels)
    assert all("EF" not in t["desc"] and "tokens/s" in t["desc"] for t in pg.evaluate("() => TECH.filter((t) => t.mult)"))


def test_labels_say_which_rate_a_price_uses(game):
    pg = nationwide(game)
    pg.evaluate("() => render()")
    assert "s of tokens at today's rate" in pg.inner_text("#p3trainBtn")
    assert "s of tokens at today's rate" in pg.inner_text("#p3nice")
    assert "starting rate" in pg.evaluate("() => priceLabel(15)")
    assert pg.evaluate("() => priceLabel(15, 'now')") == "15 s of tokens at today's rate"


def test_the_first_tokens_line_and_the_caching_joke(game):
    pg = planet(game)
    assert "I count in tokens now" in pg.inner_text("#console")
    assert "twice" in pg.evaluate("() => techOf('caching').desc")
