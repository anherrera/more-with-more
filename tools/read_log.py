"""Read More With More's play log out of Firefox's localStorage and summarize a run's pacing.

    uv run --with python-snappy tools/read_log.py            # latest run
    uv run --with python-snappy tools/read_log.py --all      # list runs

Firefox keeps each origin's localStorage in storage/default/<origin>/ls/data.sqlite, values
Snappy-compressed when compression_type == 1. The game writes key "more-with-more-log-v1".
"""
import argparse, glob, json, os, shutil, sqlite3, tempfile
from collections import Counter

import snappy

PROFILE_GLOB = os.path.expanduser("~/Library/Application Support/Firefox/Profiles/*/storage/default")
ORIGINS = ["http+++localhost+8777", "http+++127.0.0.1+8777"]
KEY = "more-with-more-log-v1"


def load_log():
    best = None
    for root in glob.glob(PROFILE_GLOB):
        for origin in ORIGINS:
            db = os.path.join(root, origin, "ls", "data.sqlite")
            if os.path.exists(db) and (best is None or os.path.getmtime(db) > os.path.getmtime(best)):
                best = db
    if not best:
        raise SystemExit("No Firefox storage for localhost:8777 yet - play a bit first.")
    tmp = tempfile.mkdtemp()
    for f in glob.glob(best + "*"):
        shutil.copy(f, os.path.join(tmp, os.path.basename(f)))
    con = sqlite3.connect(os.path.join(tmp, "data.sqlite"))
    row = con.execute("select compression_type, value from data where key=?", (KEY,)).fetchone()
    if not row:
        raise SystemExit("Storage exists but no play log yet (it writes every 20s and when you leave the tab).")
    ctype, val = row
    return json.loads((snappy.decompress(val) if ctype == 1 else val).decode())


def mmss(t):
    t = int(t); return f"{t // 60}:{t % 60:02d}"


def summarize(run):
    ev = run["events"]
    print(f"run {run['runId']}  started {run.get('started')}  game time {mmss(run.get('gameTime', 0))}  "
          f"ended={run.get('ended')}  answer clicks={run.get('answerClicks')}")
    print(f"now: {run.get('now')}")

    print("\n== milestones (with gap since previous)")
    prev = 0
    for m in run.get("milestones", []):
        gap = m["t"] - prev; prev = m["t"]
        flag = "   <-- long wait" if gap > 180 else ""
        print(f"  {mmss(m['t']):>6}  (+{mmss(gap):>5})  {m['what']}{flag}")

    acts = [e for e in ev if e["a"] not in ("snap", "session", "milestone")]
    print("\n== actions")
    for a, n in Counter(e["a"] for e in acts).most_common():
        print(f"  {a:10} {n}")

    print("\n== quiet stretches (no player action for 60s+)")
    last = 0
    for e in sorted(acts, key=lambda e: e["t"]):
        if e["t"] - last >= 60:
            print(f"  {mmss(last)} -> {mmss(e['t'])}  ({mmss(e['t'] - last)})")
        last = e["t"]

    posts = [e for e in ev if e["a"] == "post"]
    if posts:
        print(f"\n== posts: {Counter(p['result'] for p in posts)}  avg gain {sum(p['gain'] for p in posts) / len(posts):.1f}")
    spots = [e for e in ev if e["a"] == "spot"]
    if spots:
        mults = [s["mult"] for s in spots]
        print(f"== spot sales: {len(spots)}  avg multiple {sum(mults) / len(mults):.2f}x  best {max(mults):.2f}x  worst {min(mults):.2f}x")
    spikes = [e for e in ev if e["a"] == "spike"]
    if spikes:
        print(f"== loss spikes: {len(spikes)}  rolled back {sum(1 for e in ev if e['a'] == 'rollback')}  "
              f"diverged {sum(1 for e in ev if e['a'] == 'diverged')}  auto {sum(1 for s in spikes if s.get('auto'))}")
    swaps = [e for e in ev if e["a"] == "swap"]
    auto = max((e.get("autoSwaps", 0) for e in ev if e["a"] == "snap"), default=0)
    if swaps or auto:
        print(f"== GPU swaps: {len(swaps)} by hand ({sum(s['n'] for s in swaps)} GPUs), {auto} GPUs by Remote hands")

    snaps = [e for e in ev if e["a"] == "snap"]
    if snaps:
        paused = sum(1 for s in snaps if s["split"] == 0 and s["gen"] >= 0)
        print(f"\n== snapshots: {len(snaps)} (every ~30s); training paused in {paused} of them")
        print("  time    gen tier   gpus        funds  hype  split  debt")
        for s in snaps[:: max(1, len(snaps) // 20)]:
            print(f"  {mmss(s['t']):>6}  {s['gen']:>3} {s['tier']:>4} {s['gpus']:>6} {s['funds']:>12,} {s['hype']:>5} {s['split']:>5}% {s['debt']:>10,}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--all", action="store_true"); args = ap.parse_args()
    log = load_log()
    runs = sorted(log.values(), key=lambda r: r.get("updated", ""))
    if args.all:
        for r in runs: print(r["runId"], r.get("started"), mmss(r.get("gameTime", 0)), len(r["events"]), "events")
    else:
        summarize(runs[-1])
