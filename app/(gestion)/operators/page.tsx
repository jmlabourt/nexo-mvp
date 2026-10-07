import { OperatorsPage } from "@/components/operators/operators-page";

export default async function Page({ searchParams }: PageProps<"/operators">) {
  const sp = await searchParams;
  const op = Array.isArray(sp.op) ? sp.op[0] : sp.op;
  return <OperatorsPage op={op} />;
}
