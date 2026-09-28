"""Phase 2 pacing sim: GPUs racked in leased colo space or on your own campus; contracts by chip generation;
uncontracted GPUs sell on-demand (older generations cheaper, still busy). Mirrors campus.js; keep constants in sync.

    python3 tools/sim_p2.py [--county all|cheap|strong|incent] [--minutes 25] [--debt 500e6] [--draws]
"""
import argparse, random

# --- mirrored from campus.js / main.js ---
HALL = dict(mw=50, acres=20, cost=10e6, secs=90)            # powered shell; GPUs bought separately
TURBINE = dict(mw=50, cost=25e6, secs=60)
COUNTIES = {"cheap": dict(grid=50, acres=3000, qmw=100, qsecs=300, cash=0),
            "strong": dict(grid=200, acres=1500, qmw=150, qsecs=200, cash=0),
            "incent": dict(grid=100, acres=2000, qmw=100, qsecs=240, cash=20e6)}
UPFRONT_RATE, FEE_RATE = 550, 275
OD_RATE, OD_DECAY, OD_FLOOR, OD_UTIL = 300, 0.7, 0.15, 0.8
MARKET_START_MW, MARKET_REGROW = 150, 10 / 60
LEASE_UNIT_MW, LEASE_RACKS, LEASE_SLOT = 20, 240, 35          # a leased data hall at two-phase cooling
QUEUE_DEPOSIT, QUEUE_GROWTH = 5e6, 1.3
LATE_FREE, LATE_DEFAULT, OFFER_TTL = 60, 180, 60
CHIP_EVERY, DEAL_EVERY, DEAL = 300, 90, 20e6
INTEREST, P2_RATE = 0.0002, 0.25
ROUNDS2 = [(100, 100e6), (300, 250e6), (700, 600e6)]
HYPE = 80                                                      # assume the player keeps hype around here with posts


def gpu_cost_per_kw(g):          # volume price $500 x 1.6^g per GPU, 1.4^g kW per GPU
    return 500 * (1.6 / 1.4) ** g


