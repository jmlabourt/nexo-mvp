// ─────────────────────────────────────────────────────────────
// Operaciones del modo demostración: reciben el estado y devuelven uno nuevo (puras, sin efectos).
// Cada una valida la regla de negocio y la sesión que la puede hacer; un error se lanza como CoreError con un
// mensaje para mostrar. Las transiciones automáticas de estado quedan en el historial del proyecto.
// ─────────────────────────────────────────────────────────────
import type { SessionKey } from "@/lib/permissions";
import type {
  ActivityEntry,
  Additional,
  Assignment,
  BomLine,
  Client,
  CoreConfig,
  CoreStatus,
  CoreWorld,
  DayException,
  Employee,
  Material,
  MaterialRequest,
  OpCtx,
  OrderLine,
  PlanEntry,
  Project,
  PurchaseOrder,
  Quote,
  QuoteLine,
  RateKind,
  Rubro,
  ScheduledPayment,
  Supplier,
  TimeEntry,
  TimeEntryTarget,
} from "./types";
import { closeCheck } from "./closing";
import { contractAt, collectedOf, incomeError } from "./contract";
import { economics } from "./economics";
import { hoursDayErrors } from "./hours";
import { clientName, isWorker, materialName, rubroName } from "./lookup";
import { bomDiff, bomFromBudget, draftBom, enabledRubros, publishedBom, BUYING_STATUSES } from "./needs";
import { formatOt } from "./ot";
import { lineReceived, nextOrderNumber, paidOf, payableLimit, paidByProject } from "./orders";
import { assignmentError, allItemsDone, isPlantProject, planError, releaseBalance } from "./plant";
import { makeBaseline, marginError } from "./quote";
import { addMovement, asg, cons, FREE, lotBalances, moveFifo, prod, qtyAt, SUPPLIER, waste } from "./stock";
import { byId, CoreError, EPS, isISODate, money, must, nextId, nextIds, normalize, qty, r2, replaceById, sumBy } from "./util";

export const STATUS_LABELS: Record<CoreStatus, string> = {
  quotation: "En cotización",
  approved: "Aprobado",
  purchasing: "Compras",
  production: "Producción",
  closed: "Cerrado",
};

export const QUOTE_STATE_LABELS: Record<Quote["state"], string> = {
  draft: "Borrador",
  sent: "Enviada, sin respuesta",
  negotiating: "En negociación",
  rejected: "No aprobada",
};

function need(ctx: OpCtx, ...sessions: SessionKey[]) {
  if (!sessions.includes(ctx.session)) throw new CoreError("Esta acción no corresponde a tu sesión.");
}

function projectOrThrow(w: CoreWorld, id: string): Project {
  return must(byId(w.projects, id), "No encontramos la OT.");
}

function withActivity(w: CoreWorld, p: Project, entry: Omit<ActivityEntry, "id" | "at" | "date" | "by">, ctx: OpCtx): CoreWorld {
  const [id, w2] = nextId(w, "act");
  const next: Project = { ...p, activity: [{ id, at: ctx.now, date: ctx.today, by: ctx.actor, ...entry }, ...p.activity] };
  return { ...w2, projects: replaceById(w2.projects, next) };
}

function setStatus(w: CoreWorld, p: Project, to: CoreStatus, ctx: OpCtx, opts: { auto: boolean; reason: string }): CoreWorld {
  if (p.status === to) return w;
  return withActivity(w, { ...p, status: to }, { kind: "status", from: p.status, to, auto: opts.auto, text: `${STATUS_LABELS[p.status]} → ${STATUS_LABELS[to]}${opts.reason ? ` · ${opts.reason}` : ""}` }, ctx);
}

/** Producción automática: al recibir el primer material de la OT o asignarle stock (también si se había vuelto a Compras). */
function autoProduction(w: CoreWorld, projectId: string, ctx: OpCtx, reason: string): CoreWorld {
  const p = projectOrThrow(w, projectId);
  return p.status === "purchasing" ? setStatus(w, p, "production", ctx, { auto: true, reason }) : w;
}

const text = (s: string | undefined) => (s ?? "").trim();

// ── Catálogos ─────────────────────────────────────────────────

export function upsertClient(w: CoreWorld, input: Partial<Client> & { name: string }, ctx: OpCtx): [string, CoreWorld] {
  need(ctx, "administracion", "gerencia");
  const name = text(input.name);
  if (name.length < 2) throw new CoreError("Escribí el nombre del cliente.");
  if (w.clients.some((c) => c.id !== input.id && normalize(c.name) === normalize(name))) throw new CoreError("Ya hay un cliente con ese nombre.");
  if (input.id) {
    const cur = must(byId(w.clients, input.id), "No encontramos el cliente.");
    return [cur.id, { ...w, clients: replaceById(w.clients, { ...cur, ...input, name }) }];
  }
  const [id, w2] = nextId(w, "cli");
  const c: Client = { id, name, taxId: text(input.taxId) || undefined, contact: text(input.contact) || undefined, phone: text(input.phone) || undefined, email: text(input.email) || undefined, address: text(input.address) || undefined, active: true, createdAt: ctx.now };
  return [id, { ...w2, clients: [...w2.clients, c] }];
}

