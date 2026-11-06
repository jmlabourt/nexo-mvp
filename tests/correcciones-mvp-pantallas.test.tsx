// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { project, line } from "./helpers";
import { EMPTY_LEDGER } from "@/lib/ledger";
import { useAppStore } from "@/store/use-app-store";
import { MaterialCatalogSettings } from "@/components/settings/material-catalog";
import { MaterialCatalogList } from "@/components/budget/material-rows";
import { materialRowToQuote } from "@/components/budget/calculator-state";
import { BomVersions } from "@/components/projects/bom-versions";
import { withPublishedBom } from "@/lib/bom-needs";
import { materialNeeds } from "@/lib/purchasing";
import { StockPage } from "@/components/stock/stock-page";
import { PlantSummaryPage } from "@/components/plant/plant-pages";
import { receiveStock, applyChange, EMPTY_STOCK } from "@/lib/stock";
vi.mock("next/navigation",() => ({ useRouter:() => ({ push:vi.fn(),back:vi.fn() }),usePathname:() => "/settings",useSearchParams:() => new URLSearchParams() }));
const date = "2026-10-19";
const item = { id:"i",name:"Mesa",quantity:2,completedUnits:0,rubros:[{ rubro:"carpinteria_madera" as const,hours:8,workers:1 }] };
const p = () => project({ items:[item],budgetLines:[line("materials",4,100,{ materialId:"m",description:"Material",unit:"u" })] });
beforeEach(() => useAppStore.setState({ demoLocal:true,isDemo:true,role:"owner",currentMode:"administracion",organizationId:null,projects:[p()],operators:[],assignments:[],deliveries:[],requests:[],stock:EMPTY_STOCK,orders:[],ledger:{ ...EMPTY_LEDGER,rubroCatalog:[{ id:"carpinteria_madera",name:"Carpintería",active:true }] } }));
afterEach(cleanup);

describe("correcciones MVP entre vistas",() => {
  it("un material nuevo conserva id en catálogo, cotización, BOM y necesidad de Compras",async () => {
    const user = userEvent.setup(); const view = render(<><MaterialCatalogSettings /><MaterialCatalogList /></>);
    await user.type(screen.getByLabelText("Nombre del material"),"Tablero especial");
    await user.type(screen.getByLabelText("Unidad"),"placa");
    await user.type(screen.getByLabelText("Precio de referencia"),"250");
    await user.click(screen.getByRole("button",{ name:"Crear material" }));
    const material = useAppStore.getState().ledger.materialCatalog![0];
    expect(document.querySelector(`option[value="Tablero especial"]`)).toBeInTheDocument();
    expect(materialRowToQuote({ materialId:material.id,key:"r",name:material.name,unit:material.unit,quantity:"3",unitCost:"250",wastePct:"0" }).materialId).toBe(material.id);
    view.unmount();
    const st = useAppStore.getState();
    const ledger = { ...st.ledger,boms:[{ id:"b",projectId:"p",itemId:"i",version:1,status:"published" as const,createdBy:"A",createdAt:date,publishedAt:date,lines:[{ id:"l",materialId:material.id,material:material.name,quantity:3,unit:material.unit }] }] };
    const needs = materialNeeds([withPublishedBom(p(),ledger)],[],EMPTY_STOCK,date);
    expect(needs[0]).toMatchObject({ materialId:material.id,toBuy:3,unit:"placa" });
  });
  it("Cancelar descarta edición local del BOM y conserva la versión publicada y el borrador guardado",async () => {
    const user = userEvent.setup(); const proj = p();
    const published = { id:"b1",projectId:"p",itemId:"i",version:1,status:"published" as const,createdBy:"A",createdAt:date,publishedAt:date,lines:[{ id:"l",material:"Material",materialId:"m",quantity:4,unit:"u" }] };
    const draft = { ...published,id:"b2",version:2,status:"draft" as const,lines:[{ ...published.lines[0],quantity:5 }] };
    useAppStore.setState({ ledger:{ ...useAppStore.getState().ledger,boms:[published,draft] } });
    render(<BomVersions project={proj} item={item} canEdit />);
    await user.clear(screen.getByLabelText("Cantidad de Material"));
    await user.type(screen.getByLabelText("Cantidad de Material"),"99");
    await user.click(screen.getByRole("button",{ name:"Cancelar" }));
    expect(useAppStore.getState().ledger.boms).toEqual([published,draft]);
    expect(screen.getByRole("button",{ name:"Retomar borrador del BOM" })).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
  it("Compras ve cantidades y asignación, sin valoración de inventario",() => {
    const got = receiveStock({ materialId:"m",materialName:"Material",unit:"u",quantity:10,unitCost:100,date,destination:"warehouse" },{ actor:"C",now:date });
    useAppStore.setState({ currentMode:"compras",stock:applyChange(EMPTY_STOCK,got) });
    render(<StockPage />);
    expect(screen.queryByText("Valor total en stock")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader",{ name:"Costo unit." })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader",{ name:"Disponible" })).toBeInTheDocument();
  });
  it("Hoy usa la misma producción sin mostrar análisis de horas o capacidad",() => {
    useAppStore.setState({ currentMode:"jefe_planta" });
    render(<PlantSummaryPage />);
    expect(screen.getByRole("heading",{ name:"Hoy" })).toBeInTheDocument();
    expect(screen.getByRole("heading",{ name:/Mesa × 2/ })).toBeInTheDocument();
    expect(screen.queryByText(/Horas cotizadas totales/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Horas trabajadas hasta hoy/)).not.toBeInTheDocument();
    expect(screen.queryByText(/avance.*%/)).not.toBeInTheDocument();
  });
  it("unidades de hoy actualizan el total del mueble una vez y bloquean excedentes",async () => {
    const user = userEvent.setup();useAppStore.setState({ currentMode:"jefe_planta" });
    render(<PlantSummaryPage />);
    await user.type(screen.getByLabelText("Unidades terminadas hoy"),"1");
    await user.click(screen.getByRole("button",{ name:"Guardar unidades" }));
    const furniture = useAppStore.getState().projects[0].items[0];
    expect(furniture.completedUnits).toBe(1);
    expect(furniture.unitsHistory).toHaveLength(1);
    expect(furniture.unitsHistory![0]).toMatchObject({ previous:0,next:1 });
    await user.type(screen.getByLabelText("Unidades terminadas hoy"),"2");
    await user.click(screen.getByRole("button",{ name:"Guardar unidades" }));
    expect(useAppStore.getState().projects[0].items[0].completedUnits).toBe(1);
    expect(useAppStore.getState().projects[0].items[0].unitsHistory).toHaveLength(1);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
  it("exportación e importación preservan catálogo, referencias e historial en almacenamiento aislado",async () => {
    const { createDemoScenario,parseDemoScenario,pickDemoData,writeDemo,readDemo } = await import("@/store/demo-local");
    const st = useAppStore.getState();
    const snapshot = createDemoScenario(pickDemoData(st as unknown as Record<string,unknown>),"Prueba",date);
    const imported = parseDemoScenario(JSON.stringify(snapshot));expect(imported).not.toBeNull();
    const data = new Map<string,string>();
    const storage = { getItem:(key:string) => data.get(key) ?? null,setItem:(key:string,value:string) => { data.set(key,value); },removeItem:(key:string) => { data.delete(key); } };
    expect(writeDemo(imported!.data,storage)).toBe(true);
    expect(readDemo(storage)).toEqual(snapshot.data);
  });

});
