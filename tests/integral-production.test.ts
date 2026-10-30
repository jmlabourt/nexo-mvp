import { describe, it, expect } from "vitest";
import { project, usage } from "./helpers";
import type { Operator, WorkAssignment } from "@/types";
import { EMPTY_LEDGER, registerInternalHours, staffHoursCost, updatedFinancialInput } from "@/lib/ledger";
import { afterPublishedBom, afterMaterialArrival, activeOn, actualStart, confirmExternal, generalAllocations, pendingExternal, registerExternal, weeklyCapacity, withExternalHours } from "@/lib/frontend-work";
import { correctExecution, executeWork } from "@/lib/work-execution";
import { assignmentError } from "@/lib/plant";
import { capacityFromOperators, capacityHours, hoursRows, loadByRubro } from "@/lib/gerencia";
import { closeCheck, profitView, capacityTimeline } from "@/lib/tablero";
import { financialCost } from "@/lib/financial";
const date = "2026-10-19";
const ctx = { actor:"Test",now:`${date}T18:00:00Z`,today:date,cost:100,hoursPerDay:8 };
const op: Operator = { id:"op",name:"Operaria",role:"Carpintería",hourlyCost:100,active:true,createdAt:ctx.now,enabledRubros:["carpinteria_madera","pintura"] };
const furniture = { id:"item",name:"Mesa",quantity:2,completedUnits:0,rubros:[{ rubro:"carpinteria_madera" as const,hours:60,workers:1 }] };
const p = () => project({ id:"p",startDate:date,dueDate:"2026-11-06",items:[furniture],baseline:{ capturedAt:"2026-10-01T10:00:00Z",capturedBy:"G",salesPrice:1000,dueDate:"2026-11-06",budgetTotal:500,lines:[] } });
const assignment: WorkAssignment = { id:"a",projectId:"p",rubro:"carpinteria_madera",operatorId:"op",date,plannedHours:8,createdBy:"J",createdAt:ctx.now };
const input = { requestId:"actual",operatorId:"op",projectId:"p",rubro:"carpinteria_madera" as const,date,hours:6,assignmentId:"a" };

