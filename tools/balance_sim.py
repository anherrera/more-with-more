"""Greedy-player simulation of More With More phase 1, mirroring index.html's formulas.
Prints when each milestone happens so the constants can be tuned toward a ~30 min phase 1."""
import math, sys

def run(C, verbose=True, limit=3 * 3600):
    TIERS = [(1, 30, 0), (6, 200, C["cage"]), (24, 1500, C["row"]), (240, 20000, C["hall"]), (1500, 200000, C["bldg"])]
    COOL = [10, 25, 60, 120]
    ROUNDS = [(1, C["r0"]), (2, C["r1"]), (3, C["r2"]), (4, C["r3"]), (5, C["r4"]), (6, C["r5"])]
    S = dict(t=0, funds=0.0, price=0.25, gpus=0, queue=0.0, split=0, gen=0, prog=0.0, hype=20.0, tier=0, cool=0,
             rnd=0, dm=1.0, credits=0.0, deals=0, nextDeal=0, done=set())
    need = lambda g: C["train0"] * C["trainx"] ** (g - 1)
    fit = lambda: min(TIERS[S["tier"]][0] * COOL[S["cool"]], TIERS[S["tier"]][1])
    gprice = lambda n: min(C.get("pmax", 1e18), C["gpu0"] * (1 + n / 100) ** C.get("gexp", 1.2))
    def demand(p=None):
        p = p or S["price"]
        return C["d0"] * C["q"] ** S["gen"] * (0.5 + S["hype"] / 40) * S["dm"] * (0.25 / p) ** 1.3
    PROJ = [("rdhx", 1, 400, lambda: S.update(cool=max(S["cool"], 1))), ("card", 1, 50, lambda: S.update(hype=S["hype"] + 15)),
            ("evals", 3, 2000, lambda: S.update(hype=S["hype"] + 35)), ("sales", 3, 20000, lambda: S.update(dm=S["dm"] * 2)),
            ("dlc", 4, 150000, lambda: S.update(cool=max(S["cool"], 2))), ("keynote", 4, 200000, lambda: S.update(hype=S["hype"] + 50)),
            ("imm", 5, 5e6, lambda: S.update(cool=max(S["cool"], 3))), ("sov", 5, 3e6, lambda: S.update(dm=S["dm"] * 3))]
    events, last = [], {}
    def ev(k, msg):
        if k not in last: last[k] = S["t"]; events.append((S["t"], msg))
    while S["t"] < limit:
        dt = 1; S["t"] += dt
        # player: price so demand ~= serving capacity (never below $0.001)
        serveCap = S["gpus"] * (1 - S["split"] / 100) * C["tput"]
        if serveCap > 0:
            S["price"] = max(0.001, 0.25 * (demand(0.25) / serveCap) ** (1 / 1.3))
        S["split"] = 0 if S["gpus"] < 3 else 50
        clicks = C["clicks"] if S["t"] < 600 else 0
        S["queue"] = min(S["queue"] + demand() * dt, max(50, demand() * 30))
        served = min(S["queue"], serveCap * dt + clicks); S["queue"] -= served; S["funds"] += served * S["price"]
        S["prog"] += S["gpus"] * S["split"] / 100 * dt
        if S["prog"] >= need(S["gen"] + 1):
            S["prog"] = 0; S["gen"] += 1; S["hype"] += 30 + 10 * S["gen"]; ev(f"gen{S['gen']}", f"Gen {S['gen']}")
        S["hype"] = max(5, S["hype"] - S["hype"] * 0.004 * dt)
        if S["gen"] >= 1 and S["t"] >= S["nextDeal"]:
            amt = C["deal0"] * 5 ** S["gen"] * (1 + S["deals"] * C.get("dealGrow", 0.5)); S["credits"] += amt; S["deals"] += 1; S["nextDeal"] = S["t"] + C.get("dealEvery", 45)
        if S["rnd"] < len(ROUNDS) and S["gen"] >= ROUNDS[S["rnd"]][0] and S["hype"] >= 40:
            S["funds"] += ROUNDS[S["rnd"]][1]; ev(f"round{S['rnd']}", f"round {S['rnd']} ${ROUNDS[S['rnd']][1]:,.0f}"); S["rnd"] += 1; S["hype"] = max(10, S["hype"] - 20)
        for pid, g, cost, fn in PROJ:
            if pid not in S["done"] and S["gen"] >= g and S["funds"] >= cost:
                S["funds"] -= cost; S["done"].add(pid); fn(); ev(pid, pid)
        if C.get("ltv") and S["tier"] >= 3 and "loan" not in S["done"]:
            F = lambda n: (500 / 2.2) * (1 + n / 100) ** 2.2
            amt = C["ltv"] * F(S["gpus"]); S["funds"] += amt; S["debt"] = amt; S["done"].add("loan"); ev("loan", f"GPU-backed loan ${amt:,.0f}")
        if C.get("facility") and S["tier"] >= 3 and S["hype"] >= 60 and S["t"] >= S.get("nextDraw", 0):
            amt = S["hype"] / 100 * 3 * 5 ** S["gen"] * 1000
            S["funds"] += amt; S["debt"] = S.get("debt", 0) + amt; S["nextDraw"] = S["t"] + 60; S["hype"] -= 10
            ev(f"draw{S['t']}", f"draw ${amt:,.0f} (debt ${S['debt']:,.0f})")
        if S.get("debt"): S["funds"] -= S["debt"] * C.get("apr_s", 0) * dt
        nt = S["tier"] + 1
        if nt < len(TIERS) and S["gpus"] >= fit() * 0.9 and S["funds"] >= TIERS[nt][2]:
            S["funds"] -= TIERS[nt][2]; S["tier"] = nt; ev(f"tier{nt}", ["", "cage", "row", "hall", "building"][nt])
        for _ in range(2000):
            if S["gpus"] >= fit(): break
            c = gprice(S["gpus"])
            if S["credits"] >= c: S["credits"] -= c
            elif S["funds"] >= c: S["funds"] -= c
            else: break
            S["gpus"] += 1
            if S["gpus"] in (1, 10, 100, 1000, 10000, 100000): ev(f"g{S['gpus']}", f"{S['gpus']} GPUs")
        if S["gen"] >= 6 and S["tier"] >= 4 and S["funds"] >= C["ground"]:
            ev("end", "BREAK GROUND"); break
    if verbose:
        for t, m in events: print(f"{t // 60:3d}:{t % 60:02d}  {m}")
        print(f"end state t={S['t']//60}m gen={S['gen']} tier={S['tier']} gpus={S['gpus']} funds=${S['funds']:,.0f}")
    return last.get("end")

CUR = dict(d0=5, q=4, tput=1, gpu0=5, clicks=3, train0=100, trainx=8, deal0=800,
           cage=1500, row=30000, hall=350000, bldg=12e6, ground=120e6, facility=1, apr_s=0.0002, dealEvery=90, dealGrow=0.15, gexp=1.0, pmax=500,
           r0=300, r1=3000, r2=40000, r3=500000, r4=8e6, r5=150e6)
if __name__ == "__main__":
    print("== current constants"); run(CUR)