def run(county="strong", minutes=25, seed=1, funds=100e6, fleet_kw=110_000, leased_kw=220_000, racks=1845,
        chip=3, debt=0.0, draws=False, verbose=True):
    rnd = random.Random(seed)
    c = COUNTIES[county]
    S = dict(t=0, funds=funds + c["cash"], credits=0.0, fleet={chip: float(fleet_kw)}, chip=chip, next_chip=CHIP_EVERY,
             leased=float(leased_kw), racks=racks, market=float(MARKET_START_MW), grid=c["grid"], queue=None, qn=0,
             builds=[], offers=[], contracts=[], next_offer=90, next_deal=0, next_draw=0, debt=debt, round=0,
             n=0, defaults=0, idle=0, idle_log=[], acted_log=[])

    done = lambda kind, at: sum(1 for b in S["builds"] if b[0] == kind and b[1] <= at)
    power_at = lambda at: S["grid"] + (S["queue"][0] if S["queue"] and S["queue"][1] <= at else 0) + done("turbine", at) * TURBINE["mw"]
    campus_kw = lambda at: min(done("hall", at) * HALL["mw"], power_at(at)) * 1000
    cap_kw = lambda at: S["leased"] + campus_kw(at)
    used_kw = lambda: sum(S["fleet"].values())
    room_mw = lambda at: max(0.0, (cap_kw(at) - used_kw()) / 1000)
    rent_index = lambda: (1 + S["racks"] / 4) ** 0.9
    lease_cost = lambda: LEASE_RACKS * LEASE_SLOT * rent_index()
    live = lambda k: k["status"] in ("waiting", "late")

    def free_by_gen():
        free = dict(S["fleet"])
        for k in sorted((k for k in S["contracts"] if k["status"] == "active"), key=lambda k: (k["active_at"], k["n"])):
            need = k["mw"] * 1000
            for g in sorted(free):
                if g < k["min_gen"] or need <= 0: continue
                take = min(need, free[g]); free[g] -= take; need -= take
        return free

    eligible = lambda min_gen: sum(kw for g, kw in free_by_gen().items() if g >= min_gen) / 1000
    gen_price = lambda g: (1.6 / 1.4) ** (g - 3)                       # rates track each chip's launch price (P4 = 1)
    od_rate = lambda g: OD_RATE * gen_price(g) * max(OD_FLOOR, OD_DECAY ** (S["chip"] - g))
    on_demand = lambda: sum(kw / 1000 * od_rate(g) * OD_UTIL for g, kw in free_by_gen().items())
    backlog = lambda: sum(k["mw"] for k in S["contracts"] if live(k))
    pending_before = lambda o: sum(k["mw"] for k in S["contracts"] if live(k) and k["start"] < o["start"] + o["term"])

    def buy_gpus(mw):
        mw = min(mw, room_mw(S["t"]))
        cost = mw * 1000 * gpu_cost_per_kw(S["chip"])
        if mw <= 0 or S["funds"] + S["credits"] < cost: return False
        cr = min(S["credits"], cost); S["credits"] -= cr; S["funds"] -= cost - cr
        S["fleet"][S["chip"]] = S["fleet"].get(S["chip"], 0) + mw * 1000
        return True

    def lease_one():
        if S["market"] < LEASE_UNIT_MW or S["funds"] < lease_cost(): return False
        S["funds"] -= lease_cost(); S["leased"] += LEASE_UNIT_MW * 1000; S["market"] -= LEASE_UNIT_MW; S["racks"] += LEASE_RACKS
        return True

    def offer():
        S["n"] += 1
        scale = max(20, 0.3 * (used_kw() / 1000 + 40))
        mw = max(10, round(scale * (0.6 + rnd.random() * 0.8) / 10) * 10)
        start = S["t"] + 240 + rnd.randrange(180); term = 480 + rnd.randrange(420)
        mg = max(0, S["chip"] - (1 if rnd.random() < 0.4 else 0))
        S["offers"].append(dict(n=S["n"], mw=mw, min_gen=mg,
                                start=start, term=term, upfront=mw * term * UPFRONT_RATE * gen_price(mg), fee=mw * FEE_RATE * gen_price(mg),
                                expires=S["t"] + OFFER_TTL))

    # first offer: your old lab, any GPUs, 30 MW in 5 minutes
    S["n"] += 1
    S["offers"].append(dict(n=S["n"], mw=30, min_gen=0, start=300, term=600, upfront=30 * 600 * UPFRONT_RATE * (1.6 / 1.4) ** -3,
                            fee=30 * FEE_RATE * (1.6 / 1.4) ** -3, expires=280))
    rows = []
    while S["t"] < minutes * 60:
        S["t"] += 1; t = S["t"]; acted = False
        # world
        if t >= S["next_chip"]: S["chip"] += 1; S["next_chip"] = t + CHIP_EVERY
        if S["queue"] and t >= S["queue"][1]: S["grid"] += S["queue"][0]; S["queue"] = None; S["qn"] += 1
        S["market"] += MARKET_REGROW
        S["funds"] += on_demand() - S["debt"] * INTEREST * P2_RATE
        if t >= S["next_deal"]: S["credits"] += DEAL; S["next_deal"] = t + DEAL_EVERY
        S["offers"] = [o for o in S["offers"] if o["expires"] > t and o["start"] > t]
        if t >= S["next_offer"] and len(S["offers"]) < 3: offer(); S["next_offer"] = t + 60 + rnd.random() * 60
        for k in sorted(S["contracts"], key=lambda k: (k["start"], k["n"])):
            if k["status"] == "active":
                S["funds"] += k["fee"]
                if t >= k["end"]: k["status"] = "done"
            elif live(k) and t >= k["start"]:
                if eligible(k["min_gen"]) >= k["mw"]:
                    k["status"] = "active"; k["active_at"] = t
                else:
                    k["status"] = "late"; late = t - k["start"]
                    if late > LATE_FREE: S["funds"] -= 0.5 * k["fee"]
                    if late >= LATE_DEFAULT: k["status"] = "defaulted"; S["funds"] -= k["upfront"]; S["defaults"] += 1
        # player: money in
        if S["round"] < len(ROUNDS2) and backlog() >= ROUNDS2[S["round"]][0]:
            S["funds"] += ROUNDS2[S["round"]][1]; S["round"] += 1; acted = True
        if draws and t >= S["next_draw"]:
            amt = HYPE / 100 * max(backlog(), 10) * 300000; S["funds"] += amt; S["debt"] += amt; S["next_draw"] = t + 60; acted = True
        # player: sign what it can deliver with money in hand (the game's forecast plus a space check)
        for o in list(S["offers"]):
            on_hand = eligible(o["min_gen"]) - pending_before(o)
            need = max(0.0, o["mw"] - max(0.0, on_hand))
            gpu = need * 1000 * gpu_cost_per_kw(S["chip"])
            space_short = max(0.0, need - room_mw(o["start"]))
            space_ok = space_short <= S["market"] or o["start"] - t > HALL["secs"] + 30
            if on_hand >= o["mw"] or (space_ok and S["funds"] + S["credits"] + o["upfront"] >= gpu + space_short / 20 * lease_cost()):
                S["offers"].remove(o); S["funds"] += o["upfront"]; acted = True
                S["contracts"].append(dict(n=o["n"], mw=o["mw"], min_gen=o["min_gen"], start=o["start"], end=o["start"] + o["term"],
                                           fee=o["fee"], upfront=o["upfront"], status="waiting", active_at=0))
        # player: rack GPUs for contracts starting within 90 s; make space first if needed
        for k in sorted((k for k in S["contracts"] if live(k) and k["start"] - t <= 90), key=lambda k: k["start"]):
            short = k["mw"] - eligible(k["min_gen"])
            if short <= 0: continue
            while room_mw(t) < short and lease_one(): acted = True
            acted |= buy_gpus(short)
        # player: keep space ahead of backlog; campus when the leased market runs dry
        need_space = backlog() + 50 - (sum(free_by_gen().values()) / 1000 + room_mw(t + 120))
        if need_space > 0:
            if S["market"] >= LEASE_UNIT_MW: acted |= lease_one()
            else:
                halls_mw = sum(1 for b in S["builds"] if b[0] == "hall") * HALL["mw"]
                power_mw = S["grid"] + (S["queue"][0] if S["queue"] else 0) + sum(1 for b in S["builds"] if b[0] == "turbine") * TURBINE["mw"]
                if halls_mw <= power_mw and S["funds"] >= HALL["cost"]:
                    S["funds"] -= HALL["cost"]; S["builds"].append(("hall", t + HALL["secs"])); acted = True
                elif S["funds"] >= TURBINE["cost"]:
                    S["funds"] -= TURBINE["cost"]; S["builds"].append(("turbine", t + TURBINE["secs"])); acted = True
        if S["queue"] is None and S["market"] < 60 and S["funds"] >= QUEUE_DEPOSIT + 20e6:
            S["funds"] -= QUEUE_DEPOSIT; S["queue"] = (c["qmw"], t + c["qsecs"] * QUEUE_GROWTH ** S["qn"]); acted = True
        # player: spare cash above a reserve goes into GPUs for on-demand
        if S["funds"] + S["credits"] > 60e6 and room_mw(t) >= 5:
            acted |= buy_gpus(min(room_mw(t), (S["funds"] + S["credits"] - 60e6) / 1000 / gpu_cost_per_kw(S["chip"])))
        pending = any(b[1] > t for b in S["builds"]) or S["queue"] is not None or any(live(k) for k in S["contracts"])
        if acted or pending or S["offers"]:
            if S["idle"] > 90: S["idle_log"].append((t - S["idle"], S["idle"]))
            S["idle"] = 0
        else:
            S["idle"] += 1
        if t % 60 == 0:
            rows.append(dict(min=t // 60, fleet=used_kw() / 1000, leased=S["leased"] / 1000, campus=campus_kw(t) / 1000,
                             delivered=sum(k["mw"] for k in S["contracts"] if k["status"] == "active"), backlog=backlog(),
                             od=on_demand(), funds=S["funds"], market=S["market"], rounds=S["round"]))
    if verbose:
        print(f"county={county} seed={seed} debt={debt:,.0f} draws={draws}")
        print(" min  fleetMW leasedMW campusMW delivered backlog  on-demand$/s          funds market rnd")
        for r in rows:
            print(f"{r['min']:>4} {r['fleet']:>8.0f} {r['leased']:>8.0f} {r['campus']:>8.0f} {r['delivered']:>9.0f} {r['backlog']:>7.0f} "
                  f"{r['od']:>13,.0f} {r['funds']:>14,.0f} {r['market']:>6.0f} {r['rounds']:>3}")
        print(f"defaults={S['defaults']} idle stretches >90s: {S['idle_log'] or 'none'}")
    return rows, S


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--county", default="strong"); ap.add_argument("--minutes", type=int, default=25)
    ap.add_argument("--debt", type=float, default=0); ap.add_argument("--draws", action="store_true")
    a = ap.parse_args()
    for county in ([a.county] if a.county != "all" else list(COUNTIES)):
        run(county, a.minutes, debt=a.debt, draws=a.draws)
