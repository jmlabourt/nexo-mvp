import type { Attachment, StageKey } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { createId } from "@/lib/activity";

export const ATTACHMENT_BUCKET = "project-files";
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

const safeName = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_");

export interface UploadScope {
  organizationId: string | null;
  projectId: string;
  itemId?: string;
  stage?: StageKey;
  stageLogId?: string;
  uploadedBy: string;
}

/** Sube un archivo a Supabase Storage y devuelve el registro para guardar en el proyecto. */
export async function uploadAttachment(file: File, scope: UploadScope): Promise<Attachment> {
  if (!scope.organizationId) throw new Error("Hace falta iniciar sesión para adjuntar archivos.");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("El archivo supera los 15 MB.");
  const id = createId("att");
  const path = `${scope.organizationId}/${scope.projectId}/${id}-${safeName(file.name)}`;
  const { error } = await createClient().storage.from(ATTACHMENT_BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
  return {
    id,
    projectId: scope.projectId,
    ...(scope.itemId ? { itemId: scope.itemId } : {}),
    ...(scope.stage ? { stage: scope.stage } : {}),
    ...(scope.stageLogId ? { stageLogId: scope.stageLogId } : {}),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    storagePath: path,
    uploadedBy: scope.uploadedBy,
    uploadedAt: new Date().toISOString(),
  };
}

export async function attachmentUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await createClient().storage.from(ATTACHMENT_BUCKET).createSignedUrl(storagePath, 3600);
  return error ? null : data.signedUrl;
}
