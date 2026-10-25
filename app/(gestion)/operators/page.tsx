import { OperatorsPage } from "@/components/operators/operators-page";
import { PersonalDemo } from "@/components/demo/gerencia/personal";
import { DemoOr } from "@/components/demo/switch";

export default async function Page({ searchParams }: PageProps<"/operators">) {
  const sp = await searchParams;
  const op = Array.isArray(sp.op) ? sp.op[0] : sp.op;
  return <DemoOr demo={<PersonalDemo />} real={<OperatorsPage op={op} />} />;
}