export function upsertSupplier(w: CoreWorld, input: Partial<Supplier> & { name: string }, ctx: OpCtx): [string, CoreWorld] {
  need(ctx, "administracion", "compras", "gerencia");
  const name = text(input.name);
  if (name.length < 2) throw new CoreError("Escribí el nombre del proveedor.");
  if (w.suppliers.some((s) => s.id !== input.id && normalize(s.name) === normalize(name))) throw new CoreError("Ya hay un proveedor con ese nombre.");
  const links = (input.links ?? []).filter((l) => text(l.url)).map((l) => ({ label: text(l.label) || "Lista de precios", url: text(l.url) }));
  if (links.some((l) => !/^https?:\/\//i.test(l.url))) throw new CoreError("Los links empiezan con http:// o https://.");
  if (input.id) {
    const cur = must(byId(w.suppliers, input.id), "No encontramos el proveedor.");
    return [cur.id, { ...w, suppliers: replaceById(w.suppliers, { ...cur, ...input, name, links }) }];
  }
  const [id, w2] = nextId(w, "prov");
  const s: Supplier = { id, name, contact: text(input.contact) || undefined, phone: text(input.phone) || undefined, email: text(input.email) || undefined, links, active: true, createdAt: ctx.now };
  return [id, { ...w2, suppliers: [...w2.suppliers, s] }];
}

export function upsertMaterial(w: CoreWorld, input: Partial<Material> & { name: string; unit: string; rubroId: string }, ctx: OpCtx): [string, CoreWorld] {
  need(ctx, "administracion", "gerencia");
  const name = text(input.name);
  if (name.length < 2) throw new CoreError("Escribí el nombre del material.");
  if (!text(input.unit)) throw new CoreError("Indicá la unidad.");
  if (!byId(w.rubros, input.rubroId)) throw new CoreError("Elegí el rubro.");
  if (!(Number(input.referenceCost ?? 0) >= 0)) throw new CoreError("El costo de referencia no puede ser negativo.");
  if (w.materials.some((m) => m.id !== input.id && normalize(m.name) === normalize(name))) throw new CoreError("Ya hay un material con ese nombre.");
  if (input.id) {
    const cur = must(byId(w.materials, input.id), "No encontramos el material.");
    return [cur.id, { ...w, materials: replaceById(w.materials, { ...cur, ...input, name, unit: text(input.unit) }) }];
  }
  const [id, w2] = nextId(w, "mat");
  const m: Material = { id, name, unit: text(input.unit), rubroId: input.rubroId, referenceCost: money(input.referenceCost ?? 0), active: true };
  return [id, { ...w2, materials: [...w2.materials, m] }];
}

export function upsertRubro(w: CoreWorld, input: Partial<Rubro> & { name: string }, ctx: OpCtx): [string, CoreWorld] {
  need(ctx, "administracion", "gerencia");
  const name = text(input.name);
  if (name.length < 2) throw new CoreError("Escribí el nombre del rubro.");
  if (/^(dise[nñ]o|administraci[oó]n)$/i.test(name)) throw new CoreError("Diseño y Administración son categorías de personal, no rubros de obreros.");
  if (w.rubros.some((r) => r.id !== input.id && normalize(r.name) === normalize(name))) throw new CoreError("Ya hay un rubro con ese nombre.");
  if (input.id) {
    const cur = must(byId(w.rubros, input.id), "No encontramos el rubro.");
    return [cur.id, { ...w, rubros: replaceById(w.rubros, { ...cur, ...input, name }) }];
  }
  const [id, w2] = nextId(w, "rb");
  return [id, { ...w2, rubros: [...w2.rubros, { id, name, active: true }] }];
}

// ── Gerencia: personal, tarifas y configuración ───────────────

export function upsertEmployee(w: CoreWorld, input: Partial<Employee> & { name: string; categoryId: string }, ctx: OpCtx): [string, CoreWorld] {
  need(ctx, "gerencia");
  const name = text(input.name);
  if (name.length < 2) throw new CoreError("Escribí el nombre.");
  const cat = must(w.config.categories.find((c) => c.id === input.categoryId), "Elegí la categoría.");
  const rubroIds = cat.isWorker ? [...new Set(input.rubroIds ?? [])] : [];
  if (cat.isWorker && rubroIds.length === 0) throw new CoreError("Un obrero necesita al menos un rubro habilitado.");
  if (rubroIds.some((r) => !byId(w.rubros, r))) throw new CoreError("Hay un rubro que no existe.");
  const workDays = [...new Set(input.workDays ?? [1, 2, 3, 4, 5])].filter((d) => d >= 0 && d <= 6).sort();
  const dailyHours = Number(input.dailyHours ?? 8);
  if (!(dailyHours > 0 && dailyHours <= 12)) throw new CoreError("La jornada va de más de 0 a 12 horas.");
  const sessions = (input.sessions ?? (cat.isWorker ? ["operario"] : [])) as SessionKey[];
  if (input.id) {
    const cur = must(byId(w.employees, input.id), "No encontramos la persona.");
    return [cur.id, { ...w, employees: replaceById(w.employees, { ...cur, ...input, name, rubroIds, workDays, dailyHours, sessions }) }];
  }
  if (!isISODate(input.hireDate)) throw new CoreError("Indicá la fecha de ingreso.");
  const [id, w2] = nextId(w, "emp");
  const e: Employee = { id, name, categoryId: cat.id, hireDate: input.hireDate, active: input.active ?? true, workDays, dailyHours, rubroIds, sessions };
  return [id, { ...w2, employees: [...w2.employees, e] }];
}

export function addRate(w: CoreWorld, input: { kind: RateKind; subjectId: string; value: number; validFrom: string }, ctx: OpCtx): CoreWorld {
  need(ctx, "gerencia");
  if (!(input.value > 0)) throw new CoreError("El valor tiene que ser mayor a cero.");
  if (!isISODate(input.validFrom)) throw new CoreError("Indicá desde cuándo vale.");
  const [id, w2] = nextId(w, "tar");
  return { ...w2, rates: [...w2.rates, { id, kind: input.kind, subjectId: input.subjectId, value: money(input.value), validFrom: input.validFrom, createdBy: ctx.actor, createdAt: ctx.now }] };
}

export function updateConfig(w: CoreWorld, patch: Partial<Omit<CoreConfig, "asOf" | "companyName">>, ctx: OpCtx): CoreWorld {
  need(ctx, "gerencia");
  const next: CoreConfig = { ...w.config, ...patch, ot: { ...w.config.ot, ...(patch.ot ?? {}), lastNumber: w.config.ot.lastNumber }, alerts: { ...w.config.alerts, ...(patch.alerts ?? {}) } };
  const m = marginError(next.marginMaterialsPct) ?? marginError(next.marginLaborPct);
  if (m) throw new CoreError(m);
  if (!(next.financialMonthlyRatePct >= 0 && next.financialMonthlyRatePct <= 30)) throw new CoreError("La tasa mensual va de 0 a 30 %.");
  if (!/^[A-Za-z]{1,5}$/.test(next.ot.prefix)) throw new CoreError("El prefijo de la OT son de 1 a 5 letras.");
  if (!next.ot.parts.includes("number")) throw new CoreError("La OT siempre lleva el número correlativo.");
  for (const g of next.quoteGeneralCosts) if (!text(g.name) || !(g.value >= 0)) throw new CoreError("Cada costo general necesita nombre y un valor de 0 en adelante.");
  return { ...w, config: next };
}

export function setException(w: CoreWorld, input: { employeeId: string; date: string; availableHours: number; note?: string }, ctx: OpCtx): CoreWorld {
  need(ctx, "jefe_planta", "gerencia");
  const e = must(byId(w.employees, input.employeeId), "Elegí la persona.");
  if (!isISODate(input.date)) throw new CoreError("Indicá la fecha.");
  if (!(input.availableHours >= 0 && input.availableHours <= 12)) throw new CoreError("Las horas disponibles van de 0 (ausente) a 12.");
  const [id, w2] = nextId(w, "exc");
  const x: DayException = { id, employeeId: e.id, date: input.date, availableHours: r2(input.availableHours), note: text(input.note) || undefined, createdBy: ctx.actor, createdAt: ctx.now };
  return { ...w2, exceptions: [...w2.exceptions.filter((o) => !(o.employeeId === e.id && o.date === input.date)), x] };
}

export function removeException(w: CoreWorld, id: string, ctx: OpCtx): CoreWorld {
  need(ctx, "jefe_planta", "gerencia");
  return { ...w, exceptions: w.exceptions.filter((x) => x.id !== id) };
}

// ── Proyecto y cotización (Administración / Comercial / Diseño) ──

export interface NewProjectInput {
  clientId: string;
  description: string;
  startDate: string;
  dueDate: string;
  items: Array<{ name: string; quantity: number }>;
}

export function createProject(w: CoreWorld, input: NewProjectInput, ctx: OpCtx): [string, CoreWorld] {
  need(ctx, "administracion");
  const client = must(byId(w.clients, input.clientId), "Elegí un cliente del directorio.");
  if (!client.active) throw new CoreError("Ese cliente está inactivo.");
  const description = text(input.description);
  if (description.length < 3) throw new CoreError("Escribí una descripción corta del proyecto.");
  if (!isISODate(input.startDate) || !isISODate(input.dueDate)) throw new CoreError("Indicá las fechas de inicio y de entrega.");
  if (input.dueDate < input.startDate) throw new CoreError("La entrega no puede ser antes del inicio.");
  const items = input.items.filter((i) => text(i.name));
  if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1)) throw new CoreError("Cada mueble lleva una cantidad entera de 1 en adelante.");
  const number = w.config.ot.lastNumber + 1;
  let next: CoreWorld = { ...w, config: { ...w.config, ot: { ...w.config.ot, lastNumber: number } } };
  // Id interno estable derivado del correlativo (único y nunca reutilizado). La OT pública es `ot`.
  const pid = `ot-${number}`;
  const [itemIds, w2] = nextIds(next, "mu", items.length);
  next = w2;
  const generalCosts = w.config.quoteGeneralCosts.filter((g) => g.active).map((g) => ({ id: g.id, name: g.name, mode: g.mode, value: g.value }));
  const p: Project = {
    id: pid,
    otNumber: number,
    ot: formatOt(w.config.ot, number, client.name, description),
    clientId: client.id,
    description,
    status: "quotation",
    startDate: input.startDate,
    dueDate: input.dueDate,
    createdAt: ctx.now,
    createdBy: ctx.actor,
    items: items.map((i, k) => ({ id: itemIds[k], name: text(i.name), quantity: i.quantity, completedUnits: 0 })),
    quote: { state: "draft", lines: [], staffLines: [], marginMaterialsPct: w.config.marginMaterialsPct, marginLaborPct: w.config.marginLaborPct, generalCosts, plan: [], discount: 0 },
    schedule: [],
    notes: [],
    documents: [],
    activity: [],
  };
  next = { ...next, projects: [p, ...next.projects] };
  next = withActivity(next, p, { kind: "created", text: `OT ${p.ot} creada para ${clientName(w, client.id)}` }, ctx);
  return [pid, next];
}

export function updateProjectInfo(w: CoreWorld, projectId: string, patch: { description?: string; startDate?: string; dueDate?: string; clientId?: string; clientPo?: string }, ctx: OpCtx): CoreWorld {
  need(ctx, "administracion");
  const p = projectOrThrow(w, projectId);
  if (p.status === "closed") throw new CoreError("La OT está cerrada.");
  if (patch.clientId && patch.clientId !== p.clientId && p.status !== "quotation") throw new CoreError("El cliente se cambia solo mientras está en cotización.");
  if (patch.clientId) must(byId(w.clients, patch.clientId), "Elegí un cliente del directorio.");
  const next = { ...p, ...patch, description: patch.description !== undefined ? text(patch.description) : p.description };
  if (next.description.length < 3) throw new CoreError("Escribí una descripción corta del proyecto.");
  if (!isISODate(next.startDate) || !isISODate(next.dueDate) || next.dueDate < next.startDate) throw new CoreError("Revisá las fechas: la entrega no puede ser antes del inicio.");
  // La OT pública no cambia aunque cambie la descripción o el nombre comercial.
  return withActivity({ ...w, projects: replaceById(w.projects, next) }, next, { kind: "quote", text: "Datos del proyecto actualizados" }, ctx);
}

