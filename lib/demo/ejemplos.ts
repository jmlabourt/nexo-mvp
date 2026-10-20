// ─────────────────────────────────────────────────────────────
// DATOS DE EJEMPLO del frontend (no son datos reales ni están en la base).
//
// Sirven para ver y probar las pantallas que todavía no tienen persistencia (facturación al cliente, oportunidades,
// capacidad, parámetros, contactos de clientes y proveedores, Diseño y BOM de cada mueble). Se muestran SOLO en la
// demo y siempre con la etiqueta "Datos de ejemplo". En una empresa real esas pantallas quedan sin datos hasta que el
// backend los guarde (PENDIENTES_BACKEND.md). Las cifras salen de los proyectos de la demo, para que sean coherentes.
// ─────────────────────────────────────────────────────────────
import type { ClientInvoice, ClientRecord, FurnitureDesign, ManagementParams, Opportunity, Project, SupplierRecord } from "@/types";
import { generalState } from "../gerencia";

const round2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Parámetros de Gerencia por defecto (editables en Configuración; el guardado está pendiente). */
export const DEFAULT_MANAGEMENT_PARAMS: ManagementParams = {
  inflationMonthlyPct: 2.5,
  projectCodePattern: "{prefijo}{numero}_{cliente}_{nombre}",
  projectCodePrefix: "OT",
  workRubros: [
    { name: "Carpintería madera", active: true },
    { name: "Carpintería metálica", active: true },
    { name: "Pintura / Laqueados", active: true },
    { name: "Embalaje", active: true },
    { name: "Montaje", active: true },
    { name: "Diseño", active: true },
    { name: "Visuales", active: true },
  ],
  roleToRubro: {
    Carpintería: "Carpintería madera",
    Armado: "Carpintería madera",
    Herrería: "Carpintería metálica",
    "Embalaje y terminaciones": "Embalaje",
    "Oficina técnica": "Diseño",
  },
};

/**
 * Facturación de ejemplo coherente con cada proyecto: anticipo del 50 % al inicio y saldo a la entrega.
 * Cerrados: todo facturado (y cobrado). En curso: anticipo facturado si ya empezó; saldo previsto a la entrega.
 * Aprobados sin empezar: anticipo previsto al inicio. Una cotización no tiene facturación.
 */
export function exampleInvoices(projects: Project[], today: string): ClientInvoice[] {
  const out: ClientInvoice[] = [];
  let n = 1;
  const inv = (p: Project, status: ClientInvoice["status"], date: string, amount: number, concept: string, collected?: string): ClientInvoice => ({
    id: `fx-${p.id}-${concept}`,
    projectId: p.id,
    status,
    date,
    amount: round2(amount),
    number: status === "issued" ? `A-0001-${String(n++).padStart(8, "0")}` : undefined,
    dueDate: status === "issued" ? addDays(date, 30) : undefined,
    collectedAt: collected,
    concept,
  });
  for (const p of [...projects].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const st = generalState(p);
    if (st === "quotation" || !(p.salesPrice > 0)) continue;
    const half = p.salesPrice / 2;
    if (st === "closed") {
      const end = (p.closedAt ?? p.dueDate).slice(0, 10);
      out.push(inv(p, "issued", p.startDate, half, "anticipo", addDays(p.startDate, 20)));
      out.push(inv(p, "issued", end, p.salesPrice - half, "saldo", addDays(end, 25)));
      continue;
    }
    if (p.startDate <= today) {
      // Un anticipo vencido y sin cobrar, para ver la alerta de cobro demorado.
      const collected = p.code === "P-1047" ? undefined : addDays(p.startDate, 15) <= today ? addDays(p.startDate, 15) : undefined;
      out.push(inv(p, "issued", p.startDate, half, "anticipo", collected));
    } else {
      out.push(inv(p, "planned", p.startDate, half, "anticipo"));
    }
    out.push(inv(p, "planned", p.dueDate, p.salesPrice - half, "saldo"));
  }
  return out;
}

