"use client";
import Link from "next/link";
import { Layers } from "lucide-react";
import { poolTotalValue } from "@/lib/reusable-pool";
import { formatCurrency, formatDate, formatNumber } from "@/lib/formatting";
import { useAppStore } from "@/store/use-app-store";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";

/** Vista secundaria y simple: NO es un módulo de stock. */
export function LeftoversPage() {
  const pool = useAppStore((s) => s.reusableMaterials);
  const sorted = [...pool].sort((a, b) => a.materialName.localeCompare(b.materialName) || b.createdAt.localeCompare(a.createdAt));
  return (
    <div>
      <PageHeader
        title="Material reutilizable disponible"
        subtitle="Sobrantes registrados al cerrar consumos. Cuando otro proyecto los usa como “Sobrante reutilizado”, se descuentan de acá y su valor se imputa a ese proyecto."
      />
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Valor estimado total: <strong className="tabular text-slate-900">{formatCurrency(poolTotalValue(pool))}</strong>
        <span className="text-slate-400"> · valorizado al costo del proyecto de origen. No es un inventario completo.</span>
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon={Layers} title="No hay sobrantes disponibles" />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Material</TH>
                <TH className="text-right">Cantidad</TH>
                <TH>Unidad</TH>
                <TH>Origen</TH>
                <TH>Registrado</TH>
                <TH className="text-right">Valor estimado</TH>
              </TR>
            </THead>
            <TBody>
              {sorted.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium text-slate-900">{r.materialName}</TD>
                  <TD className="text-right tabular">{formatNumber(r.quantity)}</TD>
                  <TD>{r.unit}</TD>
                  <TD>
                    <Link href={`/projects/${r.originProjectId}`} className="text-blue-700 hover:underline">{r.originProjectName}</Link>
                  </TD>
                  <TD className="tabular">{formatDate(r.createdAt)}</TD>
                  <TD className="text-right tabular">{formatCurrency(r.quantity * r.unitCost)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
