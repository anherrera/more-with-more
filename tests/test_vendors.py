import pytest

from conftest import MID, READY


def campus(game, **extra):
    pg = game({**READY, "debt": 0, **extra})
    pg.click("button[data-id='ground']")
    pg.click("button[data-county='strong']")
    pg.evaluate("() => { S.rival.next = 1e9; S.nextChip = 1e9; render(); }")
    return pg


def test_vendor_row_only_in_phase2(game):
    pg = game(MID)
    assert not pg.is_visible("#vendors")


def test_three_made_up_vendors_one_picked(game):
    pg = campus(game)
    assert pg.is_visible("#vendors")
    btns = pg.query_selector_all("#vendors button")
    assert len(btns) == 3
    assert pg.evaluate("() => vendorOf().id") == "monolith"
    assert "on" in pg.get_attribute("#vendors button[data-vendor='monolith']", "class")


def test_switching_vendor_changes_price_and_risk(game):
    pg = campus(game)
    price, gap, lgap = pg.evaluate("() => [gpuPrice(), fireGap(0.5), leakGap(0.5)]")
    pg.click("#vendors button[data-vendor='gridiron']")
    assert pg.evaluate("() => S.p2.vendor") == "gridiron"
    assert pg.evaluate("() => gpuPrice()") < price
    assert pg.evaluate("() => fireGap(0.5)") < gap
    assert "Gridiron" in pg.inner_text("#console")
    pg.click("#vendors button[data-vendor='nimbus']")
    assert pg.evaluate("() => gpuPrice()") > price
    assert pg.evaluate("() => fireGap(0.5)") > gap and pg.evaluate("() => leakGap(0.5)") > lgap


def test_phase1_prices_ignore_vendors(game):
    pg = game(MID)
    assert pg.evaluate("() => vendorOf().price") == 1
