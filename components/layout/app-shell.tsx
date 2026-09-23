"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, FolderKanban, History, LayoutDashboard, Layers, Menu, Plus, RotateCcw, Search, Settings, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME, APP_SUBTITLE, COMPANY_NAME, DEMO_USERS } from "@/lib/constants";
import { useAppStore } from "@/store/use-app-store";
import { useAlerts } from "@/store/selectors";
import { Button } from "@/components/ui/button";
import { ModeSwitch } from "./mode-switch";
import { WorkshopHome } from "@/components/workshop/workshop-home";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Proyectos", icon: FolderKanban },
  { href: "/alerts", label: "Alertas", icon: TriangleAlert },
  { href: "/history", label: "Historial", icon: History },
  { href: "/materials", label: "Sobrantes", icon: Layers },
  { href: "/settings", label: "Configuración", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function useBreadcrumb(): string[] {
  const pathname = usePathname();
  const projects = useAppStore((s) => s.projects);
  if (pathname === "/") return ["Dashboard"];
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: string[] = [];
  const root = NAV.find((n) => n.href === `/${parts[0]}`);
  crumbs.push(root?.label ?? parts[0]);
  if (parts[0] === "projects" && parts[1]) {
    if (parts[1] === "new") crumbs.push("Nuevo proyecto");
    else crumbs.push(projects.find((p) => p.id === parts[1])?.code ?? "Proyecto");
  }
  return crumbs;
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const resetDemo = useAppStore((s) => s.resetDemo);
  const { open } = useAlerts();
  const critical = open.filter((a) => a.level !== "info").length;
  const user = DEMO_USERS.management;

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <div className="text-lg font-semibold tracking-tight text-slate-900">{APP_NAME}</div>
        <div className="text-xs text-slate-500">{APP_SUBTITLE}</div>
      </div>
      <nav aria-label="Principal" className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                active ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
              {item.href === "/alerts" && critical > 0 && (
                <span className="ml-auto rounded-full bg-red-100 px-1.5 text-xs font-semibold text-red-700 tabular">{critical}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-3 border-t border-slate-200 p-4">
        <ModeSwitch />
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700" aria-hidden>
            {user.name.split(" ").map((w) => w[0]).join("")}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-900">{user.name}</div>
            <div className="truncate text-xs text-slate-500">
              {user.role} · {COMPANY_NAME}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-slate-500"
          onClick={() => {
            if (window.confirm("¿Restaurar los datos demo iniciales? Se perderán los registros cargados.")) resetDemo();
          }}
        >
          <RotateCcw /> Reset demo
        </Button>
      </div>
    </div>
  );
}

function Header({ onMenu }: { onMenu: () => void }) {
  const crumbs = useBreadcrumb();
  const router = useRouter();
  const [q, setQ] = useState("");
  const { open } = useAlerts();
  const count = open.filter((a) => a.level !== "info").length;
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Abrir menú">
        <Menu />
      </Button>
      <nav aria-label="Breadcrumb" className="hidden min-w-0 text-sm text-slate-500 sm:block">
        {crumbs.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-1.5 text-slate-300">/</span>}
            <span className={i === crumbs.length - 1 ? "font-medium text-slate-900" : undefined}>{c}</span>
          </span>
        ))}
      </nav>
      <form
        role="search"
        className="ml-auto flex max-w-xs flex-1 items-center"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/projects?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <label htmlFor="global-search" className="sr-only">
          Buscar proyecto, cliente o código
        </label>
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id="global-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar proyecto, cliente o código"
            className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm placeholder:text-slate-400 focus:bg-white"
          />
        </div>
      </form>
      <Link href="/alerts" className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label={`Alertas (${count} abiertas)`}>
        <Bell className="size-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white tabular">
            {count}
          </span>
        )}
      </Link>
      <Button asChild className="hidden sm:inline-flex">
        <Link href="/projects/new">
          <Plus /> Nuevo proyecto
        </Link>
      </Button>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const mode = useAppStore((s) => s.currentMode);
  const [menuOpen, setMenuOpen] = useState(false);

  if (mode === "workshop") return <WorkshopHome />;

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-slate-200 bg-white lg:block">
        <Sidebar />
      </aside>
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <Button variant="ghost" size="icon" className="absolute right-2 top-3" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú">
              <X />
            </Button>
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}
      <div className="min-w-0 lg:pl-60">
        <Header onMenu={() => setMenuOpen(true)} />
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
