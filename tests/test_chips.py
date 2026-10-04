from conftest import MID


def chips(pg, pid):
    return pg.evaluate(f"() => [...document.querySelectorAll(\"button[data-id='{pid}'] .fx\")].map((c) => [c.textContent, c.className])")


def test_every_project_gets_chips_from_its_own_description(game):
    pg = game(MID)
    got = pg.evaluate("() => Object.fromEntries(PROJECTS.map((p) => [p.id, projectChips(p).map((c) => c.text)]))")
    assert "+50 hype" in got["keynote"]
    assert "demand ×2" in got["sales"]
    assert "training +50%" in got["synthdata"]
    assert any("kW/rack" in c for c in got["dlc"])
    assert "−20 hype" in got["benchmarks1"]
    assert not [pid for pid, c in got.items() if not c], "every project should have at least one chip"


def test_chips_show_on_the_buttons_and_hype_costs_look_different(game):
    pg = game({**MID, "gen": 4, "funds": 1e9})
    pg.evaluate("() => render()")
    k = chips(pg, "keynote")
    assert ["+50 hype", "fx hype"] in [[t, c] for t, c in k]
    b = chips(pg, "benchmarks1")
    assert any(t == "−20 hype" and "cost" in c for t, c in b)
