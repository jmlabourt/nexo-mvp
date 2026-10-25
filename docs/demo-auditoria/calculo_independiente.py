#!/usr/bin/env python3
"""
Cálculo INDEPENDIENTE de los resultados de la demo de Blerp.

Lee solo los registros fuente (datos/escenario.json) y aplica las reglas de negocio escritas acá, sin usar el código
TypeScript de la app. Genera:
  datos/esperados.json      → valores esperados (los compara tests/demo-esperados.test.ts)
  RESULTADOS_ESPERADOS.md   → los mismos valores con las operaciones desglosadas

Uso: python3 docs/demo-auditoria/calculo_independiente.py
"""
import json
import math
import os
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
W = json.load(open(os.path.join(HERE, "datos", "escenario.json"), encoding="utf-8"))
AS_OF = W["config"]["asOf"]
RATE = W["config"]["financialMonthlyRatePct"]


def rnd(x, d=2):
    """Redondeo "half up" como Math.round de JavaScript."""
    f = 10 ** d
    return math.floor(x * f + 0.5) / f


money = rnd


def qty(x):
    return rnd(x, 3)


def D(s):
    return date.fromisoformat(s)


def days(a, b):
    return (D(b) - D(a)).days


def iso(d):
    return d.isoformat()


def weekday(s):  # 0 = domingo
    return (D(s).weekday() + 1) % 7


def fmt(x):
    s = f"{x:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return "$ " + (s[:-3] if s.endswith(",00") else s)


projects = {p["id"]: p for p in W["projects"]}
lots = {l["id"]: l for l in W["lots"]}
emps = {e["id"]: e for e in W["employees"]}
cats = {c["id"]: c for c in W["config"]["categories"]}
mats = {m["id"]: m for m in W["materials"]}
ot = lambda pid: projects[pid]["ot"].split("_")[0]


# ── Valores con vigencia ──
def rate_at(kind, subject, d):
    recs = [r for r in W["rates"] if r["kind"] == kind and r["subjectId"] == subject and r["validFrom"] <= d]
    recs.sort(key=lambda r: (r["validFrom"], r["createdAt"]))
    return recs[-1]["value"] if recs else None


def emp_cost(eid, d):
    v = rate_at("employee_cost", eid, d)
    return v if v is not None else rate_at("category_cost", emps[eid]["categoryId"], d)


def available(e, d):
    ex = [x for x in W["exceptions"] if x["employeeId"] == e["id"] and x["date"] == d]
    if ex:
        return ex[-1]["availableHours"]
    return e["dailyHours"] if e["active"] and weekday(d) in e["workDays"] else 0


def is_worker(eid):
    return cats[emps[eid]["categoryId"]]["isWorker"]


# ── Costo de una hora con horas extra ──
def entry_cost(t):
    e = emps[t["employeeId"]]
    rate = emp_cost(e["id"], t["date"])
    total = sum(x["hours"] for x in W["timeEntries"] if x["employeeId"] == e["id"] and x["date"] == t["date"])
    total = rnd(total)
    extra = max(0, total - available(e, t["date"]))
    ot_h = rnd(t["hours"] * extra / total) if total > 0 else 0
    mult = rate_at("overtime_cost", "all", t["date"]) or 1
    cost = None if rate is None else money(rate * (t["hours"] + ot_h * (mult - 1)))
    return rate, ot_h, mult, cost


# ── Tramos financieros ──
def tramos(events, end):
    ev = sorted([e for e in events if e["date"] <= end], key=lambda e: e["date"])
    dates = sorted(set(e["date"] for e in ev))
    inv = rec = 0.0
    out = []
    for i, d in enumerate(dates):
        for e in ev:
            if e["date"] == d:
                inv += e["invest"]
                rec += e["recover"]
        cap = money(max(0.0, inv - rec))
        nxt = dates[i + 1] if i + 1 < len(dates) else end
        n = days(d, nxt)
        if cap > 0 and n > 0:
            out.append({"from": d, "to": nxt, "days": n, "capital": cap, "amount": money(cap * RATE / 100 * n / 30)})
    return out, money(sum(t["amount"] for t in out))


