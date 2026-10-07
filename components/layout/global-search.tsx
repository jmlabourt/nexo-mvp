"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { buildSearchIndex, searchAll, SEARCH_KIND_LABELS } from "@/lib/search";
import { useAppStore } from "@/store/use-app-store";

/** Buscador global tipado: cada resultado abre el elemento exacto. */
export function GlobalSearch() {
  const router = useRouter();
  const projects = useAppStore((s) => s.projects);
  const stock = useAppStore((s) => s.stock);
  const operators = useAppStore((s) => s.operators);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  const index = useMemo(() => buildSearchIndex({ projects, stock, operators }), [projects, stock, operators]);
  const results = useMemo(() => searchAll(index, q), [index, q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[active];
      if (r) go(r.href);
    } else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={box} role="search" className="relative ml-auto w-full max-w-sm flex-1">
      <label htmlFor="global-search" className="sr-only">Buscar proyecto, material, stock, sobrante, operario o compra</label>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        id="global-search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Buscar proyecto, material, operario…"
        className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm placeholder:text-slate-400 focus:bg-white"
      />
      {open && q.trim().length >= 2 && (
        <ul id={listId} role="listbox" className="absolute right-0 top-11 z-50 max-h-96 w-[min(28rem,92vw)] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">Sin resultados para “{q.trim()}”.</li>
          ) : (
            results.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.href)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? "bg-blue-50" : ""}`}
                >
                  <span className="w-16 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    {SEARCH_KIND_LABELS[r.kind]}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">{r.title}</span>
                    <span className="block truncate text-xs text-slate-500">{r.subtitle}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
