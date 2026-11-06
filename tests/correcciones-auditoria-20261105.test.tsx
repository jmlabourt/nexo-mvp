// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup} from "@testing-library/react";
import type {ActualEntry,Ledger,Operator,PurchaseOrder,WorkAssignment} from "@/types";
import {project} from "./helpers";
import {useAppStore} from "@/store/use-app-store";
import {EMPTY_LEDGER} from "@/lib/ledger";
import {correctInternalWork} from "@/lib/internal-work";
import {correctHours} from "@/lib/hours-review";
import {EMPTY_STOCK,availableInWarehouse} from "@/lib/stock";
import {SESSION_KEYS,type SessionKey} from "@/lib/permissions";
import {DEFAULT_HOUR_RATES,DEFAULT_SETTINGS} from "@/lib/constants";
import {DEFAULT_COST_SETTINGS} from "@/lib/supabase/workspace";
const day="2026-11-04",now="2026-11-05T15:00:00Z";
const st=()=>useAppStore.getState();const mode=(currentMode:SessionKey)=>useAppStore.setState({currentMode});
function ok<T>(r:{ok:true;value:T}|{ok:false;error:string}):T{if(!r.ok)throw Error(r.error);return r.value;}
const item={id:"i",name:"Mueble",quantity:1,completedUnits:0,rubros:[{rubro:"carpinteria_madera" as const,hours:20,workers:2}]};
const entry:ActualEntry={id:"original",projectId:"p",date:day,type:"labor",category:"labor",description:"Parte original",operatorId:"op",itemId:"i",rubro:"carpinteria_madera",assignmentId:"a",amount:56000,labor:{hours:4,hourlyCost:14000,role:"Oficial"},createdBy:"Persona A",createdAt:day+"T18:00:00Z"};
const op:Operator={id:"op",name:"Persona A",role:"Oficial",active:true,productive:true,hourlyCost:14000,enabledRubros:["carpinteria_madera"],workDays:[0,1,2,3,4,5,6],createdAt:now};
const assignment:WorkAssignment={id:"a",projectId:"p",itemId:"i",operatorId:"op",rubro:"carpinteria_madera",date:day,plannedHours:4,createdBy:"Planta",createdAt:now};
const order:PurchaseOrder={id:"oc",number:"OC-aislada",date:day,status:"sent",supplier:"Proveedor aislado",received:"no",paid:false,createdBy:"Compras",createdAt:now,localReceipts:[],lines:[{id:"ol",projectId:"",budgetLineId:"",destination:"warehouse",materialId:"m",materialName:"Adhesivo",unit:"litro",quantity:1,unitCost:1000,receivedQuantity:0}]};
function ledger():Ledger{return {...EMPTY_LEDGER,financialMonthlyRatePct:0,rubroCatalog:[{id:"carpinteria_madera",name:"Madera",active:true}],materialCatalog:[{id:"m",name:"Adhesivo",unit:"litro",referenceCost:1000,active:true,validFrom:day}],staffCategories:[{id:"craft",name:"Oficial",category:"labor",hourlyCost:14000}],personnel:[{employeeId:"op",view:"operario",views:["operario"],enabled:true,productive:true,categoryIds:["craft"],enabledRubros:["carpinteria_madera"],workDays:[0,1,2,3,4,5,6]}]};}
const snapshot=()=>structuredClone({projects:st().projects,ledger:st().ledger,stock:st().stock,assignments:st().assignments,orders:st().orders,settings:st().settings,costSettings:st().costSettings,hourRates:st().hourRates,priceHistory:st().priceHistory});
beforeEach(()=>{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date(now));localStorage.clear();useAppStore.setState({demoLocal:true,isDemo:true,organizationId:null,role:"owner",currentMode:"jefe_planta",userName:"Autor aislado",actingOperatorId:"op",operators:[op],projects:[project({items:[item],actualEntries:[entry],assignedOperatorIds:[op.id]}),project({id:"q",code:"P-2",items:[item]})],assignments:[assignment,{...assignment,id:"b",projectId:"q"}],orders:[],stock:EMPTY_STOCK,ledger:ledger(),priceHistory:[],requests:[],deliveries:[],dayExceptions:[],reviewedHoursKeys:[],resolvedAlertIds:[],settings:{...DEFAULT_SETTINGS},costSettings:{...DEFAULT_COST_SETTINGS},hourRates:structuredClone(DEFAULT_HOUR_RATES),syncStatus:"idle",syncError:null});});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
describe("H01: ninguna redistribución modifica un cerrado",()=>{
 it("rechaza origen cerrado en dominio y store sin mutar ninguna fuente",()=>{
  useAppStore.setState({projects:st().projects.map(p=>p.id==="p"?{...p,isClosed:true,status:"completed"}:p)});const before=snapshot(),input={entryId:"original",reason:"Reparto de jornada",allocations:[{assignmentId:"b",hours:4}]};
  expect(()=>correctHours(st().projects,st().assignments,input,{actor:"Planta",now,id:()=>"new"})).toThrow(/cerrad/);
  expect(st().correctHoursLocal(input).ok).toBe(false);expect(snapshot()).toEqual(before);
 });
 it("rechaza destino cerrado sin mutación",()=>{
  useAppStore.setState({projects:st().projects.map(p=>p.id==="q"?{...p,isClosed:true,status:"completed"}:p)});const before=snapshot();expect(st().correctHoursLocal({entryId:"original",reason:"Reparto de jornada",allocations:[{assignmentId:"b",hours:4}]}).ok).toBe(false);expect(snapshot()).toEqual(before);
 });
 it("en abiertos conserva ID original, autor, tarifa y costo neto al repartir",()=>{
  ok(st().correctHoursLocal({entryId:"original",reason:"Reparto real entre proyectos",allocations:[{assignmentId:"a",hours:1},{assignmentId:"b",hours:3}]}));const all=st().projects.flatMap(p=>p.actualEntries);
  expect(all.some(e=>e.id==="original")).toBe(true);expect(all.reduce((s,e)=>s+e.amount,0)).toBe(56000);expect(all.reduce((s,e)=>s+e.labor!.hours,0)).toBe(4);expect(all.every(e=>e.labor!.hourlyCost===14000&&e.createdBy===entry.createdBy&&e.createdAt===entry.createdAt)).toBe(true);
  expect(all.every(e=>e.corrections?.at(-1)?.previous.amount===56000)).toBe(true);
 });
});
describe("H02: autorización efectiva independiente del allowlist del llamador",()=>{
 it("Operario no corrige horas internas ajenas",()=>{
  mode("operario");useAppStore.setState({ledger:{...ledger(),internalHours:[{id:"foreign",employeeId:"otra",projectId:"p",date:day,hours:2,hourlyCost:100,task:"Registro ajeno",createdAt:now}]}});const before=snapshot();expect(st().recordLedger(["operario"],(l,c)=>correctInternalWork(l,st().projects,"foreign",{date:day,hours:1,reason:"Intento ajeno"},c)).ok).toBe(false);expect(snapshot()).toEqual(before);
 });
 it.each(SESSION_KEYS.filter(s=>s!=="gerencia"))("%s no modifica alertas ni parámetros/tarifas reservados",session=>{
  mode(session);const before=snapshot();expect(st().updateSettings({hoursDeviationHours:24}).ok).toBe(false);expect(st().updateCostSettings({hoursPerDay:7}).ok).toBe(false);expect(st().saveHourRates(st().hourRates.map(r=>({...r,hourlyRate:r.hourlyRate+1})),day).ok).toBe(false);expect(snapshot()).toEqual(before);
 });
 it("Gerencia conserva el cambio autorizado de parámetros",()=>{mode("gerencia");ok(st().updateSettings({hoursDeviationHours:3}));ok(st().updateCostSettings({hoursPerDay:7}));expect(st().settings.hoursDeviationHours).toBe(3);expect(st().costSettings.hoursPerDay).toBe(7);});
});
describe("H03: una sola precisión física en recepción y reversión",()=>{
 it("1 litro, tres ingresos de 0,004: OC y stock acumulan 0,012; reversión resta 0,004 en ambos",()=>{
  mode("compras");useAppStore.setState({orders:[structuredClone(order)]});for(let i=0;i<3;i++)ok(st().receiveOrder("oc",[{lineId:"ol",quantity:.004}]));
  expect(st().orders[0].lines[0].receivedQuantity).toBe(.012);expect(availableInWarehouse(st().stock,"m")).toBe(.012);expect(st().orders[0].received).toBe("partial");
  ok(st().reverseReceiptLocal("oc",st().orders[0].localReceipts!.at(-1)!.movementId,"Ingreso duplicado"));expect(st().orders[0].lines[0].receivedQuantity).toBe(.008);expect(availableInWarehouse(st().stock,"m")).toBe(.008);
 });
 it("rechaza granularidad más fina que stock antes de guardar",()=>{mode("compras");useAppStore.setState({orders:[structuredClone(order)]});const before=snapshot();expect(st().receiveOrder("oc",[{lineId:"ol",quantity:.0004}]).ok).toBe(false);expect(snapshot()).toEqual(before);});
 it("no admite sobre-recepción fraccionaria",()=>{mode("compras");useAppStore.setState({orders:[{...structuredClone(order),lines:order.lines.map(l=>({...l,quantity:.008}))}]});ok(st().receiveOrder("oc",[{lineId:"ol",quantity:.004}]));ok(st().receiveOrder("oc",[{lineId:"ol",quantity:.004}]));const before=snapshot();expect(st().receiveOrder("oc",[{lineId:"ol",quantity:.004}]).ok).toBe(false);expect(snapshot()).toEqual(before);});
});

