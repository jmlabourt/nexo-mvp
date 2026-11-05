// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
import { render,screen,cleanup,within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {Ledger,PurchaseOrder,Operator} from "@/types";
import { EMPTY_LEDGER,registerSalesInvoice,registerCollection,applyAdvance,billingStatus,startBomDraft,publishBom } from "@/lib/ledger";
import { cashInPeriod,financeReminders,requestSupplierPayment,manageBanking,settleRequest,requestBalance,correctInvoice,correctCollection,correctSupplierPayment } from "@/lib/post-meeting";
import { useAppStore } from "@/store/use-app-store";
import { profitView,billingMonths,ledgerAtDate,capacityTimeline } from "@/lib/tablero";
import { weeklyCapacity,externalCost,registerExternal,completeExternal } from "@/lib/frontend-work";
import { saveCapacityPlan } from "@/lib/capacity-plans";
import { dayCapacity,fullWeek } from "@/lib/schedule";
import { EMPTY_STOCK,stockValuation } from "@/lib/stock";
import { withPublishedBom } from "@/lib/bom-needs";
import { materialNeeds } from "@/lib/purchasing";
import { StaffCategoriesSettings } from "@/components/settings/frontend-production";
import { materialArrivalNotices } from "@/components/plant/material-arrival-notices";
import { CapacityOverview } from "@/components/plant/capacity-overview";
import { LedgerBillingTab } from "@/components/projects/ledger-billing";
import { SupplierPayments } from "@/components/projects/supplier-payments";
import { pickDemoData,writeDemo,readDemo } from "@/store/demo-local";
import { initialCalcState,newProductRow,computeCalculator,productInputs,reviewWarnings,quoteActionBlocker } from "@/components/budget/calculator-state";
import { DEFAULT_HOUR_RATES } from "@/lib/constants";
import { captureBaseline,createProject } from "@/lib/project-operations";
import { frozenQuoteGroups } from "@/lib/quotation-presentation";
import { project } from "./helpers";
import { ProjectsTable } from "@/components/projects/projects-table";
import { projectEconomics } from "@/lib/calculations";
import { formatCurrency } from "@/lib/formatting";
import { todayISO } from "@/lib/formatting";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn()}),usePathname:()=>"/",useSearchParams:()=>new URLSearchParams()}));
const day=todayISO(),ctx={actor:"Ensayo aislado",now:day+"T15:00:00Z",today:day};
const st=()=>useAppStore.getState();const mode=(currentMode:"gerencia"|"administracion"|"compras"|"jefe_planta"|"operario")=>useAppStore.setState({currentMode});
const ok=<T,>(r:{ok:true;value:T}|{ok:false;error:string}):T=>{if(!r.ok)throw Error(r.error);return r.value;};
function ledger():Ledger{return {...EMPTY_LEDGER,financialMonthlyRatePct:0,rubroCatalog:[{id:"carpinteria_madera",name:"Carpintería madera",active:true},{id:"pintura",name:"Pintura",active:true}],staffCategories:[{id:"staff-operator",kind:"operator",name:"Operario",category:"labor",hourlyCost:100},{id:"sales",name:"Comercial",category:"admin",hourlyCost:80}],materialCatalog:[{id:"m",name:"Tablero",unit:"u",referenceCost:20,active:true,validFrom:day}]};}
const po:PurchaseOrder={id:"o",number:"OC-test",date:day,status:"sent",supplier:"Proveedor de prueba",paid:false,received:"no",createdAt:ctx.now,createdBy:ctx.actor,lines:[{id:"ol",projectId:"p",budgetLineId:"q",materialId:"m",materialName:"Tablero",unit:"u",quantity:10,unitCost:20,receivedQuantity:0}]};
beforeEach(()=>{localStorage.clear();useAppStore.setState({demoLocal:true,isDemo:true,organizationId:null,role:"owner",currentMode:"administracion",ledger:ledger(),projects:[project({salesPrice:1000})],orders:[po],stock:EMPTY_STOCK,operators:[],assignments:[],deliveries:[],requests:[],dayExceptions:[],priceHistory:[],reviewedHoursKeys:[],resolvedAlertIds:[]});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe("Responsabilidades y separación económica/caja",()=>{
 it.each(["gerencia","compras","jefe_planta","operario"] as const)("%s no registra facturas, cobros ni pagos incluso declarando su sesión",session=>{
  mode(session);const before=st().ledger;
  expect(st().recordLedger([session],(l,c)=>registerSalesInvoice(l,st().projects[0],{number:"F",date:day,amount:100},c)).ok).toBe(false);
  expect(st().recordLedger([session],(l,c)=>registerCollection(l,st().projects[0],{date:day,amount:100},c)).ok).toBe(false);
  expect(st().ledger).toEqual(before);
 });
 it("hito → factura con vencimiento → cobro parcial → anticipo aplicado: una sola suma y misma ganancia sin financiación",()=>{
  const p=st().projects[0];let l=ledger();l.paymentTerms=[{projectId:p.id,daysAfterDelivery:0,schedule:[{id:"milestone",label:"Anticipo pactado",date:day,amount:400}]}];
  expect(financeReminders([p],l,day)).toHaveLength(1);
  const profit=profitView(p,l,day).toDate.profit;
  l=registerSalesInvoice(l,p,{number:"F-1",date:day,amount:400,dueDate:day,condition:"Anticipo",milestoneId:"milestone"},ctx);const invoice=l.salesInvoices[0];
  expect(financeReminders([p],l,day).filter(r=>r.kind==="invoice")).toEqual([]);expect(financeReminders([p],l,day).some(r=>r.kind==="collection")).toBe(true);
  l=registerCollection(l,p,{invoiceId:invoice.id,date:day,amount:150},ctx);l=registerCollection(l,p,{date:day,amount:250},ctx);l=applyAdvance(l,l.collections[1].id,invoice.id);
  expect(billingStatus(p,l)).toMatchObject({contracted:1000,invoiced:400,collected:400,advances:0,invoicedUncollected:0});expect(financeReminders([p],l,day)).toEqual([]);
  expect(cashInPeriod(l,day,day)).toEqual({collected:400,paid:0,result:400});expect(profitView(p,l,day).toDate.profit).toBe(profit);
  expect(()=>applyAdvance(l,l.collections[1].id,invoice.id)).toThrow(/aplicado/);expect(()=>registerCollection(l,p,{date:day,amount:601},ctx)).toThrow(/saldo/);
 });
 it("factura anulada conserva ID/historial y deja de sumar en todas las proyecciones; cobro aplicado bloquea anulación",()=>{
  const p=st().projects[0];let l=registerSalesInvoice(ledger(),p,{number:"F",date:day,amount:400},ctx);const id=l.salesInvoices[0].id;
  const paid=registerCollection(l,p,{invoiceId:id,date:day,amount:100},ctx);expect(()=>correctInvoice(paid,id,{amount:400,cancelled:true},"Error de emisión",ctx)).toThrow(/cobros/);
  l=correctInvoice(l,id,{amount:400,cancelled:true},"Error de emisión",ctx);expect(l.salesInvoices[0]).toMatchObject({id,cancelled:true});expect(l.financialCorrections).toHaveLength(1);expect(billingStatus(p,l).invoiced).toBe(0);expect(billingMonths([p],l,day,day)[0].invoiced).toBe(0);
 });
 it("corregir cobro conserva identidad, registra antes/después y mueve caja por fecha efectiva",()=>{
  const p=st().projects[0];let l=registerCollection(ledger(),p,{date:"2026-10-01",amount:100},ctx);const id=l.collections[0].id;
  l=correctCollection(l,p,id,{date:day,amount:120,notes:"Banco confirmado"},"Fecha mal ingresada",ctx);
  expect(l.collections).toHaveLength(1);expect(l.collections[0].id).toBe(id);expect(l.financialCorrections![0].before).toMatchObject({amount:100,date:"2026-10-01"});expect(cashInPeriod(l,"2026-10-01","2026-10-01").collected).toBe(0);expect(cashInPeriod(l,day,day).collected).toBe(120);
 });
 it("Compras solicita → Administración emite e-cheq sin débito → paga parcialmente → saldo y caja compartidos",()=>{
  mode("compras");ok(st().recordLedger(["compras"],(l,c)=>requestSupplierPayment(l,po,{amount:200,date:day,reason:"Pago de orden enviada"},c)));const req=st().ledger.paymentRequests![0];
  expect(st().ledger.supplierPayments).toEqual([]);expect(()=>requestSupplierPayment(st().ledger,po,{amount:1,date:day,reason:"Duplicada"},ctx)).toThrow(/saldo/);
  mode("administracion");ok(st().recordLedger(["administracion"],(l,c)=>manageBanking(l,req.id,{instrument:"echeq",issuedOn:day,reference:"EC-1",dueOn:day},"Emisión manual verificada",c)));
  expect(cashInPeriod(st().ledger,day,day).paid).toBe(0);const cost=profitView(st().projects[0],st().ledger,day).toDate.cost;
  ok(st().recordLedger(["administracion"],(l,c)=>settleRequest(l,po,req.id,{date:day,amount:80,reference:"Débito EC-1 parcial"},c)));
  expect(requestBalance(st().ledger,req)).toBe(120);expect(cashInPeriod(st().ledger,day,day)).toEqual({collected:0,paid:80,result:-80});expect(profitView(st().projects[0],st().ledger,day).toDate.cost).toBe(cost);
  expect(()=>settleRequest(st().ledger,po,req.id,{date:day,amount:80,reference:"Débito EC-1 parcial"},ctx)).toThrow(/registrado/);
  expect(()=>settleRequest(st().ledger,po,req.id,{date:day,amount:121,reference:"Exceso"},ctx)).toThrow(/saldo/);
  ok(st().recordLedger(["administracion"],(l,c)=>settleRequest(l,po,req.id,{date:day,amount:120,reference:"Débito EC-1 saldo"},c)));expect(requestBalance(st().ledger,req)).toBe(0);
  mode("gerencia");render(<SupplierPayments/>);expect(screen.getByText(/Pagada/)).toBeInTheDocument();expect(screen.queryByRole("button")).not.toBeInTheDocument();expect(st().recordLedger(["gerencia"],(l,c)=>manageBanking(l,req.id,{instrument:"transfer",issuedOn:day,reference:"X"},"Intento",c)).ok).toBe(false);
 });
 it("corrección de pago conserva ID e historial y no duplica su costo",()=>{
  let l=requestSupplierPayment(ledger(),po,{amount:200,date:day,reason:"Proveedor"},ctx);l=settleRequest(l,po,l.paymentRequests![0].id,{date:day,amount:100,reference:"TX"},ctx);const id=l.supplierPayments[0].id;
  l=correctSupplierPayment(l,po,id,{date:day,amount:90,reference:"TX corregida"},"Error de importe",ctx);expect(l.supplierPayments).toHaveLength(1);expect(l.supplierPayments[0].id).toBe(id);expect(cashInPeriod(l,day,day).paid).toBe(90);expect(l.financialCorrections).toHaveLength(1);
 });
 it("Gerencia solo consulta formularios de facturación; Administración puede operar después del cierre fabril",()=>{
  mode("gerencia");render(<LedgerBillingTab project={st().projects[0]}/>);expect(screen.queryByRole("button",{name:"Registrar cobro"})).not.toBeInTheDocument();cleanup();mode("administracion");render(<LedgerBillingTab project={{...st().projects[0],isClosed:true,status:"completed"}}/>);expect(screen.getByRole("button",{name:"Registrar cobro"})).toBeInTheDocument();
 });
});

describe("Personal y capacidad compartida",()=>{
 it("Categorías productivas y no operarias configurables sin cambiar naturaleza histórica",async()=>{
  useAppStore.setState({ledger:{...ledger(),staffCategories:[]}});mode("gerencia");const user=userEvent.setup();render(<StaffCategoriesSettings/>);expect(screen.getByLabelText("¿Corresponde a trabajo de operarios?")).toBeInTheDocument();
  await user.type(screen.getByLabelText("Categoría"),"Operario");await user.selectOptions(screen.getByLabelText("¿Corresponde a trabajo de operarios?"),"yes");await user.type(screen.getByLabelText("Costo por hora"),"100");await user.click(screen.getByRole("button",{name:"Agregar categoría"}));expect(st().ledger.staffCategories![0]).toMatchObject({name:"Operario",kind:"operator",category:"labor"});
  await user.selectOptions(screen.getByLabelText("¿Corresponde a trabajo de operarios?"),"no");await user.type(screen.getByLabelText("Categoría"),"Diseñador");await user.type(screen.getByLabelText("Costo por hora"),"80");await user.click(screen.getByRole("button",{name:"Agregar categoría"}));expect(st().ledger.staffCategories!.at(-1)!.category).toBe("admin");
  expect(st().recordLedger(["gerencia"],l=>({...l,staffCategories:l.staffCategories!.map(c=>({...c,category:"admin"}))})).ok).toBe(false);
 });
 it("categorías determinan rubros, no vistas; dos categorías/vistas no duplican persona ni costo",()=>{
  mode("gerencia");const id=ok(st().saveEmployeeLocal({name:"Persona de prueba",active:true,profile:{enabled:true,view:"operario",views:["operario"],categoryIds:["staff-operator","sales"],productive:false,enabledRubros:["carpinteria_madera","pintura"],hoursPerDay:6,workDays:[0,1,2,3,4,5,6]}}));
  expect(st().operators).toHaveLength(1);expect(st().operators[0].productive).toBe(true);expect(st().ledger.personnel![0]).toMatchObject({employeeId:id,productive:true,views:["operario"]});
  ok(st().saveEmployeeLocal({id,name:"Persona de prueba",active:true,profile:{...st().ledger.personnel![0],categoryIds:["sales"],productive:true}}));expect(st().ledger.personnel![0]).toMatchObject({productive:false,enabledRubros:[]});
 });
 it("Planta 2×50=100 +20 una vez; otro rubro usa Personal; termina vigencia y Gerencia solo consulta",()=>{
  const op:Operator={id:"employee",name:"Persona",role:"No define habilidad",active:true,hourlyCost:100,productive:true,hoursPerDay:6,workDays:[0,1,2,3,4,5,6],enabledRubros:["carpinteria_madera","pintura"],createdAt:ctx.now};const week=fullWeek(day);
  mode("jefe_planta");ok(st().recordLedger(["jefe_planta"],(l,c)=>saveCapacityPlan(l,{rubro:"carpinteria_madera",from:week[0],to:week[6],workers:2,hoursPerWorker:50,note:"Turno temporal confirmado"},c)));
  const l={...st().ledger,capacityAdjustments:[{id:"a",rubro:"carpinteria_madera" as const,date:week[2],hours:20,note:"Refuerzo",by:ctx.actor,at:ctx.now}]};
  expect(weeklyCapacity([],[op],[],[],week[0],week[6],day,8,"carpinteria_madera",l).available).toBe(120);expect(weeklyCapacity([],[op],[],[],week[0],week[6],day,8,"pintura",l).available).toBe(21);expect(weeklyCapacity([],[op],[],[],week[0],week[6],day,8,undefined,l).available).toBe(141);expect(dayCapacity(op,day,[],8).hours).toBe(6);
  useAppStore.setState({ledger:l,operators:[op]});render(<CapacityOverview/>);const plant=screen.getByRole("region",{name:"Capacidad compartida"}).textContent;cleanup();mode("gerencia");render(<CapacityOverview/>);expect(screen.getByRole("region",{name:"Capacidad compartida"}).textContent).toBe(plant);expect(st().recordLedger(["gerencia"],(l,c)=>saveCapacityPlan(l,{rubro:"pintura",from:day,to:day,workers:2,hoursPerWorker:30,note:"Intento"},c)).ok).toBe(false);
 });
 it("tercerización encargada no crea horas ni costo realizado; completada y confirmada se imputa una vez",()=>{
  const p=project({items:[{id:"i",name:"Mesa",quantity:1,completedUnits:0,rubros:[{rubro:"carpinteria_madera",hours:1,workers:1}]}]});let l=registerExternal(ledger(),[p],{projectId:p.id,itemId:"i",rubro:"carpinteria_madera",date:day,kind:"workshop",status:"commissioned",description:"Encargo a taller",estimatedCost:100},ctx);expect(externalCost(l,p.id)).toBe(0);l=completeExternal(l,l.externalWork![0].id,day,ctx);expect(externalCost(l,p.id)).toBe(100);expect(l.externalWork).toHaveLength(1);expect(ledgerAtDate(l,"2020-01-01").externalWork).toEqual([]);
 });
});

describe("Cotización → BOM → OC → stock → Planta → Gerencia, sin retrocesos comerciales",()=>{
 it("dos muebles iguales conservan identidades y snapshot; compra parcial, vuelta trazable a Compras y retorno",()=>{
  const calc=initialCalcState(0);calc.products=[newProductRow("Mesa"),newProductRow("Mesa")];calc.products.forEach(p=>{p.rubros[0].hours="1";p.rubros[0].materials=[{key:p.key,materialId:"m",name:"Tablero",unit:"u",quantity:"10",unitCost:"20",wastePct:"0"}];p.rubros[0].staffHours=[{rateId:"sales",name:"Comercial",category:"admin",hours:"1",hourlyCost:80}];});
  const result=computeCalculator(calc,"Local comercial",{projects:[],rates:DEFAULT_HOUR_RATES,hoursPerDay:8,overtimeMultiplier:2,salesPrice:100000,isDemo:false});const p=createProject({code:"ENSAYO",name:"Prueba aislada",client:"Cliente de prueba",projectType:"Local comercial",description:"",startDate:day,dueDate:day,owner:"A",salesPrice:100000,budgetLines:result.lines,items:productInputs(calc)},ctx);p.baseline=captureBaseline(p,ctx);p.status="approved";useAppStore.setState({projects:[p],orders:[]});const baseline=structuredClone(p.baseline);
  for(const item of p.items)ok(st().recordLedger(["administracion"],(l,c)=>{const next=startBomDraft(l,p,item.id,c);return publishBom(next,next.boms.at(-1)!.id,c);}));expect(st().projects[0].status).toBe("purchasing");
  expect(st().changeProjectStatus(p.id,"approved",{confirmBack:true}).ok).toBe(false);mode("gerencia");expect(st().changeProjectStatus(p.id,"quotation",{confirmBack:true}).ok).toBe(false);
  mode("administracion");ok(st().renameItemLocal(p.id,p.items[0].id,"Nombre operativo nuevo"));expect(st().projects[0].baseline).toEqual(baseline);expect(frozenQuoteGroups(st().projects[0]).filter(g=>g.label.startsWith("Mesa"))).toHaveLength(2);
  const need=materialNeeds(st().projects.map(p=>withPublishedBom(p,st().ledger)),[],st().stock,day)[0];mode("compras");const oid=ok(st().saveOrder({supplier:"Proveedor",date:day,lines:[{projectId:p.id,budgetLineId:need.lineId,materialId:"m",materialName:"Tablero",quantity:6,unit:"u",unitCost:20}]}));ok(st().sendOrder(oid));const ol=st().orders[0].lines[0];ok(st().receiveOrder(oid,[{lineId:ol.id,quantity:4}]));expect(materialArrivalNotices(st().projects,st().stock)).toMatchObject([{quantity:4,unit:"u"}]);
  mode("jefe_planta");ok(st().operationalStageLocal(p.id,"production",day,"Inicio decidido según capacidad"));expect(st().projects[0].productionDecision?.date).toBe(day);expect(st().projects[0].actualEntries).toEqual([]);
  const before=structuredClone({orders:st().orders,boms:st().ledger.boms,stock:st().stock});ok(st().operationalStageLocal(p.id,"purchasing",day,"Materiales adicionales requeridos"));expect(st().projects[0].status).toBe("purchasing");expect({orders:st().orders,boms:st().ledger.boms,stock:st().stock}).toEqual(before);ok(st().operationalStageLocal(p.id,"production",day,"Se retoma fabricación"));
  ok(st().directMaterialUsage({projectId:p.id,itemId:p.items[0].id,materialId:"m",source:"project",date:day,quantity:4,consumed:2,waste:1,leftover:1,units:[]}));expect(profitView(st().projects[0],st().ledger,day).toDate.cost).toBe(60);expect(stockValuation(st().stock).value).toBe(20);expect(materialArrivalNotices(st().projects,st().stock)).toEqual([]);expect(st().projects[0].baseline).toEqual(baseline);
  const isolated=pickDemoData(st() as unknown as Record<string,unknown>);expect(writeDemo(isolated)).toBe(true);expect(readDemo()).toEqual(JSON.parse(JSON.stringify(isolated)));
 });
});

describe("Formularios operativos reales en jsdom",()=>{
 it("solicita y registra un pago por clic, sin botón de aprobación gerencial",async()=>{
  const user=userEvent.setup();mode("compras");render(<SupplierPayments/>);
  await user.type(screen.getByLabelText("Importe solicitado"),"200");await user.type(screen.getByLabelText("Motivo del pago"),"Obligación de prueba");await user.click(screen.getByRole("button",{name:"Solicitar pago"}));expect(st().ledger.paymentRequests).toHaveLength(1);cleanup();
  mode("administracion");render(<SupplierPayments/>);await user.click(screen.getByText("Registrar pago efectivo",{selector:"summary"}));await user.type(screen.getByLabelText("Comprobante / referencia"),"BANCO-1");await user.click(screen.getByRole("button",{name:"Registrar pago efectivo"}));expect(st().ledger.supplierPayments).toHaveLength(1);expect(st().ledger.supplierPayments[0].amount).toBe(200);
 });
 it("Gerencia no registra ausencias por la operación alternativa",()=>{
  useAppStore.setState({operators:[{id:"op",name:"Persona",role:"Operario",hourlyCost:100,active:true,createdAt:ctx.now}]});mode("gerencia");expect(st().saveSchedule("op",{add:[{date:day,works:false,note:"Ausencia"}]}).ok).toBe(false);expect(st().dayExceptions).toEqual([]);
 });
});

describe("Cortes, identidad de rubros y persistencia financiera",()=>{
 it("renombrar rubro conserva planificación y capacidad por ID",()=>{
  const l={...ledger(),rubroCatalog:[{id:"carpinteria_madera",name:"Nombre nuevo",active:true}],capacityBase:{carpinteria_madera:70}};
  const rows=capacityTimeline([],[],[],day,"week","carpinteria_madera",{operators:[],exceptions:[],hoursPerDay:8,roleToRubro:{},assignments:[{id:"a",operatorId:"op",projectId:"p",rubro:"carpinteria_madera",date:day,plannedHours:2,createdAt:ctx.now,createdBy:ctx.actor}],ledger:l});expect(rows[0]).toMatchObject({capacity:70,planned:2});
 });
 it("expira la base temporal y vuelve a Personal sin sumar ambas fuentes",()=>{
  const op:Operator={id:"op",name:"Persona",role:"Operario",active:true,productive:true,hourlyCost:100,createdAt:ctx.now,hoursPerDay:8,workDays:[0,1,2,3,4,5,6],enabledRubros:["carpinteria_madera"]};
  const l=saveCapacityPlan(ledger(),{rubro:"carpinteria_madera",from:day,to:day,workers:2,hoursPerWorker:35,note:"Un día de vigencia"},ctx);expect(weeklyCapacity([],[op],[],[],day,day,day,8,"carpinteria_madera",l).available).toBe(10);expect(weeklyCapacity([],[op],[],[],"2099-01-01","2099-01-01",day,8,"carpinteria_madera",l).available).toBe(8);
 });
 it("fallo de escritura financiera no confirma éxito ni deja solicitud parcial",()=>{
  mode("compras");const before=structuredClone(st().ledger);vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new Error("Cuota agotada de prueba");});
  const r=st().recordLedger(["compras"],(l,c)=>requestSupplierPayment(l,po,{amount:100,date:day,reason:"Pago de prueba"},c));expect(r.ok).toBe(false);expect(st().ledger).toEqual(before);
 });
 it("recarga aislada conserva solicitud, emisión, pago y corrección con sus mismos IDs",()=>{
  let l=requestSupplierPayment(ledger(),po,{amount:200,date:day,reason:"Proveedor"},ctx);l=manageBanking(l,l.paymentRequests![0].id,{instrument:"echeq",issuedOn:day,reference:"EC"},"Emisión verificada",ctx);l=settleRequest(l,po,l.paymentRequests![0].id,{date:day,amount:100,reference:"Banco"},ctx);l=correctSupplierPayment(l,po,l.supplierPayments[0].id,{date:day,amount:90,reference:"Banco"},"Corrección verificada",ctx);useAppStore.setState({ledger:l});
  const data=pickDemoData(st() as unknown as Record<string,unknown>);expect(writeDemo(data)).toBe(true);expect(readDemo()).toEqual(JSON.parse(JSON.stringify(data)));
 });
});