/** Guarda la cotización y los muebles mientras está En cotización (borrador, enviada o en negociación). */
export function saveQuote(w: CoreWorld, projectId: string, input: { quote: Quote; items: Array<{ id?: string; name: string; quantity: number }> }, ctx: OpCtx): CoreWorld {
  need(ctx, "administracion");
  const p = projectOrThrow(w, projectId);
  if (p.status !== "quotation") throw new CoreError("La cotización aprobada está congelada: los cambios van como adicionales o en el contrato.");
  const m = marginError(input.quote.marginMaterialsPct) ?? marginError(input.quote.marginLaborPct);
  if (m) throw new CoreError(m);
  let next = w;
  const items: Project["items"] = [];
  // Muebles nuevos (id provisorio de la pantalla) reciben su id definitivo y sus líneas se reasignan.
  const remap = new Map<string, string>();
  for (const it of input.items) {
    if (!text(it.name)) continue;
    if (!Number.isInteger(it.quantity) || it.quantity < 1) throw new CoreError("Cada mueble lleva una cantidad entera de 1 en adelante.");
    if (it.id && p.items.some((x) => x.id === it.id)) items.push({ id: it.id, name: text(it.name), quantity: it.quantity, completedUnits: 0 });
    else {
      const [id, w2] = nextId(next, "mu");
      next = w2;
      if (it.id) remap.set(it.id, id);
      items.push({ id, name: text(it.name), quantity: it.quantity, completedUnits: 0 });
    }
  }
  const itemIds = new Set(items.map((i) => i.id));
  input = { ...input, quote: { ...input.quote, lines: input.quote.lines.filter((l) => itemIds.has(remap.get(l.itemId) ?? l.itemId)).map((l) => ({ ...l, itemId: remap.get(l.itemId) ?? l.itemId })) } };
  for (const l of input.quote.lines) {
    if (!itemIds.has(l.itemId)) throw new CoreError("Hay una línea de un mueble que ya no está.");
    if (!byId(w.rubros, l.rubroId)) throw new CoreError("Hay una línea sin rubro.");
    if (l.kind === "material" && !byId(w.materials, l.materialId)) throw new CoreError("Elegí cada material del catálogo.");
    if (!(l.quantity >= 0) || !(l.unitCost >= 0)) throw new CoreError("Las cantidades y los costos no pueden ser negativos.");
  }
  for (const c of input.quote.plan) if (!isISODate(c.date) || !(c.pct > 0)) throw new CoreError("Cada cobro previsto lleva fecha y un porcentaje mayor a cero.");
  const quote: Quote = { ...input.quote, discount: money(Math.max(0, input.quote.discount || 0)) };
  const updated = { ...projectOrThrow(next, projectId), items, quote };
  return { ...next, projects: replaceById(next.projects, updated) };
}

export function setQuoteState(w: CoreWorld, projectId: string, state: Quote["state"], ctx: OpCtx, reason?: string): CoreWorld {
  need(ctx, "administracion");
  const p = projectOrThrow(w, projectId);
  if (p.status !== "quotation") throw new CoreError("Solo cambia el estado comercial de una cotización.");
  if (state === "rejected" && text(reason).length < 3) throw new CoreError("Contá brevemente por qué no se aprobó.");
  const quote: Quote = { ...p.quote, state, sentAt: state === "sent" && !p.quote.sentAt ? ctx.today : p.quote.sentAt, rejectedReason: state === "rejected" ? text(reason) : undefined };
  const next = { ...p, quote };
  return withActivity({ ...w, projects: replaceById(w.projects, next) }, next, { kind: "quote", text: `Cotización: ${QUOTE_STATE_LABELS[state]}${state === "rejected" ? ` · ${text(reason)}` : ""}` }, ctx);
}

/** Borra una cotización que nunca se aprobó. El número de OT no se reutiliza. */
export function deleteQuote(w: CoreWorld, projectId: string, ctx: OpCtx): CoreWorld {
  need(ctx, "administracion");
  const p = projectOrThrow(w, projectId);
  if (p.status !== "quotation" || p.baseline) throw new CoreError("Solo se borra una cotización que nunca se aprobó.");
  return { ...w, projects: w.projects.filter((x) => x.id !== projectId) };
}

/** Comercial confirma la aprobación del cliente: se congela la cotización (baseline) y nacen los cobros previstos. */
export function approveQuote(w: CoreWorld, projectId: string, ctx: OpCtx): CoreWorld {
  need(ctx, "administracion");
  const p = projectOrThrow(w, projectId);
  if (p.status !== "quotation") throw new CoreError("Ya está aprobada.");
  if (p.quote.state === "rejected") throw new CoreError("Esta cotización figura como no aprobada: volvela a negociación primero.");
  const baseline = makeBaseline(w, p, ctx.actor, ctx.today);
  const next: Project = { ...p, baseline, schedule: baseline.plan.map((s) => ({ ...s })) };
  return setStatus({ ...w, projects: replaceById(w.projects, next) }, next, "approved", ctx, { auto: false, reason: `Aprobada por el cliente · contrato ${baseline.agreedPrice}` });
}

/** Corrección manual de estado (Administración), sin motivo. Nunca a Cerrado ni desde Cerrado. */
export function setStatusManual(w: CoreWorld, projectId: string, to: CoreStatus, ctx: OpCtx): CoreWorld {
  need(ctx, "administracion");
  const p = projectOrThrow(w, projectId);
  if (p.status === "closed" || to === "closed") throw new CoreError("El cierre lo hace Gerencia y no se revierte desde acá.");
  if (to === "quotation" && p.baseline) throw new CoreError("Una OT aprobada no vuelve a cotización (la aprobación quedó registrada).");
  if (to !== "quotation" && !p.baseline) throw new CoreError("Primero confirmá la aprobación de la cotización.");
  if ((to === "purchasing" || to === "production") && !publishedBom(w, p.id)) throw new CoreError("Primero publicá el BOM.");
  return setStatus(w, p, to, ctx, { auto: false, reason: "corrección manual" });
}

export function reviseContract(w: CoreWorld, projectId: string, input: { amount: number; date: string; note?: string; additionalId?: string }, ctx: OpCtx): CoreWorld {
  need(ctx, "administracion");
  const p = projectOrThrow(w, projectId);
  if (!p.baseline) throw new CoreError("El contrato existe desde que se aprueba la cotización.");
  if (p.status === "closed") throw new CoreError("La OT está cerrada.");
  if (!(input.amount > 0)) throw new CoreError("El contrato vigente tiene que ser mayor a cero.");
  if (!isISODate(input.date)) throw new CoreError("Indicá la fecha.");
  const previous = contractAt(w, p, input.date) ?? p.baseline.agreedPrice;
  if (Math.abs(previous - input.amount) < 0.005) throw new CoreError("Es el mismo contrato vigente.");
  if (input.amount + 0.005 < collectedOf(w, p.id)) throw new CoreError("El contrato no puede quedar por debajo de lo ya cobrado.");
  const [id, w2] = nextId(w, "rev");
  const next = { ...w2, contractRevisions: [...w2.contractRevisions, { id, projectId, date: input.date, previous, next: money(input.amount), note: text(input.note) || undefined, additionalId: input.additionalId, createdBy: ctx.actor, createdAt: ctx.now }] };
  return withActivity(next, projectOrThrow(next, projectId), { kind: "contract", text: `Contrato vigente ${previous} → ${money(input.amount)}${input.note ? ` · ${text(input.note)}` : ""}` }, ctx);
}

