// ─────────────────────────────────────────────────────────────
// Cálculos económicos de Blerp — funciones puras, sin UI ni estado.
//
// Principio central:
//   COMPRA ≠ CONSUMO ≠ DESPERDICIO ≠ SOBRANTE REUTILIZABLE
//   costo imputable de material = consumo + desperdicio (nunca la compra)
// ─────────────────────────────────────────────────────────────
import type { BudgetCategory, BudgetLine, MaterialUsageEntry, Project, Ledger, HourCategory } from "@/types";
import { ACTIVE_STATUSES, CATEGORY_ORDER } from "./constants";

export type CategoryAmounts = Record<BudgetCategory, number>;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function emptyCategoryAmounts(): CategoryAmounts {
  return CATEGORY_ORDER.reduce((acc, c) => {
    acc[c] = 0;
    return acc;
  }, {} as CategoryAmounts);
}

// ── Presupuesto ───────────────────────────────────────────────

/** quantity × unitCost, o monto directo (unitCost) si no aplica cantidad. */
export function budgetLineTotal(line: Pick<BudgetLine, "quantity" | "unitCost">): number {
  if (line.quantity === null) return round2(line.unitCost);
  return round2(line.quantity * line.unitCost);
}

export function budgetTotal(lines: BudgetLine[]): number {
  return round2(lines.reduce((s, l) => s + l.total, 0));
}

export function budgetByCategory(lines: BudgetLine[]): CategoryAmounts {
  const acc = emptyCategoryAmounts();
  for (const l of lines) acc[l.category] += l.total;
  return acc;
}

// ── Márgenes (helpers) ────────────────────────────────────────

/** ¿Hay precio de venta cargado? Sin precio no hay ganancia ni rentabilidad que mostrar. */
export function hasSalesPrice(salesPrice: number): boolean {
  return Number.isFinite(salesPrice) && salesPrice > 0;
}

/** Ganancia = precio de venta − costo. null sin precio de venta (nunca un negativo engañoso). */
export function profitOrNull(salesPrice: number, cost: number): number | null {
  return hasSalesPrice(salesPrice) ? round2(salesPrice - cost) : null;
}

/** Devuelve null cuando no hay precio de venta (evita divisiones por cero y márgenes engañosos). */
export function marginPercent(profit: number, salesPrice: number): number | null {
  if (!salesPrice || salesPrice <= 0) return null;
  return (profit / salesPrice) * 100;
}

export function expectedProfit(salesPrice: number, lines: BudgetLine[]): number {
  return salesPrice - budgetTotal(lines);
}

export function expectedMargin(salesPrice: number, lines: BudgetLine[]): number | null {
  return marginPercent(expectedProfit(salesPrice, lines), salesPrice);
}

// ── Materiales ────────────────────────────────────────────────

export function usageConsumedCost(u: Pick<MaterialUsageEntry, "quantityConsumed" | "unitCost">): number {
  return round2(u.quantityConsumed * u.unitCost);
}

export function usageWasteCost(u: Pick<MaterialUsageEntry, "wasteQuantity" | "unitCost">): number {
  return round2(u.wasteQuantity * u.unitCost);
}

/** Costo imputable al proyecto por un registro de uso: consumo + desperdicio. El sobrante NO se imputa. */
export function usageProjectCost(
  u: Pick<MaterialUsageEntry, "quantityConsumed" | "wasteQuantity" | "unitCost">,
): number {
  return round2(usageConsumedCost(u) + usageWasteCost(u));
}

export function usageLeftoverValue(u: Pick<MaterialUsageEntry, "reusableLeftoverQuantity" | "unitCost">): number {
  return round2(u.reusableLeftoverQuantity * u.unitCost);
}

/** Costo real de materiales: sale SOLO de los registros de uso, no de las compras. */
export function materialActualCost(usages: MaterialUsageEntry[]): number {
  return round2(usages.reduce((s, u) => s + usageProjectCost(u), 0));
}

