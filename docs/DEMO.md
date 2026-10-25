# Blerp · modo demostración

Rama `claude/epic-johnson-zn9v9u`. Solo frontend: no se tocó `supabase/`, `lib/supabase/`, migraciones, RLS, RPC,
autenticación, middleware, API routes ni variables de entorno. La demo nunca escribe en Supabase. Sin deploy ni merge.

## 1. Cómo entrar

1. Iniciar sesión con cualquier usuario (el middleware pide sesión; ver `PENDIENTES_BACKEND.md` §7.1).
2. Menú lateral, abajo: **Abrir modo demostración**. Arriba aparece el rótulo de modo demostración.
3. **Demo: ver como** cambia de sesión: Gerencia, Administración, Compras, Jefe de planta, Operario (en Operario se
   elige la persona). Las cinco leen y escriben el mismo estado.
4. Todo queda en este navegador (`localStorage`, con versión de esquema 3) y sobrevive a recargar.
5. **Restaurar datos de prueba** vuelve exactamente al escenario base. **Salir de la demostración** vuelve a la
   empresa real.

## 2. Escenario

**Carpintería Lapacho (empresa ficticia)**, fecha simulada fija **martes 20/10/2026**. 11 personas, 5 rubros,
14 materiales, 5 proveedores, 9 clientes y 11 OTs que cubren todo el circuito:

| OT | Situación |
| --- | --- |
| OT4301 | Cerrada y cobrada. Le sobraron 2 placas de MDF que se pasaron a OT4306. |
| OT4302 | Cerrada con 30 % sin cobrar y rentabilidad final menor a la cotizada. |
| OT4303 | Todo entregado; el cierre está bloqueado por material sin rendir. |
| OT4304 | Lista para cerrar. |
| OT4305 | Atrasada, cuota vencida (costo financiero adicional), adicional de Tapicería, pedido de rubro abierto, jornada asignada sin horas. |
| OT4306 | Producción: 8/12 sillas, OC compartida con una recepción revertida, pago parcial, correcciones y horas extra. |
| OT4307 | Compras con BOM v2; 2 placas de MDF libres para asignar. |
| OT4308 | Aprobada con BOM en borrador; Herrería sin capacidad por vacaciones. |
| OT4309–OT4311 | Cotización enviada, en negociación y borrador. |

Todos los registros: `docs/demo-auditoria/DATOS_DEMO_COMPLETOS.md` (y JSON/CSV en `datos/`). Cifras esperadas,
calculadas por separado en Python: `RESULTADOS_ESPERADOS.md`. Recorridos de prueba: `MATRIZ_DE_PRUEBAS.md`.

## 3. Pestañas por sesión

| Sesión | Pestañas |
| --- | --- |
| Gerencia | Dashboard, Proyectos, Personal, Stock, Configuración |
| Administración | Dashboard, Proyectos, Cotizador, Stock, Clientes, Proveedores, Configuración, Registrar mis horas |
| Compras | Dashboard, Por comprar, OCs, Stock, Alertas, Proveedores, Registrar mis horas |
| Jefe de planta | Proyectos (Hoy / Planificación), Operarios, Alertas, Registrar mis horas |
| Operario | Mi día |

## 4. Recorrido corto sugerido

1. **Administración** → Cotizador → OT4309 → **Confirmar aprobación del cliente** → BOM → **Publicar y enviar a Compras**.
2. **Compras** → Por comprar: aparece OT4309. Stock → MDF → **Asignar a OT** OT4307 (pasa sola a Producción).
   OCs → **Registrar orden de compra** y **Materiales recibidos**.
3. **Jefe de planta** → Proyectos → Planificación: planificar y **Asignar trabajo**; Hoy: **Entregar a producción**
   y rendir.
4. **Operario** → Mi día: la tarea aparece precargada → **Guardar jornada**. Jefe → Operarios: revisar o **Corregir**.
5. **Gerencia** → OT4305: ver costo financiero adicional; **Registrar ingreso**. OT4303: **Cerrar OT** (bloqueado,
   dice por qué). Dashboard: cambiar Desde/Hasta.

## 5. Dónde está el código

- Dominio (puro, probado): `lib/core/` — tipos, operaciones con validación por sesión (`ops.ts`), cálculos
  (`quote`, `needs`, `stock`, `economics`, `financial`, `capacity`, `dashboard`, `alerts`, `closing`) y la semilla
  determinista (`seed.ts`).
- Estado: `store/use-app-store.ts` (`core`, `coreAct`) y `store/demo-local.ts` (guardado y restaurar).
- Pantallas: `components/demo/` por sesión. En una empresa real se siguen viendo las pantallas anteriores
  (`DemoOr`), y lo que solo existe en la demo muestra «Pendiente de backend» (`DemoOnly`).
- Pruebas: `tests/demo-esperados.test.ts` (contra el cálculo independiente e integridad),
  `tests/demo-aceptacion.test.ts` (20 recorridos) y `tests/demo-local.test.ts` (persistencia y sesiones).

Para regenerar la auditoría después de cambiar la semilla:

```bash
npx tsx --tsconfig tsconfig.json docs/demo-auditoria/exportar.mts
python3 docs/demo-auditoria/calculo_independiente.py
```
