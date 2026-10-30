// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach,afterEach,describe,it,expect } from "vitest";
import { render,screen,cleanup,within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAppStore } from "@/store/use-app-store";
import { DEFAULT_HOUR_RATES,DEFAULT_SETTINGS } from "@/lib/constants";
import { EMPTY_LEDGER } from "@/lib/ledger";
import { myDay } from "@/lib/my-day";
import { todayISO } from "@/lib/formatting";
import { FlexibleWork } from "@/components/workshop/flexible-work";
import { ExternalWorkSection } from "@/components/plant/external-work";
import { project } from "./helpers";
const date = todayISO();
const op = { id:"op",name:"Persona",role:"Carpintería",active:true,hourlyCost:100,createdAt:`${date}T00:00:00Z` };
const item = { id:"item",name:"Mesa",quantity:1,completedUnits:0,rubros:[{ rubro:"carpinteria_madera" as const,hours:20,workers:1 }] };
beforeEach(() => {
  window.localStorage.clear();
  useAppStore.setState({ demoLocal:true,role:"owner",isDemo:true,currentMode:"jefe_planta",organizationId:null,projects:[project({ items:[item] }),project({ id:"other",code:"P-2",items:[item] })],operators:[op],assignments:[],ledger:{ ...EMPTY_LEDGER },priceHistory:[],costSettings:{ hoursPerDay:8,overtimeMultiplier:1.5,financialPct:0,laborValuation:"operator" },hourRates:DEFAULT_HOUR_RATES,settings:{ ...DEFAULT_SETTINGS },dayExceptions:[],orders:[],deliveries:[],reviewedHoursKeys:[],actingOperatorId:"op",syncStatus:"idle",syncError:null });
});
afterEach(cleanup);
describe("flujo compartido entre vistas frontend", () => {
  it("precarga proyecto/rubro sin mueble y el operario registra otra imputación sin reescribir el plan", async () => {
    const st = useAppStore.getState();
    const r = st.saveAssignment({ projectId:"p",rubro:"carpinteria_madera",operatorId:"op",date,plannedHours:8 });
    expect(r.ok).toBe(true);
    const assignment = useAppStore.getState().assignments[0];
    expect(myDay(useAppStore.getState().projects,[assignment],"op",date).items[0].logged).toBe(0);
    useAppStore.setState({ currentMode:"operario" });
    const user = userEvent.setup();
    render(<FlexibleWork operator={op} assignment={assignment} onSaved={() => undefined} />);
    await user.selectOptions(screen.getByLabelText("Proyecto"),"other");
    await user.selectOptions(screen.getByLabelText("Rubro"),"carpinteria_madera");
    await user.type(screen.getByLabelText("Horas reales"),"6");
    await user.click(screen.getByRole("button",{ name:"Registrar ejecución real" }));
    const result = useAppStore.getState();
    expect(result.assignments).toEqual([assignment]);
    expect(result.projects.find((p) => p.id === "p")?.actualEntries).toHaveLength(0);
    expect(result.projects.find((p) => p.id === "other")?.actualEntries[0].labor?.hours).toBe(6);
  });
  it("Planta registra un externo sin costo y Gerencia lo confirma sobre el mismo registro", async () => {
    const user = userEvent.setup();
    render(<ExternalWorkSection />);
    await user.click(screen.getByText("Registrar trabajo externo"));
    await user.selectOptions(screen.getByLabelText("Rubro"),"carpinteria_madera");
    await user.type(screen.getByLabelText("Horas reales de la persona"),"3");
    await user.type(screen.getByLabelText("Descripción"),"Refuerzo de armado");
    await user.click(screen.getByRole("button",{ name:"Guardar trabajo externo" }));
    const row = useAppStore.getState().ledger.externalWork![0];
    expect(row.estimatedCost).toBeUndefined(); expect(row.confirmedCost).toBeUndefined();
    cleanup(); useAppStore.setState({ currentMode:"gerencia" });
    render(<ExternalWorkSection />);
    const form = screen.getByLabelText("Costo definitivo");
    await user.type(form,"450");
    await user.click(screen.getByRole("button",{ name:"Confirmar costo" }));
    expect(useAppStore.getState().ledger.externalWork).toHaveLength(1);
    expect(useAppStore.getState().ledger.externalWork![0].confirmedCost).toBe(450);
    expect(useAppStore.getState().projects.flatMap((p) => p.actualEntries)).toHaveLength(0);
  });
  it("ninguna extensión local se presenta como guardada en una empresa real", () => {
    useAppStore.setState({ demoLocal:false,organizationId:"real",ledgerReady:true,currentMode:"gerencia" });
    const previous = useAppStore.getState().ledger;
    const r = useAppStore.getState().recordLedger(["gerencia"],(l) => ({ ...l,externalWork:[] }));
    expect(r.ok).toBe(false); expect(useAppStore.getState().ledger).toBe(previous);
    render(<ExternalWorkSection />);
    expect(within(document.body).queryByText("Registrar trabajo externo")).toBeNull();
    expect(document.body.textContent).toMatch(/integración del backend/);
  });
});
