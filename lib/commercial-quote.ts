import type { Project,PaymentTerms } from "@/types";
/** Lista comercial explícita. Nunca serializar el proyecto ni sus líneas internas para exportar. */
export interface CommercialQuote {
 title:string;client?:string;description?:string;items:Array<{name:string;quantity:number}>;
 price:number;deadline?:string;conditions?:string;
}
export function commercialQuoteOf(project:Project,terms?:PaymentTerms):CommercialQuote {
 const source=project.baseline;
 return {title:source?`${project.name} - Oferta aprobada`:project.name,client:project.client||undefined,description:project.description||undefined,
  items:(source?.items??project.items).map(i=>({name:i.name,quantity:i.quantity})),price:source?.salesPrice??project.salesPrice,
  deadline:(source?.dueDate??project.dueDate)?`Entrega prevista: ${source?.dueDate??project.dueDate}`:undefined,conditions:terms?`${source?"Condiciones de cobro vigentes registradas: ":""}${terms.schedule.length?terms.schedule.map(p=>`${p.date}: ${new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS"}).format(p.amount)}`).join("; "):`Pago a ${terms.daysAfterDelivery} días de la entrega`}`:undefined};
}
const safeText=(s:string)=>s.replace(/[\r\n\t]+/g," ").replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[^\x20-\xFF]/g,"-");
const literal=(s:string)=>safeText(s).replace(/([\\()])/g,"\\$1");
const wrap=(s:string,limit=76)=>{
 const out:string[]=[];let line="";
 for(const word of safeText(s).split(/\s+/).flatMap(w=>w.match(new RegExp(`.{1,${limit}}`,"g"))??[])){
  if((line+" "+word).length>limit&&line){out.push(line);line="";}
  line+=(line?" ":"")+word;
 }
 if(line)out.push(line);return out;
};
/** A4 commercial layout. Only the explicit commercial fields above reach these pages. */
export function commercialQuotePdf(quote:CommercialQuote):Uint8Array {
 if(!Number.isFinite(quote.price)||quote.price<=0)throw Error("Definí un precio comercial válido antes de descargar.");
 if(quote.items.some(i=>!i.name.trim()||!Number.isFinite(i.quantity)||i.quantity<=0))throw Error("Revisá nombres y cantidades comerciales.");
 const money=new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:2}).format(quote.price);
 const pages:string[][]=[];let commands:string[]=[],y=730;
 const text=(s:string,x:number,at:number,size=11,bold=false,color="0.12 0.16 0.23")=>commands.push(`BT /${bold?"F2":"F1"} ${size} Tf ${color} rg 1 0 0 1 ${x} ${at} Tm (${literal(s)}) Tj ET`);
 const rect=(x:number,at:number,w:number,h:number,color:string)=>commands.push(`${color} rg ${x} ${at} ${w} ${h} re f`);
 const newPage=()=>{if(commands.length)pages.push(commands);commands=[];y=730;rect(0,0,595,842,"1 1 1");rect(44,790,507,4,"0.11 0.29 0.71");text("COTIZACIÓN",44,757,23,true);};
 const room=(height:number)=>{if(y-height<72)newPage();};
 const paragraph=(value:string,bold=false)=>{for(const line of wrap(value)){room(17);text(line,44,y,11,bold);y-=17;}y-=8;};
 const heading=(value:string)=>{room(64);y-=9;text(value,44,y,11,true,"0.11 0.29 0.71");y-=24;};
 newPage();paragraph(quote.title,true);
 if(quote.client)paragraph(`Cliente: ${quote.client}`);
 if(quote.description)paragraph(quote.description);
 heading("MUEBLES Y CANTIDADES");
 for(const item of quote.items){const lines=wrap(item.name,62);room(24);rect(44,y-8,507,22,"0.96 0.97 0.98");text(`Cantidad: ${item.quantity}`,440,y,10);for(const line of lines){room(17);text(line,52,y);y-=17;}y-=9;}
 room(92);y-=8;rect(44,y-54,507,68,"0.93 0.96 1");text("Precio total (sin IVA)",58,y-5,11,true);text(money,58,y-33,22,true,"0.11 0.29 0.71");y-=82;
 if(quote.deadline||quote.conditions){heading("ENTREGA Y CONDICIONES");if(quote.deadline)paragraph(quote.deadline);if(quote.conditions)paragraph(`Condiciones: ${quote.conditions}`);}
 pages.push(commands);
 for(const [i,page] of pages.entries())page.push(`0.8 0.83 0.87 RG 44 54 m 551 54 l S`, `BT /F1 9 Tf 0.35 0.4 0.48 rg 1 0 0 1 44 37 Tm (Cotización - ${i+1} de ${pages.length}) Tj ET`);
 const objects:string[]=["<< /Type /Catalog /Pages 2 0 R >>","", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"];
 const ids:number[]=[];
 for(const page of pages){const id=objects.length+1,stream=page.join("\n");ids.push(id);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id+1} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);}
 objects[1]=`<< /Type /Pages /Kids [${ids.map(id=>`${id} 0 R`).join(" ")}] /Count ${ids.length} >>`;
 let pdf="%PDF-1.4\n";const offsets=[0];for(const [i,obj] of objects.entries()){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}
 const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Uint8Array.from(pdf,c=>c.charCodeAt(0));
}
export function downloadCommercialQuote(quote:CommercialQuote):void {
 const bytes=commercialQuotePdf(quote),url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"application/pdf"}));
 const a=document.createElement("a");a.href=url;a.download="cotizacion.pdf";a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/** Solo condiciones comerciales escritas; nunca exportar tasa/costo de financiación. */
export function quotedCommercialConditions(form?:{seniaPct:string;installments:string;daysAfterDelivery:string}):string|undefined {
 if(!form)return undefined;
 const fields:Array<[string,(n:number)=>string,number]>=[[form.seniaPct,n=>`Anticipo: ${n}%`,100],[form.installments,n=>`Cuotas: ${n}`,1000],[form.daysAfterDelivery,n=>`Pago a ${n} días después de la entrega`,10000]];
 const text=fields.flatMap(([raw,format,max])=>{const n=Number(raw.trim().replace(",","."));return raw.trim()&&Number.isFinite(n)&&n>=0&&n<=max?[format(n)]:[];}).join("; ");return text||undefined;
}