describe("circuito integral: planificación, ejecución y corrección", () => {
  it("planifica sin mueble y conserva el plan cuando la ejecución cambia de proyecto", () => {
    expect(assignmentError({ ...assignment },{ projects:[p()],operators:[op] })).toBeNull();
    const other = { ...p(),id:"other" };
    const result = executeWork([p(),other],[op],[assignment],{ ...input,projectId:"other",hours:10 },ctx);
    expect(assignment.projectId).toBe("p"); expect(assignment.plannedHours).toBe(8);
    expect(result[0].actualEntries).toHaveLength(0); expect(result[1].actualEntries[0].amount).toBe(1000);
    expect(result[1].actualEntries[0].itemId).toBeUndefined();
    expect(executeWork(result,[op],[assignment],{ ...input,projectId:"other",hours:10 },ctx)).toBe(result);
  });
  it("corrige fecha, rubro, mueble, proyecto y horas con historia y una sola imputación", () => {
    const first = executeWork([p(),{ ...p(),id:"other" }],[op],[assignment],input,ctx);
    const corrected = correctExecution(first,[op],{ entryId:"actual",projectId:"other",itemId:"item",rubro:"carpinteria_madera",date:"2026-10-18",hours:4,reason:"Imputación corregida" },ctx);
    expect(corrected.flatMap((p) => p.actualEntries)).toHaveLength(1);
    const row = corrected[1].actualEntries[0]; expect(row.amount).toBe(400); expect(row.assignmentId).toBe("a");
    expect(row.corrections?.[0].previous.hours).toBe(6); expect(row.corrections?.[0].next.date).toBe("2026-10-18");
    expect(row.corrections?.[0].by).toBe("Test");
  });
  it("rechaza rubros no habilitados y horas no finitas", () => {
    expect(() => executeWork([p()],[{ ...op,enabledRubros:["pintura"] }],[assignment],input,ctx)).toThrow(/habilitado/);
    expect(() => executeWork([p()],[op],[assignment],{ ...input,hours:NaN },ctx)).toThrow();
  });
  it("las horas sin mueble se descuentan del proyecto/rubro y se reportan separadas", () => {
    const done = executeWork([p()],[op],[assignment],input,ctx);
    const load = loadByRubro(done,[],date,"2026-11-06",date);
    expect(Object.values(load.confirmed).reduce((s,h) => s+h,0)).toBe(54);
    expect(hoursRows(done,"furniture").find((r) => r.key.endsWith(":unattributed"))?.actual).toBe(6);
    expect(done[0].items[0].completedUnits).toBe(0);
  });
});
describe("capacidad compartida", () => {
  it("dos habilidades no duplican jornada y una ausencia baja disponibilidad", () => {
    expect(weeklyCapacity([p()],[op],[assignment],[],date,date,date,8)).toEqual({ available:8,planned:8,needed:4 });
    const absent = [{ operatorId:"op",date,works:false,createdBy:"J",createdAt:ctx.now }];
    expect(weeklyCapacity([p()],[op],[assignment],absent,date,date,date,8).available).toBe(0);
  });
  it("las jornadas y días distintos dentro del mismo rubro se suman individualmente", () => {
    const ops = [{ ...op,hoursPerDay:4,workDays:[1] },{ ...op,id:"op2",hoursPerDay:6,workDays:[1,2] }];
    const c = capacityFromOperators(ops,{ Carpintería:"Madera" },8);
    expect(c).toHaveLength(1); expect(capacityHours(c[0],date,"2026-10-25")).toBe(16);
  });
  it("tres proyectos reparten la demanda entre semanas sin sumar la planificación", () => {
    const projects = [p(),{ ...p(),id:"p2" },{ ...p(),id:"p3" }];
    const timeline = capacityTimeline([],projects,[],date,"week");
    expect(timeline.slice(0,3).map((w) => w.confirmed)).toEqual([60,60,60]);
    const result = weeklyCapacity(projects,[op],[assignment],[],date,"2026-10-25",date,8);
    expect(result.planned).toBe(8); expect(result.needed).toBe(60);
  });
  it("un ajuste confirmado modifica disponibilidad sin crear costo u horas reales", () => {
    const ledger = { ...EMPTY_LEDGER,capacityAdjustments:[{ id:"cap",date,hours:12,note:"Refuerzo acordado",by:"G",at:ctx.now }] };
    expect(weeklyCapacity([p()],[op],[],[],date,date,date,8,undefined,ledger).available).toBe(20);
    expect(p().actualEntries).toHaveLength(0);
  });
});
describe("externos, costos y cierre", () => {
  const external = { kind:"hourly" as const,projectId:"p",rubro:"carpinteria_madera" as const,date,description:"Refuerzo",hours:3 };
  it("un costo desconocido queda pendiente; la confirmación habilita el cierre sin exigir cobro", () => {
    const finished = { ...p(),items:[{ ...furniture,completedUnits:2 }] };
    let l = registerExternal({ ...EMPTY_LEDGER,handovers:[{ id:"h",projectId:"p",date,by:"J" }] },[finished],external,ctx);
    expect(l.externalWork?.[0].estimatedCost).toBeUndefined(); expect(profitView(finished,l).toDate.partial).toBe(true);
    const empty = { lots:[],movements:[] };
    expect(closeCheck(finished,l,empty,[]).blockers.join()).toMatch(/Costo externo pendiente/);
    l = confirmExternal(l,l.externalWork![0].id,600,ctx);
    expect(closeCheck(finished,l,empty,[]).blockers).toEqual([]); expect(pendingExternal(l,"p")).toHaveLength(0);
    expect(profitView(finished,l).toDate.cost).toBe(600); expect(l.collections).toHaveLength(0);
  });
  it("tarifa externa con vigencia propone costo, pero sigue requiriendo confirmación", () => {
    const l = registerExternal({ ...EMPTY_LEDGER,externalRates:[{ rubro:"carpinteria_madera",hourlyCost:150,validFrom:date,by:"G",at:ctx.now }] },[p()],external,ctx);
    expect(l.externalWork?.[0].estimatedCost).toBe(450); expect(pendingExternal(l,"p")).toHaveLength(1);
    const report = withExternalHours([p()],l)[0]; expect(hoursRows([report],"project")[0].actual).toBe(3);
    expect(report.actualEntries[0].operatorId).toBeUndefined(); expect(report.actualEntries[0].amount).toBe(0);
  });
  it("taller tercero sin horas no aumenta capacidad ni duplica otro gasto", () => {
    const registered = registerExternal(EMPTY_LEDGER,[p()],{ ...external,kind:"workshop",hours:undefined,estimatedCost:200 },ctx);
    expect(() => confirmExternal(registered,"missing",100,ctx)).toThrow(/no encontrado/);
    const l = confirmExternal(registered,registered.externalWork![0].id,200,ctx);
    expect(withExternalHours([p()],l)[0].actualEntries).toHaveLength(0);
    expect(profitView(p(),l).toDate.cost).toBe(200);
  });
});
describe("trabajo interno y fechas históricas", () => {
  it("reparte dinero por la fecha trabajada con redondeo exacto y sin horas productivas", () => {
    const projects = [p(),{ ...p(),id:"p2" },{ ...p(),id:"p3",isClosed:true,closedAt:"2026-10-18" }];
    const allocations = generalAllocations(projects,date,100.01);
    expect(allocations.map((a) => a.amount)).toEqual([50,50.01]);
    let l = registerInternalHours(EMPTY_LEDGER,{ employeeId:"op",date,hours:1,task:"General",hourlyCost:100.01 },ctx);
    l = { ...l,internalHours:l.internalHours.map((h) => ({ ...h,allocations })) };
    expect(staffHoursCost(l,"p")+staffHoursCost(l,"p2")).toBeCloseTo(100.01, 8);
    expect(projects.flatMap((p) => p.actualEntries)).toHaveLength(0);
    expect(activeOn(projects[2],"2026-10-17")).toBe(true);
    expect(generalAllocations([],date,100)).toEqual([]);
  });
  it("compras no determinan inicio productivo; horas y consumos sí", () => {
    expect(actualStart(p())).toBeUndefined();
    const done = executeWork([p()],[op],[assignment],input,ctx)[0]; expect(actualStart(done)).toBe(date);
    expect(actualStart({ ...p(),materialUsages:[usage({ date:"2026-10-18",quantityConsumed:1 })] })).toBe("2026-10-18");
  });
});
describe("financiero: conservar regla por saldo sin IVA", () => {
  it("los ejemplos son verificaciones, no defaults; tasa cero también funciona", () => {
    const first = financialCost({ price:10000000,monthlyRatePct:2,startDate:"2026-01-01",deliveryDate:"2026-01-31",daysAfterDelivery:0,schedule:[{ amount:5000000,date:"2026-01-01" }] });
    expect(first.ok && first.amount).toBe(100000);
    const second = { price:10000000,monthlyRatePct:2,startDate:"2026-01-01",deliveryDate:"2026-03-02",daysAfterDelivery:60 };
    const r = financialCost(second); expect(r.ok && r.amount).toBe(800000);
    const zero = financialCost({ ...second,monthlyRatePct:0 }); expect(zero.ok && zero.amount).toBe(0);
  });
  it("el atraso real y cobros parciales actualizan los tramos", () => {
    const proj = { ...p(),salesPrice:1000,startDate:"2026-10-01",dueDate:"2026-10-11" };
    const l = { ...EMPTY_LEDGER,financialMonthlyRatePct:3,collections:[{ id:"c",projectId:"p",date:"2026-10-01",amount:500,createdAt:ctx.now,createdBy:"G" }] };
    const r = financialCost(updatedFinancialInput(proj,l,"2026-10-31")); expect(r.ok && r.amount).toBe(15);
  });
});

