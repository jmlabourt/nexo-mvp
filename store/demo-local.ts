// ─────────────────────────────────────────────────────────────
// Modo demostración con guardado en este navegador.
// Es un adaptador de datos del frontend: la demo lee y escribe un único estado compartido entre las cinco sesiones y
// lo guarda en localStorage con un espacio de nombres y una versión de esquema propios. No toca la base ni las cuentas
// reales: solo se usa cuando el usuario abrió el modo demostración, y al salir la app vuelve a cargar su empresa real.
// La futura conexión de este mismo estado a la base es tarea del equipo de backend (PENDIENTES_BACKEND.md).
// ─────────────────────────────────────────────────────────────

export const DEMO_DATA_KEY = "blerp-demo:datos";
export const DEMO_ACTIVE_KEY = "blerp-demo:activa";
export const DEMO_BACKUP_KEY_PREFIX = "blerp-demo:backup:";
/** Subir este número cuando cambie la forma de los datos guardados: una copia vieja se descarta y se restaura el fixture. */
export const DEMO_SCHEMA_VERSION = 2;
export const DEMO_SCENARIO_KIND = "demo-scenario";

/** Lo que se guarda: los datos de la demo, sin identidad de usuario ni estado de sincronización. */
export type DemoData = Record<string, unknown>;

export interface DemoSnapshot {
  version: number;
  savedAt: string;
  data: DemoData;
}

export interface DemoScenarioFile {
  kind: typeof DEMO_SCENARIO_KIND;
  version: number;
  savedAt: string;
  name: string;
  data: DemoData;
  source?: {
    host?: string;
    url?: string;
  };
}

/** Almacenamiento mínimo (localStorage en el navegador; un objeto en memoria en los tests). */
export interface DemoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage si existe y funciona (puede estar bloqueado en modo privado); si no, nada. */
export function browserStorage(): DemoStorage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const probe = "blerp-demo:prueba";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isDemoActive(storage: DemoStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(DEMO_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoActive(on: boolean, storage: DemoStorage | null = browserStorage()): void {
  try {
    if (on) storage?.setItem(DEMO_ACTIVE_KEY, "1");
    else storage?.removeItem(DEMO_ACTIVE_KEY);
  } catch {
    // Sin almacenamiento la demo funciona igual, pero no sobrevive a la recarga.
  }
}

/** Datos guardados de la demo, o null si no hay, están dañados o son de otra versión del esquema. */
export function readDemo(storage: DemoStorage | null = browserStorage()): DemoData | null {
  try {
    const raw = storage?.getItem(DEMO_DATA_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as Partial<DemoSnapshot>;
    if (snap.version !== DEMO_SCHEMA_VERSION || !snap.data || typeof snap.data !== "object") return null;
    return snap.data;
  } catch {
    return null;
  }
}

/** Guarda los datos de la demo. Devuelve false si el navegador no lo permite (por ejemplo, sin espacio). */
export function writeDemo(data: DemoData, storage: DemoStorage | null = browserStorage(), now = new Date().toISOString()): boolean {
  try {
    if (!storage) return false;
    const snap: DemoSnapshot = { version: DEMO_SCHEMA_VERSION, savedAt: now, data };
    storage.setItem(DEMO_DATA_KEY, JSON.stringify(snap));
    return true;
  } catch {
    return false;
  }
}

export function clearDemo(storage: DemoStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(DEMO_DATA_KEY);
  } catch {
    // nada que borrar
  }
}

export function formatDemoScenarioName(name?: string): string {
  const cleaned = (name ?? "demo-scenario").trim().toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "demo-scenario";
}

export function createDemoScenario(data: DemoData, name = "demo-scenario", now = new Date().toISOString(), origin?: string): DemoScenarioFile {
  return {
    kind: DEMO_SCENARIO_KIND,
    version: DEMO_SCHEMA_VERSION,
    savedAt: now,
    name: name || "demo-scenario",
    data,
    source: origin ? { host: origin } : undefined,
  };
}

export function validateDemoScenario(value: unknown): DemoScenarioFile | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DemoScenarioFile> & Record<string, unknown>;
  if (candidate.kind !== DEMO_SCENARIO_KIND) return null;
  if (candidate.version !== DEMO_SCHEMA_VERSION) return null;
  if (typeof candidate.savedAt !== "string" || candidate.savedAt.length === 0) return null;
  if (typeof candidate.name !== "string" || candidate.name.length === 0) return null;
  if (!candidate.data || typeof candidate.data !== "object") return null;
  const keys = Object.keys(candidate.data as Record<string, unknown>);
  if (keys.length === 0) return null;
  for (const field of DEMO_DATA_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(candidate.data, field)) return null;
  }
  return candidate as DemoScenarioFile;
}

export function parseDemoScenario(raw: string): DemoScenarioFile | null {
  try {
    return validateDemoScenario(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function downloadDemoScenario(scenario: DemoScenarioFile, filename = `blerp-demo-${formatDemoScenarioName(scenario.name)}.json`): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export function backupDemoScenario(storage: DemoStorage | null = browserStorage(), now = new Date().toISOString()): DemoScenarioFile | null {
  const data = readDemo(storage);
  if (!data) return null;
  const snapshot = createDemoScenario(data, `backup-${new Date(now).toISOString().replace(/[:.]/g, "-")}`, now, typeof window !== "undefined" ? window.location.origin : undefined);
  try {
    const key = `${DEMO_BACKUP_KEY_PREFIX}${Date.now()}`;
    storage?.setItem(key, JSON.stringify(snapshot));
    return snapshot;
  } catch {
    return null;
  }
}

export function restoreDemoScenario(scenario: DemoScenarioFile, storage: DemoStorage | null = browserStorage(), now = scenario.savedAt): boolean {
  const valid = validateDemoScenario(scenario);
  if (!valid || !storage) return false;
  return writeDemo(valid.data, storage, now);
}

/** Claves del estado que forman los datos de la demo (todo lo demás es sesión, identidad o interfaz). */
export const DEMO_DATA_FIELDS = [
  "projects",
  "assignments",
  "orders",
  "dayExceptions",
  "deliveries",
  "operators",
  "stock",
  "requests",
  "settings",
  "resolvedAlertIds",
  "reviewedHoursKeys",
  "costSettings",
  "hourRates",
  "priceHistory",
  "corrections",
  "ledger",
] as const;

/** Toma del estado solo los datos de la demo. */
export function pickDemoData(state: Record<string, unknown>): DemoData {
  return Object.fromEntries(DEMO_DATA_FIELDS.filter((k) => k in state).map((k) => [k, state[k]]));
}

/** ¿Cambió algún dato de la demo entre dos estados? (por referencia: el store reemplaza lo que cambia) */
export function demoDataChanged(next: Record<string, unknown>, prev: Record<string, unknown>): boolean {
  return DEMO_DATA_FIELDS.some((k) => next[k] !== prev[k]);
}
