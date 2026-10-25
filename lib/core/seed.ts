// ─────────────────────────────────────────────────────────────
// Semilla de la demostración (esquema 3): empresa ficticia "Carpintería Lapacho" con 11 OTs nuevas.
// Determinista: la misma secuencia de operaciones con fechas fijas da siempre los mismos registros e ids. La fecha de
// la demo (asOf) es fija; "Restaurar demo" vuelve exactamente a este estado.
//
// Se arma con las MISMAS operaciones que usan las pantallas (lib/core/ops.ts): cada registro pasó las validaciones.
// Nombres, montos y personas son ficticios. Detalle completo: docs/demo-auditoria/DATOS_DEMO_COMPLETOS.md.
// ─────────────────────────────────────────────────────────────
import type { SessionKey } from "@/lib/permissions";
import type { CoreWorld, Employee, ISODate, OpCtx, Project, Quote, QuoteLine } from "./types";
import * as op from "./ops";
import { quoteTotals } from "./quote";
import { rateAt } from "./lookup";
import { addMovement, FREE, SUPPLIER } from "./stock";
import { addDays, eachDay, nextId, weekday } from "./util";

export const DEMO_AS_OF: ISODate = "2026-10-20";

const T = (date: ISODate, hh = 12) => `${date}T${String(hh).padStart(2, "0")}:00:00.000Z`;

function baseWorld(): CoreWorld {
  const created = T("2026-01-02");
  const rubros = [
    { id: "rb-carp", name: "Carpintería", active: true },
    { id: "rb-herr", name: "Herrería", active: true },
    { id: "rb-pint", name: "Pintura y lustre", active: true },
    { id: "rb-tapi", name: "Tapicería", active: true },
    { id: "rb-mont", name: "Armado y montaje", active: true },
  ];
  const materials = [
    { id: "mat-mdf", name: "Placa MDF 18 mm", unit: "placa", rubroId: "rb-carp", referenceCost: 62000, active: true },
    { id: "mat-mel", name: "Melamina blanca 18 mm", unit: "placa", rubroId: "rb-carp", referenceCost: 58000, active: true },
    { id: "mat-fen", name: "Multilaminado fenólico 18 mm", unit: "placa", rubroId: "rb-carp", referenceCost: 95000, active: true },
    { id: "mat-rob", name: "Enchapado roble 18 mm", unit: "placa", rubroId: "rb-carp", referenceCost: 120000, active: true },
    { id: "mat-tap", name: "Tapacanto PVC 22 mm", unit: "m", rubroId: "rb-carp", referenceCost: 900, active: true },
    { id: "mat-bis", name: "Bisagra cazoleta", unit: "unidad", rubroId: "rb-carp", referenceCost: 2600, active: true },
    { id: "mat-cor", name: "Corredera telescópica 45 cm", unit: "par", rubroId: "rb-carp", referenceCost: 11000, active: true },
    { id: "mat-can", name: "Caño estructural 40×40", unit: "barra 6 m", rubroId: "rb-herr", referenceCost: 38000, active: true },
    { id: "mat-pla", name: "Planchuela 1½″ × 3/16″", unit: "barra 6 m", rubroId: "rb-herr", referenceCost: 21000, active: true },
    { id: "mat-pol", name: "Pintura poliuretánica", unit: "litro", rubroId: "rb-pint", referenceCost: 24000, active: true },
    { id: "mat-lac", name: "Laca nitro", unit: "litro", rubroId: "rb-pint", referenceCost: 14000, active: true },
    { id: "mat-esp", name: "Espuma alta densidad 5 cm", unit: "plancha", rubroId: "rb-tapi", referenceCost: 46000, active: true },
    { id: "mat-tel", name: "Tela tapicería antimanchas", unit: "m", rubroId: "rb-tapi", referenceCost: 28000, active: true },
    { id: "mat-tor", name: "Tornillo 4×40 (caja de 100)", unit: "caja", rubroId: "rb-mont", referenceCost: 5500, active: true },
  ];
  const sup = (id: string, name: string, contact: string, links: Array<[string, string]>) => ({
    id,
    name,
    contact,
    phone: undefined,
    email: undefined,
    links: links.map(([label, url]) => ({ label, url })),
    active: true,
    createdAt: created,
  });
  const suppliers = [
    sup("prov-01", "Maderera Río Bermejo", "Ventas mostrador", [["Lista de placas", "https://example.com/rio-bermejo/placas"]]),
    sup("prov-02", "Metalúrgica Cerro Blanco", "Oficina técnica", [["Caños y perfiles", "https://example.com/cerro-blanco/lista"]]),
    sup("prov-03", "Pinturería Arcoíris del Sur", "Atención a talleres", [["Catálogo", "https://example.com/arcoiris/catalogo"]]),
    sup("prov-04", "Textiles Ñandú", "Ventas", [["Telas", "https://example.com/nandu/telas"]]),
    sup("prov-05", "Herrajes Torre Alta", "Mostrador", [["Herrajes", "https://example.com/torre-alta/herrajes"], ["Correderas", "https://example.com/torre-alta/correderas"]]),
  ];
  const cli = (id: string, name: string, contact: string) => ({ id, name, contact, active: true, createdAt: created });
  const clients = [
    cli("cli-01", "Librería El Faro Azul", "Encargada de local"),
    cli("cli-02", "Restó Cardo y Ajo", "Socio gerente"),
    cli("cli-03", "Óptica Visión Clara", "Dueña"),
    cli("cli-04", "Coworking Nodo Sur", "Administración"),
    cli("cli-05", "Café Brújula", "Socio"),
    cli("cli-06", "Estudio Arenal Arquitectura", "Arquitecta a cargo"),
    cli("cli-07", "Clínica Dental Sonrisa Norte", "Dirección"),
    cli("cli-08", "Hotel Puerto Colibrí", "Compras"),
    cli("cli-09", "Escuela de Música Clave de Sol", "Secretaría"),
  ];
  const categories = [
    { id: "cat-ger", name: "Gerente", isWorker: false, active: true },
    { id: "cat-com", name: "Comercial", isWorker: false, active: true },
    { id: "cat-dis", name: "Diseñador", isWorker: false, active: true },
    { id: "cat-adm", name: "Administrativo", isWorker: false, active: true },
    { id: "cat-cpr", name: "Compras", isWorker: false, active: true },
    { id: "cat-jef", name: "Jefe de planta", isWorker: false, active: true },
    { id: "cat-obr", name: "Obrero", isWorker: true, active: true },
  ];
  const L5 = [1, 2, 3, 4, 5];
  const emp = (id: string, name: string, categoryId: string, hireDate: string, sessions: SessionKey[], rubroIds: string[] = [], dailyHours = 8): Employee => ({
    id,
    name,
    categoryId,
    hireDate,
    active: true,
    workDays: L5,
    dailyHours,
    rubroIds,
    sessions,
  });
  const employees = [
    emp("emp-01", "Marina Quiroga", "cat-ger", "2019-03-01", ["gerencia"]),
    emp("emp-02", "Tomás Ferreyra", "cat-com", "2021-02-15", ["administracion"]),
    emp("emp-03", "Lucía Benítez", "cat-dis", "2022-05-02", ["administracion"]),
    emp("emp-04", "Paula Sosa", "cat-cpr", "2020-08-10", ["compras"]),
    emp("emp-05", "Raúl Medina", "cat-jef", "2018-11-05", ["jefe_planta"]),
    emp("emp-06", "Diego Paz", "cat-obr", "2020-01-06", ["operario"], ["rb-carp"]),
    emp("emp-07", "Camila Rivas", "cat-obr", "2021-04-12", ["operario"], ["rb-carp", "rb-pint"]),
    emp("emp-08", "Joaquín Ledesma", "cat-obr", "2019-09-02", ["operario"], ["rb-herr"]),
    emp("emp-09", "Sofía Arce", "cat-obr", "2023-03-06", ["operario"], ["rb-pint"]),
    emp("emp-10", "Matías Godoy", "cat-obr", "2022-07-18", ["operario"], ["rb-tapi"]),
    emp("emp-11", "Iván Correa", "cat-obr", "2024-02-05", ["operario"], ["rb-carp", "rb-mont"]),
  ];
  const r = (id: string, kind: CoreWorld["rates"][number]["kind"], subjectId: string, value: number, validFrom = "2026-01-01") => ({
    id,
    kind,
    subjectId,
    value,
    validFrom,
    createdBy: "Marina Quiroga",
    createdAt: validFrom === "2026-01-01" ? created : T(addDays(validFrom, -5)),
  });
  const rates = [
    r("tar-001", "employee_cost", "emp-01", 18000),
    r("tar-002", "employee_cost", "emp-02", 11000),
    r("tar-003", "employee_cost", "emp-03", 12000),
    r("tar-004", "employee_cost", "emp-04", 10000),
    r("tar-005", "employee_cost", "emp-05", 13000),
    r("tar-006", "employee_cost", "emp-06", 8000),
    r("tar-007", "employee_cost", "emp-07", 8500),
    r("tar-008", "employee_cost", "emp-08", 9000),
    r("tar-009", "employee_cost", "emp-09", 7800),
    r("tar-010", "employee_cost", "emp-10", 8200),
    r("tar-011", "employee_cost", "emp-11", 8000),
    r("tar-012", "employee_cost", "emp-06", 8800, "2026-10-01"),
    r("tar-020", "category_cost", "cat-dis", 12000),
    r("tar-021", "category_cost", "cat-adm", 11000),
    r("tar-022", "category_cost", "cat-com", 11000),
    r("tar-030", "rubro_cost", "rb-carp", 8500),
    r("tar-031", "rubro_cost", "rb-herr", 9000),
    r("tar-032", "rubro_cost", "rb-pint", 8000),
    r("tar-033", "rubro_cost", "rb-tapi", 8200),
    r("tar-034", "rubro_cost", "rb-mont", 8000),
    r("tar-040", "overtime_cost", "all", 1.5),
    r("tar-041", "overtime_sale", "all", 1.5),
  ];
  return {
    schema: 3,
    seq: 0,
    config: {
      companyName: "Carpintería Lapacho (empresa ficticia)",
      asOf: DEMO_AS_OF,
      ot: { prefix: "OT", parts: ["number", "client", "description"], lastNumber: 4300 },
      marginMaterialsPct: 30,
      marginLaborPct: 40,
      financialMonthlyRatePct: 4,
      materialFinancingRule: "receipt",
      quoteGeneralCosts: [{ id: "gc-imprevistos", name: "Provisión para imprevistos", mode: "pct", value: 3, active: true }],
      otherCostCategories: [
        { id: "occ-flete", name: "Fletes", active: true },
        { id: "occ-terc", name: "Trabajos de terceros", active: true },
        { id: "occ-repo", name: "Reposiciones y reparaciones", active: true },
        { id: "occ-otro", name: "Otros", active: true },
      ],
      categories,
      alerts: { urgentPurchaseDays: 7, dueSoonDays: 14, lowMarginPoints: 5, overcostPct: 10, capacityWeeks: 4, renditionDays: 5, reviewDays: 2 },
    },
    clients,
    suppliers,
    rubros,
    materials,
    employees,
    rates,
    exceptions: [],
    projects: [],
    additionals: [],
    rubroRequests: [],
    boms: [],
    materialRequests: [],
    orders: [],
    receipts: [],
    supplierPayments: [],
    lots: [],
    movements: [],
    releases: [],
    renditions: [],
    plans: [],
    assignments: [],
    timeEntries: [],
    otherCosts: [],
    incomes: [],
    contractRevisions: [],
    handovers: [],
    closures: [],
  };
}