def tramos_until(trs, until):
    total = 0.0
    for t in trs:
        a, b = t["from"], min(t["to"], until)
        n = days(a, b)
        if n > 0:
            total += money(t["capital"] * RATE / 100 * n / 30)
    return money(total)


def tramos_within(trs, frm, to):
    total = 0.0
    for t in trs:
        a, b = max(t["from"], frm), min(t["to"], to)
        n = days(a, b)
        if n > 0:
            total += money(t["capital"] * RATE / 100 * n / 30)
    return money(total)


# ── Cotización ──
def plan_amounts(plan, price):
    out = [{"label": c["label"], "date": c["date"], "amount": money(price * c["pct"] / 100)} for c in plan]
    if out and abs(sum(c["pct"] for c in plan) - 100) < 1e-9:
        out[-1]["amount"] = money(out[-1]["amount"] + money(price - sum(c["amount"] for c in out)))
    return out


def budget_cf(direct, start, due, sched):
    ev = [{"date": start, "invest": direct, "recover": 0}] + [{"date": s["date"], "invest": 0, "recover": s["amount"]} for s in sched]
    end = max([due] + [s["date"] for s in sched])
    return tramos(ev, end)


def quote_totals(q, start, due):
    mat = money(sum(l["quantity"] * l["unitCost"] for l in q["lines"] if l["kind"] == "material"))
    lab = money(sum(l["quantity"] * l["unitCost"] for l in q["lines"] if l["kind"] == "labor"))
    stf = money(sum(l["hours"] * l["hourlyCost"] for l in q["staffLines"]))
    direct = money(mat + lab + stf)
    gen = money(sum(money(direct * g["value"] / 100 if g["mode"] == "pct" else g["value"]) for g in q["generalCosts"]))
    mp = money(mat / (1 - q["marginMaterialsPct"] / 100))
    lp = money((lab + stf) / (1 - q["marginLaborPct"] / 100))
    base = mp + lp + gen
    p = base
    for _ in range(60):
        nxt = base + budget_cf(direct, start, due, plan_amounts(q["plan"], p))[1]
        if abs(nxt - p) < 0.005:
            p = nxt
            break
        p = nxt
    suggested = math.ceil(p - 1e-6)
    lp_ = money(q["listPriceOverride"]) if q.get("listPriceOverride") else suggested
    agreed = money(lp_ - max(0, q.get("discount") or 0))
    sched = plan_amounts(q["plan"], agreed)
    trs, cf = budget_cf(direct, start, due, sched)
    total = money(direct + gen + cf)
    return {
        "materiales": mat, "mano_obra": lab, "personal": stf, "directo": direct, "generales": gen, "precio_materiales": mp,
        "precio_mano_obra": lp, "precio_sugerido": suggested, "precio_lista": lp_, "precio_acordado": agreed,
        "cf_previsto": cf, "tramos_previstos": trs, "costo_total": total,
        "rentabilidad_cotizada": rnd((agreed - total) / agreed * 100) if agreed > 0 else None,
    }


# ── Lugares de stock ──
def place_project(pl):
    if pl.startswith("asg:") or pl.startswith("cons:") or pl.startswith("waste:"):
        return pl.split(":", 1)[1]
    if pl.startswith("prod:"):
        rid = pl[5:]
        r = next((x for x in W["releases"] if x["id"] == rid), None)
        return r["projectId"] if r else None
    return None


def contract_at(p, d):
    if not p.get("baseline"):
        return None
    revs = sorted([r for r in W["contractRevisions"] if r["projectId"] == p["id"] and r["date"] <= d], key=lambda r: (r["date"], r["createdAt"]))
    return revs[-1]["next"] if revs else p["baseline"]["agreedPrice"]


def collected(pid, until=None):
    return money(sum(i["amount"] for i in W["incomes"] if i["projectId"] == pid and (until is None or i["date"] <= until)))


def line_received(lid, until):
    tot = 0.0
    for r in W["receipts"]:
        if r["lineId"] != lid or r["date"] > until:
            continue
        if r.get("reversal") and r["reversal"]["date"] <= until:
            continue
        tot += r["quantity"]
    return qty(tot)