export function setSchedule(w: CoreWorld, projectId: string, schedule: Array<Omit<ScheduledPayment, "id"> & { id?: string }>, ctx: OpCtx): CoreWorld {
  need(ctx, "administracion");
  const p = projectOrThrow(w, projectId);
  if (!p.baseline) throw new CoreError("Los cobros previstos se cargan en la cotización hasta que se aprueba.");
  if (p.status === "closed") throw new CoreError("La OT está cerrada.");
  let next = w;
  const list: ScheduledPayment[] = [];
  for (const s of schedule) {
    if (!text(s.label)) throw new CoreError("Cada cobro previsto lleva un nombre (seña, cuota…).");
    if (!isISODate(s.date)) throw new CoreError("Cada cobro previsto lleva fecha.");
    if (!(s.amount > 0)) throw new CoreError("Cada cobro previsto lleva importe.");
    let id = s.id;
    if (!id) {
      const [nid, w2] = nextId(next, "cuota");
      next = w2;
      id = nid;
    }
    list.push({ id, label: text(s.label), date: s.date, amount: money(s.amount) });
  }
  const contract = contractAt(w, p, ctx.today) ?? 0;
  if (sumBy(list, (s) => s.amount) - contract > 0.005) throw new CoreError("Los cobros previstos superan el contrato vigente.");
  const updated = { ...projectOrThrow(next, projectId), schedule: list.sort((a, b) => a.date.localeCompare(b.date)) };
  return withActivity({ ...next, projects: replaceById(next.projects, updated) }, updated, { kind: "plan", text: `Cobros previstos actualizados (${list.length})` }, ctx);
}

export function addNote(w: CoreWorld, projectId: string, input: { text: string; date: string }, ctx: OpCtx): CoreWorld {
  need(ctx, "administracion");
  const p = projectOrThrow(w, projectId);
  if (text(input.text).length < 2) throw new CoreError("Escribí la nota.");
  const [id, w2] = nextId(w, "nota");
  const next = { ...p, notes: [{ id, date: isISODate(input.date) ? input.date : ctx.today, text: text(input.text), by: ctx.actor }, ...p.notes] };
  return { ...w2, projects: replaceById(w2.projects, next) };
}

export function addDocument(w: CoreWorld, projectId: string, input: { name: string; reference?: string; date: string }, ctx: OpCtx): CoreWorld {
  need(ctx, "administracion");
  const p = projectOrThrow(w, projectId);
  if (text(input.name).length < 2) throw new CoreError("Indicá el nombre del documento.");
  const [id, w2] = nextId(w, "doc");
  const next = { ...p, documents: [{ id, date: isISODate(input.date) ? input.date : ctx.today, name: text(input.name), reference: text(input.reference) || undefined, by: ctx.actor }, ...p.documents] };
  return { ...w2, projects: replaceById(w2.projects, next) };
}

// ── BOM ───────────────────────────────────────────────────────

/** Guarda el borrador del BOM (lo crea copiando la última publicada o, la primera vez, las líneas cotizadas). */
export function saveBomDraft(w: CoreWorld, projectId: string, lines: Array<Omit<BomLine, "id"> & { id?: string }> | null, ctx: OpCtx): CoreWorld {
  need(ctx, "administracion");
  const p = projectOrThrow(w, projectId);
  if (!p.baseline || p.status === "closed") throw new CoreError("El BOM se arma con la OT aprobada y abierta.");
  let next = w;
  let draft = draftBom(next, projectId);
  if (!draft) {
    const base = publishedBom(next, projectId)?.lines ?? bomFromBudget(next, p);
    const [bid, w1] = nextId(next, "bom");
    next = w1;
    const [ids, w2] = nextIds(next, "boml", base.length);
    next = w2;
    const version = (next.boms.filter((b) => b.projectId === projectId).map((b) => b.version).sort((a, b) => b - a)[0] ?? 0) + 1;
    draft = { id: bid, projectId, version, status: "draft", lines: base.map((l, i) => ({ ...l, id: ids[i] })), createdBy: ctx.actor, createdAt: ctx.now };
    next = { ...next, boms: [...next.boms, draft] };
  }
  if (lines) {
    const out: BomLine[] = [];
    for (const l of lines) {
      if (!p.items.some((i) => i.id === l.itemId)) throw new CoreError("Hay una línea de un mueble que no es de la OT.");
      if (!enabledRubros(next, p, l.itemId).includes(l.rubroId)) throw new CoreError(`El rubro ${rubroName(w, l.rubroId)} no está cotizado para ese mueble.`);
      if (!byId(w.materials, l.materialId)) throw new CoreError("Elegí cada material del catálogo.");
      if (!(l.quantity > 0)) throw new CoreError(`Indicá la cantidad de ${materialName(w, l.materialId)}.`);
      let id = l.id;
      if (!id || !draft.lines.some((x) => x.id === id)) {
        const [nid, w3] = nextId(next, "boml");
        next = w3;
        id = nid;
      }
      out.push({ id, itemId: l.itemId, rubroId: l.rubroId, materialId: l.materialId, quantity: qty(l.quantity) });
    }
    const keys = out.map((l) => `${l.itemId}|${l.rubroId}|${l.materialId}`);
    if (new Set(keys).size !== keys.length) throw new CoreError("Hay un material repetido en el mismo mueble y rubro: sumá las cantidades.");
    draft = { ...draft, lines: out };
    next = { ...next, boms: replaceById(next.boms, draft) };
  }
  return next;
}

/** Finaliza y publica el BOM: genera las necesidades de Compras. La primera publicación lleva la OT a Compras. */
export function publishBom(w: CoreWorld, projectId: string, ctx: OpCtx): CoreWorld {
  need(ctx, "administracion");
  if (projectOrThrow(w, projectId).status === "closed") throw new CoreError("La OT está cerrada.");
  const draft = must(draftBom(w, projectId), "No hay un borrador de BOM para publicar.");
  const prev = publishedBom(w, projectId);
  const changes = bomDiff(prev?.lines ?? [], draft.lines);
  if (prev && changes.length === 0) throw new CoreError("El borrador es igual al BOM publicado.");
  let next: CoreWorld = { ...w, boms: replaceById(w.boms, { ...draft, status: "published", publishedBy: ctx.actor, publishedAt: ctx.now, publishedDate: ctx.today }) };
  next = withActivity(next, projectOrThrow(next, projectId), { kind: "bom", text: `BOM v${draft.version} publicado y enviado a Compras${prev ? ` (${changes.length} cambio${changes.length === 1 ? "" : "s"})` : ""}` }, ctx);
  const cur = projectOrThrow(next, projectId);
  if (cur.status === "approved") next = setStatus(next, cur, "purchasing", ctx, { auto: true, reason: "BOM publicado" });
  return next;
}

// ── Adicionales y pedidos de Planta ───────────────────────────

export function requestRubro(w: CoreWorld, input: { projectId: string; itemId: string; rubroId: string; hours: number; note?: string }, ctx: OpCtx): CoreWorld {
  need(ctx, "jefe_planta");
  const p = projectOrThrow(w, input.projectId);
  if (!isPlantProject(p)) throw new CoreError("La OT no está en Producción.");
  if (!p.items.some((i) => i.id === input.itemId)) throw new CoreError("Elegí un mueble de la OT.");
  must(byId(w.rubros, input.rubroId), "Elegí el rubro.");
  if (enabledRubros(w, p, input.itemId).includes(input.rubroId)) throw new CoreError("Ese rubro ya está habilitado para el mueble: planificalo directamente.");
  if (!(input.hours > 0)) throw new CoreError("Indicá cuántas horas estimás.");
  if (w.rubroRequests.some((r) => r.status === "open" && r.projectId === p.id && r.itemId === input.itemId && r.rubroId === input.rubroId)) throw new CoreError("Ya hay un pedido abierto de ese rubro para el mueble.");
  const [id, w2] = nextId(w, "prb");
  return { ...w2, rubroRequests: [...w2.rubroRequests, { id, ...input, hours: r2(input.hours), note: text(input.note) || undefined, status: "open", createdBy: ctx.actor, createdAt: ctx.now, date: ctx.today }] };
}

export interface AdditionalInput {
  projectId: string;
  itemId: string;
  rubroId: string;
  hours: number;
  hourlyCost: number;
  materials: Array<{ materialId: string; quantity: number; unitCost: number }>;
  price?: number;
  requestId?: string;
  note?: string;
}

