"""Phase 1 pacing sim v2: mirrors index.html's current rules (stackable leases, 6 cooling levels,
chip treadmill + trade-ins, bubble, debt facility, Parallax credits) with a greedy player.

    python3 tools/sim2.py            # current constants vs the proposed tuning
"""
import math, random

BASE = dict(
    d0=5, q=4, gen_need0=100, trainx=8, split=0.85, clicks=3,
    pmax=500, lease_growth=1.25, chip_first=300, chip_every=240, chip_perf=2.0, chip_kw=1.4, chip_price=1.6,
    rel_a=30, rel_b=10, crash_mult=1.0, deal_every=90, deal_grow=0.15, deal0=800,
    ground=60e6, post_every=40, series_d=100e6,
)
TYPES = [("rack", 1, 30, 60), ("cage", 6, 200, 1500), ("row", 24, 1500, 30000), ("hall", 240, 20000, 350000), ("building", 1500, 200000, 12e6)]
COOL = [10, 15, 25, 60, 120, 200]
C_SERIES_D = 100e6
ROUNDS = [(1, 300), (2, 3000), (3, 40000), (4, 500000), (5, 8e6), (6, C_SERIES_D)]
# (gen gate or special, cost, effect)
PROJ = [("hac", lambda S: S["gpus"] >= 5, 120, ("cool", 1)), ("dyn", lambda S: S["gen"] >= 1, 250, None),
        ("modelcard", lambda S: S["gen"] >= 1, 50, ("hype", 15)), ("rdhx", lambda S: S["gen"] >= 1, 400, ("cool", 2)),
        ("evals", lambda S: S["gen"] >= 3, 2000, ("hype", 35)), ("sales", lambda S: S["gen"] >= 3, 20000, ("dm", 2)),
        ("dlc", lambda S: S["gen"] >= 4, 150000, ("cool", 3)), ("keynote", lambda S: S["gen"] >= 4, 200000, ("hype", 50)),
        ("water", lambda S: S["top"] >= 3, 0, ("hype", 25)), ("imm", lambda S: S["gen"] >= 5, 5e6, ("cool", 4)),
        ("synth", lambda S: S["gen"] >= 5, 2e6, ("tm", 1.5)), ("distill", lambda S: S["gen"] >= 5, 4e6, ("dm", 2)),
        ("poach", lambda S: S["gen"] >= 5, 6e6, ("tm", 1.5)), ("sov", lambda S: S["gen"] >= 5, 3e6, ("dm", 3)), ("substation", lambda S: S["gen"] >= 5 and S["top"] >= 3, 15e6, ("boost", 2)),
        ("twophase", lambda S: S["gen"] >= 6, 40e6, ("cool", 5))]