def payment_by_line(o, pay):
    lines = [l for l in o["lines"] if l.get("projectId") == pay.get("projectId")] if pay.get("projectId") else o["lines"]
    total = sum(money(l["quantity"] * l["unitPrice"]) for l in lines)
    out = {}
    acc = 0.0
    for i, l in enumerate(lines):
        part = money(pay["amount"] - acc) if i == len(lines) - 1 else money(pay["amount"] * money(l["quantity"] * l["unitPrice"]) / total)
        acc = money(acc + part)
        out[l["id"]] = part
    return out


def fin_events(p, cutoff):
    ev = []
    for o in W["orders"]:
        pays = [(pay, payment_by_line(o, pay)) for pay in W["supplierPayments"] if pay["orderId"] == o["id"]]
        for l in o["lines"]:
            if l.get("projectId") != p["id"]:
                continue
            value = money(l["quantity"] * l["unitPrice"])
            ds = set()
            for r in W["receipts"]:
                if r["lineId"] == l["id"]:
                    ds.add(r["date"])
                    if r.get("reversal"):
                        ds.add(r["reversal"]["date"])
            for pay, bl in pays:
                if l["id"] in bl:
                    ds.add(pay["date"])
            prev = 0.0
            for d in sorted(x for x in ds if x <= cutoff):
                paid = sum(bl.get(l["id"], 0) for pay, bl in pays if pay["date"] <= d)
                rec = line_received(l["id"], d) * l["unitPrice"]
                inv = money(min(value, max(paid, rec)))
                if abs(inv - prev) > 0.005:
                    ev.append({"date": d, "invest": money(inv - prev), "recover": 0, "basis": "pago" if paid >= rec - 0.005 else "supuesto recepción"})
                    prev = inv
    for m in W["movements"]:
        if m["date"] > cutoff or m["kind"] in ("receipt", "receipt_reversal"):
            continue
        fp, tp = place_project(m["from"]), place_project(m["to"])
        if fp == tp:
            continue
        v = money(m["quantity"] * lots[m["lotId"]]["unitCost"])
        if tp == p["id"] and (m["from"] == "free" or m["from"].startswith("asg:")):
            ev.append({"date": m["date"], "invest": v, "recover": 0, "basis": "stock a la OT"})
        if fp == p["id"] and (m["to"] == "free" or m["to"].startswith("asg:")):
            ev.append({"date": m["date"], "invest": -v, "recover": 0, "basis": "sale de la OT"})
    for t in W["timeEntries"]:
        if t.get("projectId") == p["id"] and t["hours"] > 0 and t["date"] <= cutoff:
            c = entry_cost(t)[3]
            if c:
                ev.append({"date": t["date"], "invest": c, "recover": 0, "basis": "supuesto horas"})
    for c in W["otherCosts"]:
        if c["projectId"] == p["id"] and c["date"] <= cutoff:
            ev.append({"date": c["date"], "invest": c["amount"], "recover": 0, "basis": "otro costo"})
    for i in W["incomes"]:
        if i["projectId"] == p["id"] and i["date"] <= cutoff:
            ev.append({"date": i["date"], "invest": 0, "recover": i["amount"], "basis": "ingreso"})
    return ev


def material_cost(pid, until=None, frm=None):
    cons = wst = 0.0
    for m in W["movements"]:
        if until and m["date"] > until or frm and m["date"] < frm:
            continue
        lc = lots[m["lotId"]]["unitCost"]
        if m["to"] == f"cons:{pid}":
            cons += money(m["quantity"] * lc)
        elif m["to"] == f"waste:{pid}":
            wst += money(m["quantity"] * lc)
    return money(cons), money(wst)


