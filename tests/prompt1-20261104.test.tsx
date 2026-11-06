// @vitest-environment jsdom
// Fixtures propios y aislados: no reproducen ni reemplazan los datos del navegador.
import "@testing-library/jest-dom/vitest";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen,fireEvent} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {Ledger,Operator,Project} from "@/types";
import {project,line} from "./helpers";
import {useAppStore} from "@/store/use-app-store";
import {EMPTY_LEDGER,registerSalesInvoice,registerCollection,invoiceBalance,paidOf,setFinancialRate,startBomDraft,publishBom} from "@/lib/ledger";
import {EMPTY_STOCK,availableInWarehouse,availableToProject,stockTotalValue,stockRows,leftoverRows,computeBalances} from "@/lib/stock";
import {materialNeeds,orderTotal,orderDestinations} from "@/lib/purchasing";
import {actualCostToDate,projectEconomics,actualByCategory} from "@/lib/calculations";
import {rubroLabel} from "@/lib/rubros";
import {hoursRows} from "@/lib/gerencia";
import {otherCostGroup} from "@/lib/other-costs";
import {correctCollection,requestSupplierPayment,settleRequest,cashInPeriod} from "@/lib/post-meeting";
import {profitView,closeCheck,ledgerAtDate} from "@/lib/tablero";
import {actualStart} from "@/lib/frontend-work";
import {savePersonnel,personnelViews} from "@/lib/personnel";
import {DEFAULT_SETTINGS,DEFAULT_HOUR_RATES} from "@/lib/constants";
import {DEFAULT_COST_SETTINGS} from "@/lib/supabase/workspace";
import {SESSION_KEYS,type SessionKey} from "@/lib/permissions";
import {INDICATORS} from "@/lib/indicators";
import {DASHBOARD_CALCULATIONS} from "@/lib/dashboard-indicators";
import {pickDemoData,createDemoScenario,parseDemoScenario,readDemo} from "@/store/demo-local";
import {StockOrderForm} from "@/components/purchasing/stock-order-form";
import {SupplierPayments} from "@/components/projects/supplier-payments";
import {OtherCostForm} from "@/components/actual-costs/other-cost-form";
import {ActualCostsTab} from "@/components/actual-costs/actual-costs-tab";
import {DeviationSection} from "@/components/projects/deviation-section";
import {GerenciaDashboard} from "@/components/gerencia/gerencia-dashboard";
import {SettingsPage} from "@/components/settings/settings-page";
import {EmployeeForm} from "@/components/operators/employee-form";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn(),back:vi.fn(),replace:vi.fn()}),usePathname:()=>"/",useSearchParams:()=>new URLSearchParams()}));
const day="2026-11-03",now=day+"T15:00:00Z",ctx={actor:"Ensayo aislado",now,today:day};
const st=()=>useAppStore.getState();
const mode=(currentMode:SessionKey)=>useAppStore.setState({currentMode});
function ok<T>(r:{ok:true;value:T}|{ok:false;error:string}):T{if(!r.ok)throw Error(r.error);return r.value;}
const op:Operator={id:"worker",name:"Operario de prueba",role:"Categoría explícita",hourlyCost:14000,active:true,productive:true,enabledRubros:["carpinteria_madera","pintura"],workDays:[0,1,2,3,4,5,6],createdAt:now};
function fixture(id="p"):Project{
 const lines=[line("materials",10,1000,{materialId:"m",description:"Tablero",unit:"placa",quotationItemId:"i"}),line("labor",20,14000,{rubro:"carpinteria_madera",unit:"h",quotationItemId:"i"})];
 return project({id,code:id==="p"?"ENSAYO-1":"ENSAYO-2",salesPrice:2000000,startDate:"2026-10-01",dueDate:"2026-11-10",assignedOperatorIds:[op.id],items:[{id:"i",name:"Mueble",quantity:1,completedUnits:0,rubros:[{rubro:"carpinteria_madera",hours:20,workers:1},{rubro:"pintura",hours:2,workers:1}]}],budgetLines:lines,baseline:{capturedAt:"2026-10-01T12:00:00Z",capturedBy:"Autor original",salesPrice:2000000,budgetTotal:290000,dueDate:"2026-11-10",lines:structuredClone(lines)}});
}
function ledger():Ledger{return {...EMPTY_LEDGER,financialMonthlyRatePct:0,rubroCatalog:[{id:"carpinteria_madera",name:"Carpintería",active:true},{id:"pintura",name:"Pintura",active:true}],materialCatalog:[{id:"m",name:"Tablero",unit:"placa",referenceCost:9999,active:true,validFrom:"2026-01-01"},{id:"x",name:"Adhesivo",unit:"litro",referenceCost:9999,active:true,validFrom:"2026-01-01"}],suppliers:[{id:"supplier",name:"Proveedor aislado",active:true,createdAt:now}],staffCategories:[{id:"craft",name:"Oficial",category:"labor",hourlyCost:14000}],personnel:[{employeeId:op.id,view:"operario",views:["operario"],enabled:true,productive:true,categoryIds:["craft"],enabledRubros:["carpinteria_madera","pintura"],hoursPerDay:8,workDays:[0,1,2,3,4,5,6]}]};}
function stockOrder(){mode("compras");return ok(st().saveOrder({supplier:"Proveedor aislado",date:day,lines:[{destination:"warehouse",projectId:"",budgetLineId:"",materialId:"m",materialName:"Tablero",unit:"placa",quantity:10,unitCost:1000}]}));}
function receive(q=4){const id=stockOrder();ok(st().sendOrder(id));ok(st().receiveOrder(id,[{lineId:st().orders[0].lines[0].id,quantity:q}]));return id;}
function cost(amount=30000,id="expense"){mode("administracion");ok(st().addActualEntry("p",{requestId:id,type:"other",category:"admin",description:"Honorarios administrativos",amount,date:day}));return st().projects[0].actualEntries.find(e=>e.id===id)!;}
beforeEach(()=>{
 vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date(now));localStorage.clear();window.location.hash="";
 useAppStore.setState({demoLocal:true,isDemo:true,organizationId:null,role:"owner",userName:"Autor ensayo",currentMode:"gerencia",actingOperatorId:null,projects:[fixture(),fixture("dest")],ledger:ledger(),orders:[],stock:EMPTY_STOCK,operators:[op],assignments:[],deliveries:[],requests:[],dayExceptions:[],corrections:[],priceHistory:[],reviewedHoursKeys:[],resolvedAlertIds:[],settings:{...DEFAULT_SETTINGS},costSettings:{...DEFAULT_COST_SETTINGS},hourRates:DEFAULT_HOUR_RATES,syncStatus:"idle",syncError:null});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
describe("Prompt 1: depósito, origen y permisos efectivos",()=>{
 it("OC sin proyecto → recepción parcial → cobertura única → asignación → consumo/desperdicio/sobrante, conciliados",()=>{
  const id=receive();const order=st().orders[0],lot=st().stock.lots[0];
  expect(order).toMatchObject({status:"sent",received:"partial",localReceipts:[{quantity:4,by:expect.any(String)}]});
  expect(lot).toMatchObject({orderId:id,orderLineId:order.lines[0].id,unitCost:1000,unit:"placa"});
  expect(orderDestinations(order,st().projects)).toBe("Depósito general");
  expect(st().projects.every(p=>!p.purchaseEntries.length&&!p.actualEntries.length&&!p.materialUsages.length)).toBe(true);
  expect(availableInWarehouse(st().stock,"m")).toBe(4);expect(stockTotalValue(st().stock)).toBe(4000);
  let needs=materialNeeds(st().projects,st().orders,st().stock,day);
  expect(needs.reduce((s,n)=>s+n.fromStock,0)).toBe(4);expect(needs.reduce((s,n)=>s+n.toBuy,0)).toBe(16);
  const prior=st().projects.map(p=>structuredClone(p.baseline));
  ok(st().assignStock({projectId:"p",materialId:"m",materialName:"Tablero",unit:"placa",quantity:3,date:day}));
  needs=materialNeeds(st().projects,st().orders,st().stock,day);
  expect(needs.reduce((s,n)=>s+n.fromDepot,0)).toBe(3);expect(needs.reduce((s,n)=>s+n.fromStock,0)).toBe(1);expect(needs.reduce((s,n)=>s+n.toBuy,0)).toBe(16);
  mode("jefe_planta");ok(st().directMaterialUsage({projectId:"p",itemId:"i",materialId:"m",source:"project",quantity:3,date:day,consumed:2,waste:.5,leftover:.5,units:[]}));
  expect(actualCostToDate(st().projects[0])).toBe(2500);expect(actualCostToDate(st().projects[1])).toBe(0);
  expect(availableToProject(st().stock,"p","m")).toBe(0);expect(availableInWarehouse(st().stock,"m")).toBe(1.5);
  expect(stockRows(st().stock).find(r=>r.materialId==="m")).toMatchObject({available:1.5});
  expect(leftoverRows(st().stock).reduce((s,r)=>s+r.quantity,0)).toBe(.5);
  expect(stockTotalValue(st().stock)+actualCostToDate(st().projects[0])).toBe(4000);
  expect(st().projects.map(p=>p.baseline)).toEqual(prior);
  for(const b of computeBalances(st().stock.movements).values()){expect(b.warehouse).toBeGreaterThanOrEqual(0);for(const q of Object.values(b.held))expect(q).toBeGreaterThanOrEqual(0);}
 });
 it("reversión de recepción libre compensa sin borrar lote/historial; usada/asignada se bloquea",()=>{
  const id=receive();const receipt=st().orders[0].localReceipts![0];const lots=structuredClone(st().stock.lots);
  ok(st().reverseReceiptLocal(id,receipt.movementId,"Recepción duplicada"));expect(st().stock.lots).toEqual(lots);expect(availableInWarehouse(st().stock,"m")).toBe(0);expect(st().orders[0].lines[0].receivedQuantity).toBe(0);
  expect(st().reverseReceiptLocal(id,receipt.movementId,"Repetida").ok).toBe(false);
  ok(st().receiveOrder(id,[{lineId:st().orders[0].lines[0].id,quantity:4}]));ok(st().assignStock({projectId:"p",materialId:"m",materialName:"Tablero",unit:"placa",quantity:1,date:day}));
  expect(st().reverseReceiptLocal(id,st().orders[0].localReceipts!.at(-1)!.movementId,"Ya asignada").ok).toBe(false);
 });
 it.each(SESSION_KEYS)("%s: OC y recepción solo Compras; consumir solo Planta",session=>{
  const id=receive();mode(session);const before=pickDemoData(st() as unknown as Record<string,unknown>);
  if(session!=="compras"){
   expect(st().saveOrder({supplier:"S",date:day,lines:[{destination:"warehouse",projectId:"",budgetLineId:"",materialId:"m",materialName:"Tablero",unit:"placa",quantity:1,unitCost:1}]}).ok).toBe(false);
   expect(st().receiveOrder(id,[{lineId:st().orders[0].lines[0].id,quantity:1}]).ok).toBe(false);
   expect(st().assignStock({projectId:"p",materialId:"m",materialName:"Tablero",unit:"placa",quantity:1,date:day}).ok).toBe(false);
  }
  expect(st().directMaterialUsage({projectId:"p",materialId:"m",source:"warehouse",itemId:"i",quantity:1,date:day,consumed:1,waste:0,leftover:0}).ok).toBe(false);
  expect(pickDemoData(st() as unknown as Record<string,unknown>)).toEqual(before);
 });
 it("Gerencia no consume por la ruta legada y Planta no cambia la tasa financiera declarando su propia sesión",()=>{
  receive();ok(st().assignStock({projectId:"p",materialId:"m",materialName:"Tablero",unit:"placa",quantity:2,date:day}));mode("gerencia");
  const before=pickDemoData(st() as unknown as Record<string,unknown>);
  expect(st().registerUsage("p",{materialId:"m",materialName:"Tablero",unit:"placa",date:day,consumed:1,waste:0}).ok).toBe(false);
  mode("jefe_planta");expect(st().recordLedger(["jefe_planta"],l=>setFinancialRate(l,25)).ok).toBe(false);
  expect(pickDemoData(st() as unknown as Record<string,unknown>)).toEqual(before);
 });
 it("unidades de catálogo, importes finitos y recepción excesiva no alteran datos",()=>{
  const id=stockOrder(),o=st().orders[0];expect(st().saveOrder({...o,lines:o.lines.map(l=>({...l,unit:"metro"}))}).ok).toBe(false);
  expect(st().saveOrder({...o,lines:o.lines.map(l=>({...l,unitCost:Infinity}))}).ok).toBe(false);ok(st().sendOrder(id));const before=st().stock;
  expect(st().receiveOrder(id,[{lineId:o.lines[0].id,quantity:11}]).ok).toBe(false);expect(st().stock).toEqual(before);
  expect(st().receiveOrder(id,[{lineId:o.lines[0].id,quantity:1},{lineId:o.lines[0].id,quantity:1}]).ok).toBe(false);expect(st().stock).toEqual(before);
 });
 it("formulario real de Compras crea dos materiales con IDs distintos; Administración consulta sin operaciones de stock",async()=>{
  mode("compras");const user=userEvent.setup();render(<StockOrderForm onDone={()=>{}}/>);
  await user.selectOptions(screen.getByLabelText("Proveedor"),"Proveedor aislado");
  await user.selectOptions(screen.getByLabelText("Material de catálogo"),"m");await user.type(screen.getByLabelText("Cantidad"),"10");await user.type(screen.getByLabelText("Costo unitario real"),"1000");
  await user.click(screen.getByRole("button",{name:"Agregar material"}));
  await user.selectOptions(screen.getAllByLabelText("Material de catálogo")[1],"x");await user.type(screen.getAllByLabelText("Cantidad")[1],"2");await user.type(screen.getAllByLabelText("Costo unitario real")[1],"500");
  await user.click(screen.getByRole("button",{name:"Guardar orden de stock"}));
  expect(st().orders).toHaveLength(1);expect(new Set(st().orders[0].lines.map(l=>l.id)).size).toBe(2);expect(orderTotal(st().orders[0])).toBe(11000);
  ok(st().sendOrder(st().orders[0].id));ok(st().receiveOrder(st().orders[0].id,[{lineId:st().orders[0].lines[0].id,quantity:4}]));cleanup();mode("administracion");render(<SupplierPayments/>);
  expect(document.body).toHaveTextContent("Depósito general");expect(document.body).toHaveTextContent("Parcial");expect(screen.queryByRole("button",{name:/Recibir|Asignar stock|Enviar al proveedor/})).not.toBeInTheDocument();
 });
});
describe("Prompt 1: otros costos auditados y fuente compartida",()=>{
 it.each(SESSION_KEYS)("%s registra otros costos solamente si corresponde",session=>{
  mode(session);const result=st().addActualEntry("p",{type:"other",category:"admin",description:"Gasto real",amount:30000,date:day});expect(result.ok).toBe(["gerencia","administracion"].includes(session));
 });
 it("corregir → reducción documentada → anular: neto exacto, original inmutable e historial persistente",()=>{
  const origin=structuredClone(cost());const request={requestId:"fix",kind:"correction" as const,reason:"Importe de comprobante",date:day,patch:{type:"logistics" as const,description:"Flete facturado",amount:50000,date:"2026-10-31"}};
  ok(st().adjustOtherCostLocal("p",origin.id,request));ok(st().adjustOtherCostLocal("p",origin.id,request));expect(actualCostToDate(st().projects[0])).toBe(50000);expect(st().projects[0].actualEntries).toHaveLength(3);
  expect(actualByCategory(st().projects[0])).toMatchObject({admin:0,transport:50000});
  ok(st().adjustOtherCostLocal("p",origin.id,{requestId:"credit",kind:"reduction",reason:"Descuento acreditado",reference:"NC-1",date:day,amount:10000}));
  expect(otherCostGroup(st().projects[0],origin.id).value.amount).toBe(40000);
  for(const input of [{requestId:"dup",amount:10000,reference:"nc-1"},{requestId:"excess",amount:40001,reference:"NC-2"},{requestId:"no-doc",amount:1000,reference:""}])expect(st().adjustOtherCostLocal("p",origin.id,{...input,kind:"reduction",reason:"Ajuste real",date:day}).ok).toBe(false);
  expect(st().ledger.collections).toHaveLength(0);expect(st().ledger.supplierPayments).toHaveLength(0);
  ok(st().adjustOtherCostLocal("p",origin.id,{requestId:"cancel",kind:"cancellation",reason:"Comprobante de otro proyecto",date:day}));
  const p=st().projects[0];expect(p.actualEntries[0]).toEqual(origin);expect(actualCostToDate(p)).toBe(0);expect(actualCostToDate({...p,actualEntries:p.actualEntries.filter(e=>e.date<day)})).toBe(0);
  const group=otherCostGroup(p,origin.id);expect(group.history).toHaveLength(3);expect(group.cancelled).toBe(true);expect(group.history.every(e=>e.createdBy&&e.createdAt&&e.costAdjustment?.previous&&e.costAdjustment.next)).toBe(true);
  const file=parseDemoScenario(JSON.stringify(createDemoScenario(pickDemoData(st() as unknown as Record<string,unknown>),"Ensayo aislado")));expect(file).not.toBeNull();expect(readDemo()?.projects).toEqual(JSON.parse(JSON.stringify(st().projects)));
 });
 it("reducción real respeta su fecha, no crea ahorro anterior al documento",()=>{
  const e=cost();ok(st().adjustOtherCostLocal("p",e.id,{requestId:"credit",kind:"reduction",reason:"Bonificación comprobada",reference:"NC-1",date:day,amount:30000}));expect(actualCostToDate(st().projects[0])).toBe(0);
  expect(st().adjustOtherCostLocal("p",e.id,{requestId:"again",kind:"reduction",reason:"No hay saldo",reference:"NC-2",date:day,amount:1}).ok).toBe(false);
  expect(st().addActualEntry("p",{type:"other",category:"admin",description:"Ahorro inventado",amount:-1,date:day}).ok).toBe(false);
 });
 it("rectificación posterior a una bonificación no deja costos en la fecha ni categoría erróneas",()=>{
  mode("administracion");ok(st().addActualEntry("p",{requestId:"expense",type:"other",category:"admin",description:"Gasto original",date:"2026-11-01",amount:30000}));
  ok(st().adjustOtherCostLocal("p","expense",{requestId:"credit",kind:"reduction",reason:"Beneficio real",reference:"NC-2",date:day,amount:5000}));
  expect(profitView(st().projects[0],st().ledger,"2026-11-02").toDate.cost).toBe(30000);expect(profitView(st().projects[0],st().ledger,day).toDate.cost).toBe(25000);
  ok(st().adjustOtherCostLocal("p","expense",{requestId:"fix-after-credit",kind:"correction",reason:"Fecha y concepto correctos",date:day,patch:{type:"logistics",description:"Flete neto documentado",date:"2026-10-31",amount:20000}}));
  const p=st().projects[0];expect(actualByCategory(p)).toMatchObject({admin:0,transport:20000});expect(profitView(p,st().ledger,"2026-10-31").toDate.cost).toBe(20000);expect(profitView(p,st().ledger,"2026-11-01").toDate.cost).toBe(20000);expect(profitView(p,st().ledger,day).toDate.cost).toBe(20000);
 });
 it("Planta no transfiere un sobrante mediante la ruta legada y Administración no libera asignaciones",()=>{
  receive();ok(st().assignStock({projectId:"p",materialId:"m",materialName:"Tablero",unit:"placa",quantity:2,date:day}));const before=st().stock;
  mode("jefe_planta");expect(st().registerUsage("p",{materialId:"m",materialName:"Tablero",unit:"placa",date:day,consumed:0,waste:0,leftover:{quantity:1,destination:{projectId:"dest"}}}).ok).toBe(false);
  mode("administracion");expect(st().releaseStock({projectId:"p",materialId:"m",materialName:"Tablero",unit:"placa",quantity:1,date:day}).ok).toBe(false);expect(st().stock).toEqual(before);
 });
 it("cerrados: solo Gerencia rectifica sin reabrir ni validar costos faltantes",()=>{
  const e=cost();const p={...st().projects[0],isClosed:true,status:"completed" as const,closedAt:now};useAppStore.setState({projects:[p],ledger:{...st().ledger,closures:[{projectId:"p",date:day,by:"Autor cierre",pendingCosts:["Falta factura"]}]}});
  const l=structuredClone(st().ledger),baseline=structuredClone(p.baseline),change={requestId:"closed-fix",kind:"correction" as const,reason:"Factura definitiva",date:day,patch:{type:"other" as const,category:"admin" as const,description:"Gasto corregido",amount:20000,date:day}};
  expect(st().adjustOtherCostLocal("p",e.id,change).ok).toBe(false);mode("gerencia");ok(st().adjustOtherCostLocal("p",e.id,change));
  expect(st().projects[0]).toMatchObject({isClosed:true,status:"completed",closedAt:now,baseline});expect(st().ledger).toEqual(l);expect(profitView(st().projects[0],st().ledger,day)).toMatchObject({final:null,toDate:{cost:20000,partial:true}});
 });
 it("un fallo de almacenamiento revierte la operación completa y permite reintentar sin duplicar",()=>{
  const e=cost(),before=structuredClone(st().projects);const change={requestId:"retry",kind:"reduction" as const,reason:"Nota de crédito",reference:"NC-1",date:day,amount:5000};
  const spy=vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw Error("Sin espacio");});expect(st().adjustOtherCostLocal("p",e.id,change).ok).toBe(false);expect(st().projects).toEqual(before);spy.mockRestore();
  ok(st().adjustOtherCostLocal("p",e.id,change));ok(st().adjustOtherCostLocal("p",e.id,change));expect(actualCostToDate(st().projects[0])).toBe(25000);
 });
 it("Administración usa el formulario y lista compartidos, sin exponer horas privadas ni rentabilidad",async()=>{
  mode("administracion");const user=userEvent.setup();render(<OtherCostForm project={st().projects[0]} cost={{type:"other",category:"admin"}} onDone={()=>{}}/>);
  await user.type(screen.getByLabelText("Descripción"),"Gestión documentada");await user.type(screen.getByLabelText("Monto (ARS)"),"30000");await user.click(screen.getByRole("button",{name:"Registrar costo"}));
  expect(actualCostToDate(st().projects[0])).toBe(30000);cleanup();
  const p=st().projects[0];const labor={id:"private",projectId:"p",date:day,type:"labor" as const,category:"labor" as const,description:"Remuneración privada",amount:56000,operatorId:op.id,labor:{role:"Oficial",hours:4,hourlyCost:14000},createdBy:"G",createdAt:now};
  render(<ActualCostsTab project={{...p,actualEntries:[...p.actualEntries,labor]}}/>);expect(document.body).toHaveTextContent("Gestión documentada");expect(document.body.textContent).not.toMatch(/Remuneración privada|14\.000|56\.000|Ganancia|Rentabilidad/);
 });
 it("desvío administrativo identifica Otros costos y el movimiento; proyección excedida no es verde dentro de presupuesto",()=>{
  const e=cost();const p=st().projects[0];p.budgetLines=[...p.budgetLines,line("admin",10,1000,{unit:"h"})];
  render(<DeviationSection project={p} econ={projectEconomics(p)} settings={DEFAULT_SETTINGS} completed={false}/>);
  const row=screen.getByText("Administración").closest("tr")!;expect(row).toHaveTextContent("Origen en Otros costos");expect(row).toHaveTextContent(e.id);expect(row).toHaveTextContent("Honorarios administrativos");expect(row).not.toHaveTextContent("Dentro de lo presupuestado");
  expect(projectEconomics(p).categories.find(c=>c.category==="admin")).toMatchObject({actual:30000,projected:40000});expect(screen.getByRole("link",{name:"Abrir Otros costos"})).toHaveAttribute("href","/projects/p?tab=costs");
 });
});
describe("Prompt 1: horas, caja y producción sin duplicación",()=>{
 it("6 → 5 → 4 h sobre 20 cotizadas: costo neto 84.000 → 70.000 → 56.000 y rentabilidad reconciliada",()=>{
  cost(90000);mode("operario");useAppStore.setState({actingOperatorId:op.id});ok(st().executeWorkLocal({requestId:"hours",operatorId:op.id,projectId:"p",itemId:"i",rubro:"carpinteria_madera",date:day,hours:6,categoryId:"craft"}));
  expect(profitView(st().projects[0],st().ledger,day).toDate.cost).toBe(174000);mode("jefe_planta");
  for(const [hours,costValue] of [[5,160000],[4,146000]]){ok(st().correctExecutionLocal({entryId:"hours",projectId:"p",itemId:"i",rubro:"carpinteria_madera",date:day,hours,reason:"Parte rectificado"}));expect(profitView(st().projects[0],st().ledger,day).toDate.cost).toBe(costValue);}
  expect(hoursRows([st().projects[0]],"rubro").find(r=>r.key===rubroLabel("carpinteria_madera"))).toMatchObject({budget:20,actual:4,deviation:-16});expect(profitView(st().projects[0],st().ledger,day).toDate.profit).toBe(1854000);
 });
 it("6 → 5 → 4 h, fecha y proyecto distintos: tarifa histórica, origen sin costo y destino una sola vez",()=>{
  mode("operario");useAppStore.setState({actingOperatorId:op.id});ok(st().executeWorkLocal({requestId:"hours",operatorId:op.id,projectId:"p",itemId:"i",rubro:"carpinteria_madera",date:day,hours:6,categoryId:"craft"}));
  const original=structuredClone(st().projects[0].actualEntries[0]);expect(original.amount).toBe(84000);mode("jefe_planta");
  ok(st().correctExecutionLocal({entryId:"hours",projectId:"p",itemId:"i",rubro:"carpinteria_madera",date:day,hours:5,reason:"Revisión del parte"}));expect(actualCostToDate(st().projects[0])).toBe(70000);
  useAppStore.setState({operators:[{...op,hourlyCost:99000}],ledger:{...st().ledger,staffCategories:[{id:"craft",name:"Oficial",category:"labor",hourlyCost:99000}]}});
  ok(st().correctExecutionLocal({entryId:"hours",projectId:"dest",itemId:"i",rubro:"pintura",date:"2026-11-02",hours:4,reason:"Trabajo en otro proyecto"}));
  expect(actualCostToDate(st().projects[0])).toBe(0);expect(actualCostToDate(st().projects[1])).toBe(56000);const e=st().projects[1].actualEntries[0];
  expect(e).toMatchObject({id:original.id,createdBy:original.createdBy,createdAt:original.createdAt,categoryId:"craft",labor:{hours:4,hourlyCost:14000},rubro:"pintura",date:"2026-11-02"});expect(e.corrections).toHaveLength(2);expect(e.corrections!.map(c=>[c.previous.amount,c.next.amount])).toEqual([[84000,70000],[70000,56000]]);expect(st().assignments).toHaveLength(0);
 });
 it("cobro 100.000 → 80.000 y dos pagos de 200.000: caja cambia, costo 146.000 y ganancia 1.854.000 se conservan",()=>{
  cost(90000);mode("operario");useAppStore.setState({actingOperatorId:op.id});ok(st().executeWorkLocal({requestId:"hours",operatorId:op.id,projectId:"p",itemId:"i",rubro:"carpinteria_madera",date:day,hours:4,categoryId:"craft"}));
  const p=st().projects[0];mode("administracion");ok(st().recordLedger(["administracion"],(l,c)=>registerSalesInvoice(l,p,{number:"F-1",date:day,amount:600000},c)));const invoiceId=st().ledger.salesInvoices[0].id;
  for(const amount of [300000,100000])ok(st().recordLedger(["administracion"],(l,c)=>registerCollection(l,p,{invoiceId,date:day,amount},c)));
  const collection=st().ledger.collections.at(-1)!;ok(st().recordLedger(["administracion"],(l,c)=>correctCollection(l,p,collection.id,{invoiceId,date:day,amount:80000},"Importe de recibo",c)));
  expect(st().ledger.collections.reduce((s,c)=>s+c.amount,0)).toBe(380000);expect(invoiceBalance(st().ledger,invoiceId)).toBe(220000);
  const id=stockOrder();useAppStore.setState({orders:st().orders.map(o=>({...o,lines:o.lines.map(l=>({...l,quantity:660,unitCost:1000}))}))});ok(st().sendOrder(id));const o=st().orders[0];
  ok(st().recordLedger(["compras"],(l,c)=>requestSupplierPayment(l,o,{amount:660000,date:day,reason:"Reposición de depósito"},c)));mode("administracion");const request=st().ledger.paymentRequests![0];
  for(const reference of ["Deb-1","Deb-2"])ok(st().recordLedger(["administracion"],(l,c)=>settleRequest(l,o,request.id,{amount:200000,date:day,reference},c)));
  expect(paidOf(st().ledger,o.id)).toBe(400000);expect(orderTotal(o)-paidOf(st().ledger,o.id)).toBe(260000);expect(profitView(st().projects[0],st().ledger,day).toDate).toMatchObject({cost:146000,profit:1854000,partial:true});expect(cashInPeriod(st().ledger,day,day)).toEqual({collected:380000,paid:400000,result:-20000});
 });
 it("inicio normal sin motivo no inventa horas ni primer trabajo; excepciones exigen motivo",()=>{
  const p={...st().projects[0],status:"purchasing" as const};let l=startBomDraft(st().ledger,p,"i",ctx);l=publishBom(l,l.boms[0].id,ctx);useAppStore.setState({projects:[p],ledger:l});mode("jefe_planta");
  ok(st().operationalStageLocal("p","production",day,""));expect(st().projects[0].productionDecision).toMatchObject({date:day,reason:""});expect(actualStart(st().projects[0],st().ledger)).toBeUndefined();expect(actualCostToDate(st().projects[0])).toBe(0);
  expect(st().operationalStageLocal("p","purchasing",day,"").ok).toBe(false);ok(st().operationalStageLocal("p","purchasing",day,"Material adicional"));
 });
 it("una vista por empleado, independiente de categorías/rubros; legado se conserva sin habilitar varias sesiones",()=>{
  const legacy={...st().ledger.personnel![0],views:["operario","administracion"] as SessionKey[]};expect(personnelViews(legacy)).toEqual(["operario"]);expect(()=>savePersonnel(st().ledger,[op],legacy)).toThrow(/exactamente una/);
  render(<EmployeeForm employee={op}/>);expect(screen.getByLabelText("Vista de Blerp")).not.toHaveAttribute("multiple");expect(screen.getByLabelText("Categorías laborales")).toHaveAttribute("multiple");
 });
 it("cierre mantiene bloqueo de materiales/unidades/entrega y no convierte cierre histórico en final",()=>{
  receive();ok(st().assignStock({projectId:"p",materialId:"m",materialName:"Tablero",unit:"placa",quantity:1,date:day}));const check=closeCheck(st().projects[0],st().ledger,st().stock,st().orders);expect(check.blockers.join(" ")).toMatch(/materiales sin rendir/);expect(check.blockers.join(" ")).toMatch(/unidades terminadas/);expect(check.blockers.join(" ")).toMatch(/entrega real/);
  const p={...st().projects[0],isClosed:true,status:"completed" as const};expect(profitView(p,st().ledger,day).final).toBeNull();render(<DeviationSection project={p} econ={projectEconomics(p)} settings={DEFAULT_SETTINGS} completed={false}/>);expect(document.body).toHaveTextContent("Cerrado con costos pendientes de validar");expect(document.body).not.toHaveTextContent("Costo real final");
 });
});
describe("Prompt 1: cortes y diccionario verificable",()=>{
 it("todas las secciones/KPI del Dashboard están registradas con definición completa en la Configuración existente",async()=>{
  const {container}=render(<GerenciaDashboard/>);expect(container.querySelectorAll('[aria-label="Resumen"] [data-indicator]')).toHaveLength(5);
  const ids=new Set(Array.from(container.querySelectorAll("[data-indicators],[data-indicator]")).flatMap(el=>[el.getAttribute("data-indicator"),...(el.getAttribute("data-indicators")??"").split(" ")]).filter((s):s is string=>!!s));
  for(const node of container.querySelectorAll("details[id]"))expect(node.getAttribute("data-indicators"),node.id).toBeTruthy();
  for(const values of Object.values(DASHBOARD_CALCULATIONS))for(const id of values)ids.add(id);
  for(const id of ids){const definition=INDICATORS.find(i=>i.id===id);expect(definition,id).toBeDefined();for(const key of ["name","meaning","formula","source","params","period","limits","updates"] as const)expect(definition![key].length,`${id}.${key}`).toBeGreaterThan(10);}
  cleanup();render(<SettingsPage/>);await userEvent.setup().click(screen.getByRole("tab",{name:"Indicadores y cálculos"}));expect(document.body).toHaveTextContent("Indicadores y cálculos");for(const id of ids)expect(document.body).toHaveTextContent(INDICATORS.find(i=>i.id===id)!.name);
 });
 it("Desde selecciona cobros/aprobaciones, Hasta recorta todos los costos y el contrato acumulado; operativo lo aclara",async()=>{
  cost(30000);const p=st().projects[0];useAppStore.setState({projects:[{...p,actualEntries:[...p.actualEntries,{...p.actualEntries[0],id:"future",date:"2026-11-04",amount:999000}]}],ledger:{...st().ledger,collections:[{id:"old",projectId:"p",date:"2026-10-31",amount:100000,createdBy:"A",createdAt:now},{id:"new",projectId:"p",date:day,amount:80000,createdBy:"A",createdAt:now}]}});
  mode("gerencia");const {container}=render(<GerenciaDashboard/>);
  const gain=container.querySelector('[data-indicator="profit_views"]')!,collected=container.querySelector('[data-indicator="collected"]')!,balance=container.querySelector('[data-indicator="contract_balance"]')!;
  expect(gain).toHaveTextContent("1.970.000");expect(collected).toHaveTextContent("80.000");expect(balance).toHaveTextContent("1.820.000");
  expect(container.querySelector('#costos')).not.toHaveTextContent("999.000");expect(document.body).toHaveTextContent(/independiente de Desde\/Hasta/);
  fireEvent.change(screen.getByLabelText("Desde"),{target:{value:"2026-10-01"}});
  fireEvent.change(screen.getByLabelText("Hasta"),{target:{value:"2026-10-31"}});
  expect(container.querySelector('[data-indicator="profit_views"]')).toHaveTextContent("2.000.000");expect(container.querySelector('[data-indicator="contract_balance"]')).toHaveTextContent("1.900.000");
  expect(ledgerAtDate(st().ledger,"2026-10-31").collections).toHaveLength(1);
 });
});