def run(C, seed=1, verbose=False, limit=3600):
    rnd = random.Random(seed)
    S = dict(t=0.0, funds=0.0, credits=0.0, gpus=0, fleet={}, chip=0, next_chip=C["chip_first"], gen=0, prog=0.0,
             hype=20.0, lc={(0, 0): 1}, rnd=0, dm=1.0, tm=1.0, rentals=0, rent_until=0, cool=0, boost=1, leases={"rack": 1}, deals=0, next_deal=0, debt=0.0,
             next_draw=0, next_post=0, fatigue=0.0, done=set(), top=0, crashes=0)
    ev, seen = [], set()
    def log(k, m):
        if k not in seen: seen.add(k); ev.append((S["t"], m))
    chip = lambda c: (C["chip_perf"] ** c, C["chip_kw"] ** c, C["chip_price"] ** c)
    need = lambda g: C["gen_need0"] * C["trainx"] ** (g - 1)
    owned = lambda i: S["leases"].get(TYPES[i][0], 0)
    unit_kw = lambda i, lv=None: min(TYPES[i][1] * COOL[S["cool"] if lv is None else lv], TYPES[i][2] * S["boost"])
    def cap_kw():
        if not C.get("per_lease"): return sum(owned(i) * unit_kw(i) for i in range(len(TYPES)))
        return sum(n * unit_kw(i, lv) for (i, lv), n in S["lc"].items())
    used_kw = lambda: sum(n * chip(c)[1] for c, n in S["fleet"].items())
    perf = lambda: sum(n * chip(c)[0] for c, n in S["fleet"].items())
    base_price = lambda n: min(C["pmax"], 5 * (1 + n / 100))
    racks_leased = lambda: sum(owned(i) * TYPES[i][1] for i in range(len(TYPES)))
    def lease_cost(i):
        if C.get("rent"):   # market rent: per-slot discount by size, index rises with total racks leased
            slot, k, e = C["rent"]
            return TYPES[i][1] * slot[i] * (1 + racks_leased() / k) ** e
        return types[i][3] * C["lease_growth"] ** max(0, owned(i) - (1 if i == 0 else 0))
    visible = lambda i: i == 0 or owned(i) > 0 or owned(i - 1) > 0
    hmult = lambda: 0.5 + S["hype"] / 40
    def demand(p): return C["d0"] * C["q"] ** S["gen"] * hmult() * S["dm"] * (0.25 / p) ** 1.3
    types = [(n, r, kw, c) for (n, r, kw, _), c in zip(TYPES, C["costs"])] if C.get("costs") else TYPES
    dt = 1.0
    while S["t"] < limit:
        S["t"] += dt; t = S["t"]
        # chips
        if t >= S["next_chip"]:
            S["chip"] += 1; S["next_chip"] = t + C["chip_every"]; log(f"chip{S['chip']}", f"chip P{S['chip'] + 1}")
        # economy: optimal price, serve, train
        cap = perf() * (1 - C["split"]) if S["gpus"] >= 3 else perf()
        p = max(0.0001, 0.25 * (demand(0.25) / cap) ** (1 / 1.3)) if cap > 0 else 0.25
        clicks = C["clicks"] if S["gpus"] < 10 else 0
        served = min(demand(p), cap + clicks); rev = served * p
        S["funds"] += rev * dt - S["debt"] * 0.0002 * dt
        if S["gpus"] >= 3:
            S["prog"] += perf() * C["split"] * S["tm"] * (2 if t < S["rent_until"] else 1) * dt
        if S["prog"] >= need(S["gen"] + 1):
            S["prog"] = 0; S["gen"] += 1; S["hype"] += C["rel_a"] + C["rel_b"] * S["gen"]; log(f"g{S['gen']}", f"Gen {S['gen']}")
        # hype: decay, posts, bubble
        S["hype"] = max(5, S["hype"] - S["hype"] * 0.002 * (0.75 if "modelcard" in S["done"] else 1) * dt); S["fatigue"] = max(0, S["fatigue"] - dt / (30 if "keynote" in S["done"] else 60))
        if S["gen"] >= 1 and t >= S["next_post"]:
            kn = "keynote" in S["done"]; r = rnd.random(); m = 3 if r < (.3 if kn else .15) else 0.3 if r < (.45 if kn else .35) else 1
            S["hype"] += max(1, round((5 + S["gen"]) * (1.5 if "evals" in S["done"] else 1) / (1 + 0.5 * S["fatigue"]) * m)); S["fatigue"] += 1; S["next_post"] = t + C["post_every"]
        froth = max(0, S["hype"] - 100)
        if froth > 0 and rnd.random() < dt * froth / 100 / 60 * C["crash_mult"]:
            if C.get("lev_min"):   # leverage: debt measured in minutes of revenue
                lev = S["debt"] / (rev * 60 * C["lev_min"] + S["debt"] + 1e-9); sev = 0.3 + 0.5 * lev
            else:
                f = rev / (rev + S["debt"] * 0.0002 + 1e-9); sev = 0.8 - 0.5 * f
            S["hype"] -= froth * sev; S["crashes"] += 1
            if S["debt"] > 0 and sev > C.get("mc_sev", 0.6):
                S["next_draw"] = max(S["next_draw"], t + 120)
                mc = C.get("margin_call", 0)          # lenders take a share of the collateral
                for c in list(S["fleet"]):
                    k = int(S["fleet"][c] * mc); S["fleet"][c] -= k; S["gpus"] -= k
        # money in
        if S["rnd"] < len(ROUNDS) and S["gen"] >= ROUNDS[S["rnd"]][0] and S["hype"] >= 40:
            S["funds"] += C["series_d"] if S["rnd"] == 5 else ROUNDS[S["rnd"]][1]; log(f"r{S['rnd']}", f"round {S['rnd']}"); S["rnd"] += 1; S["hype"] = max(10, S["hype"] - 20)
        if S["gen"] >= 1 and t >= S["next_deal"]:
            S["credits"] += C["deal0"] * 5 ** S["gen"] * (1 + S["deals"] * C["deal_grow"]); S["deals"] += 1; S["next_deal"] = t + C["deal_every"]
        if C.get("draws", True) and S["top"] >= 3 and S["hype"] >= 60 and t >= S["next_draw"]:
            amt = S["hype"] / 100 * 3 * 5 ** S["gen"] * 1000; S["funds"] += amt; S["debt"] += amt; S["next_draw"] = t + 60; S["hype"] -= 10
        if C.get("rent_rival") and S["gen"] >= 6 and t >= S["rent_until"]:
            rc = 640 * 5 ** S["gen"] * 1.3 ** S["rentals"]
            if S["funds"] - rc >= (C["ground"] if S["gen"] >= 6 else 0):
                S["funds"] -= rc; S["rentals"] += 1; S["rent_until"] = t + 60
        saving = C.get("save") and S["gen"] >= C.get("end_gen", 6) and used_kw() >= C.get("ground_kw", 100000)       # stop spending once breaking ground is unlocked
        # projects
        for pid, when, cost, eff in ([] if saving else PROJ):
            if pid in S["done"] or not when(S) or S["funds"] < cost: continue
            if eff and eff[0] == "cool" and S["cool"] >= eff[1]: S["done"].add(pid); continue
            S["funds"] -= cost; S["done"].add(pid)
            if eff:
                k, v = eff
                if k == "cool": S["cool"] = max(S["cool"], v)
                elif k == "hype": S["hype"] += v
                elif k == "dm": S["dm"] *= v
                elif k == "tm": S["tm"] *= v
                elif k == "boost": S["boost"] = v
        # trade in the oldest chip when a newer one exists and we're out of room
        pp, pk, pr = chip(S["chip"])
        room = int((cap_kw() - used_kw()) / pk)
        old = sorted(c for c in S["fleet"] if c < S["chip"])
        if room < 1 and old and (n0 := S["fleet"][old[0]]) * chip(old[0])[1] / pk * pp >= n0 * chip(old[0])[0] and min(n0 * base_price(S["gpus"]) * chip(old[0])[2] * 0.25 / (base_price(S["gpus"]) * pr), n0 * chip(old[0])[1] / pk) * pp > n0 * chip(old[0])[0]:
            c = old[0]; n = S["fleet"].pop(c); S["gpus"] -= n; S["credits"] += n * base_price(S["gpus"]) * chip(c)[2] * 0.25
        # lease: when nearly full, take the cheapest $/kW visible option we can afford (keep 30% of cash for GPUs)
        for _ in range(0 if saving else 20):
            room = int((cap_kw() - used_kw()) / pk)
            if room > 0.1 * cap_kw() / pk: break
            opts = [(lease_cost(i) / unit_kw(i), i) for i in range(len(TYPES)) if visible(i) and lease_cost(i) <= S["funds"] * 0.7]
            if not opts: break
            best, i = min(opts)
            # retrofit instead, when it's cheaper per kW than new space
            if C.get("per_lease"):
                gain = sum(n * (unit_kw(j) - unit_kw(j, lv)) for (j, lv), n in S["lc"].items() if lv < S["cool"])
                rcost = sum(n * (unit_kw(j) - unit_kw(j, lv)) * lease_cost(j) / unit_kw(j) for (j, lv), n in S["lc"].items() if lv < S["cool"])
                if gain > 0 and rcost / gain <= best and rcost <= S["funds"] * 0.7:
                    S["funds"] -= rcost; S["retro"] = S.get("retro", 0) + 1
                    for (j, lv) in [k for k in S["lc"] if k[1] < S["cool"]]:
                        S["lc"][(j, S["cool"])] = S["lc"].get((j, S["cool"]), 0) + S["lc"].pop((j, lv))
                    continue
            S["funds"] -= lease_cost(i); S["leases"][TYPES[i][0]] = owned(i) + 1; S["top"] = max(S["top"], i)
            S["lc"][(i, S["cool"])] = S["lc"].get((i, S["cool"]), 0) + 1
            log(f"lease{TYPES[i][0]}", f"first {TYPES[i][0]}")
        # buy newest chips, credits first
        room = int((cap_kw() - used_kw()) / pk)
        for _ in range(4000):
            if room <= 0: break
            c = base_price(S["gpus"]) * pr
            if S["credits"] >= c: S["credits"] -= c
            elif S["funds"] >= c and not saving: S["funds"] -= c
            else: break
            S["gpus"] += 1; S["fleet"][S["chip"]] = S["fleet"].get(S["chip"], 0) + 1; room -= 1
        if S["gen"] >= C.get("end_gen", 6) and used_kw() >= C.get("ground_kw", 100000) and S["funds"] >= C["ground"]:
            log("end", "BREAK GROUND"); break
    end = S["t"] if "end" in seen else None
    if verbose:
        for tt, m in ev: print(f"   {int(tt) // 60:2d}:{int(tt) % 60:02d}  {m}")
        print(f"   end={end and f'{int(end)//60}:{int(end)%60:02d}'} gpus={S['gpus']:,} peak crashes={S['crashes']} debt=${S['debt']:,.0f}")
    return end, S


def first_gpu_to_end(C, seeds=range(5)):
    out = []
    for sd in seeds:
        end, S = run(C, seed=sd)
        out.append(end)
    return out


if __name__ == "__main__":
    GAME = dict(BASE, chip_first=300, chip_every=300, chip_perf=1.7, trainx=10, rel_a=20, rel_b=5, crash_mult=2.0,
                rent=([60, 50, 42, 35, 30], 4, 0.9), end_gen=7, lev_min=10, margin_call=0.2, mc_sev=0.5, per_lease=True)   # what index.html runs now
    for name, C in [("draws debt", GAME), ("draws debt + saves", dict(GAME, save=True)),
                    ("no debt + saves", dict(GAME, draws=False, save=True)), ("no debt, never saves", dict(GAME, draws=False)),
                    ("no debt + saves + rents", dict(GAME, draws=False, save=True, rent_rival=True)), ("debt + saves + rents", dict(GAME, save=True, rent_rival=True))]:
        ends = first_gpu_to_end(C)
        fmt = lambda e: f"{int(e) // 60}:{int(e) % 60:02d}" if e else "none"
        print(f"== {name}: break ground at {', '.join(fmt(e) for e in ends)}  (5 seeds)")
