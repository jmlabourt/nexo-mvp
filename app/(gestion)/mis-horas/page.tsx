import { MisHorasDemo } from "@/components/demo/mis-horas";
import { DemoOnly } from "@/components/demo/switch";

export default function Page() {
  return (
    <DemoOnly what="Registrar mis horas">
      <MisHorasDemo />
    </DemoOnly>
  );
}
