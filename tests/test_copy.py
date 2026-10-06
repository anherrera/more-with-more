"""Copy that has to match the code, and jokes that must only be told once."""
import pathlib, re

import pytest

from conftest import MID, READY

ROOT = pathlib.Path(__file__).resolve().parents[1]
LINE_409A = re.compile(r"priced at \$([0-9.]+) a share\. The (.+?) paid \$([0-9.]+)\.")


@pytest.mark.parametrize("fraction,amount,name", [(0.10, 300, "Pre-seed"), (0.15, 3000, "Seed"), (0.20, 40000, "Series A"), (0.10, 100e6, "Series D")])
def test_409a_line_shows_real_per_share_prices(game, fraction, amount, name):
    pg = game()
    line = pg.evaluate(f"() => {{ dilute({fraction}, {amount}, {name!r}); return S.log.at(-1); }}")
    m = LINE_409A.search(line)
    assert m, line
    option, paid = float(m.group(1)), float(m.group(3))
    assert paid > 0 and option > 0, line                        # never "$0 a share"
    assert option == pytest.approx(0.1 * paid, rel=0.15), line   # the options are a tenth of what the round paid


def test_training_panel_states_the_real_compute_ratio(game):
    pg = game(MID)
    ratio = pg.evaluate("() => needFor(3) / needFor(2)")
    assert f"{ratio:g}×" in pg.inner_text("#trainingBox")


def test_phase1_bar_names_what_break_ground_still_needs(game):
    pg = game(MID)                                               # Gen 6, ~14 MW of GPUs: not ready
    text = pg.inner_text("#phaseBar")
    assert "Gen 7" in text and "100 MW" in text and "Buy" not in text
    pg.evaluate("() => { S.gen = 7; render(); }")
    text = pg.inner_text("#phaseBar")
    assert "Gen 7" not in text and "100 MW" in text and "Buy" not in text


def test_phase1_bar_offers_break_ground_only_once_it_is_buyable(game):
    pg = game(READY)                                             # Gen 7, ~110 MW: ready
    text = pg.inner_text("#phaseBar")
    assert "Break ground" in text and "Gen 7" not in text and "100 MW" not in text


# ---- no joke is told in both phase 2 and phase 3 ----
PHASE2_FILES = ["people.js", "campus.js", "model.js", "market.js", "main.js", "fires.js", "projects.js"]
PHASE3_FILES = ["planet.js"]


def js_strings(src):
    """Every string and template literal in a JS source, with ${...} expressions replaced by X. Skips comments."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if src.startswith("//", i):
            i = src.find("\n", i); i = n if i < 0 else i
        elif src.startswith("/*", i):
            i = src.find("*/", i) + 2
        elif c in "\"'`":
            q, buf, depth = c, [], 0
            i += 1
            while i < n:
                d = src[i]
                if depth:
                    if d == "}": depth -= 1
                    elif d == "{": depth += 1
                    i += 1; continue
                if d == "\\": buf.append(src[i + 1]); i += 2; continue
                if d == q: break
                if q == "`" and src.startswith("${", i): buf.append("X"); depth = 1; i += 2; continue
                buf.append(d); i += 1
            out.append("".join(buf)); i += 1
        else:
            i += 1
    return out


def sentences(files):
    seen = {}
    for f in files:
        for s in js_strings((ROOT / f).read_text()):
            for part in re.split(r"(?<=[.!?])[”\"']?\s+", s):
                words = re.sub(r"[^a-z0-9 ]", "", part.lower().replace("’", "'")).split()
                if len(words) >= 4: seen.setdefault(" ".join(words), f"{f}: {part.strip()}")
    return seen


# Shared on purpose: the game's refrain, and the two phase 2 county names that phase 3's county tiles reuse as traits.
ON_PURPOSE = {"i could do more with more", "cheap land weak grid", "strong grid drought county"}


def test_no_line_is_shared_between_phase_2_and_phase_3():
    p2, p3 = sentences(PHASE2_FILES), sentences(PHASE3_FILES)
    shared = sorted((set(p2) & set(p3)) - ON_PURPOSE)
    assert not shared, "\n".join(f"{p2[s]}  <->  {p3[s]}" for s in shared)
