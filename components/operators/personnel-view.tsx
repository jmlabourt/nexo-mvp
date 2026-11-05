"use client";
import type { Operator } from "@/types";
import { personnelViews } from "@/lib/personnel";
import { SESSION_LABELS } from "@/lib/permissions";
import { useAppStore } from "@/store/use-app-store";
import { EmployeeForm } from "./employee-form";
export function PersonnelView({ employee }: { employee:Operator }) {
 const saved=useAppStore((s)=>s.ledger.personnel?.find((p)=>p.employeeId===employee.id));
 const local=useAppStore((s)=>s.demoLocal);
 if(!local) return <span>Configuración de acceso pendiente de backend</span>;
 return <details><summary className="cursor-pointer">{saved?.enabled ? personnelViews(saved).map((v)=>SESSION_LABELS[v]).join(" · ") : "Sin acceso habilitado"}</summary><EmployeeForm employee={employee} /></details>;
}