// Navegación de componentes más smoke de navegador registrado por separado en el informe.
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn(),replace:vi.fn()}),usePathname:()=>"/planta/asignaciones",useSearchParams:()=>new URLSearchParams(),redirect:(path:string)=>{throw Error(`REDIRECT ${path}`);}}));
const {render,screen,fireEvent,within}=await import("@testing-library/react");
const {act}=await import("react");
const {AssignmentsPage}=await import("@/components/plant/assignments-page");
const {PlantOperatorsPage}=await import("@/components/plant/plant-pages");
const {AssignmentDialog}=await import("@/components/plant/assignment-dialog");
const {ProjectsTable}=await import("@/components/projects/projects-table");
const {EconomicSummary}=await import("@/components/projects/economic-summary");
const {GerenciaDashboard}=await import("@/components/gerencia/gerencia-dashboard");
const {GlobalSearch}=await import("@/components/layout/global-search");
const {PurchasingProjectsPage}=await import("@/components/purchasing/purchasing-projects");
const {projectEconomics,actualCostToDate}=await import("@/lib/calculations");
const {economicView,profitView,collectionsReport}=await import("@/lib/tablero");
const {buildSeed}=await import("@/lib/seed-data");
const {demoScenario}=await import("@/lib/demo/escenario");
const {buildSearchIndex,searchAll}=await import("@/lib/search");
const {canAccess,PROJECT_TABS,navFor}=await import("@/lib/permissions");
const {prioritizeDashboardNotices}=await import("@/lib/dashboard");
const {DASHBOARD_INDICATORS}=await import("@/lib/dashboard-indicators");
const {formatCurrency,formatPercent,formatQty}=await import("@/lib/formatting");
const {receiptDiscrepancies}=await import("@/lib/purchasing");
const {registerInternalHours}=await import("@/lib/ledger");
const {generalAllocations}=await import("@/lib/frontend-work");