/** Información comercial de las cotizaciones de la demo y oportunidades que todavía no son proyecto. */
export function exampleOpportunities(today: string): Opportunity[] {
  return [
    { id: "opp-x-1056", projectId: "p-1056", ref: "P-1056", client: "", name: "", amount: 0, expectedApprovalDate: addDays(today, 10), probability: 70, negotiation: "negotiating", hoursByRubro: {} },
    {
      id: "opp-x-1",
      ref: "Oportunidad 1",
      client: "Cadena Óptica Visión",
      name: "Mobiliario para 6 locales",
      amount: 24_000_000,
      expectedApprovalDate: addDays(today, 14),
      startDate: addDays(today, 21),
      dueDate: addDays(today, 70),
      probability: 50,
      negotiation: "negotiating",
      hoursByRubro: { "Carpintería madera": 520, "Carpintería metálica": 140, Embalaje: 60, Diseño: 80 },
    },
    {
      id: "opp-x-2",
      ref: "Oportunidad 2",
      client: "Feria del Mueble",
      name: "Stand institucional",
      amount: 6_800_000,
      expectedApprovalDate: addDays(today, 5),
      startDate: addDays(today, 12),
      dueDate: addDays(today, 32),
      probability: null,
      negotiation: "sent",
      hoursByRubro: { "Carpintería madera": 160, Embalaje: 20, Diseño: 30 },
    },
    {
      id: "opp-x-3",
      ref: "Oportunidad 3",
      client: "Hotel Puerto",
      name: "Recepción y lobby",
      amount: 15_500_000,
      expectedApprovalDate: addDays(today, 30),
      startDate: addDays(today, 45),
      dueDate: addDays(today, 100),
      probability: 30,
      negotiation: "waiting_client",
      hoursByRubro: { "Carpintería madera": 380, "Carpintería metálica": 90, Diseño: 60 },
    },
  ];
}

/** Contactos de ejemplo para los clientes de la demo (los nombres de cliente salen de los proyectos). */
export function exampleClientDetails(name: string, i: number): Omit<ClientRecord, "id" | "name" | "active"> {
  const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
  return {
    contact: ["Compras", "Gerencia de obra", "Arquitectura", "Administración"][i % 4],
    phone: `11 4${String(300 + i).padStart(3, "0")}-${String(1000 + i * 37).slice(0, 4)}`,
    email: `contacto@${slug || "cliente"}.com.ar`,
    address: ["Av. Corrientes 1200, CABA", "Av. del Libertador 5800, CABA", "Ruta 8 km 52, Pilar", "Av. Colón 3300, Córdoba"][i % 4],
  };
}

/** Proveedores de ejemplo (los nombres salen de las compras de la demo). */
export function exampleSupplierDetails(name: string, i: number): Omit<SupplierRecord, "id" | "name"> {
  const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
  return {
    contact: ["Ventas", "Mostrador", "Cuentas"][i % 3],
    phone: `11 5${String(200 + i).padStart(3, "0")}-${String(2000 + i * 41).slice(0, 4)}`,
    email: `ventas@${slug || "proveedor"}.com.ar`,
    address: ["Parque industrial, Tigre", "Av. Warnes 900, CABA", "Ruta 3 km 30, La Matanza"][i % 3],
    catalogUrl: `https://${slug || "proveedor"}.com.ar/catalogo`,
  };
}

/** Diseño, etapas y BOM de ejemplo para cada mueble (derivados de su estado real en la demo). */
export function exampleFurnitureDesign(p: Project): FurnitureDesign[] {
  const st = generalState(p);
  const materials = p.budgetLines.filter((l) => l.category === "materials" && l.quantity !== null);
  return p.items.map((item, idx) => {
    const done = item.completedUnits >= item.quantity && item.quantity > 0;
    const started = item.completedUnits > 0 || p.actualEntries.some((e) => e.itemId === item.id);
    const stages: FurnitureDesign["stages"] =
      st === "quotation" ? ["design"] : st === "closed" || done ? ["done"] : started ? ["purchasing", "production"] : st === "approved" ? ["design", "purchasing"] : ["purchasing"];
    const share = p.items.length > 0 ? 1 / p.items.length : 1;
    return {
      itemId: item.id,
      designStatus: st === "quotation" ? (idx === 0 ? "sent" : "preparing") : st === "approved" && idx === 0 ? "waiting_approval" : "approved",
      stages,
      bomStatus: st === "quotation" ? "draft" : "ready",
      bom: materials.slice(0, 4).map((l) => ({ material: l.description, quantity: round2((l.quantity ?? 0) * share), unit: l.unit, spec: l.notes })),
    };
  });
}
