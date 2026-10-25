// Órdenes de compra registradas, recepciones y pagos a proveedores. Puras.
import type { CoreWorld, ISODate, OrderLine, PurchaseOrder, SupplierPayment } from "./types";
import { EPS, money, qty, sumBy } from "./util";

export const lineValue = (l: Pick<OrderLine, "quantity" | "unitPrice">) => money(l.quantity * l.unitPrice);
export const orderTotal = (o: Pick<PurchaseOrder, "lines">) => money(sumBy(o.lines, lineValue));

/** Recibido neto de una línea (las recepciones revertidas no cuentan), hasta una fecha opcional. */
export function lineReceived(w: Pick<CoreWorld, "receipts">, lineId: string, until?: ISODate): number {
  return qty(
    sumBy(
      w.receipts.filter((r) => r.lineId === lineId && (!until || r.date <= until) && !(r.reversal && (!until || r.reversal.date <= until))),
      (r) => r.quantity,
    ),
  );
}

export const linePending = (w: Pick<CoreWorld, "receipts">, l: OrderLine) => qty(Math.max(0, l.quantity - lineReceived(w, l.id)));

export type OrderState = "pending" | "partial" | "received";

export function orderState(w: Pick<CoreWorld, "receipts">, o: PurchaseOrder): OrderState {
  const received = sumBy(o.lines, (l) => lineReceived(w, l.id));
  if (received <= EPS) return "pending";
  return o.lines.every((l) => linePending(w, l) <= EPS) ? "received" : "partial";
}

export const ORDER_STATE_LABELS: Record<OrderState, string> = { pending: "Sin recibir", partial: "Recibida en parte", received: "Recibida" };

export const isOpenOrder = (w: Pick<CoreWorld, "receipts">, o: PurchaseOrder) => orderState(w, o) !== "received";

export function nextOrderNumber(orders: Pick<PurchaseOrder, "number">[]): string {
  const max = orders.reduce((m, o) => Math.max(m, Number(o.number.replace(/\D/g, "")) || 0), 0);
  return `OC-${String(max + 1).padStart(4, "0")}`;
}

/** Tope pagable: el comprobante del proveedor si está cargado; si no, el total de la OC. */
export const payableLimit = (o: PurchaseOrder) => (o.invoice?.amount && o.invoice.amount > 0 ? money(o.invoice.amount) : orderTotal(o));
export const paidOf = (w: Pick<CoreWorld, "supplierPayments">, orderId: string) => money(sumBy(w.supplierPayments.filter((p) => p.orderId === orderId), (p) => p.amount));

/**
 * Reparte un pago entre las líneas de la OC: con OT explícita, solo entre las líneas de esa OT; si no, entre todas,
 * proporcional al valor de cada línea. Es solo atribución del desembolso (no es un costo de material).
 */
export function paymentByLine(o: PurchaseOrder, pay: Pick<SupplierPayment, "amount" | "projectId">): Map<string, number> {
  const lines = pay.projectId ? o.lines.filter((l) => l.projectId === pay.projectId) : o.lines;
  const total = sumBy(lines, lineValue);
  const out = new Map<string, number>();
  if (total <= 0) return out;
  let assigned = 0;
  lines.forEach((l, i) => {
    const part = i === lines.length - 1 ? money(pay.amount - assigned) : money((pay.amount * lineValue(l)) / total);
    assigned = money(assigned + part);
    out.set(l.id, part);
  });
  return out;
}

/** Pagado atribuido a cada OT (línea sin OT = "stock"). */
export function paidByProject(w: CoreWorld, o: PurchaseOrder): Map<string, number> {
  const out = new Map<string, number>();
  for (const pay of w.supplierPayments.filter((p) => p.orderId === o.id)) {
    for (const [lineId, amount] of paymentByLine(o, pay)) {
      const key = o.lines.find((l) => l.id === lineId)?.projectId ?? "stock";
      out.set(key, money((out.get(key) ?? 0) + amount));
    }
  }
  return out;
}

/** Líneas y monto de una OC imputables a una OT (una OC puede abarcar varias OTs). */
export function orderPartFor(o: PurchaseOrder, projectId: string): { lines: OrderLine[]; amount: number } {
  const lines = o.lines.filter((l) => l.projectId === projectId);
  return { lines, amount: money(sumBy(lines, lineValue)) };
}

export const ordersOfProject = (w: CoreWorld, projectId: string) => w.orders.filter((o) => o.lines.some((l) => l.projectId === projectId));