describe("H01/H02: alcance, trazabilidad y reintentos",()=>{
 it("redistribución conserva antes/después y destinos; reintento no duplica costo ni horas",()=>{
  const input={requestId:"reparto-1",entryId:"original",reason:"Una jornada repartida",allocations:[{assignmentId:"a",hours:1},{assignmentId:"b",hours:3}]};ok(st().correctHoursLocal(input));const after=snapshot();ok(st().correctHoursLocal(input));expect(snapshot()).toEqual(after);
  const h=st().projects[1].actualEntries[0].corrections!.at(-1)!;expect(h.sourceEntryId).toBe("original");expect(h.hourlyCost).toBe(14000);expect(h.allocations?.map(a=>[a.projectId,a.hours,a.amount])).toEqual([["p",1,14000],["q",3,42000]]);expect(h.previous.date).toBe(day);expect(h.next.projectId).toBe("q");expect(h.by).toBeTruthy();expect(h.at).toBe(now.replace("Z",".000Z"));
 });
 it("una función alternativa que muta por referencia se rechaza sin tocar memoria ni almacenamiento",()=>{
  mode("operario");const before=snapshot(),stored=localStorage.getItem("blerp-demo:datos");expect(st().recordLedger(["operario"],l=>{l.financialMonthlyRatePct=99;l.internalHours.push({id:"intruso",employeeId:"otra",date:day,hours:1,task:"Ajena",createdAt:now});return l;}).ok).toBe(false);expect(snapshot()).toEqual(before);expect(localStorage.getItem("blerp-demo:datos")).toBe(stored);
 });
 it.each(SESSION_KEYS.filter(s=>s!=="gerencia"))("%s carga y corrige exclusivamente horas propias conservando tarifa",session=>{
  mode(session);useAppStore.setState({ledger:{...ledger(),personnel:[{...ledger().personnel![0],view:session}],staffCategories:[{id:"craft",name:"Trabajo interno",category:"admin",hourlyCost:14000}]}});
  ok(st().recordLedger([session],(l,c)=>registerInternalHours(l,{employeeId:"op",projectId:"p",date:day,hours:2,task:"Control real",hourlyCost:14000},c)));
  const id=st().ledger.internalHours.at(-1)!.id;ok(st().recordLedger([session],(l,c)=>correctInternalWork(l,st().projects,id,{date:day,hours:1,reason:"Una hora efectiva"},c)));expect(st().ledger.internalHours.at(-1)).toMatchObject({id,hours:1,hourlyCost:14000});expect(st().ledger.internalHours.at(-1)!.corrections).toHaveLength(1);
  const before=snapshot();expect(st().recordLedger([session],l=>({...l,internalHours:l.internalHours.map(h=>({...h,hourlyCost:1}))})).ok).toBe(false);expect(snapshot()).toEqual(before);
 });
 it("Gerencia no registra horas propias aunque el llamador la incluya",()=>{mode("gerencia");const before=snapshot();expect(st().recordLedger(["gerencia"],(l,c)=>registerInternalHours(l,{employeeId:"op",date:day,hours:1,task:"General",hourlyCost:14000},c)).ok).toBe(false);expect(snapshot()).toEqual(before);});
 it("horas generales propias distribuyen una sola vez y conservan evidencia al corregir",()=>{
  mode("operario");const ps=st().projects.map(p=>({...p,activity:[{id:p.id,actor:"A",at:"2026-10-01T12:00:00Z",kind:"status" as const,message:"Aprobado"}]}));useAppStore.setState({projects:ps});
  ok(st().recordLedger(["operario"],(l,c)=>{const next=registerInternalHours(l,{employeeId:"op",date:day,hours:2,task:"Trabajo general",hourlyCost:14000},c);return {...next,internalHours:next.internalHours.map(h=>({...h,allocations:generalAllocations(ps,day,28000)}))};}));
  const row=st().ledger.internalHours[0];expect(row.allocations!.reduce((s,a)=>s+a.amount,0)).toBe(28000);
  ok(st().recordLedger(["operario"],(l,c)=>correctInternalWork(l,ps,row.id,{date:day,hours:1,reason:"Hora neta real"},c)));const corrected=st().ledger.internalHours[0];expect(corrected.allocations!.reduce((s,a)=>s+a.amount,0)).toBe(14000);expect(corrected.corrections![0].next.allocations).toEqual(corrected.allocations);
 });
});
describe("H03: evidencia histórica, cantidades y costo",()=>{
 it("diagnostica diferencias previas sin corregir registros ni borrar recepciones",()=>{mode("compras");useAppStore.setState({orders:[structuredClone(order)]});ok(st().receiveOrder("oc",[{lineId:"ol",quantity:.004}]));useAppStore.setState({orders:st().orders.map(o=>({...o,lines:o.lines.map(l=>({...l,receivedQuantity:0}))}))});const before=snapshot();expect(receiptDiscrepancies(st().orders,st().stock)).toHaveLength(1);expect(snapshot()).toEqual(before);expect(actualCostToDate(st().projects[1])).toBe(0);expect(formatQty(.004,"litro")).toMatch(/0,004/);});
 it("recepciones y reversiones sin discrepancias no agregan costos productivos",()=>{mode("compras");useAppStore.setState({orders:[structuredClone(order)]});const costs=st().projects.map(actualCostToDate);ok(st().receiveOrder("oc",[{lineId:"ol",quantity:.004}]));expect(receiptDiscrepancies(st().orders,st().stock)).toEqual([]);ok(st().reverseReceiptLocal("oc",st().orders[0].localReceipts![0].movementId,"Reversión trazable"));expect(receiptDiscrepancies(st().orders,st().stock)).toEqual([]);expect(st().projects.map(actualCostToDate)).toEqual(costs);});
});
describe("H04: rutas y controles separados, sin otra planificación",()=>{
 it("ruta Planificación monta calendario y capacidad; Operarios abre disponibilidad",async()=>{
  const Page=(await import("@/app/(gestion)/planta/asignaciones/page")).default;render(<Page/>);expect(screen.getByRole("heading",{name:"Planificación"})).toBeInTheDocument();expect(screen.getByText("Configurar capacidad y refuerzos")).toBeInTheDocument();expect(screen.getByRole("button",{name:"Nueva asignación"})).toBeInTheDocument();cleanup();render(<PlantOperatorsPage/>);expect(screen.getByRole("heading",{name:"Operarios"})).toBeInTheDocument();expect(screen.getByRole("tab",{name:"Disponibilidad"})).toHaveAttribute("aria-selected","true");expect(screen.queryByRole("button",{name:"Nueva asignación"})).not.toBeInTheDocument();expect(navFor("jefe_planta").find(n=>n.label==="Planificación")?.href).toBe("/planta/asignaciones");
 });
 it("enlace histórico de asignaciones conserva destino canónico",async()=>{const Page=(await import("@/app/(gestion)/planta/operarios/page")).default;await expect(Page({searchParams:Promise.resolve({tab:"asignaciones"}),params:Promise.resolve({})})).rejects.toThrow("REDIRECT /planta/asignaciones");});
 it("Planta guarda capacidad desde controles recuperados; otras sesiones no amplían privilegios",()=>{
  render(<AssignmentsPage/>);fireEvent.click(screen.getByText("Configurar capacidad y refuerzos"));fireEvent.change(screen.getByLabelText("Rubro de capacidad"),{target:{value:"carpinteria_madera"}});fireEvent.change(screen.getByLabelText("Número de operarios"),{target:{value:"2"}});fireEvent.change(screen.getByLabelText("Horas semanales por operario"),{target:{value:"40"}});fireEvent.change(screen.getByLabelText("Motivo de capacidad"),{target:{value:"Capacidad aprobada para prueba"}});fireEvent.click(screen.getByRole("button",{name:"Guardar capacidad base"}));expect(st().ledger.capacityPlans?.at(-1)).toMatchObject({workers:2,hoursPerWorker:40});
  for(const session of SESSION_KEYS.filter(s=>s!=="jefe_planta")){act(()=>mode(session));const before=snapshot();expect(st().recordLedger([session],l=>({...l,capacityBase:{carpinteria_madera:99}})).ok).toBe(false);expect(snapshot()).toEqual(before);}
 });
});
describe("H05: lote multioperario atómico e idempotente",()=>{
 const input=()=>({projectId:"q",operatorId:"op",rubro:"carpinteria_madera" as const,date:day,plannedHours:1});
 it("Madera + persona solo Metal: primer intento y reintento guardan cero",()=>{
  useAppStore.setState({operators:[op,{...op,id:"carpinteria_metalica",name:"Metal",enabledRubros:["carpinteria_metalica"]}],ledger:{...ledger(),rubroCatalog:[...ledger().rubroCatalog,{id:"carpinteria_metalica",name:"Metal",active:true}]}});const inputs=[input(),{...input(),operatorId:"carpinteria_metalica"}];const before=snapshot();expect(st().saveAssignmentsBatch("lote",inputs).ok).toBe(false);expect(snapshot()).toEqual(before);expect(st().saveAssignmentsBatch("lote",inputs).ok).toBe(false);expect(snapshot()).toEqual(before);
 });
 it("lote válido sin mueble crea una vez; reintento no duplica ni genera costo/horas reales",()=>{
  const inputs=[input(),{...input(),date:"2026-11-05"}];const costs=st().projects.map(actualCostToDate),beforeEntries=st().projects.flatMap(p=>p.actualEntries);const ids=ok(st().saveAssignmentsBatch("lote-valido",inputs));expect(ids).toHaveLength(2);const before=snapshot();expect(ok(st().saveAssignmentsBatch("lote-valido",inputs))).toEqual(ids);expect(snapshot()).toEqual(before);expect(st().assignments.filter(a=>a.batchId==="lote-valido")).toHaveLength(2);expect(st().projects.map(actualCostToDate)).toEqual(costs);expect(st().projects.flatMap(p=>p.actualEntries)).toEqual(beforeEntries);
  expect(st().saveAssignmentsBatch("lote-valido",[{...input(),plannedHours:5}]).ok).toBe(false);expect(snapshot()).toEqual(before);
 });
 it("fecha, persona, rubro, proyecto o horas inválidos rechazan todo el lote",()=>{for(const invalid of [{date:""},{operatorId:"missing"},{rubro:"carpinteria_metalica" as const},{projectId:"missing"},{plannedHours:NaN},{plannedHours:25}]){const before=snapshot();expect(st().saveAssignmentsBatch("invalid",[input(),{...input(),...invalid}]).ok).toBe(false);expect(snapshot()).toEqual(before);}});
 it("formulario explica incompatibilidad y no permite elegir a persona de otro rubro",()=>{useAppStore.setState({operators:[op,{...op,id:"carpinteria_metalica",name:"Especialista Metal",enabledRubros:["carpinteria_metalica"]}]});render(<AssignmentDialog draft={{projectId:"p",date:day}} onClose={vi.fn()}/>);expect(screen.getByRole("checkbox",{name:/Especialista Metal/})).toBeDisabled();expect(screen.getByText(/No habilitado para este rubro/)).toBeInTheDocument();});
});
describe("H06/H07: mismo alcance económico y certeza entre lista y ficha",()=>{
 function existing(){const seed=buildSeed(new Date(now));const demo=demoScenario({...seed,today:now.slice(0,10)});useAppStore.setState({...seed,...demo});return demo.projects.find(p=>p.code==="P-1042")!;}
 it("P-1042: 8.250.000 productivo → 8.800.000 económico; lista y ficha usan exactamente ese alcance",()=>{
  const p=existing(),base=projectEconomics(p),shared=economicView(p,st().ledger,"2026-11-05",base);expect(base.projectedFinalCost).toBe(8250000);expect(shared.econ.projectedFinalCost).toBe(8800000);expect(shared.econ.projectedMargin).toBeCloseTo(26.6666667);
  render(<ProjectsTable views={[{project:p,econ:base} as never]} economic/>);expect(screen.getByText(formatCurrency(shared.econ.projectedFinalCost))).toBeInTheDocument();cleanup();render(<EconomicSummary project={p} econ={base}/>);expect(screen.getByText(formatPercent(shared.econ.projectedMargin))).toBeInTheDocument();expect(shared.result.toDate.profit).toBe(p.salesPrice-shared.result.toDate.cost);
 });
 it.each([true,false])("cerrado con pendientes=%s mantiene la misma etiqueta parcial/final en ambas pantallas",pending=>{
  const p=project({isClosed:true,status:"completed",closedAt:day,actualEntries:[entry]});useAppStore.setState({projects:[p],ledger:{...ledger(),closures:[{projectId:"p",date:day,by:"Gerencia",pendingCosts:pending?["Costo proveedor pendiente"]:[]}]}});const base=projectEconomics(p);expect(profitView(p,st().ledger,"2026-11-05").toDate.partial).toBe(pending);render(<ProjectsTable views={[{project:p,econ:base} as never]} economic/>);if(pending){expect(screen.queryByText("real final")).not.toBeInTheDocument();expect(screen.getAllByText("Parcial al 2026-11-05")).toHaveLength(2);}else expect(screen.getByText("real final")).toBeInTheDocument();cleanup();render(<EconomicSummary project={p} econ={base}/>);expect(screen.getByText(pending?/Ganancia parcial al/:/^Ganancia final:/)).toBeInTheDocument();
 });
});
describe("H08/H09: búsqueda autorizada y texto financiero de Compras",()=>{
 it.each(SESSION_KEYS)("buscador %s solo devuelve rutas y pestañas permitidas",session=>{const ps=[project({name:"Juan proyecto",purchaseEntries:[{id:"pur",projectId:"p",date:day,materialId:"m",materialName:"Juan material",quantity:1,unit:"litro",unitCost:5,total:5,createdBy:"Compras",createdAt:now}]})];const index=buildSearchIndex({projects:ps,stock:EMPTY_STOCK,operators:[{...op,name:"Juan Persona"}],session});for(const row of index){const [path,query]=row.href.split("?");expect(canAccess(session,path)).toBe(true);const tab=new URLSearchParams(query).get("tab");if(tab)expect(PROJECT_TABS[session]).toContain(tab);}if(session==="administracion"){expect(searchAll(index,"Juan").map(r=>r.kind)).toContain("project");expect(index.some(r=>r.kind==="operator"||r.kind==="purchase")).toBe(false);}if(session==="gerencia")expect(index.some(r=>r.kind==="operator")).toBe(true);});
 it("Administración busca Juan en el componente sin ofrecer Personal; Gerencia sí lo encuentra",()=>{mode("administracion");useAppStore.setState({operators:[{...op,name:"Juan Persona"}],projects:[project({name:"Juan proyecto"})]});render(<GlobalSearch/>);fireEvent.change(screen.getByRole("combobox"),{target:{value:"Juan"}});expect(screen.getByRole("option")).toHaveTextContent("Juan proyecto");expect(screen.queryByText("Juan Persona")).not.toBeInTheDocument();act(()=>mode("gerencia"));expect(screen.getByText("Juan Persona")).toBeInTheDocument();});
 it("Por comprar explica recepción y solicitud; no invita a facturar ni marcar pagada",()=>{mode("compras");const seed=buildSeed(new Date(now)),demo=demoScenario({...seed,today:"2026-11-05"});useAppStore.setState({...seed,...demo});render(<PurchasingProjectsPage/>);fireEvent.click(screen.getAllByRole("checkbox")[0]);fireEvent.click(screen.getByRole("button",{name:/Generar orden de compra/}));expect(screen.getByText(/Compras solicita el pago; Administración registra/)).toBeInTheDocument();expect(document.body.textContent).not.toMatch(/registrar la factura, marcar pagada/);});
});
describe("H10: alertas completas priorizadas antes del límite y diccionario fiel",()=>{
 it("una capacidad crítica concatenada sexta desplaza una advertencia; orden es estable",()=>{const warnings=Array.from({length:5},(_,i)=>({key:`warning-${i}`,level:"warning" as const,impactAmount:1000}));const capacity={key:"cap-madera",level:"critical" as const};expect(prioritizeDashboardNotices([...warnings,capacity])).toEqual([capacity,...warnings.slice(0,4)]);expect(prioritizeDashboardNotices([...warnings].reverse())).toEqual(warnings);expect(DASHBOARD_INDICATORS.find(i=>i.id==="dashboard_alerts")!.formula).toMatch(/conjunto completo.*clave estable.*luego muestra los primeros cinco/);});
 it("mismo nivel ordena por impacto monetario y no convierte horas en pesos",()=>{expect(prioritizeDashboardNotices([{key:"b",level:"critical",impactAmount:1},{key:"c",level:"critical",impactAmount:100},{key:"a",level:"critical"}]).map(a=>a.key)).toEqual(["c","b","a"]);});
});
describe("H11: cobros por fecha efectiva separados de aprobación",()=>{
 function cohort(){const p=project({activity:[{id:"approve",kind:"status",actor:"Administración",message:"Aprobado",at:"2026-11-01T12:00:00Z"}]});const l={...ledger(),collections:[{id:"cobro",projectId:"p",date:"2026-10-30",amount:80,kind:"advance" as const,createdBy:"Administración",createdAt:now}]};useAppStore.setState({projects:[p],ledger:l});return {p,l};}
 it("30/10 cobro80; aprobación01/11; corte31/10: KPI80 y fila80 sin inventar ganancia/aprobación",()=>{const {p,l}=cohort(),before=snapshot(),r=collectionsReport([p],l,"2026-10-01","2026-10-31");expect(r.total).toBe(80);expect(r.rows.map(row=>row.collected)).toEqual([80]);expect(r.rows[0].view).toBeNull();expect(snapshot()).toEqual(before);});
 it("pantalla con filtro octubre concilia tarjeta y desglose; fecha real se conserva",()=>{cohort();render(<GerenciaDashboard/>);fireEvent.click(screen.getByRole("button",{name:"Mes anterior"}));const kpi=document.querySelector('[data-indicator="collected"]')!,section=document.getElementById("cobros-proyecto")!;expect(kpi).toHaveTextContent(formatCurrency(80));expect(within(section).getByText(/Sin aprobación registrada al corte/)).toBeInTheDocument();const rows=within(section).getAllByRole("row");expect(rows).toHaveLength(3);expect(within(rows[1]).getAllByRole("cell")[2]).toHaveTextContent(formatCurrency(80));expect(within(rows[2]).getAllByRole("cell")[2]).toHaveTextContent(formatCurrency(80));expect(st().ledger.collections[0].date).toBe("2026-10-30");});
 it("desde/hasta filtran cobros sin borrar filas aprobadas; vacío concilia cero",()=>{const {p,l}=cohort();expect(collectionsReport([p],l,"2026-10-31","2026-10-31").total).toBe(0);const r=collectionsReport([p],l,"2026-11-01","2026-11-05");expect(r.rows).toHaveLength(1);expect(r.rows[0].collected).toBe(0);expect(r.rows[0].view).not.toBeNull();expect(collectionsReport([],EMPTY_LEDGER,"2026-10-01","2026-10-31")).toMatchObject({rows:[],collections:[],total:0});});
});

