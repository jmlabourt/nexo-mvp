import { redirect } from "next/navigation";

// "Mi día" del operario es solo horas: pedir material y avisar problemas lo hace el Jefe de planta.
export default function Page() {
  redirect("/taller");
}