def economics(p, cutoff):
    cons, wst = material_cost(p["id"], cutoff)
    lab = stf = 0.0
    lab_h = stf_h = 0.0
    for t in W["timeEntries"]:
        if t.get("projectId") != p["id"] or t["hours"] <= 0 or t["date"] > cutoff:
            continue
        c = entry_cost(t)[3] or 0
        if is_worker(t["employeeId"]):
            lab += c
            lab_h += t["hours"]
        else:
            stf += c
            stf_h += t["hours"]
    other = money(sum(c["amount"] for c in W["otherCosts"] if c["projectId"] == p["id"] and c["date"] <= cutoff))
    mat = money(cons + wst)
    op = money(mat + money(lab) + money(stf) + other)
    contract = contract_at(p, cutoff)
    trs, cf = tramos(fin_events(p, cutoff), cutoff) if p.get("baseline") else ([], 0)
    prev = tramos_until(p["baseline"]["financialTramos"], cutoff) if p.get("baseline") else 0
    real = money(op + cf)
    profit = None if contract is None else money(contract - real)
    return {
        "contrato": contract, "cobrado": collected(p["id"], cutoff), "materiales": mat, "desperdicio": wst, "mano_obra": money(lab),
        "horas_obreros": rnd(lab_h), "personal": money(stf), "horas_personal": rnd(stf_h), "otros": other, "costo_operativo": op,
        "cf_actualizado": cf, "cf_previsto_a_la_fecha": prev, "cf_adicional": money(max(0, cf - prev)), "costo_real": real,
        "ganancia": profit, "rentabilidad": rnd(profit / contract * 100) if contract else None,
        "rentabilidad_cotizada": p["baseline"]["quotedMarginPct"] if p.get("baseline") else None, "tramos": trs,
    }


# ── Necesidades ──
def balances():
    b = {}
    for m in W["movements"]:
        lb = b.setdefault(m["lotId"], {})
        lb[m["from"]] = qty(lb.get(m["from"], 0) - m["quantity"])
        lb[m["to"]] = qty(lb.get(m["to"], 0) + m["quantity"])
    return b


BAL = balances()


def at_place(place, mid=None):
    return qty(sum(v.get(place, 0) for lid, v in BAL.items() if (mid is None or lots[lid]["materialId"] == mid) and v.get(place, 0) > 1e-6))


def needs(p):
    boms = sorted([b for b in W["boms"] if b["projectId"] == p["id"] and b["status"] == "published"], key=lambda b: b["version"])
    if not boms or p["status"] not in ("purchasing", "production"):
        return []
    bom = boms[-1]
    done = {i["id"] for i in p["items"] if i["completedUnits"] >= i["quantity"]}
    reqs = [r for r in W["materialRequests"] if r["projectId"] == p["id"] and r["status"] == "active"]
    olines = [l for o in W["orders"] for l in o["lines"] if l.get("projectId") == p["id"]]
    ms = []
    for x in [l["materialId"] for l in bom["lines"]] + [r["materialId"] for r in reqs] + [l["materialId"] for l in olines]:
        if x not in ms:
            ms.append(x)
    rels = [r for r in W["releases"] if r["projectId"] == p["id"]]

    def used_item(iid, mid):
        t = 0.0
        for r in rels:
            if r["itemId"] == iid and r["materialId"] == mid:
                for x in W["renditions"]:
                    if x["releaseId"] == r["id"]:
                        t += x["consumed"] + x["waste"]
        return qty(t)

    out = []
    for mid in ms:
        dem_bom = qty(sum(min(l["quantity"], used_item(l["itemId"], mid)) if l["itemId"] in done else l["quantity"] for l in bom["lines"] if l["materialId"] == mid))
        extra = qty(sum(r["quantity"] for r in reqs if r["materialId"] == mid and r["itemId"] not in done))
        demand = qty(dem_bom + extra)
        assigned = at_place(f"asg:{p['id']}", mid)
        inprod = qty(sum(at_place(f"prod:{r['id']}", mid) for r in rels if r["materialId"] == mid))
        used = qty(at_place(f"cons:{p['id']}", mid) + at_place(f"waste:{p['id']}", mid))
        pend = qty(sum(max(0, l["quantity"] - line_received(l["id"], "9999-12-31")) for l in olines if l["materialId"] == mid))
        unc = qty(max(0, demand - used - assigned - inprod))
        out.append({"ot": ot(p["id"]), "material": mats[mid]["name"], "demanda": demand, "usado": used, "asignado": assigned, "en_produccion": inprod, "pedido_sin_recibir": pend, "faltante": unc, "por_registrar": qty(max(0, unc - pend))})
    return out