it("cerrado histórico sin validación no se etiqueta ganancia final; con cierre validado sí",()=>{
 const p=project({isClosed:true,status:"completed",closedAt:ctx.now});const l=ledger();expect(profitView(p,l,day)).toMatchObject({final:null,toDate:{partial:true}});l.closures=[{projectId:p.id,date:day,by:"Gerencia",pendingCosts:[]}];expect(profitView(p,l,day).toDate.partial).toBe(false);
});

it("Cotizador no exige tarifas fijas no usadas; bloquea horas productivas sin tarifa configurada",()=>{
 const state=initialCalcState(0);state.products=[newProductRow("Mesa")];state.products[0].rubros[0].materials=[];state.products[0].rubros[0].staffHours=[{rateId:"sales",name:"Comercial",category:"admin",hours:"1",hourlyCost:80}];
 const ctx={projects:[],rates:[],hoursPerDay:8,overtimeMultiplier:2,salesPrice:100,isDemo:false};const result=computeCalculator(state,"Local comercial",ctx);expect(reviewWarnings(result,100).some(w=>w.includes("Falta la tarifa"))).toBe(false);state.products[0].rubros[0].hours="1";const missing=computeCalculator(state,"Local comercial",ctx);expect(quoteActionBlocker(missing,100)).toMatch(/tarifa/);
});
it("Administración no elimina ni reescribe movimientos financieros sin historial",()=>{
 const l=registerCollection(ledger(),st().projects[0],{date:day,amount:100},ctx);useAppStore.setState({ledger:l});expect(st().recordLedger(["administracion"],l=>({...l,collections:[]})).ok).toBe(false);expect(st().recordLedger(["administracion"],l=>({...l,collections:l.collections.map(c=>({...c,amount:50}))})).ok).toBe(false);expect(st().ledger.collections[0].amount).toBe(100);
});

