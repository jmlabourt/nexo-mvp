import { StockPage } from "@/components/stock/stock-page";
import { StockDemo } from "@/components/demo/compras/pages";
import { DemoOr } from "@/components/demo/switch";

export default async function Page({ searchParams }: PageProps<"/compras/stock">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <DemoOr demo={<StockDemo withCosts canAssign />} real={<StockPage material={one(sp.material)} lot={one(sp.lot)} tab={one(sp.tab)} basePath="/compras/stock" />} />;
}
