# NEXO — Rentabilidad por proyecto

MVP de investigación (tesis ITBA, Gestión de Negocios y Tecnología) para PyMEs que fabrican por proyecto: muebles a medida, mobiliario comercial y corporativo, exhibidores, stands.

> Pregunta que tiene que responder en menos de 10 segundos: **“¿Estoy ganando lo que pensé que iba a ganar? Y si no, ¿por qué?”**

## Problema

Al cotizar, la fábrica estima materiales, horas, tercerizaciones, logística e instalación. Durante la ejecución pasan cosas distintas: se usa más o menos material, hay desperdicio, quedan sobrantes, cambian los precios y aparecen horas o compras extra. Esa información suele quedar dispersa (planillas, WhatsApp, facturas, la memoria del jefe de planta), así que el margen real se conoce tarde o no se conoce.

Nuestra hipótesis es que lo difícil **no es el dashboard de presupuesto vs. real, sino capturar lo que pasó en el taller** (mundo físico → dato → costo → margen).

## Producto

- **Modo Gestión** (desktop): pensado para ver rentabilidad, excepciones y desvíos, y decidir.
- **Modo Taller** (mobile, desde un QR): registra qué se usó, cuánto, si hubo desperdicio y si quedó sobrante. **No muestra precios ni márgenes.**

Flujo central: `presupuesto → compra → consumo → desperdicio/sobrante → costo imputable → margen proyectado → alertas → cierre → historial`.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS v4 · componentes estilo shadcn/ui (Radix + cva) · Lucide · Recharts · Zustand + persist (localStorage) · React Hook Form + Zod · qrcode.react · Vitest.

No necesita backend, API keys ni servicios pagos. Se puede desplegar en Vercel sin configuración.

> Los componentes de `components/ui` siguen el patrón de shadcn/ui (código propio sobre Radix). Se escribieron localmente porque en el entorno de desarrollo el registry de shadcn estaba bloqueado. Si se prefiere, se pueden reemplazar con `npx shadcn add …` sin cambiar el resto de la app.

## Instalación y ejecución

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # tests de dominio (Vitest)
npm run lint
npm run build && npm start
```

## Rutas

| Ruta | Qué es |
|---|---|
| `/` | Dashboard: KPIs, “Necesitan atención”, gráfico esperado vs. proyectado, tabla de activos |
| `/projects` | Proyectos: tabs por estado, búsqueda y filtros por riesgo y fecha |
| `/projects/new` | Wizard: información → presupuesto (con resumen sticky) → resumen |
| `/projects/[id]` | **Detalle** con tabs Resumen · Presupuesto · Materiales · Costos reales · Actividad, más los diálogos Registrar lo que pasó · Registrar compra · QR · Cambiar estado · Cerrar |
| `/alerts` | Alertas: Todas · Críticas · Atención · Resueltas |
| `/history` | Proyectos finalizados y aprendizajes |
| `/materials` | Pool simple de sobrantes reutilizables (no es un módulo de stock) |
| `/settings` | Umbrales de alertas y reset de la demo |
| `/registro/[projectId]` | Registro de taller mobile, sin sidebar (destino del QR) |

## Arquitectura

```
app/                      rutas (thin wrappers); (gestion)/ lleva el AppShell, registro/ no
components/
  ui/                     primitivas (button, card, dialog, tabs, table, choice, field…)
  layout/                 AppShell, HydrationGate, ModeSwitch
  dashboard/ projects/ budget/ materials/ actual-costs/ alerts/ history/ settings/ workshop/ charts/ shared/
lib/
  calculations.ts         cálculos económicos (funciones puras)
  material-reconciliation.ts   filas de materiales + reconciliación
  reusable-pool.ts        pool de sobrantes (puro, inmutable)
  alerts.ts               motor de alertas derivado
  insights.ts             textos determinísticos (sin IA)
  project-operations.ts   operaciones de dominio puras (compra, uso, costos, cierre…)
  activity.ts             mensajes de actividad (quién / qué / cuándo)
  schemas.ts              validación Zod
  seed-data.ts            empresa demo Madera Sur S.R.L.
  constants.ts            nombre de la app, labels, catálogo, umbrales, semántica de color
  formatting.ts           es-AR, ARS, dd/mm/yyyy, pp
store/
  use-app-store.ts        Zustand + persist: la ÚNICA capa de persistencia
  selectors.ts            hooks derivados memoizados
