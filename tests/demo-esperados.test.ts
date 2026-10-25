// Escenario base de la demo: Blerp (lib/core) contra los resultados calculados de forma INDEPENDIENTE por
// docs/demo-auditoria/calculo_independiente.py (Python, lee solo datos/escenario.json). Además: integridad referencial,
// conservación de inventario por lote y suma de horas. Si cambia la semilla, regenerar:
//   npx tsx --tsconfig tsconfig.json docs/demo-auditoria/exportar.mts && python3 docs/demo-auditoria/calculo_independiente.py
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDemoWorld } from "@/lib/core/seed";
import { quoteTotals } from "@/lib/core/quote";
import { economics } from "@/lib/core/economics";
import { needRows } from "@/lib/core/needs";
import { capacityRows } from "@/lib/core/capacity";
import { collectedByProject, collectionSeries, costIndicators, dashboardCards, marginComparison, periodFor } from "@/lib/core/dashboard";
import { lotBalances } from "@/lib/core/stock";
import { addDays, sumBy } from "@/lib/core/util";

const w = buildDemoWorld();
const exp = JSON.parse(readFileSync("docs/demo-auditoria/datos/esperados.json", "utf8"));
const today = w.config.asOf;
const short = (id: string) => w.projects.find((p) => p.id === id)!.ot.split("_")[0];
const close = (a: number | null, b: number | null) => (a === null || b === null ? expect(a).toBe(b) : expect(a).toBeCloseTo(b, 2));

describe("el fixture exportado es el escenario base", () => {
  it("datos/escenario.json coincide con la semilla", () => {
    const json = JSON.parse(readFileSync("docs/demo-auditoria/datos/escenario.json", "utf8"));
    expect(json).toEqual(JSON.parse(JSON.stringify(w)));
  });
  it("es determinista y usa la fecha simulada fija", () => {
    expect(JSON.stringify(buildDemoWorld())).toBe(JSON.stringify(w));
    expect(today).toBe("2026-10-20");
    expect(exp.asOf).toBe(today);
  });
});

describe("cotización (independiente)", () => {
  for (const p of w.projects) {
    it(`${short(p.id)}: precio sugerido, costo cotizado y rentabilidad`, () => {
      const e = exp.ots[short(p.id)].cotizacion;
      const q = p.baseline ? { ...p.quote, lines: p.baseline.lines, staffLines: p.baseline.staffLines } : p.quote;
      const t = quoteTotals(q, p, w.config.financialMonthlyRatePct);
      close(t.materials, e.materiales);
      close(t.labor, e.mano_obra);
      close(t.staff, e.personal);
      close(t.general, e.generales);
      close(t.financial.total, e.cf_previsto);
      expect(t.suggestedPrice).toBe(e.precio_sugerido);
      close(t.agreedPrice, e.precio_acordado);
      close(t.totalCost, e.costo_total);
      close(t.quotedMarginPct, e.rentabilidad_cotizada);
      if (p.baseline) {
        close(p.baseline.agreedPrice, e.precio_acordado);
        close(p.baseline.costs.financial, e.cf_previsto);
      }
    });
  }
});

describe("economía de cada OT a la fecha de la demo (independiente)", () => {
  for (const p of w.projects.filter((x) => x.baseline)) {
    it(`${short(p.id)}: costos reales, costo financiero y rentabilidad`, () => {
      const e = exp.ots[short(p.id)].economia;
      const r = economics(w, p, today);
      close(r.contract, e.contrato);
      close(r.collected, e.cobrado);
      close(r.materials, e.materiales);
      close(r.materialsWaste, e.desperdicio);
      close(r.labor, e.mano_obra);
      close(r.laborHours, e.horas_obreros);
      close(r.staff, e.personal);
      close(r.other, e.otros);
      close(r.operatingCost, e.costo_operativo);
      close(r.financialUpdated, e.cf_actualizado);
      close(r.financialBudgetToDate, e.cf_previsto_a_la_fecha);
      close(r.financialAdditional, e.cf_adicional);
      close(r.realCost, e.costo_real);
      close(r.profit, e.ganancia);
      close(r.marginPct, e.rentabilidad);
    });
  }
});