describe("flujo automático por eventos frontend", () => {
  it("publicar BOM pasa a Compras, recibir material pasa a Producción y no inventa inicio real", () => {
    const approved = { ...p(),status:"approved" as const };
    const b = { id:"b",projectId:"p",itemId:"item",version:1,status:"published" as const,lines:[{ id:"l",material:"Madera",quantity:1,unit:"u" }],createdBy:"A",createdAt:ctx.now };
    const ledger = { ...EMPTY_LEDGER,boms:[b] };
    const purchasing = afterPublishedBom([approved],EMPTY_LEDGER,ledger,ctx);
    expect(purchasing[0].status).toBe("purchasing");
    const production = afterMaterialArrival(purchasing,["p"],ctx);
    expect(production[0].status).toBe("production"); expect(actualStart(production[0])).toBeUndefined();
    expect(production[0].baseline).toEqual(approved.baseline);
    expect(afterPublishedBom(production,ledger,ledger,ctx)[0]).toBe(production[0]);
  });
});

// Quote and internal-cost paths also use the same shared records.
describe("categorías configurables y correcciones generales", () => {
  it("una categoría no operaria se cotiza en su propia línea sin horas productivas ficticias", async () => {
    const { rubroLabor,rubroLines,totalOfLines } = await import("@/lib/budget-calculator");
    const q = { rubro:"carpinteria_madera" as const,workers:0,hoursPerWorker:0,designHours:0,adminHours:0,amount:0,materials:[],staffHours:[{ rateId:"commercial",name:"Comercial",category:"admin" as const,hours:3,hourlyCost:250 }] };
    const labor = rubroLabor(q,{ normalShare:1,laborRate:100,designRate:200,adminRate:200,overtimeMultiplier:2 });
    expect(labor.total).toBe(750); expect(labor.normalHours).toBe(0);
    const lines = rubroLines(q,labor,{ rates:{},overtimeMultiplier:2,hoursPerDay:8 });
    expect(lines).toHaveLength(1); expect(lines[0].hourRateId).toBe("commercial"); expect(totalOfLines(lines)).toBe(750);
  });
  it("corregir fecha y horas reemplaza las distribuciones monetarias y conserva el historial", async () => {
    const { correctInternalWork } = await import("@/lib/internal-work");
    let ledger = registerInternalHours(EMPTY_LEDGER,{ employeeId:"op",date:"2026-10-17",hours:8,task:"General",hourlyCost:100 },ctx);
    const projects = [p(),{ ...p(),id:"closed",isClosed:true,closedAt:"2026-10-18" }];
    const row = ledger.internalHours[0]; ledger = { ...ledger,internalHours:[{ ...row,allocations:generalAllocations(projects,row.date,800) }] };
    const next = correctInternalWork(ledger,projects,row.id,{ date,hours:4,reason:"Fecha real corregida" },ctx);
    expect(next.internalHours).toHaveLength(1); expect(staffHoursCost(next,"p")).toBe(400); expect(staffHoursCost(next,"closed")).toBe(0);
    expect(next.internalHours[0].corrections?.[0].previous.allocations).toHaveLength(2);
  });
});

