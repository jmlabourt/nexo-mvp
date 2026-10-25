import { QuotePage } from "@/components/quotes/quote-page";
import { CotizadorDemo } from "@/components/demo/admin/cotizador";
import { DemoOr } from "@/components/demo/switch";

export default async function Page({ searchParams }: PageProps<"/quotes">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <DemoOr demo={<CotizadorDemo key={`${one(sp.ot)}${one(sp.nuevo)}`} id={one(sp.ot)} nuevo={one(sp.nuevo) === "1"} />} real={<QuotePage />} />;
}
