// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe,it,expect,beforeEach,afterEach,vi } from "vitest";
import { render,screen,within,cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Ledger,Operator,FrontendPersonnel,PurchaseOrder } from "@/types";
import { useAppStore } from "@/store/use-app-store";
import { EMPTY_LEDGER,startBomDraft,saveBomDraft,publishBom,upsertClient,upsertSupplier } from "@/lib/ledger";
import { employeeCost, demoOperatorEligible } from "@/lib/personnel";
import { weeklyCapacity,configuredOperators } from "@/lib/frontend-work";
import { capacityTimeline,profitView } from "@/lib/tablero";
import { addDays,assignmentError } from "@/lib/plant";
import { fullWeek,dayCapacity } from "@/lib/schedule";
import { todayISO } from "@/lib/formatting";
import { EMPTY_STOCK,receiveStock,applyChange,stockRows,stockValuation } from "@/lib/stock";
import { withPublishedBom } from "@/lib/bom-needs";
import { materialNeeds } from "@/lib/purchasing";
import { validateBomPublication } from "@/lib/bom-commitments";
import { frozenQuoteGroups } from "@/lib/quotation-presentation";
import { captureBaseline,createProject } from "@/lib/project-operations";
import { computeCalculator,initialCalcState,newProductRow,newMaterialRow,productInputs } from "@/components/budget/calculator-state";
import { DEFAULT_HOUR_RATES } from "@/lib/constants";
import { OperatorsPage } from "@/components/operators/operators-page";
import { StaffCategoriesSettings,BaseCapacitySettings } from "@/components/settings/frontend-production";
import { CloseDialog } from "@/components/projects/close-dialog";
import { MaterialsTab } from "@/components/materials/materials-tab";
import { StockPage } from "@/components/stock/stock-page";
import { FurniturePanel } from "@/components/projects/furniture-panel";
import { BomVersions } from "@/components/projects/bom-versions";
import { MaterialCatalogSettings } from "@/components/settings/material-catalog";
import { MaterialCatalogList } from "@/components/budget/material-rows";
import { LedgerDirectory } from "@/components/directory/ledger-directory";
import { createDemoScenario,parseDemoScenario,restoreDemoScenario,pickDemoData } from "@/store/demo-local";
import { line,project } from "./helpers";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn(),replace:vi.fn(),back:vi.fn()}),usePathname:()=>"/",useSearchParams:()=>new URLSearchParams()}));
const day=todayISO(),ctx={actor:"Prueba aislada",role:"owner" as const,now:`${day}T12:00:00Z`,today:day};
const item={id:"i",name:"Mesa",quantity:2,completedUnits:0,rubros:[{rubro:"carpinteria_madera" as const,hours:8,workers:1}]};
const p=()=>project({items:[item],startDate:day,dueDate:addDays(day,15),budgetLines:[line("materials",10,20,{id:"bl",materialId:"m",description:"Material",unit:"u",notes:"Mueble: Mesa × 2"})]});
const op:Operator={id:"op",name:"Persona",role:"Carpintería",hourlyCost:123,active:true,createdAt:ctx.now};
const ledger=():Ledger=>({...EMPTY_LEDGER,rubroCatalog:[{id:"carpinteria_madera",name:"Carpintería madera",active:true},{id:"pintura",name:"Pintura",active:true}],staffCategories:[{id:"craft",name:"Operario",category:"labor",hourlyCost:100},{id:"office",name:"Administración",category:"admin",hourlyCost:200}],personnel:[]});
const profile=(productive=true):Omit<FrontendPersonnel,"employeeId">=>({enabled:true,view:"operario",views:["operario"],categoryIds:["craft"],productive,enabledRubros:productive ? ["carpinteria_madera"] : [],hoursPerDay:6,workDays:[0,1,2,3,4,5,6]});
const st=()=>useAppStore.getState();
function ok<T>(r:{ok:true;value:T}|{ok:false;error:string}):T{if(!r.ok)throw new Error(r.error);return r.value;}
beforeEach(()=>{localStorage.clear();useAppStore.setState({demoLocal:true,isDemo:true,role:"owner",organizationId:null,currentMode:"gerencia",actingOperatorId:null,projects:[p()],operators:[op],assignments:[],dayExceptions:[],deliveries:[],orders:[],stock:EMPTY_STOCK,requests:[],priceHistory:[],ledger:ledger(),syncStatus:"idle",syncError:null,resolvedAlertIds:[],reviewedHoursKeys:[]});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function needs(){return materialNeeds(st().projects.map((p)=>withPublishedBom(p,st().ledger)),st().orders,st().stock,day);}
function initialBom(){const pr=st().projects[0];let l=startBomDraft(st().ledger,pr,"i",ctx);l=publishBom(l,l.boms.at(-1)!.id,ctx);useAppStore.setState({ledger:l});}
function roundtrip(){const data=pickDemoData(st() as unknown as Record<string,unknown>);const file=parseDemoScenario(JSON.stringify(createDemoScenario(data,"aislado")))!;expect(restoreDemoScenario(file)).toBe(true);useAppStore.setState({demoLocal:false});st().enterLocalDemo();}

describe("Personal: una ficha y un registro por empleado",()=>{
 it("categoría nueva persistente, alta no operativa y edición completa en la misma ficha",async()=>{
  const user=userEvent.setup();render(<StaffCategoriesSettings/>);
  await user.type(screen.getByLabelText("Categoría"),"Comercial");await user.type(screen.getByLabelText("Costo por hora"),"250");await user.click(screen.getByRole("button",{name:"Agregar categoría"}));
  expect(screen.getByRole("button",{name:"Editar categoría Comercial"})).toBeInTheDocument();cleanup();render(<OperatorsPage/>);
  expect(screen.queryByText("Carpintería")).not.toBeInTheDocument();expect(screen.getAllByText("Sin categoría").length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button",{name:"Agregar empleado"}));const modal=screen.getByRole("dialog");expect(within(modal).getByText("Nuevo empleado")).toBeInTheDocument();
  await user.type(within(modal).getByLabelText("Nombre y apellido"),"Ana Comercial");
  const cat=st().ledger.staffCategories!.find((c)=>c.name==="Comercial")!;
  await user.selectOptions(within(modal).getByLabelText("Categorías laborales"),cat.id);await user.selectOptions(within(modal).getByLabelText("Vista de Blerp"),"administracion");
  await user.type(within(modal).getByLabelText("Email"),"ana@example.test");await user.type(within(modal).getByLabelText("Teléfono"),"1234");await user.click(within(modal).getByRole("button",{name:"Guardar configuración de la persona"}));
  const employee=st().operators.find((o)=>o.name==="Ana Comercial")!;expect(employee).toBeDefined();expect(st().ledger.personnel!.find((p)=>p.employeeId===employee.id)).toMatchObject({productive:false,phone:"1234",categoryIds:[cat.id]});
  const row=screen.getByText("Ana Comercial").closest("tr")!;await user.click(within(row).getByRole("button",{name:"Editar"}));
  const edit=screen.getByRole("dialog");await user.clear(within(edit).getByLabelText("Nombre y apellido"));await user.type(within(edit).getByLabelText("Nombre y apellido"),"Ana Editada");
  await user.selectOptions(within(edit).getByLabelText("Categorías laborales"),[cat.id,"craft"]);await user.selectOptions(within(edit).getByLabelText("Vista de Blerp"),"administracion");await user.selectOptions(within(edit).getByLabelText("Rubros habilitados"),["carpinteria_madera","pintura"]);
  await user.type(within(edit).getByLabelText("Nueva tarifa individual (opcional)"),"300");await user.click(within(edit).getByRole("button",{name:"Guardar configuración de la persona"}));
  expect(st().operators.find((o)=>o.id===employee.id)!.name).toBe("Ana Editada");expect(employeeCost(st().ledger,st().operators.find((o)=>o.id===employee.id)!,day,"craft").hourlyCost).toBe(300);
  roundtrip();expect(st().ledger.personnel!.find((p)=>p.employeeId===employee.id)).toMatchObject({views:["administracion"],enabledRubros:["carpinteria_madera","pintura"]});
 });
 it("heredado pendiente → configurar → Planta → horas reales → Gerencia, sin tocar historia",()=>{
  expect(weeklyCapacity([p()],[op],[],[],day,day,day,8,"carpinteria_madera",st().ledger).pendingConfiguration).toBe(true);
  ok(st().saveEmployeeLocal({id:op.id,name:op.name,active:true,profile:profile()}));const configured=configuredOperators(st().operators,st().ledger);expect(configured[0].enabledRubros).toEqual(["carpinteria_madera"]);
  expect(weeklyCapacity(st().projects,configured,[],[],day,day,day,8,"carpinteria_madera",st().ledger)).toMatchObject({available:6,pendingConfiguration:false});
  useAppStore.setState({currentMode:"jefe_planta"});const id=ok(st().saveAssignment({operatorId:op.id,projectId:"p",itemId:"i",rubro:"carpinteria_madera",date:day,plannedHours:2}));
  useAppStore.setState({currentMode:"operario",actingOperatorId:op.id});ok(st().logHours("p",{assignmentId:id,hours:1,categoryId:"craft"}));const old=structuredClone(st().projects[0].actualEntries);
  useAppStore.setState({currentMode:"gerencia"});ok(st().saveEmployeeLocal({id:op.id,name:op.name,active:true,profile:{...profile(),hoursPerDay:4},individualRate:{hourlyCost:150,validFrom:day}}));expect(st().projects[0].actualEntries).toEqual(old);expect(profitView(st().projects[0],st().ledger,day).toDate.cost).toBe(100);
  expect(st().operators).toHaveLength(1);
 });
 it("baja/reactivación conserva IDs y bloquea nuevas asignaciones; otras vistas no editan Personal",()=>{
  ok(st().saveEmployeeLocal({id:op.id,name:op.name,active:false,profile:profile()}));expect(assignmentError({operatorId:op.id,projectId:"p",rubro:"carpinteria_madera",date:day,plannedHours:1},{projects:st().projects,operators:configuredOperators(st().operators,st().ledger)})).toMatch(/baja/);
  ok(st().saveEmployeeLocal({id:op.id,name:op.name,active:true,profile:profile()}));useAppStore.setState({currentMode:"administracion"});expect(st().saveEmployeeLocal({id:op.id,name:"Otro",active:true,profile:profile()}).ok).toBe(false);expect(st().updateOperator(op.id,{name:"Otro",role:"Otra",hourlyCost:999}).ok).toBe(false);
 });
});

describe("Capacidad base con prioridad confirmada",()=>{
 it("100 manual +20 refuerzo =120, sin duplicar Personal; reducción, cambio de semana y varios rubros",()=>{
  const week=fullWeek(day);const l={...ledger(),personnel:[{...profile(),employeeId:op.id,enabledRubros:["carpinteria_madera" as const,"pintura" as const]}],capacityBase:{carpinteria_madera:100},capacityAdjustments:[{id:"a",rubro:"carpinteria_madera" as const,date:week[2],hours:20,note:"Confirmado",by:"G",at:ctx.now}]};
  const wood=weeklyCapacity([], [op],[],[],week[0],week[6],day,8,"carpinteria_madera",l);expect(wood.available).toBe(120);
  const other=weeklyCapacity([],[op],[],[],week[0],week[6],day,8,"pintura",l);expect(other.available).toBe(21);
  expect(weeklyCapacity([],[op],[],[],week[0],week[6],day,8,undefined,l).available).toBe(141);
  expect(dayCapacity(configuredOperators([op],l)[0],day,[],8).hours).toBe(6);
  expect(weeklyCapacity([],[op],[],[],addDays(week[0],7),addDays(week[6],7),day,8,"carpinteria_madera",l).available).toBe(100);
  expect(weeklyCapacity([],[op],[],[],week[0],week[6],day,8,"carpinteria_madera",{...l,capacityAdjustments:[{...l.capacityAdjustments[0],hours:-20}]}).available).toBe(80);
  const timeline=capacityTimeline([],[],[],week[0],"week","Carpintería madera",{operators:[op],exceptions:[],hoursPerDay:8,roleToRubro:{},assignments:[],ledger:l})[0];expect(timeline.capacity).toBe(wood.available);
 });
 it("guarda base desde la configuración y otras sesiones no pueden alterarla",async()=>{
  useAppStore.setState({currentMode:"jefe_planta"});const user=userEvent.setup();render(<BaseCapacitySettings/>);await user.selectOptions(screen.getByLabelText("Rubro de capacidad"),"carpinteria_madera");await user.type(screen.getByLabelText("Número de operarios"),"2");await user.type(screen.getByLabelText("Horas semanales por operario"),"50");await user.type(screen.getByLabelText("Motivo de capacidad"),"Capacidad confirmada");await user.click(screen.getByRole("button",{name:"Guardar capacidad base"}));expect(st().ledger.capacityPlans!.at(-1)).toMatchObject({rubro:"carpinteria_madera",workers:2,hoursPerWorker:50});
  roundtrip();expect(st().ledger.capacityPlans!.at(-1)).toMatchObject({workers:2,hoursPerWorker:50});useAppStore.setState({currentMode:"administracion"});expect(st().recordLedger(["administracion"],(l)=>({...l,capacityBase:{carpinteria_madera:999}})).ok).toBe(false);
 });
});

describe("Stock: mismas cantidades y permiso único",()=>{
 it("Compras asigna 4 de 10; tres vistas comparten físico/libre/asignado y cobertura sin doble descuento",()=>{
  initialBom();const received=receiveStock({materialId:"m",materialName:"Material",quantity:10,unit:"u",unitCost:20,date:day,destination:"warehouse"},ctx);useAppStore.setState({stock:applyChange(EMPTY_STOCK,received),currentMode:"compras"});
  expect(needs()[0]).toMatchObject({fromStock:10,fromDepot:0,toBuy:0});ok(st().assignStock({materialId:"m",materialName:"Material",unit:"u",projectId:"p",quantity:4}));
  expect(needs()[0]).toMatchObject({fromStock:6,fromDepot:4,toBuy:0});expect(stockRows(st().stock)[0]).toMatchObject({physical:10,available:6,assigned:4});expect(profitView(st().projects[0],st().ledger,day).toDate.cost).toBe(0);
  const movement=st().stock.movements.find((m)=>m.kind==="assign")!;
  for(const mode of ["gerencia","administracion","compras"] as const){useAppStore.setState({currentMode:mode});render(<StockPage/>);expect(screen.queryByRole("columnheader",{name:"Ubicación"})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Ver lotes"})).not.toBeInTheDocument();expect(screen.queryByRole("columnheader",{name:"Valor"})).not.toBeInTheDocument();expect(!!screen.queryByText("Valor total en stock")).toBe(mode==="gerencia");expect(!!screen.queryByRole("button",{name:"Asignar a proyecto"})).toBe(mode==="compras");if(mode!=="compras"){expect(st().assignStock({materialId:"m",materialName:"Material",unit:"u",projectId:"p",quantity:1}).ok).toBe(false);expect(st().reverseAssignmentLocal(movement.id,"Corregir").ok).toBe(false);}cleanup();}
  roundtrip();expect(stockRows(st().stock)[0]).toMatchObject({physical:10,available:6,assigned:4});useAppStore.setState({currentMode:"compras"});ok(st().reverseAssignmentLocal(movement.id,"Reserva incorrecta"));expect(stockRows(st().stock)[0]).toMatchObject({physical:10,available:10,assigned:0});
 });
 it("valorización informa cobertura incompleta si falta un costo de origen",()=>{
  const received=receiveStock({materialId:"m",materialName:"Material",quantity:2,unit:"u",unitCost:20,date:day,destination:"warehouse"},ctx);const stock=applyChange(EMPTY_STOCK,received);expect(stockValuation(stock)).toEqual({value:40,complete:true});expect(stockValuation({...stock,lots:stock.lots.map((l)=>({...l,unitCost:undefined as unknown as number}))})).toEqual({value:0,complete:false});
 });
});

function order():PurchaseOrder{return {id:"o",number:"OC",supplier:"Proveedor",date:day,status:"sent",paid:false,received:"no",createdBy:"C",createdAt:ctx.now,lines:[{id:"ol",projectId:"p",budgetLineId:"bl",materialId:"m",materialName:"Material",quantity:6,unit:"u",unitCost:20,receivedQuantity:0}]};}
function proposed(quantity:number){let l=startBomDraft(st().ledger,st().projects[0],"i",ctx);const b=l.boms.at(-1)!;l=saveBomDraft(l,b.id,b.lines.map((line)=>({...line,quantity})));return publishBom(l,b.id,ctx);}
describe("Cotización congelada y BOM con compromisos por material",()=>{
 it("compra 6 de 10: admite 6 y 12, bloquea 5 sin cambiar orden, recepción o versión vigente",()=>{
  initialBom();useAppStore.setState({orders:[order()],currentMode:"administracion"});const original=structuredClone(st().orders);
  expect(()=>validateBomPublication(st().projects,st().ledger,proposed(6),st().orders,st().stock,day)).not.toThrow();expect(()=>validateBomPublication(st().projects,st().ledger,proposed(5),st().orders,st().stock,day)).toThrow(/6 u/);
  expect(st().recordLedger(["administracion"],()=>proposed(5)).ok).toBe(false);expect(st().ledger.boms).toHaveLength(1);
  ok(st().recordLedger(["administracion"],()=>proposed(12)));expect(needs()[0].toBuy).toBe(6);expect(st().orders).toEqual(original);
 });
 it("orden borrador no compromete; Gerencia no edita BOM; movimientos físicos sí fijan piso",()=>{
  initialBom();useAppStore.setState({orders:[{...order(),status:"draft"}],currentMode:"administracion"});expect(()=>validateBomPublication(st().projects,st().ledger,proposed(5),st().orders,st().stock,day)).not.toThrow();
  const got=receiveStock({materialId:"m",materialName:"Material",quantity:6,unit:"u",unitCost:20,date:day,destination:{projectId:"p"}},ctx);useAppStore.setState({stock:applyChange(EMPTY_STOCK,got),orders:[]});
  expect(()=>validateBomPublication(st().projects,st().ledger,proposed(5),[],st().stock,day)).toThrow(/6 u/);useAppStore.setState({currentMode:"gerencia"});expect(st().recordLedger(["gerencia"],()=>proposed(12)).ok).toBe(false);
  render(<BomVersions project={st().projects[0]} item={item} canEdit/>);expect(screen.queryByRole("button",{name:"Nueva versión del BOM"})).not.toBeInTheDocument();
 });
 it("compra de A no impide editar B; renombre conserva cobertura; cambio real queda bloqueado si deja compromiso",()=>{
  initialBom();const before=st().ledger;const after=structuredClone(before);after.boms[0].lines.push({id:"extra",materialId:"b",material:"Otro",unit:"u",quantity:10});useAppStore.setState({ledger:after,orders:[order()]});
  let l=startBomDraft(after,st().projects[0],"i",ctx);const draft=l.boms.at(-1)!;l=saveBomDraft(l,draft.id,draft.lines.map((x)=>x.materialId==="b" ? {...x,quantity:1} : {...x,material:"Etiqueta nueva"}));l=publishBom(l,draft.id,ctx);expect(()=>validateBomPublication(st().projects,after,l,st().orders,st().stock,day)).not.toThrow();
  expect(materialNeeds([withPublishedBom(st().projects[0],l)],st().orders,st().stock,day).find((n)=>n.materialId==="m")).toMatchObject({ordered:6,toBuy:4});const changed=structuredClone(l);changed.boms.at(-1)!.lines[0].materialId="different";expect(()=>validateBomPublication(st().projects,after,changed,st().orders,st().stock,day)).toThrow(/comprometidos/);
 });
 it("recorrido completo: tres muebles, compra parcial, revisión, asignación, consumo y valoración",()=>{
  const calc=initialCalcState(0);calc.rubros=[];calc.products=["Mesa","Silla","Estante"].map((name,i)=>{const row=newProductRow(name);row.rubros[0].hours="2";row.rubros[0].materials=[{...newMaterialRow(),materialId:`mat${i}`,name:`Material ${i}`,unit:"u",quantity:"10",unitCost:"20",wastePct:"0"}];return row;});
  const result=computeCalculator(calc,"Local comercial",{projects:[],rates:DEFAULT_HOUR_RATES,hoursPerDay:8,overtimeMultiplier:1.5,salesPrice:1000000,isDemo:false});
  const quote=createProject({code:"TEST",name:"Circuito",client:"Cliente",projectType:"Local comercial",description:"",startDate:day,dueDate:addDays(day,20),owner:"G",salesPrice:1000000,budgetLines:result.lines,items:productInputs(calc)},ctx);
  useAppStore.setState({projects:[quote],currentMode:"administracion"});ok(st().changeProjectStatus(quote.id,"approved"));const baseline=structuredClone(st().projects[0].baseline);
  for(const item of st().projects[0].items) ok(st().recordLedger(["administracion"],(l,c)=>{const next=startBomDraft(l,st().projects[0],item.id,c);return publishBom(next,next.boms.at(-1)!.id,c);}));
  const need=needs().find((n)=>n.materialId==="mat0")!;useAppStore.setState({currentMode:"compras"});const orderId=ok(st().saveOrder({supplier:"Proveedor",date:day,lines:[{projectId:quote.id,budgetLineId:need.lineId,materialId:need.materialId,materialName:need.description,quantity:6,unit:"u",unitCost:20}]}));ok(st().sendOrder(orderId));const ol=st().orders[0].lines[0];ok(st().receiveOrder(orderId,[{lineId:ol.id,quantity:4}]));
  const first=st().projects[0].items[0];useAppStore.setState({currentMode:"administracion"});ok(st().recordLedger(["administracion"],(l,c)=>{let next=startBomDraft(l,st().projects[0],first.id,c);const draft=next.boms.at(-1)!;next=saveBomDraft(next,draft.id,draft.lines.map((l)=>({...l,quantity:6})));return publishBom(next,draft.id,c);}));expect(needs().find((n)=>n.materialId==="mat0")).toMatchObject({ordered:6,receivedFromOrders:4,toBuy:0});
  ok(st().recordLedger(["administracion"],(l,c)=>{let next=startBomDraft(l,st().projects[0],first.id,c);const draft=next.boms.at(-1)!;next=saveBomDraft(next,draft.id,draft.lines.map((l)=>({...l,quantity:12})));return publishBom(next,draft.id,c);}));expect(needs().find((n)=>n.materialId==="mat0")!.toBuy).toBe(6);
  useAppStore.setState({currentMode:"compras"});ok(st().receiveOrder(orderId,[{lineId:ol.id,quantity:2}]));const got=receiveStock({materialId:"mat0",materialName:"Material 0",quantity:10,unit:"u",unitCost:20,date:day,destination:"warehouse"},ctx);useAppStore.setState({stock:applyChange(st().stock,got)});ok(st().assignStock({materialId:"mat0",materialName:"Material 0",unit:"u",projectId:quote.id,quantity:4}));
  useAppStore.setState({currentMode:"jefe_planta"});ok(st().directMaterialUsage({projectId:quote.id,itemId:first.id,materialId:"mat0",source:"project",date:day,quantity:8,consumed:5,waste:1,leftover:2,units:[]}));expect(stockValuation(st().stock).value).toBe(200);expect(st().deliveries).toEqual([]);expect(st().projects[0].baseline).toEqual(baseline);
  useAppStore.setState({currentMode:"gerencia"});expect(profitView(st().projects[0],st().ledger,day).toDate.cost).toBe(120);const before=structuredClone(st().stock.movements);roundtrip();expect(st().stock.movements).toEqual(before);expect(st().projects[0].baseline).toEqual(baseline);
 });
 it("BOM sin catálogo permite renombre estable con orden y bloquea cambios sobre versión publicada",()=>{
  const pr=p();pr.budgetLines[0].materialId=undefined;useAppStore.setState({projects:[pr]});initialBom();const before=st().ledger;
  const oldNeed=needs()[0];const oc=order();oc.lines[0]={...oc.lines[0],budgetLineId:oldNeed.lineId,materialId:undefined,quantity:6};useAppStore.setState({orders:[oc],currentMode:"administracion"});
  ok(st().recordLedger(["administracion"],(l,c)=>{let next=startBomDraft(l,pr,"i",c);const draft=next.boms.at(-1)!;next=saveBomDraft(next,draft.id,draft.lines.map((line)=>({...line,material:"Descripción nueva"})));return publishBom(next,draft.id,c);}));expect(needs()[0]).toMatchObject({ordered:6,toBuy:4});
  expect(st().recordLedger(["administracion"],(l)=>({...l,boms:l.boms.map((b)=>b.id===before.boms[0].id ? {...b,lines:[]} : b)})).ok).toBe(false);
 });
 it("stock sin mueble respeta el piso del proyecto sin atribuirlo al primer mueble",()=>{
  const pr=p(),second={...item,id:"j",name:"Silla"};pr.items=[item,second];pr.budgetLines.push(line("materials",10,20,{id:"other",materialId:"m",description:"Material",unit:"u",notes:"Mueble: Silla × 2"}));let l=ledger();for(const item of pr.items){l=startBomDraft(l,pr,item.id,ctx);l=publishBom(l,l.boms.at(-1)!.id,ctx);}const got=receiveStock({materialId:"m",materialName:"Material",quantity:6,unit:"u",unitCost:20,date:day,destination:{projectId:pr.id}},ctx);const stock=applyChange(EMPTY_STOCK,got);
  let next=startBomDraft(l,pr,"i",ctx);const draft=next.boms.at(-1)!;next=saveBomDraft(next,draft.id,draft.lines.map((line)=>({...line,quantity:1})));next=publishBom(next,draft.id,ctx);expect(()=>validateBomPublication([pr],l,next,[],stock,day)).not.toThrow();
 });
 it("tres muebles desde Cotizador: aprobación congela estructura/importes iguales entre Gerencia y Administración",()=>{
  const calc=initialCalcState(0);calc.rubros=[];calc.products=["Mesa","Silla","Estante"].map((name,i)=>{const row=newProductRow(name);row.quantity=String(i+1);row.rubros[0].hours=String(2+i);row.rubros[0].materials=[{...newMaterialRow(),materialId:`mat${i}`,name:`Tablero ${i}`,unit:"u",quantity:String(2+i),unitCost:"20",wastePct:"0"}];return row;});
  const result=computeCalculator(calc,"Local comercial",{projects:[],rates:DEFAULT_HOUR_RATES,hoursPerDay:8,overtimeMultiplier:1.5,salesPrice:10000,isDemo:false});
  let pr=createProject({code:"P-test",name:"Tres muebles",client:"Cliente",projectType:"Local comercial",description:"",startDate:day,dueDate:addDays(day,30),owner:"G",salesPrice:10000,budgetLines:result.lines,items:productInputs(calc)},ctx);pr={...pr,status:"approved",baseline:captureBaseline(pr,ctx)};
  expect(frozenQuoteGroups(pr).filter((g)=>g.label.includes("×"))).toHaveLength(3);expect(frozenQuoteGroups(pr).flatMap((g)=>g.lines).reduce((s,l)=>s+l.total,0)).toBe(pr.baseline!.budgetTotal);
  useAppStore.setState({projects:[pr],currentMode:"gerencia"});render(<FurniturePanel project={pr} canEdit/>);const gerencia=screen.getByRole("region",{name:"Cotización original aprobada"}).textContent;cleanup();useAppStore.setState({currentMode:"administracion"});render(<FurniturePanel project={pr} canEdit/>);expect(screen.getByRole("region",{name:"Cotización original aprobada"}).textContent).toBe(gerencia);cleanup();
  for(const mode of ["gerencia","administracion"] as const){useAppStore.setState({currentMode:mode});expect(st().updateBudgetLine(pr.id,pr.budgetLines[0].id,{...pr.budgetLines[0],quantity:99}).ok).toBe(false);}
  const old=structuredClone(pr.baseline);useAppStore.setState({projects:[{...pr,items:pr.items.map((i)=>({...i,name:"Nombre posterior"}))}]});expect(frozenQuoteGroups(st().projects[0])).toEqual(frozenQuoteGroups(pr));expect(st().projects[0].baseline).toEqual(old);
 });
});

describe("Catálogo único y directorios",()=>{
 it("alta sin rubro, selección activa, precio actualiza solo cotización editable; conserva baseline y costos físicos",async()=>{
  useAppStore.setState({currentMode:"administracion"});const user=userEvent.setup();render(<><MaterialCatalogSettings/><MaterialCatalogList/></>);expect(screen.queryByLabelText("Rubro")).not.toBeInTheDocument();expect(screen.queryByLabelText("Vigente desde")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Nombre del material"),"Tablero libre");await user.type(screen.getByLabelText("Unidad"),"placa");await user.type(screen.getByLabelText("Precio de referencia"),"50");await user.click(screen.getByRole("button",{name:"Crear material"}));const material=st().ledger.materialCatalog![0];expect(material.rubro).toBeUndefined();expect(document.querySelector('option[value="Tablero libre"]')).toBeInTheDocument();cleanup();
  const quoted=project({status:"quotation",budgetLines:[line("materials",2,50,{materialId:material.id,unit:material.unit})]});const approved={...p(),id:"approved",baseline:captureBaseline(p(),ctx)};useAppStore.setState({projects:[quoted,approved]});const old=structuredClone(approved);
  ok(st().saveCatalogMaterialLocal({id:material.id,name:material.name,unit:material.unit,price:80,validFrom:day}));expect(st().projects[0].budgetLines[0]).toMatchObject({unitCost:80,total:160});expect(st().projects[1]).toEqual(old);roundtrip();expect(st().ledger.materialCatalog![0].id).toBe(material.id);
 });
 it.each(["clients","suppliers"] as const)("%s muestra solo datos fijos y permite editar/baja sin alterar referencias",async(kind)=>{
  let l=ledger();l=upsertClient(l,{name:"Cliente",active:true,contact:"Laura",phone:"123",email:"c@example.test",address:"Calle"},ctx);l=upsertSupplier(l,{name:"Proveedor",active:true,contact:"Juan",phone:"456",email:"p@example.test",address:"Ruta",website:"https://example.test/catalogo"},ctx);useAppStore.setState({ledger:l,currentMode:kind==="clients" ? "administracion" : "compras",orders:[order()]});const previous=structuredClone(st().orders),projects=structuredClone(st().projects);
  const user=userEvent.setup();render(<LedgerDirectory kind={kind}/>);if(kind==="suppliers") expect(screen.getByRole("link",{name:"Ver catálogo"})).toHaveAttribute("href","https://example.test/catalogo");expect(screen.queryByRole("columnheader",{name:kind==="clients" ? "Proyectos" : "Órdenes"})).not.toBeInTheDocument();await user.click(screen.getByRole("button",{name:kind==="clients" ? "Cliente" : "Proveedor"}));expect(screen.getByLabelText("Teléfono")).toHaveValue(kind==="clients" ? "123" : "456");if(kind==="suppliers")expect(screen.getByLabelText("Enlace al catálogo")).toHaveValue("https://example.test/catalogo");await user.click(screen.getByLabelText("Activo"));await user.click(screen.getByRole("button",{name:"Guardar"}));expect(st().orders).toEqual(previous);expect(st().projects).toEqual(projects);expect((kind==="clients" ? st().ledger.clients : st().ledger.suppliers)[0].active).toBe(false);
 });
});

// Renaming a directory entry preserves the previous stored name as evidence, without rewriting emitted orders.
it("renombrar directorios conserva referencias nominales anteriores con el mismo ID",()=>{
 let l=upsertClient(ledger(),{name:"Cliente original",active:true},ctx);l=upsertSupplier(l,{name:"Proveedor original",active:true},ctx);const client=l.clients[0],supplier=l.suppliers[0];
 l=upsertClient(l,{...client,name:"Cliente nuevo"},ctx);l=upsertSupplier(l,{...supplier,name:"Proveedor nuevo"},ctx);
 expect(l.clients[0]).toMatchObject({id:client.id,previousNames:["Cliente original"]});expect(l.suppliers[0]).toMatchObject({id:supplier.id,previousNames:["Proveedor original"]});
 expect(()=>upsertSupplier(l,{name:"Proveedor original",active:true},ctx)).toThrow(/ese nombre/);
});

it("Stock conserva unidades separadas para un mismo material y la asignación no mezcla cantidades",()=>{
 const one=receiveStock({materialId:"m",materialName:"Material",quantity:2,unit:"placa",unitCost:20,date:day,destination:"warehouse"},ctx);let stock=applyChange(EMPTY_STOCK,one);stock=applyChange(stock,receiveStock({materialId:"m",materialName:"Material",quantity:7,unit:"m",unitCost:10,date:day,destination:"warehouse"},ctx));useAppStore.setState({stock,currentMode:"compras"});expect(stockRows(stock).map((r)=>[r.unit,r.available])).toEqual([["placa",2],["m",7]]);
 expect(st().assignStock({materialId:"m",materialName:"Material",unit:"placa",projectId:"p",quantity:3}).ok).toBe(false);ok(st().assignStock({materialId:"m",materialName:"Material",unit:"placa",projectId:"p",quantity:2}));expect(stockRows(st().stock).find((r)=>r.unit==="m")!.available).toBe(7);
});

it("las vistas explícitas y categorías inactivas se propagan sin revalorizar horas históricas",()=>{
 const l=ledger();l.personnel=[{...profile(false),employeeId:op.id,views:["administracion"],view:"administracion",categoryIds:["office"]}];expect(demoOperatorEligible(l,op)).toBe(false);l.personnel[0].view="operario";l.personnel[0].views=["operario"];expect(demoOperatorEligible(l,op)).toBe(true);
 l.staffCategories=l.staffCategories!.map((c)=>c.id==="office" ? {...c,active:false} : c);l.rates=[{id:"override",scope:"employee",subjectId:op.id,hourlyRate:999,validFrom:day,createdAt:ctx.now,createdBy:"G"}];expect(()=>employeeCost(l,op,day)).toThrow(/categoría laboral activa/);
});

it("editar jornada/días en Personal y disponibilidad mantiene una única proyección y no reescribe horas",()=>{
 ok(st().saveEmployeeLocal({id:op.id,name:op.name,active:true,profile:{...profile(),hoursPerDay:4,workDays:[1,3]}}));expect(configuredOperators(st().operators,st().ledger)[0]).toMatchObject({hoursPerDay:4,workDays:[1,3]});
 ok(st().saveSchedule(op.id,{workDays:[2,4]}));expect(st().ledger.personnel![0].workDays).toEqual([2,4]);expect(configuredOperators(st().operators,st().ledger)[0].workDays).toEqual([2,4]);
 ok(st().saveEmployeeLocal({id:op.id,name:op.name,active:true,profile:{...profile(),hoursPerDay:undefined}}));expect(configuredOperators(st().operators,st().ledger)[0].hoursPerDay).toBeUndefined();
});

it("Gerencia consulta material sin movimientos alternativos y el cierre exige conciliación",()=>{
 const got=receiveStock({materialId:"m",materialName:"Material",quantity:4,unit:"u",unitCost:20,date:day,destination:{projectId:"p"}},ctx);useAppStore.setState({stock:applyChange(EMPTY_STOCK,got)});const original=st().stock;
 const move={materialId:"m",materialName:"Material",unit:"u",projectId:"p",quantity:1};
 expect(st().releaseStock(move).ok).toBe(false);expect(st().transferStock({...move,fromProjectId:"p",toProjectId:"other"}).ok).toBe(false);expect(st().markLeftover(move).ok).toBe(false);expect(st().registerUsage("p",{...move,consumed:1,waste:0,date:day}).ok).toBe(false);expect(st().directMaterialUsage({projectId:"p",itemId:"i",materialId:"m",source:"project",date:day,quantity:1,consumed:1,waste:0,leftover:0}).ok).toBe(false);expect(st().stock).toBe(original);expect(st().closeProject("p")).toMatchObject({ok:false,error:expect.stringMatching(/material/i)});
 render(<CloseDialog project={st().projects[0]} open onOpenChange={()=>undefined}/>);expect(screen.queryByRole("button",{name:"Volver al stock"})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Otro proyecto"})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Desperdicio"})).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"Continuar"})).toBeDisabled();cleanup();
 render(<MaterialsTab project={st().projects[0]}/>);expect(screen.queryByRole("button",{name:/Asignar de stock|Devolver|Transferir|Sobrante|Comprar faltante/})).not.toBeInTheDocument();
});
