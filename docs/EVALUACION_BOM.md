# "Con estos materiales alcanzan para X sillas": evaluación (no implementado)

Pedido: que el Jefe de planta y Compras vean, en cantidades, para cuántas unidades de cada producto alcanza el
material. Requiere saber qué material lleva cada producto (lista de materiales, BOM). Esto es solo la evaluación.

## 1. Qué dato nuevo hace falta

Uno solo: **a qué producto va cada línea de material del presupuesto**. Hoy los materiales se presupuestan por rubro
(Carpintería madera: 20 placas de multilaminado) y los productos están aparte (Mesa × 10, Silla × 100). Con ese
vínculo, el consumo por unidad sale solo:

- material por unidad = cantidad presupuestada de la línea ÷ cantidad del producto
  (20 placas para 10 mesas → 2 placas por mesa; ya incluye el % de desperdicio que se cargó).

No hace falta una BOM de varios niveles, ni subconjuntos, ni recetas reutilizables entre proyectos. En la base es una
columna opcional `item_id` en `budget_lines` (migración aditiva; las líneas sin producto siguen como hoy).

## 2. Dónde se carga sin sumar fricción

En el mismo lugar donde ya se cargan los materiales (Nuevo proyecto / Cotizador → rubro → materiales): un selector
**"Para qué producto"** en cada fila de material, que por defecto queda en "General". No se escribe ningún número
nuevo: la cantidad por unidad se calcula. Un material compartido (tornillos, cola) se deja en "General" y no limita.

## 3. Cálculo (función pura, con tests)

Para cada producto, con las unidades que faltan (cantidad − terminadas):

- alcanza para = mínimo, entre sus materiales, de (material disponible ÷ material por unidad), redondeado hacia abajo;
- disponible = asignado al proyecto y sin consumir (lo mismo que hoy usa el cierre del día); opcionalmente, sumando
  el stock libre del depósito como segunda cifra;
- "limita" = el material que da el mínimo, con lo que falta para terminar: (unidades que faltan × por unidad) −
  disponible.

Siempre en cantidades: nunca importes. Es una cuenta explicable hasta las líneas y los movimientos, no una predicción.

## 4. ¿Entra en el MVP?

**Recomendación: nivel siguiente, como piloto chico, no en esta tanda.**

- Suma valor real para el Jefe ("¿arranco las sillas o espero el caño?") y para Compras ("para terminar faltan 3
  placas"), y reusa todo lo que ya existe (líneas de material, productos, saldo por lote).
- Pero depende de una hipótesis que todavía no validamos: que el fabricante presupueste los materiales **por
  producto**. Si en las entrevistas siguen cargando por rubro global, la cuenta sale vacía y no aporta.
- Riesgo de alcance: es el primer paso hacia un MRP (explosión de materiales, planificación), que está explícitamente
  fuera del MVP. Para no cruzar esa línea: un solo nivel, sin planificación, sin sugerir compras automáticas.

Propuesta: validar con 2 o 3 fabricantes si vincularían material ↔ producto al presupuestar; si sí, implementarlo
como: 1 columna opcional, 1 selector en la fila de material, 1 función pura y 2 líneas de texto.

## 5. Dónde se mostraría

- **Jefe de planta → Proyectos**, en la tarjeta de cada producto: "Con el material asignado alcanzan para 6 de las 10
  mesas que faltan. Limita: MDF 18 mm (faltan 8 placas)".
- **Compras → Por comprar**, en el proyecto: la misma línea, para pedir lo que limita.
- No va al Resumen del Administrativo (no es plata) ni al Operario.
