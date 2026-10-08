"""What the model inherits: every phase 2 proposal you approved is a power it starts phase 3 with;
every one you refused (and never approved) is something the humans kept."""
import pytest

from conftest import ended_campus, run
from test_model import campus


def handoff(game, took=(), kept=()):
    pg = ended_campus(game)
    pg.evaluate("""([took, kept]) => { const m = modelOf();
      for (const id of took) m.done[id] = true; for (const id of kept) m.rejected[id] = 1; }""", [list(took), list(kept)])
    pg.click("#phaseGo")
    pg.evaluate("() => { S.rival.next = 1e9; }")
    return pg


def test_first_no_lowers_town_opposition_once(game):
    pg = campus(game)
    pg.click("#requestQueue")
    run(pg, 1)
    v = pg.evaluate("() => townOf().v")
    pg.click("#propNo")
    assert pg.evaluate("() => townOf().v") == pytest.approx(v - 5)
    assert "said no" in pg.evaluate("() => S.log.join(' ')")
    pg.evaluate("() => { const m = modelOf(); m.next.lobbyist = 0; m.current = 'lobbyist'; rejectProposal(); }")
    assert pg.evaluate("() => townOf().v") == pytest.approx(v - 5)


def test_handoff_lists_what_it_took_and_what_you_kept(game):
    pg = handoff(game, took=["lobbyist", "utility"], kept=["eminent"])
    assert pg.evaluate("() => S.p3.inherit") == {"took": ["lobbyist", "utility"], "kept": ["eminent"]}
    log = pg.evaluate("() => S.log.join(' ')")
    assert "You gave me the lobbyist and the utility." in log
    assert "You kept the neighbors' land." in log


def test_approved_and_later_refused_counts_as_taken(game):
    pg = handoff(game, took=["pricing"], kept=["pricing"])
    assert pg.evaluate("() => S.p3.inherit") == {"took": ["pricing"], "kept": []}


def test_never_said_no(game):
    pg = handoff(game, took=["pricing"])
    assert "You never said no." in pg.evaluate("() => S.log.join(' ')")


def test_took_lobbyist_starts_with_lobby_tech(game):
    assert handoff(game, took=["lobbyist"]).evaluate("() => hasTech('lobby')") is True


def test_took_pricing_starts_with_more_tokens(game):
    pg = handoff(game, took=["pricing"])
    assert pg.evaluate("() => S.p3.compute / price(90, 'now')") == pytest.approx(1.5, rel=0.01)


def test_took_parallax_thinks_faster(game):
    assert handoff(game, took=["parallax"]).evaluate("() => S.p3.techMult") == pytest.approx(1.1)


def test_took_rezone_county_claims_cheaper(game):
    pg = handoff(game, took=["rezone"])
    assert pg.evaluate("() => claimCost(0) / tileWorth(0)") == pytest.approx(0.75)


def test_took_eminent_neighbors_remember(game):
    pg = handoff(game, took=["eminent"])
    assert pg.evaluate("() => S.p3.goodwill") == 50
    assert pg.evaluate("() => S.p3.tiles.every((t) => t.opp === Math.min(100, traitOf(t).opp + 15))")


def test_each_no_is_goodwill(game):
    assert handoff(game, kept=["pricing", "rezone"]).evaluate("() => S.p3.goodwill") == 68


def test_keeping_the_neighbors_land_is_worth_more(game):
    assert handoff(game, kept=["eminent"]).evaluate("() => S.p3.goodwill") == 70


def test_took_utility_nobody_unplugs_the_county(game):
    pg = handoff(game, took=["utility"])
    pg.evaluate("() => { S.p3.tiles[0].state = 'online'; S.p3.goodwill = 5; }")
    run(pg, 120)
    assert pg.evaluate("() => S.p3.unplugN") == 0


def test_kept_utility_cuts_power_sooner(game):
    pg = handoff(game, kept=["utility"])
    pg.evaluate("() => { S.p3.tiles[0].state = 'online'; S.p3.goodwill = 22; S.p3.answers = 0; }")
    pg.evaluate("() => { for (let i = 0; i < 95; i++) { S.p3.goodwill = 22; step(1); } }")
    assert pg.evaluate("() => S.p3.unplugN") == 1


def test_kept_lobbyist_regulator_reviews_first_claim(game):
    pg = handoff(game, kept=["lobbyist"])
    reviewed = pg.evaluate("() => tileBuildSecs(0)")
    plain = pg.evaluate("() => { const k = S.p3.inherit.kept; S.p3.inherit.kept = []; const p = [tileBuildSecs(0), tileBuildSecs(1)]; S.p3.inherit.kept = k; return p; }")
    assert reviewed == pytest.approx(plain[0] * 2)
    pg.evaluate("() => { S.p3.compute = 1e9; claim(0); }")
    assert pg.evaluate("() => tileBuildSecs(1)") == pytest.approx(plain[1])


def _ending(game, inherit):
    from test_unbuild import drive_to_the_rack, enough
    pg = enough(game)
    pg.evaluate("(inh) => { S.p3.inherit = inh; }", inherit)
    drive_to_the_rack(pg)
    pg.click("#p3lastAnswer")
    return pg.inner_text("#lastq")


def test_the_ending_remembers_who_kept_the_switch(game):
    assert "You kept the utility. You could have turned me off any time." in _ending(game, {"took": [], "kept": ["utility"]})


def test_the_ending_remembers_who_sold_the_switch(game):
    final = _ending(game, {"took": ["utility"], "kept": []})
    assert "You sold me the utility. There was no switch left. I used mine." in final
    assert "You kept the utility" not in final
