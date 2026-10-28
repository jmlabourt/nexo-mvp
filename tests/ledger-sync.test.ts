// Cómo se guardan en la base los registros de la empresa: el cambio entre dos ledgers (función pura) y el guardado
// desde el store de una empresa real (con la base simulada). Las reglas de la base se prueban en tests/db/ledger.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ledger } from "@/types";
import { EMPTY_LEDGER, registerSalesInvoice, applyAdvance, registerCollection, addGeneralCost, removeGeneralCost, setFinancialRate, setPaymentTerms, startBomDraft, saveBomDraft, publishBom } from "@/lib/ledger";
import { ledgerDelta } from "@/lib/supabase/ledger";
import { demoWorkspace, useAppStore } from "@/store/use-app-store";

const commitLedger = vi.fn(async (..._args: unknown[]) => undefined);
const loadLedger = vi.fn(async (..._args: unknown[]): Promise<Ledger | null> => null);
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/supabase/ledger", async (original) => ({
  ...(await original<typeof import("@/lib/supabase/ledger")>()),
  commitLedger: (...a: unknown[]) => commitLedger(...a),
  loadLedger: (...a: unknown[]) => loadLedger(...a),
}));

const ws = demoWorkspace();
const project = ws.projects.find((p) => p.status === "production" && p.items.length > 0)!;
const ctx = { actor: "Laura", now: "2026-10-28T12:00:00.000Z" };

describe("ledgerDelta: solo lo que cambió", () => {
  it("sin cambios no hay nada que guardar", () => {
    expect(ledgerDelta(EMPTY_LEDGER, EMPTY_LEDGER)).toBeNull();
    const l = registerSalesInvoice(EMPTY_LEDGER, project, { number: "A-1", date: "2026-10-01", amount: 100 }, ctx);
    expect(ledgerDelta(l, { ...l })).toBeNull();
  });
  it("una factura nueva viaja sola; lo anterior no se reenvía", () => {
    const a = registerSalesInvoice(EMPTY_LEDGER, project, { number: "A-1", date: "2026-10-01", amount: 100 }, ctx);
    const b = registerSalesInvoice(a, project, { number: "A-2", date: "2026-10-02", amount: 50 }, ctx);
    const d = ledgerDelta(a, b)!;
    expect(Object.keys(d)).toEqual(["salesInvoices"]);
    expect(d.salesInvoices?.upsert).toHaveLength(1);
    expect(d.salesInvoices?.upsert[0]).toMatchObject({ number: "A-2" });
  });
  it("aplicar un anticipo manda solo ese cobro", () => {
    let l = registerSalesInvoice(EMPTY_LEDGER, project, { number: "A-1", date: "2026-10-01", amount: 100 }, ctx);
    l = registerCollection(l, project, { date: "2026-10-02", amount: 30 }, ctx);
    const applied = applyAdvance(l, l.collections[0].id, l.salesInvoices[0].id);
    const d = ledgerDelta(l, applied)!;
    expect(Object.keys(d)).toEqual(["collections"]);
    expect(d.collections?.upsert).toMatchObject([{ id: l.collections[0].id, invoiceId: l.salesInvoices[0].id }]);
  });
  it("solo los borradores de BOM y los costos generales se pueden quitar", () => {
    const withCost = addGeneralCost(EMPTY_LEDGER, "Alquiler", 100);
    const removed = removeGeneralCost(withCost, withCost.generalCosts[0].id);
    expect(ledgerDelta(withCost, removed)).toEqual({ generalCosts: { upsert: [], remove: [withCost.generalCosts[0].id] } });
    const inv = registerSalesInvoice(EMPTY_LEDGER, project, { number: "A-1", date: "2026-10-01", amount: 100 }, ctx);
    // Aunque una operación sacara una factura, el historial no se elimina: no se manda como baja.
    expect(ledgerDelta(inv, EMPTY_LEDGER)).toBeNull();
  });
  it("condiciones de pago y tasa financiera", () => {
    const a = setPaymentTerms(EMPTY_LEDGER, { projectId: project.id, daysAfterDelivery: 30, schedule: [{ id: "c1", label: "Seña", amount: 10, date: "2026-11-01" }] });
    const b = setPaymentTerms(a, { projectId: "otro", daysAfterDelivery: 0, schedule: [] });
    expect(ledgerDelta(a, b)).toEqual({ paymentTerms: { upsert: [b.paymentTerms[1]] } });
    expect(ledgerDelta(a, setFinancialRate(a, 7.5))).toEqual({ financialMonthlyRatePct: 7.5 });
  });
  it("BOM: el borrador y su publicación", () => {
    const l0 = startBomDraft(EMPTY_LEDGER, project, project.items[0].id, ctx);
    const draft = l0.boms[0];
    const saved = saveBomDraft(l0, draft.id, [{ id: "l1", material: "Placa", quantity: 2, unit: "u" }]);
    const published = publishBom(saved, draft.id, ctx);
    const d = ledgerDelta(saved, published)!;
    expect(d.boms?.upsert).toMatchObject([{ id: draft.id, status: "published", lines: [{ material: "Placa" }] }]);
    expect(ledgerDelta(EMPTY_LEDGER, l0)?.boms?.upsert).toHaveLength(1);
  });
});

