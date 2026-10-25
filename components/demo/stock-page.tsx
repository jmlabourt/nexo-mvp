"use client";
// Stock compartido: Gerencia ve cantidades y costos reales; Administración, solo cantidades.
import { useIdentity } from "@/store/selectors";
import { StockDemo } from "./compras/pages";

export function StockDemoBySession() {
  const { session } = useIdentity();
  return session === "gerencia" ? <StockDemo withCosts canAssign={false} gerencia /> : <StockDemo withCosts={false} canAssign={false} />;
}