describe("Regresiones de integridad y prioridad en pantalla",()=>{
 it("H05: un fallo de almacenamiento rechaza el lote entero; reintento conserva dos IDs únicos",()=>{
  const inputs=[{projectId:"q",operatorId:"op",rubro:"carpinteria_madera" as const,date:day,plannedHours:1},{projectId:"q",operatorId:"op",rubro:"carpinteria_madera" as const,date:"2026-11-05",plannedHours:2}],before=snapshot();const save=vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw Error("Storage lleno");});expect(st().saveAssignmentsBatch("persistencia",inputs).ok).toBe(false);expect(snapshot()).toEqual(before);save.mockRestore();const ids=ok(st().saveAssignmentsBatch("persistencia",inputs));expect(ok(st().saveAssignmentsBatch("persistencia",inputs))).toEqual(ids);expect(new Set(st().assignments.map(a=>a.id)).size).toBe(st().assignments.length);
 });
 it("H07: un cerrado sin contrato positivo no acredita un resultado final",()=>{const p=project({salesPrice:0,isClosed:true,status:"completed",closedAt:day});const l={...ledger(),closures:[{projectId:"p",date:day,by:"G",pendingCosts:[]}]};expect(profitView(p,l,day)).toMatchObject({final:null,toDate:{partial:true}});});
 it("H10: el Dashboard incluye capacidad crítica aun con cinco avisos anteriores",async()=>{
  const selectors=await import("@/store/selectors");const alerts=Array.from({length:5},(_,i)=>({id:`due-${i}`,kind:"due" as const,level:"warning" as const,projectId:"p",projectCode:"P-1",projectName:"Test",title:`Aviso ${i}`,message:"Revisar plazo",resolutionKey:`due-${i}`}));vi.spyOn(selectors,"useAlerts").mockReturnValue({open:alerts,resolved:[],all:alerts} as never);
  useAppStore.setState({projects:[project({items:[item],dueDate:"2026-11-20"})],assignments:[],ledger:{...ledger(),capacityBase:{carpinteria_madera:0}}});render(<GerenciaDashboard/>);const pending=screen.getByRole("region",{name:"Pendientes"});expect(within(pending).getAllByRole("listitem")).toHaveLength(5);expect(within(pending).getByText(/lo confirmado no entra/)).toBeInTheDocument();expect(within(pending).queryByText(/Aviso 4/)).not.toBeInTheDocument();
 });
});

 it("H02: un callback rechazado tampoco puede alterar Personal, proyectos ni parámetros por referencia del contexto",()=>{
  mode("operario");const before=snapshot(),people=structuredClone(st().operators);
  expect(st().recordLedger(["operario"],(l,_ctx,state)=>{state.operators[0].hourlyCost=1;state.costSettings.hoursPerDay=1;state.projects[0].salesPrice=1;l.financialMonthlyRatePct=99;return l;}).ok).toBe(false);
  expect(snapshot()).toEqual(before);expect(st().operators).toEqual(people);
 });
