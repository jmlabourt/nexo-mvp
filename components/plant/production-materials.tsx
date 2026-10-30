"use client";
import type { Project, RubroId } from "@/types";
import { MATERIAL_CATALOG } from "@/lib/constants";
import { publishedBom } from "@/lib/ledger";
import { useAppStore } from "@/store/use-app-store";
import { useToday } from "@/store/selectors";
import { formatNumber } from "@/lib/formatting";

/** Quantities are grouped only by a known material/rubro mapping; never mix incompatible units. */
export function ProductionMaterials({ project, itemId, rubro }: { project: Project; itemId: string; rubro?: RubroId }) {
  const ledger = useAppStore((s) => s.ledger);
  const today = useToday();
  const bom = publishedBom(ledger, project.id, itemId);
  const usages = project.materialUsages.filter((u) => u.itemId === itemId && u.date <= today);
  const materialRubro = (id?: string) => MATERIAL_CATALOG.find((m) => m.id === id)?.rubro ?? project.budgetLines.find((l) => l.materialId === id && id)?.rubro;
  const rows = [...new Map([...(bom?.lines ?? []).map((l) => ({ id: l.materialId ?? l.material, name: l.material, unit: l.unit, materialId: l.materialId })), ...usages.map((u) => ({ id: u.materialId, name: u.materialName, unit: u.unit, materialId: u.materialId }))].map((r) => [`${r.id}|${r.unit}`, r])).values()].filter((r) => materialRubro(r.materialId) === rubro);
  if (!rows.length) return null;
  return <div className="overflow-x-auto rounded border border-slate-100 mt-2"><table className="w-full text-xs"><caption className="text-left p-2 font-medium">Materiales · {bom ? `BOM publicado v${bom.version}` : "Sin BOM publicado"}{!rubro && " · Sin rubro identificado"}</caption><thead><tr className="text-left"><th className="p-2">Material</th><th>Previsto BOM</th><th>Consumido hasta hoy</th><th>Consumido hoy</th><th>Desperdicio hoy</th><th>Sobrante hoy</th></tr></thead><tbody>{rows.map((r) => {
    const match = (id: string | undefined, name: string, unit: string) => unit === r.unit && (r.materialId ? id === r.materialId : name === r.name);
    const all = usages.filter((u) => match(u.materialId,u.materialName,u.unit));
    const day = all.filter((u) => u.date === today);
    const planned = bom?.lines.filter((l) => match(l.materialId,l.material,l.unit)).reduce((s,l) => s+l.quantity,0);
    const qty = (v: number) => `${formatNumber(v)} ${r.unit}`;
    return <tr key={`${r.id}|${r.unit}`} className="border-t"><td className="p-2">{r.name}</td><td>{planned === undefined ? "Pendiente" : qty(planned)}</td><td>{all.length ? qty(all.reduce((s,u) => s+u.quantityConsumed,0)) : "Sin registro"}</td><td>{day.length ? qty(day.reduce((s,u) => s+u.quantityConsumed,0)) : "Sin registro"}</td><td>{day.length ? qty(day.reduce((s,u) => s+u.wasteQuantity,0)) : "Sin registro"}</td><td>{day.length ? qty(day.reduce((s,u) => s+u.reusableLeftoverQuantity,0)) : "Sin registro"}<details><summary>Acumulados</summary>Desperdicio: {qty(all.reduce((s,u) => s+u.wasteQuantity,0))} · Sobrante: {qty(all.reduce((s,u) => s+u.reusableLeftoverQuantity,0))}</details></td></tr>;
  })}</tbody></table></div>;
}
