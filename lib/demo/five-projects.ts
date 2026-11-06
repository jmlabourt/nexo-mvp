/** Conversión de solo lectura. Un borrador incompleto NO se presenta como backup importable. */
import type Source from "@/auditoria_blerp/BLERP_DEMO_5_PROYECTOS_OCTUBRE_2026.json";
import type {BudgetLine,Project,ProjectItem,ProjectBaseline,ProductRubro,Ledger,Operator,PurchaseOrder,RubroId} from "@/types";
import {EMPTY_LEDGER,quotedMaterialsOf,registerInternalHours,staffHoursCost} from "@/lib/ledger";
import {makeBudgetLine} from "@/lib/project-operations";
import {receiveOrder} from "@/lib/purchasing";
import {EMPTY_STOCK,applyChange,consumeMaterial,stockTotalValue,type StockState} from "@/lib/stock";
import {actualCostToDate} from "@/lib/calculations";
import {cashInPeriod} from "@/lib/post-meeting";
import {RUBROS} from "@/lib/rubros";
export type FiveProjectSource=typeof Source;
export interface Finding {kind:"arithmetic"|"reference"|"workflow"|"missing";path:string;message:string}
type DraftItem=Omit<ProjectItem,"rubros"|"completedUnits">&{rubros:Array<Omit<ProductRubro,"workers">>;completedUnits?:number};
type DraftProject=Omit<Project,"startDate"|"dueDate"|"projectType"|"owner"|"items"|"baseline">&{items:DraftItem[];baseline?:Omit<ProjectBaseline,"dueDate"|"items">&{items:DraftItem[]}};
const round=(n:number)=>Math.round(n*100)/100;
const total=(values:number[])=>round(values.reduce((s,n)=>s+n,0));
const actor="Adaptador técnico del escenario; autor humano no informado";
// Convención de codificación, no afirmación de una hora observada: fechas del archivo tienen precisión de día.
const at=(day:string)=>`${day}T00:00:00-03:00`;
function rubro(name:string):RubroId {const found=RUBROS.find(r=>r.label===name);if(!found)throw new Error(`Rubro no reconocido: ${name}`);return found.id;}
export function auditFiveProjectSource(s:FiveProjectSource){
 const findings:Finding[]=[];
 const add=(kind:Finding["kind"],path:string,message:string)=>findings.push({kind,path,message});
 const verify=(actual:number,expected:number,path:string)=>{if(!Number.isFinite(actual)||!Number.isFinite(expected)||Math.abs(actual-expected)>0.01)add("arithmetic",path,`${actual} calculado; ${expected} declarado.`);};
 for(const [name,rows] of Object.entries({proyectos:s.proyectos,empleados:s.empleados,catalogo_materiales:s.catalogo_materiales,clientes:s.clientes,proveedores:s.proveedores,ordenes_compra:s.ordenes_compra,consumos_y_desperdicios:s.consumos_y_desperdicios,horas_reales:s.horas_reales,facturas_emitidas:s.facturas_emitidas,cobros_efectivos:s.cobros_efectivos,solicitudes_pago_proveedores:s.solicitudes_pago_proveedores,pagos_efectivos_proveedores:s.pagos_efectivos_proveedores})){
  if(new Set(rows.map(r=>r.id)).size!==rows.length)add("reference",name,"Identidades duplicadas.");
 }
 for(const p of s.proyectos){
  if(!s.clientes.some(c=>c.id===p.cliente_id))add("reference",p.id,"Cliente inexistente.");
  const lines=p.muebles.flatMap(i=>i.lineas_cotizadas);for(const l of lines){verify(l.cantidad*l.costo_unitario_ars,l.costo_total_ars,`${p.id}/cotización/${l.referencia}`);if(l.tipo==="material"&&!s.catalogo_materiales.some(m=>m.id===l.referencia))add("reference",p.id,`Material inexistente: ${l.referencia}`);}
  verify(total(lines.map(l=>l.costo_total_ars)),p.costo_cotizado_ars,`${p.id}/costo_cotizado`);
  const margin=(p.precio_ofertado_ars-p.costo_cotizado_ars)/p.precio_ofertado_ars*100;verify(margin,p.margen_cotizado_porcentaje,`${p.id}/margen`);
  const dates=[p.fecha_cotizacion,p.fecha_aprobacion,p.fecha_bom_publicado,p.fecha_inicio_decidido_planta,p.fecha_cierre_validado].filter((x):x is string=>!!x);if(dates.some((d,i)=>i>0&&d<dates[i-1]))add("workflow",p.id,"Las fechas del flujo no están ordenadas.");
 }
 for(const o of s.ordenes_compra){
  const p=s.proyectos.find(p=>p.id===o.proyecto_id),m=s.catalogo_materiales.find(m=>m.id===o.material_id);
  if(!p||!m||!s.proveedores.some(v=>v.id===o.proveedor_id)){add("reference",o.id,"Proyecto, material o proveedor inexistente.");continue;}
  if(m.unidad!==o.unidad)add("reference",o.id,"Unidad incompatible con catálogo.");verify(o.cantidad_pedida*o.precio_unitario_ars,o.total_ars,o.id);
  if(o.cantidad_recibida<0||o.cantidad_recibida>o.cantidad_pedida||o.cantidad_asignada_proyecto!==o.cantidad_recibida)add("arithmetic",o.id,"Pedido, recibido y asignado no concilian.");
  if(o.cantidad_recibida>0&&(!o.fecha_recepcion||o.fecha_recepcion<o.fecha_envio_proveedor))add("workflow",o.id,"Recepción sin fecha válida posterior al envío.");
  if(!p.fecha_bom_publicado||p.fecha_bom_publicado>o.fecha_envio_proveedor)add("workflow",o.id,"OC anterior a BOM publicado.");
  const uses=s.consumos_y_desperdicios.filter(u=>u.oc_id===o.id);const spent=total(uses.map(u=>u.cantidad_consumida+u.cantidad_desperdiciada));if(spent>o.cantidad_recibida)add("arithmetic",o.id,"Uso mayor a lo recibido.");
 }
 for(const u of s.consumos_y_desperdicios){
  const o=s.ordenes_compra.find(o=>o.id===u.oc_id),p=s.proyectos.find(p=>p.id===u.proyecto_id);
  if(!o||!p?.muebles.some(i=>i.id===u.mueble_id)||o.proyecto_id!==u.proyecto_id||o.material_id!==u.material_id)add("reference",u.id,"Vínculo de uso inválido.");
  verify((u.cantidad_consumida+u.cantidad_desperdiciada)*u.costo_unitario_origen_ars,u.costo_imputado_ars,u.id);
  if(o&&u.costo_unitario_origen_ars!==o.precio_unitario_ars)add("arithmetic",u.id,"Costo distinto del origen de OC.");
  if(o?.fecha_recepcion&&u.fecha<o.fecha_recepcion)add("workflow",u.id,"Uso anterior a recepción.");
 }
 for(const h of s.horas_reales){
  const e=s.empleados.find(e=>e.id===h.empleado_id),p=s.proyectos.find(p=>p.id===h.proyecto_id);if(!e||!p?.muebles.some(i=>i.id===h.mueble_id)||!e.categorias.includes(h.categoria_id))add("reference",h.id,"Empleado, categoría o mueble inválido.");
  if(h.rubro&&!e?.rubros.includes(h.rubro))add("reference",h.id,"Rubro no habilitado para la persona.");verify(h.horas_reales*h.costo_hora_historico_ars,h.costo_total_ars,h.id);
  const daily=s.horas_reales.filter(r=>r.empleado_id===h.empleado_id&&r.fecha===h.fecha).reduce((n,r)=>n+r.horas_reales,0);if(daily>24)add("arithmetic",h.id,"Más de 24 h de la persona en un día.");
 }
 for(const c of s.cobros_efectivos){const inv=s.facturas_emitidas.find(i=>i.id===c.factura_id);if(!inv||inv.proyecto_id!==c.proyecto_id)add("reference",c.id,"Cobro sin factura/proyecto coherente.");else if(total(s.cobros_efectivos.filter(x=>x.factura_id===inv.id).map(x=>x.importe_ars))>inv.importe_ars)add("arithmetic",inv.id,"Cobros mayores a la factura.");}
 for(const r of s.solicitudes_pago_proveedores){const o=s.ordenes_compra.find(o=>o.id===r.oc_id);if(!o)add("reference",r.id,"Solicitud sin OC.");const paid=total(s.pagos_efectivos_proveedores.filter(p=>p.solicitud_id===r.id).map(p=>p.importe_ars));if(paid>r.importe_solicitado_ars)add("arithmetic",r.id,"Pagos mayores a solicitud.");if(o&&r.importe_solicitado_ars>o.total_ars)add("arithmetic",r.id,"Solicitud mayor a OC.");}
 for(const p of s.pagos_efectivos_proveedores){const r=s.solicitudes_pago_proveedores.find(r=>r.id===p.solicitud_id);if(!r||r.oc_id!==p.oc_id||p.fecha_debito_efectiva<r.fecha_solicitud)add("reference",p.id,"Pago sin solicitud válida o anterior a ella.");}
 const projects=s.proyectos.map(p=>{
  const material=total(s.consumos_y_desperdicios.filter(u=>u.proyecto_id===p.id).map(u=>u.costo_imputado_ars));const hs=s.horas_reales.filter(h=>h.proyecto_id===p.id);const labor=total(hs.map(h=>h.costo_total_ars));const cost=round(material+labor);const contract=p.precio_venta_aprobado_ars??0;
  return {id:p.id,quoted:p.costo_cotizado_ars,contract,material,labor,hours:total(hs.map(h=>h.horas_reales)),productiveHours:total(hs.filter(h=>h.rubro).map(h=>h.horas_reales)),cost,gain:contract?round(contract-cost):null};
 });
 const ordered=total(s.ordenes_compra.map(o=>o.total_ars)),received=total(s.ordenes_compra.map(o=>o.cantidad_recibida*o.precio_unitario_ars)),consumed=total(projects.map(p=>p.material));
 const collected=total(s.cobros_efectivos.map(c=>c.importe_ars)),paid=total(s.pagos_efectivos_proveedores.map(p=>p.importe_ars));
 return {findings,projects,totals:{contract:total(projects.map(p=>p.contract)),cost:total(projects.filter(p=>p.contract>0).map(p=>p.cost)),gain:total(projects.map(p=>p.gain??0)),ordered,received,consumed,held:round(received-consumed),pendingReceipt:round(ordered-received),invoiced:total(s.facturas_emitidas.map(i=>i.importe_ars)),collected,paid,cash:round(collected-paid),requestedPending:total(s.solicitudes_pago_proveedores.map(r=>r.importe_solicitado_ars))-paid,obligationsUnpaid:round(ordered-paid)}};
}

