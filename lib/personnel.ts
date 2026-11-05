import type { Ledger, Operator, FrontendPersonnel, HourCategory, PriceRecord } from "@/types";
import { DomainError } from "./project-operations";
import { valueAt } from "./price-history";
import { SESSION_KEYS } from "./permissions";

export const personnelViews = (p: FrontendPersonnel) => p.views ?? [p.view];
export function laborCategories(ledger: Ledger, employeeId: string, activeOnly = true) {
  const ids = ledger.personnel?.find((p) => p.employeeId === employeeId)?.categoryIds ?? [];
  return (ledger.staffCategories ?? []).filter((c) => ids.includes(c.id) && (!activeOnly || c.active !== false));
}
/** Category price valid on the effective date, never the most recently scheduled future price. */
export function categoryCostAt(category:NonNullable<Ledger["staffCategories"]>[number],date:string):number | undefined {
 return category.rates?.filter((r)=>r.validFrom<=date).sort((a,b)=>a.validFrom.localeCompare(b.validFrom)||a.at.localeCompare(b.at)).at(-1)?.hourlyCost ?? (category.rates?.length ? undefined : category.hourlyCost);
}
/** Individual exception, otherwise the selected labor category, effective on the worked date. */
export function employeeCost(ledger: Ledger, employee: Operator, date: string, categoryId?: string, history: PriceRecord[] = []): { hourlyCost:number; categoryId?:string; category?:HourCategory } {
  const setup = ledger.personnel?.find((p) => p.employeeId === employee.id);
  const categories = laborCategories(ledger,employee.id);
  if (setup?.categoryIds?.length && !categories.length) throw new DomainError("Sin categoría laboral activa: revisá Personal antes de registrar horas nuevas.");
  if (categories.length > 1 && !categoryId) throw new DomainError("Elegí la categoría laboral correspondiente al trabajo realizado.");
  const category = categoryId ? categories.find((c) => c.id === categoryId) : categories[0];
  if (categoryId && !category) throw new DomainError("La categoría no está habilitada para la persona.");
  const individual = ledger.rates.filter((r) => r.scope === "employee" && r.subjectId === employee.id && r.validFrom <= date).sort((a,b) => a.validFrom.localeCompare(b.validFrom) || a.createdAt.localeCompare(b.createdAt)).at(-1);
  const categoryRate = category ? categoryCostAt(category,date) : undefined;
  const cost = individual?.hourlyRate ?? categoryRate;
  if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) throw new DomainError("Sin tarifa laboral válida para la fecha trabajada.");
  if (cost !== undefined) return { hourlyCost:cost,categoryId:category?.id,category:category?.category };
  // Legacy employees have an explicit stored personal cost, never infer a category from role/rubro text.
  if (!setup?.categoryIds?.length && Number.isFinite(employee.hourlyCost) && employee.hourlyCost >= 0) return { hourlyCost:valueAt(history,"operator_cost",employee.id,date,employee.hourlyCost) };
  throw new DomainError("Sin tarifa laboral vigente para la fecha trabajada.");
}
export function savePersonnel(ledger: Ledger, operators: Operator[], input: FrontendPersonnel): Ledger {
  if (!operators.some((o) => o.id === input.employeeId)) throw new DomainError("Persona inexistente.");
  if (!personnelViews(input).length || personnelViews(input).some((v) => !SESSION_KEYS.includes(v))) throw new DomainError("Elegí al menos una de las cinco vistas.");
  if (input.hoursPerDay !== undefined && (!Number.isFinite(input.hoursPerDay) || input.hoursPerDay <= 0 || input.hoursPerDay > 24)) throw new DomainError("La jornada debe estar entre 0 y 24 horas.");
  if (input.workDays?.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new DomainError("Días laborales inválidos.");
  if (input.categoryIds?.some((id) => !ledger.staffCategories?.some((c) => c.id === id && (c.active !== false || ledger.personnel?.find((p)=>p.employeeId===input.employeeId)?.categoryIds?.includes(id))))) throw new DomainError("Categoría laboral inactiva o inexistente.");
  if (input.enabledRubros?.some((id) => !ledger.rubroCatalog.some((r) => r.id === id && r.active))) throw new DomainError("Rubro productivo inactivo o inexistente.");
  if(input.categoryIds?.length){const productive=ledger.staffCategories?.some(c=>input.categoryIds?.includes(c.id)&&c.category==="labor")??false;input={...input,productive,enabledRubros:productive?input.enabledRubros:[]};}
  return { ...ledger,personnel:[...(ledger.personnel ?? []).filter((p) => p.employeeId !== input.employeeId),{ ...input,views:[...new Set(personnelViews(input))] }] };
}

export interface EmployeeEdit {
  id?: string;
  name: string;
  email?: string;
  active: boolean;
  profile: Omit<FrontendPersonnel,"employeeId">;
  reassignmentPlan?: Record<string,string | null>;
  individualRate?: { hourlyCost:number; validFrom:string };
}

/** Configured demo views are explicit; legacy workforce entries keep their existing access until configured. */
export function demoOperatorEligible(ledger:Pick<Ledger,"personnel">,employee:Operator) {
 const setup=ledger.personnel?.find((p)=>p.employeeId===employee.id);
 return employee.active && (!setup || (setup.enabled && personnelViews(setup).includes("operario")));
}
