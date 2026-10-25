import { AclaracionesDemo } from "@/components/demo/aclaraciones";
import { DemoOnly } from "@/components/demo/switch";

export default function Page() {
  return (
    <DemoOnly what="Aclaraciones del sistema">
      <AclaracionesDemo />
    </DemoOnly>
  );
}