/** Administración agrega un adicional: no toca la cotización original; si tiene precio, sube el contrato vigente. */
export function addAdditional(w: CoreWorld, input: AdditionalInput, ctx: OpCtx): [string, CoreWorld] {
  need(ctx, "administracion");
  const p = projectOrThrow(w, input.projectId);
  if (!p.baseline || p.status === "closed") throw new CoreError("Los adicionales van en una OT aprobada y abierta.");
  if (!p.items.some((i) => i.id === input.itemId)) throw new CoreError("Elegí un mueble de la OT.");
  must(byId(w.rubros, input.rubroId), "Elegí el rubro.");
  if (!(input.hours >= 0) || !(input.hourlyCost >= 0)) throw new CoreError("Revisá las horas y el costo por hora.");
  if (input.hours === 0 && input.materials.length === 0) throw new CoreError("El adicional necesita horas o materiales.");
  let next = w;
  const lines: QuoteLine[] = [];
  if (input.hours > 0) {
    const [id, w1] = nextId(next, "ql");
    next = w1;
    lines.push({ id, itemId: input.itemId, rubroId: input.rubroId, kind: "labor", quantity: r2(input.hours), unit: "h", unitCost: money(input.hourlyCost) });
  }
  for (const m of input.materials) {
    const mat = must(byId(w.materials, m.materialId), "Elegí cada material del catálogo.");
    if (!(m.quantity > 0) || !(m.unitCost >= 0)) throw new CoreError(`Revisá la cantidad y el costo de ${mat.name}.`);
    const [id, w1] = nextId(next, "ql");
    next = w1;
    lines.push({ id, itemId: input.itemId, rubroId: input.rubroId, kind: "material", materialId: mat.id, quantity: qty(m.quantity), unit: mat.unit, unitCost: money(m.unitCost) });
  }
  const [aid, w2] = nextId(next, "adi");
  next = w2;
  const additional: Additional = { id: aid, projectId: p.id, itemId: input.itemId, rubroId: input.rubroId, lines, price: input.price && input.price > 0 ? money(input.price) : undefined, requestId: input.requestId, note: text(input.note) || undefined, createdBy: ctx.actor, createdAt: ctx.now, date: ctx.today };
  next = { ...next, additionals: [...next.additionals, additional] };
  if (input.requestId) {
    const req = must(byId(next.rubroRequests, input.requestId), "No encontramos el pedido de Planta.");
    next = { ...next, rubroRequests: replaceById(next.rubroRequests, { ...req, status: "approved", resolvedBy: ctx.actor, resolvedAt: ctx.now, additionalId: aid }) };
  }
  next = withActivity(next, projectOrThrow(next, p.id), { kind: "additional", text: `Adicional aprobado: ${rubroName(w, input.rubroId)} en ${p.items.find((i) => i.id === input.itemId)?.name}${input.hours ? ` · ${r2(input.hours)} h` : ""}` }, ctx);
  if (additional.price) {
    const current = contractAt(next, projectOrThrow(next, p.id), ctx.today) ?? p.baseline.agreedPrice;
    next = reviseContract(next, p.id, { amount: money(current + additional.price), date: ctx.today, note: `Adicional ${rubroName(w, input.rubroId)}`, additionalId: aid }, ctx);
  }
  return [aid, next];
}

export function rejectRubroRequest(w: CoreWorld, requestId: string, ctx: OpCtx): CoreWorld {
  need(ctx, "administracion");
  const req = must(byId(w.rubroRequests, requestId), "No encontramos el pedido.");
  if (req.status !== "open") throw new CoreError("El pedido ya está resuelto.");
  return { ...w, rubroRequests: replaceById(w.rubroRequests, { ...req, status: "rejected", resolvedBy: ctx.actor, resolvedAt: ctx.now }) };
}

/** Planta pide más de un material ya presente en el BOM del mueble: va directo a "Por comprar". */
export function requestMaterial(w: CoreWorld, input: { projectId: string; itemId: string; materialId: string; quantity: number; note?: string }, ctx: OpCtx): CoreWorld {
  need(ctx, "jefe_planta");
  const p = projectOrThrow(w, input.projectId);
  if (!isPlantProject(p)) throw new CoreError("La OT no está en Producción.");
  const bom = must(publishedBom(w, p.id), "La OT no tiene BOM publicado.");
  const line = bom.lines.find((l) => l.itemId === input.itemId && l.materialId === input.materialId);
  if (!line) throw new CoreError("Ese material no está en el BOM del mueble: un material nuevo lo agrega Administración.");
  if (!(input.quantity > 0)) throw new CoreError("Indicá cuánto material más hace falta.");
  if (w.materialRequests.some((r) => r.status === "active" && r.projectId === p.id && r.itemId === input.itemId && r.materialId === input.materialId))
    throw new CoreError("Ya hay un pedido activo de ese material para el mueble: modificalo.");
  const [id, w2] = nextId(w, "pmat");
  const req: MaterialRequest = { id, projectId: p.id, itemId: input.itemId, rubroId: line.rubroId, materialId: input.materialId, quantity: qty(input.quantity), note: text(input.note) || undefined, status: "active", createdBy: ctx.actor, createdAt: ctx.now, date: ctx.today, changes: [] };
  return { ...w2, materialRequests: [...w2.materialRequests, req] };
}

export function updateMaterialRequest(w: CoreWorld, id: string, input: { quantity?: number; cancel?: boolean }, ctx: OpCtx): CoreWorld {
  need(ctx, "jefe_planta");
  const r = must(byId(w.materialRequests, id), "No encontramos el pedido.");
  if (r.status !== "active") throw new CoreError("El pedido está cancelado.");
  if (input.cancel) return { ...w, materialRequests: replaceById(w.materialRequests, { ...r, status: "cancelled", changes: [...r.changes, { at: ctx.now, by: ctx.actor, text: "Cancelado" }] }) };
  if (!(Number(input.quantity) > 0)) throw new CoreError("Indicá la cantidad.");
  return { ...w, materialRequests: replaceById(w.materialRequests, { ...r, quantity: qty(input.quantity as number), changes: [...r.changes, { at: ctx.now, by: ctx.actor, text: `Cantidad ${r.quantity} → ${qty(input.quantity as number)}` }] }) };
}

// ── Compras ───────────────────────────────────────────────────

export interface OrderInput {
  supplierId: string;
  date: string;
  expectedDate?: string;
  notes?: string;
  lines: Array<Omit<OrderLine, "id">>;
}

/** "Registrar orden de compra": queda solo en Blerp (no se crea ni se envía al proveedor). */
export function registerOrder(w: CoreWorld, input: OrderInput, ctx: OpCtx): [string, CoreWorld] {
  need(ctx, "compras");
  const sup = must(byId(w.suppliers, input.supplierId), "Elegí el proveedor.");
  if (!sup.active) throw new CoreError("Ese proveedor está inactivo.");
  if (!isISODate(input.date)) throw new CoreError("Indicá la fecha de la OC.");
  if (input.expectedDate && (!isISODate(input.expectedDate) || input.expectedDate < input.date)) throw new CoreError("La llegada comprometida no puede ser antes de la OC.");
  if (input.lines.length === 0) throw new CoreError("Agregá al menos una línea.");
  let next = w;
  const lines: OrderLine[] = [];
  for (const l of input.lines) {
    must(byId(w.materials, l.materialId), "Elegí cada material del catálogo.");
    if (!(l.quantity > 0)) throw new CoreError(`Indicá la cantidad de ${materialName(w, l.materialId)}.`);
    if (!(l.unitPrice >= 0)) throw new CoreError(`Indicá el precio unitario de ${materialName(w, l.materialId)}.`);
    if (l.projectId) {
      const p = projectOrThrow(w, l.projectId);
      if (!BUYING_STATUSES.includes(p.status)) throw new CoreError(`${p.ot} no tiene compras abiertas.`);
      if (l.itemId && !p.items.some((i) => i.id === l.itemId)) throw new CoreError("El mueble no es de esa OT.");
    }
    const [id, w1] = nextId(next, "ocl");
    next = w1;
    lines.push({ id, projectId: l.projectId || undefined, itemId: l.itemId || undefined, rubroId: l.rubroId || undefined, materialId: l.materialId, quantity: qty(l.quantity), unitPrice: money(l.unitPrice) });
  }
  const [oid, w2] = nextId(next, "oc");
  next = w2;
  const order: PurchaseOrder = { id: oid, number: nextOrderNumber(w.orders), supplierId: sup.id, date: input.date, expectedDate: input.expectedDate || undefined, lines, notes: text(input.notes) || undefined, createdBy: ctx.actor, createdAt: ctx.now };
  return [oid, { ...next, orders: [...next.orders, order] }];
}

export function setOrderInvoice(w: CoreWorld, orderId: string, invoice: { number: string; date: string; amount: number }, ctx: OpCtx): CoreWorld {
  need(ctx, "compras");
  const o = must(byId(w.orders, orderId), "No encontramos la OC.");
  if (!text(invoice.number)) throw new CoreError("Indicá el número del comprobante del proveedor.");
  if (!isISODate(invoice.date)) throw new CoreError("Indicá la fecha del comprobante.");
  if (!(invoice.amount > 0)) throw new CoreError("Indicá el importe del comprobante (sin IVA).");
  if (paidOf(w, o.id) - invoice.amount > 0.005) throw new CoreError("Gerencia ya registró pagos por más que ese importe.");
  return { ...w, orders: replaceById(w.orders, { ...o, invoice: { number: text(invoice.number), date: invoice.date, amount: money(invoice.amount) } }) };
}

