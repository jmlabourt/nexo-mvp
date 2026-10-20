import { redirect } from "next/navigation";

// Los precios por proveedor están en Proveedores (el Cotizador de materiales ya no es una pestaña de Compras).
export default function Page() {
  redirect("/compras/proveedores");
}