describe("rentabilidad y costo financiero devengado", () => {
  it("incorpora el atraso y anticipos reales sin duplicar un costo financiero ya registrado", () => {
    const proj = { ...p(),startDate:"2026-10-01" };
    const l = { ...EMPTY_LEDGER,financialMonthlyRatePct:3,collections:[{ id:"c",projectId:"p",date:"2026-10-01",amount:500,createdAt:ctx.now,createdBy:"G" }] };
    expect(profitView(proj,l,"2026-10-31").toDate.cost).toBe(15);
    const registered = { ...proj,actualEntries:[{ id:"finance",projectId:"p",type:"other" as const,category:"financial" as const,date:"2026-10-31",description:"Costo financiero",amount:15,createdAt:ctx.now,createdBy:"G" }] };
    expect(profitView(registered,l,"2026-10-31").toDate.cost).toBe(15);
    expect(profitView(proj,{ ...l,financialMonthlyRatePct:0 },"2026-10-31").toDate.cost).toBe(0);
  });
});

describe("inicio financiero y alcance del período", () => {
  it("no devenga financiación durante la negociación ni sobre cotizaciones sin aprobar", () => {
    const proj = { ...p(),startDate:"2026-09-01" };
    expect(profitView(proj,EMPTY_LEDGER,"2026-09-30").toDate.cost).toBe(0);
    expect(profitView({ ...proj,status:"quotation",baseline:undefined },EMPTY_LEDGER,"2026-10-31").toDate.cost).toBe(0);
  });
  it("el subtotal financiero incluye solo los días del período elegido", async () => {
    const { financialCostInPeriod } = await import("@/lib/tablero");
    const l = { ...EMPTY_LEDGER,financialMonthlyRatePct:3 };
    expect(financialCostInPeriod([{ ...p(),startDate:"2026-10-01" }],l,"2026-10-16","2026-10-31")).toBe(16);
  });
});