export function materialWasteCost(usages: MaterialUsageEntry[]): number {
  return round2(usages.reduce((s, u) => s + usageWasteCost(u), 0));
}

export function reusedMaterialValue(usages: MaterialUsageEntry[]): number {
  return round2(
    usages.filter((u) => u.source === "reused_leftover").reduce((s, u) => s + usageProjectCost(u), 0),
  );
}

export function generatedLeftoverValue(usages: MaterialUsageEntry[]): number {
  return round2(usages.reduce((s, u) => s + usageLeftoverValue(u), 0));
}

export function purchasesTotal(project: Pick<Project, "purchaseEntries">): number {
  return round2(project.purchaseEntries.reduce((s, p) => s + p.total, 0));
}

// ── Costos reales ─────────────────────────────────────────────

export function nonMaterialActualCost(project: Pick<Project, "actualEntries">): number {
  return round2(project.actualEntries.reduce((s, e) => s + e.amount, 0));
}

export function actualCostToDate(project: Pick<Project, "actualEntries" | "materialUsages">): number {
  return round2(materialActualCost(project.materialUsages) + nonMaterialActualCost(project));
}

export function actualByCategory(project: Pick<Project, "actualEntries" | "materialUsages"> & Partial<Pick<Project,"id">>, ledger?:Ledger): CategoryAmounts {
  const acc = emptyCategoryAmounts();
  acc.materials = materialActualCost(project.materialUsages);
  for (const e of project.actualEntries) acc[e.category] += e.amount;
  if(ledger&&project.id){
    for(const row of staffCostRecords(project.id,ledger))acc[row.category]+=row.amount??0;
    acc.labor+=(ledger.externalWork??[]).filter(e=>e.projectId===project.id&&e.status!=="commissioned").reduce((sum,e)=>sum+(e.confirmedCost??e.estimatedCost??0),0);
  }
  return acc;
}

// ── Desvíos ───────────────────────────────────────────────────

export interface Variance {
  amount: number;
  /** null cuando no había presupuesto para la categoría. */
  percent: number | null;
}

export function categoryVariance(actual: number, budget: number): Variance {
  const amount = round2(actual - budget);
  if (!budget) return { amount, percent: null };
  return { amount, percent: (amount / budget) * 100 };
}

/** Por categoría: si todavía gasté menos que el presupuesto, asumo que se consumirá el presupuesto; si gasté más, uso el real. */
export function projectedCategoryCost(budget: number, actual: number): number {
  return Math.max(budget, actual);
}

/** Regla transparente: real + cantidades presupuestadas pendientes, sin descontar sobrecostos ya ocurridos.
 * Si no hay cantidades identificables, mantiene el piso max(presupuesto, real).
 * No usa la factura como consumo ni interpreta plazo transcurrido como avance físico.
 */
export function projectedAmounts(project: Pick<Project,"budgetLines"|"actualEntries"|"materialUsages"> & Partial<Pick<Project,"purchaseEntries"|"id">>,ledger?:Ledger): CategoryAmounts {
  const budget = budgetByCategory(project.budgetLines);
  const actual = actualByCategory(project,ledger);
  const out = emptyCategoryAmounts();
  for (const category of CATEGORY_ORDER) out[category] = Math.max(budget[category],actual[category]);
  const materialLines = project.budgetLines.filter(l=>l.category === "materials");
  // Solo extrapola cuando todas las líneas tienen material y unidad: evita inventar correspondencias.
  if (materialLines.length && materialLines.every(l=>l.materialId && l.quantity !== null && l.quantity > 0)) {
    let remaining = 0;
    for (const key of new Set(materialLines.map(l=>`${l.materialId}|${l.unit}`))) {
      const lines = materialLines.filter(l=>`${l.materialId}|${l.unit}` === key);
      const quantity = lines.reduce((sum,l)=>sum+(l.quantity ?? 0),0);
      const used = project.materialUsages.filter(u=>`${u.materialId}|${u.unit}` === key).reduce((sum,u)=>sum+u.quantityConsumed+u.wasteQuantity,0);
      const budgetRate = lines.reduce((sum,l)=>sum+l.total,0)/quantity;
      const latest = (project.purchaseEntries ?? []).filter(e=>`${e.materialId}|${e.unit}` === key).sort((a,b)=>b.date.localeCompare(a.date))[0];
      remaining += Math.max(0,quantity-used)*Math.max(budgetRate,latest?.unitCost ?? budgetRate);
    }
    out.materials = Math.max(out.materials,actual.materials+remaining);
  }
  for (const category of ["labor","design","admin"] as const) {
    out[category]=laborCostDetails(project,ledger).filter(r=>r.category===category).reduce((sum,r)=>sum+r.projected,0);
  }
  for (const category of CATEGORY_ORDER) out[category]=round2(out[category]);
  return out;
}