describe("guardado desde el store de una empresa real", () => {
  beforeEach(() => {
    commitLedger.mockClear();
    loadLedger.mockClear();
    useAppStore.setState({
      demoLocal: false,
      ledgerReady: true,
      ledger: EMPTY_LEDGER,
      projects: ws.projects,
      organizationId: "org-1",
      role: "owner",
      isDemo: false,
      currentMode: "gerencia",
      userId: "u1",
      userName: "Laura",
      syncStatus: "idle",
      syncError: null,
    });
  });

  it("registra en memoria con las reglas puras y guarda en la base lo que cambió", async () => {
    const r = useAppStore.getState().recordLedger(["gerencia"], (l, c) => registerSalesInvoice(l, project, { number: "A-9", date: "2026-10-01", amount: 1234 }, c));
    expect(r.ok).toBe(true);
    expect(useAppStore.getState().ledger.salesInvoices).toHaveLength(1);
    await vi.waitFor(() => expect(commitLedger).toHaveBeenCalledTimes(1));
    expect(commitLedger.mock.calls[0][1]).toMatchObject({ salesInvoices: { upsert: [{ number: "A-9", amount: 1234 }] } });
  });

  it("si la regla no se cumple no se cambia nada ni se llama a la base", () => {
    const quote = ws.projects.find((p) => p.status === "quotation")!;
    const r = useAppStore.getState().recordLedger(["gerencia"], (l, c) => registerSalesInvoice(l, quote, { number: "A-1", date: "2026-10-01", amount: 10 }, c));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/cotización no se factura/) });
    expect(useAppStore.getState().ledger.salesInvoices).toEqual([]);
    expect(commitLedger).not.toHaveBeenCalled();
  });

  it("respeta la sesión: Administración no registra facturas", () => {
    useAppStore.setState({ currentMode: "administracion" });
    const r = useAppStore.getState().recordLedger(["gerencia"], (l, c) => registerSalesInvoice(l, project, { number: "A-1", date: "2026-10-01", amount: 10 }, c));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/no corresponde a tu sesión/) });
    expect(commitLedger).not.toHaveBeenCalled();
  });

  it("sin la migración en la base no se ofrece guardar: Pendiente de backend", () => {
    useAppStore.setState({ ledgerReady: false });
    const r = useAppStore.getState().recordLedger(["gerencia"], (l, c) => registerSalesInvoice(l, project, { number: "A-1", date: "2026-10-01", amount: 10 }, c));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Pendiente de backend/) });
  });

  it("si la base lo rechaza, queda el aviso para actualizar (no se pierde en silencio)", async () => {
    commitLedger.mockRejectedValueOnce(new Error("Ya hay una factura con ese número."));
    useAppStore.getState().recordLedger(["gerencia"], (l, c) => registerSalesInvoice(l, project, { number: "A-1", date: "2026-10-01", amount: 10 }, c));
    await vi.waitFor(() => expect(useAppStore.getState().syncStatus).toBe("error"));
    expect(useAppStore.getState().syncError).toMatch(/Ya hay una factura con ese número/);
  });

  it("al terminar de guardar toma lo que puso el servidor (costos, fechas, autor)", async () => {
    const server: Ledger = { ...EMPTY_LEDGER, salesInvoices: [{ id: "srv", projectId: project.id, number: "A-9", date: "2026-10-01", amount: 1234, createdBy: "Laura Gómez", createdAt: "2026-10-28T15:00:00Z" }] };
    loadLedger.mockResolvedValueOnce(server);
    useAppStore.getState().recordLedger(["gerencia"], (l, c) => registerSalesInvoice(l, project, { number: "A-9", date: "2026-10-01", amount: 1234 }, c));
    await vi.waitFor(() => expect(useAppStore.getState().ledger.salesInvoices[0]?.id).toBe("srv"));
  });
});