# ── Capacidad ──
def capacity(frm, to):
    w_from = max(frm, AS_OF)
    if w_from > to:
        return []
    dd = [iso(D(w_from) + timedelta(i)) for i in range(days(w_from, to) + 1)]
    rows = {r["id"]: {"rubro": r["name"], "capacidad": 0.0, "comprometidas": 0.0, "potenciales": 0.0} for r in W["rubros"] if r["active"]}
    for e in W["employees"]:
        if not e["active"] or not cats[e["categoryId"]]["isWorker"] or not e["rubroIds"]:
            continue
        share = sum(available(e, d) for d in dd) / len(e["rubroIds"])
        for rb in e["rubroIds"]:
            rows[rb]["capacidad"] += share

    def bdays(a, b):
        return [iso(D(a) + timedelta(i)) for i in range(days(a, b) + 1) if 1 <= weekday(iso(D(a) + timedelta(i))) <= 5] if a <= b else []

    def spread(h, a, b):
        ds = bdays(a, b)
        return h / len(ds) * len([x for x in ds if w_from <= x <= to]) if h > 0 and ds else 0

    for p in W["projects"]:
        if p["status"] in ("approved", "purchasing", "production"):
            lines = [l for l in p["baseline"]["lines"] if l["kind"] == "labor"] + [l for a in W["additionals"] if a["projectId"] == p["id"] for l in a["lines"] if l["kind"] == "labor"]
            keys = []
            for l in lines:
                k = (l["itemId"], l["rubroId"])
                if k not in keys:
                    keys.append(k)
            for iid, rb in keys:
                fp = [x for x in W["plans"] if x["projectId"] == p["id"] and x["itemId"] == iid and x["rubroId"] == rb and x["date"] >= AS_OF]
                if fp:
                    h = sum(x["hours"] for x in fp if w_from <= x["date"] <= to)
                else:
                    budget = sum(l["quantity"] for l in lines if l["itemId"] == iid and l["rubroId"] == rb)
                    real = sum(t["hours"] for t in W["timeEntries"] if t.get("projectId") == p["id"] and t.get("itemId") == iid and t.get("rubroId") == rb and t["date"] < AS_OF)
                    h = spread(max(0, budget - real), max(AS_OF, p["startDate"]), p["dueDate"])
                rows[rb]["comprometidas"] += h
        elif p["status"] == "quotation" and p["quote"]["state"] in ("sent", "negotiating"):
            for l in p["quote"]["lines"]:
                if l["kind"] == "labor":
                    rows[l["rubroId"]]["potenciales"] += spread(l["quantity"], max(AS_OF, p["startDate"]), p["dueDate"])
    out = []
    for r in rows.values():
        c, k, pt = rnd(r["capacidad"]), rnd(r["comprometidas"]), rnd(r["potenciales"])
        out.append({"rubro": r["rubro"], "capacidad": c, "comprometidas": k, "potenciales": pt, "saldo": rnd(c - k), "saldo_con_potenciales": rnd(c - k - pt)})
    return out


# ── Dashboard ──
P_FROM = iso(D(AS_OF) - timedelta(89))
P_TO = AS_OF
CUT = min(P_TO, AS_OF)