const ACTORS: Record<SessionKey, string> = {
  gerencia: "Marina Quiroga",
  administracion: "Tomás Ferreyra",
  compras: "Paula Sosa",
  jefe_planta: "Raúl Medina",
  operario: "",
};
const ACTOR_IDS: Record<SessionKey, string> = { gerencia: "emp-01", administracion: "emp-02", compras: "emp-04", jefe_planta: "emp-05", operario: "" };

/** Constructor de la historia: aplica operaciones con la fecha de cada evento. */
class Story {
  w: CoreWorld;
  constructor(w: CoreWorld) {
    this.w = w;
  }
  ctx(session: SessionKey, date: ISODate, actorId?: string): OpCtx {
    const id = actorId ?? ACTOR_IDS[session];
    const name = this.w.employees.find((e) => e.id === id)?.name ?? ACTORS[session];
    return { session, actor: name, actorId: id, now: T(date), today: date };
  }
  p(id: string): Project {
    const p = this.w.projects.find((x) => x.id === id);
    if (!p) throw new Error(`seed: falta ${id}`);
    return p;
  }
  item(pid: string, index: number): string {
    return this.p(pid).items[index].id;
  }
}

interface LineSpec {
  item: number;
  rubro: string;
  material?: string;
  qty: number;
  /** Solo si difiere del costo de referencia o del costo por hora del rubro. */
  cost?: number;
}

interface ProjectSpec {
  client: string;
  description: string;
  created: ISODate;
  start: ISODate;
  due: ISODate;
  items: Array<[string, number]>;
  lines: LineSpec[];
  staff: Array<[string, number]>;
  plan: Array<[string, number, ISODate]>;
  discount?: number;
  /** El precio de lista se redondea a la decena de mil más cercana del sugerido. */
  roundList?: boolean;
}

function quoteFor(s: Story, pid: string, spec: ProjectSpec): Quote {
  const w = s.w;
  const p = s.p(pid);
  let n = 0;
  const lines: QuoteLine[] = spec.lines.map((l) => {
    n += 1;
    const id = `${pid}-ql${String(n).padStart(2, "0")}`;
    if (l.material) {
      const m = w.materials.find((x) => x.id === l.material)!;
      return { id, itemId: p.items[l.item].id, rubroId: l.rubro, kind: "material", materialId: m.id, quantity: l.qty, unit: m.unit, unitCost: l.cost ?? m.referenceCost };
    }
    return { id, itemId: p.items[l.item].id, rubroId: l.rubro, kind: "labor", quantity: l.qty, unit: "h", unitCost: l.cost ?? (rateAt(w, "rubro_cost", l.rubro, spec.created) as number) };
  });
  const staffLines = spec.staff.map(([cat, hours], i) => ({ id: `${pid}-st${i + 1}`, categoryId: cat, hours, hourlyCost: rateAt(w, "category_cost", cat, spec.created) as number }));
  const plan = spec.plan.map(([label, pct, date], i) => ({ id: `${pid}-pl${i + 1}`, label, pct, date }));
  const q: Quote = { ...p.quote, lines, staffLines, plan, discount: spec.discount ?? 0 };
  if (spec.roundList !== false) {
    const t = quoteTotals(q, { startDate: spec.start, dueDate: spec.due }, w.config.financialMonthlyRatePct);
    q.listPriceOverride = Math.round(t.suggestedPrice / 10000) * 10000;
  }
  return q;
}

function createQuoted(s: Story, spec: ProjectSpec): string {
  const [pid, w1] = op.createProject(s.w, { clientId: spec.client, description: spec.description, startDate: spec.start, dueDate: spec.due, items: spec.items.map(([name, quantity]) => ({ name, quantity })) }, s.ctx("administracion", spec.created));
  s.w = w1;
  const q = quoteFor(s, pid, spec);
  s.w = op.saveQuote(s.w, pid, { quote: q, items: s.p(pid).items }, s.ctx("administracion", spec.created));
  return pid;
}

/** Bloque de trabajo de un operario: registros diarios en sus días laborables (revisados si `review`). */
function work(s: Story, e: string, pid: string, item: number, rubro: string, from: ISODate, to: ISODate, hours: number, review = true) {
  for (const d of eachDay(from, to).filter((x) => weekday(x) >= 1 && weekday(x) <= 5)) addHours(s, e, d, [{ projectId: pid, itemId: s.item(pid, item), rubroId: rubro, hours }], review);
}

/** Agrega horas a un día (suma a lo ya cargado ese día por la misma persona). */
function addHours(s: Story, e: string, date: ISODate, rows: Array<{ projectId?: string; itemId?: string; rubroId?: string; hours: number; note?: string }>, review = true) {
  type Row = { projectId?: string; itemId?: string; rubroId?: string; hours: number; note?: string };
  const merged: Row[] = s.w.timeEntries.filter((t) => t.employeeId === e && t.date === date).map((t) => ({ projectId: t.projectId, itemId: t.itemId, rubroId: t.rubroId, hours: t.hours, note: t.note }));
  for (const r of rows) {
    const same = merged.find((x) => x.projectId === r.projectId && x.itemId === r.itemId && x.rubroId === r.rubroId);
    if (same) same.hours += r.hours;
    else merged.push({ ...r });
  }
  // Para volver a guardar el día, los registros previos se cargan como si todavía no estuvieran revisados.
  s.w = { ...s.w, timeEntries: s.w.timeEntries.map((t) => (t.employeeId === e && t.date === date ? { ...t, review: undefined } : t)) };
  s.w = op.saveDayHours(s.w, { employeeId: e, date, rows: merged }, { ...s.ctx("operario", date), actorId: e, actor: s.w.employees.find((x) => x.id === e)!.name, session: "operario" });
  if (review) s.w = op.confirmDay(s.w, e, date, s.ctx("jefe_planta", addDays(date, weekday(date) === 5 ? 3 : 1)));
}

function staffHours(s: Story, e: string, session: SessionKey, date: ISODate, rows: Array<{ projectId?: string; hours: number; note?: string }>) {
  s.w = op.saveDayHours(s.w, { employeeId: e, date, rows }, s.ctx(session, date, e));
}

/** Compra con OC, recepción y (opcional) pago. Devuelve los ids de las líneas en orden. */
function buy(
  s: Story,
  supplierId: string,
  date: ISODate,
  expected: ISODate | undefined,
  lines: Array<{ projectId?: string; item?: number; rubro?: string; material: string; qty: number; price: number }>,
): { orderId: string; lineIds: string[] } {
  const [oid, w1] = op.registerOrder(
    s.w,
    {
      supplierId,
      date,
      expectedDate: expected,
      lines: lines.map((l) => ({ projectId: l.projectId, itemId: l.projectId && l.item !== undefined ? s.item(l.projectId, l.item) : undefined, rubroId: l.rubro, materialId: l.material, quantity: l.qty, unitPrice: l.price })),
    },
    s.ctx("compras", date),
  );
  s.w = w1;
  return { orderId: oid, lineIds: s.w.orders.find((o) => o.id === oid)!.lines.map((l) => l.id) };
}

function receive(s: Story, orderId: string, date: ISODate, lines: Array<[string, number]>) {
  s.w = op.receiveMaterials(s.w, orderId, { date, lines: lines.map(([lineId, quantity]) => ({ lineId, quantity })) }, s.ctx("compras", date));
}

function release(s: Story, pid: string, item: number, rubro: string, material: string, qty: number, date: ISODate): string {
  const [id, w1] = op.releaseMaterial(s.w, { projectId: pid, itemId: s.item(pid, item), rubroId: rubro, materialId: material, quantity: qty }, s.ctx("jefe_planta", date));
  s.w = w1;
  return id;
}

