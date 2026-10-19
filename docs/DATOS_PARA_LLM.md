# Blerp — Datos para estimar y para un LLM

Estado: la capa de datos está construida y aplicada en Supabase. **El modelo y el LLM todavía no existen.** Con datos de demostración
no hay nada que aprender: lo que se vea ilustra la interfaz, no demuestra que una estimación funcione. No se afirma validación
ni Product-Market Fit.

## Qué ya se guardaba (no se tocó)

Todo lo que se gestiona vive en Supabase por empresa y con RLS por rol: proyectos, líneas de presupuesto, presupuesto base congelado,
compras, consumos, desperdicio y sobrante, horas, otros costos, stock (lotes y movimientos), órdenes de compra, asignaciones, actividad,
correcciones auditadas e historial de precios con vigencia. Lo que faltaba era una forma **estable, explicable y segura** de leerlo para aprender.

## Qué se agregó (migraciones `20261023120000` y `20261023120100`)

| Pieza | Para qué |
|---|---|
| `clients` + `projects.client_id` | Cliente como entidad (decisión D5). La base vincula sola el texto del proyecto a un cliente normalizado (sin acentos, mayúsculas ni espacios de más). La app no cambia. |
| `project_closures` | **Cierre congelado** de cada proyecto finalizado: presupuesto vs. real por categoría, horas por rubro, materiales (presupuestado / comprado / consumido / desperdicio / sobrante), productos, duración, margen esperado y real final, principal desvío y un **resumen en texto** determinístico. No se edita ni se borra. |
| `closure_reviews` | Excluir un proyecto atípico del aprendizaje, **con motivo obligatorio** (queda quién y cuándo). |
| `model_predictions` | Toda estimación guardada con versión del modelo, datos de entrada, rango, comparables usados y si se apoyó en datos demo. No se edita ni se borra. |
| Vistas `dataset_*` | Tablas planas para entrenar o consultar: `dataset_closed_projects`, `dataset_category_deviation`, `dataset_material_deviation`, `dataset_hours_deviation`. Traen `usable_for_training`. |
| `admin_record_closure(p)` | Guarda un cierre (idempotente). La identidad (tipo, fechas, precio, cliente, código) sale de `projects`, no de lo que mande el cliente. |
| `admin_similar_closures(tipo, límite, incluir_demo)` | Proyectos cerrados parecidos + `sample_size` (el "N" que hay que mostrar). Es el contexto para el panel de cotización y para un LLM. |

## Cómo se llenan

- **Al cerrar un proyecto**, la app calcula el snapshot con `lib/closure-snapshot.ts` (reusa `lib/calculations.ts`: ninguna cifra tiene dos fuentes) y lo guarda
  con `admin_record_closure`. Si fallara, **no frena la app**: se reintenta.
- **Al entrar un Administrativo**, `backfillClosures` completa los cierres de proyectos finalizados que todavía no lo tienen.

## Reglas de datos que se cumplen

- **Demo ≠ real.** `data_origin` es `demo` (la empresa es demo), `app` o `imported`. Lo decide la base, no el cliente. Lo demo **nunca** cuenta para entrenar (`usable_for_training = false`) y `admin_similar_closures` lo excluye salvo `p_include_demo = true`.
- **Compra ≠ consumo ≠ desperdicio ≠ sobrante.** Se guardan por separado; `imputed_cost` = consumo + desperdicio.
- **Sin margen inventado.** Sin precio de venta, los márgenes quedan en `null` (no un negativo falso).
- **Seguridad.** Solo Administrativo con permiso comercial lee o escribe estas tablas. Jefe de planta, Compras, Operario y otras empresas no ven nada. Las vistas son `security_invoker`.
- **Un modelo nunca pisa cifras por reglas.** Su resultado va a `model_predictions`, como rango y con "basado en datos de demostración" cuando corresponda.

## Cómo consumirlo desde un LLM

1. Una **ruta del servidor** (Next route handler) con la **sesión del usuario** (no la service role: así rige RLS y nunca se mezclan empresas).
2. Llamar `admin_similar_closures(tipo, 10, incluir_demo)`. Devuelve filas con `summary_text` y cifras congeladas.
3. Armar el prompt con esos resúmenes y el `sample_size`. **Si `sample_size` es menor al mínimo (D4 = 10), no mostrar estimación**: decir cuántos faltan.
4. Pedir un **rango**, no un número, y que cite los proyectos usados.
5. Guardar el resultado con `savePrediction` (`lib/supabase/closures.ts`).

La clave del LLM va en una variable de entorno del servidor (nunca `NEXT_PUBLIC_`). `.env.example` solo trae las dos variables de Supabase: todavía no hay ninguna prevista para un LLM.

Ejemplos de consulta (como Administrativo):

```sql
-- Sobrecosto de materiales por tipo de proyecto, solo datos reales no excluidos
select project_type, count(*) n, percentile_cont(0.5) within group (order by deviation_pct) as mediana_pct
from dataset_category_deviation
where category = 'materials' and usable_for_training
group by project_type;

-- Dónde se desperdicia más material
select material_name, avg(waste_pct) as desperdicio_medio_pct, count(*) n
from dataset_material_deviation where usable_for_training group by material_name order by 2 desc;
```

## Límites actuales (honestos)

- **Las 4 empresas que hay hoy son demo y tienen 4 proyectos cerrados cada una** (16 en total). El aprendizaje es por empresa, así que ninguna llega al mínimo D4 = 10, y además son datos de demostración. Hasta tener proyectos reales cerrados no hay base para estimar.
- No hay **pantalla** para excluir atípicos ni para ver predicciones: el backend está listo, la UI no.
- No hay **ajuste por inflación**: cada costo guarda su fecha (`first_cost_date`, `last_cost_date` y las fechas de cada registro), pero falta un índice para llevar a pesos constantes.
- **Similitud solo por tipo de proyecto** (coincidencia exacta). Todavía no hay "vecinos más cercanos" por productos, medidas o material.
- Los catálogos de **material** y **rol** siguen siendo ids de texto en el código; solo cliente es entidad en la base.
- Quedan clientes de la demo en `clients` tras "Restaurar datos demo" (no estorban: ninguna pantalla los usa).
- Importador de Excel (`data_origin = 'imported'`): previsto, no construido.

## Próximos pasos sugeridos (a validar antes de construir)

1. Estadística explicable sobre `dataset_category_deviation` (mediana y percentiles por tipo) como primer panel al cotizar.
2. Pantalla de curaduría de atípicos (usa `closure_reviews`).
3. Embeddings con `pgvector` (la extensión existe en Supabase, no está instalada): una columna nueva sobre `summary_text`, sin cambiar lo anterior.
4. Catálogo de materiales y roles como entidades.
5. Importador de planillas del cliente.
