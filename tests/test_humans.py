"""The humans are one system in both phases: rotating decks, cards that wait and expire, opposition with moratoriums."""
import pytest

from conftest import run
from test_phasebar import campus
from test_planet import planet


def test_one_deck_helper_fills_filters_and_keeps_the_used_card_out(game):
    pg = game()
    out = pg.evaluate("""() => { const pool = [1, 2, 3, 4, 5, 6].map((n) => ({ id: 'c' + n, odd: n % 2 === 1 }));
      const a = refillDeck(['c9', 'c2'], pool, () => true, 3, 'c4');           // c9 is gone from the pool, c2 stays first
      const b = refillDeck([], pool, (c) => c.odd, 3, null);
      const c = refillDeck(['c1', 'c3', 'c5'], pool, (c) => c.odd, 3, null);
      return [a, b, c]; }""")
    assert out[0][0] == "c2" and len(out[0]) == 3 and "c9" not in out[0] and "c4" not in out[0]
    assert sorted(out[1]) == ["c1", "c3", "c5"]
    assert out[2] == ["c1", "c3", "c5"]
    assert pg.evaluate("() => typeof refillDeck === 'function' && String(offeredPerks).includes('refillDeck') && String(offeredNice).includes('refillDeck')")


def test_both_phases_cards_share_one_shape_and_one_expiry(game):
    pg = campus(game)
    assert pg.evaluate("() => ['tender', 'townhall'].every((k) => ['title', 'text', 'choices', 'expire'].every((f) => k in CARDS && f in CARDS[k]))")
    pg.evaluate("() => { openCard('townhall'); }")
    assert pg.evaluate("() => expireCard(S.p2) === null && !!S.p2.card")
    pg.evaluate("() => { S.p2.card.until = S.t; }")
    assert pg.evaluate("() => { const c = expireCard(S.p2); return c && c.kind === 'townhall' && S.p2.card === null; }")


def test_a_hearing_is_a_card_in_the_same_shape(game):
    pg3 = planet(game)
    pg3.evaluate("() => { openP3Card(0); }")
    kind = pg3.evaluate("() => { const k = cardKindOf(S.p3.card); return [typeof k.title(), typeof k.text(), k.choices.length, typeof k.expire]; }")
    assert kind == ["string", "string", 3, "function"]
    opp = pg3.evaluate("() => S.p3.tiles[0].opp")
    pg3.evaluate("() => { S.p3.card.until = S.t; }")
    run(pg3, 1)
    assert pg3.evaluate("() => S.p3.card") is None and pg3.evaluate("() => S.p3.tiles[0].opp") == pytest.approx(opp + 10, abs=0.1)
    assert "empty chair" in pg3.evaluate("() => S.log.at(-1)")


def test_one_moratorium_model_in_both_phases(game):
    pg = campus(game)
    assert pg.evaluate("() => MORATORIUM_AT === 90 && MORATORIUM_REST === 70 && typeof P3_MORATORIUM_AT === 'undefined'")
    pg.evaluate("() => { townOf().v = 95; }")
    run(pg, 1)
    assert pg.evaluate("() => underMoratorium(townOf()) && moratoriumOn()")
    pg.evaluate("() => { townOf().moratorium = S.t; }")
    run(pg, 1)
    assert pg.evaluate("() => [townOf().moratorium, townOf().v]") == [None, 70]


def test_a_tile_moratorium_passes_and_lifts_the_same_way(game):
    pg3 = planet(game)
    pg3.evaluate("() => { S.p3.tiles[2].opp = 95; }")
    run(pg3, 1)
    assert pg3.evaluate("() => underMoratorium(S.p3.tiles[2])")
    pg3.evaluate("() => { S.p3.tiles[2].moratorium = S.t; }")
    run(pg3, 1)
    assert pg3.evaluate("() => [S.p3.tiles[2].moratorium, S.p3.tiles[2].opp]") == [None, 70]
    assert "flowers" in pg3.evaluate("() => S.log.at(-1)")