describe("Por comprar (independiente)", () => {
  it("cada OT y material: demanda, usado, asignado, en producción, pedido, faltante y por registrar", () => {
    const rows = needRows(w).map((n) => ({ ot: short(n.projectId), material: w.materials.find((m) => m.id === n.materialId)!.name, n }));
    expect(rows.length).toBe(exp.necesidades.length);
    for (const e of exp.necesidades) {
      const r = rows.find((x) => x.ot === e.ot && x.material === e.material);
      expect(r, `${e.ot} ${e.material}`).toBeTruthy();
      close(r!.n.demand, e.demanda);
      close(r!.n.used, e.usado);
      close(r!.n.assigned, e.asignado);
      close(r!.n.inProduction, e.en_produccion);
      close(r!.n.pendingReceipt, e.pedido_sin_recibir);
      close(r!.n.uncovered, e.faltante);
      close(r!.n.toRegister, e.por_registrar);
    }
  });
});

describe("Dashboard de Gerencia, últimos 90 días (independiente)", () => {
  const period = periodFor("last90", today);
  const d = exp.dashboard;
  it("el período es el mismo", () => {
    expect(period).toEqual({ from: d.periodo.desde, to: d.periodo.hasta });
  });
  it("las cuatro tarjetas", () => {
    const c = dashboardCards(w, period, today);
    close(c.collected, d.tarjetas.dinero_cobrado);
    close(c.pending, d.tarjetas.pendiente_de_cobrar);
    close(c.margin.marginPct, d.tarjetas.rentabilidad_total);
    close(c.sales, d.tarjetas.ventas_contratadas);
  });
  it("gráfico 1: cobrado por OT, ordenado", () => {
    expect(collectedByProject(w, period).map((r) => ({ ot: short(r.projectId), importe: r.amount }))).toEqual(d.grafico_cobrado_por_ot);
  });
  it("gráfico 2: rentabilidad cotizada vs real (parcial o final)", () => {
    const got = marginComparison(w, period, today).map((r) => ({ ot: short(r.projectId), cotizada: r.quoted, real: r.real, tipo: r.stage === "final" ? "final" : "parcial" }));
    expect(got.length).toBe(d.grafico_rentabilidad.length);
    for (const e of d.grafico_rentabilidad) {
      const g = got.find((x) => x.ot === e.ot)!;
      close(g.cotizada, e.cotizada);
      close(g.real, e.real);
      expect(g.tipo).toBe(e.tipo);
    }
  });
  it("gráfico 3: cobros por semana", () => {
    const s = collectionSeries(w, period);
    expect(s.unit).toBe("week");
    expect(s.buckets.map((b) => ({ desde: b.from, hasta: b.to, importe: b.amount }))).toEqual(d.grafico_cobros_semanales);
  });
  it("costos del período", () => {
    const c = costIndicators(w, period, today);
    close(c.waste, d.costos_periodo.desperdicio);
    close(c.other, d.costos_periodo.otros);
    close(c.financial, d.costos_periodo.financiero);
  });
});

describe("capacidad (independiente)", () => {
  it("4 semanas desde la fecha de la demo", () => {
    const rows = capacityRows(w, today, addDays(today, 27), today);
    for (const e of exp.capacidad.filas) {
      const r = rows.find((x) => w.rubros.find((rb) => rb.id === x.rubroId)!.name === e.rubro)!;
      close(r.capacity, e.capacidad);
      close(r.committed, e.comprometidas);
      close(r.potential, e.potenciales);
      close(r.balance, e.saldo);
    }
  });
});