def dashboard():
    inc = [i for i in W["incomes"] if P_FROM <= i["date"] <= P_TO]
    pend_rows = []
    for p in W["projects"]:
        if p.get("baseline") and p["baseline"]["approvedAt"] <= CUT:
            c = contract_at(p, CUT)
            pend = money(max(0, c - collected(p["id"], CUT)))
            if pend > 1e-6:
                pend_rows.append({"ot": ot(p["id"]), "contrato": c, "cobrado": money(c - pend), "pendiente": pend})
    closed = [p for p in W["projects"] if p["status"] == "closed" and any(c["projectId"] == p["id"] and P_FROM <= c["date"] <= P_TO for c in W["closures"])]
    ecos = [economics(p, CUT) for p in closed]
    gp = money(sum(e["ganancia"] for e in ecos))
    gc = money(sum(e["contrato"] for e in ecos))
    sales = [{"ot": ot(p["id"]), "aprobada": p["baseline"]["approvedAt"], "contrato": contract_at(p, CUT)} for p in W["projects"] if p.get("baseline") and P_FROM <= p["baseline"]["approvedAt"] <= P_TO]
    by_p = {}
    for i in inc:
        by_p[i["projectId"]] = money(by_p.get(i["projectId"], 0) + i["amount"])
    chart1 = sorted([{"ot": ot(k), "importe": v} for k, v in by_p.items()], key=lambda r: (-r["importe"], r["ot"]))
    # Semanas lunes a domingo
    start = D(P_FROM) - timedelta(days=D(P_FROM).weekday())
    series = []
    d = start
    while iso(d) <= P_TO:
        a = max(iso(d), P_FROM)
        b = min(iso(d + timedelta(6)), P_TO)
        series.append({"desde": a, "hasta": b, "importe": money(sum(i["amount"] for i in W["incomes"] if a <= i["date"] <= b))})
        d += timedelta(7)
    chart2 = []
    for p in W["projects"]:
        if not p.get("baseline") or p["baseline"]["approvedAt"] > CUT:
            continue
        cl = next((c for c in W["closures"] if c["projectId"] == p["id"]), None)
        if cl and cl["date"] < P_FROM:
            continue
        e = economics(p, CUT)
        chart2.append({"ot": ot(p["id"]), "cotizada": e["rentabilidad_cotizada"], "real": e["rentabilidad"], "tipo": "final" if cl and cl["date"] <= CUT else "parcial"})
    waste_t = other_t = fin_t = 0.0
    for p in W["projects"]:
        if not p.get("baseline"):
            continue
        waste_t += material_cost(p["id"], P_TO, P_FROM)[1]
        other_t += sum(c["amount"] for c in W["otherCosts"] if c["projectId"] == p["id"] and P_FROM <= c["date"] <= P_TO)
        fin_t += tramos_within(tramos(fin_events(p, CUT), CUT)[0], P_FROM, CUT)
    return {
        "periodo": {"desde": P_FROM, "hasta": P_TO, "corte": CUT},
        "tarjetas": {
            "dinero_cobrado": money(sum(i["amount"] for i in inc)),
            "pendiente_de_cobrar": money(sum(r["pendiente"] for r in pend_rows)),
            "rentabilidad_total": rnd(gp / gc * 100) if gc else None,
            "ventas_contratadas": money(sum(s["contrato"] for s in sales)),
        },
        "detalle_pendiente": pend_rows,
        "detalle_rentabilidad": [{"ot": ot(p["id"]), "ganancia": e["ganancia"], "contrato": e["contrato"]} for p, e in zip(closed, ecos)],
        "detalle_ventas": sales,
        "grafico_cobrado_por_ot": chart1,
        "grafico_rentabilidad": chart2,
        "grafico_cobros_semanales": series,
        "costos_periodo": {"desperdicio": money(waste_t), "otros": money(other_t), "financiero": money(fin_t)},
    }


# ── Ejecución ──
result = {"asOf": AS_OF, "ots": {}, "necesidades": [], "dashboard": None, "capacidad": None}
for p in W["projects"]:
    q = quote_totals(p.get("baseline") and {**p["quote"], "lines": p["baseline"]["lines"], "staffLines": p["baseline"]["staffLines"]} or p["quote"], p["startDate"], p["dueDate"])
    entry = {"ot": p["ot"], "estado": p["status"], "cotizacion": {k: v for k, v in q.items() if k != "tramos_previstos"}, "tramos_previstos": q["tramos_previstos"]}
    if p.get("baseline"):
        e = economics(p, AS_OF)
        entry["economia"] = {k: v for k, v in e.items() if k != "tramos"}
        entry["tramos_actualizados"] = e["tramos"]
    result["ots"][ot(p["id"])] = entry
    result["necesidades"] += needs(p)
