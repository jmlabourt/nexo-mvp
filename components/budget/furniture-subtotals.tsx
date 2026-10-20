"use client";
// Subtotal por mueble de la cotización: costo directo (mano de obra + rubros del mueble), costos compartidos y el precio
// de venta repartido en proporción al costo directo. Es la misma cotización agrupada de otra forma: el total no cambia.
import { formatCurrency, formatCurrencyOrDash, formatNumber } from "@/lib/formatting";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Section } from "./fields";
import { furnitureSubtotals, type CalcState, type CalculatorResult } from "./calculator-state";

export function FurnitureSubtotalsTable({ state, result, salesPrice }: { state: CalcState; result: CalculatorResult; salesPrice: number }) {
  const { rows, shared, total } = furnitureSubtotals(state, result, salesPrice);
  if (rows.length === 0) return null;
  return (
    <Section
      title="Subtotal por mueble"
      help={
        <>
          <span className="block">Costo directo = mano de obra del mueble + materiales, diseño y administración de los rubros asignados a ese mueble.</span>
          <span className="block">
            Los costos compartidos (rubros generales, márgenes de seguridad y gasto financiero) no se reparten en el costo: el precio de venta se reparte entre los
            muebles en proporción a su costo directo, y la suma da el precio total.
          </span>
        </>
      }
    >
      <Table>
        <THead>
          <TR>
            <TH>Mueble</TH>
            <TH className="text-right">Cantidad</TH>
            <TH className="text-right">Costo directo</TH>
            <TH className="text-right">Precio asignado</TH>
            <TH className="text-right">Precio unitario</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r, i) => (
            <TR key={r.key}>
              <TD className="font-medium text-slate-900">{r.name || `Mueble ${i + 1}`}</TD>
              <TD className="text-right tabular">{formatNumber(r.quantity)}</TD>
              <TD className="text-right tabular">{formatCurrency(r.direct)}</TD>
              <TD className="text-right tabular">{formatCurrencyOrDash(r.price)}</TD>
              <TD className="text-right tabular">{formatCurrencyOrDash(r.unitPrice)}</TD>
            </TR>
          ))}
          <TR>
            <TD className="text-slate-600">Costos compartidos</TD>
            <TD />
            <TD className="text-right tabular text-slate-600">{formatCurrency(shared)}</TD>
            <TD className="text-xs text-slate-500" colSpan={2}>Incluidos en el precio de cada mueble</TD>
          </TR>
          <TR className="font-semibold">
            <TD>Total</TD>
            <TD />
            <TD className="text-right tabular">{formatCurrency(total)}</TD>
            <TD className="text-right tabular">{salesPrice > 0 ? formatCurrency(salesPrice) : "Sin precio"}</TD>
            <TD />
          </TR>
        </TBody>
      </Table>
    </Section>
  );
}
