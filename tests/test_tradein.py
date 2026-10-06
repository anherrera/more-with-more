import pytest

from conftest import MID
from test_fleet import campus


def test_last_gen_trades_for_more_than_older_gens(game):
    pg = game(MID)
    pg.evaluate("() => { S.chipIdx = 6; }")
    rates = pg.evaluate("() => [5, 4, 3, 1].map((c) => tradeRate(c))")
    assert rates == pytest.approx([0.6, 0.4, 0.25, 0.25])
    pg.evaluate("() => { S.done.refurb = true; }")
    assert pg.evaluate("() => [5, 4, 3].map((c) => tradeRate(c))") == pytest.approx([0.75, 0.55, 0.4])


def test_phase1_preview_counts_cash_not_just_credits(game):
    pg = game({**MID, "funds": 1e9, "credits": 0})
    pg.evaluate("() => { S.chipIdx = 5; S.fleet = {4: 3000}; S.gpus = 3000; render(); }")
    note = pg.inner_text("#tradeNote")
    assert "cash" in note and "Worth it" in note


def test_phase2_rows_say_what_a_swap_earns_and_when_it_pays_back(game):
    pg = campus(game)
    pg.evaluate("() => { S.funds = 1e10; S.chipIdx = 6; S.fleet = {3: 2000, 6: 100}; S.gpus = 2100; render(); }")
    row = pg.inner_text("#fleetRows")
    assert "/s now" in row and "newest would earn" in row and "pays back" in row


def test_gpus_out_on_a_spot_lease_cant_be_traded_in(game):
    pg = campus(game)
    pg.evaluate("() => { S.funds = 1e10; S.chipIdx = 6; S.fleet = {3: 2000, 6: 100}; S.gpus = 2100; S.block = {n: 2090, until: S.t + 12}; render(); }")
    assert pg.evaluate("() => tradeCount(3)") <= 10
    b = pg.query_selector("button[data-tradegen='3']")
    assert b.is_disabled() and "spot" in b.inner_text().lower()
    pg.evaluate("() => { S.block = null; render(); }")
    assert pg.evaluate("() => tradeCount(3)") == 2000
    assert pg.query_selector("button[data-tradegen='3']").is_enabled()
