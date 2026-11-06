import { describe, expect, it } from "vitest";
import type { Operator, PurchaseOrder, WorkAssignment } from "@/types";
import { line, project, usage } from "./helpers";
import { confirmSupplierPayment, paidOf, EMPTY_LEDGER } from "@/lib/ledger";
import { hoursRows, loadByRubro } from "@/lib/gerencia";
import { weeklyCapacity, pendingDemandEstimates } from "@/lib/frontend-work";
import { materialNeeds, receiveOrder, reverseLocalReceipt, correctSentOrder } from "@/lib/purchasing";
import { EMPTY_STOCK, applyChange, computeBalances, receiveStock, assignToProject } from "@/lib/stock";
import { ledgerAtDate, profitView } from "@/lib/tablero";
import { assignmentError } from "@/lib/plant";
const date = "2026-10-19";
const ctx = { actor:"Prueba",now:`${date}T12:00:00Z`,today:date };
const op: Operator = { id:"op",name:"Persona",role:"Categoría",active:true,productive:true,hourlyCost:100,createdAt:ctx.now,enabledRubros:["carpinteria_madera","pintura"] };
const furniture = { id:"i",name:"Mesa",quantity:2,completedUnits:0,rubros:[{ rubro:"carpinteria_madera" as const,hours:8,workers:1 }] };
const p = () => project({ startDate:date,dueDate:date,items:[furniture] });
const order = (): PurchaseOrder => ({ id:"o",number:"OC",supplier:"Proveedor",date,status:"sent",paid:false,received:"no",createdBy:ctx.actor,createdAt:ctx.now,lines:[{ id:"ol",projectId:"p",budgetLineId:"bl",materialId:"m",materialName:"Material",quantity:10,unit:"u",unitCost:100,receivedQuantity:0 }] });

describe("correcciones MVP: fuentes compartidas", () => {
  it("la capacidad de varios rubros suma una sola jornada aun con sobreasignación", () => {
    const assignments: WorkAssignment[] = ["carpinteria_madera","pintura"].map((rubro,i) => ({ id:String(i),projectId:"p",operatorId:"op",rubro:rubro as WorkAssignment["rubro"],date,plannedHours:8,createdBy:"J",createdAt:ctx.now }));
    const all = weeklyCapacity([p()],[op],assignments,[],date,date,date,8);
    const wood = weeklyCapacity([p()],[op],assignments,[],date,date,date,8,"carpinteria_madera");
    const paint = weeklyCapacity([p()],[op],assignments,[],date,date,date,8,"pintura");
    expect(wood.available + paint.available).toBe(all.available);
    expect(all).toEqual({ available:8,planned:16,needed:8,pendingConfiguration:false,unconfiguredEmployeeIds:[] });
    expect(assignmentError({ ...assignments[0] },{ projects:[p()],operators:[{ ...op,productive:false }] })).toMatch(/habilitada/);
  });
  it("no mezcla horas no operativas en desvíos ni demanda productiva", () => {
    const proj = p();
    proj.budgetLines = [line("admin",20,100,{ unit:"h" })];
    proj.actualEntries = [{ id:"a",projectId:"p",date,type:"labor",category:"admin",description:"Comercial",amount:300,labor:{ role:"Comercial",hours:3,hourlyCost:100 },createdBy:"A",createdAt:ctx.now }];
    expect(hoursRows([proj],"project")[0]).toMatchObject({ budget:8,actual:0 });
    expect(hoursRows([proj],"rubro").map((r) => r.label)).not.toContain("Administración");
    expect(Object.values(loadByRubro([proj],[],date,date,date).confirmed)).toEqual([8]);
    proj.actualEntries[0] = { ...proj.actualEntries[0],category:"labor",rubro:"carpinteria_madera",labor:{ role:"Madera",hours:8,hourlyCost:100 } };
    expect(pendingDemandEstimates([proj],date)).toHaveLength(1);
  });
  it("dos líneas del mismo material descuentan una sola vez stock asignado", () => {
    const proj = project({ budgetLines:[line("materials",8,100,{ materialId:"m" }),line("materials",8,100,{ materialId:"m" })] });
    const got = receiveStock({ materialId:"m",materialName:"Material",unit:"u",quantity:10,unitCost:100,date,destination:"warehouse" },ctx);
    let stock = applyChange(EMPTY_STOCK,got);
    stock = applyChange(stock,assignToProject(stock,{ materialId:"m",quantity:10,projectId:"p" },ctx));
    const needs = materialNeeds([proj],[],stock,date);
    expect(needs.reduce((s,n) => s+n.fromDepot,0)).toBe(10);
    expect(needs.reduce((s,n) => s+n.toBuy,0)).toBe(6);
  });
  it("no descuenta existencias medidas en una unidad incompatible",() => {
    const got = receiveStock({ materialId:"m",materialName:"Material",unit:"u",quantity:10,unitCost:100,date,destination:"warehouse" },ctx);
    const proj = project({ budgetLines:[line("materials",5,100,{ materialId:"m",unit:"m" })] });
    const need = materialNeeds([proj],[],applyChange(EMPTY_STOCK,got),date)[0];
    expect(need.fromStock).toBe(0);expect(need.toBuy).toBe(5);
  });
  it("el corte de rentabilidad excluye consumos, horas y cobros posteriores", () => {
    const proj = project({ materialUsages:[usage({ date:"2026-10-20",quantityConsumed:1,unitCost:500 })] });
    const ledger = { ...EMPTY_LEDGER,financialMonthlyRatePct:0,internalHours:[{ id:"h",employeeId:"op",projectId:"p",date:"2026-10-20",hours:2,hourlyCost:100,task:"Trabajo",createdAt:ctx.now }],collections:[{ id:"c",projectId:"p",date:"2026-10-20",amount:500,createdBy:"G",createdAt:ctx.now }] };
    expect(profitView(proj,ledger,date).toDate.cost).toBe(0);
    expect(profitView(proj,ledger,"2026-10-20").toDate.cost).toBe(700);
    expect(ledgerAtDate(ledger,date).collections).toEqual([]);
    expect(ledger.collections).toHaveLength(1);
  });
});