/** "Materiales recibidos": cada línea con OT queda asignada a su OT; sin OT, entra a stock libre. */
export function receiveMaterials(w: CoreWorld, orderId: string, input: { date: string; lines: Array<{ lineId: string; quantity: number }> }, ctx: OpCtx): CoreWorld {
  need(ctx, "compras");
  const o = must(byId(w.orders, orderId), "No encontramos la OC.");
  if (!isISODate(input.date)) throw new CoreError("Indicá la fecha en que llegó.");
  if (input.date < o.date) throw new CoreError("La recepción no puede ser antes de la OC.");
  if (input.date > ctx.today) throw new CoreError("Registrá solo material que ya llegó.");
  const rows = input.lines.filter((l) => l.quantity > 0);
  if (rows.length === 0) throw new CoreError("Indicá cuánto llegó de cada material.");
  let next = w;
  const touched = new Set<string>();
  for (const r of rows) {
    const line = must(o.lines.find((l) => l.id === r.lineId), "Esa línea no es de la OC.");
    const pending = qty(line.quantity - lineReceived(next, line.id));
    if (r.quantity - pending > EPS) throw new CoreError(`De ${materialName(w, line.materialId)} faltan recibir ${pending}: no se puede recibir más.`);
    const [lotId, w1] = nextId(next, "lote");
    const [recId, w2] = nextId(w1, "rec");
    next = w2;
    next = { ...next, lots: [...next.lots, { id: lotId, materialId: line.materialId, unitCost: line.unitPrice, date: input.date, source: "receipt", orderId: o.id, receiptId: recId, projectId: line.projectId }] };
    next = { ...next, receipts: [...next.receipts, { id: recId, orderId: o.id, lineId: line.id, date: input.date, quantity: qty(r.quantity), lotId, createdBy: ctx.actor, createdAt: ctx.now }] };
    next = addMovement(next, { lotId, quantity: r.quantity, from: SUPPLIER, to: line.projectId ? asg(line.projectId) : FREE, kind: "receipt", date: input.date, ref: recId }, ctx);
    if (line.projectId) touched.add(line.projectId);
  }
  for (const pid of touched) next = autoProduction(next, pid, ctx, `material recibido (${o.number})`);
  return next;
}

/** Revierte una recepción mal cargada. Se bloquea si ese material ya se usó o se movió (primero se corrigen esos movimientos). */
export function reverseReceipt(w: CoreWorld, receiptId: string, reason: string, ctx: OpCtx): CoreWorld {
  need(ctx, "compras");
  const rec = must(byId(w.receipts, receiptId), "No encontramos la recepción.");
  if (rec.reversal) throw new CoreError("La recepción ya está revertida.");
  if (text(reason).length < 3) throw new CoreError("Contá brevemente el motivo.");
  const o = must(byId(w.orders, rec.orderId), "No encontramos la OC.");
  const line = must(o.lines.find((l) => l.id === rec.lineId), "No encontramos la línea.");
  const place = line.projectId ? asg(line.projectId) : FREE;
  const bal = lotBalances(w).get(rec.lotId);
  const there = bal?.get(place) ?? 0;
  if (rec.quantity - there > EPS) throw new CoreError("Parte de ese material ya se entregó a producción, se usó o se movió: corregí primero esos movimientos.");
  let next = addMovement(w, { lotId: rec.lotId, quantity: rec.quantity, from: place, to: SUPPLIER, kind: "receipt_reversal", date: ctx.today, ref: rec.id }, ctx);
  next = { ...next, receipts: replaceById(next.receipts, { ...rec, reversal: { date: ctx.today, at: ctx.now, by: ctx.actor, reason: text(reason) } }) };
  if (line.projectId) next = withActivity(next, projectOrThrow(next, line.projectId), { kind: "stock", text: `Recepción revertida en ${o.number}: ${materialName(w, line.materialId)} ${rec.quantity} · ${text(reason)}` }, ctx);
  return next;
}

/** "Asignar a OT": material libre del depósito pasa a la OT (resta de "Por comprar", habilita Producción). */
export function assignStock(w: CoreWorld, input: { materialId: string; projectId: string; quantity: number }, ctx: OpCtx): CoreWorld {
  need(ctx, "compras");
  const p = projectOrThrow(w, input.projectId);
  if (!BUYING_STATUSES.includes(p.status)) throw new CoreError(`${p.ot} no tiene el BOM publicado o ya está cerrada.`);
  if (!(input.quantity > 0)) throw new CoreError("Indicá la cantidad.");
  const [ref, w1] = nextId(w, "asig");
  let next = moveFifo(w1, { materialId: input.materialId, quantity: input.quantity, from: FREE, to: asg(p.id), kind: "assign", date: ctx.today, ref }, ctx);
  next = withActivity(next, projectOrThrow(next, p.id), { kind: "stock", text: `Stock asignado: ${materialName(w, input.materialId)} ${qty(input.quantity)}` }, ctx);
  return autoProduction(next, p.id, ctx, "stock libre asignado");
}

export function transferStock(w: CoreWorld, input: { materialId: string; fromProjectId: string; toProjectId: string; quantity: number }, ctx: OpCtx): CoreWorld {
  need(ctx, "compras");
  if (input.fromProjectId === input.toProjectId) throw new CoreError("Elegí otra OT de destino.");
  const to = projectOrThrow(w, input.toProjectId);
  if (!BUYING_STATUSES.includes(to.status)) throw new CoreError(`${to.ot} no tiene el BOM publicado o ya está cerrada.`);
  if (!(input.quantity > 0)) throw new CoreError("Indicá la cantidad.");
  const [ref, w1] = nextId(w, "trf");
  let next = moveFifo(w1, { materialId: input.materialId, quantity: input.quantity, from: asg(input.fromProjectId), to: asg(to.id), kind: "transfer", date: ctx.today, ref }, ctx);
  next = withActivity(next, projectOrThrow(next, to.id), { kind: "stock", text: `Material transferido desde ${projectOrThrow(w, input.fromProjectId).ot}: ${materialName(w, input.materialId)} ${qty(input.quantity)}` }, ctx);
  return autoProduction(next, to.id, ctx, "material transferido de otra OT");
}

/** Devuelve a stock libre material asignado y nunca liberado (Compras o Planta, al rendir). */
export function unassignStock(w: CoreWorld, input: { materialId: string; projectId: string; quantity: number }, ctx: OpCtx): CoreWorld {
  need(ctx, "compras", "jefe_planta");
  if (!(input.quantity > 0)) throw new CoreError("Indicá la cantidad.");
  const [ref, w1] = nextId(w, "desa");
  const next = moveFifo(w1, { materialId: input.materialId, quantity: input.quantity, from: asg(input.projectId), to: FREE, kind: "unassign", date: ctx.today, ref }, ctx);
  return withActivity(next, projectOrThrow(next, input.projectId), { kind: "stock", text: `Devuelto a stock sin usar: ${materialName(w, input.materialId)} ${qty(input.quantity)}` }, ctx);
}

// ── Gerencia: dinero y cierre ─────────────────────────────────

export function registerIncome(w: CoreWorld, input: { projectId: string; date: string; amount: number; reference?: string }, ctx: OpCtx): CoreWorld {
  need(ctx, "gerencia");
  const p = projectOrThrow(w, input.projectId);
  const err = incomeError(w, p, input, ctx.today);
  if (err) throw new CoreError(err);
  const [id, w2] = nextId(w, "ing");
  return { ...w2, incomes: [...w2.incomes, { id, projectId: p.id, date: input.date, amount: money(input.amount), reference: text(input.reference) || undefined, createdBy: ctx.actor, createdAt: ctx.now }] };
}

