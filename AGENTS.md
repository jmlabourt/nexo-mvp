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
6. Priorizar la **lógica de negocio y veracidad de los datos**: rastrear cada dato desde su registro de origen hasta los cálculos compartidos y las vistas que lo consumen. No crear importes, fechas, porcentajes, horas o estados sin fuente verificable ni maquillar inconsistencias con constantes o datos demo.
7. **Preservar la interfaz y los flujos existentes**; realizar únicamente el cambio funcional mínimo necesario. No quitar tarjetas, pantallas, funcionalidades o módulos ya implementados por obedecer descripciones históricas desactualizadas. Ante contradicciones materiales entre documentación y MVP actual, explicarlas y consultar.
8. En **Gerencia → Configuración → Indicadores y cálculos** debe estar documentado **todo indicador y cálculo que aparezca en el Dashboard de Gerencia**, incluidos tarjetas, tablas, gráficos, desvíos, subtotales y alertas con números: nombre/significado, fórmula o regla, fuente de datos, alcance, fechas/filtros, inclusiones/exclusiones, estado parcial/definitivo y actualización. Mantener esa documentación sincronizada con el cálculo real; no inventar explicaciones para fórmulas desconocidas.
9. Diferenciar rigurosamente presupuestado, comprado, recibido, asignado, consumido, desperdiciado, cobrado, pagado, proyectado y confirmado. Una transacción no debe contarse dos veces. Una corrección debe conservar historial, responsable, fecha, motivo y valores anterior/nuevo cuando corresponda.
10. Conservar funcionalidades legítimas incorporadas recientemente (por ejemplo, `Administración → Facturación y pagos`) aunque una regla histórica diga que no se agreguen módulos nuevos. No duplicarlas ni expandirlas sin requerimiento.
11. Trabajar solo en la rama autorizada; no tocar `main`, Supabase, autenticación, despliegues ni integraciones backend sin autorización. No hacer commits/push/merge por cuenta propia durante tareas ordinarias de implementación; solo si la solicitud expresa lo autoriza.