result["dashboard"] = dashboard()
cap_to = iso(D(AS_OF) + timedelta(27))
result["capacidad"] = {"desde": AS_OF, "hasta": cap_to, "filas": capacity(AS_OF, cap_to)}
json.dump(result, open(os.path.join(HERE, "datos", "esperados.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ── Documento ──
L = []
L.append("# Resultados esperados (cálculo independiente)\n")
L.append(f"Fecha de la demo: **{AS_OF}**. Calculado por `calculo_independiente.py` leyendo solo `datos/escenario.json` (no usa el código de la app). "
         "Los tests (`tests/demo-esperados.test.ts`) comparan estos valores con los que calcula Blerp. Redondeo: cada importe a centavos (mitad hacia arriba), "
         "cada tramo financiero redondeado antes de sumar. Si se modifica la demo desde la interfaz, estos números ya no aplican: corresponden al escenario base.\n")
L.append("## 1. Cotización aprobada y costo financiero previsto por OT\n")
L.append("Precio sugerido P = Mat/(1 − mMat) + (MO + Personal)/(1 − mMO) + Generales + CF(P) (punto fijo). Costo total = directo + generales + CF previsto.\n")
L.append("| OT | Materiales | Mano de obra | Personal | Generales | CF previsto | Costo total | Sugerido | Lista | Acordado | Rent. cotizada |")
L.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for k, v in result["ots"].items():
    c = v["cotizacion"]
    L.append(f"| {k} | {fmt(c['materiales'])} | {fmt(c['mano_obra'])} | {fmt(c['personal'])} | {fmt(c['generales'])} | {fmt(c['cf_previsto'])} | {fmt(c['costo_total'])} | {fmt(c['precio_sugerido'])} | {fmt(c['precio_lista'])} | {fmt(c['precio_acordado'])} | {c['rentabilidad_cotizada']} % |")
L.append("\nEjemplo desglosado (OT4306): " + (lambda c: f"{fmt(c['materiales'])}/(1 − 30 %) = {fmt(c['precio_materiales'])}; ({fmt(c['mano_obra'])} + {fmt(c['personal'])})/(1 − 40 %) = {fmt(c['precio_mano_obra'])}; + generales {fmt(c['generales'])} + CF → sugerido {fmt(c['precio_sugerido'])}; lista {fmt(c['precio_lista'])} − descuento = {fmt(c['precio_acordado'])}.")(result["ots"]["OT4306"]["cotizacion"]) + "\n")
L.append("Tramos previstos (OT4306): " + "; ".join(f"{t['from']}→{t['to']}: {fmt(t['capital'])} × {RATE} % × {t['days']}/30 = {fmt(t['amount'])}" for t in result["ots"]["OT4306"]["tramos_previstos"]) + "\n")
L.append(f"## 2. Costos reales, costo financiero y rentabilidad al {AS_OF}\n")
L.append("Costo operativo = material (consumido + desperdicio, costo de cada lote) + mano de obra (tarifa vigente + extras) + personal + otros. Costo real = operativo + CF actualizado. Rentabilidad = (contrato − costo real)/contrato.\n")
L.append("| OT | Contrato | Cobrado | Material | (desperdicio) | Mano de obra (h) | Personal (h) | Otros | Operativo | CF actualizado | CF previsto a la fecha | CF adicional | Costo real | Ganancia | Rentabilidad | Cotizada |")
L.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for k, v in result["ots"].items():
    e = v.get("economia")
    if not e:
        continue
    L.append(f"| {k} | {fmt(e['contrato'])} | {fmt(e['cobrado'])} | {fmt(e['materiales'])} | {fmt(e['desperdicio'])} | {fmt(e['mano_obra'])} ({e['horas_obreros']}) | {fmt(e['personal'])} ({e['horas_personal']}) | {fmt(e['otros'])} | {fmt(e['costo_operativo'])} | {fmt(e['cf_actualizado'])} | {fmt(e['cf_previsto_a_la_fecha'])} | {fmt(e['cf_adicional'])} | {fmt(e['costo_real'])} | {fmt(e['ganancia'])} | {e['rentabilidad']} % ({'final' if v['estado'] == 'closed' else 'parcial'}) | {e['rentabilidad_cotizada']} % |")
for k in ("OT4305", "OT4302"):
    L.append(f"\nTramos del costo financiero actualizado de {k}: " + "; ".join(f"{t['from']}→{t['to']}: {fmt(t['capital'])} × {t['days']}/30 × {RATE} % = {fmt(t['amount'])}" for t in result["ots"][k]["tramos_actualizados"]))
L.append("\n\nLectura: OT4305 tiene costo financiero adicional por la cuota vencida el 2026-09-21 (capital propio inmovilizado). OT4302 está cerrada con 30 % sin cobrar, pero la seña y la cuota ya recuperaron casi todo el capital propio: el saldo pendiente incluye ganancia y no es la base; solo sigue costando el capital no recuperado (el flete de $ 95.600 cargado después del último cobro).\n")
L.append("## 3. Por comprar (neteo por OT y material)\n")
L.append("Faltante = max(0, demanda − usado − asignado − en producción); por registrar = max(0, faltante − pedido sin recibir).\n")
L.append("| OT | Material | Demanda | Usado | Asignado | En producción | Pedido sin recibir | Faltante | Por registrar en OC |")
L.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for n in result["necesidades"]:
    L.append(f"| {n['ot']} | {n['material']} | {n['demanda']} | {n['usado']} | {n['asignado']} | {n['en_produccion']} | {n['pedido_sin_recibir']} | {n['faltante']} | {n['por_registrar']} |")
d = result["dashboard"]
L.append(f"\n## 4. Dashboard de Gerencia · período {d['periodo']['desde']} a {d['periodo']['hasta']} (últimos 90 días), corte {d['periodo']['corte']}\n")
t = d["tarjetas"]
L.append(f"- **Dinero cobrado**: {fmt(t['dinero_cobrado'])}")
L.append(f"- **Pendiente de cobrar**: " + " + ".join(f"{r['ot']} ({fmt(r['contrato'])} − {fmt(r['cobrado'])})" for r in d["detalle_pendiente"]) + f" = {fmt(t['pendiente_de_cobrar'])}")
L.append(f"- **Rentabilidad total**: (" + " + ".join(fmt(r["ganancia"]) for r in d["detalle_rentabilidad"]) + ") / (" + " + ".join(fmt(r["contrato"]) for r in d["detalle_rentabilidad"]) + f") = {t['rentabilidad_total']} %  (" + ", ".join(r["ot"] for r in d["detalle_rentabilidad"]) + ")")
L.append(f"- **Ventas contratadas**: " + " + ".join(f"{s['ot']} {fmt(s['contrato'])}" for s in d["detalle_ventas"]) + f" = {fmt(t['ventas_contratadas'])}\n")
L.append("Gráfico 1 · cobrado por OT: " + " · ".join(f"{r['ot']} {fmt(r['importe'])}" for r in d["grafico_cobrado_por_ot"]) + "\n")
L.append("Gráfico 2 · rentabilidad cotizada vs real: " + " · ".join(f"{r['ot']} {r['cotizada']} % vs {r['real']} % ({r['tipo']})" for r in d["grafico_rentabilidad"]) + "\n")
L.append("Gráfico 3 · cobros por semana: " + " · ".join(f"{s['desde']} {fmt(s['importe'])}" for s in d["grafico_cobros_semanales"]) + "\n")
c = d["costos_periodo"]
L.append(f"Costos del período: desperdicio {fmt(c['desperdicio'])} · otros {fmt(c['otros'])} · financiero {fmt(c['financiero'])}.\n")
L.append(f"## 5. Capacidad del {result['capacidad']['desde']} al {result['capacidad']['hasta']}\n")
L.append("| Rubro | Capacidad | Comprometidas | Potenciales | Saldo | Saldo con potenciales |")
L.append("| --- | --- | --- | --- | --- | --- |")
for r in result["capacidad"]["filas"]:
    L.append(f"| {r['rubro']} | {r['capacidad']} | {r['comprometidas']} | {r['potenciales']} | {r['saldo']} | {r['saldo_con_potenciales']} |")
L.append("\nHerrería queda en negativo: Joaquín (único herrero) tiene vacaciones del 26/10 al 13/11.\n")
open(os.path.join(HERE, "RESULTADOS_ESPERADOS.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
print("ok:", len(result["ots"]), "OTs ·", len(result["necesidades"]), "necesidades")
