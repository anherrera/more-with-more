"""Phase 2 core-loop pacing sim: a greedy infra company (contracts, halls, turbines, grid queue).
Mirrors campus.js constants; keep them in sync.   python3 tools/sim_p2.py [--county strong] [--minutes 25]"""
import argparse, random

HALL = dict(mw=50, acres=20, cost=30e6, secs=90)
TURBINE = dict(mw=50, cost=25e6, secs=60)
COUNTIES = {"cheap": dict(grid=50, acres=3000, qmw=100, qsecs=300, cash=0),
            "strong": dict(grid=200, acres=1500, qmw=150, qsecs=200, cash=0),
            "incent": dict(grid=100, acres=2000, qmw=100, qsecs=240, cash=20e6)}
UPFRONT_RATE, FEE_RATE, LEGACY_FEE = 550, 275, 100
QUEUE_DEPOSIT, QUEUE_GROWTH = 5e6, 1.3
LATE_FREE, LATE_DEFAULT, OFFER_TTL = 60, 180, 60
DEAL_EVERY, DEAL = 90, HALL["cost"] * 0.5


def run(county="strong", minutes=25, seed=1, funds=60e6, legacy=110, verbose=True):
    rnd = random.Random(seed)
    c = COUNTIES[county]
    S = dict(t=0, funds=funds + c["cash"], credits=0.0, grid=c["grid"], queue=None, qn=0, builds=[],
             offers=[], contracts=[], next_offer=90, next_deal=0, earned=0.0, defaults=0, idle=0, idle_log=[])

    done = lambda kind, at: sum(1 for b in S["builds"] if b[0] == kind and b[1] <= at)
    grid_at = lambda at: S["grid"] + (S["queue"][0] if S["queue"] and S["queue"][1] <= at else 0)
    power_at = lambda at: grid_at(at) + done("turbine", at) * TURBINE["mw"]
    halls_at = lambda at: done("hall", at) * HALL["mw"]
    energized = lambda at: min(halls_at(at), power_at(at))
    live = lambda k: k["status"] not in ("done", "defaulted")
    delivered = lambda: sum(k["mw"] for k in S["contracts"] if k["status"] == "active")
    committed = lambda at: sum(k["mw"] for k in S["contracts"] if live(k) and k["start"] <= at < k["end"])
    acres_free = lambda: c["acres"] - sum(HALL["acres"] for b in S["builds"] if b[0] == "hall")

    def offer(first=False):
        scale = max(20, 0.35 * (energized(S["t"] + 300) + 40))
        mw = 30 if first else max(10, round(scale * (0.6 + rnd.random() * 0.8) / 10) * 10)
        start = S["t"] + (300 if first else 240 + rnd.randrange(180))
        term = 480 + rnd.randrange(420)
        S["offers"].append(dict(mw=mw, start=start, term=term, upfront=mw * term * UPFRONT_RATE, fee=mw * FEE_RATE,
                                expires=S["t"] + (280 if first else OFFER_TTL)))

    def spare_at(at, extra_build_mw=0):
        return min(halls_at(at) + extra_build_mw, power_at(at) + extra_build_mw) - committed(at)

    offer(first=True)
    rows = []
    while S["t"] < minutes * 60:
        S["t"] += 1; t = S["t"]; acted = False
        if S["queue"] and t >= S["queue"][1]:
            S["grid"] += S["queue"][0]; S["queue"] = None; S["qn"] += 1
        S["funds"] += legacy * LEGACY_FEE
        if t >= S["next_deal"]:
            S["credits"] += DEAL; S["next_deal"] = t + DEAL_EVERY
        S["offers"] = [o for o in S["offers"] if o["expires"] > t and o["start"] > t]
        if t >= S["next_offer"] and len(S["offers"]) < 3:
            offer(); S["next_offer"] = t + 60 + rnd.random() * 60
        # contracts
        for k in sorted(S["contracts"], key=lambda k: k["start"]):
            if k["status"] == "active":
                S["funds"] += k["fee"]; S["earned"] += k["fee"]
                if t >= k["end"]: k["status"] = "done"
            elif k["status"] in ("waiting", "late") and t >= k["start"]:
                if energized(t) - delivered() >= k["mw"]:
                    k["status"] = "active"
                else:
                    k["status"] = "late"; late = t - k["start"]
                    if late > LATE_FREE: S["funds"] -= 0.5 * k["fee"]
                    if late >= LATE_DEFAULT:
                        k["status"] = "defaulted"; S["funds"] -= 0.5 * k["upfront"]; S["defaults"] += 1
        # player: sign offers it can cover by building in time with money on hand
        for o in list(S["offers"]):
            need = max(0, o["mw"] - spare_at(o["start"]))
            halls = -(-need // HALL["mw"])
            cost = halls * (HALL["cost"] + TURBINE["cost"])
            if need == 0 or (o["start"] - t > HALL["secs"] and S["funds"] + S["credits"] + o["upfront"] >= cost):
                S["offers"].remove(o); S["funds"] += o["upfront"]; acted = True
                S["contracts"].append(dict(mw=o["mw"], start=o["start"], end=o["start"] + o["term"], fee=o["fee"],
                                           upfront=o["upfront"], status="waiting"))
        # player: build whichever side is short for the next 5 minutes of commitments
        horizon = t + 300
        demand = max([committed(x) for x in range(t, horizon, 30)] + [0]) + 50
        if S["queue"] is None and S["funds"] >= QUEUE_DEPOSIT and power_at(horizon) < demand:
            S["funds"] -= QUEUE_DEPOSIT; S["queue"] = (c["qmw"], t + c["qsecs"] * QUEUE_GROWTH ** S["qn"]); acted = True
        for _ in range(10):
            hall_future = sum(1 for b in S["builds"] if b[0] == "hall") * HALL["mw"]
            power_future = S["grid"] + (S["queue"][0] if S["queue"] else 0) + sum(1 for b in S["builds"] if b[0] == "turbine") * TURBINE["mw"]
            if hall_future >= demand and power_future >= demand:
                break
            if hall_future <= power_future and acres_free() >= HALL["acres"] and S["funds"] + S["credits"] >= HALL["cost"]:
                cr = min(S["credits"], HALL["cost"]); S["credits"] -= cr; S["funds"] -= HALL["cost"] - cr
                S["builds"].append(("hall", t + HALL["secs"])); acted = True
            elif power_future < hall_future and S["funds"] >= TURBINE["cost"]:
                S["funds"] -= TURBINE["cost"]; S["builds"].append(("turbine", t + TURBINE["secs"])); acted = True
            else:
                break
        pending = any(b[1] > t for b in S["builds"]) or S["queue"] is not None or any(k["status"] == "waiting" for k in S["contracts"])
        if acted or pending or S["offers"]:
            if S["idle"] > 90: S["idle_log"].append((t - S["idle"], S["idle"]))
            S["idle"] = 0
        else:
            S["idle"] += 1
        if t % 60 == 0:
            rows.append((t // 60, energized(t), delivered(), sum(k["mw"] for k in S["contracts"] if k["status"] in ("waiting", "late")),
                         sum(1 for k in S["contracts"] if k["status"] == "late"), S["funds"], S["credits"]))
    if verbose:
        print(f"county={county} seed={seed}")
        print(" min  energized delivered backlog late          funds       credits")
        for r in rows:
            print(f"{r[0]:>4} {r[1]:>10.0f} {r[2]:>9.0f} {r[3]:>7.0f} {r[4]:>4} {r[5]:>14,.0f} {r[6]:>13,.0f}")
        print(f"defaults={S['defaults']} idle stretches >90s: {S['idle_log'] or 'none'}")
    return rows, S


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--county", default="strong"); ap.add_argument("--minutes", type=int, default=25)
    a = ap.parse_args()
    for county in ([a.county] if a.county != "all" else list(COUNTIES)):
        run(county, a.minutes)