describe("integridad del escenario", () => {
  it("todas las referencias apuntan a registros que existen", () => {
    const ids = (xs: Array<{ id: string }>) => new Set(xs.map((x) => x.id));
    const P = ids(w.projects);
    const M = ids(w.materials);
    const E = ids(w.employees);
    const R = ids(w.rubros);
    const L = ids(w.lots);
    const items = new Set(w.projects.flatMap((p) => p.items.map((i) => `${p.id}|${i.id}`)));
    for (const p of w.projects) {
      expect(w.clients.some((c) => c.id === p.clientId)).toBe(true);
      for (const l of [...p.quote.lines, ...(p.baseline?.lines ?? [])]) {
        expect(items.has(`${p.id}|${l.itemId}`)).toBe(true);
        expect(R.has(l.rubroId)).toBe(true);
        if (l.kind === "material") expect(M.has(l.materialId!)).toBe(true);
      }
    }
    for (const b of w.boms) for (const l of b.lines) expect(items.has(`${b.projectId}|${l.itemId}`) && M.has(l.materialId) && R.has(l.rubroId)).toBe(true);
    for (const o of w.orders) {
      expect(w.suppliers.some((s) => s.id === o.supplierId)).toBe(true);
      for (const l of o.lines) {
        expect(M.has(l.materialId)).toBe(true);
        if (l.projectId) expect(P.has(l.projectId)).toBe(true);
      }
    }
    for (const r of w.receipts) expect(L.has(r.lotId) && w.orders.some((o) => o.id === r.orderId && o.lines.some((l) => l.id === r.lineId))).toBe(true);
    for (const m of w.movements) expect(L.has(m.lotId)).toBe(true);
    for (const r of w.releases) expect(items.has(`${r.projectId}|${r.itemId}`) && M.has(r.materialId)).toBe(true);
    for (const r of w.renditions) expect(w.releases.some((x) => x.id === r.releaseId)).toBe(true);
    for (const t of w.timeEntries) {
      expect(E.has(t.employeeId)).toBe(true);
      if (t.projectId) expect(P.has(t.projectId)).toBe(true);
      if (t.itemId) expect(items.has(`${t.projectId}|${t.itemId}`)).toBe(true);
    }
    for (const a of w.assignments) expect(E.has(a.employeeId) && items.has(`${a.projectId}|${a.itemId}`)).toBe(true);
    for (const x of [...w.incomes, ...w.otherCosts, ...w.handovers, ...w.contractRevisions]) expect(P.has(x.projectId)).toBe(true);
  });

  it("la OT pública no se repite y el correlativo sigue al último usado", () => {
    expect(new Set(w.projects.map((p) => p.ot)).size).toBe(w.projects.length);
    expect(Math.max(...w.projects.map((p) => p.otNumber))).toBe(w.config.ot.lastNumber);
  });

  it("conservación de inventario: ningún lote queda negativo en ninguna fecha y cada lote suma lo que entró", () => {
    const dates = [...new Set(w.movements.map((m) => m.date))].sort();
    for (const d of dates) for (const [, places] of lotBalances(w, d)) for (const [place, q] of places) if (place !== "supplier") expect(q).toBeGreaterThanOrEqual(-1e-6);
    for (const [, places] of lotBalances(w)) expect(sumBy([...places.values()], (q) => q)).toBeCloseTo(0, 6);
  });

  it("cada entrega a producción: liberado = consumido + desperdicio + devuelto + sigue en producción", () => {
    const bal = lotBalances(w);
    for (const r of w.releases) {
      const rd = w.renditions.filter((x) => x.releaseId === r.id);
      const inProd = sumBy([...bal.values()], (b) => b.get(`prod:${r.id}`) ?? 0);
      expect(sumBy(rd, (x) => x.consumed + x.waste + x.returned) + inProd).toBeCloseTo(r.quantity, 6);
    }
  });

  it("horas: ningún día supera 24 h y el total por OT es la suma de sus registros", () => {
    const byDay = new Map<string, number>();
    for (const t of w.timeEntries) byDay.set(`${t.employeeId}|${t.date}`, (byDay.get(`${t.employeeId}|${t.date}`) ?? 0) + t.hours);
    for (const h of byDay.values()) expect(h).toBeLessThanOrEqual(24);
    for (const p of w.projects.filter((x) => x.baseline)) {
      const e = economics(w, p, today);
      expect(e.laborHours + e.staffHours).toBeCloseTo(sumBy(w.timeEntries.filter((t) => t.projectId === p.id), (t) => t.hours), 6);
    }
  });
});