export function prepareFiveProjectDraft(s:FiveProjectSource,generatedAt:string){
 const audit=auditFiveProjectSource(s);if(audit.findings.length)throw new Error(`El escenario no concilia: ${JSON.stringify(audit.findings)}`);
 const blockers:Finding[]=[];const missing=(path:string,message:string)=>blockers.push({kind:"missing",path,message});
 const material=new Map(s.catalogo_materiales.map(m=>[m.id,m])),employee=new Map(s.empleados.map(e=>[e.id,e]));
 let ledger:Ledger={...structuredClone(EMPTY_LEDGER),financialMonthlyRatePct:s.tasa_financiera_mensual_porcentaje,
  rubroCatalog:s.rubros.map(name=>({id:rubro(name),name,active:true})),
  materialCatalog:s.catalogo_materiales.map(m=>({id:m.id,name:m.nombre,unit:m.unidad,referenceCost:m.precio_referencia_ars,active:true,validFrom:s.fecha_corte})),
  clients:s.clientes.map(c=>({id:c.id,name:c.nombre,active:true,createdAt:generatedAt})),suppliers:s.proveedores.map(v=>({id:v.id,name:v.nombre,active:true,createdAt:generatedAt})),
  staffCategories:s.categorias_no_operativas.map(c=>({id:c.id,name:c.nombre,category:"admin" as const,hourlyCost:c.costo_hora_ars,rates:[{validFrom:s.fecha_corte,hourlyCost:c.costo_hora_ars,by:actor,at:generatedAt}]}))};
 const categories=[{id:s.categoria_operativa.id,name:s.categoria_operativa.nombre,category:"labor" as const,kind:"operator" as const},...ledger.staffCategories!];
 missing("ledger.staffCategories/staff-operator/hourlyCost","Falta tarifa base de Operario. Las excepciones de 15.000 y 14.000 no definen una tarifa común.");
 const operators:Operator[]=s.empleados.map(e=>({id:e.id,name:e.nombre,role:e.categorias.map(id=>categories.find(c=>c.id===id)?.name??id).join(", "),hourlyCost:e.costo_hora_ars,active:true,productive:e.categorias.includes(s.categoria_operativa.id),enabledRubros:e.rubros.map(rubro),createdAt:generatedAt}));
 for(const e of s.empleados){missing(`personnel/${e.id}`,"Faltan jornada, días, vistas y acceso explícitos. No se asigna un permiso por el nombre de su categoría.");}
 const projects:DraftProject[]=s.proyectos.map(p=>{
  for(const field of ["startDate","dueDate","projectType","owner"])missing(`projects/${p.id}/${field}`,"No informado en el archivo lógico; no se usa una fecha real como si fuera planificación.");
  const items:DraftItem[]=p.muebles.map(i=>{
   const hours=new Map<RubroId,number>();i.lineas_cotizadas.filter(l=>l.tipo==="hora_operario"&&l.rubro).forEach(l=>hours.set(rubro(l.rubro!), (hours.get(rubro(l.rubro!))??0)+l.cantidad));
   for(const id of hours.keys())missing(`projects/${p.id}/items/${i.id}/${id}/workers`,"Las horas totales no informan cuántos operarios se solicitaron al cotizar.");
   missing(`projects/${p.id}/items/${i.id}/completedUnits`,"No se informó avance de unidades ni evento de terminación.");
   return {id:i.id,quotationKey:i.id,name:i.nombre,quantity:i.cantidad,rubros:[...hours].map(([rubro,hours])=>({rubro,hours}))};
  });
  const lines:BudgetLine[]=p.muebles.flatMap(i=>i.lineas_cotizadas.map((l,index)=>{
   const m=material.get(l.referencia);const category=l.tipo==="material"?"materials":l.tipo==="hora_operario"?"labor":"admin";
   return {...makeBudgetLine({category,description:m?.nombre??`${categories.find(c=>c.id===l.referencia)?.name??l.referencia} · ${l.tipo}`,materialId:l.tipo==="material"?l.referencia:undefined,quantity:l.cantidad,unit:m?.unidad??"h",unitCost:l.costo_unitario_ars,rubro:l.rubro?rubro(l.rubro):undefined,quotationItemId:i.id,quotationItemKey:i.id,quotationItem:`${i.nombre} × ${i.cantidad}`,hourRateId:l.tipo==="material"?undefined:l.referencia}),id:`quote-${i.id}-${index+1}`};
  }));
  const status=p.estado==="Cotización"?"quotation":p.estado==="Aprobado"?"approved":p.estado==="Compras"?"purchasing":p.estado==="Producción"?"production":"completed";
  const draft:DraftProject={id:p.id,code:p.id,name:p.nombre,client:s.clientes.find(c=>c.id===p.cliente_id)!.nombre,description:p.notas,status,createdAt:generatedAt,updatedAt:generatedAt,salesPrice:p.precio_venta_aprobado_ars??p.precio_ofertado_ars,budgetLines:lines,actualEntries:[],materialUsages:[],purchaseEntries:[],items,activity:[],assignedOperatorIds:[],stageLogs:[],attachments:[],isClosed:status==="completed",closedAt:p.fecha_cierre_validado?at(p.fecha_cierre_validado):undefined,procurementNotifiedAt:p.fecha_bom_publicado?at(p.fecha_bom_publicado):undefined};
  if(p.fecha_aprobacion)draft.baseline={capturedAt:at(p.fecha_aprobacion),capturedBy:actor,salesPrice:draft.salesPrice,budgetTotal:p.costo_cotizado_ars,lines:structuredClone(lines),items:structuredClone(items)};
  if(p.fecha_inicio_decidido_planta)draft.productionDecision={date:p.fecha_inicio_decidido_planta,reason:"Fecha de inicio decidido informada por el escenario",by:actor,at:generatedAt};
  if(p.bom_estado!=="no_aplica")for(const item of items)ledger.boms.push({id:`bom-${item.id}-v1`,projectId:p.id,itemId:item.id,version:1,status:p.bom_estado==="publicado"?"published":"draft",lines:quotedMaterialsOf({budgetLines:lines},item.name,item.id),createdAt:generatedAt,createdBy:actor,publishedAt:p.fecha_bom_publicado?at(p.fecha_bom_publicado):undefined});
  return draft;
 });
 const orders:PurchaseOrder[]=s.ordenes_compra.map(o=>{
  const p=projects.find(p=>p.id===o.proyecto_id)!,m=material.get(o.material_id)!;const matches=p.budgetLines.filter(l=>l.materialId===o.material_id&&l.unit===o.unidad);if(matches.length!==1)throw new Error(`${o.id}: necesidad ambigua, no se asigna por nombre.`);
  return {id:o.id,number:o.id,date:o.fecha_envio_proveedor,supplier:s.proveedores.find(v=>v.id===o.proveedor_id)!.nombre,status:"sent",received:"no",paid:false,createdAt:generatedAt,createdBy:actor,lines:[{id:`line-${o.id}`,projectId:p.id,budgetLineId:matches[0].id,materialId:m.id,materialName:m.nombre,quantity:o.cantidad_pedida,unit:o.unidad,unitCost:o.precio_unitario_ars,receivedQuantity:0}]};
 });
 let stock:StockState=structuredClone(EMPTY_STOCK);
 const origins:Array<{lotId:string;orderId:string;lineId:string;date:string}>=[];
 for(const o of s.ordenes_compra.filter(o=>o.cantidad_recibida>0)){
  const index=orders.findIndex(n=>n.id===o.id);const receipt=receiveOrder(orders[index],[{lineId:orders[index].lines[0].id,quantity:o.cantidad_recibida}],projects,{actor,now:at(o.fecha_recepcion!),today:o.fecha_recepcion!});
  const lotId=`lot-${o.id}`;stock=applyChange(stock,{lots:receipt.change.lots.map(l=>({...l,id:lotId,notes:`Origen ${o.id}, línea line-${o.id}. Adaptación técnica.`})),movements:receipt.change.movements.map((m,index)=>({...m,id:`receipt-${o.id}-${index+1}`,lotId}))});orders[index]=receipt.order;origins.push({lotId,orderId:o.id,lineId:orders[index].lines[0].id,date:o.fecha_recepcion!});
  const p=projects.find(p=>p.id===o.proyecto_id)!;if(p.status==="purchasing"){p.status="production";blockers.push({kind:"workflow",path:`projects/${p.id}/status`,message:"La recepción activa Producción en Blerp. Mantener Compras requiere una vuelta autorizada y documentada de Planta, que no fue suministrada."});}
 }
 for(const u of s.consumos_y_desperdicios){
  const p=projects.find(p=>p.id===u.proyecto_id)!,m=material.get(u.material_id)!;const use=consumeMaterial(stock,{projectId:p.id,itemId:u.mueble_id,materialId:m.id,lotId:`lot-${u.oc_id}`,date:u.fecha,consumed:u.cantidad_consumida,waste:u.cantidad_desperdiciada},{actor,now:at(u.fecha)});stock=applyChange(stock,{lots:use.lots,movements:use.movements.map((m,index)=>({...m,id:`${u.id}-movement-${index+1}`}))});
  p.materialUsages.push({id:u.id,projectId:p.id,itemId:u.mueble_id,materialId:m.id,materialName:m.nombre,date:u.fecha,quantityConsumed:u.cantidad_consumida,wasteQuantity:u.cantidad_desperdiciada,reusableLeftoverQuantity:0,unit:m.unidad,unitCost:u.costo_unitario_origen_ars,unitCostOrigin:"purchase",source:"purchased_for_project",lotId:`lot-${u.oc_id}`,createdAt:generatedAt,createdBy:actor});
 }
 for(const h of s.horas_reales){
  const p=projects.find(p=>p.id===h.proyecto_id)!,e=employee.get(h.empleado_id)!;
  if(h.rubro)p.actualEntries.push({id:h.id,projectId:p.id,itemId:h.mueble_id,operatorId:e.id,categoryId:h.categoria_id,date:h.fecha,category:"labor",type:"labor",description:`${h.rubro} · referencia ${h.id}`,amount:h.costo_total_ars,rubro:rubro(h.rubro),labor:{role:e.categorias.map(id=>categories.find(c=>c.id===id)?.name??id).join(", "),workerName:e.nombre,hours:h.horas_reales,hourlyCost:h.costo_hora_historico_ars},createdBy:actor,createdAt:generatedAt});
  else {ledger=registerInternalHours(ledger,{employeeId:e.id,projectId:p.id,date:h.fecha,hours:h.horas_reales,hourlyCost:h.costo_hora_historico_ars,task:`Trabajo no operativo; referencia ${h.id}`},{actor,now:generatedAt});ledger.internalHours[ledger.internalHours.length-1]={...ledger.internalHours.at(-1)!,id:h.id,categoryId:h.categoria_id,itemId:h.mueble_id};}
 }
 ledger.salesInvoices=s.facturas_emitidas.map(i=>({id:i.id,projectId:i.proyecto_id,number:i.id,date:i.fecha,dueDate:i.vencimiento,amount:i.importe_ars,notes:"Referencia de factura del escenario; no informa número fiscal ni hito.",createdBy:actor,createdAt:generatedAt}));
 ledger.collections=s.cobros_efectivos.map(c=>({id:c.id,projectId:c.proyecto_id,invoiceId:c.factura_id,date:c.fecha_efectiva,amount:c.importe_ars,notes:`Referencia del escenario: ${c.id}`,createdBy:actor,createdAt:generatedAt}));
 ledger.paymentRequests=s.solicitudes_pago_proveedores.map(r=>({id:r.id,orderId:r.oc_id,amount:r.importe_solicitado_ars,date:r.fecha_solicitud,reason:"Motivo no informado; referencia del escenario "+r.id,by:actor,at:generatedAt}));
 ledger.supplierPayments=s.pagos_efectivos_proveedores.map(p=>({id:p.id,orderId:p.oc_id,paymentRequestId:p.solicitud_id,date:p.fecha_debito_efectiva,amount:p.importe_ars,reference:`Referencia del escenario ${p.id}; sin comprobante bancario informado`,by:actor,at:generatedAt}));
 for(const p of s.proyectos.filter(p=>p.fecha_cierre_validado))missing(`projects/${p.id}/closure`,"La declaración de cierre no aporta entrega real, unidades terminadas, revisión de horas ni facturas de proveedor de las OC enviadas. No se fabrica validación nativa ni ganancia final.");
 for(const r of s.solicitudes_pago_proveedores)missing(`paymentRequests/${r.id}/reason`,"No se informó motivo comercial de la solicitud; el borrador conserva la referencia y lo señala.");
 missing("costSettings","Faltan jornada general, multiplicador y configuración de valoración para operaciones futuras. No se siembran parámetros de otra demo.");
 const comparisons=projects.map(p=>({id:p.id,nativeRecordedCost:round(actualCostToDate(p)+staffHoursCost(ledger,p.id)),sourceCost:audit.projects.find(row=>row.id===p.id)!.cost}));
 for(const c of comparisons)if(c.nativeRecordedCost!==c.sourceCost)throw new Error(`No concilia el costo nativo de ${c.id}`);
 if(round(stockTotalValue(stock))!==audit.totals.held)throw new Error("No concilia el inventario nativo.");
 const [from,to]=s.periodo.split("/");if(cashInPeriod(ledger,from,to).result!==audit.totals.cash)throw new Error("No concilia la caja nativa.");
 return {kind:"blerp-native-draft" as const,canImport:false,generatedAt,sourceCutoff:s.fecha_corte,blockers,audit,comparisons,provenance:{actor,eventPrecision:"Día; 00:00 -03 es una convención de codificación, no una hora observada.",materialOrigins:origins,notes:["Las categorías no operativas nuevas usan clasificación interna genérica admin; no son horas de producción.","Las 2 h de Diseño van a internalHours del proyecto, no se duplican en actualEntries.","No se agregan asignaciones, devoluciones, transferencias, hitos, permisos ni cierres no aportados."]},nativeData:{projects,operators,orders,stock,ledger:{...ledger,staffCategories:categories},assignments:[],dayExceptions:[],deliveries:[],requests:[],resolvedAlertIds:[],reviewedHoursKeys:[],priceHistory:[],corrections:[],hourRates:[]}};
}