describe("correcciones de abastecimiento con evidencia", () => {
  function received() {
    const result = receiveOrder(order(),[{ lineId:"ol",quantity:4 }],[p()],ctx);
    const stock = applyChange(EMPTY_STOCK,result.change);
    const movement = result.sent[0];
    const next = { ...result.order,localReceipts:[{ movementId:movement.movement_id,lotId:movement.lot_id,lineId:movement.line_id,quantity:4,date,by:ctx.actor }] };
    return { stock,order:next,movement };
  }
  it("revierte una recepción parcial sin borrar su lote o movimiento original y permite recibir otra vez", () => {
    const first = received();
    const result = reverseLocalReceipt(first.order,first.stock,[],first.movement.movement_id,"Cantidad incorrecta",ctx);
    expect(result.order.received).toBe("no"); expect(result.order.lines[0].receivedQuantity).toBe(0);
    expect(result.stock.movements).toHaveLength(2); expect(first.stock.movements).toHaveLength(1);
    expect(computeBalances(result.stock.movements).get(first.movement.lot_id)?.held.p).toBe(0);
    expect(() => reverseLocalReceipt(result.order,result.stock,[],first.movement.movement_id,"Otra vez",ctx)).toThrow(/vigente/);
    expect(receiveOrder(result.order,[{ lineId:"ol",quantity:10 }],[p()],ctx).order.received).toBe("yes");
  });
  it("bloquea reversión cuando hubo una transferencia o falta evidencia histórica", () => {
    const first = received();
    const stock = { ...first.stock,movements:[...first.stock.movements,{ ...first.stock.movements[0],id:"t",kind:"transfer" as const,quantity:1,from:{ type:"project" as const,projectId:"p" },to:{ type:"project" as const,projectId:"other" } }] };
    expect(() => reverseLocalReceipt(first.order,stock,[],first.movement.movement_id,"Corregir",ctx)).toThrow(/transferido/);
    expect(() => reverseLocalReceipt(order(),first.stock,[],first.movement.movement_id,"Corregir",ctx)).toThrow(/trazabilidad/);
  });
  it("Gerencia paga una orden enviada en demo sin inventar factura ni consumo",() => {
    const ledger = confirmSupplierPayment(EMPTY_LEDGER,order(),{ date,amount:300,reference:"Transferencia" },ctx,{ allowSentOrder:true });
    expect(paidOf(ledger,"o")).toBe(300);expect(ledger.salesInvoices).toEqual([]);expect(ledger.collections).toEqual([]);
    expect(profitView(p(),ledger).toDate.cost).toBe(0);
  });
  it("corrige Enviada sin recepción y guarda motivo, autor y fecha", () => {
    expect(correctSentOrder(order(),"Enviada por error",ctx)).toMatchObject({ status:"draft",statusHistory:[{ previous:"sent",next:"draft",by:ctx.actor,at:ctx.now,reason:"Enviada por error" }] });
    expect(() => correctSentOrder(received().order,"Corregir",ctx)).toThrow(/sin recepciones/);
  });
});
