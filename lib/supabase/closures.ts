// ─────────────────────────────────────────────────────────────
// Historial para estimar (y para un LLM): cierres congelados, curaduría de atípicos y predicciones guardadas.
// Todo lo calcula la app (lib/closure-snapshot.ts); acá solo se lee y se escribe. Las reglas de seguridad viven en la base.
// ─────────────────────────────────────────────────────────────
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/types";
import { buildClosureSnapshot, type ClosureSnapshot } from "@/lib/closure-snapshot";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Guarda el cierre congelado. Devuelve false si ya estaba guardado (es idempotente). */
export async function recordClosure(db: SupabaseClient, snapshot: ClosureSnapshot): Promise<boolean> {
  return check(await db.rpc("admin_record_closure", { p: snapshot })) as boolean;
}

/**
 * Guarda el cierre de los proyectos finalizados que todavía no lo tienen (proyectos cerrados antes de existir esta función).
 * Nunca lanza: si algo falla se reintenta en la próxima carga, y el cierre del proyecto en sí no se ve afectado.
 */
export async function backfillClosures(db: SupabaseClient, projects: Project[]): Promise<number> {
  try {
    const closed = projects.filter((p) => p.isClosed && p.status === "completed");
    if (closed.length === 0) return 0;
    const have = new Set((check(await db.from("project_closures").select("project_id")) as { project_id: string }[]).map((r) => r.project_id));
    let saved = 0;
    for (const p of closed) {
      if (have.has(p.id)) continue;
      if (await recordClosure(db, buildClosureSnapshot(p))) saved += 1;
    }
    return saved;
  } catch (e) {
    console.warn("No se pudo completar el historial de cierres:", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Proyecto parecido que devuelve admin_similar_closures (las cifras ya vienen congeladas). */
export interface SimilarClosure {
  project_id: string;
  code: string;
  name: string;
  project_type: string;
  client_name: string | null;
  closed_at: string;
  data_origin: "app" | "imported" | "demo";
  sales_price: number;
  budget_total: number;
  final_cost: number;
  expected_margin: number | null;
  final_margin: number | null;
  margin_delta_points: number | null;
  planned_days: number | null;
  actual_days: number | null;
  budget_by_category: Record<string, number>;
  actual_by_category: Record<string, number>;
  main_deviation_category: string | null;
  main_deviation_amount: number | null;
  summary_text: string;
}

export interface SimilarClosures {
  project_type: string | null;
  includes_demo: boolean;
  /** Todos los que cumplen (no solo los devueltos): es el "N" que hay que mostrar. */
  sample_size: number;
  returned: number;
  items: SimilarClosure[];
}

export async function similarClosures(
  db: SupabaseClient,
  opts: { projectType?: string | null; limit?: number; includeDemo?: boolean } = {},
): Promise<SimilarClosures> {
  return check(
    await db.rpc("admin_similar_closures", {
      p_project_type: opts.projectType ?? null,
      p_limit: opts.limit ?? 10,
      p_include_demo: opts.includeDemo ?? false,
    }),
  ) as SimilarClosures;
}

/** Excluye (o vuelve a incluir) un proyecto cerrado del aprendizaje. Para excluir hace falta un motivo. */
export async function reviewClosure(db: SupabaseClient, org: string, projectId: string, input: { excluded: boolean; reason?: string }) {
  if (input.excluded && (input.reason ?? "").trim().length < 3) throw new Error("Contá brevemente por qué se excluye del aprendizaje.");
  check(
    await db
      .from("closure_reviews")
      .upsert({ organization_id: org, project_id: projectId, excluded: input.excluded, reason: input.excluded ? input.reason!.trim() : null }, { onConflict: "organization_id,project_id" }),
  );
}

export interface PredictionInput {
  id: string;
  projectId?: string;
  kind: "statistics" | "neural_network" | "llm";
  modelName: string;
  modelVersion: string;
  /** Lo que se le dio al modelo (tipo de proyecto, productos, etc.). */
  input: Record<string, unknown>;
  /** Rango estimado, no un solo número: {margin_low, margin_median, margin_high, notes}. */
  output: Record<string, unknown>;
  comparableProjectIds: string[];
  basedOnDemo: boolean;
}

/** Guarda una estimación con su versión, entradas y comparables. Historial: no se edita ni se borra. */
export async function savePrediction(db: SupabaseClient, org: string, userId: string, p: PredictionInput) {
  check(
    await db.from("model_predictions").insert({
      organization_id: org,
      id: p.id,
      project_id: p.projectId ?? null,
      kind: p.kind,
      model_name: p.modelName,
      model_version: p.modelVersion,
      input: p.input,
      output: p.output,
      comparable_project_ids: p.comparableProjectIds,
      sample_size: p.comparableProjectIds.length,
      based_on_demo: p.basedOnDemo,
      created_by: userId,
    }),
  );
}
