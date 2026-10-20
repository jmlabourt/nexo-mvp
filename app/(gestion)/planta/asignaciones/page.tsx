import { redirect } from "next/navigation";

// Las asignaciones ya no son una pestaña aparte: están dentro de Operarios.
export default function Page() {
  redirect("/planta/operarios");
}
