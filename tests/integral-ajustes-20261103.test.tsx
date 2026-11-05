// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach,beforeEach,describe,expect,it } from "vitest";
import { cleanup,render,screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { initialCalcState,newProductRow,computeCalculator,productInputs,materialRowToQuote } from "@/components/budget/calculator-state";
import { DEFAULT_HOUR_RATES } from "@/lib/constants";
import { createProject,captureBaseline } from "@/lib/project-operations";
import { frozenQuoteGroups } from "@/lib/quotation-presentation";
import { FrozenQuote } from "@/components/budget/frozen-quote";
import { QuoteDefaultsSettings } from "@/components/settings/frontend-production";
import { categoryCostAt } from "@/lib/personnel";
import { validateBomPublication,bomProjectWarnings } from "@/lib/bom-commitments";
import { EMPTY_LEDGER,startBomDraft } from "@/lib/ledger";
import { EMPTY_STOCK,applyChange,receiveStock,assignToProject } from "@/lib/stock";
import { useAppStore } from "@/store/use-app-store";
import { line,project } from "./helpers";
import type { Ledger } from "@/types";
const date="2026-11-03",ctx={actor:"Prueba aislada",now:date+"T12:00:00Z",today:date};
beforeEach(()=>{localStorage.clear();useAppStore.setState({demoLocal:true,isDemo:true,role:"owner",currentMode:"gerencia",organizationId:null,ledger:{...EMPTY_LEDGER},stock:EMPTY_STOCK,projects:[],orders:[]});});
afterEach(cleanup);
describe("A–C: tarifas, objetivos y cotización congelada con identidades",()=>{
 it("tarifa futura no sustituye la vigente y no se infiere la clasificación del nombre",()=>{
  const c={id:"c",name:"Nombre editable",category:"design" as const,hourlyCost:900,rates:[{validFrom:"2026-01-01",hourlyCost:100,at:ctx.now,by:"G"},{validFrom:"2027-01-01",hourlyCost:900,at:ctx.now,by:"G"}]};
  expect(categoryCostAt(c,date)).toBe(100);expect(categoryCostAt({...c,name:"Operario"},date)).toBe(100);expect(c.category).toBe("design");
 });
 it("guarda objetivos independientes, inicializa solo una cotización nueva y rechaza otra vista",async()=>{
  const user=userEvent.setup();render(<QuoteDefaultsSettings/>);
  await user.clear(screen.getByLabelText("Materiales (%)"));await user.type(screen.getByLabelText("Materiales (%)"),"25");
  await user.clear(screen.getByLabelText("Mano de obra (%)"));await user.type(screen.getByLabelText("Mano de obra (%)"),"40");
  const draft=initialCalcState();draft.materialsTargetPct="17";
  await user.click(screen.getByRole("button",{name:"Guardar objetivos"}));
  const st=useAppStore.getState();expect(st.ledger.quoteDefaults).toEqual({materialsTargetPct:25,laborTargetPct:40});
  expect(initialCalcState(5,st.ledger.quoteDefaults)).toMatchObject({materialsTargetPct:"25",laborTargetPct:"40"});expect(draft.materialsTargetPct).toBe("17");
  useAppStore.setState({currentMode:"administracion"});expect(useAppStore.getState().recordLedger(["administracion"],l=>({...l,quoteDefaults:{materialsTargetPct:99,laborTargetPct:99}})).ok).toBe(false);
 });
 it("dos muebles con igual nombre conservan IDs distintos, horas y totales tras cambios operativos",()=>{
  const state=initialCalcState(0,{materialsTargetPct:25,laborTargetPct:40});state.products=[newProductRow("Mesa"),newProductRow("Mesa")];
  state.products.forEach((p,i)=>{p.quantity=String(i+1);p.rubros[0].hours="2";p.rubros[0].materials=[{key:"mat"+i,materialId:"m",name:"Tablero",unit:"placa",quantity:"1",unitCost:"100",wastePct:"0"}];p.rubros[0].staffHours=[{rateId:"comercial",name:"Comercial",category:"admin",hours:"3",hourlyCost:50}];});
  const calc=computeCalculator(state,"Local comercial",{projects:[],rates:DEFAULT_HOUR_RATES,overtimeMultiplier:2,hoursPerDay:8,salesPrice:1000000,isDemo:false});
  const p=createProject({code:"TEST",name:"Dos muebles",client:"C",projectType:"Local comercial",description:"",startDate:date,dueDate:"2026-12-01",owner:"A",salesPrice:1000000,budgetLines:calc.lines,items:productInputs(state),quotationParameters:{materialsTargetPct:25,laborTargetPct:40,financialPct:0,deadlineDays:null}},ctx);
  p.baseline=captureBaseline(p,ctx);const frozen=structuredClone(p.baseline);
  expect(new Set(p.budgetLines.filter(l=>l.quotationItemId).map(l=>l.quotationItemId)).size).toBe(2);
  expect(p.baseline.lines.filter(l=>l.hourRateId==="comercial").map(l=>[l.quantity,l.unitCost])).toEqual([[3,50],[3,50]]);
  expect(frozenQuoteGroups(p).filter(g=>g.label.startsWith("Mesa")).length).toBe(2);
  expect(frozenQuoteGroups(p).flatMap(g=>g.lines).reduce((s,l)=>s+l.total,0)).toBe(p.baseline.budgetTotal);
  const approved={...p,status:"approved" as const};let boms={...EMPTY_LEDGER};
  for(const item of approved.items){boms=startBomDraft(boms,approved,item.id,ctx);expect(boms.boms.at(-1)!.lines).toHaveLength(1);expect(boms.boms.at(-1)!.lines[0].budgetLineId).toBe(p.baseline.lines.find(l=>l.category==="materials" && l.quotationItemId===item.id)!.id);}
  p.items[0].name="Editado";p.budgetLines[0].unitCost=999;p.budgetLines.push(line("materials",100,999));
  expect(p.baseline).toEqual(frozen);expect(p.baseline.quotationParameters).toMatchObject({materialsTargetPct:25,laborTargetPct:40});
  for(const mode of ["administracion","gerencia"] as const){useAppStore.setState({currentMode:mode});render(<FrozenQuote project={p}/>);expect(screen.getAllByText("Cotización original aprobada")).toHaveLength(1);expect(screen.getByText("Mesa × 1")).toBeInTheDocument();cleanup();}
 });
 it("sin referencia congelada no reparte históricos usando muebles actuales",()=>{
  const p=project({items:[{id:"i",name:"Mesa",quantity:1,completedUnits:0,rubros:[]}],budgetLines:[line("materials",1,100,{description:"Mesa"}),line("transport",null,25)]});p.baseline=captureBaseline(p,ctx);delete p.baseline.items;
  expect(frozenQuoteGroups(p).map(g=>[g.label,g.lines.reduce((s,l)=>s+l.total,0)])).toEqual([["Conceptos generales",25],["Sin mueble identificado",100]]);
 });
 it("un nombre de material no fabrica un ID de catálogo",()=>{expect(materialRowToQuote({key:"x",name:"Melamina blanca 18 mm",unit:"placa",quantity:"1",unitCost:"100",wastePct:"0"}).materialId).toBeUndefined();});
});
describe("D: movimientos globales y atribución verificable",()=>{
 function scenario(){
  const p=project({items:[{id:"i",name:"Mostrador",quantity:1,completedUnits:0,rubros:[]}]});
  const before:Ledger={...EMPTY_LEDGER,boms:[{id:"v1",projectId:p.id,itemId:"i",version:1,status:"published",createdAt:ctx.now,createdBy:"A",lines:[{id:"stable",materialId:"profile",material:"Perfil",quantity:60,unit:"m"}]}]};
  let stock=applyChange(EMPTY_STOCK,receiveStock({materialId:"profile",materialName:"Perfil",unit:"m",quantity:70,unitCost:16,date,destination:"warehouse"},ctx));stock=applyChange(stock,assignToProject(stock,{materialId:"profile",projectId:p.id,quantity:70},ctx));
  const after=(quantity:number):Ledger=>({...before,boms:[...before.boms,{...before.boms[0],id:"v2",version:2,lines:[{...before.boms[0].lines[0],quantity}]}]});
  return {p,before,stock,after};
 }
 it("70 globales no se atribuyen al mostrador de 60; conservar o aumentar no agrava, reducir bloquea",()=>{
  const {p,before,stock,after}=scenario();expect(bomProjectWarnings(p,before,stock,date)[0]).toMatch(/70 m; BOM 60/);
  expect(()=>validateBomPublication([p],before,after(60),[],stock,date)).not.toThrow();expect(()=>validateBomPublication([p],before,after(65),[],stock,date)).not.toThrow();expect(()=>validateBomPublication([p],before,after(59),[],stock,date)).toThrow(/Compras\/Planta/);
 });
 it.each(["gerencia","administracion","jefe_planta","operario"] as const)("%s no transfiere por operación alternativa",mode=>{
  useAppStore.setState({currentMode:mode});const before=useAppStore.getState().stock;
  const r=useAppStore.getState().transferStock({fromProjectId:"a",toProjectId:"b",materialId:"m",materialName:"Material",unit:"u",quantity:1});expect(r.ok).toBe(false);expect(useAppStore.getState().stock).toEqual(before);
 });
});

describe("Identidad y unidad al guardar BOM",()=>{
 it.each([undefined,"m"])("rechaza línea nueva sin identidad válida o con unidad incompatible (%s)",materialId=>{
  const p=project({items:[{id:"i",name:"Mesa",quantity:1,completedUnits:0,rubros:[]}]});
  useAppStore.setState({currentMode:"administracion",projects:[p],ledger:{...EMPTY_LEDGER,materialCatalog:[{id:"m",name:"Tablero",unit:"placa",referenceCost:100,active:true,validFrom:date}]}});
  const r=useAppStore.getState().recordLedger(["administracion"],l=>({...l,boms:[{id:"new",projectId:p.id,itemId:"i",status:"draft",version:1,createdAt:ctx.now,createdBy:"A",lines:[{id:"line",materialId,material:"Tablero",unit:"m",quantity:1}]}]}));
  expect(r).toMatchObject({ok:false,error:expect.stringMatching(/catálogo/)});expect(useAppStore.getState().ledger.boms).toEqual([]);
 });
});
