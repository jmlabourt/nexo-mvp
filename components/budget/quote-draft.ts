// Cotización en curso: se arma en el Cotizador y se lleva al asistente de "Nuevo proyecto".
// Vive solo en memoria (navegación interna); si se recarga la página, se arma de nuevo.
import type { CalcState } from "./calculator-state";

export interface QuoteDraft {
  state: CalcState;
  projectType: string;
  startDate: string;
  dueDate: string;
  salesPrice: number;
  /** Cómo se abre el presupuesto en el asistente: calculadora o carga manual (editar línea por línea). */
  mode: "calculator" | "manual";
}

let draft: QuoteDraft | null = null;

export const setQuoteDraft = (d: QuoteDraft) => {
  draft = d;
};
export const peekQuoteDraft = () => draft;
export const clearQuoteDraft = () => {
  draft = null;
};