export interface CategoryRow {
  category: BudgetCategory;
  budget: number;
  actual: number;
  projected: number;
  /** real − presupuesto (puede ser negativo si todavía no se ejecutó). */
  actualVariance: Variance;
  /** proyectado − presupuesto (solo sobrecostos ya materializados). */
  projectedVariance: Variance;
}

/** Siempre las siete categorías de reporte, en el mismo orden (aunque estén en cero). */
export function categoryBreakdown(project: Project,ledger?:Ledger): CategoryRow[] {
  const b = budgetByCategory(project.budgetLines);
  const a = actualByCategory(project,ledger);
  const completed = project.status === "completed";
  const projection = projectedAmounts(project,ledger);
  return CATEGORY_ORDER.map((category) => {
    const projected = completed ? a[category] : projection[category];
    return {
      category,
      budget: b[category],
      actual: round2(a[category]),
      projected: round2(projected),
      actualVariance: categoryVariance(a[category], b[category]),
      projectedVariance: categoryVariance(projected, b[category]),
    };
  });
}

// ── Rentabilidad proyectada y final ─────────────────────────────────

export function projectedFinalCost(project: Pick<Project, "budgetLines" | "actualEntries" | "materialUsages"> & Partial<Pick<Project,"purchaseEntries"|"id">>,ledger?:Ledger): number {
  const projected = projectedAmounts(project,ledger);
  return round2(CATEGORY_ORDER.reduce((sum,category)=>sum+projected[category],0));
}

export function projectedProfit(project: Project): number {
  return project.salesPrice - projectedFinalCost(project);
}

export function projectedMargin(project: Project): number | null {
  return marginPercent(projectedProfit(project), project.salesPrice);
}

/** Rentabilidad real final: solo existe cuando el proyecto está finalizado. */
export function finalMargin(project: Project): number | null {
  if (project.status !== "completed") return null;
  return marginPercent(project.salesPrice - actualCostToDate(project), project.salesPrice);
}

export function marginDeltaPoints(expected: number | null, projected: number | null): number | null {
  if (expected === null || projected === null) return null;
  return projected - expected;
}

// ── Resumen económico del proyecto ────────────────────────────

export interface ProjectEconomics {
  laborDetails?: LaborCostDetail[];
  salesPrice: number;
  /** false = sin precio de venta: ganancias y márgenes son null y se muestran como "—". */
  hasSalesPrice: boolean;
  /** true = todavía no hay consumos ni costos registrados. */
  hasExecutionData: boolean;
  budgetTotal: number;
  expectedProfit: number | null;
  expectedMargin: number | null;
  actualCostToDate: number;
  materialActualCost: number;
  nonMaterialActualCost: number;
  purchasesTotal: number;
  /** Para proyectos finalizados coincide con el costo real final. */
  projectedFinalCost: number;
  projectedProfit: number | null;
  projectedMargin: number | null;
  finalActualCost: number | null;
  finalProfit: number | null;
  finalMargin: number | null;
  /** Margen “vigente”: real si está cerrado, proyectado si no. */
  currentMargin: number | null;
  marginDeltaPp: number | null;
  /** "Diferencia": costo final proyectado (o real final) − costo presupuestado. */
  costOverrun: number;
  costOverrunPercent: number | null;
  categories: CategoryRow[];
  mainDeviation: CategoryRow | null;
}