export function registerSupplierPayment(w: CoreWorld, input: { orderId: string; date: string; amount: number; projectId?: string; reference?: string }, ctx: OpCtx): CoreWorld {
  need(ctx, "gerencia");
  const o = must(byId(w.orders, input.orderId), "No encontramos la OC.");
  if (!isISODate(input.date) || input.date > ctx.today) throw new CoreError("Indicá la fecha real del pago (no futura).");
  if (!(input.amount > 0)) throw new CoreError("Indicá el importe pagado.");
  if (paidOf(w, o.id) + input.amount - payableLimit(o) > 0.005) throw new CoreError(`Supera lo pagable de la OC: faltan pagar ${money(payableLimit(o) - paidOf(w, o.id))}.`);
  if (input.projectId) {
    const part = money(sumBy(o.lines.filter((l) => l.projectId === input.projectId), (l) => l.quantity * l.unitPrice));
    if (part <= 0) throw new CoreError("Esa OT no tiene líneas en la OC.");
    const already = paidByProject(w, o).get(input.projectId) ?? 0;
    if (already + input.amount - part > 0.005) throw new CoreError(`Supera lo de esa OT en la OC: faltan ${money(part - already)}.`);
  }
  const [id, w2] = nextId(w, "pag");
  return { ...w2, supplierPayments: [...w2.supplierPayments, { id, orderId: o.id, date: input.date, amount: money(input.amount), projectId: input.projectId || undefined, reference: text(input.reference) || undefined, createdBy: ctx.actor, createdAt: ctx.now }] };
}

export function addOtherCost(w: CoreWorld, input: { projectId: string; date: string; description: string; categoryId: string; amount: number }, ctx: OpCtx): CoreWorld {
  need(ctx, "gerencia");
  const p = projectOrThrow(w, input.projectId);
  if (!p.baseline) throw new CoreError("Los costos reales van en una OT aprobada.");
  if (!isISODate(input.date) || input.date > ctx.today) throw new CoreError("Indicá la fecha del gasto (no futura).");
  if (text(input.description).length < 3) throw new CoreError("Describí el gasto.");
  if (!w.config.otherCostCategories.some((c) => c.id === input.categoryId && c.active)) throw new CoreError("Elegí la categoría.");
  if (!(input.amount > 0)) throw new CoreError("Indicá el monto.");
  const [id, w2] = nextId(w, "oc-gasto");
  return { ...w2, otherCosts: [...w2.otherCosts, { id, projectId: p.id, date: input.date, description: text(input.description), categoryId: input.categoryId, amount: money(input.amount), createdBy: ctx.actor, createdAt: ctx.now }] };
}

/** Cierre de Gerencia: solo con todo terminado, rendido y entregado. Queda la foto final de los costos operativos. */
export function closeProject(w: CoreWorld, projectId: string, ctx: OpCtx): CoreWorld {
  need(ctx, "gerencia");
  const p = projectOrThrow(w, projectId);
  const check = closeCheck(w, p);
  if (!check.canClose) throw new CoreError(check.blockers.join(" "));
  const e = economics(w, p, ctx.today);
  const closure = {
    projectId,
    date: ctx.today,
    by: ctx.actor,
    at: ctx.now,
    snapshot: {
      contract: e.contract ?? 0,
      materials: e.materials,
      labor: e.labor,
      staff: e.staff,
      other: e.other,
      operatingCost: e.operatingCost,
      operatingProfit: money((e.contract ?? 0) - e.operatingCost),
      operatingMarginPct: e.operatingMarginPct,
      collected: e.collected,
      financialAtClose: e.financialUpdated,
    },
  };
  const next = setStatus({ ...w, closures: [...w.closures.filter((c) => c.projectId !== projectId), closure] }, p, "closed", ctx, { auto: false, reason: "cierre de Gerencia" });
  return withActivity(next, projectOrThrow(next, projectId), { kind: "closure", text: `Cierre: costo operativo ${e.operatingCost}, cobrado ${e.collected} de ${e.contract}` }, ctx);
}

// ── Planta ────────────────────────────────────────────────────

export function savePlan(w: CoreWorld, input: Omit<PlanEntry, "id" | "createdBy" | "createdAt"> & { id?: string }, ctx: OpCtx): [string, CoreWorld] {
  need(ctx, "jefe_planta");
  const err = planError(w, input);
  if (err) throw new CoreError(err);
  if (input.id) {
    const cur = must(byId(w.plans, input.id), "No encontramos el trabajo planificado.");
    return [cur.id, { ...w, plans: replaceById(w.plans, { ...cur, ...input, hours: r2(input.hours) }) }];
  }
  const [id, w2] = nextId(w, "plan");
  return [id, { ...w2, plans: [...w2.plans, { id, projectId: input.projectId, itemId: input.itemId, rubroId: input.rubroId, date: input.date, hours: r2(input.hours), createdBy: ctx.actor, createdAt: ctx.now }] }];
}

export function removePlan(w: CoreWorld, id: string, ctx: OpCtx): CoreWorld {
  need(ctx, "jefe_planta");
  return { ...w, plans: w.plans.filter((x) => x.id !== id) };
}

export function saveAssignment(w: CoreWorld, input: Omit<Assignment, "id" | "createdBy" | "createdAt"> & { id?: string }, ctx: OpCtx): [string, CoreWorld] {
  need(ctx, "jefe_planta");
  const err = assignmentError(w, input, input.id);
  if (err) throw new CoreError(err);
  if (input.id) {
    const cur = must(byId(w.assignments, input.id), "No encontramos la asignación.");
    return [cur.id, { ...w, assignments: replaceById(w.assignments, { ...cur, ...input }) }];
  }
  const [id, w2] = nextId(w, "asg");
  return [id, { ...w2, assignments: [...w2.assignments, { id, projectId: input.projectId, itemId: input.itemId, rubroId: input.rubroId, employeeId: input.employeeId, from: input.from, to: input.to, hoursPerDay: r2(input.hoursPerDay), createdBy: ctx.actor, createdAt: ctx.now }] }];
}

export function removeAssignment(w: CoreWorld, id: string, ctx: OpCtx): CoreWorld {
  need(ctx, "jefe_planta");
  return { ...w, assignments: w.assignments.filter((x) => x.id !== id) };
}

/** Entrega material asignado a la OT a producción, para un mueble y rubro. */
export function releaseMaterial(w: CoreWorld, input: { projectId: string; itemId: string; rubroId: string; materialId: string; quantity: number }, ctx: OpCtx): [string, CoreWorld] {
  need(ctx, "jefe_planta");
  const p = projectOrThrow(w, input.projectId);
  if (!isPlantProject(p)) throw new CoreError("La OT no está en Producción.");
  if (!p.items.some((i) => i.id === input.itemId)) throw new CoreError("Elegí un mueble de la OT.");
  if (!enabledRubros(w, p, input.itemId).includes(input.rubroId)) throw new CoreError("Ese rubro no está habilitado para el mueble.");
  if (!(input.quantity > 0)) throw new CoreError("Indicá la cantidad.");
  const have = qtyAt(w, asg(p.id), input.materialId);
  if (input.quantity - have > EPS) throw new CoreError(`La OT tiene ${have} de ${materialName(w, input.materialId)} asignado: no alcanza.`);
  const [id, w1] = nextId(w, "ent");
  let next: CoreWorld = { ...w1, releases: [...w1.releases, { id, projectId: p.id, itemId: input.itemId, rubroId: input.rubroId, materialId: input.materialId, quantity: qty(input.quantity), date: ctx.today, createdBy: ctx.actor, createdAt: ctx.now }] };
  next = moveFifo(next, { materialId: input.materialId, quantity: input.quantity, from: asg(p.id), to: prod(id), kind: "release", date: ctx.today, ref: id }, ctx);
  return [id, next];
}

/** Rinde una entrega: consumido + desperdiciado + devuelto (reutilizable) ≤ lo que sigue en producción. */
export function renderRelease(w: CoreWorld, input: { releaseId: string; consumed: number; waste: number; returned: number; date?: string }, ctx: OpCtx): CoreWorld {
  need(ctx, "jefe_planta");
  const rel = must(byId(w.releases, input.releaseId), "No encontramos la entrega.");
  const vals = [input.consumed, input.waste, input.returned];
  if (vals.some((v) => !Number.isFinite(v) || v < 0)) throw new CoreError("Las cantidades no pueden ser negativas.");
  const total = qty(input.consumed + input.waste + input.returned);
  // Todo en cero = "sigue en producción" (queda registrado que Planta lo revisó ese día).
  const bal = releaseBalance(w, rel);
  if (total - bal.inProduction > EPS) throw new CoreError(`En producción hay ${bal.inProduction}: consumido + desperdicio + devuelto no puede superarlo.`);
  const date = input.date && isISODate(input.date) ? input.date : ctx.today;
  const [id, w1] = nextId(w, "rend");
  let next: CoreWorld = { ...w1, renditions: [...w1.renditions, { id, releaseId: rel.id, date, consumed: qty(input.consumed), waste: qty(input.waste), returned: qty(input.returned), createdBy: ctx.actor, createdAt: ctx.now }] };
  const from = prod(rel.id);
  if (input.consumed > EPS) next = moveFifo(next, { materialId: rel.materialId, quantity: input.consumed, from, to: cons(rel.projectId), kind: "consume", date, ref: id }, ctx);
  if (input.waste > EPS) next = moveFifo(next, { materialId: rel.materialId, quantity: input.waste, from, to: waste(rel.projectId), kind: "waste", date, ref: id }, ctx);
  if (input.returned > EPS) next = moveFifo(next, { materialId: rel.materialId, quantity: input.returned, from, to: FREE, kind: "return", date, ref: id }, ctx);
  return next;
}

