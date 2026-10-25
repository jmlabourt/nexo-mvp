import { StockPage } from "@/components/stock/stock-page";
import { StockDemoBySession } from "@/components/demo/stock-page";
import { DemoOr } from "@/components/demo/switch";

export default async function Page({ searchParams }: PageProps<"/stock">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <DemoOr demo={<StockDemoBySession />} real={<StockPage material={one(sp.material)} lot={one(sp.lot)} tab={one(sp.tab)} />} />;
}
