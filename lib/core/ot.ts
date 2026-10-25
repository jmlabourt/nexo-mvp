// Nomenclador de OT: prefijo + correlativo y, si se eligen, cliente y descripción. El número es único, lo asigna
// el sistema (último usado + 1), no se reutiliza al borrar y la OT no cambia aunque cambie el nombre comercial.
import type { CoreConfig } from "./types";

const CONNECTORS = new Set(["y", "e", "de", "del", "la", "las", "el", "los", "para", "con", "en", "a"]);

/** "Café Brújula" → "CafeBrujula": sin tildes, símbolos ni conectores, palabras enteras hasta `max` caracteres. */
export function otSlug(s: string, max = 18): string {
  const words = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !CONNECTORS.has(w.toLowerCase()))
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  let out = "";
  for (const w of words) {
    if (out && out.length + w.length > max) break;
    out += w;
  }
  return out.slice(0, max);
}

export function formatOt(cfg: CoreConfig["ot"], number: number, client: string, description: string): string {
  return cfg.parts
    .map((part) => (part === "number" ? `${cfg.prefix}${number}` : part === "client" ? otSlug(client, 18) : otSlug(description, 22)))
    .filter(Boolean)
    .join("_");
}
