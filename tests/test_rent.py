"""Market rent keeps its multiplier, and the landlord gets richer out loud as it climbs."""
from conftest import MID


def rent_line(pg, leases):
    pg.evaluate("(l) => { S.leases = l; render(); }", leases)
    return pg.inner_text("#rentLine")


def test_rent_starts_plain(game):
    line = rent_line(game(MID), {"rack": 0})
    assert line.startswith("Market rent: 1.0x.") and "rises with every rack you lease" in line


def test_the_landlord_escalates(game):
    pg = game(MID)
    seen = [rent_line(pg, {"rack": r}) for r in [2, 12, 40, 150, 274, 600]]
    assert "noticed you" in seen[0]
    assert "a boat" in seen[1]
    assert "second boat" in seen[2]
    assert "REIT" in seen[4] and seen[4].startswith("Market rent: 45x")
    assert "bought the town" in seen[5]
    assert len(set(s.split(". ", 1)[-1] for s in seen)) == 6
