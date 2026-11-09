// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { project, line } from "./helpers";
import { EMPTY_LEDGER, addRate, addRubro } from "@/lib/ledger";
import { employeeCost, savePersonnel, personnelViews } from "@/lib/personnel";
import { useAppStore, effectiveIdentity } from "@/store/use-app-store";
import { configuredOperators, weeklyCapacity } from "@/lib/frontend-work";
import { todayISO } from "@/lib/formatting";
import { addDays, assignmentError } from "@/lib/plant";
import { applyChange, EMPTY_STOCK, receiveStock, availableInWarehouse, availableToProject, stockTotalValue } from "@/lib/stock";
import { profitView } from "@/lib/tablero";
import { materialNeeds } from "@/lib/purchasing";
import { StockPage } from "@/components/stock/stock-page";
import { SettingsPage } from "@/components/settings/settings-page";
import { PersonnelView } from "@/components/operators/personnel-view";
import { StaffCategoriesSettings } from "@/components/settings/frontend-production";
import { GerenciaDashboard } from "@/components/gerencia/gerencia-dashboard";
import { FurniturePanel } from "@/components/projects/furniture-panel";
import { registerMaterialsLocal } from "@/lib/plant-materials";
vi.mock("next/navigation",() => ({ useRouter:() => ({ push:vi.fn(),replace:vi.fn(),back:vi.fn() }),usePathname:() => "/",useSearchParams:() => new URLSearchParams() }));
const today = todayISO(),yesterday = addDays(today,-1),tomorrow = addDays(today,1);
const ctx = { actor:"Gerencia",now:`${today}T12:00:00Z`,today };
const item = { id:"i",name:"Mesa",quantity:4,completedUnits:0,rubros:[{ rubro:"carpinteria_madera" as const,hours:16,workers:1 }] };
const p = () => project({ items:[item],startDate:yesterday,dueDate:tomorrow,budgetLines:[line("materials",5,100,{ materialId:"m",description:"Material",unit:"u" })],baseline:{ capturedAt:`${yesterday}T12:00:00Z`,capturedBy:"G",salesPrice:1000,dueDate:tomorrow,budgetTotal:500,lines:[line("materials",5,100,{ materialId:"m",description:"Material",unit:"u" })] } });
function ok<T>(r:{ ok:true;value:T } | { ok:false;error:string }):T { if (!r.ok) throw new Error(r.error);return r.value; }
beforeEach(() => {
  window.location.hash="";
  useAppStore.setState({ demoLocal:true,isDemo:true,role:"owner",currentMode:"gerencia",organizationId:null,actingOperatorId:null,projects:[p()],operators:[],assignments:[],deliveries:[],requests:[],stock:EMPTY_STOCK,orders:[],dayExceptions:[],reviewedHoursKeys:[],resolvedAlertIds:[],corrections:[],priceHistory:[],ledger:{ ...EMPTY_LEDGER,rubroCatalog:[{ id:"carpinteria_madera",name:"Carpintería",active:true }],staffCategories:[{ id:"craft",name:"Oficial",category:"labor",hourlyCost:100,rates:[{ validFrom:yesterday,hourlyCost:100,by:"G",at:ctx.now }] },{ id:"lead",name:"Coordinación",category:"admin",hourlyCost:200,rates:[{ validFrom:yesterday,hourlyCost:200,by:"G",at:ctx.now }] }] } });
});
afterEach(cleanup);
function employee() {
 const st = useAppStore.getState();return ok(st.createEmployeeLocal({ name:"Persona prueba",role:"Oficial",hourlyCost:100 },{ enabled:true,view:"operario",views:["operario"],categoryIds:["craft","lead"],productive:true,enabledRubros:["carpinteria_madera"],hoursPerDay:6,workDays:[0,1,2,3,4,5,6] }));
}
describe("circuitos finales del MVP",() => {
 it("dos puestos y una vista; tarifa de categoría y excepción individual sin revalorizar horas guardadas",() => {
   const id = employee();const st = useAppStore.getState();const op = st.operators[0];
   expect(personnelViews(st.ledger.personnel![0])).toEqual(["operario"]);
   expect(() => employeeCost(st.ledger,op,today)).toThrow(/categoría/);
   expect(employeeCost(st.ledger,op,today,"craft").hourlyCost).toBe(100);
   useAppStore.setState({ currentMode:"operario",actingOperatorId:id });
   const input = { requestId:"actual",operatorId:id,projectId:"p",rubro:"carpinteria_madera" as const,date:today,hours:3,categoryId:"craft" };
   ok(useAppStore.getState().executeWorkLocal(input));
   const previous = useAppStore.getState().projects[0].actualEntries[0];expect(previous.amount).toBe(300);
   const ledger = addRate(useAppStore.getState().ledger,{ scope:"employee",subjectId:id,hourlyRate:150,validFrom:tomorrow },ctx);
   useAppStore.setState({ ledger });
   expect(employeeCost(ledger,op,today,"craft").hourlyCost).toBe(100);
   expect(employeeCost(ledger,op,tomorrow,"craft").hourlyCost).toBe(150);
   expect(useAppStore.getState().projects[0].actualEntries[0]).toEqual(previous);
   useAppStore.setState({ currentMode:"administracion",ledger:{...useAppStore.getState().ledger,personnel:useAppStore.getState().ledger.personnel!.map(p=>({...p,view:"administracion",views:["administracion"]}))} });
   expect(effectiveIdentity(useAppStore.getState()).actor).toBe("Persona prueba");
   expect(useAppStore.getState().logHoursManual("p",{} as never).ok).toBe(false);
 });
 it("Personal guarda una vista, categorías, jornada, días y tarifa individual desde la ficha",async () => {
   const id = employee(),st = useAppStore.getState(),user = userEvent.setup();
   render(<PersonnelView employee={st.operators[0]} />);
   await user.click(screen.getByText(/^Operario$/,{selector:"summary"}));
   await user.clear(screen.getByLabelText(/Jornada personal/));await user.type(screen.getByLabelText(/Jornada personal/),"4");
   await user.type(screen.getByLabelText(/Nueva tarifa individual/),"175");
   await user.click(screen.getByRole("button",{ name:"Guardar configuración de la persona" }));
   const next = useAppStore.getState();expect(next.ledger.personnel![0].hoursPerDay).toBe(4);
   expect(employeeCost(next.ledger,next.operators[0],today,"craft").hourlyCost).toBe(175);
   const configured = configuredOperators(next.operators,next.ledger);
   expect(weeklyCapacity(next.projects,configured,[],[],today,today,today,8).available).toBe(4);
   expect(assignmentError({ operatorId:id,projectId:"p",rubro:"carpinteria_madera",date:today,plannedHours:2 },{ projects:next.projects,operators:[{ ...configured[0],active:false }] })).toMatch(/baja/);
 });
 it("crea categoría con vigencia automática y preserva clasificación explícita",async () => {
   const user = userEvent.setup();render(<StaffCategoriesSettings />);
   await user.type(screen.getByLabelText("Categoría"),"Comercial");await user.type(screen.getByLabelText("Costo por hora"),"350");
   
   await user.click(screen.getByRole("button",{ name:"Agregar categoría" }));
   const c = useAppStore.getState().ledger.staffCategories!.find((c) => c.name === "Comercial")!;expect(c.rates![0].validFrom).toBe(today);expect(c.category).toBe("admin");
   const id = employee();const st = useAppStore.getState();
   const ledger = savePersonnel(st.ledger,st.operators,{ ...st.ledger.personnel![0],categoryIds:[c.id] });
   expect(employeeCost(ledger,st.operators.find((o) => o.id === id)!,today,c.id).hourlyCost).toBe(350);
   expect(employeeCost(ledger,st.operators[0],tomorrow,c.id).hourlyCost).toBe(350);
 });
 it("rubros configurados conservan id y se habilitan sin inferirlos del nombre del puesto",() => {
   const id = employee(),st = useAppStore.getState();let ledger = addRubro(st.ledger,"Tapicería especial");const rubro = ledger.rubroCatalog.at(-1)!.id;
   ledger = savePersonnel(ledger,st.operators,{ ...st.ledger.personnel![0],enabledRubros:[rubro as never] });
   useAppStore.setState({ ledger });
   expect(configuredOperators(st.operators,ledger)[0].enabledRubros).toEqual([rubro]);
   expect(assignmentError({ operatorId:id,projectId:"p",rubro:"carpinteria_madera",date:today,plannedHours:2 },{ projects:st.projects,operators:configuredOperators(st.operators,ledger) })).toMatch(/habilitado/);
 });
 it("asigna stock desde la fila, concilia físico/libre/reservado, y revierte con historial",async () => {
   const got = receiveStock({ materialId:"m",materialName:"Material",unit:"u",quantity:10,unitCost:100,date:today,destination:"warehouse" },ctx);
   useAppStore.setState({ currentMode:"compras",stock:applyChange(EMPTY_STOCK,got) });
   const user = userEvent.setup();render(<StockPage />);
   expect(screen.queryByRole("columnheader",{ name:"Ubicación" })).not.toBeInTheDocument();expect(screen.queryByRole("button",{ name:"Ver lotes" })).not.toBeInTheDocument();
   await user.click(screen.getByRole("button",{ name:"Asignar a proyecto" }));
   const dialog = screen.getByRole("dialog");
   await user.selectOptions(within(dialog).getByRole("combobox"),"p");
   await user.type(within(dialog).getByRole("textbox"),"5");
   await user.click(within(dialog).getByRole("button",{ name:"Asignar" }));
   let st = useAppStore.getState();expect(availableInWarehouse(st.stock,"m")).toBe(5);expect(availableToProject(st.stock,"p","m")).toBe(5);expect(stockTotalValue(st.stock)).toBe(1000);expect(profitView(st.projects[0],st.ledger).toDate.cost).toBe(0);
   expect(materialNeeds(st.projects,[],st.stock,today)[0]).toMatchObject({ fromDepot:5,toBuy:0 });
   const movement = st.stock.movements.find((m) => m.kind === "assign")!;
   ok(st.reverseAssignmentLocal(movement.id,"Reserva equivocada"));st = useAppStore.getState();expect(availableInWarehouse(st.stock,"m")).toBe(10);expect(st.stock.movements.at(-1)?.reversalOf).toBe(movement.id);
 });
 it("consume, desperdicia y devuelve sobrante sin entrega artificial; bloquea reversión comprometida",() => {
   const got = receiveStock({ materialId:"m",materialName:"Material",unit:"u",quantity:10,unitCost:100,date:today,destination:"warehouse" },ctx);
   useAppStore.setState({ currentMode:"compras",stock:applyChange(EMPTY_STOCK,got) });ok(useAppStore.getState().assignStock({ materialId:"m",materialName:"Material",unit:"u",projectId:"p",quantity:5 }));
   const assigned = useAppStore.getState().stock.movements.find((m) => m.kind === "assign")!;
   useAppStore.setState({ currentMode:"jefe_planta" });
   ok(useAppStore.getState().directMaterialUsage({ projectId:"p",itemId:"i",materialId:"m",source:"project",quantity:4,date:today,consumed:2,waste:1,leftover:1,units:[] }));
   const st = useAppStore.getState();expect(st.deliveries).toEqual([]);expect(profitView(st.projects[0],st.ledger).toDate.cost).toBe(300);
   expect(st.projects[0].materialUsages.reduce((s,u) => s+u.reusableLeftoverQuantity,0)).toBe(1);
   expect(availableToProject(st.stock,"p","m")).toBe(1);expect(availableInWarehouse(st.stock,"m")).toBe(6);
   useAppStore.setState({ currentMode:"compras" });expect(useAppStore.getState().reverseAssignmentLocal(assigned.id,"Corregir").ok).toBe(false);
   expect(() => registerMaterialsLocal(p(),st.stock,[],{ projectId:"p",itemId:"i",materialId:"m",source:"project",quantity:99,date:today,consumed:99,waste:0,leftover:0 },ctx)).toThrow();
 });
 it("catálogo y precios solo en Administración; edición conserva presupuesto y costo de origen",() => {
   render(<SettingsPage />);expect(screen.queryByText("Materiales y precios de referencia")).not.toBeInTheDocument();cleanup();
   useAppStore.setState({ currentMode:"administracion" });render(<SettingsPage />);expect(screen.getByText("Materiales y precios de referencia")).toBeInTheDocument();
   const before = structuredClone(useAppStore.getState().projects[0]);
   ok(useAppStore.getState().saveCatalogMaterial({ name:"Tablero",unit:"placa",rubro:"carpinteria_madera",price:200,validFrom:today }));
   const m = useAppStore.getState().ledger.materialCatalog![0];ok(useAppStore.getState().saveCatalogMaterial({ ...m,rubro:m.rubro,price:300,validFrom:tomorrow }));
   expect(useAppStore.getState().projects[0]).toEqual(before);expect(useAppStore.getState().priceHistory.filter((r) => r.subjectId === m.id).map((r) => r.value)).toEqual([200,300]);
 });
 it("cotización aprobada es de solo lectura y las acciones locales de Administración están bloqueadas",async () => {
   useAppStore.setState({ currentMode:"administracion" });const st = useAppStore.getState();
   render(<FurniturePanel project={st.projects[0]} canEdit />);expect(screen.getByText("Cotización original aprobada")).toBeInTheDocument();expect(screen.getByText("BOM de producción")).toBeInTheDocument();
   expect(screen.queryByRole("button",{ name:/Corregir cantidad/ })).not.toBeInTheDocument();
   expect((await st.correctValue("p",{ target:"budget_line",lineId:st.projects[0].budgetLines[0].id,field:"quantity",newValue:99,reason:"Cambio" })).ok).toBe(false);
   expect(st.updateBudgetLine("p",st.projects[0].budgetLines[0].id,{} as never).ok).toBe(false);
   expect(st.directMaterialUsage({} as never).ok).toBe(false);expect(st.receiveOrder("no",[]).ok).toBe(false);
   expect(st.saveAssignment({} as never).ok).toBe(false);
 });
 it.each(["administracion","compras","jefe_planta"] as const)("%s no muestra valorización de stock",(mode) => {
   const got = receiveStock({ materialId:"m",materialName:"Material",unit:"u",quantity:10,unitCost:100,date:today,destination:"warehouse" },ctx);useAppStore.setState({ currentMode:mode,stock:applyChange(EMPTY_STOCK,got) });render(<StockPage lot={got.lot.id} material="m" />);
   expect(screen.queryByText("Valor total en stock")).not.toBeInTheDocument();expect(document.body.textContent).not.toMatch(/\$/);expect(screen.queryByRole("button",{ name:"Ver lotes" })).not.toBeInTheDocument();
 });
 it("Dashboard alterna rentabilidad, mantiene chips activos y totales, sin documentación duplicada",async () => {
   const user = userEvent.setup();render(<GerenciaDashboard />);
   expect(screen.queryByText("Cómo se calcula")).not.toBeInTheDocument();expect(screen.getByRole("button",{ name:"Este mes" })).toHaveAttribute("aria-pressed","true");
   const section = document.getElementById("rentabilidad")!;expect(within(section).getByRole("table")).toBeInTheDocument();
   await user.click(within(section).getByRole("button",{ name:"Ver gráfico" }));expect(within(section).queryByRole("table")).not.toBeInTheDocument();await user.click(within(section).getByRole("button",{name:"Ver como tabla"}));expect(within(section).queryByRole("img")).not.toBeInTheDocument();
   expect(screen.queryByRole("columnheader",{ name:"OT" })).not.toBeInTheDocument();expect(screen.queryByRole("columnheader",{ name:"Total acordado con el cliente" })).not.toBeInTheDocument();
 });
});