types/index.ts            modelo de dominio
tests/                    cálculos, reconciliación, alertas y escenarios de la demo
```

**Para migrar a una API o base de datos**, se reemplazan las acciones de `store/use-app-store.ts` por llamadas remotas. `lib/` y `types/` no cambian, porque todas las reglas económicas son funciones puras que reciben datos y devuelven datos.

## Datos demo y reset

La app arranca con **Madera Sur S.R.L.** (empresa ficticia) ya cargada: 8 proyectos activos o en cotización y 4 finalizados. Las fechas se generan relativas a “hoy”, para que las alertas de fecha y de inactividad tengan sentido cada vez que se abre la demo.

El proyecto principal es **P-1042 · Local Palermo – Mobiliario comercial** (Retail Sur): venta $ 12.000.000, presupuesto $ 7.200.000, margen esperado 40%, proyectado ≈ 30,8% y estado *En riesgo* por materiales (+$ 850.000).

Hay dos formas de restaurar el estado inicial:

- “Reset demo” en el sidebar.
- `/settings` → Reset demo.

Los datos viven solo en el `localStorage` de ese navegador.

## Fórmulas

| Concepto | Fórmula |
|---|---|
| Total línea | `quantity × unitCost` (o monto directo si no aplica cantidad) |
| Presupuesto | `Σ budgetLines.total` |
| Ganancia / margen esperado | `salesPrice − budget` · `/ salesPrice × 100` (`salesPrice = 0` → “—”) |
| Costo material real | `Σ (consumido + desperdicio) × unitCost` de **MaterialUsageEntry** |
| Costo no material | `Σ actualEntries.amount` (horas = `hours × hourlyCost`) |
| Costo real hasta hoy | material + no material |
| Desvío por categoría | `real − presupuesto`; `% = / presupuesto` (presupuesto 0 → sin %) |
| **Costo final proyectado** | `Σ_categoría max(presupuesto, real)` |
| **Margen proyectado** | `(venta − costo final proyectado) / venta` |
| **Margen real final** | solo en `completed`: `(venta − costo real) / venta` |
| Delta de margen | `proyectado − esperado`, en **puntos porcentuales (pp)** |
| Márgenes agregados | ponderados por venta: `(Σventa − Σcosto) / Σventa` (no es un promedio simple) |

## Materiales: compra ≠ consumo ≠ desperdicio ≠ sobrante

- **PurchaseEntry**: registra qué se compró. **No suma al costo imputable.**
- **MaterialUsageEntry**: consumo, desperdicio y sobrante reutilizable, con su origen (`comprado para el proyecto`, `stock existente` o `sobrante reutilizado`).
- **Costo imputable** = consumo + desperdicio. El sobrante se valoriza y pasa al **pool**. Si otro proyecto lo usa, se descuenta del pool y el costo se imputa a ese proyecto.
- **Reconciliación**: lo comprado para el proyecto tiene que ser igual a consumido + desperdicio + sobrante. La diferencia “no explicada” se muestra y genera una alerta, pero **no bloquea** el cierre.
- **Valorización en taller**: el operario no carga precios. El sistema toma, en este orden, el valor del sobrante en el pool, la última compra del proyecto, el costo presupuestado o el costo de referencia del catálogo. **El origen del precio queda guardado en cada registro**, y gestión puede ver cómo se valorizó cada uno.

Ejemplo (spec §10, reproducido en P-1042): compradas 12 placas × $ 50.000 = $ 600.000, consumidas 9, desperdicio 1, sobrante 2. El **costo imputable es $ 500.000**.

## Margen proyectado (por qué no “margen real” a mitad de proyecto)

Si a mitad de camino se calcula `venta − costo registrado`, el margen sale artificialmente alto, porque falta ejecutar parte del presupuesto. Por eso, en cada categoría se asume que lo que queda de presupuesto se va a consumir, y cuando el real ya lo superó se toma el real. El “margen real” solo existe cuando el proyecto está **finalizado**.

## Alertas (umbrales configurables en /settings)

| Alerta | Condición |
|---|---|
| Categoría | real > presupuesto: ≤10% info · 10–20% atención · >20% crítica |
| Margen | caída <5 pp info · 5–10 pp atención · >10 pp crítica |
| Sin registros | en Producción, 7 días sin consumos ni costos |
| Entrega | ≤5 días para la entrega con avance <80% |
| Reconciliación | lo comprado no coincide con lo explicado (info en Producción, atención en Instalación) |

El **estado económico** (Saludable / Atención / En riesgo) usa solo las alertas de categoría y de margen. Marcar una alerta como resuelta no cambia los números, y si la situación empeora de nivel, la alerta vuelve a aparecer.

## Verificación realizada

- `npm test`: 39 tests. Cubren márgenes, `salesPrice = 0`, presupuesto 0, real mayor y menor que el presupuesto, casos sin registros, compra mayor que el uso, uso desde stock, sobrante reutilizado, pool, cierre y los escenarios 1–10 sobre el seed real.
- `npm run lint` y `npm run build`: sin errores.
- Se recorrió en navegador (Playwright) la demo obligatoria completa: comprar 2 placas **no** cambia el margen, consumirlas **sí**, 10 h × $ 15.000 = $ 150.000, el registro mobile con 2 / 0,2 / 0,3 placas actualiza gestión, y se verificaron el cierre, el historial, el wizard y el reset. También se comprobó que no haya scroll horizontal a 390 px.

## Limitaciones (conscientes)

- Sin autenticación: “Gestión / Taller” es un selector de rol demo.
- Persistencia local por navegador: el QR abierto en otro dispositivo **no comparte datos**. Para una prueba real con celular hace falta desplegar un backend. La demo se hace en el mismo navegador (el QR abre `/registro/...`).
- No es inventario: no hay depósitos, lotes, FIFO, stock mínimo ni transferencias. El pool de sobrantes es deliberadamente simple.
- El avance (%) es manual.
- El costo por hora del registro de taller sale de la tarifa presupuestada (o de un valor por defecto de $ 14.000).
- Los insights son reglas determinísticas: con pocos proyectos son indicios, no conclusiones.

## Futuras mejoras (a validar con usuarios antes de construir)

- Backend (API + DB) y multiusuario real para usar el QR desde el celular del taller.
- Fotos o voz en el registro de taller, si las entrevistas muestran que reducen la fricción.
- Plantillas de presupuesto construidas a partir del historial (“proyectos tipo Local comercial usan +8% material”).
- Exportar el cierre a PDF o planilla.
- Métricas de uso de la herramienta (quién registra, cuándo, qué no se registra) como insumo de la investigación.