export function projectEconomics(project: Project,ledger?:Ledger): ProjectEconomics {
  const bt = budgetTotal(project.budgetLines);
  const em = marginPercent(project.salesPrice - bt, project.salesPrice);
  const actual = round2(Object.values(actualByCategory(project,ledger)).reduce((s,n)=>s+n,0));
  const completed = project.status === "completed";
  const projected = completed ? actual : projectedFinalCost(project,ledger);
  const pm = marginPercent(project.salesPrice - projected, project.salesPrice);
  const categories = categoryBreakdown(project,ledger);
  const fm = completed ? marginPercent(project.salesPrice - actual, project.salesPrice) : null;
  // La Diferencia es la suma de los desvíos por categoría: el total de la tabla de desvío siempre cierra exacto.
  const overrun = round2(categories.reduce((s, c) => s + c.projectedVariance.amount, 0));
  return {
    salesPrice: project.salesPrice,
    hasSalesPrice: hasSalesPrice(project.salesPrice),
    hasExecutionData: project.materialUsages.length > 0 || project.actualEntries.length > 0 || !!ledger&&(staffCostRecords(project.id,ledger).length>0||(ledger.externalWork??[]).some(e=>e.projectId===project.id&&e.status!=="commissioned")),
    budgetTotal: bt,
    expectedProfit: profitOrNull(project.salesPrice, bt),
    expectedMargin: em,
    actualCostToDate: actual,
    materialActualCost: materialActualCost(project.materialUsages),
    nonMaterialActualCost: round2(actual-materialActualCost(project.materialUsages)),
    purchasesTotal: purchasesTotal(project),
    projectedFinalCost: projected,
    projectedProfit: profitOrNull(project.salesPrice, projected),
    projectedMargin: pm,
    finalActualCost: completed ? actual : null,
    finalProfit: completed ? profitOrNull(project.salesPrice, actual) : null,
    finalMargin: fm,
    currentMargin: completed ? fm : pm,
    marginDeltaPp: marginDeltaPoints(em, completed ? fm : pm),
    costOverrun: overrun,
    costOverrunPercent: bt ? (overrun / bt) * 100 : null,
    categories,
    laborDetails:laborCostDetails(project,ledger),
    mainDeviation: mainDeviation(categories),
  };
}

/** Categoría con mayor sobrecosto (proyectado − presupuesto). null si ninguna está por encima. */
export function mainDeviation(rows: CategoryRow[]): CategoryRow | null {
  let best: CategoryRow | null = null;
  for (const r of rows) {
    if (r.projectedVariance.amount <= 0) continue;
    if (!best || r.projectedVariance.amount > best.projectedVariance.amount) best = r;
  }
  return best;
}

// ── Agregados (dashboard) ─────────────────────────────────────

export function isActiveProject(p: Project): boolean {
  return !p.isClosed && ACTIVE_STATUSES.includes(p.status);
}

export interface AggregateMargins {
  count: number;
  totalSales: number;
  totalBudget: number;
  totalProjectedCost: number;
  expectedAggregateMargin: number | null;
  projectedAggregateMargin: number | null;
}