function render(s: Story, releaseId: string, date: ISODate, consumed: number, waste: number, returned: number) {
  s.w = op.renderRelease(s.w, { releaseId, consumed, waste, returned, date }, s.ctx("jefe_planta", date));
}

function units(s: Story, pid: string, item: number, n: number, date: ISODate) {
  s.w = op.setCompletedUnits(s.w, pid, s.item(pid, item), n, s.ctx("jefe_planta", date));
}

function income(s: Story, pid: string, date: ISODate, amount: number, reference: string) {
  s.w = op.registerIncome(s.w, { projectId: pid, date, amount, reference }, s.ctx("gerencia", date));
}

const scheduleAmount = (s: Story, pid: string, index: number) => s.p(pid).schedule[index].amount;

function pay(s: Story, orderId: string, date: ISODate, amount: number, reference: string, projectId?: string) {
  s.w = op.registerSupplierPayment(s.w, { orderId, date, amount, reference, projectId }, s.ctx("gerencia", date));
}

const orderValue = (s: Story, orderId: string) => s.w.orders.find((o) => o.id === orderId)!.lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0);

export function buildDemoWorld(): CoreWorld {
  const s = new Story(baseWorld());

  // ── Inventario inicial (1/6): material que la empresa ya tenía, sin OT ──
  const opening: Array<[string, number, number]> = [
    ["mat-mel", 5, 54000],
    ["mat-tor", 20, 5000],
    ["mat-lac", 6, 13000],
    ["mat-tap", 200, 850],
    ["mat-bis", 40, 2400],
  ];
  for (const [materialId, quantity, unitCost] of opening) {
    const [lotId, w1] = nextId(s.w, "lote");
    s.w = { ...w1, lots: [...w1.lots, { id: lotId, materialId, unitCost, date: "2026-06-01", source: "opening" }] };
    s.w = addMovement(s.w, { lotId, quantity, from: SUPPLIER, to: FREE, kind: "opening", date: "2026-06-01", ref: "inventario-inicial" }, { actor: "Paula Sosa", now: T("2026-06-01") });
  }

  const C = "rb-carp";
  const H = "rb-herr";
  const P = "rb-pint";
  const TA = "rb-tapi";
  const M = "rb-mont";

  // ═════ OT4301 · Librería El Faro Azul · cerrada y cobrada ═════
  const p1 = createQuoted(s, {
    client: "cli-01",
    description: "Estanterías salón principal",
    created: "2026-06-01",
    start: "2026-06-15",
    due: "2026-07-31",
    items: [["Estantería alta", 4], ["Mesa de exhibición", 2]],
    lines: [
      { item: 0, rubro: C, material: "mat-mdf", qty: 10 },
      { item: 0, rubro: C, material: "mat-tap", qty: 80 },
      { item: 0, rubro: C, qty: 64 },
      { item: 0, rubro: P, material: "mat-lac", qty: 8 },
      { item: 0, rubro: P, qty: 16 },
      { item: 1, rubro: C, material: "mat-rob", qty: 3 },
      { item: 1, rubro: C, qty: 24 },
      { item: 1, rubro: H, material: "mat-can", qty: 2 },
      { item: 1, rubro: H, qty: 10 },
      { item: 1, rubro: P, material: "mat-lac", qty: 2 },
      { item: 1, rubro: P, qty: 6 },
    ],
    staff: [["cat-dis", 10], ["cat-adm", 6]],
    plan: [["Seña", 50, "2026-06-10"], ["Saldo", 50, "2026-08-07"]],
  });
  s.w = op.setQuoteState(s.w, p1, "sent", s.ctx("administracion", "2026-06-02"));
  s.w = op.approveQuote(s.w, p1, s.ctx("administracion", "2026-06-08"));
  s.w = op.saveBomDraft(s.w, p1, null, s.ctx("administracion", "2026-06-09"));
  s.w = op.publishBom(s.w, p1, s.ctx("administracion", "2026-06-09"));
  income(s, p1, "2026-06-09", scheduleAmount(s, p1, 0), "Seña transferencia");
  staffHours(s, "emp-03", "administracion", "2026-06-03", [{ projectId: p1, hours: 6, note: "Planos estanterías" }, { hours: 2, note: "Orden de archivo" }]);
  staffHours(s, "emp-03", "administracion", "2026-06-04", [{ projectId: p1, hours: 5, note: "Planos y despiece" }]);
  staffHours(s, "emp-02", "administracion", "2026-06-05", [{ projectId: p1, hours: 3, note: "Presupuesto y visita" }]);
  {
    const o1 = buy(s, "prov-01", "2026-06-10", "2026-06-15", [
      { projectId: p1, item: 0, rubro: C, material: "mat-mdf", qty: 12, price: 61000 },
      { projectId: p1, item: 1, rubro: C, material: "mat-rob", qty: 3, price: 118000 },
    ]);
    const o2 = buy(s, "prov-02", "2026-06-10", "2026-06-17", [{ projectId: p1, item: 1, rubro: H, material: "mat-can", qty: 2, price: 37500 }]);
    const o3 = buy(s, "prov-03", "2026-06-11", "2026-06-15", [{ projectId: p1, item: 0, rubro: P, material: "mat-lac", qty: 6, price: 14200 }]);
    receive(s, o1.orderId, "2026-06-15", [[o1.lineIds[0], 12], [o1.lineIds[1], 3]]);
    receive(s, o2.orderId, "2026-06-17", [[o2.lineIds[0], 2]]);
    receive(s, o3.orderId, "2026-06-15", [[o3.lineIds[0], 6]]);
    pay(s, o1.orderId, "2026-06-30", orderValue(s, o1.orderId), "Transferencia 30/6");
    pay(s, o2.orderId, "2026-06-30", orderValue(s, o2.orderId), "Transferencia 30/6");
    pay(s, o3.orderId, "2026-07-10", orderValue(s, o3.orderId), "Cheque");
    // Tapacanto y 4 litros de laca salen del stock inicial.
    s.w = op.assignStock(s.w, { materialId: "mat-tap", projectId: p1, quantity: 80 }, s.ctx("compras", "2026-06-15"));
    s.w = op.assignStock(s.w, { materialId: "mat-lac", projectId: p1, quantity: 4 }, s.ctx("compras", "2026-06-15"));
  }
  {
    const r1 = release(s, p1, 0, C, "mat-mdf", 12, "2026-06-15");
    const r2 = release(s, p1, 0, C, "mat-tap", 80, "2026-06-15");
    render(s, r2, "2026-06-26", 74, 6, 0);
    render(s, r1, "2026-06-26", 9.5, 0.5, 2);
    const r3 = release(s, p1, 1, C, "mat-rob", 3, "2026-06-29");
    render(s, r3, "2026-07-03", 2.75, 0.25, 0);
    const r4 = release(s, p1, 1, H, "mat-can", 2, "2026-06-29");
    render(s, r4, "2026-07-01", 1.8, 0.2, 0);
    const r5 = release(s, p1, 0, P, "mat-lac", 10, "2026-07-06");
    render(s, r5, "2026-07-09", 9, 0.5, 0.5);
  }
  work(s, "emp-06", p1, 0, C, "2026-06-15", "2026-06-26", 7);
  work(s, "emp-06", p1, 1, C, "2026-06-29", "2026-07-03", 5);
  work(s, "emp-08", p1, 1, H, "2026-06-29", "2026-07-01", 4);
  work(s, "emp-09", p1, 0, P, "2026-07-06", "2026-07-08", 6);
  work(s, "emp-09", p1, 1, P, "2026-07-09", "2026-07-09", 6);
  units(s, p1, 0, 4, "2026-07-08");
  units(s, p1, 1, 2, "2026-07-09");
  s.w = op.registerHandover(s.w, p1, { date: "2026-07-28", note: "Entregado e instalado en el local" }, s.ctx("jefe_planta", "2026-07-28"));
  income(s, p1, "2026-08-05", scheduleAmount(s, p1, 1), "Saldo transferencia");
  s.w = op.closeProject(s.w, p1, s.ctx("gerencia", "2026-08-10"));

  // ═════ OT4302 · Restó Cardo y Ajo · cerrada con saldo pendiente (cliente moroso) ═════
  const p2 = createQuoted(s, {
    client: "cli-02",
    description: "Barra y banquetas",
    created: "2026-06-22",
    start: "2026-07-06",
    due: "2026-08-28",
    items: [["Barra", 1], ["Banqueta", 8]],
    lines: [
      { item: 0, rubro: C, material: "mat-mdf", qty: 6 },
      { item: 0, rubro: C, material: "mat-fen", qty: 2 },
      { item: 0, rubro: C, qty: 40 },
      { item: 0, rubro: H, material: "mat-can", qty: 4 },
      { item: 0, rubro: H, material: "mat-pla", qty: 2 },
      { item: 0, rubro: H, qty: 24 },
      { item: 0, rubro: P, material: "mat-pol", qty: 6 },
      { item: 0, rubro: P, qty: 12 },
      { item: 1, rubro: H, material: "mat-can", qty: 6 },
      { item: 1, rubro: H, qty: 32 },
      { item: 1, rubro: TA, material: "mat-esp", qty: 2 },
      { item: 1, rubro: TA, material: "mat-tel", qty: 6 },
      { item: 1, rubro: TA, qty: 16 },
      { item: 1, rubro: P, material: "mat-pol", qty: 4 },
      { item: 1, rubro: P, qty: 8 },
    ],
    staff: [["cat-dis", 8], ["cat-adm", 4]],
    plan: [["Seña", 40, "2026-07-03"], ["Cuota 1", 30, "2026-08-03"], ["Saldo", 30, "2026-09-04"]],
  });
  s.w = op.setQuoteState(s.w, p2, "sent", s.ctx("administracion", "2026-06-23"));
  s.w = op.setQuoteState(s.w, p2, "negotiating", s.ctx("administracion", "2026-06-26"));
  s.w = op.approveQuote(s.w, p2, s.ctx("administracion", "2026-07-01"));
  s.w = op.saveBomDraft(s.w, p2, null, s.ctx("administracion", "2026-07-02"));
  s.w = op.publishBom(s.w, p2, s.ctx("administracion", "2026-07-02"));
  income(s, p2, "2026-07-03", scheduleAmount(s, p2, 0), "Seña");
  staffHours(s, "emp-03", "administracion", "2026-06-24", [{ projectId: p2, hours: 7, note: "Diseño barra y banquetas" }]);
  {
    const o1 = buy(s, "prov-01", "2026-07-02", "2026-07-06", [
      { projectId: p2, item: 0, rubro: C, material: "mat-mdf", qty: 6, price: 61500 },
      { projectId: p2, item: 0, rubro: C, material: "mat-fen", qty: 2, price: 96000 },
    ]);
    const o2 = buy(s, "prov-02", "2026-07-02", "2026-07-10", [
      { projectId: p2, item: 0, rubro: H, material: "mat-can", qty: 4, price: 38500 },
      { projectId: p2, item: 0, rubro: H, material: "mat-pla", qty: 2, price: 21000 },
      { projectId: p2, item: 1, rubro: H, material: "mat-can", qty: 6, price: 38500 },
    ]);
    const o3 = buy(s, "prov-04", "2026-07-20", "2026-08-05", [
      { projectId: p2, item: 1, rubro: TA, material: "mat-esp", qty: 2, price: 47000 },
      { projectId: p2, item: 1, rubro: TA, material: "mat-tel", qty: 6, price: 27500 },
    ]);
    const o4 = buy(s, "prov-03", "2026-07-20", "2026-08-10", [
      { projectId: p2, item: 0, rubro: P, material: "mat-pol", qty: 6, price: 24500 },
      { projectId: p2, item: 1, rubro: P, material: "mat-pol", qty: 4, price: 24500 },
    ]);
    receive(s, o1.orderId, "2026-07-06", [[o1.lineIds[0], 6], [o1.lineIds[1], 2]]);
    receive(s, o2.orderId, "2026-07-10", [[o2.lineIds[0], 4], [o2.lineIds[1], 2], [o2.lineIds[2], 6]]);
    receive(s, o3.orderId, "2026-08-05", [[o3.lineIds[0], 2], [o3.lineIds[1], 6]]);
    receive(s, o4.orderId, "2026-08-10", [[o4.lineIds[0], 6], [o4.lineIds[1], 4]]);
    pay(s, o1.orderId, "2026-07-20", orderValue(s, o1.orderId), "Transferencia");
    pay(s, o2.orderId, "2026-07-31", orderValue(s, o2.orderId), "Transferencia");
    pay(s, o3.orderId, "2026-08-20", orderValue(s, o3.orderId), "Transferencia");
    pay(s, o4.orderId, "2026-08-31", orderValue(s, o4.orderId), "Cheque");
  }
  {
    const a = release(s, p2, 0, C, "mat-mdf", 6, "2026-07-06");
    render(s, a, "2026-07-15", 5.5, 0.5, 0);
    const b = release(s, p2, 0, C, "mat-fen", 2, "2026-07-06");
    render(s, b, "2026-07-15", 2, 0, 0);
    const c = release(s, p2, 0, H, "mat-can", 4, "2026-07-13");
    render(s, c, "2026-07-22", 3.6, 0.4, 0);
    const d = release(s, p2, 0, H, "mat-pla", 2, "2026-07-13");
    render(s, d, "2026-07-22", 2, 0, 0);
    const e = release(s, p2, 1, H, "mat-can", 6, "2026-07-23");
    render(s, e, "2026-08-05", 5.5, 0.5, 0);
    const f = release(s, p2, 1, TA, "mat-esp", 2, "2026-08-10");
    render(s, f, "2026-08-13", 1.75, 0.25, 0);
    const g = release(s, p2, 1, TA, "mat-tel", 6, "2026-08-10");
    render(s, g, "2026-08-13", 5.5, 0.5, 0);
    const h = release(s, p2, 0, P, "mat-pol", 6, "2026-08-17");
    render(s, h, "2026-08-18", 5.5, 0.5, 0);
    const i = release(s, p2, 1, P, "mat-pol", 4, "2026-08-19");
    render(s, i, "2026-08-20", 4, 0, 0);
  }
  work(s, "emp-11", p2, 0, C, "2026-07-06", "2026-07-15", 5);
  work(s, "emp-08", p2, 0, H, "2026-07-13", "2026-07-22", 4);
  work(s, "emp-08", p2, 1, H, "2026-07-23", "2026-08-05", 6);
  work(s, "emp-10", p2, 1, TA, "2026-08-10", "2026-08-13", 5);
  work(s, "emp-09", p2, 0, P, "2026-08-17", "2026-08-18", 6);
  work(s, "emp-09", p2, 1, P, "2026-08-19", "2026-08-20", 5);
  units(s, p2, 0, 1, "2026-08-18");
  units(s, p2, 1, 8, "2026-08-20");
  income(s, p2, "2026-08-10", scheduleAmount(s, p2, 1), "Cuota 1 (con 7 días de atraso)");
  s.w = op.registerHandover(s.w, p2, { date: "2026-08-27" }, s.ctx("jefe_planta", "2026-08-27"));
  s.w = op.addOtherCost(s.w, { projectId: p2, date: "2026-08-27", description: "Flete de entrega (camioneta alquilada)", categoryId: "occ-flete", amount: 95000 }, s.ctx("gerencia", "2026-08-27"));
  s.w = op.closeProject(s.w, p2, s.ctx("gerencia", "2026-09-04"));

  // ═════ OT4304 · Coworking Nodo Sur · muebles terminados y entregados, material sin rendir (cierre bloqueado) ═════
  const p4 = createQuoted(s, {
    client: "cli-04",
    description: "Escritorios y lockers",
    created: "2026-07-27",
    start: "2026-08-17",
    due: "2026-10-14",
    items: [["Escritorio", 10], ["Locker", 4]],
    lines: [
      { item: 0, rubro: C, material: "mat-mel", qty: 12 },
      { item: 0, rubro: C, material: "mat-tap", qty: 60 },
      { item: 0, rubro: C, qty: 80 },
      { item: 0, rubro: H, material: "mat-can", qty: 8 },
      { item: 0, rubro: H, qty: 40 },
      { item: 0, rubro: P, material: "mat-pol", qty: 5 },
      { item: 0, rubro: P, qty: 20 },
      { item: 0, rubro: M, material: "mat-tor", qty: 4 },
      { item: 0, rubro: M, qty: 16 },
      { item: 1, rubro: C, material: "mat-mel", qty: 8 },
      { item: 1, rubro: C, material: "mat-bis", qty: 16 },
      { item: 1, rubro: C, qty: 40 },
      { item: 1, rubro: P, qty: 8 },
    ],
    staff: [["cat-dis", 8], ["cat-adm", 6]],
    plan: [["Seña", 40, "2026-08-05"], ["Cuota", 40, "2026-09-15"], ["Saldo", 20, "2026-10-21"]],
    discount: 120000,
  });
  s.w = op.setQuoteState(s.w, p4, "sent", s.ctx("administracion", "2026-07-28"));
  s.w = op.approveQuote(s.w, p4, s.ctx("administracion", "2026-08-03"));
  income(s, p4, "2026-08-05", scheduleAmount(s, p4, 0), "Seña");
  s.w = op.saveBomDraft(s.w, p4, null, s.ctx("administracion", "2026-08-06"));
  s.w = op.publishBom(s.w, p4, s.ctx("administracion", "2026-08-06"));
  staffHours(s, "emp-03", "administracion", "2026-07-29", [{ projectId: p4, hours: 8, note: "Diseño escritorios y lockers" }]);
  {
    const o1 = buy(s, "prov-01", "2026-08-07", "2026-08-17", [{ projectId: p4, item: 0, rubro: C, material: "mat-mel", qty: 15, price: 57500 }]);
    const o2 = buy(s, "prov-02", "2026-08-07", "2026-08-14", [{ projectId: p4, item: 0, rubro: H, material: "mat-can", qty: 8, price: 39000 }]);
    const o3 = buy(s, "prov-03", "2026-08-25", "2026-09-10", [{ projectId: p4, item: 0, rubro: P, material: "mat-pol", qty: 5, price: 25000 }]);
    receive(s, o1.orderId, "2026-08-17", [[o1.lineIds[0], 15]]);
    receive(s, o2.orderId, "2026-08-14", [[o2.lineIds[0], 8]]);
    receive(s, o3.orderId, "2026-09-10", [[o3.lineIds[0], 5]]);
    pay(s, o1.orderId, "2026-09-01", orderValue(s, o1.orderId), "Transferencia");
    pay(s, o2.orderId, "2026-08-31", orderValue(s, o2.orderId), "Transferencia");
    s.w = op.assignStock(s.w, { materialId: "mat-mel", projectId: p4, quantity: 5 }, s.ctx("compras", "2026-08-17"));
    s.w = op.assignStock(s.w, { materialId: "mat-tap", projectId: p4, quantity: 60 }, s.ctx("compras", "2026-08-17"));
    s.w = op.assignStock(s.w, { materialId: "mat-bis", projectId: p4, quantity: 16 }, s.ctx("compras", "2026-08-24"));
    s.w = op.assignStock(s.w, { materialId: "mat-tor", projectId: p4, quantity: 6 }, s.ctx("compras", "2026-10-05"));
  }
  {
    const a = release(s, p4, 0, C, "mat-mel", 12, "2026-08-17");
    render(s, a, "2026-09-04", 11, 1, 0);
    const b = release(s, p4, 0, C, "mat-tap", 60, "2026-08-17");
    render(s, b, "2026-09-04", 56, 4, 0);
    const c = release(s, p4, 0, H, "mat-can", 8, "2026-08-17");
    render(s, c, "2026-08-28", 7.5, 0.5, 0);
    const d = release(s, p4, 1, C, "mat-mel", 8, "2026-08-24");
    render(s, d, "2026-09-04", 6, 0.5, 0);
    const e = release(s, p4, 1, C, "mat-bis", 16, "2026-08-24");
    render(s, e, "2026-09-04", 16, 0, 0);
    const f = release(s, p4, 0, P, "mat-pol", 5, "2026-09-14");
    render(s, f, "2026-09-22", 4.5, 0.25, 0.25);
    const g = release(s, p4, 0, M, "mat-tor", 4, "2026-10-05");
    render(s, g, "2026-10-09", 4, 0, 0);
  }
  work(s, "emp-06", p4, 0, C, "2026-08-17", "2026-09-04", 6);
  work(s, "emp-07", p4, 1, C, "2026-08-24", "2026-09-04", 4);
  work(s, "emp-08", p4, 0, H, "2026-08-17", "2026-08-28", 4);
  work(s, "emp-09", p4, 0, P, "2026-09-14", "2026-09-18", 4);
  work(s, "emp-09", p4, 1, P, "2026-09-21", "2026-09-22", 4);
  work(s, "emp-11", p4, 0, M, "2026-10-05", "2026-10-09", 4);
  units(s, p4, 1, 4, "2026-09-22");
  units(s, p4, 0, 10, "2026-10-09");
  income(s, p4, "2026-09-15", scheduleAmount(s, p4, 1), "Cuota");
  s.w = op.registerHandover(s.w, p4, { date: "2026-10-14", note: "Entregado en el edificio" }, s.ctx("jefe_planta", "2026-10-14"));

  // ═════ OT4303 · Óptica Visión Clara · terminada, entregada y rendida: lista para cerrar ═════
  const p3 = createQuoted(s, {
    client: "cli-03",
    description: "Mostradores y exhibidores",
    created: "2026-08-03",
    start: "2026-08-24",
    due: "2026-10-16",
    items: [["Mostrador", 2], ["Exhibidor de pared", 6]],
    lines: [
      { item: 0, rubro: C, material: "mat-mdf", qty: 6 },
      { item: 0, rubro: C, material: "mat-rob", qty: 2 },
      { item: 0, rubro: C, qty: 32 },
      { item: 0, rubro: P, material: "mat-lac", qty: 4 },
      { item: 0, rubro: P, qty: 12 },
      { item: 0, rubro: M, qty: 8 },
      { item: 1, rubro: C, material: "mat-mdf", qty: 6 },
      { item: 1, rubro: C, qty: 42 },
      { item: 1, rubro: P, material: "mat-lac", qty: 3 },
      { item: 1, rubro: P, qty: 18 },
    ],
    staff: [["cat-dis", 12], ["cat-adm", 4]],
    plan: [["Seña", 50, "2026-08-12"], ["Cuota", 25, "2026-09-25"], ["Saldo", 25, "2026-10-30"]],
  });
  s.w = op.setQuoteState(s.w, p3, "sent", s.ctx("administracion", "2026-08-04"));
  s.w = op.approveQuote(s.w, p3, s.ctx("administracion", "2026-08-10"));
  income(s, p3, "2026-08-12", scheduleAmount(s, p3, 0), "Seña");
  s.w = op.saveBomDraft(s.w, p3, null, s.ctx("administracion", "2026-08-12"));
  s.w = op.publishBom(s.w, p3, s.ctx("administracion", "2026-08-12"));
  staffHours(s, "emp-03", "administracion", "2026-08-05", [{ projectId: p3, hours: 7, note: "Diseño mostradores" }]);
  staffHours(s, "emp-03", "administracion", "2026-08-06", [{ projectId: p3, hours: 6, note: "Detalles exhibidores" }]);
  {
    const o1 = buy(s, "prov-01", "2026-08-13", "2026-08-24", [
      { projectId: p3, item: 0, rubro: C, material: "mat-mdf", qty: 6, price: 63000 },
      { projectId: p3, item: 0, rubro: C, material: "mat-rob", qty: 2, price: 121000 },
      { projectId: p3, item: 1, rubro: C, material: "mat-mdf", qty: 8, price: 63000 },
    ]);
    receive(s, o1.orderId, "2026-08-24", [[o1.lineIds[0], 6], [o1.lineIds[1], 2], [o1.lineIds[2], 8]]);
    pay(s, o1.orderId, "2026-09-08", orderValue(s, o1.orderId), "Transferencia");
    s.w = op.assignStock(s.w, { materialId: "mat-lac", projectId: p3, quantity: 2.5 }, s.ctx("compras", "2026-09-21"));
    const o2 = buy(s, "prov-03", "2026-09-14", "2026-09-21", [{ projectId: p3, item: 1, rubro: P, material: "mat-lac", qty: 5, price: 14500 }]);
    receive(s, o2.orderId, "2026-09-21", [[o2.lineIds[0], 5]]);
  }
  {
    const a = release(s, p3, 0, C, "mat-mdf", 6, "2026-08-24");
    render(s, a, "2026-09-04", 5.5, 0.5, 0);
    const b = release(s, p3, 0, C, "mat-rob", 2, "2026-08-24");
    render(s, b, "2026-09-04", 2, 0, 0);
    const c = release(s, p3, 1, C, "mat-mdf", 8, "2026-09-07");
    render(s, c, "2026-09-18", 5.5, 0.5, 2);
    const d = release(s, p3, 1, P, "mat-lac", 3.5, "2026-09-21");
    render(s, d, "2026-09-25", 3.25, 0.25, 0);
    const d2 = release(s, p3, 0, P, "mat-lac", 4, "2026-09-23");
    render(s, d2, "2026-09-25", 3.75, 0.25, 0);
  }
  work(s, "emp-11", p3, 0, C, "2026-08-24", "2026-09-04", 3);
  work(s, "emp-07", p3, 1, C, "2026-09-07", "2026-09-18", 4);
  work(s, "emp-07", p3, 1, P, "2026-09-21", "2026-09-25", 4);
  work(s, "emp-09", p3, 0, P, "2026-09-23", "2026-09-25", 4);
  work(s, "emp-11", p3, 0, M, "2026-10-12", "2026-10-13", 4);
  units(s, p3, 1, 6, "2026-09-25");
  units(s, p3, 0, 2, "2026-10-13");
  income(s, p3, "2026-09-25", scheduleAmount(s, p3, 1), "Cuota");
  s.w = op.registerHandover(s.w, p3, { date: "2026-10-15" }, s.ctx("jefe_planta", "2026-10-15"));

  // ═════ OT4307 · Clínica Dental Sonrisa Norte · atrasada, cuota vencida, rubro adicional ═════
  const p7 = createQuoted(s, {
    client: "cli-07",
    description: "Muebles de recepción",
    created: "2026-08-10",
    start: "2026-08-31",
    due: "2026-10-09",
    items: [["Mostrador de recepción", 1], ["Mueble de guardado", 2], ["Sillón de espera", 3]],
    lines: [
      { item: 0, rubro: C, material: "mat-rob", qty: 3 },
      { item: 0, rubro: C, material: "mat-mdf", qty: 3 },
      { item: 0, rubro: C, qty: 56 },
      { item: 0, rubro: P, material: "mat-lac", qty: 3 },
      { item: 0, rubro: P, qty: 10 },
      { item: 1, rubro: C, material: "mat-mel", qty: 6 },
      { item: 1, rubro: C, material: "mat-cor", qty: 8 },
      { item: 1, rubro: C, qty: 40 },
      { item: 1, rubro: P, qty: 8 },
      { item: 2, rubro: H, material: "mat-can", qty: 3 },
      { item: 2, rubro: H, qty: 18 },
      { item: 2, rubro: P, material: "mat-pol", qty: 2 },
      { item: 2, rubro: P, qty: 6 },
    ],
    staff: [["cat-dis", 10], ["cat-adm", 4]],
    plan: [["Seña", 30, "2026-08-20"], ["Cuota", 40, "2026-09-21"], ["Saldo", 30, "2026-10-30"]],
  });
  s.w = op.setQuoteState(s.w, p7, "sent", s.ctx("administracion", "2026-08-11"));
  s.w = op.approveQuote(s.w, p7, s.ctx("administracion", "2026-08-18"));
  income(s, p7, "2026-08-20", scheduleAmount(s, p7, 0), "Seña");
  s.w = op.saveBomDraft(s.w, p7, null, s.ctx("administracion", "2026-08-21"));
  s.w = op.publishBom(s.w, p7, s.ctx("administracion", "2026-08-21"));
  staffHours(s, "emp-03", "administracion", "2026-08-12", [{ projectId: p7, hours: 6, note: "Diseño recepción" }]);
  {
    const o1 = buy(s, "prov-01", "2026-08-24", "2026-08-31", [
      { projectId: p7, item: 0, rubro: C, material: "mat-rob", qty: 3, price: 122000 },
      { projectId: p7, item: 0, rubro: C, material: "mat-mdf", qty: 3, price: 63500 },
      { projectId: p7, item: 1, rubro: C, material: "mat-mel", qty: 6, price: 58500 },
    ]);
    const o2 = buy(s, "prov-05", "2026-08-24", "2026-09-04", [{ projectId: p7, item: 1, rubro: C, material: "mat-cor", qty: 8, price: 11200 }]);
    const o3 = buy(s, "prov-02", "2026-09-07", "2026-09-14", [{ projectId: p7, item: 2, rubro: H, material: "mat-can", qty: 3, price: 39500 }]);
    receive(s, o1.orderId, "2026-08-31", [[o1.lineIds[0], 3], [o1.lineIds[1], 3], [o1.lineIds[2], 6]]);
    receive(s, o2.orderId, "2026-09-04", [[o2.lineIds[0], 8]]);
    receive(s, o3.orderId, "2026-09-14", [[o3.lineIds[0], 3]]);
    pay(s, o1.orderId, "2026-09-15", orderValue(s, o1.orderId), "Transferencia");
    pay(s, o2.orderId, "2026-09-15", orderValue(s, o2.orderId), "Transferencia");
    const o5 = buy(s, "prov-03", "2026-10-05", "2026-10-08", [{ projectId: p7, item: 0, rubro: P, material: "mat-lac", qty: 3, price: 14800 }]);
    receive(s, o5.orderId, "2026-10-08", [[o5.lineIds[0], 3]]);
  }
  {
    const a = release(s, p7, 0, C, "mat-rob", 3, "2026-09-07");
    render(s, a, "2026-10-02", 2.5, 0.25, 0);
    const b = release(s, p7, 0, C, "mat-mdf", 3, "2026-09-07");
    render(s, b, "2026-10-02", 2.5, 0.5, 0);
    const c = release(s, p7, 1, C, "mat-mel", 6, "2026-09-21");
    render(s, c, "2026-10-09", 3, 0.25, 0);
    const d = release(s, p7, 2, H, "mat-can", 3, "2026-09-14");
    render(s, d, "2026-09-25", 2.75, 0.25, 0);
    const e = release(s, p7, 1, C, "mat-cor", 8, "2026-10-13");
    render(s, e, "2026-10-16", 4, 0, 0);
    // Laca liberada el 15/10 y sin rendir todavía (alerta de rendición).
    release(s, p7, 0, P, "mat-lac", 1.5, "2026-10-15");
  }
  work(s, "emp-06", p7, 0, C, "2026-09-07", "2026-09-18", 4);
  work(s, "emp-06", p7, 0, C, "2026-09-28", "2026-09-30", 8);
  work(s, "emp-07", p7, 1, C, "2026-09-21", "2026-10-09", 4);
  work(s, "emp-08", p7, 2, H, "2026-09-14", "2026-09-25", 2);
  work(s, "emp-06", p7, 0, C, "2026-10-12", "2026-10-16", 4);
  work(s, "emp-07", p7, 1, C, "2026-10-12", "2026-10-14", 6);
  units(s, p7, 2, 2, "2026-10-02");
  // Planta pide Tapicería para los sillones (no cotizada): Administración la aprueba como adicional con precio.
  s.w = op.requestRubro(s.w, { projectId: p7, itemId: s.item(p7, 2), rubroId: TA, hours: 12, note: "El cliente pidió tapizar asiento y respaldo" }, s.ctx("jefe_planta", "2026-09-29"));
  {
    const req = s.w.rubroRequests.find((r) => r.projectId === p7 && r.status === "open")!;
    const [, w1] = op.addAdditional(
      s.w,
      { projectId: p7, itemId: s.item(p7, 2), rubroId: TA, hours: 12, hourlyCost: 8200, materials: [{ materialId: "mat-esp", quantity: 1, unitCost: 46000 }, { materialId: "mat-tel", quantity: 4, unitCost: 28000 }], price: 420000, requestId: req.id, note: "Aprobado por el cliente por mail" },
      s.ctx("administracion", "2026-09-30"),
    );
    s.w = w1;
    s.w = op.saveBomDraft(s.w, p7, null, s.ctx("administracion", "2026-09-30"));
    const cur = s.w.boms.find((b) => b.projectId === p7 && b.status === "draft")!;
    const lines = [
      ...cur.lines,
      { itemId: s.item(p7, 2), rubroId: TA, materialId: "mat-esp", quantity: 1 },
      { itemId: s.item(p7, 2), rubroId: TA, materialId: "mat-tel", quantity: 4 },
    ];
    s.w = op.saveBomDraft(s.w, p7, lines, s.ctx("administracion", "2026-09-30"));
    s.w = op.publishBom(s.w, p7, s.ctx("administracion", "2026-09-30"));
    const o4 = buy(s, "prov-04", "2026-10-01", "2026-10-08", [
      { projectId: p7, item: 2, rubro: TA, material: "mat-esp", qty: 1, price: 48000 },
      { projectId: p7, item: 2, rubro: TA, material: "mat-tel", qty: 4, price: 28500 },
    ]);
    receive(s, o4.orderId, "2026-10-08", [[o4.lineIds[0], 1], [o4.lineIds[1], 4]]);
  }
  // Pedido de rubro abierto (pendiente de Administración): Armado y montaje del mostrador en la clínica.
  s.w = op.requestRubro(s.w, { projectId: p7, itemId: s.item(p7, 0), rubroId: M, hours: 6, note: "Hay que armar el mostrador en el lugar" }, s.ctx("jefe_planta", "2026-10-16"));

  // ═════ OT4305 · Café Brújula · en Producción: 12 sillas, stock sobrante asignado, OC multi-OT ═════
  const p5 = createQuoted(s, {
    client: "cli-05",
    description: "Barra, mesas y 12 sillas",
    created: "2026-09-01",
    start: "2026-09-28",
    due: "2026-11-13",
    items: [["Barra", 1], ["Mesa", 4], ["Silla", 12]],
    lines: [
      { item: 0, rubro: C, material: "mat-mdf", qty: 5 },
      { item: 0, rubro: C, material: "mat-tap", qty: 30 },
      { item: 0, rubro: C, qty: 48 },
      { item: 0, rubro: P, material: "mat-pol", qty: 4 },
      { item: 0, rubro: P, qty: 12 },
      { item: 1, rubro: C, material: "mat-fen", qty: 6 },
      { item: 1, rubro: C, qty: 40 },
      { item: 1, rubro: H, material: "mat-can", qty: 4 },
      { item: 1, rubro: H, qty: 24 },
      { item: 2, rubro: H, material: "mat-can", qty: 10 },
      { item: 2, rubro: H, qty: 48 },
      { item: 2, rubro: TA, material: "mat-esp", qty: 3 },
      { item: 2, rubro: TA, material: "mat-tel", qty: 9 },
      { item: 2, rubro: TA, qty: 36 },
      { item: 2, rubro: P, material: "mat-pol", qty: 3 },
      { item: 2, rubro: P, qty: 18 },
    ],
    staff: [["cat-dis", 14], ["cat-adm", 6]],
    plan: [["Seña", 50, "2026-09-15"], ["Cuota", 30, "2026-10-30"], ["Saldo", 20, "2026-11-27"]],
    discount: 150000,
  });
  s.w = op.setQuoteState(s.w, p5, "sent", s.ctx("administracion", "2026-09-02"));
  s.w = op.setQuoteState(s.w, p5, "negotiating", s.ctx("administracion", "2026-09-08"));
  s.w = op.approveQuote(s.w, p5, s.ctx("administracion", "2026-09-14"));
  income(s, p5, "2026-09-15", scheduleAmount(s, p5, 0), "Seña transferencia");
  s.w = op.saveBomDraft(s.w, p5, null, s.ctx("administracion", "2026-09-16"));
  s.w = op.publishBom(s.w, p5, s.ctx("administracion", "2026-09-16"));
  staffHours(s, "emp-03", "administracion", "2026-09-03", [{ projectId: p5, hours: 7, note: "Diseño barra y mesas" }]);
  staffHours(s, "emp-03", "administracion", "2026-09-04", [{ projectId: p5, hours: 6, note: "Diseño silla" }, { hours: 2, note: "Capacitación interna" }]);
  staffHours(s, "emp-02", "administracion", "2026-09-07", [{ projectId: p5, hours: 4, note: "Negociación con el cliente" }]);
  staffHours(s, "emp-04", "compras", "2026-09-17", [{ projectId: p5, hours: 3, note: "Pedidos de caño, espuma y tela" }, { hours: 4, note: "Orden del depósito" }]);
  {
    const oc = buy(s, "prov-02", "2026-09-17", "2026-09-25", [
      { projectId: p5, item: 2, rubro: H, material: "mat-can", qty: 10, price: 39500 },
      { projectId: p5, item: 1, rubro: H, material: "mat-can", qty: 4, price: 39500 },
    ]);
    const ot = buy(s, "prov-04", "2026-09-18", "2026-09-26", [
      { projectId: p5, item: 2, rubro: TA, material: "mat-esp", qty: 3, price: 48000 },
      { projectId: p5, item: 2, rubro: TA, material: "mat-tel", qty: 9, price: 28500 },
    ]);
    // 2 placas de MDF: sobrante reutilizable de OT4301 (stock libre) → asignado a esta OT. Habilita Producción.
    s.w = op.assignStock(s.w, { materialId: "mat-mdf", projectId: p5, quantity: 2 }, s.ctx("compras", "2026-09-22"));
    s.w = op.assignStock(s.w, { materialId: "mat-tap", projectId: p5, quantity: 30 }, s.ctx("compras", "2026-09-22"));
    receive(s, oc.orderId, "2026-09-25", [[oc.lineIds[0], 10], [oc.lineIds[1], 4]]);
    receive(s, ot.orderId, "2026-09-26", [[ot.lineIds[0], 3], [ot.lineIds[1], 9]]);
    pay(s, oc.orderId, "2026-10-09", orderValue(s, oc.orderId), "Transferencia");
  }
  // OC con líneas para dos OTs (OT4305 y OT4306). Recepción parcial y una recepción revertida.
  const p6 = createQuoted(s, {
    client: "cli-06",
    description: "Biblioteca y escritorio",
    created: "2026-09-21",
    start: "2026-10-26",
    due: "2026-12-04",
    items: [["Biblioteca", 1], ["Escritorio", 1]],
    lines: [
      { item: 0, rubro: C, material: "mat-mel", qty: 6 },
      { item: 0, rubro: C, material: "mat-mdf", qty: 3 },
      { item: 0, rubro: C, qty: 40 },
      { item: 0, rubro: P, material: "mat-lac", qty: 4 },
      { item: 0, rubro: P, qty: 10 },
      { item: 1, rubro: C, material: "mat-rob", qty: 2 },
      { item: 1, rubro: C, material: "mat-mdf", qty: 2 },
      { item: 1, rubro: C, material: "mat-cor", qty: 3 },
      { item: 1, rubro: C, qty: 20 },
      { item: 1, rubro: H, material: "mat-can", qty: 3 },
      { item: 1, rubro: H, qty: 24 },
      { item: 1, rubro: P, qty: 6 },
    ],
    staff: [["cat-dis", 10], ["cat-adm", 3]],
    plan: [["Seña", 50, "2026-10-01"], ["Cuota", 30, "2026-11-13"], ["Saldo", 20, "2026-12-11"]],
  });
  s.w = op.setQuoteState(s.w, p6, "sent", s.ctx("administracion", "2026-09-22"));
  s.w = op.approveQuote(s.w, p6, s.ctx("administracion", "2026-09-29"));
  income(s, p6, "2026-10-01", scheduleAmount(s, p6, 0), "Seña");
  s.w = op.saveBomDraft(s.w, p6, null, s.ctx("administracion", "2026-10-02"));
  s.w = op.publishBom(s.w, p6, s.ctx("administracion", "2026-10-02"));
  // BOM v2: Diseño ajusta la biblioteca (melamina 6 → 8, bisagras nuevas, tapacanto) — necesidades recalculadas.
  {
    const v1 = s.w.boms.find((b) => b.projectId === p6 && b.status === "published")!;
    s.w = op.saveBomDraft(s.w, p6, null, s.ctx("administracion", "2026-10-06"));
    const lines = v1.lines.map((l) => ({ itemId: l.itemId, rubroId: l.rubroId, materialId: l.materialId, quantity: l.materialId === "mat-mel" ? 8 : l.quantity }));
    lines.push({ itemId: s.item(p6, 0), rubroId: C, materialId: "mat-bis", quantity: 8 });
    lines.push({ itemId: s.item(p6, 0), rubroId: C, materialId: "mat-tap", quantity: 40 });
    s.w = op.saveBomDraft(s.w, p6, lines, s.ctx("administracion", "2026-10-06"));
    s.w = op.publishBom(s.w, p6, s.ctx("administracion", "2026-10-06"));
  }
  staffHours(s, "emp-03", "administracion", "2026-09-23", [{ projectId: p6, hours: 6, note: "Diseño biblioteca" }]);
  staffHours(s, "emp-03", "administracion", "2026-10-05", [{ projectId: p6, hours: 4, note: "Ajustes de diseño (BOM v2)" }]);
  const multi = buy(s, "prov-01", "2026-10-05", "2026-10-13", [
    { projectId: p5, item: 1, rubro: C, material: "mat-fen", qty: 6, price: 97000 },
    { projectId: p6, item: 0, rubro: C, material: "mat-mel", qty: 8, price: 59000 },
    { projectId: p6, item: 1, rubro: C, material: "mat-rob", qty: 2, price: 123000 },
  ]);
  receive(s, multi.orderId, "2026-10-13", [[multi.lineIds[0], 6]]);
  {
    const wrong = s.w.receipts.filter((r) => r.lineId === multi.lineIds[0]).at(-1)!;
    s.w = op.reverseReceipt(s.w, wrong.id, "Se contaron 6 placas y llegaron 4", s.ctx("compras", "2026-10-13"));
  }
  receive(s, multi.orderId, "2026-10-13", [[multi.lineIds[0], 4]]);
  s.w = op.setOrderInvoice(s.w, multi.orderId, { number: "A-0003-00018422", date: "2026-10-13", amount: 1300000 }, s.ctx("compras", "2026-10-14"));
  pay(s, multi.orderId, "2026-10-16", 700000, "Anticipo al proveedor (se reparte por valor de línea)");
  const herrajes = buy(s, "prov-05", "2026-10-14", "2026-10-27", [
    { projectId: p6, item: 0, rubro: C, material: "mat-bis", qty: 8, price: 2700 },
    { projectId: p6, item: 1, rubro: C, material: "mat-cor", qty: 3, price: 11500 },
  ]);
  void herrajes;

  // Producción OT4305
  {
    const a = release(s, p5, 0, C, "mat-mdf", 2, "2026-10-01");
    render(s, a, "2026-10-02", 1.75, 0.25, 0);
    const b = release(s, p5, 0, C, "mat-tap", 30, "2026-10-05");
    render(s, b, "2026-10-09", 18, 2, 0);
    const c = release(s, p5, 2, H, "mat-can", 10, "2026-09-28");
    render(s, c, "2026-10-09", 9, 0.5, 0);
    const d = release(s, p5, 1, H, "mat-can", 4, "2026-10-12");
    render(s, d, "2026-10-16", 2, 0, 0);
    const e = release(s, p5, 2, TA, "mat-esp", 3, "2026-10-12");
    render(s, e, "2026-10-16", 1.5, 0.25, 0);
    const f = release(s, p5, 2, TA, "mat-tel", 9, "2026-10-12");
    render(s, f, "2026-10-16", 6, 0.75, 0);
    const g = release(s, p5, 1, C, "mat-fen", 4, "2026-10-14");
    render(s, g, "2026-10-16", 1.5, 0.25, 0);
  }
  work(s, "emp-08", p5, 2, H, "2026-09-28", "2026-10-09", 4);
  work(s, "emp-06", p5, 0, C, "2026-10-01", "2026-10-09", 4);
  work(s, "emp-11", p5, 1, C, "2026-10-14", "2026-10-16", 6);
  work(s, "emp-10", p5, 2, TA, "2026-10-12", "2026-10-16", 6);
  work(s, "emp-08", p5, 1, H, "2026-10-12", "2026-10-16", 3);
  units(s, p5, 2, 8, "2026-10-16");
  s.w = op.addOtherCost(s.w, { projectId: p5, date: "2026-10-09", description: "Flete urgente de caños (proveedor sin stock)", categoryId: "occ-flete", amount: 85000 }, s.ctx("gerencia", "2026-10-09"));
  // Planta pide 3 m más de tela para las sillas (adicional al BOM, directo a Compras).
  s.w = op.requestMaterial(s.w, { projectId: p5, itemId: s.item(p5, 2), materialId: "mat-tel", quantity: 3, note: "Se manchó un corte" }, s.ctx("jefe_planta", "2026-10-16"));

  // ═════ OT4308 · Hotel Puerto Colibrí · aprobada, BOM pendiente ═════
  const p8 = createQuoted(s, {
    client: "cli-08",
    description: "Respaldos y mesas de luz 12 habitaciones",
    created: "2026-10-01",
    start: "2026-11-02",
    due: "2026-12-18",
    items: [["Respaldo de cama", 12], ["Mesa de luz", 24]],
    lines: [
      { item: 0, rubro: C, material: "mat-mdf", qty: 8 },
      { item: 0, rubro: C, qty: 36 },
      { item: 0, rubro: TA, material: "mat-esp", qty: 6 },
      { item: 0, rubro: TA, material: "mat-tel", qty: 18 },
      { item: 0, rubro: TA, qty: 48 },
      { item: 1, rubro: C, material: "mat-mel", qty: 14 },
      { item: 1, rubro: C, material: "mat-cor", qty: 24 },
      { item: 1, rubro: C, qty: 96 },
      { item: 1, rubro: H, material: "mat-can", qty: 12 },
      { item: 1, rubro: H, qty: 72 },
      { item: 1, rubro: P, material: "mat-pol", qty: 8 },
      { item: 1, rubro: P, qty: 36 },
    ],
    staff: [["cat-dis", 16], ["cat-adm", 8]],
    plan: [["Seña", 40, "2026-10-23"], ["Cuota", 40, "2026-11-27"], ["Saldo", 20, "2026-12-23"]],
    discount: 250000,
  });
  s.w = op.setQuoteState(s.w, p8, "sent", s.ctx("administracion", "2026-10-02"));
  s.w = op.setQuoteState(s.w, p8, "negotiating", s.ctx("administracion", "2026-10-07"));
  s.w = op.approveQuote(s.w, p8, s.ctx("administracion", "2026-10-14"));
  staffHours(s, "emp-03", "administracion", "2026-10-15", [{ projectId: p8, hours: 6, note: "Planos respaldos" }]);
  staffHours(s, "emp-03", "administracion", "2026-10-16", [{ projectId: p8, hours: 5, note: "BOM borrador" }]);
  s.w = op.saveBomDraft(s.w, p8, null, s.ctx("administracion", "2026-10-16"));

  // ═════ Cotizaciones: enviada, en negociación y borrador ═════
  const p9 = createQuoted(s, {
    client: "cli-09",
    description: "Atriles y bancos",
    created: "2026-10-06",
    start: "2026-11-09",
    due: "2026-12-11",
    items: [["Atril", 20], ["Banco de piano", 4]],
    lines: [
      { item: 0, rubro: H, material: "mat-can", qty: 6 },
      { item: 0, rubro: H, qty: 40 },
      { item: 0, rubro: P, material: "mat-pol", qty: 4 },
      { item: 0, rubro: P, qty: 16 },
      { item: 1, rubro: C, material: "mat-rob", qty: 2 },
      { item: 1, rubro: C, qty: 24 },
      { item: 1, rubro: TA, material: "mat-esp", qty: 1 },
      { item: 1, rubro: TA, material: "mat-tel", qty: 3 },
      { item: 1, rubro: TA, qty: 8 },
    ],
    staff: [["cat-dis", 6]],
    plan: [["Seña", 50, "2026-11-02"], ["Saldo", 50, "2026-12-18"]],
  });
  s.w = op.setQuoteState(s.w, p9, "sent", s.ctx("administracion", "2026-10-08"));

  const p10 = createQuoted(s, {
    client: "cli-05",
    description: "Terraza mesas exteriores",
    created: "2026-10-09",
    start: "2026-11-16",
    due: "2026-12-18",
    items: [["Mesa exterior", 8]],
    lines: [
      { item: 0, rubro: H, material: "mat-can", qty: 8 },
      { item: 0, rubro: H, qty: 48 },
      { item: 0, rubro: C, material: "mat-fen", qty: 4 },
      { item: 0, rubro: C, qty: 24 },
      { item: 0, rubro: P, material: "mat-pol", qty: 6 },
      { item: 0, rubro: P, qty: 20 },
    ],
    staff: [["cat-dis", 4]],
    plan: [],
  });
  s.w = op.setQuoteState(s.w, p10, "sent", s.ctx("administracion", "2026-10-12"));
  s.w = op.setQuoteState(s.w, p10, "negotiating", s.ctx("administracion", "2026-10-15"));

  const p11 = createQuoted(s, {
    client: "cli-02",
    description: "Alacena de cocina",
    created: "2026-10-19",
    start: "2026-11-23",
    due: "2026-12-18",
    items: [["Alacena", 1]],
    lines: [
      { item: 0, rubro: C, material: "mat-mel", qty: 5 },
      { item: 0, rubro: C, qty: 20 },
    ],
    staff: [],
    plan: [],
    roundList: false,
  });
  void p11;

  // ═════ Semana de la demo (lunes 19/10 a viernes 23/10): planificación, asignaciones y horas ═════
  const J = (d: ISODate) => s.ctx("jefe_planta", d);
  const plan = (pid: string, item: number, rubro: string, from: ISODate, to: ISODate, hours: number) => {
    for (const d of eachDay(from, to).filter((x) => weekday(x) >= 1 && weekday(x) <= 5)) {
      const [, w1] = op.savePlan(s.w, { projectId: pid, itemId: s.item(pid, item), rubroId: rubro, date: d, hours }, J("2026-10-16"));
      s.w = w1;
    }
  };
  const assign = (e: string, pid: string, item: number, rubro: string, from: ISODate, to: ISODate, hpd: number) => {
    const [, w1] = op.saveAssignment(s.w, { projectId: pid, itemId: s.item(pid, item), rubroId: rubro, employeeId: e, from, to, hoursPerDay: hpd }, J("2026-10-16"));
    s.w = w1;
  };
  // Excepciones: Sofía no viene el miércoles 21; Iván trabaja el sábado 24 (4 h).
  s.w = op.setException(s.w, { employeeId: "emp-09", date: "2026-10-21", availableHours: 0, note: "Trámite personal" }, J("2026-10-16"));
  s.w = op.setException(s.w, { employeeId: "emp-11", date: "2026-10-24", availableHours: 4, note: "Sábado para adelantar mesas" }, J("2026-10-16"));
  // Joaquín (único herrero) de vacaciones del 26/10 al 13/11: falta capacidad de Herrería.
  for (const d of eachDay("2026-10-26", "2026-11-13").filter((x) => weekday(x) >= 1 && weekday(x) <= 5)) {
    s.w = op.setException(s.w, { employeeId: "emp-08", date: d, availableHours: 0, note: "Vacaciones" }, J("2026-10-16"));
  }
  // Semana pasada: Sofía tenía asignado el sillón el viernes 16 y no cargó horas.
  plan(p7, 2, P, "2026-10-16", "2026-10-16", 4);
  assign("emp-09", p7, 2, P, "2026-10-16", "2026-10-16", 4);
  plan(p5, 0, C, "2026-10-19", "2026-10-23", 4);
  plan(p5, 1, C, "2026-10-19", "2026-10-23", 8);
  plan(p5, 1, H, "2026-10-19", "2026-10-21", 6);
  plan(p5, 2, TA, "2026-10-19", "2026-10-23", 6);
  plan(p5, 2, P, "2026-10-21", "2026-10-23", 4);
  plan(p7, 0, C, "2026-10-19", "2026-10-23", 4);
  plan(p7, 1, C, "2026-10-19", "2026-10-22", 6);
  plan(p7, 2, TA, "2026-10-19", "2026-10-20", 2);
  plan(p7, 1, P, "2026-10-23", "2026-10-23", 6);
  plan(p5, 1, C, "2026-10-26", "2026-10-30", 8);
  plan(p5, 2, TA, "2026-10-26", "2026-10-28", 6);
  assign("emp-06", p5, 0, C, "2026-10-19", "2026-10-23", 4);
  assign("emp-06", p7, 0, C, "2026-10-19", "2026-10-23", 4);
  assign("emp-11", p5, 1, C, "2026-10-19", "2026-10-23", 8);
  assign("emp-08", p5, 1, H, "2026-10-19", "2026-10-21", 6);
  assign("emp-10", p5, 2, TA, "2026-10-19", "2026-10-22", 6);
  assign("emp-10", p7, 2, TA, "2026-10-19", "2026-10-20", 2);
  assign("emp-09", p5, 2, P, "2026-10-22", "2026-10-23", 4);
  assign("emp-07", p7, 1, C, "2026-10-19", "2026-10-22", 6);
  // Viernes 16: Diego cargó 9 h en la mesa y el Jefe lo corrigió a 8 h (queda la auditoría en el mismo registro).
  addHours(s, "emp-06", "2026-10-15", [{ projectId: p5, itemId: s.item(p5, 1), rubroId: C, hours: 4 }]);
  addHours(s, "emp-06", "2026-10-16", [{ projectId: p5, itemId: s.item(p5, 1), rubroId: C, hours: 5 }], false);
  {
    const e = s.w.timeEntries.find((t) => t.employeeId === "emp-06" && t.date === "2026-10-16" && t.projectId === p5)!;
    s.w = op.correctEntry(s.w, e.id, { projectId: p5, itemId: s.item(p5, 1), rubroId: C, hours: 4 }, J("2026-10-19"));
    s.w = op.confirmDay(s.w, "emp-06", "2026-10-16", J("2026-10-19"));
  }
  // Jueves 15: Camila hizo 10 h (2 h extra).
  addHours(s, "emp-07", "2026-10-15", [{ projectId: p7, itemId: s.item(p7, 1), rubroId: C, hours: 10 }]);
  // Lunes 19 (ayer): jornadas declaradas, sin revisar todavía.
  addHours(s, "emp-06", "2026-10-19", [{ projectId: p5, itemId: s.item(p5, 0), rubroId: C, hours: 4 }, { projectId: p7, itemId: s.item(p7, 0), rubroId: C, hours: 4 }], false);
  // Iván tenía la mesa y trabajó en la barra (otra tarea válida de la misma OT): Planta lo revisa.
  addHours(s, "emp-11", "2026-10-19", [{ projectId: p5, itemId: s.item(p5, 0), rubroId: C, hours: 8 }], false);
  addHours(s, "emp-08", "2026-10-19", [{ projectId: p5, itemId: s.item(p5, 1), rubroId: H, hours: 6 }, { hours: 2, note: "Mantenimiento de la soldadora" }], false);
  addHours(s, "emp-10", "2026-10-19", [{ projectId: p5, itemId: s.item(p5, 2), rubroId: TA, hours: 6 }, { projectId: p7, itemId: s.item(p7, 2), rubroId: TA, hours: 2 }], false);
  addHours(s, "emp-07", "2026-10-19", [{ projectId: p7, itemId: s.item(p7, 1), rubroId: C, hours: 6 }, { hours: 2, note: "Limpieza y orden del taller" }], false);
  staffHours(s, "emp-05", "jefe_planta", "2026-10-19", [{ projectId: p5, hours: 2, note: "Seguimiento de producción" }, { hours: 6, note: "Planificación semanal y control" }]);
  staffHours(s, "emp-04", "compras", "2026-10-19", [{ hours: 3, note: "Inventario de herrajes" }]);
  // Hoy (martes 20) temprano: Matías ya cargó 2 h del sillón.
  addHours(s, "emp-10", "2026-10-20", [{ projectId: p7, itemId: s.item(p7, 2), rubroId: TA, hours: 2 }], false);

  // ═════ Cobros y pagos recientes ═════
  pay(s, herrajes.orderId, "2026-10-16", 20000, "Seña al proveedor", p6);
  return { ...s.w, config: { ...s.w.config, asOf: DEMO_AS_OF } };
}

/** Copia nueva del escenario base (para restaurar). */
export function demoWorld(): CoreWorld {
  return buildDemoWorld();
}
