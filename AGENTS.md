<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Reglas permanentes de trabajo para Codex

1. Antes de cualquier modificación del proyecto, leer y respetar íntegramente `BLERP_REGLAS_NEGOCIO.md`.
2. Mantener separadas las instrucciones técnicas del framework y las reglas funcionales del negocio; el bloque de Next.js es obligatorio y técnico, mientras que las reglas de negocio son la fuente de verdad funcional.
3. No anular ni reescribir las decisiones de negocio documentadas en `BLERP_REGLAS_NEGOCIO.md` por conveniencia técnica o por suposiciones del código actual.
4. Si un cambio solicitado entra en conflicto con la lógica de negocio documentada, detenerse y consultar antes de continuar.
5. No modificar ni suprimir el contenido funcional de `BLERP_REGLAS_NEGOCIO.md` al servicio del código o de una implementación parcial.
