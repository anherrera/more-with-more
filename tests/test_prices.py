"""Phase 3 prices are seconds of compute, on one of two explicit bases: the compute I had when the level began
("level": claims, research, power, hearings) or the compute I make now ("now": kindness, training)."""
import pytest

from conftest import run, planet, nationwide


def test_one_helper_prices_everything_and_names_its_base(game):
    pg = nationwide(game)
    pg.evaluate("() => { S.p3.techMult = 4; }")                      # research made me 4x faster than the level baseline
    level, now = pg.evaluate("() => [price(1, 'level'), price(1, 'now')]")
    assert level == pytest.approx(pg.evaluate("() => S.p3.homeGW"))
    assert now == pytest.approx(pg.evaluate("() => computeRate()")) and now == pytest.approx(4 * level)
    r = pg.evaluate("""() => ({ tech: techCost(TECH[0]) / (0.5 * TECH[0].secs), pump: pumpCost() / 20,
      power: powerOptions(0).find((o) => o.id === 'utility').cost / (0.5 * tileWorth(0) / price(1, 'level')), claim: claimCost(0),
      nice: niceCost(niceOf(offeredNice()[0])) / niceOf(offeredNice()[0]).secs, train: trainCost() / trainStep() })""")
    assert r["tech"] == pytest.approx(level) and r["pump"] == pytest.approx(level) and r["power"] == pytest.approx(level)
    assert 25 * level <= r["claim"] <= 60 * level
    assert r["nice"] == pytest.approx(now) and r["train"] == pytest.approx(now)


def test_hearing_choices_say_which_compute_they_cost(game):
    pg = planet(game)
    labels = pg.evaluate("() => P3_HEARINGS.flatMap((h) => h.choices.map((c) => c.label)).filter((l) => /\\d+ s/.test(l))")
    assert len(labels) == 4
    assert all("FLOPs" not in l and "starting compute" in l for l in labels)


def test_buttons_and_the_me_panel_name_the_pricing_base(game):
    pg = nationwide(game)
    pg.evaluate("() => render()")
    assert "compute now" in pg.inner_text("#p3trainBtn")
    assert "compute now" in pg.inner_text("#p3nice")
    prices = pg.inner_text("#p3prices")
    assert "started this level with" in prices and "now" in prices and prices.startswith("Prices")


def test_phase3_opens_with_ninety_seconds_of_thinking(game):
    pg = planet(game)
    assert pg.evaluate("() => S.p3.compute") == pytest.approx(90 * pg.evaluate("() => computeRate()"))
    assert "ninety seconds" in pg.inner_text("#console")
