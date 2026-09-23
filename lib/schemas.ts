// Validación de formularios (Zod). Mensajes en español.
import { z } from "zod";
import { CATEGORY_ORDER } from "./constants";

const money = (label: string) =>
  z.number({ error: `Ingresá ${label}` }).refine((n) => Number.isFinite(n), `Ingresá ${label}`);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const optionalText = z.string().trim().max(500).optional();

export const projectInfoSchema = z
  .object({
    name: z.string().trim().min(2, "Ingresá un nombre"),
    client: z.string().trim().min(2, "Ingresá el cliente"),
    projectType: z.string().min(1, "Elegí un tipo"),
    description: z.string().trim().max(1000),
    startDate: isoDate,
    dueDate: isoDate,
    owner: z.string().trim().min(2, "Ingresá el responsable"),
    salesPrice: money("el precio de venta").refine((n) => n > 0, "El precio de venta debe ser mayor a 0"),
  })
  .refine((v) => v.dueDate >= v.startDate, { path: ["dueDate"], message: "La entrega no puede ser anterior al inicio" });
export type ProjectInfoValues = z.infer<typeof projectInfoSchema>;

export const budgetLineSchema = z
  .object({
    category: z.enum(CATEGORY_ORDER as [string, ...string[]]),
    description: z.string().trim().min(1, "Describí el concepto"),
    materialId: z.string().optional(),
    quantity: z.number().nullable(),
    unit: z.string().trim().min(1, "Unidad"),
    unitCost: money("el costo").refine((n) => n >= 0, "No puede ser negativo"),
  })
  .refine((v) => v.quantity === null || v.quantity > 0, { path: ["quantity"], message: "Debe ser mayor a 0" });

export const purchaseSchema = z
  .object({
    materialId: z.string().min(1, "Elegí un material"),
    customName: z.string().trim().optional(),
    quantity: money("la cantidad").refine((n) => n > 0, "Debe ser mayor a 0"),
    unit: z.string().trim().min(1, "Indicá la unidad"),
    unitCost: money("el costo unitario").refine((n) => n > 0, "Debe ser mayor a 0"),
    supplier: optionalText,
    date: isoDate,
    notes: optionalText,
  })
  .refine((v) => v.materialId !== "__other__" || (v.customName ?? "").length >= 2, {
    path: ["customName"],
    message: "Indicá el nombre del material",
  });
export type PurchaseValues = z.infer<typeof purchaseSchema>;

export const usageSchema = z
  .object({
    materialId: z.string().min(1, "Elegí un material"),
    customName: z.string().trim().optional(),
    unit: z.string().trim().min(1, "Indicá la unidad"),
    source: z.enum(["purchased_for_project", "existing_stock", "reused_leftover"]),
    reusableMaterialId: z.string().optional(),
    quantityConsumed: money("la cantidad").refine((n) => n >= 0, "No puede ser negativa"),
    hasWaste: z.boolean(),
    wasteQuantity: z.number().min(0, "No puede ser negativa"),
    hasLeftover: z.boolean(),
    leftoverQuantity: z.number().min(0, "No puede ser negativa"),
    unitCost: z.number().min(0).optional(),
    date: isoDate,
    notes: optionalText,
  })
  .refine((v) => v.quantityConsumed + (v.hasWaste ? v.wasteQuantity : 0) > 0, {
    path: ["quantityConsumed"],
    message: "Indicá cuánto se utilizó",
  })
  .refine((v) => !v.hasWaste || v.wasteQuantity > 0, { path: ["wasteQuantity"], message: "Indicá la cantidad desperdiciada" })
  .refine((v) => !v.hasLeftover || v.leftoverQuantity > 0, { path: ["leftoverQuantity"], message: "Indicá la cantidad reutilizable" })
  .refine((v) => v.source !== "reused_leftover" || !!v.reusableMaterialId, {
    path: ["reusableMaterialId"],
    message: "Elegí qué sobrante se usó",
  })
  .refine((v) => v.materialId !== "__other__" || (v.customName ?? "").length >= 2, {
    path: ["customName"],
    message: "Indicá el nombre del material",
  });
export type UsageValues = z.infer<typeof usageSchema>;

export const laborSchema = z.object({
  role: z.string().trim().min(2, "Indicá el rol"),
  workerName: optionalText,
  hours: money("las horas").refine((n) => n > 0 && n <= 1000, "Entre 0 y 1000 horas"),
  hourlyCost: money("el costo por hora").refine((n) => n > 0, "Debe ser mayor a 0"),
  date: isoDate,
  description: optionalText,
});
export type LaborValues = z.infer<typeof laborSchema>;

export const otherCostSchema = z.object({
  supplier: optionalText,
  description: z.string().trim().min(2, "Describí el costo"),
  amount: money("el monto").refine((n) => n > 0, "Debe ser mayor a 0"),
  date: isoDate,
  notes: optionalText,
});
export type OtherCostValues = z.infer<typeof otherCostSchema>;

/** Acepta "0,2" o "0.2" (teclado móvil en es-AR). */
export function parseDecimal(value: string): number {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}