it("listado usa contrato revisado igual que ganancia/ficha, sin reescribir precio original",()=>{
 const p=st().projects[0];useAppStore.setState({ledger:{...st().ledger,contractRevisions:[{id:"rev",projectId:p.id,previous:1000,next:1500,reason:"Adicional acordado",by:ctx.actor,at:ctx.now}]}});
 render(<ProjectsTable economic views={[{project:p,econ:projectEconomics(p),health:null}]}/>);const cells=within(screen.getAllByRole("row")[1]).getAllByRole("cell");expect(cells.find(c=>c.getAttribute("data-label")==="Precio de venta")).toHaveTextContent(formatCurrency(1500));expect(cells.find(c=>c.getAttribute("data-label")?.startsWith("Resultado al"))).toHaveTextContent(formatCurrency(1500));expect(p.salesPrice).toBe(1000);
});

it("rutas alternativas no permiten a Operario crear externos ni a Gerencia encargarlos",()=>{
 const p=project({items:[{id:"i",name:"Mesa",quantity:1,completedUnits:0,rubros:[{rubro:"carpinteria_madera",hours:1,workers:1}]}]});useAppStore.setState({projects:[p]});for(const session of ["operario","gerencia"] as const){mode(session);expect(st().recordLedger([session],(l,c)=>registerExternal(l,[p],{projectId:p.id,rubro:"carpinteria_madera",date:day,kind:"workshop",description:"Trabajo de prueba",status:"commissioned"},c)).ok).toBe(false);}expect(st().ledger.externalWork).toBeUndefined();
});