export function setCompletedUnits(w: CoreWorld, projectId: string, itemId: string, units: number, ctx: OpCtx): CoreWorld {
  need(ctx, "jefe_planta");
  const p = projectOrThrow(w, projectId);
  if (!isPlantProject(p)) throw new CoreError("La OT no está en Producción.");
  const item = must(p.items.find((i) => i.id === itemId), "Elegí un mueble de la OT.");
  if (!Number.isInteger(units) || units < 0 || units > item.quantity) throw new CoreError(`Las unidades terminadas van de 0 a ${item.quantity}.`);
  if (units === item.completedUnits) return w;
  const next = { ...p, items: p.items.map((i) => (i.id === itemId ? { ...i, completedUnits: units } : i)) };
  let out = withActivity({ ...w, projects: replaceById(w.projects, next) }, next, { kind: "units", text: `${item.name}: ${item.completedUnits}/${item.quantity} → ${units}/${item.quantity} terminadas` }, ctx);
  if (allItemsDone(next) && !allItemsDone(p)) out = withActivity(out, projectOrThrow(out, projectId), { kind: "units", auto: true, text: "Todos los muebles terminados: lista para revisar cierre (Gerencia)" }, ctx);
  return out;
}

export function registerHandover(w: CoreWorld, projectId: string, input: { date: string; note?: string }, ctx: OpCtx): CoreWorld {
  need(ctx, "jefe_planta");
  const p = projectOrThrow(w, projectId);
  if (!allItemsDone(p)) throw new CoreError("La entrega al cliente se registra con todas las unidades terminadas.");
  if (w.handovers.some((h) => h.projectId === projectId)) throw new CoreError("La entrega ya está registrada.");
  if (!isISODate(input.date) || input.date > ctx.today) throw new CoreError("Indicá la fecha real de entrega (no futura).");
  const [id, w2] = nextId(w, "entc");
  const next = { ...w2, handovers: [...w2.handovers, { id, projectId, date: input.date, note: text(input.note) || undefined, createdBy: ctx.actor, createdAt: ctx.now }] };
  return withActivity(next, projectOrThrow(next, projectId), { kind: "handover", text: `Entregado al cliente el ${input.date}` }, ctx);
}

/** Planta confirma una jornada tal como la declaró el operario. */
export function confirmDay(w: CoreWorld, employeeId: string, date: string, ctx: OpCtx): CoreWorld {
  need(ctx, "jefe_planta");
  const list = w.timeEntries.filter((t) => t.employeeId === employeeId && t.date === date && !t.review);
  if (!list.length) throw new CoreError("No hay horas sin revisar de ese día.");
  const ids = new Set(list.map((t) => t.id));
  return { ...w, timeEntries: w.timeEntries.map((t) => (ids.has(t.id) ? { ...t, review: { status: "confirmed", by: ctx.actor, at: ctx.now } } : t)) };
}

/** Planta corrige un registro (OT, mueble, rubro u horas). Cambia el MISMO registro y deja la auditoría. */
export function correctEntry(w: CoreWorld, entryId: string, after: TimeEntryTarget, ctx: OpCtx): CoreWorld {
  need(ctx, "jefe_planta");
  const t = must(byId(w.timeEntries, entryId), "No encontramos el registro.");
  const e = must(byId(w.employees, t.employeeId), "No encontramos la persona.");
  const err = targetError(w, e, after);
  if (err) throw new CoreError(err);
  if (!(after.hours >= 0) || after.hours > 24) throw new CoreError("Las horas van de 0 a 24.");
  const before: TimeEntryTarget = { projectId: t.projectId, itemId: t.itemId, rubroId: t.rubroId, hours: t.hours };
  const next: TimeEntry = { ...t, ...after, hours: r2(after.hours), review: { status: "corrected", by: ctx.actor, at: ctx.now }, corrections: [...t.corrections, { at: ctx.now, by: ctx.actor, before, after: { ...after, hours: r2(after.hours) } }] };
  const dayTotal = sumBy(w.timeEntries.filter((x) => x.employeeId === t.employeeId && x.date === t.date && x.id !== t.id), (x) => x.hours) + next.hours;
  if (dayTotal > 24) throw new CoreError("Con esa corrección el día supera las 24 horas.");
  return { ...w, timeEntries: replaceById(w.timeEntries, next) };
}

// ── Horas propias (Mi día y Registrar mis horas) ──────────────

/** ¿Puede esta persona imputar a ese destino? Obreros: OT en Producción + mueble + rubro habilitado. Resto: OT abierta. */
export function targetError(w: CoreWorld, e: Employee, t: TimeEntryTarget): string | null {
  if (!t.projectId) return t.rubroId ? "El Trabajo interno no lleva rubro." : null;
  const p = byId(w.projects, t.projectId);
  if (!p || p.status === "closed" || (p.status === "quotation" && isWorker(w, e))) return "Esa OT no está habilitada para cargar horas.";
  if (isWorker(w, e)) {
    if (!isPlantProject(p)) return `${p.ot} no está en Producción.`;
    if (!t.itemId || !p.items.some((i) => i.id === t.itemId)) return "Elegí el mueble.";
    if (!t.rubroId || !enabledRubros(w, p, t.itemId).includes(t.rubroId)) return "Elegí un rubro permitido para ese mueble.";
    return null;
  }
  if (t.rubroId) return "Las horas de Diseño, Administración o Compras no llevan rubro de obrero.";
  if (t.itemId && !p.items.some((i) => i.id === t.itemId)) return "Ese mueble no es de la OT.";
  return null;
}

/**
 * Guarda las horas de una persona en un día. Reemplaza lo que esa persona cargó ese día mientras Planta no lo revisó
 * (cada persona registra una sola vez por tarea; si ya se revisó, se corrige desde Planta).
 */
export function saveDayHours(w: CoreWorld, input: { employeeId: string; date: string; rows: Array<TimeEntryTarget & { note?: string }> }, ctx: OpCtx): CoreWorld {
  const e = must(byId(w.employees, input.employeeId), "No encontramos la persona.");
  if (ctx.actorId !== e.id) throw new CoreError("Solo cargás tus propias horas.");
  if (!isISODate(input.date) || input.date > ctx.today) throw new CoreError("No se cargan horas de días futuros.");
  const existing = w.timeEntries.filter((t) => t.employeeId === e.id && t.date === input.date);
  if (existing.some((t) => t.review)) throw new CoreError("Planta ya revisó este día: si hay algo para cambiar, pedile la corrección al Jefe de planta.");
  const rows = input.rows.filter((r) => r.hours > 0).map((r) => ({ ...r, projectId: r.projectId || undefined, itemId: r.itemId || undefined, rubroId: r.rubroId || undefined }));
  const v = hoursDayErrors(w, { employee: e, date: input.date, rows }, (r) => targetError(w, e, r));
  if (v.errors.length) throw new CoreError(v.errors.join(" "));
  let next: CoreWorld = { ...w, timeEntries: w.timeEntries.filter((t) => !(t.employeeId === e.id && t.date === input.date)) };
  const key = (r: TimeEntryTarget) => `${r.projectId ?? ""}|${r.itemId ?? ""}|${r.rubroId ?? ""}`;
  for (const r of rows) {
    const prev = existing.find((t) => key(t) === key(r));
    let id = prev?.id;
    if (!id) {
      const [nid, w2] = nextId(next, "hs");
      next = w2;
      id = nid;
    }
    next = { ...next, timeEntries: [...next.timeEntries, { id, employeeId: e.id, date: input.date, projectId: r.projectId, itemId: r.itemId, rubroId: r.rubroId, hours: r2(r.hours), note: text(r.note) || undefined, createdBy: ctx.actor, createdAt: prev?.createdAt ?? ctx.now, corrections: [] }] };
  }
  return next;
}

/** Para pantallas: el total de un día ya guardado. */
export const savedDayTotal = (w: CoreWorld, employeeId: string, date: string) => r2(sumBy(w.timeEntries.filter((t) => t.employeeId === employeeId && t.date === date), (t) => t.hours));

