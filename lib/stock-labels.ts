// Textos de trazabilidad del stock: "comprado para A → transferido a B → consumido en B".
import type { MovementKind, Project, StockLot, StockMovement } from "@/types";
import { formatQty } from "./formatting";

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  purchase_in: "Compra",
  opening: "Stock cargado",
  assign: "Asignado desde stock",
  release: "Devuelto al stock",
  transfer: "Transferencia",
  consume: "Consumo",
  waste: "Desperdicio",
  to_leftover: "Sobrante reutilizable",
  leftover_in: "Ingreso de sobrante",
  supplier_return: "Devuelto al proveedor",
  adjustment: "Ajuste",
};

export function projectCode(projects: Pick<Project, "id" | "code" | "name">[], id: string | undefined): string {
  const p = projects.find((x) => x.id === id);
  return p ? `${p.code}` : "otro proyecto";
}

/** Frase corta para mostrar un movimiento. */
export function movementSentence(
  m: StockMovement,
  lot: StockLot | undefined,
  projects: Pick<Project, "id" | "code" | "name">[],
): string {
  const q = formatQty(m.quantity, lot?.unit ?? "");
  const pid = (p: StockMovement["from"] | StockMovement["to"]) => ("projectId" in p ? projectCode(projects, p.projectId) : "");
  switch (m.kind) {
    case "purchase_in":
      return m.to.type === "project"
        ? `Comprado para ${pid(m.to)}: ${q}${lot?.supplier ? ` a ${lot.supplier}` : ""}.`
        : `Ingresó al stock por compra: ${q}${lot?.supplier ? ` a ${lot.supplier}` : ""}.`;
    case "opening":
      return `Stock cargado: ${q}.`;
    case "assign":
      return `${q} asignados del stock a ${pid(m.to)}.`;
    case "release":
      return `${q} devueltos al stock desde ${pid(m.from)}.`;
    case "transfer":
      return `${q} transferidos de ${pid(m.from)} a ${pid(m.to)}.`;
    case "consume":
      return `${q} consumidos en ${pid(m.from)}.`;
    case "waste":
      return `${q} de desperdicio en ${pid(m.from)}.`;
    case "to_leftover":
      return `${q} quedaron como sobrante reutilizable de ${pid(m.from)}.`;
    case "leftover_in":
      return m.to.type === "project" ? `Sobrante de ${q} asignado a ${pid(m.to)}.` : `Sobrante de ${q} disponible en el stock.`;
    case "supplier_return":
      return `${q} devueltos al proveedor${m.from.type === "project" ? ` desde ${pid(m.from)}` : ""}.`;
    case "adjustment":
      return `${q} dados de baja sin costo: ${m.note ?? "ajuste"}`;
  }
}
