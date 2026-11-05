// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Ledger, Operator, PurchaseOrder, BomVersionLine } from "@/types";
import { useAppStore } from "@/store/use-app-store";
import { EMPTY_LEDGER, addRate, addRubro, startBomDraft, saveBomDraft, publishBom } from "@/lib/ledger";
import { employeeCost } from "@/lib/personnel";
import { withPublishedBom, bomLineId } from "@/lib/bom-needs";
import { materialNeeds } from "@/lib/purchasing";
import { weeklyCapacity } from "@/lib/frontend-work";
import { capacityTimeline } from "@/lib/tablero";
import { EMPTY_STOCK, receiveStock, applyChange, assignToProject, availableToProject, availableInWarehouse, stockTotalValue } from "@/lib/stock";
import { registerMaterialsLocal } from "@/lib/plant-materials";
import { DEMO_DATA_KEY, readDemo, writeDemo, pickDemoData } from "@/store/demo-local";
import { BomVersions } from "@/components/projects/bom-versions";
import { HoursForm } from "@/components/actual-costs/hours-form";
import { FlexibleWork } from "@/components/workshop/flexible-work";
import { WorkshopHome } from "@/components/workshop/workshop-home";
import { PlantCalendar } from "@/components/plant/plant-calendar";
import { GerenciaDashboard } from "@/components/gerencia/gerencia-dashboard";
import { project, line } from "./helpers";
import { todayISO } from "@/lib/formatting";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push:vi.fn(),replace:vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
const day = todayISO(), ctx = { actor:"Auditoría aislada",now:`${day}T12:00:00Z`,today:day };
const item = { id:"i",name:"Mesa",quantity:1,completedUnits:0,rubros:[{ rubro:"carpinteria_madera" as const,hours:10,workers:1 }] };
const op: Operator = { id:"employee",name:"Persona",role:"Texto sin relación con habilidades",active:true,createdAt:ctx.now,hourlyCost:15000,productive:true,hoursPerDay:8,workDays:[0,1,2,3,4,5,6],enabledRubros:["carpinteria_madera"] };
const p = () => project({ items:[item], assignedOperatorIds:[op.id], startDate:day,dueDate:day,budgetLines:[line("materials",5,20,{ id:"quoted",materialId:"m",description:"Material",unit:"u" })] });
const ledger = (): Ledger => ({ ...EMPTY_LEDGER, rubroCatalog:[{ id:"carpinteria_madera",name:"Carpintería",active:true },{ id:"carpinteria_metalica",name:"Metal",active:true }],personnel:[{ employeeId:op.id,enabled:true,view:"operario",views:["operario"],productive:true,categoryIds:["cat"],enabledRubros:["carpinteria_madera"],hoursPerDay:8,workDays:[0,1,2,3,4,5,6] }], staffCategories:[{ id:"cat",name:"Oficial",category:"labor",hourlyCost:80,rates:[{ validFrom:"2026-01-01",hourlyCost:80,at:ctx.now,by:"G" }] }],rates:[{ id:"individual",scope:"employee",subjectId:op.id,hourlyRate:100,validFrom:"2026-01-01",createdAt:ctx.now,createdBy:"G" }] });
const ok = <T,>(r: { ok:true;value:T } | { ok:false;error:string }): T => { if (!r.ok) throw new Error(r.error); return r.value; };
beforeEach(() => {
 localStorage.clear();
 useAppStore.setState({ demoLocal:true,isDemo:true,organizationId:null,currentMode:"gerencia",role:"owner",actingOperatorId:op.id,projects:[p()],operators:[op],assignments:[],orders:[],stock:EMPTY_STOCK,deliveries:[],requests:[],dayExceptions:[],reviewedHoursKeys:[],resolvedAlertIds:[],ledger:ledger(),priceHistory:[],syncStatus:"idle",syncError:null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("B1 — todas las rutas internas valorizan con Personal", () => {
 it("manual, asignación y ejecución flexible: misma persona, categoría, fecha y costo; conserva histórico", () => {
  const st = () => useAppStore.getState();
  ok(st().logHoursManual("p",{ requestId:"manual",operatorId:op.id,itemId:"i",rubro:"carpinteria_madera",date:day,hours:1,categoryId:"cat" }));
  const a = st().assignments[0]; useAppStore.setState({ currentMode:"operario" });
  ok(st().logHours("p",{ requestId:"assigned",assignmentId:a.id,hours:1,categoryId:"cat" }));
  ok(st().executeWorkLocal({ requestId:"flexible",operatorId:op.id,projectId:"p",rubro:"carpinteria_madera",date:day,hours:1,categoryId:"cat" }));
  expect(st().projects[0].actualEntries.map((e) => [e.amount,e.labor?.hourlyCost,e.categoryId])).toEqual([[100,100,"cat"],[100,100,"cat"],[100,100,"cat"]]);
  const old = structuredClone(st().projects[0].actualEntries);
  useAppStore.setState({ ledger:addRate(st().ledger,{ scope:"employee",subjectId:op.id,hourlyRate:250,validFrom:day },ctx) });
  expect(employeeCost(st().ledger,op,day,"cat").hourlyCost).toBe(250);
  expect(st().projects[0].actualEntries).toEqual(old);
  ok(st().logHours("p",{ requestId:"assigned",assignmentId:a.id,hours:1,categoryId:"cat" }));
  expect(st().projects[0].actualEntries).toEqual(old);
 });
 it("dos categorías requieren selección; sin tarifa rechaza sin asignación parcial ni costo inventado", () => {
  const l = ledger();l.rates=[]; l.staffCategories!.push({ id:"other",name:"Otra",category:"labor",hourlyCost:200 });l.personnel![0].categoryIds!.push("other");
  useAppStore.setState({ ledger:l });
  const input = { operatorId:op.id,itemId:"i",rubro:"carpinteria_madera" as const,date:day,hours:1 };
  expect(useAppStore.getState().logHoursManual("p",input)).toMatchObject({ ok:false,error:expect.stringMatching(/categoría/) });
  expect(useAppStore.getState().assignments).toEqual([]);
  expect(employeeCost(l,op,day,"other").hourlyCost).toBe(200);
  l.staffCategories![0].rates=[{ validFrom:"2099-01-01",hourlyCost:80,by:"G",at:ctx.now }];
  expect(useAppStore.getState().logHoursManual("p",{ ...input,categoryId:"cat" })).toMatchObject({ ok:false,error:expect.stringMatching(/vigente/) });
  expect(useAppStore.getState().projects[0].actualEntries).toEqual([]);
 });
 it("los tres formularios guardan exactamente $100 por la misma hora", async () => {
  const user = userEvent.setup(); const done=vi.fn();
  render(<HoursForm project={useAppStore.getState().projects[0]} onDone={done} />);
  await user.selectOptions(screen.getByLabelText("Operario"),op.id);
  await user.type(screen.getByLabelText("Horas"),"1");await user.click(screen.getByRole("button",{ name:"Guardar horas" }));
  expect(done).toHaveBeenCalled(); cleanup();
  useAppStore.setState({ currentMode:"operario" });
  render(<WorkshopHome />);
  const button=screen.getByRole("button",{ name:"Registrar horas" });const form=button.closest("form")!;
  await user.type(within(form).getByRole("textbox"),"1");await user.click(button);
  expect(useAppStore.getState().projects[0].actualEntries).toHaveLength(2);cleanup();
  render(<FlexibleWork operator={op} onSaved={done} />);
  await user.selectOptions(screen.getByLabelText("Proyecto"),"p");
  await user.selectOptions(screen.getByLabelText("Rubro"),"carpinteria_madera");
  await user.type(screen.getByLabelText("Horas reales"),"1");await user.click(screen.getByRole("button",{ name:"Registrar ejecución real" }));
  expect(useAppStore.getState().projects[0].actualEntries.map((e) => e.amount)).toEqual([100,100,100]);
 });
});

function bomSetup(materialId: string | undefined = "m") {
 const pr=p();const l=ledger(); const row: BomVersionLine={ id:"stable-line",material:"Material A",materialId,quantity:5,unit:"u" };
 l.boms=[{ id:"v1",projectId:"p",itemId:"i",version:1,status:"published",lines:[row],createdAt:ctx.now,createdBy:"G" }];
 return { pr,l,row };
}
function orderFor(id:string,materialId: string | undefined = "m"): PurchaseOrder {
 return { id:"order",number:"OC-test",status:"sent",supplier:"Proveedor",date:day,received:"partial",paid:false,createdAt:ctx.now,createdBy:"G",lines:[{ id:"ol",projectId:"p",budgetLineId:id,materialId,materialName:"Material A",quantity:5,unit:"u",unitCost:20,receivedQuantity:2 }] };
}
describe("B2 — identidad BOM estable y compatibilidad en lectura", () => {
 it.each([true,false])("renombrar conserva orden/recepción sin duplicar (orden histórica: %s)", (historical) => {
  const { pr,l,row }=bomSetup(); const before=withPublishedBom(pr,l).budgetLines.find((x) => x.materialId==="m")!;
  const order=orderFor(historical ? bomLineId("i","Material A") : before.id);const frozen=structuredClone(order);
  let next=startBomDraft(l,pr,"i",ctx);const draft=next.boms.at(-1)!;
  expect(draft.lines[0].id).toBe(row.id);
  next=saveBomDraft(next,draft.id,[{ ...draft.lines[0],material:"Material B" }]);next=publishBom(next,draft.id,ctx);
  const after=withPublishedBom(pr,next);
  expect(after.budgetLines.find((x) => x.materialId==="m")!.id).toBe(before.id);
  expect(materialNeeds([after],[order],EMPTY_STOCK,day)[0]).toMatchObject({ ordered:5,receivedFromOrders:2,toBuy:0 });
  expect(order).toEqual(frozen);expect(l.boms[0].lines[0]).toEqual(row);
 });
 it("una línea cotizada heredada sin catálogo mantiene su vínculo al cambiar la descripción", () => {
  const { pr,l,row }=bomSetup(); row.materialId=undefined;row.budgetLineId="quoted";
  pr.budgetLines[0].materialId=undefined;pr.budgetLines[0].description="Material A";
  const order=orderFor("quoted");order.lines[0].materialId=undefined;
  l.boms.push({ ...l.boms[0],id:"v2",version:2,lines:[{ ...row,material:"Descripción nueva" }] });
  const need=materialNeeds([withPublishedBom(pr,l)],[order],EMPTY_STOCK,day)[0];
  expect(need).toMatchObject({ lineId:"quoted",ordered:5,receivedFromOrders:2,toBuy:0 });
 });
 it("seleccionar por ID en el formulario BOM conserva el material y la orden histórica", async () => {
  const { pr,l }=bomSetup(); useAppStore.setState({ projects:[pr],ledger:l,currentMode:"administracion" });
  const order=orderFor(bomLineId("i","Material A"));useAppStore.setState({ orders:[order] });
  const user=userEvent.setup();render(<BomVersions project={pr} item={item} canEdit />);
  await user.click(screen.getByRole("button",{ name:"Nueva versión del BOM" }));
  expect(screen.getByLabelText("Material 1")).toHaveValue("m");
  expect(screen.getByLabelText("Unidad de Material A")).toHaveAttribute("readonly");
  await user.click(screen.getByRole("button",{ name:"Finalizar y enviar BOM" }));
  const state=useAppStore.getState();
  expect(state.ledger.boms.at(-1)!.lines[0].materialId).toBe("m");
  expect(materialNeeds([withPublishedBom(pr,state.ledger)],state.orders,EMPTY_STOCK,day)[0]).toMatchObject({ toBuy:0,receivedFromOrders:2 });
 });
 it("sin catálogo conserva ID de línea al renombrar; cambiar realmente material no cubre la nueva necesidad", () => {
  const { pr,l,row }=bomSetup(undefined);row.materialId=undefined;
  const original=withPublishedBom(pr,l).budgetLines.find((x) => x.description==="Material A")!;
  const order=orderFor(bomLineId("i","Material A"));order.lines[0].materialId=undefined;
  l.boms.push({ ...l.boms[0],id:"v2",version:2,lines:[{ ...row,material:"Material B" }] });
  const renamed=withPublishedBom(pr,l);expect(renamed.budgetLines[0].id).toBe(original.id);
  expect(materialNeeds([renamed],[order],EMPTY_STOCK,day)[0].toBuy).toBe(0);
  l.boms.push({ ...l.boms[0],id:"v3",version:3,lines:[{ ...row,materialId:"different",material:"Material B" }] });
  expect(materialNeeds([withPublishedBom(pr,l)],[order],EMPTY_STOCK,day)[0].toBuy).toBe(5);
 });
});

describe("B3 — una unidad física cubre un solo proyecto", () => {
 it("5 recibidas, 2 consumidas, 1 desperdiciada, 1 sobrante asignado a B: a A le falta 1", () => {
  const a=p(),b=project({ ...p(),id:"b",code:"B",budgetLines:[line("materials",1,20,{ materialId:"m",description:"Material",unit:"u" })] });
  let stock=applyChange(EMPTY_STOCK,receiveStock({ materialId:"m",materialName:"Material",unit:"u",quantity:5,unitCost:20,date:day,destination:"warehouse" },ctx));
  stock=applyChange(stock,assignToProject(stock,{ materialId:"m",unit:"u",projectId:"p",quantity:5 },ctx));
  const used=registerMaterialsLocal(a,stock,[],{ projectId:"p",itemId:"i",materialId:"m",source:"project",date:day,quantity:4,consumed:2,waste:1,leftover:1 },ctx);
  stock=used.stock;const historical=structuredClone(stock.movements);
  stock=applyChange(stock,assignToProject(stock,{ materialId:"m",unit:"u",projectId:"b",quantity:1 },ctx));
  const needs=materialNeeds([used.project,b],[],stock,day);
  expect(needs.find((n) => n.projectId==="p")).toMatchObject({ fromDepot:4,toBuy:1 });
  expect(needs.find((n) => n.projectId==="b")).toMatchObject({ fromDepot:1,toBuy:0 });
  expect(availableToProject(stock,"p","m")).toBe(1);expect(availableToProject(stock,"b","m")).toBe(1);expect(availableInWarehouse(stock,"m")).toBe(0);
  expect(stock.movements.slice(0,historical.length)).toEqual(historical);expect(new Set(stock.movements.map((m) => m.id)).size).toBe(stock.movements.length);
  expect(stockTotalValue(stock)).toBe(40);
  expect(used.project.materialUsages.reduce((s,u) => s+(u.quantityConsumed+u.wasteQuantity)*u.unitCost,0)).toBe(60);
 });
});

describe("B3 — cobertura de compras recibidas y devoluciones", () => {
 it.each(["order","direct"] as const)("el retorno reduce cobertura de %s sin borrar recepciones ni compras", (source) => {
  const pr=p(),other=project({ ...p(),id:"b",code:"B",budgetLines:[] });
  const order=orderFor("quoted");order.lines[0].quantity=5;order.lines[0].receivedQuantity=5;
  const orders=source === "order" ? [order] : [];
  if (source === "direct") pr.purchaseEntries=[{ id:"direct",projectId:"p",materialId:"m",materialName:"Material",quantity:5,unit:"u",unitCost:20,total:100,date:day,createdBy:"G",createdAt:ctx.now }];
  let stock=applyChange(EMPTY_STOCK,receiveStock({ materialId:"m",materialName:"Material",unit:"u",quantity:5,unitCost:20,date:day,destination:{ projectId:"p" } },ctx));
  const result=registerMaterialsLocal(pr,stock,[],{ projectId:"p",itemId:"i",materialId:"m",source:"project",date:day,quantity:4,consumed:2,waste:1,leftover:1 },ctx);
  stock=applyChange(result.stock,assignToProject(result.stock,{ materialId:"m",unit:"u",projectId:"b",quantity:1 },ctx));
  const need=materialNeeds([result.project,other],orders,stock,day)[0];
  expect(need.ordered+need.direct+need.fromDepot).toBe(4);expect(need.toBuy).toBe(1);
  expect(order.lines[0].receivedQuantity).toBe(5);expect(result.project.purchaseEntries).toEqual(pr.purchaseEntries);
 });
});

describe("B4 — capacidad explícita y misma fuente para Gerencia/Planta", () => {
 it("un rubro, varios, sin habilitación, baja y refuerzo puntual", () => {
  const single={ ...op,enabledRubros:["carpinteria_madera" as const] },multi={ ...op,id:"multi",enabledRubros:["carpinteria_madera" as const,"carpinteria_metalica" as const] },unknown={ ...op,id:"unknown",enabledRubros:undefined },off={ ...op,id:"off",active:false };
  const l={ ...ledger(),personnel:[],capacityAdjustments:[{ id:"adj",rubro:"carpinteria_madera" as const,date:day,hours:2,note:"Confirmado",by:"G",at:ctx.now }] };
  const total=weeklyCapacity([], [single,multi,unknown,off],[],[],day,day,day,8,undefined,l);
  expect(total).toMatchObject({ available:26,pendingConfiguration:true,unconfiguredEmployeeIds:["unknown"] });
  const wood=weeklyCapacity([],[single,multi],[],[],day,day,day,8,"carpinteria_madera",l);
  const metal=weeklyCapacity([],[single,multi],[],[],day,day,day,8,"carpinteria_metalica",l);
  expect(wood).toMatchObject({ available:14,pendingConfiguration:false });expect(metal.available).toBe(4);
  expect(wood.available+metal.available).toBe(18);
  expect(weeklyCapacity([],[off],[],[],day,day,day,8,undefined,{ ...l,capacityAdjustments:[] })).toMatchObject({ available:0,pendingConfiguration:false });
 });
 it("timeline Gerencia coincide con semanal Planta y usa Personal, nunca puesto→rubro", () => {
  const l=ledger();l.personnel![0].enabledRubros=["carpinteria_madera","carpinteria_metalica"];l.personnel![0].hoursPerDay=6;
  const timeline=capacityTimeline([],[],[],day,"week","Carpintería",{ operators:[op],exceptions:[],hoursPerDay:8,roleToRubro:{ [op.role]:"Otro rubro" },assignments:[],ledger:l })[0];
  const plant=weeklyCapacity([],[op],[],[],timeline.from,timeline.to,day,8,"carpinteria_madera",l);
  expect(timeline.capacity).toBe(plant.available);expect(timeline.capacity).toBe(21);expect(timeline.pendingConfiguration).toBe(false);
 });
 it("las dos vistas muestran pendiente sin asignar rubros al personal heredado", () => {
  const original={ ...op,enabledRubros:undefined };useAppStore.setState({ operators:[original],ledger:{ ...ledger(),personnel:[] } });
  render(<GerenciaDashboard />);expect(screen.getAllByText(/pendiente de configuración/i).length).toBeGreaterThan(0);cleanup();
  render(<PlantCalendar operators={[original]} today={day} onAssign={vi.fn()} />);expect(screen.getByText(/Capacidad por rubro pendiente de configuración/)).toBeInTheDocument();
  expect(useAppStore.getState().operators[0].enabledRubros).toBeUndefined();
 });
});

describe("B5 — error de persistencia nunca confirma ni publica estado temporal", () => {
 it("setItem falla: devuelve error, conserva memoria y snapshot; reintento único persiste y recarga", async () => {
  const before=useAppStore.getState();expect(writeDemo(pickDemoData(before as unknown as Record<string,unknown>))).toBe(true);
  const saved=localStorage.getItem(DEMO_DATA_KEY);
  const original=Storage.prototype.setItem;
  const spy=vi.spyOn(Storage.prototype,"setItem").mockImplementation(function(this: Storage,key,value) { if (key===DEMO_DATA_KEY) throw new DOMException("Quota exceeded","QuotaExceededError");original.call(this,key,value); });
  const result=await before.confirmOperation(() => useAppStore.getState().recordLedger(["gerencia"],(l) => addRubro(l,"Nuevo rubro")));
  expect(result).toMatchObject({ ok:false,error:expect.stringMatching(/no quedó guardado/) });
  expect(useAppStore.getState().ledger).toBe(before.ledger);expect(localStorage.getItem(DEMO_DATA_KEY)).toBe(saved);
  expect(readDemo()?.ledger).toEqual(before.ledger);
  spy.mockRestore();ok(useAppStore.getState().recordLedger(["gerencia"],(l) => addRubro(l,"Nuevo rubro")));
  expect(useAppStore.getState().ledger.rubroCatalog.filter((r) => r.name==="Nuevo rubro")).toHaveLength(1);
  useAppStore.setState({ demoLocal:false });useAppStore.getState().enterLocalDemo();
  expect(useAppStore.getState().ledger.rubroCatalog.filter((r) => r.name==="Nuevo rubro")).toHaveLength(1);
 });
 it("el formulario no muestra éxito si falla setItem y conserva lo escrito para reintentar", async () => {
  const done=vi.fn(),user=userEvent.setup();render(<HoursForm project={useAppStore.getState().projects[0]} onDone={done} />);
  await user.selectOptions(screen.getByLabelText("Operario"),op.id);await user.type(screen.getByLabelText("Horas"),"1");
  const original=Storage.prototype.setItem;
  const spy=vi.spyOn(Storage.prototype,"setItem").mockImplementation(function(this:Storage,key,value) { if (key===DEMO_DATA_KEY) throw new Error("quota");original.call(this,key,value); });
  await user.click(screen.getByRole("button",{ name:"Guardar horas" }));
  expect(done).not.toHaveBeenCalled();expect(screen.getByRole("alert")).toHaveTextContent("no quedó guardado");expect(screen.getByLabelText("Horas")).toHaveValue("1");
  expect(useAppStore.getState().projects[0].actualEntries).toEqual([]);expect(useAppStore.getState().assignments).toEqual([]);
  spy.mockRestore();await user.click(screen.getByRole("button",{ name:"Guardar horas" }));
  expect(done).toHaveBeenCalledTimes(1);expect(useAppStore.getState().projects[0].actualEntries).toHaveLength(1);
 });
 it("una acción de varios pasos guarda un solo snapshot y no deja historial parcial al fallar", () => {
  const before=useAppStore.getState(),original=Storage.prototype.setItem;
  const spy=vi.spyOn(Storage.prototype,"setItem").mockImplementation(function(this:Storage,key,value) { if (key===DEMO_DATA_KEY) throw new Error("quota");original.call(this,key,value); });
  expect(before.updateOperator(op.id,{ name:op.name,role:op.role,hourlyCost:180 },day)).toMatchObject({ ok:false });
  expect(useAppStore.getState().operators).toBe(before.operators);expect(useAppStore.getState().priceHistory).toBe(before.priceHistory);
  spy.mockRestore();const writes=vi.spyOn(Storage.prototype,"setItem");
  ok(useAppStore.getState().updateOperator(op.id,{ name:op.name,role:op.role,hourlyCost:180 },day));
  expect(writes.mock.calls.filter(([key]) => key===DEMO_DATA_KEY)).toHaveLength(1);
 });
 it("falla toda escritura: ni la carga manual deja asignaciones ni Configuración comunica éxito", () => {
  const before=useAppStore.getState();vi.spyOn(Storage.prototype,"setItem").mockImplementation(() => { throw new Error("storage blocked"); });
  expect(before.logHoursManual("p",{ operatorId:op.id,itemId:"i",rubro:"carpinteria_madera",date:day,hours:1,categoryId:"cat" })).toMatchObject({ ok:false,error:expect.stringMatching(/no quedó guardado/) });
  expect(before.updateSettings({ dueSoonDays:99 })).toMatchObject({ ok:false });
  expect(useAppStore.getState().assignments).toEqual([]);expect(useAppStore.getState().projects).toBe(before.projects);expect(useAppStore.getState().settings).toBe(before.settings);
 });
});