/** Margen agregado ponderado por venta (NO promedio simple de márgenes). */
export function aggregateMargins(projects: Project[]): AggregateMargins {
  let totalSales = 0;
  let totalBudget = 0;
  let totalProjectedCost = 0;
  for (const p of projects) {
    totalSales += p.salesPrice;
    totalBudget += budgetTotal(p.budgetLines);
    totalProjectedCost += projectedFinalCost(p);
  }
  return {
    count: projects.length,
    totalSales,
    totalBudget,
    totalProjectedCost,
    expectedAggregateMargin: marginPercent(totalSales - totalBudget, totalSales),
    projectedAggregateMargin: marginPercent(totalSales - totalProjectedCost, totalSales),
  };
}

// ── Actividad / registros ─────────────────────────────────────

/** Fecha del último registro real (consumo o costo). Las compras no cuentan como registro de ejecución. */
export function lastRecordDate(project: Pick<Project, "actualEntries" | "materialUsages">): string | null {
  const dates = [...project.actualEntries.map((e) => e.date), ...project.materialUsages.map((u) => u.date)];
  if (dates.length === 0) return null;
  return dates.sort().at(-1) ?? null;
}

export interface StaffCostRecord {
 id:string;employeeId:string;date:string;categoryId?:string;name:string;category:HourCategory;
 hours:number|null;amount:number|null;allocated:boolean;task:string;hourlyCost?:number;
}
/** Proyección de lectura de los registros originales: no crea entradas productivas ni persiste copias. */
export function staffCostRecords(projectId:string,ledger:Ledger):StaffCostRecord[]{
 return ledger.internalHours.flatMap(h=>{
  const allocated=h.projectId!==projectId;
  if(allocated&&!h.allocations?.some(a=>a.projectId===projectId))return [];
  const category=ledger.staffCategories?.find(c=>c.id===h.categoryId);
  const costCategory=h.costCategory??(category?.category!=="labor"?category?.category:undefined)??"admin";
  return [{id:h.id,employeeId:h.employeeId,date:h.date,categoryId:h.categoryId,name:allocated?"Trabajo interno general distribuido":h.categoryName??category?.name??"Personal sin categoría histórica",category:allocated?"admin":costCategory,
   hours:allocated?null:h.hours,amount:allocated?round2((h.allocations??[]).filter(a=>a.projectId===projectId).reduce((s,a)=>s+a.amount,0)):h.hourlyCost===undefined?null:round2(h.hours*h.hourlyCost),allocated,task:h.task,hourlyCost:h.hourlyCost}];
 });
}
export interface LaborCostDetail {
 key:string;category:HourCategory;categoryId?:string;name:string;rubro?:BudgetLine["rubro"];budget:number;actual:number;estimatedHours:number;actualHours:number;remaining:number;projected:number;
 sources:Array<{id:string;date:string;hours:number|null;amount:number;description:string;employeeId?:string;itemId?:string}>;
}
/** Sustitución por categoría identificable y rubro; no reparte costos ni horas entre muebles históricos. */
export function laborCostDetails(project:Pick<Project,"budgetLines"|"actualEntries">&Partial<Pick<Project,"id">>,ledger?:Ledger):LaborCostDetail[]{
 const rows=new Map<string,LaborCostDetail>();
 const categoryOf=(l:BudgetLine)=>l.staffCategoryId??(ledger?.staffCategories?.some(c=>c.id===l.hourRateId)?l.hourRateId:undefined);
 const ensure=(category:HourCategory,id:string|undefined,rubro:BudgetLine["rubro"],name:string,suffix="")=>{
  const key=`${category}|${id??"legacy"}|${category==="labor"?rubro??"":""}|${suffix}`;
  if(!rows.has(key))rows.set(key,{key,category,categoryId:id,name,rubro,budget:0,actual:0,estimatedHours:0,actualHours:0,remaining:0,projected:0,sources:[]});
  return rows.get(key)!;
 };
 for(const l of project.budgetLines){
  if(!["labor","design","admin"].includes(l.category))continue;
  const id=categoryOf(l),name=l.staffCategoryName??ledger?.staffCategories?.find(c=>c.id===id)?.name??(l.category==="labor"?"Trabajo productivo":"Agrupación histórica sin categoría identificada");
  const row=ensure(l.category as HourCategory,id,l.rubro,name,l.unit==="h"&&l.quantity!==null?"":"importe");row.budget+=l.total;if(l.unit==="h"&&l.quantity!==null)row.estimatedHours+=l.quantity;
 }
 const add=(category:HourCategory,id:string|undefined,rubro:BudgetLine["rubro"],name:string,source:LaborCostDetail["sources"][number],separate=false)=>{
  let row:LaborCostDetail|undefined;
  if(!separate&&category==="labor"&&source.itemId){
    const ids=new Set(project.budgetLines.filter(l=>l.category==="labor"&&l.rubro===rubro&&l.quotationItemId===source.itemId).map(categoryOf));
    if(ids.size===1)row=[...rows.values()].find(r=>r.category==="labor"&&r.rubro===rubro&&ids.has(r.categoryId)&&r.estimatedHours>0);
  }
  if(!separate&&!row){
    const aggregate=[...rows.values()].filter(r=>r.category===category&&(category!=="labor"||r.rubro===rubro||!r.rubro)&&r.budget>0);
    if(aggregate.length===1&&!aggregate[0].categoryId&&aggregate[0].key.endsWith("importe"))row=aggregate[0];
  }
  if(!separate&&!row){row=[...rows.values()].find(r=>r.category===category&&r.categoryId===id&&(category!=="labor"||r.rubro===rubro)&&!r.key.endsWith("importe"));
   if(!row){const legacy=[...rows.values()].filter(r=>r.category===category&&!r.categoryId&&(category!=="labor"||r.rubro===rubro)&&!r.key.endsWith("importe"));if(legacy.length===1)row=legacy[0];}
  }
  if(!row&&!separate&&category==="labor"){
    let candidates=[...rows.values()].filter(r=>r.category===category&&r.rubro===rubro&&r.estimatedHours>0);
    if(source.itemId){const ids=new Set(project.budgetLines.filter(l=>l.category==="labor"&&l.rubro===rubro&&l.quotationItemId===source.itemId).map(categoryOf));if(ids.size)candidates=candidates.filter(r=>ids.has(r.categoryId));}
    if(candidates.length===1)row=candidates[0];
  }
  row??=ensure(category,id,rubro,name,separate?`indirecto:${source.id}`:source.hours===null?"importe":"");
  row.actual+=source.amount;row.actualHours+=source.hours??0;row.sources.push(source);
 };
 for(const e of project.actualEntries){if(!["labor","design","admin"].includes(e.category))continue;add(e.category as HourCategory,e.categoryId,e.rubro,ledger?.staffCategories?.find(c=>c.id===e.categoryId)?.name??e.description,{id:e.id,date:e.date,hours:e.labor?.hours??null,amount:e.amount,description:e.description,employeeId:e.operatorId,itemId:e.itemId});}
 if(ledger&&project.id){
  for(const h of staffCostRecords(project.id,ledger))add(h.category,h.categoryId,undefined,h.name,{id:h.id,date:h.date,hours:h.hours,amount:h.amount??0,description:h.task,employeeId:h.employeeId},h.allocated);
  for(const e of (ledger.externalWork??[]).filter(e=>e.projectId===project.id&&e.status!=="commissioned"))add("labor",undefined,e.rubro,"Trabajo externo",{id:e.id,date:e.completedDate??e.date,hours:e.kind==="hourly"?e.hours??null:null,amount:e.confirmedCost??e.estimatedCost??0,description:e.description},true);
 }
 return [...rows.values()].map(r=>{const remaining=Math.max(0,r.estimatedHours-r.actualHours)*(r.estimatedHours>0?r.budget/r.estimatedHours:0);return {...r,budget:round2(r.budget),actual:round2(r.actual),remaining:round2(remaining),projected:round2(Math.max(r.budget,r.actual+remaining))};});
}
