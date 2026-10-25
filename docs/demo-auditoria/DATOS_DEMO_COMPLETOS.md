# Datos completos de la demo (escenario base)

Empresa ficticia **Carpintería Lapacho (empresa ficticia)**. Fecha de la demo (asOf): **2026-10-20** (martes). Todos los nombres, montos y
personas son inventados. Importes en pesos sin IVA. Generado por `docs/demo-auditoria/exportar.mts` a partir de
`lib/core/seed.ts`: no falta ningún registro (1169 filas en 35 tablas).

Archivos estructurados: `datos/escenario.json` (estado completo, ids estables) y un CSV por tabla en `datos/`.
Resultados calculados de forma independiente: `RESULTADOS_ESPERADOS.md` y `datos/esperados.json`.

## Configuración y supuestos

- Nomenclador de OT: prefijo **OT**, partes number + client + description, último número usado 4311.
- Rentabilidad objetivo por defecto: materiales 30 %, mano de obra 40 % (margen sobre el precio).
- Costo financiero: 4 % mensual, interés simple, mes de 30 días. Material sin pago cargado: invertido al recibir. Horas: invertidas el día trabajado.
- Costos generales de cotización: Provisión para imprevistos (3 % del costo directo).
- Categorías de otros costos: Fletes, Trabajos de terceros, Reposiciones y reparaciones, Otros.
- Umbrales: urgentPurchaseDays = 7 · dueSoonDays = 14 · lowMarginPoints = 5 · overcostPct = 10 · capacityWeeks = 4 · renditionDays = 5 · reviewDays = 2.

## Historia de cada OT (resumen)

| OT | Situación al 2026-10-20 | Qué prueba |
| --- | --- | --- |
| OT4301 Librería El Faro Azul | Cerrada el 10/08, cobrada | Ciclo completo; sobrante de 2 placas MDF devuelto a stock (después va a OT4306). |
| OT4302 Restó Cardo y Ajo | Cerrada el 04/09, saldo 30 % sin cobrar | Rentabilidad baja (horas de herrería de más); cliente moroso: el costo financiero sigue solo sobre el capital propio no recuperado (no sobre el saldo del precio). |
| OT4303 Coworking Nodo Sur | Producción: todo terminado y entregado | Cierre bloqueado: 1,5 placas de melamina en producción sin rendir y 2 cajas de tornillos asignadas sin usar. Descuento en la cotización. |
| OT4304 Óptica Visión Clara | Producción: terminada, entregada y rendida | Apta para cierre (alerta «lista para cerrar»). |
| OT4305 Clínica Dental Sonrisa Norte | Producción, entrega vencida (09/10) | Cuota vencida (21/09); costo financiero adicional por atraso; rubro Tapicería pedido por Planta y aprobado como adicional con precio (revisión de contrato); otro pedido de rubro abierto; laca entregada sin rendir; jornada asignada sin horas (Sofía 16/10). |
| OT4306 Café Brújula | Producción | 12 sillas (8/12); MDF: necesita 5, 2 asignadas desde stock (sobrante de OT4301) y 3 por comprar; OC-0020 compartida con OT4307 con recepción parcial y una recepción revertida; pago parcial repartido; pedido adicional de 3 m de tela; corrección de horas (Diego 16/10); horas extra (Camila 15/10); trabajo de otra tarea (Iván 19/10). |
| OT4307 Estudio Arenal Arquitectura | Compras (BOM v2) | BOM republicado; OC-0020 y OC-0021 en camino; MDF: necesita 5 y hay 2 libres (caso de prueba «asignar 2 de 5»); compras urgentes (inicio 26/10). |
| OT4308 Hotel Puerto Colibrí | Aprobada, BOM en borrador | «Pendiente de BOM». Herrería comprometida (falta de capacidad por vacaciones de Joaquín). |
| OT4309 Escuela de Música Clave de Sol | Cotización enviada | Potencial en capacidad. |
| OT4310 Café Brújula | Cotización en negociación sin cuotas | Información incompleta (Administración). |
| OT4311 Restó Cardo y Ajo | Borrador | Listado de borradores del Cotizador. |

## Clientes

Archivo: `datos/clientes.csv` · 9 registros.

| id | nombre | contacto | activo |
| --- | --- | --- | --- |
| cli-01 | Librería El Faro Azul | Encargada de local | sí |
| cli-02 | Restó Cardo y Ajo | Socio gerente | sí |
| cli-03 | Óptica Visión Clara | Dueña | sí |
| cli-04 | Coworking Nodo Sur | Administración | sí |
| cli-05 | Café Brújula | Socio | sí |
| cli-06 | Estudio Arenal Arquitectura | Arquitecta a cargo | sí |
| cli-07 | Clínica Dental Sonrisa Norte | Dirección | sí |
| cli-08 | Hotel Puerto Colibrí | Compras | sí |
| cli-09 | Escuela de Música Clave de Sol | Secretaría | sí |

## Proveedores

Archivo: `datos/proveedores.csv` · 5 registros.

| id | nombre | contacto | links |
| --- | --- | --- | --- |
| prov-01 | Maderera Río Bermejo | Ventas mostrador | Lista de placas: https://example.com/rio-bermejo/placas |
| prov-02 | Metalúrgica Cerro Blanco | Oficina técnica | Caños y perfiles: https://example.com/cerro-blanco/lista |
| prov-03 | Pinturería Arcoíris del Sur | Atención a talleres | Catálogo: https://example.com/arcoiris/catalogo |
| prov-04 | Textiles Ñandú | Ventas | Telas: https://example.com/nandu/telas |
| prov-05 | Herrajes Torre Alta | Mostrador | Herrajes: https://example.com/torre-alta/herrajes · Correderas: https://example.com/torre-alta/correderas |

## Rubros (de obreros)

Archivo: `datos/rubros.csv` · 5 registros.

| id | nombre |
| --- | --- |
| rb-carp | Carpintería |
| rb-herr | Herrería |
| rb-pint | Pintura y lustre |
| rb-tapi | Tapicería |
| rb-mont | Armado y montaje |

## Materiales

Archivo: `datos/materiales.csv` · 14 registros.

| id | nombre | unidad | rubro | costo_referencia |
| --- | --- | --- | --- | --- |
| mat-mdf | Placa MDF 18 mm | placa | Carpintería | 62000 |
| mat-mel | Melamina blanca 18 mm | placa | Carpintería | 58000 |
| mat-fen | Multilaminado fenólico 18 mm | placa | Carpintería | 95000 |
| mat-rob | Enchapado roble 18 mm | placa | Carpintería | 120000 |
| mat-tap | Tapacanto PVC 22 mm | m | Carpintería | 900 |
| mat-bis | Bisagra cazoleta | unidad | Carpintería | 2600 |
| mat-cor | Corredera telescópica 45 cm | par | Carpintería | 11000 |
| mat-can | Caño estructural 40×40 | barra 6 m | Herrería | 38000 |
| mat-pla | Planchuela 1½″ × 3/16″ | barra 6 m | Herrería | 21000 |
| mat-pol | Pintura poliuretánica | litro | Pintura y lustre | 24000 |
| mat-lac | Laca nitro | litro | Pintura y lustre | 14000 |
| mat-esp | Espuma alta densidad 5 cm | plancha | Tapicería | 46000 |
| mat-tel | Tela tapicería antimanchas | m | Tapicería | 28000 |
| mat-tor | Tornillo 4×40 (caja de 100) | caja | Armado y montaje | 5500 |

## Categorías de personal

Archivo: `datos/categorias.csv` · 7 registros.

| id | nombre | obrero |
| --- | --- | --- |
| cat-ger | Gerente | no |
| cat-com | Comercial | no |
| cat-dis | Diseñador | no |
| cat-adm | Administrativo | no |
| cat-cpr | Compras | no |
| cat-jef | Jefe de planta | no |
| cat-obr | Obrero | sí |

## Personal

Archivo: `datos/empleados.csv` · 11 registros.

| id | nombre | categoria | ingreso | dias | horas_dia | rubros | sesiones |
| --- | --- | --- | --- | --- | --- | --- | --- |
| emp-01 | Marina Quiroga | Gerente | 2019-03-01 | 1 2 3 4 5 | 8 |  | gerencia |
| emp-02 | Tomás Ferreyra | Comercial | 2021-02-15 | 1 2 3 4 5 | 8 |  | administracion |
| emp-03 | Lucía Benítez | Diseñador | 2022-05-02 | 1 2 3 4 5 | 8 |  | administracion |
| emp-04 | Paula Sosa | Compras | 2020-08-10 | 1 2 3 4 5 | 8 |  | compras |
| emp-05 | Raúl Medina | Jefe de planta | 2018-11-05 | 1 2 3 4 5 | 8 |  | jefe_planta |
| emp-06 | Diego Paz | Obrero | 2020-01-06 | 1 2 3 4 5 | 8 | Carpintería | operario |
| emp-07 | Camila Rivas | Obrero | 2021-04-12 | 1 2 3 4 5 | 8 | Carpintería, Pintura y lustre | operario |
| emp-08 | Joaquín Ledesma | Obrero | 2019-09-02 | 1 2 3 4 5 | 8 | Herrería | operario |
| emp-09 | Sofía Arce | Obrero | 2023-03-06 | 1 2 3 4 5 | 8 | Pintura y lustre | operario |
| emp-10 | Matías Godoy | Obrero | 2022-07-18 | 1 2 3 4 5 | 8 | Tapicería | operario |
| emp-11 | Iván Correa | Obrero | 2024-02-05 | 1 2 3 4 5 | 8 | Carpintería, Armado y montaje | operario |

## Valores con vigencia (costos por hora y multiplicadores)

Archivo: `datos/tarifas.csv` · 22 registros.

| id | tipo | sujeto | valor | vigente_desde |
| --- | --- | --- | --- | --- |
| tar-001 | employee_cost | emp-01 | 18000 | 2026-01-01 |
| tar-002 | employee_cost | emp-02 | 11000 | 2026-01-01 |
| tar-003 | employee_cost | emp-03 | 12000 | 2026-01-01 |
| tar-004 | employee_cost | emp-04 | 10000 | 2026-01-01 |
| tar-005 | employee_cost | emp-05 | 13000 | 2026-01-01 |
| tar-006 | employee_cost | emp-06 | 8000 | 2026-01-01 |
| tar-007 | employee_cost | emp-07 | 8500 | 2026-01-01 |
| tar-008 | employee_cost | emp-08 | 9000 | 2026-01-01 |
| tar-009 | employee_cost | emp-09 | 7800 | 2026-01-01 |
| tar-010 | employee_cost | emp-10 | 8200 | 2026-01-01 |
| tar-011 | employee_cost | emp-11 | 8000 | 2026-01-01 |
| tar-012 | employee_cost | emp-06 | 8800 | 2026-10-01 |
| tar-020 | category_cost | cat-dis | 12000 | 2026-01-01 |
| tar-021 | category_cost | cat-adm | 11000 | 2026-01-01 |
| tar-022 | category_cost | cat-com | 11000 | 2026-01-01 |
| tar-030 | rubro_cost | rb-carp | 8500 | 2026-01-01 |
| tar-031 | rubro_cost | rb-herr | 9000 | 2026-01-01 |
| tar-032 | rubro_cost | rb-pint | 8000 | 2026-01-01 |
| tar-033 | rubro_cost | rb-tapi | 8200 | 2026-01-01 |
| tar-034 | rubro_cost | rb-mont | 8000 | 2026-01-01 |
| tar-040 | overtime_cost | all | 1,5 | 2026-01-01 |
| tar-041 | overtime_sale | all | 1,5 | 2026-01-01 |

## Excepciones y ausencias

Archivo: `datos/excepciones.csv` · 17 registros.

| id | persona | fecha | horas_disponibles | nota |
| --- | --- | --- | --- | --- |
| exc-0857 | Sofía Arce | 2026-10-21 | 0 | Trámite personal |
| exc-0858 | Iván Correa | 2026-10-24 | 4 | Sábado para adelantar mesas |
| exc-0859 | Joaquín Ledesma | 2026-10-26 | 0 | Vacaciones |
| exc-0860 | Joaquín Ledesma | 2026-10-27 | 0 | Vacaciones |
| exc-0861 | Joaquín Ledesma | 2026-10-28 | 0 | Vacaciones |
| exc-0862 | Joaquín Ledesma | 2026-10-29 | 0 | Vacaciones |
| exc-0863 | Joaquín Ledesma | 2026-10-30 | 0 | Vacaciones |
| exc-0864 | Joaquín Ledesma | 2026-11-02 | 0 | Vacaciones |
| exc-0865 | Joaquín Ledesma | 2026-11-03 | 0 | Vacaciones |
| exc-0866 | Joaquín Ledesma | 2026-11-04 | 0 | Vacaciones |
| exc-0867 | Joaquín Ledesma | 2026-11-05 | 0 | Vacaciones |
| exc-0868 | Joaquín Ledesma | 2026-11-06 | 0 | Vacaciones |
| exc-0869 | Joaquín Ledesma | 2026-11-09 | 0 | Vacaciones |
| exc-0870 | Joaquín Ledesma | 2026-11-10 | 0 | Vacaciones |
| exc-0871 | Joaquín Ledesma | 2026-11-11 | 0 | Vacaciones |
| exc-0872 | Joaquín Ledesma | 2026-11-12 | 0 | Vacaciones |
| exc-0873 | Joaquín Ledesma | 2026-11-13 | 0 | Vacaciones |

## OTs

Archivo: `datos/ots.csv` · 11 registros.

| id | ot | cliente | descripcion | estado | subestado_cotizacion | inicio | entrega | aprobada | precio_acordado | rentabilidad_cotizada |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ot-4311 | OT4311_RestoCardoAjo_AlacenaCocina | Restó Cardo y Ajo | Alacena de cocina | quotation | draft | 2026-11-23 | 2026-12-18 |  |  |  |
| ot-4310 | OT4310_CafeBrujula_TerrazaMesasExteriores | Café Brújula | Terraza mesas exteriores | quotation | negotiating | 2026-11-16 | 2026-12-18 |  |  |  |
| ot-4309 | OT4309_EscuelaMusicaClave_AtrilesBancos | Escuela de Música Clave de Sol | Atriles y bancos | quotation | sent | 2026-11-09 | 2026-12-11 |  |  |  |
| ot-4308 | OT4308_HotelPuertoColibri_RespaldosMesasLuz12 | Hotel Puerto Colibrí | Respaldos y mesas de luz 12 habitaciones | approved | negotiating | 2026-11-02 | 2026-12-18 | 2026-10-14 | 8830000 | 32,31 |
| ot-4307 | OT4307_EstudioArenal_BibliotecaEscritorio | Estudio Arenal Arquitectura | Biblioteca y escritorio | purchasing | sent | 2026-10-26 | 2026-12-04 | 2026-09-29 | 3330000 | 34,48 |
| ot-4306 | OT4306_CafeBrujula_BarraMesas12Sillas | Café Brújula | Barra, mesas y 12 sillas | production | negotiating | 2026-09-28 | 2026-11-13 | 2026-09-14 | 6470000 | 33,13 |
| ot-4305 | OT4305_ClinicaDental_MueblesRecepcion | Clínica Dental Sonrisa Norte | Muebles de recepción | production | sent | 2026-08-31 | 2026-10-09 | 2026-08-18 | 4030000 | 34,68 |
| ot-4304 | OT4304_OpticaVisionClara_MostradoresExhibidores | Óptica Visión Clara | Mostradores y exhibidores | production | sent | 2026-08-24 | 2026-10-16 | 2026-08-10 | 3500000 | 34,62 |
| ot-4303 | OT4303_CoworkingNodoSur_EscritoriosLockers | Coworking Nodo Sur | Escritorios y lockers | production | sent | 2026-08-17 | 2026-10-14 | 2026-08-03 | 5630000 | 33,3 |
| ot-4302 | OT4302_RestoCardoAjo_BarraBanquetas | Restó Cardo y Ajo | Barra y banquetas | closed | negotiating | 2026-07-06 | 2026-08-28 | 2026-07-01 | 4370000 | 34,1 |
| ot-4301 | OT4301_LibreriaFaroAzul_EstanteriasSalon | Librería El Faro Azul | Estanterías salón principal | closed | sent | 2026-06-15 | 2026-07-31 | 2026-06-08 | 3920000 | 34,24 |

## Muebles

Archivo: `datos/muebles.csv` · 22 registros.

| id | ot | mueble | cantidad | terminadas |
| --- | --- | --- | --- | --- |
| mu-0855 | OT4311 | Alacena | 1 | 0 |
| mu-0851 | OT4310 | Mesa exterior | 8 | 0 |
| mu-0847 | OT4309 | Atril | 20 | 0 |
| mu-0848 | OT4309 | Banco de piano | 4 | 0 |
| mu-0831 | OT4308 | Respaldo de cama | 12 | 0 |
| mu-0832 | OT4308 | Mesa de luz | 24 | 0 |
| mu-0712 | OT4307 | Biblioteca | 1 | 0 |
| mu-0713 | OT4307 | Escritorio | 1 | 0 |
| mu-0660 | OT4306 | Barra | 1 | 0 |
| mu-0661 | OT4306 | Mesa | 4 | 0 |
| mu-0662 | OT4306 | Silla | 12 | 8 |
| mu-0509 | OT4305 | Mostrador de recepción | 1 | 0 |
| mu-0510 | OT4305 | Mueble de guardado | 2 | 0 |
| mu-0511 | OT4305 | Sillón de espera | 3 | 2 |
| mu-0404 | OT4304 | Mostrador | 2 | 2 |
| mu-0405 | OT4304 | Exhibidor de pared | 6 | 6 |
| mu-0268 | OT4303 | Escritorio | 10 | 10 |
| mu-0269 | OT4303 | Locker | 4 | 4 |
| mu-0118 | OT4302 | Barra | 1 | 1 |
| mu-0119 | OT4302 | Banqueta | 8 | 8 |
| mu-0011 | OT4301 | Estantería alta | 4 | 4 |
| mu-0012 | OT4301 | Mesa de exhibición | 2 | 2 |

## Líneas cotizadas (cotización vigente o aprobada)

Archivo: `datos/lineas_cotizadas.csv` · 119 registros.

| id | ot | mueble | rubro | tipo | material | cantidad | unidad | costo_unitario |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ot-4311-ql01 | OT4311 | Alacena | Carpintería | material | Melamina blanca 18 mm | 5 | placa | 58000 |
| ot-4311-ql02 | OT4311 | Alacena | Carpintería | horas |  | 20 | h | 8500 |
| ot-4310-ql01 | OT4310 | Mesa exterior | Herrería | material | Caño estructural 40×40 | 8 | barra 6 m | 38000 |
| ot-4310-ql02 | OT4310 | Mesa exterior | Herrería | horas |  | 48 | h | 9000 |
| ot-4310-ql03 | OT4310 | Mesa exterior | Carpintería | material | Multilaminado fenólico 18 mm | 4 | placa | 95000 |
| ot-4310-ql04 | OT4310 | Mesa exterior | Carpintería | horas |  | 24 | h | 8500 |
| ot-4310-ql05 | OT4310 | Mesa exterior | Pintura y lustre | material | Pintura poliuretánica | 6 | litro | 24000 |
| ot-4310-ql06 | OT4310 | Mesa exterior | Pintura y lustre | horas |  | 20 | h | 8000 |
| ot-4309-ql01 | OT4309 | Atril | Herrería | material | Caño estructural 40×40 | 6 | barra 6 m | 38000 |
| ot-4309-ql02 | OT4309 | Atril | Herrería | horas |  | 40 | h | 9000 |
| ot-4309-ql03 | OT4309 | Atril | Pintura y lustre | material | Pintura poliuretánica | 4 | litro | 24000 |
| ot-4309-ql04 | OT4309 | Atril | Pintura y lustre | horas |  | 16 | h | 8000 |
| ot-4309-ql05 | OT4309 | Banco de piano | Carpintería | material | Enchapado roble 18 mm | 2 | placa | 120000 |
| ot-4309-ql06 | OT4309 | Banco de piano | Carpintería | horas |  | 24 | h | 8500 |
| ot-4309-ql07 | OT4309 | Banco de piano | Tapicería | material | Espuma alta densidad 5 cm | 1 | plancha | 46000 |
| ot-4309-ql08 | OT4309 | Banco de piano | Tapicería | material | Tela tapicería antimanchas | 3 | m | 28000 |
| ot-4309-ql09 | OT4309 | Banco de piano | Tapicería | horas |  | 8 | h | 8200 |
| ot-4308-ql01 | OT4308 | Respaldo de cama | Carpintería | material | Placa MDF 18 mm | 8 | placa | 62000 |
| ot-4308-ql02 | OT4308 | Respaldo de cama | Carpintería | horas |  | 36 | h | 8500 |
| ot-4308-ql03 | OT4308 | Respaldo de cama | Tapicería | material | Espuma alta densidad 5 cm | 6 | plancha | 46000 |
| ot-4308-ql04 | OT4308 | Respaldo de cama | Tapicería | material | Tela tapicería antimanchas | 18 | m | 28000 |
| ot-4308-ql05 | OT4308 | Respaldo de cama | Tapicería | horas |  | 48 | h | 8200 |
| ot-4308-ql06 | OT4308 | Mesa de luz | Carpintería | material | Melamina blanca 18 mm | 14 | placa | 58000 |
| ot-4308-ql07 | OT4308 | Mesa de luz | Carpintería | material | Corredera telescópica 45 cm | 24 | par | 11000 |
| ot-4308-ql08 | OT4308 | Mesa de luz | Carpintería | horas |  | 96 | h | 8500 |
| ot-4308-ql09 | OT4308 | Mesa de luz | Herrería | material | Caño estructural 40×40 | 12 | barra 6 m | 38000 |
| ot-4308-ql10 | OT4308 | Mesa de luz | Herrería | horas |  | 72 | h | 9000 |
| ot-4308-ql11 | OT4308 | Mesa de luz | Pintura y lustre | material | Pintura poliuretánica | 8 | litro | 24000 |
| ot-4308-ql12 | OT4308 | Mesa de luz | Pintura y lustre | horas |  | 36 | h | 8000 |
| ot-4307-ql01 | OT4307 | Biblioteca | Carpintería | material | Melamina blanca 18 mm | 6 | placa | 58000 |
| ot-4307-ql02 | OT4307 | Biblioteca | Carpintería | material | Placa MDF 18 mm | 3 | placa | 62000 |
| ot-4307-ql03 | OT4307 | Biblioteca | Carpintería | horas |  | 40 | h | 8500 |
| ot-4307-ql04 | OT4307 | Biblioteca | Pintura y lustre | material | Laca nitro | 4 | litro | 14000 |
| ot-4307-ql05 | OT4307 | Biblioteca | Pintura y lustre | horas |  | 10 | h | 8000 |
| ot-4307-ql06 | OT4307 | Escritorio | Carpintería | material | Enchapado roble 18 mm | 2 | placa | 120000 |
| ot-4307-ql07 | OT4307 | Escritorio | Carpintería | material | Placa MDF 18 mm | 2 | placa | 62000 |
| ot-4307-ql08 | OT4307 | Escritorio | Carpintería | material | Corredera telescópica 45 cm | 3 | par | 11000 |
| ot-4307-ql09 | OT4307 | Escritorio | Carpintería | horas |  | 20 | h | 8500 |
| ot-4307-ql10 | OT4307 | Escritorio | Herrería | material | Caño estructural 40×40 | 3 | barra 6 m | 38000 |
| ot-4307-ql11 | OT4307 | Escritorio | Herrería | horas |  | 24 | h | 9000 |
| ot-4307-ql12 | OT4307 | Escritorio | Pintura y lustre | horas |  | 6 | h | 8000 |
| ot-4306-ql01 | OT4306 | Barra | Carpintería | material | Placa MDF 18 mm | 5 | placa | 62000 |
| ot-4306-ql02 | OT4306 | Barra | Carpintería | material | Tapacanto PVC 22 mm | 30 | m | 900 |
| ot-4306-ql03 | OT4306 | Barra | Carpintería | horas |  | 48 | h | 8500 |
| ot-4306-ql04 | OT4306 | Barra | Pintura y lustre | material | Pintura poliuretánica | 4 | litro | 24000 |
| ot-4306-ql05 | OT4306 | Barra | Pintura y lustre | horas |  | 12 | h | 8000 |
| ot-4306-ql06 | OT4306 | Mesa | Carpintería | material | Multilaminado fenólico 18 mm | 6 | placa | 95000 |
| ot-4306-ql07 | OT4306 | Mesa | Carpintería | horas |  | 40 | h | 8500 |
| ot-4306-ql08 | OT4306 | Mesa | Herrería | material | Caño estructural 40×40 | 4 | barra 6 m | 38000 |
| ot-4306-ql09 | OT4306 | Mesa | Herrería | horas |  | 24 | h | 9000 |
| ot-4306-ql10 | OT4306 | Silla | Herrería | material | Caño estructural 40×40 | 10 | barra 6 m | 38000 |
| ot-4306-ql11 | OT4306 | Silla | Herrería | horas |  | 48 | h | 9000 |
| ot-4306-ql12 | OT4306 | Silla | Tapicería | material | Espuma alta densidad 5 cm | 3 | plancha | 46000 |
| ot-4306-ql13 | OT4306 | Silla | Tapicería | material | Tela tapicería antimanchas | 9 | m | 28000 |
| ot-4306-ql14 | OT4306 | Silla | Tapicería | horas |  | 36 | h | 8200 |
| ot-4306-ql15 | OT4306 | Silla | Pintura y lustre | material | Pintura poliuretánica | 3 | litro | 24000 |
| ot-4306-ql16 | OT4306 | Silla | Pintura y lustre | horas |  | 18 | h | 8000 |
| ot-4305-ql01 | OT4305 | Mostrador de recepción | Carpintería | material | Enchapado roble 18 mm | 3 | placa | 120000 |
| ot-4305-ql02 | OT4305 | Mostrador de recepción | Carpintería | material | Placa MDF 18 mm | 3 | placa | 62000 |
| ot-4305-ql03 | OT4305 | Mostrador de recepción | Carpintería | horas |  | 56 | h | 8500 |
| ot-4305-ql04 | OT4305 | Mostrador de recepción | Pintura y lustre | material | Laca nitro | 3 | litro | 14000 |
| ot-4305-ql05 | OT4305 | Mostrador de recepción | Pintura y lustre | horas |  | 10 | h | 8000 |
| ot-4305-ql06 | OT4305 | Mueble de guardado | Carpintería | material | Melamina blanca 18 mm | 6 | placa | 58000 |
| ot-4305-ql07 | OT4305 | Mueble de guardado | Carpintería | material | Corredera telescópica 45 cm | 8 | par | 11000 |
| ot-4305-ql08 | OT4305 | Mueble de guardado | Carpintería | horas |  | 40 | h | 8500 |
| ot-4305-ql09 | OT4305 | Mueble de guardado | Pintura y lustre | horas |  | 8 | h | 8000 |
| ot-4305-ql10 | OT4305 | Sillón de espera | Herrería | material | Caño estructural 40×40 | 3 | barra 6 m | 38000 |
| ot-4305-ql11 | OT4305 | Sillón de espera | Herrería | horas |  | 18 | h | 9000 |
| ot-4305-ql12 | OT4305 | Sillón de espera | Pintura y lustre | material | Pintura poliuretánica | 2 | litro | 24000 |
| ot-4305-ql13 | OT4305 | Sillón de espera | Pintura y lustre | horas |  | 6 | h | 8000 |
| ot-4304-ql01 | OT4304 | Mostrador | Carpintería | material | Placa MDF 18 mm | 6 | placa | 62000 |
| ot-4304-ql02 | OT4304 | Mostrador | Carpintería | material | Enchapado roble 18 mm | 2 | placa | 120000 |
| ot-4304-ql03 | OT4304 | Mostrador | Carpintería | horas |  | 32 | h | 8500 |
| ot-4304-ql04 | OT4304 | Mostrador | Pintura y lustre | material | Laca nitro | 4 | litro | 14000 |
| ot-4304-ql05 | OT4304 | Mostrador | Pintura y lustre | horas |  | 12 | h | 8000 |
| ot-4304-ql06 | OT4304 | Mostrador | Armado y montaje | horas |  | 8 | h | 8000 |
| ot-4304-ql07 | OT4304 | Exhibidor de pared | Carpintería | material | Placa MDF 18 mm | 6 | placa | 62000 |
| ot-4304-ql08 | OT4304 | Exhibidor de pared | Carpintería | horas |  | 42 | h | 8500 |
| ot-4304-ql09 | OT4304 | Exhibidor de pared | Pintura y lustre | material | Laca nitro | 3 | litro | 14000 |
| ot-4304-ql10 | OT4304 | Exhibidor de pared | Pintura y lustre | horas |  | 18 | h | 8000 |
| ot-4303-ql01 | OT4303 | Escritorio | Carpintería | material | Melamina blanca 18 mm | 12 | placa | 58000 |
| ot-4303-ql02 | OT4303 | Escritorio | Carpintería | material | Tapacanto PVC 22 mm | 60 | m | 900 |
| ot-4303-ql03 | OT4303 | Escritorio | Carpintería | horas |  | 80 | h | 8500 |
| ot-4303-ql04 | OT4303 | Escritorio | Herrería | material | Caño estructural 40×40 | 8 | barra 6 m | 38000 |
| ot-4303-ql05 | OT4303 | Escritorio | Herrería | horas |  | 40 | h | 9000 |
| ot-4303-ql06 | OT4303 | Escritorio | Pintura y lustre | material | Pintura poliuretánica | 5 | litro | 24000 |
| ot-4303-ql07 | OT4303 | Escritorio | Pintura y lustre | horas |  | 20 | h | 8000 |
| ot-4303-ql08 | OT4303 | Escritorio | Armado y montaje | material | Tornillo 4×40 (caja de 100) | 4 | caja | 5500 |
| ot-4303-ql09 | OT4303 | Escritorio | Armado y montaje | horas |  | 16 | h | 8000 |
| ot-4303-ql10 | OT4303 | Locker | Carpintería | material | Melamina blanca 18 mm | 8 | placa | 58000 |
| ot-4303-ql11 | OT4303 | Locker | Carpintería | material | Bisagra cazoleta | 16 | unidad | 2600 |
| ot-4303-ql12 | OT4303 | Locker | Carpintería | horas |  | 40 | h | 8500 |
| ot-4303-ql13 | OT4303 | Locker | Pintura y lustre | horas |  | 8 | h | 8000 |
| ot-4302-ql01 | OT4302 | Barra | Carpintería | material | Placa MDF 18 mm | 6 | placa | 62000 |
| ot-4302-ql02 | OT4302 | Barra | Carpintería | material | Multilaminado fenólico 18 mm | 2 | placa | 95000 |
| ot-4302-ql03 | OT4302 | Barra | Carpintería | horas |  | 40 | h | 8500 |
| ot-4302-ql04 | OT4302 | Barra | Herrería | material | Caño estructural 40×40 | 4 | barra 6 m | 38000 |
| ot-4302-ql05 | OT4302 | Barra | Herrería | material | Planchuela 1½″ × 3/16″ | 2 | barra 6 m | 21000 |
| ot-4302-ql06 | OT4302 | Barra | Herrería | horas |  | 24 | h | 9000 |
| ot-4302-ql07 | OT4302 | Barra | Pintura y lustre | material | Pintura poliuretánica | 6 | litro | 24000 |
| ot-4302-ql08 | OT4302 | Barra | Pintura y lustre | horas |  | 12 | h | 8000 |
| ot-4302-ql09 | OT4302 | Banqueta | Herrería | material | Caño estructural 40×40 | 6 | barra 6 m | 38000 |
| ot-4302-ql10 | OT4302 | Banqueta | Herrería | horas |  | 32 | h | 9000 |
| ot-4302-ql11 | OT4302 | Banqueta | Tapicería | material | Espuma alta densidad 5 cm | 2 | plancha | 46000 |
| ot-4302-ql12 | OT4302 | Banqueta | Tapicería | material | Tela tapicería antimanchas | 6 | m | 28000 |
| ot-4302-ql13 | OT4302 | Banqueta | Tapicería | horas |  | 16 | h | 8200 |
| ot-4302-ql14 | OT4302 | Banqueta | Pintura y lustre | material | Pintura poliuretánica | 4 | litro | 24000 |
| ot-4302-ql15 | OT4302 | Banqueta | Pintura y lustre | horas |  | 8 | h | 8000 |
| ot-4301-ql01 | OT4301 | Estantería alta | Carpintería | material | Placa MDF 18 mm | 10 | placa | 62000 |
| ot-4301-ql02 | OT4301 | Estantería alta | Carpintería | material | Tapacanto PVC 22 mm | 80 | m | 900 |
| ot-4301-ql03 | OT4301 | Estantería alta | Carpintería | horas |  | 64 | h | 8500 |
| ot-4301-ql04 | OT4301 | Estantería alta | Pintura y lustre | material | Laca nitro | 8 | litro | 14000 |
| ot-4301-ql05 | OT4301 | Estantería alta | Pintura y lustre | horas |  | 16 | h | 8000 |
| ot-4301-ql06 | OT4301 | Mesa de exhibición | Carpintería | material | Enchapado roble 18 mm | 3 | placa | 120000 |
| ot-4301-ql07 | OT4301 | Mesa de exhibición | Carpintería | horas |  | 24 | h | 8500 |
| ot-4301-ql08 | OT4301 | Mesa de exhibición | Herrería | material | Caño estructural 40×40 | 2 | barra 6 m | 38000 |
| ot-4301-ql09 | OT4301 | Mesa de exhibición | Herrería | horas |  | 10 | h | 9000 |
| ot-4301-ql10 | OT4301 | Mesa de exhibición | Pintura y lustre | material | Laca nitro | 2 | litro | 14000 |
| ot-4301-ql11 | OT4301 | Mesa de exhibición | Pintura y lustre | horas |  | 6 | h | 8000 |

## Horas de diseño/administración cotizadas

Archivo: `datos/horas_personal_cotizadas.csv` · 18 registros.

| id | ot | categoria | horas | costo_hora |
| --- | --- | --- | --- | --- |
| ot-4310-st1 | OT4310 | Diseñador | 4 | 12000 |
| ot-4309-st1 | OT4309 | Diseñador | 6 | 12000 |
| ot-4308-st1 | OT4308 | Diseñador | 16 | 12000 |
| ot-4308-st2 | OT4308 | Administrativo | 8 | 11000 |
| ot-4307-st1 | OT4307 | Diseñador | 10 | 12000 |
| ot-4307-st2 | OT4307 | Administrativo | 3 | 11000 |
| ot-4306-st1 | OT4306 | Diseñador | 14 | 12000 |
| ot-4306-st2 | OT4306 | Administrativo | 6 | 11000 |
| ot-4305-st1 | OT4305 | Diseñador | 10 | 12000 |
| ot-4305-st2 | OT4305 | Administrativo | 4 | 11000 |
| ot-4304-st1 | OT4304 | Diseñador | 12 | 12000 |
| ot-4304-st2 | OT4304 | Administrativo | 4 | 11000 |
| ot-4303-st1 | OT4303 | Diseñador | 8 | 12000 |
| ot-4303-st2 | OT4303 | Administrativo | 6 | 11000 |
| ot-4302-st1 | OT4302 | Diseñador | 8 | 12000 |
| ot-4302-st2 | OT4302 | Administrativo | 4 | 11000 |
| ot-4301-st1 | OT4301 | Diseñador | 10 | 12000 |
| ot-4301-st2 | OT4301 | Administrativo | 6 | 11000 |

## Parámetros de cada cotización

Archivo: `datos/cotizacion_parametros.csv` · 11 registros.

| ot | rent_materiales | rent_mano_obra | costos_generales | precio_lista_manual | descuento | cuotas |
| --- | --- | --- | --- | --- | --- | --- |
| OT4311 | 30 | 40 | Provisión para imprevistos 3 % |  | 0 |  |
| OT4310 | 30 | 40 | Provisión para imprevistos 3 % | 2710000 | 0 |  |
| OT4309 | 30 | 40 | Provisión para imprevistos 3 % | 2440000 | 0 | Seña 50 % 2026-11-02 · Saldo 50 % 2026-12-18 |
| OT4308 | 30 | 40 | Provisión para imprevistos 3 % | 9080000 | 250000 | Seña 40 % 2026-10-23 · Cuota 40 % 2026-11-27 · Saldo 20 % 2026-12-23 |
| OT4307 | 30 | 40 | Provisión para imprevistos 3 % | 3330000 | 0 | Seña 50 % 2026-10-01 · Cuota 30 % 2026-11-13 · Saldo 20 % 2026-12-11 |
| OT4306 | 30 | 40 | Provisión para imprevistos 3 % | 6620000 | 150000 | Seña 50 % 2026-09-15 · Cuota 30 % 2026-10-30 · Saldo 20 % 2026-11-27 |
| OT4305 | 30 | 40 | Provisión para imprevistos 3 % | 4030000 | 0 | Seña 30 % 2026-08-20 · Cuota 40 % 2026-09-21 · Saldo 30 % 2026-10-30 |
| OT4304 | 30 | 40 | Provisión para imprevistos 3 % | 3500000 | 0 | Seña 50 % 2026-08-12 · Cuota 25 % 2026-09-25 · Saldo 25 % 2026-10-30 |
| OT4303 | 30 | 40 | Provisión para imprevistos 3 % | 5750000 | 120000 | Seña 40 % 2026-08-05 · Cuota 40 % 2026-09-15 · Saldo 20 % 2026-10-21 |
| OT4302 | 30 | 40 | Provisión para imprevistos 3 % | 4370000 | 0 | Seña 40 % 2026-07-03 · Cuota 1 30 % 2026-08-03 · Saldo 30 % 2026-09-04 |
| OT4301 | 30 | 40 | Provisión para imprevistos 3 % | 3920000 | 0 | Seña 50 % 2026-06-10 · Saldo 50 % 2026-08-07 |

## Cobros previstos vigentes (señas y cuotas)

Archivo: `datos/cobros_previstos.csv` · 23 registros.

| id | ot | concepto | fecha | importe |
| --- | --- | --- | --- | --- |
| ot-4308-pl1 | OT4308 | Seña | 2026-10-23 | 3532000 |
| ot-4308-pl2 | OT4308 | Cuota | 2026-11-27 | 3532000 |
| ot-4308-pl3 | OT4308 | Saldo | 2026-12-23 | 1766000 |
| ot-4307-pl1 | OT4307 | Seña | 2026-10-01 | 1665000 |
| ot-4307-pl2 | OT4307 | Cuota | 2026-11-13 | 999000 |
| ot-4307-pl3 | OT4307 | Saldo | 2026-12-11 | 666000 |
| ot-4306-pl1 | OT4306 | Seña | 2026-09-15 | 3235000 |
| ot-4306-pl2 | OT4306 | Cuota | 2026-10-30 | 1941000 |
| ot-4306-pl3 | OT4306 | Saldo | 2026-11-27 | 1294000 |
| ot-4305-pl1 | OT4305 | Seña | 2026-08-20 | 1209000 |
| ot-4305-pl2 | OT4305 | Cuota | 2026-09-21 | 1612000 |
| ot-4305-pl3 | OT4305 | Saldo | 2026-10-30 | 1209000 |
| ot-4304-pl1 | OT4304 | Seña | 2026-08-12 | 1750000 |
| ot-4304-pl2 | OT4304 | Cuota | 2026-09-25 | 875000 |
| ot-4304-pl3 | OT4304 | Saldo | 2026-10-30 | 875000 |
| ot-4303-pl1 | OT4303 | Seña | 2026-08-05 | 2252000 |
| ot-4303-pl2 | OT4303 | Cuota | 2026-09-15 | 2252000 |
| ot-4303-pl3 | OT4303 | Saldo | 2026-10-21 | 1126000 |
| ot-4302-pl1 | OT4302 | Seña | 2026-07-03 | 1748000 |
| ot-4302-pl2 | OT4302 | Cuota 1 | 2026-08-03 | 1311000 |
| ot-4302-pl3 | OT4302 | Saldo | 2026-09-04 | 1311000 |
| ot-4301-pl1 | OT4301 | Seña | 2026-06-10 | 1960000 |
| ot-4301-pl2 | OT4301 | Saldo | 2026-08-07 | 1960000 |

## Adicionales aprobados

Archivo: `datos/adicionales.csv` · 1 registros.

| id | ot | mueble | rubro | lineas | precio | fecha |
| --- | --- | --- | --- | --- | --- | --- |
| adi-0635 | OT4305 | Sillón de espera | Tapicería | horas 12 × 8200 · Espuma alta densidad 5 cm 1 × 46000 · Tela tapicería antimanchas 4 × 28000 | 420000 | 2026-09-30 |

## Pedidos de rubro de Planta

Archivo: `datos/pedidos_rubro.csv` · 2 registros.

| id | ot | mueble | rubro | horas | estado | fecha | nota |
| --- | --- | --- | --- | --- | --- | --- | --- |
| prb-0631 | OT4305 | Sillón de espera | Tapicería | 12 | approved | 2026-09-29 | El cliente pidió tapizar asiento y respaldo |
| prb-0659 | OT4305 | Mostrador de recepción | Armado y montaje | 6 | open | 2026-10-16 | Hay que armar el mostrador en el lugar |

## BOM: versiones y líneas

Archivo: `datos/bom.csv` · 75 registros.

| bom | ot | version | estado | publicado | linea | mueble | rubro | material | cantidad |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bom-0016 | OT4301 | 1 | published | 2026-06-09 | boml-0017 | Estantería alta | Carpintería | Placa MDF 18 mm | 10 |
| bom-0016 | OT4301 | 1 | published | 2026-06-09 | boml-0018 | Estantería alta | Carpintería | Tapacanto PVC 22 mm | 80 |
| bom-0016 | OT4301 | 1 | published | 2026-06-09 | boml-0019 | Estantería alta | Pintura y lustre | Laca nitro | 8 |
| bom-0016 | OT4301 | 1 | published | 2026-06-09 | boml-0020 | Mesa de exhibición | Carpintería | Enchapado roble 18 mm | 3 |
| bom-0016 | OT4301 | 1 | published | 2026-06-09 | boml-0021 | Mesa de exhibición | Herrería | Caño estructural 40×40 | 2 |
| bom-0016 | OT4301 | 1 | published | 2026-06-09 | boml-0022 | Mesa de exhibición | Pintura y lustre | Laca nitro | 2 |
| bom-0124 | OT4302 | 1 | published | 2026-07-02 | boml-0125 | Barra | Carpintería | Placa MDF 18 mm | 6 |
| bom-0124 | OT4302 | 1 | published | 2026-07-02 | boml-0126 | Barra | Carpintería | Multilaminado fenólico 18 mm | 2 |
| bom-0124 | OT4302 | 1 | published | 2026-07-02 | boml-0127 | Barra | Herrería | Caño estructural 40×40 | 4 |
| bom-0124 | OT4302 | 1 | published | 2026-07-02 | boml-0128 | Barra | Herrería | Planchuela 1½″ × 3/16″ | 2 |
| bom-0124 | OT4302 | 1 | published | 2026-07-02 | boml-0129 | Barra | Pintura y lustre | Pintura poliuretánica | 6 |
| bom-0124 | OT4302 | 1 | published | 2026-07-02 | boml-0130 | Banqueta | Herrería | Caño estructural 40×40 | 6 |
| bom-0124 | OT4302 | 1 | published | 2026-07-02 | boml-0131 | Banqueta | Tapicería | Espuma alta densidad 5 cm | 2 |
| bom-0124 | OT4302 | 1 | published | 2026-07-02 | boml-0132 | Banqueta | Tapicería | Tela tapicería antimanchas | 6 |
| bom-0124 | OT4302 | 1 | published | 2026-07-02 | boml-0133 | Banqueta | Pintura y lustre | Pintura poliuretánica | 4 |
| bom-0274 | OT4303 | 1 | published | 2026-08-06 | boml-0275 | Escritorio | Carpintería | Melamina blanca 18 mm | 12 |
| bom-0274 | OT4303 | 1 | published | 2026-08-06 | boml-0276 | Escritorio | Carpintería | Tapacanto PVC 22 mm | 60 |
| bom-0274 | OT4303 | 1 | published | 2026-08-06 | boml-0277 | Escritorio | Herrería | Caño estructural 40×40 | 8 |
| bom-0274 | OT4303 | 1 | published | 2026-08-06 | boml-0278 | Escritorio | Pintura y lustre | Pintura poliuretánica | 5 |
| bom-0274 | OT4303 | 1 | published | 2026-08-06 | boml-0279 | Escritorio | Armado y montaje | Tornillo 4×40 (caja de 100) | 4 |
| bom-0274 | OT4303 | 1 | published | 2026-08-06 | boml-0280 | Locker | Carpintería | Melamina blanca 18 mm | 8 |
| bom-0274 | OT4303 | 1 | published | 2026-08-06 | boml-0281 | Locker | Carpintería | Bisagra cazoleta | 16 |
| bom-0410 | OT4304 | 1 | published | 2026-08-12 | boml-0411 | Mostrador | Carpintería | Placa MDF 18 mm | 6 |
| bom-0410 | OT4304 | 1 | published | 2026-08-12 | boml-0412 | Mostrador | Carpintería | Enchapado roble 18 mm | 2 |
| bom-0410 | OT4304 | 1 | published | 2026-08-12 | boml-0413 | Mostrador | Pintura y lustre | Laca nitro | 4 |
| bom-0410 | OT4304 | 1 | published | 2026-08-12 | boml-0414 | Exhibidor de pared | Carpintería | Placa MDF 18 mm | 6 |
| bom-0410 | OT4304 | 1 | published | 2026-08-12 | boml-0415 | Exhibidor de pared | Pintura y lustre | Laca nitro | 3 |
| bom-0516 | OT4305 | 1 | published | 2026-08-21 | boml-0517 | Mostrador de recepción | Carpintería | Enchapado roble 18 mm | 3 |
| bom-0516 | OT4305 | 1 | published | 2026-08-21 | boml-0518 | Mostrador de recepción | Carpintería | Placa MDF 18 mm | 3 |
| bom-0516 | OT4305 | 1 | published | 2026-08-21 | boml-0519 | Mostrador de recepción | Pintura y lustre | Laca nitro | 3 |
| bom-0516 | OT4305 | 1 | published | 2026-08-21 | boml-0520 | Mueble de guardado | Carpintería | Melamina blanca 18 mm | 6 |
| bom-0516 | OT4305 | 1 | published | 2026-08-21 | boml-0521 | Mueble de guardado | Carpintería | Corredera telescópica 45 cm | 8 |
| bom-0516 | OT4305 | 1 | published | 2026-08-21 | boml-0522 | Sillón de espera | Herrería | Caño estructural 40×40 | 3 |
| bom-0516 | OT4305 | 1 | published | 2026-08-21 | boml-0523 | Sillón de espera | Pintura y lustre | Pintura poliuretánica | 2 |
| bom-0639 | OT4305 | 2 | published | 2026-09-30 | boml-0640 | Mostrador de recepción | Carpintería | Enchapado roble 18 mm | 3 |
| bom-0639 | OT4305 | 2 | published | 2026-09-30 | boml-0641 | Mostrador de recepción | Carpintería | Placa MDF 18 mm | 3 |
| bom-0639 | OT4305 | 2 | published | 2026-09-30 | boml-0642 | Mostrador de recepción | Pintura y lustre | Laca nitro | 3 |
| bom-0639 | OT4305 | 2 | published | 2026-09-30 | boml-0643 | Mueble de guardado | Carpintería | Melamina blanca 18 mm | 6 |
| bom-0639 | OT4305 | 2 | published | 2026-09-30 | boml-0644 | Mueble de guardado | Carpintería | Corredera telescópica 45 cm | 8 |
| bom-0639 | OT4305 | 2 | published | 2026-09-30 | boml-0645 | Sillón de espera | Herrería | Caño estructural 40×40 | 3 |
| bom-0639 | OT4305 | 2 | published | 2026-09-30 | boml-0646 | Sillón de espera | Pintura y lustre | Pintura poliuretánica | 2 |
| bom-0639 | OT4305 | 2 | published | 2026-09-30 | boml-0647 | Sillón de espera | Tapicería | Espuma alta densidad 5 cm | 1 |
| bom-0639 | OT4305 | 2 | published | 2026-09-30 | boml-0648 | Sillón de espera | Tapicería | Tela tapicería antimanchas | 4 |
| bom-0668 | OT4306 | 1 | published | 2026-09-16 | boml-0669 | Barra | Carpintería | Placa MDF 18 mm | 5 |
| bom-0668 | OT4306 | 1 | published | 2026-09-16 | boml-0670 | Barra | Carpintería | Tapacanto PVC 22 mm | 30 |
| bom-0668 | OT4306 | 1 | published | 2026-09-16 | boml-0671 | Barra | Pintura y lustre | Pintura poliuretánica | 4 |
| bom-0668 | OT4306 | 1 | published | 2026-09-16 | boml-0672 | Mesa | Carpintería | Multilaminado fenólico 18 mm | 6 |
| bom-0668 | OT4306 | 1 | published | 2026-09-16 | boml-0673 | Mesa | Herrería | Caño estructural 40×40 | 4 |
| bom-0668 | OT4306 | 1 | published | 2026-09-16 | boml-0674 | Silla | Herrería | Caño estructural 40×40 | 10 |
| bom-0668 | OT4306 | 1 | published | 2026-09-16 | boml-0675 | Silla | Tapicería | Espuma alta densidad 5 cm | 3 |
| bom-0668 | OT4306 | 1 | published | 2026-09-16 | boml-0676 | Silla | Tapicería | Tela tapicería antimanchas | 9 |
| bom-0668 | OT4306 | 1 | published | 2026-09-16 | boml-0677 | Silla | Pintura y lustre | Pintura poliuretánica | 3 |
| bom-0718 | OT4307 | 1 | published | 2026-10-02 | boml-0719 | Biblioteca | Carpintería | Melamina blanca 18 mm | 6 |
| bom-0718 | OT4307 | 1 | published | 2026-10-02 | boml-0720 | Biblioteca | Carpintería | Placa MDF 18 mm | 3 |
| bom-0718 | OT4307 | 1 | published | 2026-10-02 | boml-0721 | Biblioteca | Pintura y lustre | Laca nitro | 4 |
| bom-0718 | OT4307 | 1 | published | 2026-10-02 | boml-0722 | Escritorio | Carpintería | Enchapado roble 18 mm | 2 |
| bom-0718 | OT4307 | 1 | published | 2026-10-02 | boml-0723 | Escritorio | Carpintería | Placa MDF 18 mm | 2 |
| bom-0718 | OT4307 | 1 | published | 2026-10-02 | boml-0724 | Escritorio | Carpintería | Corredera telescópica 45 cm | 3 |
| bom-0718 | OT4307 | 1 | published | 2026-10-02 | boml-0725 | Escritorio | Herrería | Caño estructural 40×40 | 3 |
| bom-0728 | OT4307 | 2 | published | 2026-10-06 | boml-0736 | Biblioteca | Carpintería | Melamina blanca 18 mm | 8 |
| bom-0728 | OT4307 | 2 | published | 2026-10-06 | boml-0737 | Biblioteca | Carpintería | Placa MDF 18 mm | 3 |
| bom-0728 | OT4307 | 2 | published | 2026-10-06 | boml-0738 | Biblioteca | Pintura y lustre | Laca nitro | 4 |
| bom-0728 | OT4307 | 2 | published | 2026-10-06 | boml-0739 | Escritorio | Carpintería | Enchapado roble 18 mm | 2 |
| bom-0728 | OT4307 | 2 | published | 2026-10-06 | boml-0740 | Escritorio | Carpintería | Placa MDF 18 mm | 2 |
| bom-0728 | OT4307 | 2 | published | 2026-10-06 | boml-0741 | Escritorio | Carpintería | Corredera telescópica 45 cm | 3 |
| bom-0728 | OT4307 | 2 | published | 2026-10-06 | boml-0742 | Escritorio | Herrería | Caño estructural 40×40 | 3 |
| bom-0728 | OT4307 | 2 | published | 2026-10-06 | boml-0743 | Biblioteca | Carpintería | Bisagra cazoleta | 8 |
| bom-0728 | OT4307 | 2 | published | 2026-10-06 | boml-0744 | Biblioteca | Carpintería | Tapacanto PVC 22 mm | 40 |
| bom-0839 | OT4308 | 1 | draft |  | boml-0840 | Respaldo de cama | Carpintería | Placa MDF 18 mm | 8 |
| bom-0839 | OT4308 | 1 | draft |  | boml-0841 | Respaldo de cama | Tapicería | Espuma alta densidad 5 cm | 6 |
| bom-0839 | OT4308 | 1 | draft |  | boml-0842 | Respaldo de cama | Tapicería | Tela tapicería antimanchas | 18 |
| bom-0839 | OT4308 | 1 | draft |  | boml-0843 | Mesa de luz | Carpintería | Melamina blanca 18 mm | 14 |
| bom-0839 | OT4308 | 1 | draft |  | boml-0844 | Mesa de luz | Carpintería | Corredera telescópica 45 cm | 24 |
| bom-0839 | OT4308 | 1 | draft |  | boml-0845 | Mesa de luz | Herrería | Caño estructural 40×40 | 12 |
| bom-0839 | OT4308 | 1 | draft |  | boml-0846 | Mesa de luz | Pintura y lustre | Pintura poliuretánica | 8 |

## Pedidos adicionales de material

Archivo: `datos/pedidos_material.csv` · 1 registros.

| id | ot | mueble | material | cantidad | estado | fecha | nota |
| --- | --- | --- | --- | --- | --- | --- | --- |
| pmat-0830 | OT4306 | Silla | Tela tapicería antimanchas | 3 | active | 2026-10-16 | Se manchó un corte |

## Órdenes de compra

Archivo: `datos/ordenes_compra.csv` · 21 registros.

| id | numero | proveedor | fecha | llegada_comprometida | comprobante |
| --- | --- | --- | --- | --- | --- |
| oc-0032 | OC-0001 | Maderera Río Bermejo | 2026-06-10 | 2026-06-15 |  |
| oc-0034 | OC-0002 | Metalúrgica Cerro Blanco | 2026-06-10 | 2026-06-17 |  |
| oc-0036 | OC-0003 | Pinturería Arcoíris del Sur | 2026-06-11 | 2026-06-15 |  |
| oc-0140 | OC-0004 | Maderera Río Bermejo | 2026-07-02 | 2026-07-06 |  |
| oc-0144 | OC-0005 | Metalúrgica Cerro Blanco | 2026-07-02 | 2026-07-10 |  |
| oc-0147 | OC-0006 | Textiles Ñandú | 2026-07-20 | 2026-08-05 |  |
| oc-0150 | OC-0007 | Pinturería Arcoíris del Sur | 2026-07-20 | 2026-08-10 |  |
| oc-0286 | OC-0008 | Maderera Río Bermejo | 2026-08-07 | 2026-08-17 |  |
| oc-0288 | OC-0009 | Metalúrgica Cerro Blanco | 2026-08-07 | 2026-08-14 |  |
| oc-0290 | OC-0010 | Pinturería Arcoíris del Sur | 2026-08-25 | 2026-09-10 |  |
| oc-0423 | OC-0011 | Maderera Río Bermejo | 2026-08-13 | 2026-08-24 |  |
| oc-0440 | OC-0012 | Pinturería Arcoíris del Sur | 2026-09-14 | 2026-09-21 |  |
| oc-0530 | OC-0013 | Maderera Río Bermejo | 2026-08-24 | 2026-08-31 |  |
| oc-0532 | OC-0014 | Herrajes Torre Alta | 2026-08-24 | 2026-09-04 |  |
| oc-0534 | OC-0015 | Metalúrgica Cerro Blanco | 2026-09-07 | 2026-09-14 |  |
| oc-0554 | OC-0016 | Pinturería Arcoíris del Sur | 2026-10-05 | 2026-10-08 |  |
| oc-0652 | OC-0017 | Textiles Ñandú | 2026-10-01 | 2026-10-08 |  |
| oc-0688 | OC-0018 | Metalúrgica Cerro Blanco | 2026-09-17 | 2026-09-25 |  |
| oc-0691 | OC-0019 | Textiles Ñandú | 2026-09-18 | 2026-09-26 |  |
| oc-0751 | OC-0020 | Maderera Río Bermejo | 2026-10-05 | 2026-10-13 | A-0003-00018422 2026-10-13 1300000 |
| oc-0763 | OC-0021 | Herrajes Torre Alta | 2026-10-14 | 2026-10-27 |  |

## Líneas de OC (por OT)

Archivo: `datos/lineas_oc.csv` · 37 registros.

| id | oc | ot | mueble | material | cantidad | precio_unitario |
| --- | --- | --- | --- | --- | --- | --- |
| ocl-0030 | OC-0001 | OT4301 | Estantería alta | Placa MDF 18 mm | 12 | 61000 |
| ocl-0031 | OC-0001 | OT4301 | Mesa de exhibición | Enchapado roble 18 mm | 3 | 118000 |
| ocl-0033 | OC-0002 | OT4301 | Mesa de exhibición | Caño estructural 40×40 | 2 | 37500 |
| ocl-0035 | OC-0003 | OT4301 | Estantería alta | Laca nitro | 6 | 14200 |
| ocl-0138 | OC-0004 | OT4302 | Barra | Placa MDF 18 mm | 6 | 61500 |
| ocl-0139 | OC-0004 | OT4302 | Barra | Multilaminado fenólico 18 mm | 2 | 96000 |
| ocl-0141 | OC-0005 | OT4302 | Barra | Caño estructural 40×40 | 4 | 38500 |
| ocl-0142 | OC-0005 | OT4302 | Barra | Planchuela 1½″ × 3/16″ | 2 | 21000 |
| ocl-0143 | OC-0005 | OT4302 | Banqueta | Caño estructural 40×40 | 6 | 38500 |
| ocl-0145 | OC-0006 | OT4302 | Banqueta | Espuma alta densidad 5 cm | 2 | 47000 |
| ocl-0146 | OC-0006 | OT4302 | Banqueta | Tela tapicería antimanchas | 6 | 27500 |
| ocl-0148 | OC-0007 | OT4302 | Barra | Pintura poliuretánica | 6 | 24500 |
| ocl-0149 | OC-0007 | OT4302 | Banqueta | Pintura poliuretánica | 4 | 24500 |
| ocl-0285 | OC-0008 | OT4303 | Escritorio | Melamina blanca 18 mm | 15 | 57500 |
| ocl-0287 | OC-0009 | OT4303 | Escritorio | Caño estructural 40×40 | 8 | 39000 |
| ocl-0289 | OC-0010 | OT4303 | Escritorio | Pintura poliuretánica | 5 | 25000 |
| ocl-0420 | OC-0011 | OT4304 | Mostrador | Placa MDF 18 mm | 6 | 63000 |
| ocl-0421 | OC-0011 | OT4304 | Mostrador | Enchapado roble 18 mm | 2 | 121000 |
| ocl-0422 | OC-0011 | OT4304 | Exhibidor de pared | Placa MDF 18 mm | 8 | 63000 |
| ocl-0439 | OC-0012 | OT4304 | Exhibidor de pared | Laca nitro | 5 | 14500 |
| ocl-0527 | OC-0013 | OT4305 | Mostrador de recepción | Enchapado roble 18 mm | 3 | 122000 |
| ocl-0528 | OC-0013 | OT4305 | Mostrador de recepción | Placa MDF 18 mm | 3 | 63500 |
| ocl-0529 | OC-0013 | OT4305 | Mueble de guardado | Melamina blanca 18 mm | 6 | 58500 |
| ocl-0531 | OC-0014 | OT4305 | Mueble de guardado | Corredera telescópica 45 cm | 8 | 11200 |
| ocl-0533 | OC-0015 | OT4305 | Sillón de espera | Caño estructural 40×40 | 3 | 39500 |
| ocl-0553 | OC-0016 | OT4305 | Mostrador de recepción | Laca nitro | 3 | 14800 |
| ocl-0650 | OC-0017 | OT4305 | Sillón de espera | Espuma alta densidad 5 cm | 1 | 48000 |
| ocl-0651 | OC-0017 | OT4305 | Sillón de espera | Tela tapicería antimanchas | 4 | 28500 |
| ocl-0686 | OC-0018 | OT4306 | Silla | Caño estructural 40×40 | 10 | 39500 |
| ocl-0687 | OC-0018 | OT4306 | Mesa | Caño estructural 40×40 | 4 | 39500 |
| ocl-0689 | OC-0019 | OT4306 | Silla | Espuma alta densidad 5 cm | 3 | 48000 |
| ocl-0690 | OC-0019 | OT4306 | Silla | Tela tapicería antimanchas | 9 | 28500 |
| ocl-0748 | OC-0020 | OT4306 | Mesa | Multilaminado fenólico 18 mm | 6 | 97000 |
| ocl-0749 | OC-0020 | OT4307 | Biblioteca | Melamina blanca 18 mm | 8 | 59000 |
| ocl-0750 | OC-0020 | OT4307 | Escritorio | Enchapado roble 18 mm | 2 | 123000 |
| ocl-0761 | OC-0021 | OT4307 | Biblioteca | Bisagra cazoleta | 8 | 2700 |
| ocl-0762 | OC-0021 | OT4307 | Escritorio | Corredera telescópica 45 cm | 3 | 11500 |

## Materiales recibidos (y reversiones)

Archivo: `datos/recepciones.csv` · 34 registros.

| id | oc | linea | fecha | cantidad | lote | revertida |
| --- | --- | --- | --- | --- | --- | --- |
| rec-0038 | OC-0001 | ocl-0030 | 2026-06-15 | 12 | lote-0037 |  |
| rec-0041 | OC-0001 | ocl-0031 | 2026-06-15 | 3 | lote-0040 |  |
| rec-0045 | OC-0002 | ocl-0033 | 2026-06-17 | 2 | lote-0044 |  |
| rec-0048 | OC-0003 | ocl-0035 | 2026-06-15 | 6 | lote-0047 |  |
| rec-0152 | OC-0004 | ocl-0138 | 2026-07-06 | 6 | lote-0151 |  |
| rec-0155 | OC-0004 | ocl-0139 | 2026-07-06 | 2 | lote-0154 |  |
| rec-0159 | OC-0005 | ocl-0141 | 2026-07-10 | 4 | lote-0158 |  |
| rec-0162 | OC-0005 | ocl-0142 | 2026-07-10 | 2 | lote-0161 |  |
| rec-0165 | OC-0005 | ocl-0143 | 2026-07-10 | 6 | lote-0164 |  |
| rec-0168 | OC-0006 | ocl-0145 | 2026-08-05 | 2 | lote-0167 |  |
| rec-0171 | OC-0006 | ocl-0146 | 2026-08-05 | 6 | lote-0170 |  |
| rec-0174 | OC-0007 | ocl-0148 | 2026-08-10 | 6 | lote-0173 |  |
| rec-0177 | OC-0007 | ocl-0149 | 2026-08-10 | 4 | lote-0176 |  |
| rec-0292 | OC-0008 | ocl-0285 | 2026-08-17 | 15 | lote-0291 |  |
| rec-0296 | OC-0009 | ocl-0287 | 2026-08-14 | 8 | lote-0295 |  |
| rec-0299 | OC-0010 | ocl-0289 | 2026-09-10 | 5 | lote-0298 |  |
| rec-0425 | OC-0011 | ocl-0420 | 2026-08-24 | 6 | lote-0424 |  |
| rec-0428 | OC-0011 | ocl-0421 | 2026-08-24 | 2 | lote-0427 |  |
| rec-0431 | OC-0011 | ocl-0422 | 2026-08-24 | 8 | lote-0430 |  |
| rec-0442 | OC-0012 | ocl-0439 | 2026-09-21 | 5 | lote-0441 |  |
| rec-0536 | OC-0013 | ocl-0527 | 2026-08-31 | 3 | lote-0535 |  |
| rec-0539 | OC-0013 | ocl-0528 | 2026-08-31 | 3 | lote-0538 |  |
| rec-0542 | OC-0013 | ocl-0529 | 2026-08-31 | 6 | lote-0541 |  |
| rec-0546 | OC-0014 | ocl-0531 | 2026-09-04 | 8 | lote-0545 |  |
| rec-0549 | OC-0015 | ocl-0533 | 2026-09-14 | 3 | lote-0548 |  |
| rec-0556 | OC-0016 | ocl-0553 | 2026-10-08 | 3 | lote-0555 |  |
| rec-0654 | OC-0017 | ocl-0650 | 2026-10-08 | 1 | lote-0653 |  |
| rec-0657 | OC-0017 | ocl-0651 | 2026-10-08 | 4 | lote-0656 |  |
| rec-0700 | OC-0018 | ocl-0686 | 2026-09-25 | 10 | lote-0699 |  |
| rec-0703 | OC-0018 | ocl-0687 | 2026-09-25 | 4 | lote-0702 |  |
| rec-0706 | OC-0019 | ocl-0689 | 2026-09-26 | 3 | lote-0705 |  |
| rec-0709 | OC-0019 | ocl-0690 | 2026-09-26 | 9 | lote-0708 |  |
| rec-0753 | OC-0020 | ocl-0748 | 2026-10-13 | 6 | lote-0752 | 2026-10-13: Se contaron 6 placas y llegaron 4 |
| rec-0758 | OC-0020 | ocl-0748 | 2026-10-13 | 4 | lote-0757 |  |

## Pagos a proveedores

Archivo: `datos/pagos_proveedor.csv` · 15 registros.

| id | oc | fecha | importe | ot_explicita | referencia |
| --- | --- | --- | --- | --- | --- |
| pag-0050 | OC-0001 | 2026-06-30 | 1086000 |  | Transferencia 30/6 |
| pag-0051 | OC-0002 | 2026-06-30 | 75000 |  | Transferencia 30/6 |
| pag-0052 | OC-0003 | 2026-07-10 | 85200 |  | Cheque |
| pag-0179 | OC-0004 | 2026-07-20 | 561000 |  | Transferencia |
| pag-0180 | OC-0005 | 2026-07-31 | 427000 |  | Transferencia |
| pag-0181 | OC-0006 | 2026-08-20 | 259000 |  | Transferencia |
| pag-0182 | OC-0007 | 2026-08-31 | 245000 |  | Cheque |
| pag-0301 | OC-0008 | 2026-09-01 | 862500 |  | Transferencia |
| pag-0302 | OC-0009 | 2026-08-31 | 312000 |  | Transferencia |
| pag-0434 | OC-0011 | 2026-09-08 | 1124000 |  | Transferencia |
| pag-0551 | OC-0013 | 2026-09-15 | 907500 |  | Transferencia |
| pag-0552 | OC-0014 | 2026-09-15 | 89600 |  | Transferencia |
| pag-0711 | OC-0018 | 2026-10-09 | 553000 |  | Transferencia |
| pag-0760 | OC-0020 | 2026-10-16 | 700000 |  | Anticipo al proveedor (se reparte por valor de línea) |
| pag-0941 | OC-0021 | 2026-10-16 | 20000 | OT4307 | Seña al proveedor |

## Lotes de stock

Archivo: `datos/lotes.csv` · 39 registros.

| id | material | costo_unitario | fecha | origen | oc | ot_origen |
| --- | --- | --- | --- | --- | --- | --- |
| lote-0001 | Melamina blanca 18 mm | 54000 | 2026-06-01 | opening |  |  |
| lote-0003 | Tornillo 4×40 (caja de 100) | 5000 | 2026-06-01 | opening |  |  |
| lote-0005 | Laca nitro | 13000 | 2026-06-01 | opening |  |  |
| lote-0007 | Tapacanto PVC 22 mm | 850 | 2026-06-01 | opening |  |  |
| lote-0009 | Bisagra cazoleta | 2400 | 2026-06-01 | opening |  |  |
| lote-0037 | Placa MDF 18 mm | 61000 | 2026-06-15 | receipt | OC-0001 | OT4301 |
| lote-0040 | Enchapado roble 18 mm | 118000 | 2026-06-15 | receipt | OC-0001 | OT4301 |
| lote-0044 | Caño estructural 40×40 | 37500 | 2026-06-17 | receipt | OC-0002 | OT4301 |
| lote-0047 | Laca nitro | 14200 | 2026-06-15 | receipt | OC-0003 | OT4301 |
| lote-0151 | Placa MDF 18 mm | 61500 | 2026-07-06 | receipt | OC-0004 | OT4302 |
| lote-0154 | Multilaminado fenólico 18 mm | 96000 | 2026-07-06 | receipt | OC-0004 | OT4302 |
| lote-0158 | Caño estructural 40×40 | 38500 | 2026-07-10 | receipt | OC-0005 | OT4302 |
| lote-0161 | Planchuela 1½″ × 3/16″ | 21000 | 2026-07-10 | receipt | OC-0005 | OT4302 |
| lote-0164 | Caño estructural 40×40 | 38500 | 2026-07-10 | receipt | OC-0005 | OT4302 |
| lote-0167 | Espuma alta densidad 5 cm | 47000 | 2026-08-05 | receipt | OC-0006 | OT4302 |
| lote-0170 | Tela tapicería antimanchas | 27500 | 2026-08-05 | receipt | OC-0006 | OT4302 |
| lote-0173 | Pintura poliuretánica | 24500 | 2026-08-10 | receipt | OC-0007 | OT4302 |
| lote-0176 | Pintura poliuretánica | 24500 | 2026-08-10 | receipt | OC-0007 | OT4302 |
| lote-0291 | Melamina blanca 18 mm | 57500 | 2026-08-17 | receipt | OC-0008 | OT4303 |
| lote-0295 | Caño estructural 40×40 | 39000 | 2026-08-14 | receipt | OC-0009 | OT4303 |
| lote-0298 | Pintura poliuretánica | 25000 | 2026-09-10 | receipt | OC-0010 | OT4303 |
| lote-0424 | Placa MDF 18 mm | 63000 | 2026-08-24 | receipt | OC-0011 | OT4304 |
| lote-0427 | Enchapado roble 18 mm | 121000 | 2026-08-24 | receipt | OC-0011 | OT4304 |
| lote-0430 | Placa MDF 18 mm | 63000 | 2026-08-24 | receipt | OC-0011 | OT4304 |
| lote-0441 | Laca nitro | 14500 | 2026-09-21 | receipt | OC-0012 | OT4304 |
| lote-0535 | Enchapado roble 18 mm | 122000 | 2026-08-31 | receipt | OC-0013 | OT4305 |
| lote-0538 | Placa MDF 18 mm | 63500 | 2026-08-31 | receipt | OC-0013 | OT4305 |
| lote-0541 | Melamina blanca 18 mm | 58500 | 2026-08-31 | receipt | OC-0013 | OT4305 |
| lote-0545 | Corredera telescópica 45 cm | 11200 | 2026-09-04 | receipt | OC-0014 | OT4305 |
| lote-0548 | Caño estructural 40×40 | 39500 | 2026-09-14 | receipt | OC-0015 | OT4305 |
| lote-0555 | Laca nitro | 14800 | 2026-10-08 | receipt | OC-0016 | OT4305 |
| lote-0653 | Espuma alta densidad 5 cm | 48000 | 2026-10-08 | receipt | OC-0017 | OT4305 |
| lote-0656 | Tela tapicería antimanchas | 28500 | 2026-10-08 | receipt | OC-0017 | OT4305 |
| lote-0699 | Caño estructural 40×40 | 39500 | 2026-09-25 | receipt | OC-0018 | OT4306 |
| lote-0702 | Caño estructural 40×40 | 39500 | 2026-09-25 | receipt | OC-0018 | OT4306 |
| lote-0705 | Espuma alta densidad 5 cm | 48000 | 2026-09-26 | receipt | OC-0019 | OT4306 |
| lote-0708 | Tela tapicería antimanchas | 28500 | 2026-09-26 | receipt | OC-0019 | OT4306 |
| lote-0752 | Multilaminado fenólico 18 mm | 97000 | 2026-10-13 | receipt | OC-0020 | OT4306 |
| lote-0757 | Multilaminado fenólico 18 mm | 97000 | 2026-10-13 | receipt | OC-0020 | OT4306 |

## Movimientos de stock

Archivo: `datos/movimientos.csv` · 169 registros.

| id | lote | material | fecha | cantidad | desde | hacia | tipo | registro |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mov-0002 | lote-0001 | Melamina blanca 18 mm | 2026-06-01 | 5 | supplier | free | opening | inventario-inicial |
| mov-0004 | lote-0003 | Tornillo 4×40 (caja de 100) | 2026-06-01 | 20 | supplier | free | opening | inventario-inicial |
| mov-0006 | lote-0005 | Laca nitro | 2026-06-01 | 6 | supplier | free | opening | inventario-inicial |
| mov-0008 | lote-0007 | Tapacanto PVC 22 mm | 2026-06-01 | 200 | supplier | free | opening | inventario-inicial |
| mov-0010 | lote-0009 | Bisagra cazoleta | 2026-06-01 | 40 | supplier | free | opening | inventario-inicial |
| mov-0039 | lote-0037 | Placa MDF 18 mm | 2026-06-15 | 12 | supplier | asg:ot-4301 | receipt | rec-0038 |
| mov-0042 | lote-0040 | Enchapado roble 18 mm | 2026-06-15 | 3 | supplier | asg:ot-4301 | receipt | rec-0041 |
| mov-0046 | lote-0044 | Caño estructural 40×40 | 2026-06-17 | 2 | supplier | asg:ot-4301 | receipt | rec-0045 |
| mov-0049 | lote-0047 | Laca nitro | 2026-06-15 | 6 | supplier | asg:ot-4301 | receipt | rec-0048 |
| mov-0054 | lote-0007 | Tapacanto PVC 22 mm | 2026-06-15 | 80 | free | asg:ot-4301 | assign | asig-0053 |
| mov-0057 | lote-0005 | Laca nitro | 2026-06-15 | 4 | free | asg:ot-4301 | assign | asig-0056 |
| mov-0060 | lote-0037 | Placa MDF 18 mm | 2026-06-15 | 12 | asg:ot-4301 | prod:ent-0059 | release | ent-0059 |
| mov-0062 | lote-0007 | Tapacanto PVC 22 mm | 2026-06-15 | 80 | asg:ot-4301 | prod:ent-0061 | release | ent-0061 |
| mov-0064 | lote-0007 | Tapacanto PVC 22 mm | 2026-06-26 | 74 | prod:ent-0061 | cons:ot-4301 | consume | rend-0063 |
| mov-0065 | lote-0007 | Tapacanto PVC 22 mm | 2026-06-26 | 6 | prod:ent-0061 | waste:ot-4301 | waste | rend-0063 |
| mov-0067 | lote-0037 | Placa MDF 18 mm | 2026-06-26 | 9,5 | prod:ent-0059 | cons:ot-4301 | consume | rend-0066 |
| mov-0068 | lote-0037 | Placa MDF 18 mm | 2026-06-26 | 0,5 | prod:ent-0059 | waste:ot-4301 | waste | rend-0066 |
| mov-0069 | lote-0037 | Placa MDF 18 mm | 2026-06-26 | 2 | prod:ent-0059 | free | return | rend-0066 |
| mov-0071 | lote-0040 | Enchapado roble 18 mm | 2026-06-29 | 3 | asg:ot-4301 | prod:ent-0070 | release | ent-0070 |
| mov-0073 | lote-0040 | Enchapado roble 18 mm | 2026-07-03 | 2,75 | prod:ent-0070 | cons:ot-4301 | consume | rend-0072 |
| mov-0074 | lote-0040 | Enchapado roble 18 mm | 2026-07-03 | 0,25 | prod:ent-0070 | waste:ot-4301 | waste | rend-0072 |
| mov-0076 | lote-0044 | Caño estructural 40×40 | 2026-06-29 | 2 | asg:ot-4301 | prod:ent-0075 | release | ent-0075 |
| mov-0078 | lote-0044 | Caño estructural 40×40 | 2026-07-01 | 1,8 | prod:ent-0075 | cons:ot-4301 | consume | rend-0077 |
| mov-0079 | lote-0044 | Caño estructural 40×40 | 2026-07-01 | 0,2 | prod:ent-0075 | waste:ot-4301 | waste | rend-0077 |
| mov-0081 | lote-0005 | Laca nitro | 2026-07-06 | 4 | asg:ot-4301 | prod:ent-0080 | release | ent-0080 |
| mov-0082 | lote-0047 | Laca nitro | 2026-07-06 | 6 | asg:ot-4301 | prod:ent-0080 | release | ent-0080 |
| mov-0084 | lote-0005 | Laca nitro | 2026-07-09 | 4 | prod:ent-0080 | cons:ot-4301 | consume | rend-0083 |
| mov-0085 | lote-0047 | Laca nitro | 2026-07-09 | 5 | prod:ent-0080 | cons:ot-4301 | consume | rend-0083 |
| mov-0086 | lote-0047 | Laca nitro | 2026-07-09 | 0,5 | prod:ent-0080 | waste:ot-4301 | waste | rend-0083 |
| mov-0087 | lote-0047 | Laca nitro | 2026-07-09 | 0,5 | prod:ent-0080 | free | return | rend-0083 |
| mov-0153 | lote-0151 | Placa MDF 18 mm | 2026-07-06 | 6 | supplier | asg:ot-4302 | receipt | rec-0152 |
| mov-0156 | lote-0154 | Multilaminado fenólico 18 mm | 2026-07-06 | 2 | supplier | asg:ot-4302 | receipt | rec-0155 |
| mov-0160 | lote-0158 | Caño estructural 40×40 | 2026-07-10 | 4 | supplier | asg:ot-4302 | receipt | rec-0159 |
| mov-0163 | lote-0161 | Planchuela 1½″ × 3/16″ | 2026-07-10 | 2 | supplier | asg:ot-4302 | receipt | rec-0162 |
| mov-0166 | lote-0164 | Caño estructural 40×40 | 2026-07-10 | 6 | supplier | asg:ot-4302 | receipt | rec-0165 |
| mov-0169 | lote-0167 | Espuma alta densidad 5 cm | 2026-08-05 | 2 | supplier | asg:ot-4302 | receipt | rec-0168 |
| mov-0172 | lote-0170 | Tela tapicería antimanchas | 2026-08-05 | 6 | supplier | asg:ot-4302 | receipt | rec-0171 |
| mov-0175 | lote-0173 | Pintura poliuretánica | 2026-08-10 | 6 | supplier | asg:ot-4302 | receipt | rec-0174 |
| mov-0178 | lote-0176 | Pintura poliuretánica | 2026-08-10 | 4 | supplier | asg:ot-4302 | receipt | rec-0177 |
| mov-0184 | lote-0151 | Placa MDF 18 mm | 2026-07-06 | 6 | asg:ot-4302 | prod:ent-0183 | release | ent-0183 |
| mov-0186 | lote-0151 | Placa MDF 18 mm | 2026-07-15 | 5,5 | prod:ent-0183 | cons:ot-4302 | consume | rend-0185 |
| mov-0187 | lote-0151 | Placa MDF 18 mm | 2026-07-15 | 0,5 | prod:ent-0183 | waste:ot-4302 | waste | rend-0185 |
| mov-0189 | lote-0154 | Multilaminado fenólico 18 mm | 2026-07-06 | 2 | asg:ot-4302 | prod:ent-0188 | release | ent-0188 |
| mov-0191 | lote-0154 | Multilaminado fenólico 18 mm | 2026-07-15 | 2 | prod:ent-0188 | cons:ot-4302 | consume | rend-0190 |
| mov-0193 | lote-0158 | Caño estructural 40×40 | 2026-07-13 | 4 | asg:ot-4302 | prod:ent-0192 | release | ent-0192 |
| mov-0195 | lote-0158 | Caño estructural 40×40 | 2026-07-22 | 3,6 | prod:ent-0192 | cons:ot-4302 | consume | rend-0194 |
| mov-0196 | lote-0158 | Caño estructural 40×40 | 2026-07-22 | 0,4 | prod:ent-0192 | waste:ot-4302 | waste | rend-0194 |
| mov-0198 | lote-0161 | Planchuela 1½″ × 3/16″ | 2026-07-13 | 2 | asg:ot-4302 | prod:ent-0197 | release | ent-0197 |
| mov-0200 | lote-0161 | Planchuela 1½″ × 3/16″ | 2026-07-22 | 2 | prod:ent-0197 | cons:ot-4302 | consume | rend-0199 |
| mov-0202 | lote-0164 | Caño estructural 40×40 | 2026-07-23 | 6 | asg:ot-4302 | prod:ent-0201 | release | ent-0201 |
| mov-0204 | lote-0164 | Caño estructural 40×40 | 2026-08-05 | 5,5 | prod:ent-0201 | cons:ot-4302 | consume | rend-0203 |
| mov-0205 | lote-0164 | Caño estructural 40×40 | 2026-08-05 | 0,5 | prod:ent-0201 | waste:ot-4302 | waste | rend-0203 |
| mov-0207 | lote-0167 | Espuma alta densidad 5 cm | 2026-08-10 | 2 | asg:ot-4302 | prod:ent-0206 | release | ent-0206 |
| mov-0209 | lote-0167 | Espuma alta densidad 5 cm | 2026-08-13 | 1,75 | prod:ent-0206 | cons:ot-4302 | consume | rend-0208 |
| mov-0210 | lote-0167 | Espuma alta densidad 5 cm | 2026-08-13 | 0,25 | prod:ent-0206 | waste:ot-4302 | waste | rend-0208 |
| mov-0212 | lote-0170 | Tela tapicería antimanchas | 2026-08-10 | 6 | asg:ot-4302 | prod:ent-0211 | release | ent-0211 |
| mov-0214 | lote-0170 | Tela tapicería antimanchas | 2026-08-13 | 5,5 | prod:ent-0211 | cons:ot-4302 | consume | rend-0213 |
| mov-0215 | lote-0170 | Tela tapicería antimanchas | 2026-08-13 | 0,5 | prod:ent-0211 | waste:ot-4302 | waste | rend-0213 |
| mov-0217 | lote-0173 | Pintura poliuretánica | 2026-08-17 | 6 | asg:ot-4302 | prod:ent-0216 | release | ent-0216 |
| mov-0219 | lote-0173 | Pintura poliuretánica | 2026-08-18 | 5,5 | prod:ent-0216 | cons:ot-4302 | consume | rend-0218 |
| mov-0220 | lote-0173 | Pintura poliuretánica | 2026-08-18 | 0,5 | prod:ent-0216 | waste:ot-4302 | waste | rend-0218 |
| mov-0222 | lote-0176 | Pintura poliuretánica | 2026-08-19 | 4 | asg:ot-4302 | prod:ent-0221 | release | ent-0221 |
| mov-0224 | lote-0176 | Pintura poliuretánica | 2026-08-20 | 4 | prod:ent-0221 | cons:ot-4302 | consume | rend-0223 |
| mov-0293 | lote-0291 | Melamina blanca 18 mm | 2026-08-17 | 15 | supplier | asg:ot-4303 | receipt | rec-0292 |
| mov-0297 | lote-0295 | Caño estructural 40×40 | 2026-08-14 | 8 | supplier | asg:ot-4303 | receipt | rec-0296 |
| mov-0300 | lote-0298 | Pintura poliuretánica | 2026-09-10 | 5 | supplier | asg:ot-4303 | receipt | rec-0299 |
| mov-0304 | lote-0001 | Melamina blanca 18 mm | 2026-08-17 | 5 | free | asg:ot-4303 | assign | asig-0303 |
| mov-0307 | lote-0007 | Tapacanto PVC 22 mm | 2026-08-17 | 60 | free | asg:ot-4303 | assign | asig-0306 |
| mov-0310 | lote-0009 | Bisagra cazoleta | 2026-08-24 | 16 | free | asg:ot-4303 | assign | asig-0309 |
| mov-0313 | lote-0003 | Tornillo 4×40 (caja de 100) | 2026-10-05 | 6 | free | asg:ot-4303 | assign | asig-0312 |
| mov-0316 | lote-0001 | Melamina blanca 18 mm | 2026-08-17 | 5 | asg:ot-4303 | prod:ent-0315 | release | ent-0315 |
| mov-0317 | lote-0291 | Melamina blanca 18 mm | 2026-08-17 | 7 | asg:ot-4303 | prod:ent-0315 | release | ent-0315 |
| mov-0319 | lote-0001 | Melamina blanca 18 mm | 2026-09-04 | 5 | prod:ent-0315 | cons:ot-4303 | consume | rend-0318 |
| mov-0320 | lote-0291 | Melamina blanca 18 mm | 2026-09-04 | 6 | prod:ent-0315 | cons:ot-4303 | consume | rend-0318 |
| mov-0321 | lote-0291 | Melamina blanca 18 mm | 2026-09-04 | 1 | prod:ent-0315 | waste:ot-4303 | waste | rend-0318 |
| mov-0323 | lote-0007 | Tapacanto PVC 22 mm | 2026-08-17 | 60 | asg:ot-4303 | prod:ent-0322 | release | ent-0322 |
| mov-0325 | lote-0007 | Tapacanto PVC 22 mm | 2026-09-04 | 56 | prod:ent-0322 | cons:ot-4303 | consume | rend-0324 |
| mov-0326 | lote-0007 | Tapacanto PVC 22 mm | 2026-09-04 | 4 | prod:ent-0322 | waste:ot-4303 | waste | rend-0324 |
| mov-0328 | lote-0295 | Caño estructural 40×40 | 2026-08-17 | 8 | asg:ot-4303 | prod:ent-0327 | release | ent-0327 |
| mov-0330 | lote-0295 | Caño estructural 40×40 | 2026-08-28 | 7,5 | prod:ent-0327 | cons:ot-4303 | consume | rend-0329 |
| mov-0331 | lote-0295 | Caño estructural 40×40 | 2026-08-28 | 0,5 | prod:ent-0327 | waste:ot-4303 | waste | rend-0329 |
| mov-0333 | lote-0291 | Melamina blanca 18 mm | 2026-08-24 | 8 | asg:ot-4303 | prod:ent-0332 | release | ent-0332 |
| mov-0335 | lote-0291 | Melamina blanca 18 mm | 2026-09-04 | 6 | prod:ent-0332 | cons:ot-4303 | consume | rend-0334 |
| mov-0336 | lote-0291 | Melamina blanca 18 mm | 2026-09-04 | 0,5 | prod:ent-0332 | waste:ot-4303 | waste | rend-0334 |
| mov-0338 | lote-0009 | Bisagra cazoleta | 2026-08-24 | 16 | asg:ot-4303 | prod:ent-0337 | release | ent-0337 |
| mov-0340 | lote-0009 | Bisagra cazoleta | 2026-09-04 | 16 | prod:ent-0337 | cons:ot-4303 | consume | rend-0339 |
| mov-0342 | lote-0298 | Pintura poliuretánica | 2026-09-14 | 5 | asg:ot-4303 | prod:ent-0341 | release | ent-0341 |
| mov-0344 | lote-0298 | Pintura poliuretánica | 2026-09-22 | 4,5 | prod:ent-0341 | cons:ot-4303 | consume | rend-0343 |
| mov-0345 | lote-0298 | Pintura poliuretánica | 2026-09-22 | 0,25 | prod:ent-0341 | waste:ot-4303 | waste | rend-0343 |
| mov-0346 | lote-0298 | Pintura poliuretánica | 2026-09-22 | 0,25 | prod:ent-0341 | free | return | rend-0343 |
| mov-0348 | lote-0003 | Tornillo 4×40 (caja de 100) | 2026-10-05 | 4 | asg:ot-4303 | prod:ent-0347 | release | ent-0347 |
| mov-0350 | lote-0003 | Tornillo 4×40 (caja de 100) | 2026-10-09 | 4 | prod:ent-0347 | cons:ot-4303 | consume | rend-0349 |
| mov-0426 | lote-0424 | Placa MDF 18 mm | 2026-08-24 | 6 | supplier | asg:ot-4304 | receipt | rec-0425 |
| mov-0429 | lote-0427 | Enchapado roble 18 mm | 2026-08-24 | 2 | supplier | asg:ot-4304 | receipt | rec-0428 |
| mov-0432 | lote-0430 | Placa MDF 18 mm | 2026-08-24 | 8 | supplier | asg:ot-4304 | receipt | rec-0431 |
| mov-0436 | lote-0005 | Laca nitro | 2026-09-21 | 2 | free | asg:ot-4304 | assign | asig-0435 |
| mov-0437 | lote-0047 | Laca nitro | 2026-09-21 | 0,5 | free | asg:ot-4304 | assign | asig-0435 |
| mov-0443 | lote-0441 | Laca nitro | 2026-09-21 | 5 | supplier | asg:ot-4304 | receipt | rec-0442 |
| mov-0445 | lote-0424 | Placa MDF 18 mm | 2026-08-24 | 6 | asg:ot-4304 | prod:ent-0444 | release | ent-0444 |
| mov-0447 | lote-0424 | Placa MDF 18 mm | 2026-09-04 | 5,5 | prod:ent-0444 | cons:ot-4304 | consume | rend-0446 |
| mov-0448 | lote-0424 | Placa MDF 18 mm | 2026-09-04 | 0,5 | prod:ent-0444 | waste:ot-4304 | waste | rend-0446 |
| mov-0450 | lote-0427 | Enchapado roble 18 mm | 2026-08-24 | 2 | asg:ot-4304 | prod:ent-0449 | release | ent-0449 |
| mov-0452 | lote-0427 | Enchapado roble 18 mm | 2026-09-04 | 2 | prod:ent-0449 | cons:ot-4304 | consume | rend-0451 |
| mov-0454 | lote-0430 | Placa MDF 18 mm | 2026-09-07 | 8 | asg:ot-4304 | prod:ent-0453 | release | ent-0453 |
| mov-0456 | lote-0430 | Placa MDF 18 mm | 2026-09-18 | 5,5 | prod:ent-0453 | cons:ot-4304 | consume | rend-0455 |
| mov-0457 | lote-0430 | Placa MDF 18 mm | 2026-09-18 | 0,5 | prod:ent-0453 | waste:ot-4304 | waste | rend-0455 |
| mov-0458 | lote-0430 | Placa MDF 18 mm | 2026-09-18 | 2 | prod:ent-0453 | free | return | rend-0455 |
| mov-0460 | lote-0005 | Laca nitro | 2026-09-21 | 2 | asg:ot-4304 | prod:ent-0459 | release | ent-0459 |
| mov-0461 | lote-0047 | Laca nitro | 2026-09-21 | 0,5 | asg:ot-4304 | prod:ent-0459 | release | ent-0459 |
| mov-0462 | lote-0441 | Laca nitro | 2026-09-21 | 1 | asg:ot-4304 | prod:ent-0459 | release | ent-0459 |
| mov-0464 | lote-0005 | Laca nitro | 2026-09-25 | 2 | prod:ent-0459 | cons:ot-4304 | consume | rend-0463 |
| mov-0465 | lote-0047 | Laca nitro | 2026-09-25 | 0,5 | prod:ent-0459 | cons:ot-4304 | consume | rend-0463 |
| mov-0466 | lote-0441 | Laca nitro | 2026-09-25 | 0,75 | prod:ent-0459 | cons:ot-4304 | consume | rend-0463 |
| mov-0467 | lote-0441 | Laca nitro | 2026-09-25 | 0,25 | prod:ent-0459 | waste:ot-4304 | waste | rend-0463 |
| mov-0469 | lote-0441 | Laca nitro | 2026-09-23 | 4 | asg:ot-4304 | prod:ent-0468 | release | ent-0468 |
| mov-0471 | lote-0441 | Laca nitro | 2026-09-25 | 3,75 | prod:ent-0468 | cons:ot-4304 | consume | rend-0470 |
| mov-0472 | lote-0441 | Laca nitro | 2026-09-25 | 0,25 | prod:ent-0468 | waste:ot-4304 | waste | rend-0470 |
| mov-0537 | lote-0535 | Enchapado roble 18 mm | 2026-08-31 | 3 | supplier | asg:ot-4305 | receipt | rec-0536 |
| mov-0540 | lote-0538 | Placa MDF 18 mm | 2026-08-31 | 3 | supplier | asg:ot-4305 | receipt | rec-0539 |
| mov-0543 | lote-0541 | Melamina blanca 18 mm | 2026-08-31 | 6 | supplier | asg:ot-4305 | receipt | rec-0542 |
| mov-0547 | lote-0545 | Corredera telescópica 45 cm | 2026-09-04 | 8 | supplier | asg:ot-4305 | receipt | rec-0546 |
| mov-0550 | lote-0548 | Caño estructural 40×40 | 2026-09-14 | 3 | supplier | asg:ot-4305 | receipt | rec-0549 |
| mov-0557 | lote-0555 | Laca nitro | 2026-10-08 | 3 | supplier | asg:ot-4305 | receipt | rec-0556 |
| mov-0559 | lote-0535 | Enchapado roble 18 mm | 2026-09-07 | 3 | asg:ot-4305 | prod:ent-0558 | release | ent-0558 |
| mov-0561 | lote-0535 | Enchapado roble 18 mm | 2026-10-02 | 2,5 | prod:ent-0558 | cons:ot-4305 | consume | rend-0560 |
| mov-0562 | lote-0535 | Enchapado roble 18 mm | 2026-10-02 | 0,25 | prod:ent-0558 | waste:ot-4305 | waste | rend-0560 |
| mov-0564 | lote-0538 | Placa MDF 18 mm | 2026-09-07 | 3 | asg:ot-4305 | prod:ent-0563 | release | ent-0563 |
| mov-0566 | lote-0538 | Placa MDF 18 mm | 2026-10-02 | 2,5 | prod:ent-0563 | cons:ot-4305 | consume | rend-0565 |
| mov-0567 | lote-0538 | Placa MDF 18 mm | 2026-10-02 | 0,5 | prod:ent-0563 | waste:ot-4305 | waste | rend-0565 |
| mov-0569 | lote-0541 | Melamina blanca 18 mm | 2026-09-21 | 6 | asg:ot-4305 | prod:ent-0568 | release | ent-0568 |
| mov-0571 | lote-0541 | Melamina blanca 18 mm | 2026-10-09 | 3 | prod:ent-0568 | cons:ot-4305 | consume | rend-0570 |
| mov-0572 | lote-0541 | Melamina blanca 18 mm | 2026-10-09 | 0,25 | prod:ent-0568 | waste:ot-4305 | waste | rend-0570 |
| mov-0574 | lote-0548 | Caño estructural 40×40 | 2026-09-14 | 3 | asg:ot-4305 | prod:ent-0573 | release | ent-0573 |
| mov-0576 | lote-0548 | Caño estructural 40×40 | 2026-09-25 | 2,75 | prod:ent-0573 | cons:ot-4305 | consume | rend-0575 |
| mov-0577 | lote-0548 | Caño estructural 40×40 | 2026-09-25 | 0,25 | prod:ent-0573 | waste:ot-4305 | waste | rend-0575 |
| mov-0579 | lote-0545 | Corredera telescópica 45 cm | 2026-10-13 | 8 | asg:ot-4305 | prod:ent-0578 | release | ent-0578 |
| mov-0581 | lote-0545 | Corredera telescópica 45 cm | 2026-10-16 | 4 | prod:ent-0578 | cons:ot-4305 | consume | rend-0580 |
| mov-0583 | lote-0555 | Laca nitro | 2026-10-15 | 1,5 | asg:ot-4305 | prod:ent-0582 | release | ent-0582 |
| mov-0655 | lote-0653 | Espuma alta densidad 5 cm | 2026-10-08 | 1 | supplier | asg:ot-4305 | receipt | rec-0654 |
| mov-0658 | lote-0656 | Tela tapicería antimanchas | 2026-10-08 | 4 | supplier | asg:ot-4305 | receipt | rec-0657 |
| mov-0693 | lote-0037 | Placa MDF 18 mm | 2026-09-22 | 2 | free | asg:ot-4306 | assign | asig-0692 |
| mov-0697 | lote-0007 | Tapacanto PVC 22 mm | 2026-09-22 | 30 | free | asg:ot-4306 | assign | asig-0696 |
| mov-0701 | lote-0699 | Caño estructural 40×40 | 2026-09-25 | 10 | supplier | asg:ot-4306 | receipt | rec-0700 |
| mov-0704 | lote-0702 | Caño estructural 40×40 | 2026-09-25 | 4 | supplier | asg:ot-4306 | receipt | rec-0703 |
| mov-0707 | lote-0705 | Espuma alta densidad 5 cm | 2026-09-26 | 3 | supplier | asg:ot-4306 | receipt | rec-0706 |
| mov-0710 | lote-0708 | Tela tapicería antimanchas | 2026-09-26 | 9 | supplier | asg:ot-4306 | receipt | rec-0709 |
| mov-0754 | lote-0752 | Multilaminado fenólico 18 mm | 2026-10-13 | 6 | supplier | asg:ot-4306 | receipt | rec-0753 |
| mov-0755 | lote-0752 | Multilaminado fenólico 18 mm | 2026-10-13 | 6 | asg:ot-4306 | supplier | receipt_reversal | rec-0753 |
| mov-0759 | lote-0757 | Multilaminado fenólico 18 mm | 2026-10-13 | 4 | supplier | asg:ot-4306 | receipt | rec-0758 |
| mov-0765 | lote-0037 | Placa MDF 18 mm | 2026-10-01 | 2 | asg:ot-4306 | prod:ent-0764 | release | ent-0764 |
| mov-0767 | lote-0037 | Placa MDF 18 mm | 2026-10-02 | 1,75 | prod:ent-0764 | cons:ot-4306 | consume | rend-0766 |
| mov-0768 | lote-0037 | Placa MDF 18 mm | 2026-10-02 | 0,25 | prod:ent-0764 | waste:ot-4306 | waste | rend-0766 |
| mov-0770 | lote-0007 | Tapacanto PVC 22 mm | 2026-10-05 | 30 | asg:ot-4306 | prod:ent-0769 | release | ent-0769 |
| mov-0772 | lote-0007 | Tapacanto PVC 22 mm | 2026-10-09 | 18 | prod:ent-0769 | cons:ot-4306 | consume | rend-0771 |
| mov-0773 | lote-0007 | Tapacanto PVC 22 mm | 2026-10-09 | 2 | prod:ent-0769 | waste:ot-4306 | waste | rend-0771 |
| mov-0775 | lote-0699 | Caño estructural 40×40 | 2026-09-28 | 10 | asg:ot-4306 | prod:ent-0774 | release | ent-0774 |
| mov-0777 | lote-0699 | Caño estructural 40×40 | 2026-10-09 | 9 | prod:ent-0774 | cons:ot-4306 | consume | rend-0776 |
| mov-0778 | lote-0699 | Caño estructural 40×40 | 2026-10-09 | 0,5 | prod:ent-0774 | waste:ot-4306 | waste | rend-0776 |
| mov-0780 | lote-0702 | Caño estructural 40×40 | 2026-10-12 | 4 | asg:ot-4306 | prod:ent-0779 | release | ent-0779 |
| mov-0782 | lote-0702 | Caño estructural 40×40 | 2026-10-16 | 2 | prod:ent-0779 | cons:ot-4306 | consume | rend-0781 |
| mov-0784 | lote-0705 | Espuma alta densidad 5 cm | 2026-10-12 | 3 | asg:ot-4306 | prod:ent-0783 | release | ent-0783 |
| mov-0786 | lote-0705 | Espuma alta densidad 5 cm | 2026-10-16 | 1,5 | prod:ent-0783 | cons:ot-4306 | consume | rend-0785 |
| mov-0787 | lote-0705 | Espuma alta densidad 5 cm | 2026-10-16 | 0,25 | prod:ent-0783 | waste:ot-4306 | waste | rend-0785 |
| mov-0789 | lote-0708 | Tela tapicería antimanchas | 2026-10-12 | 9 | asg:ot-4306 | prod:ent-0788 | release | ent-0788 |
| mov-0791 | lote-0708 | Tela tapicería antimanchas | 2026-10-16 | 6 | prod:ent-0788 | cons:ot-4306 | consume | rend-0790 |
| mov-0792 | lote-0708 | Tela tapicería antimanchas | 2026-10-16 | 0,75 | prod:ent-0788 | waste:ot-4306 | waste | rend-0790 |
| mov-0794 | lote-0757 | Multilaminado fenólico 18 mm | 2026-10-14 | 4 | asg:ot-4306 | prod:ent-0793 | release | ent-0793 |
| mov-0796 | lote-0757 | Multilaminado fenólico 18 mm | 2026-10-16 | 1,5 | prod:ent-0793 | cons:ot-4306 | consume | rend-0795 |
| mov-0797 | lote-0757 | Multilaminado fenólico 18 mm | 2026-10-16 | 0,25 | prod:ent-0793 | waste:ot-4306 | waste | rend-0795 |

## Entregas de material a producción

Archivo: `datos/entregas_produccion.csv` · 39 registros.

| id | ot | mueble | rubro | material | cantidad | fecha |
| --- | --- | --- | --- | --- | --- | --- |
| ent-0059 | OT4301 | Estantería alta | Carpintería | Placa MDF 18 mm | 12 | 2026-06-15 |
| ent-0061 | OT4301 | Estantería alta | Carpintería | Tapacanto PVC 22 mm | 80 | 2026-06-15 |
| ent-0070 | OT4301 | Mesa de exhibición | Carpintería | Enchapado roble 18 mm | 3 | 2026-06-29 |
| ent-0075 | OT4301 | Mesa de exhibición | Herrería | Caño estructural 40×40 | 2 | 2026-06-29 |
| ent-0080 | OT4301 | Estantería alta | Pintura y lustre | Laca nitro | 10 | 2026-07-06 |
| ent-0183 | OT4302 | Barra | Carpintería | Placa MDF 18 mm | 6 | 2026-07-06 |
| ent-0188 | OT4302 | Barra | Carpintería | Multilaminado fenólico 18 mm | 2 | 2026-07-06 |
| ent-0192 | OT4302 | Barra | Herrería | Caño estructural 40×40 | 4 | 2026-07-13 |
| ent-0197 | OT4302 | Barra | Herrería | Planchuela 1½″ × 3/16″ | 2 | 2026-07-13 |
| ent-0201 | OT4302 | Banqueta | Herrería | Caño estructural 40×40 | 6 | 2026-07-23 |
| ent-0206 | OT4302 | Banqueta | Tapicería | Espuma alta densidad 5 cm | 2 | 2026-08-10 |
| ent-0211 | OT4302 | Banqueta | Tapicería | Tela tapicería antimanchas | 6 | 2026-08-10 |
| ent-0216 | OT4302 | Barra | Pintura y lustre | Pintura poliuretánica | 6 | 2026-08-17 |
| ent-0221 | OT4302 | Banqueta | Pintura y lustre | Pintura poliuretánica | 4 | 2026-08-19 |
| ent-0315 | OT4303 | Escritorio | Carpintería | Melamina blanca 18 mm | 12 | 2026-08-17 |
| ent-0322 | OT4303 | Escritorio | Carpintería | Tapacanto PVC 22 mm | 60 | 2026-08-17 |
| ent-0327 | OT4303 | Escritorio | Herrería | Caño estructural 40×40 | 8 | 2026-08-17 |
| ent-0332 | OT4303 | Locker | Carpintería | Melamina blanca 18 mm | 8 | 2026-08-24 |
| ent-0337 | OT4303 | Locker | Carpintería | Bisagra cazoleta | 16 | 2026-08-24 |
| ent-0341 | OT4303 | Escritorio | Pintura y lustre | Pintura poliuretánica | 5 | 2026-09-14 |
| ent-0347 | OT4303 | Escritorio | Armado y montaje | Tornillo 4×40 (caja de 100) | 4 | 2026-10-05 |
| ent-0444 | OT4304 | Mostrador | Carpintería | Placa MDF 18 mm | 6 | 2026-08-24 |
| ent-0449 | OT4304 | Mostrador | Carpintería | Enchapado roble 18 mm | 2 | 2026-08-24 |
| ent-0453 | OT4304 | Exhibidor de pared | Carpintería | Placa MDF 18 mm | 8 | 2026-09-07 |
| ent-0459 | OT4304 | Exhibidor de pared | Pintura y lustre | Laca nitro | 3,5 | 2026-09-21 |
| ent-0468 | OT4304 | Mostrador | Pintura y lustre | Laca nitro | 4 | 2026-09-23 |
| ent-0558 | OT4305 | Mostrador de recepción | Carpintería | Enchapado roble 18 mm | 3 | 2026-09-07 |
| ent-0563 | OT4305 | Mostrador de recepción | Carpintería | Placa MDF 18 mm | 3 | 2026-09-07 |
| ent-0568 | OT4305 | Mueble de guardado | Carpintería | Melamina blanca 18 mm | 6 | 2026-09-21 |
| ent-0573 | OT4305 | Sillón de espera | Herrería | Caño estructural 40×40 | 3 | 2026-09-14 |
| ent-0578 | OT4305 | Mueble de guardado | Carpintería | Corredera telescópica 45 cm | 8 | 2026-10-13 |
| ent-0582 | OT4305 | Mostrador de recepción | Pintura y lustre | Laca nitro | 1,5 | 2026-10-15 |
| ent-0764 | OT4306 | Barra | Carpintería | Placa MDF 18 mm | 2 | 2026-10-01 |
| ent-0769 | OT4306 | Barra | Carpintería | Tapacanto PVC 22 mm | 30 | 2026-10-05 |
| ent-0774 | OT4306 | Silla | Herrería | Caño estructural 40×40 | 10 | 2026-09-28 |
| ent-0779 | OT4306 | Mesa | Herrería | Caño estructural 40×40 | 4 | 2026-10-12 |
| ent-0783 | OT4306 | Silla | Tapicería | Espuma alta densidad 5 cm | 3 | 2026-10-12 |
| ent-0788 | OT4306 | Silla | Tapicería | Tela tapicería antimanchas | 9 | 2026-10-12 |
| ent-0793 | OT4306 | Mesa | Carpintería | Multilaminado fenólico 18 mm | 4 | 2026-10-14 |

## Rendiciones (consumido / desperdicio / devuelto)

Archivo: `datos/rendiciones.csv` · 38 registros.

| id | entrega | fecha | consumido | desperdicio | devuelto |
| --- | --- | --- | --- | --- | --- |
| rend-0063 | ent-0061 | 2026-06-26 | 74 | 6 | 0 |
| rend-0066 | ent-0059 | 2026-06-26 | 9,5 | 0,5 | 2 |
| rend-0072 | ent-0070 | 2026-07-03 | 2,75 | 0,25 | 0 |
| rend-0077 | ent-0075 | 2026-07-01 | 1,8 | 0,2 | 0 |
| rend-0083 | ent-0080 | 2026-07-09 | 9 | 0,5 | 0,5 |
| rend-0185 | ent-0183 | 2026-07-15 | 5,5 | 0,5 | 0 |
| rend-0190 | ent-0188 | 2026-07-15 | 2 | 0 | 0 |
| rend-0194 | ent-0192 | 2026-07-22 | 3,6 | 0,4 | 0 |
| rend-0199 | ent-0197 | 2026-07-22 | 2 | 0 | 0 |
| rend-0203 | ent-0201 | 2026-08-05 | 5,5 | 0,5 | 0 |
| rend-0208 | ent-0206 | 2026-08-13 | 1,75 | 0,25 | 0 |
| rend-0213 | ent-0211 | 2026-08-13 | 5,5 | 0,5 | 0 |
| rend-0218 | ent-0216 | 2026-08-18 | 5,5 | 0,5 | 0 |
| rend-0223 | ent-0221 | 2026-08-20 | 4 | 0 | 0 |
| rend-0318 | ent-0315 | 2026-09-04 | 11 | 1 | 0 |
| rend-0324 | ent-0322 | 2026-09-04 | 56 | 4 | 0 |
| rend-0329 | ent-0327 | 2026-08-28 | 7,5 | 0,5 | 0 |
| rend-0334 | ent-0332 | 2026-09-04 | 6 | 0,5 | 0 |
| rend-0339 | ent-0337 | 2026-09-04 | 16 | 0 | 0 |
| rend-0343 | ent-0341 | 2026-09-22 | 4,5 | 0,25 | 0,25 |
| rend-0349 | ent-0347 | 2026-10-09 | 4 | 0 | 0 |
| rend-0446 | ent-0444 | 2026-09-04 | 5,5 | 0,5 | 0 |
| rend-0451 | ent-0449 | 2026-09-04 | 2 | 0 | 0 |
| rend-0455 | ent-0453 | 2026-09-18 | 5,5 | 0,5 | 2 |
| rend-0463 | ent-0459 | 2026-09-25 | 3,25 | 0,25 | 0 |
| rend-0470 | ent-0468 | 2026-09-25 | 3,75 | 0,25 | 0 |
| rend-0560 | ent-0558 | 2026-10-02 | 2,5 | 0,25 | 0 |
| rend-0565 | ent-0563 | 2026-10-02 | 2,5 | 0,5 | 0 |
| rend-0570 | ent-0568 | 2026-10-09 | 3 | 0,25 | 0 |
| rend-0575 | ent-0573 | 2026-09-25 | 2,75 | 0,25 | 0 |
| rend-0580 | ent-0578 | 2026-10-16 | 4 | 0 | 0 |
| rend-0766 | ent-0764 | 2026-10-02 | 1,75 | 0,25 | 0 |
| rend-0771 | ent-0769 | 2026-10-09 | 18 | 2 | 0 |
| rend-0776 | ent-0774 | 2026-10-09 | 9 | 0,5 | 0 |
| rend-0781 | ent-0779 | 2026-10-16 | 2 | 0 | 0 |
| rend-0785 | ent-0783 | 2026-10-16 | 1,5 | 0,25 | 0 |
| rend-0790 | ent-0788 | 2026-10-16 | 6 | 0,75 | 0 |
| rend-0795 | ent-0793 | 2026-10-16 | 1,5 | 0,25 | 0 |

## Planificación de Planta

Archivo: `datos/planificacion.csv` · 42 registros.

| id | fecha | ot | mueble | rubro | horas |
| --- | --- | --- | --- | --- | --- |
| plan-0874 | 2026-10-16 | OT4305 | Sillón de espera | Pintura y lustre | 4 |
| plan-0876 | 2026-10-19 | OT4306 | Barra | Carpintería | 4 |
| plan-0877 | 2026-10-20 | OT4306 | Barra | Carpintería | 4 |
| plan-0878 | 2026-10-21 | OT4306 | Barra | Carpintería | 4 |
| plan-0879 | 2026-10-22 | OT4306 | Barra | Carpintería | 4 |
| plan-0880 | 2026-10-23 | OT4306 | Barra | Carpintería | 4 |
| plan-0881 | 2026-10-19 | OT4306 | Mesa | Carpintería | 8 |
| plan-0882 | 2026-10-20 | OT4306 | Mesa | Carpintería | 8 |
| plan-0883 | 2026-10-21 | OT4306 | Mesa | Carpintería | 8 |
| plan-0884 | 2026-10-22 | OT4306 | Mesa | Carpintería | 8 |
| plan-0885 | 2026-10-23 | OT4306 | Mesa | Carpintería | 8 |
| plan-0886 | 2026-10-19 | OT4306 | Mesa | Herrería | 6 |
| plan-0887 | 2026-10-20 | OT4306 | Mesa | Herrería | 6 |
| plan-0888 | 2026-10-21 | OT4306 | Mesa | Herrería | 6 |
| plan-0889 | 2026-10-19 | OT4306 | Silla | Tapicería | 6 |
| plan-0890 | 2026-10-20 | OT4306 | Silla | Tapicería | 6 |
| plan-0891 | 2026-10-21 | OT4306 | Silla | Tapicería | 6 |
| plan-0892 | 2026-10-22 | OT4306 | Silla | Tapicería | 6 |
| plan-0893 | 2026-10-23 | OT4306 | Silla | Tapicería | 6 |
| plan-0894 | 2026-10-21 | OT4306 | Silla | Pintura y lustre | 4 |
| plan-0895 | 2026-10-22 | OT4306 | Silla | Pintura y lustre | 4 |
| plan-0896 | 2026-10-23 | OT4306 | Silla | Pintura y lustre | 4 |
| plan-0897 | 2026-10-19 | OT4305 | Mostrador de recepción | Carpintería | 4 |
| plan-0898 | 2026-10-20 | OT4305 | Mostrador de recepción | Carpintería | 4 |
| plan-0899 | 2026-10-21 | OT4305 | Mostrador de recepción | Carpintería | 4 |
| plan-0900 | 2026-10-22 | OT4305 | Mostrador de recepción | Carpintería | 4 |
| plan-0901 | 2026-10-23 | OT4305 | Mostrador de recepción | Carpintería | 4 |
| plan-0902 | 2026-10-19 | OT4305 | Mueble de guardado | Carpintería | 6 |
| plan-0903 | 2026-10-20 | OT4305 | Mueble de guardado | Carpintería | 6 |
| plan-0904 | 2026-10-21 | OT4305 | Mueble de guardado | Carpintería | 6 |
| plan-0905 | 2026-10-22 | OT4305 | Mueble de guardado | Carpintería | 6 |
| plan-0906 | 2026-10-19 | OT4305 | Sillón de espera | Tapicería | 2 |
| plan-0907 | 2026-10-20 | OT4305 | Sillón de espera | Tapicería | 2 |
| plan-0908 | 2026-10-23 | OT4305 | Mueble de guardado | Pintura y lustre | 6 |
| plan-0909 | 2026-10-26 | OT4306 | Mesa | Carpintería | 8 |
| plan-0910 | 2026-10-27 | OT4306 | Mesa | Carpintería | 8 |
| plan-0911 | 2026-10-28 | OT4306 | Mesa | Carpintería | 8 |
| plan-0912 | 2026-10-29 | OT4306 | Mesa | Carpintería | 8 |
| plan-0913 | 2026-10-30 | OT4306 | Mesa | Carpintería | 8 |
| plan-0914 | 2026-10-26 | OT4306 | Silla | Tapicería | 6 |
| plan-0915 | 2026-10-27 | OT4306 | Silla | Tapicería | 6 |
| plan-0916 | 2026-10-28 | OT4306 | Silla | Tapicería | 6 |

## Asignaciones a operarios

Archivo: `datos/asignaciones.csv` · 9 registros.

| id | operario | ot | mueble | rubro | desde | hasta | horas_dia |
| --- | --- | --- | --- | --- | --- | --- | --- |
| asg-0875 | Sofía Arce | OT4305 | Sillón de espera | Pintura y lustre | 2026-10-16 | 2026-10-16 | 4 |
| asg-0917 | Diego Paz | OT4306 | Barra | Carpintería | 2026-10-19 | 2026-10-23 | 4 |
| asg-0918 | Diego Paz | OT4305 | Mostrador de recepción | Carpintería | 2026-10-19 | 2026-10-23 | 4 |
| asg-0919 | Iván Correa | OT4306 | Mesa | Carpintería | 2026-10-19 | 2026-10-23 | 8 |
| asg-0920 | Joaquín Ledesma | OT4306 | Mesa | Herrería | 2026-10-19 | 2026-10-21 | 6 |
| asg-0921 | Matías Godoy | OT4306 | Silla | Tapicería | 2026-10-19 | 2026-10-22 | 6 |
| asg-0922 | Matías Godoy | OT4305 | Sillón de espera | Tapicería | 2026-10-19 | 2026-10-20 | 2 |
| asg-0923 | Sofía Arce | OT4306 | Silla | Pintura y lustre | 2026-10-22 | 2026-10-23 | 4 |
| asg-0924 | Camila Rivas | OT4305 | Mueble de guardado | Carpintería | 2026-10-19 | 2026-10-22 | 6 |

## Horas registradas (todas las personas)

Archivo: `datos/horas.csv` · 244 registros.

| id | persona | fecha | ot | mueble | rubro | horas | nota | revision | correcciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hs-0026 | Lucía Benítez | 2026-06-03 | OT4301 |  |  | 6 | Planos estanterías | pendiente |  |
| hs-0027 | Lucía Benítez | 2026-06-03 | Trabajo interno |  |  | 2 | Orden de archivo | pendiente |  |
| hs-0028 | Lucía Benítez | 2026-06-04 | OT4301 |  |  | 5 | Planos y despiece | pendiente |  |
| hs-0029 | Tomás Ferreyra | 2026-06-05 | OT4301 |  |  | 3 | Presupuesto y visita | pendiente |  |
| hs-0088 | Diego Paz | 2026-06-15 | OT4301 | Estantería alta | Carpintería | 7 |  | confirmed |  |
| hs-0089 | Diego Paz | 2026-06-16 | OT4301 | Estantería alta | Carpintería | 7 |  | confirmed |  |
| hs-0090 | Diego Paz | 2026-06-17 | OT4301 | Estantería alta | Carpintería | 7 |  | confirmed |  |
| hs-0091 | Diego Paz | 2026-06-18 | OT4301 | Estantería alta | Carpintería | 7 |  | confirmed |  |
| hs-0092 | Diego Paz | 2026-06-19 | OT4301 | Estantería alta | Carpintería | 7 |  | confirmed |  |
| hs-0093 | Diego Paz | 2026-06-22 | OT4301 | Estantería alta | Carpintería | 7 |  | confirmed |  |
| hs-0094 | Diego Paz | 2026-06-23 | OT4301 | Estantería alta | Carpintería | 7 |  | confirmed |  |
| hs-0095 | Diego Paz | 2026-06-24 | OT4301 | Estantería alta | Carpintería | 7 |  | confirmed |  |
| hs-0096 | Diego Paz | 2026-06-25 | OT4301 | Estantería alta | Carpintería | 7 |  | confirmed |  |
| hs-0097 | Diego Paz | 2026-06-26 | OT4301 | Estantería alta | Carpintería | 7 |  | confirmed |  |
| hs-0098 | Diego Paz | 2026-06-29 | OT4301 | Mesa de exhibición | Carpintería | 5 |  | confirmed |  |
| hs-0099 | Diego Paz | 2026-06-30 | OT4301 | Mesa de exhibición | Carpintería | 5 |  | confirmed |  |
| hs-0100 | Diego Paz | 2026-07-01 | OT4301 | Mesa de exhibición | Carpintería | 5 |  | confirmed |  |
| hs-0101 | Diego Paz | 2026-07-02 | OT4301 | Mesa de exhibición | Carpintería | 5 |  | confirmed |  |
| hs-0102 | Diego Paz | 2026-07-03 | OT4301 | Mesa de exhibición | Carpintería | 5 |  | confirmed |  |
| hs-0103 | Joaquín Ledesma | 2026-06-29 | OT4301 | Mesa de exhibición | Herrería | 4 |  | confirmed |  |
| hs-0104 | Joaquín Ledesma | 2026-06-30 | OT4301 | Mesa de exhibición | Herrería | 4 |  | confirmed |  |
| hs-0105 | Joaquín Ledesma | 2026-07-01 | OT4301 | Mesa de exhibición | Herrería | 4 |  | confirmed |  |
| hs-0106 | Sofía Arce | 2026-07-06 | OT4301 | Estantería alta | Pintura y lustre | 6 |  | confirmed |  |
| hs-0107 | Sofía Arce | 2026-07-07 | OT4301 | Estantería alta | Pintura y lustre | 6 |  | confirmed |  |
| hs-0108 | Sofía Arce | 2026-07-08 | OT4301 | Estantería alta | Pintura y lustre | 6 |  | confirmed |  |
| hs-0109 | Sofía Arce | 2026-07-09 | OT4301 | Mesa de exhibición | Pintura y lustre | 6 |  | confirmed |  |
| hs-0137 | Lucía Benítez | 2026-06-24 | OT4302 |  |  | 7 | Diseño barra y banquetas | pendiente |  |
| hs-0225 | Iván Correa | 2026-07-06 | OT4302 | Barra | Carpintería | 5 |  | confirmed |  |
| hs-0226 | Iván Correa | 2026-07-07 | OT4302 | Barra | Carpintería | 5 |  | confirmed |  |
| hs-0227 | Iván Correa | 2026-07-08 | OT4302 | Barra | Carpintería | 5 |  | confirmed |  |
| hs-0228 | Iván Correa | 2026-07-09 | OT4302 | Barra | Carpintería | 5 |  | confirmed |  |
| hs-0229 | Iván Correa | 2026-07-10 | OT4302 | Barra | Carpintería | 5 |  | confirmed |  |
| hs-0230 | Iván Correa | 2026-07-13 | OT4302 | Barra | Carpintería | 5 |  | confirmed |  |
| hs-0231 | Iván Correa | 2026-07-14 | OT4302 | Barra | Carpintería | 5 |  | confirmed |  |
| hs-0232 | Iván Correa | 2026-07-15 | OT4302 | Barra | Carpintería | 5 |  | confirmed |  |
| hs-0233 | Joaquín Ledesma | 2026-07-13 | OT4302 | Barra | Herrería | 4 |  | confirmed |  |
| hs-0234 | Joaquín Ledesma | 2026-07-14 | OT4302 | Barra | Herrería | 4 |  | confirmed |  |
| hs-0235 | Joaquín Ledesma | 2026-07-15 | OT4302 | Barra | Herrería | 4 |  | confirmed |  |
| hs-0236 | Joaquín Ledesma | 2026-07-16 | OT4302 | Barra | Herrería | 4 |  | confirmed |  |
| hs-0237 | Joaquín Ledesma | 2026-07-17 | OT4302 | Barra | Herrería | 4 |  | confirmed |  |
| hs-0238 | Joaquín Ledesma | 2026-07-20 | OT4302 | Barra | Herrería | 4 |  | confirmed |  |
| hs-0239 | Joaquín Ledesma | 2026-07-21 | OT4302 | Barra | Herrería | 4 |  | confirmed |  |
| hs-0240 | Joaquín Ledesma | 2026-07-22 | OT4302 | Barra | Herrería | 4 |  | confirmed |  |
| hs-0241 | Joaquín Ledesma | 2026-07-23 | OT4302 | Banqueta | Herrería | 6 |  | confirmed |  |
| hs-0242 | Joaquín Ledesma | 2026-07-24 | OT4302 | Banqueta | Herrería | 6 |  | confirmed |  |
| hs-0243 | Joaquín Ledesma | 2026-07-27 | OT4302 | Banqueta | Herrería | 6 |  | confirmed |  |
| hs-0244 | Joaquín Ledesma | 2026-07-28 | OT4302 | Banqueta | Herrería | 6 |  | confirmed |  |
| hs-0245 | Joaquín Ledesma | 2026-07-29 | OT4302 | Banqueta | Herrería | 6 |  | confirmed |  |
| hs-0246 | Joaquín Ledesma | 2026-07-30 | OT4302 | Banqueta | Herrería | 6 |  | confirmed |  |
| hs-0247 | Joaquín Ledesma | 2026-07-31 | OT4302 | Banqueta | Herrería | 6 |  | confirmed |  |
| hs-0248 | Joaquín Ledesma | 2026-08-03 | OT4302 | Banqueta | Herrería | 6 |  | confirmed |  |
| hs-0249 | Joaquín Ledesma | 2026-08-04 | OT4302 | Banqueta | Herrería | 6 |  | confirmed |  |
| hs-0250 | Joaquín Ledesma | 2026-08-05 | OT4302 | Banqueta | Herrería | 6 |  | confirmed |  |
| hs-0251 | Matías Godoy | 2026-08-10 | OT4302 | Banqueta | Tapicería | 5 |  | confirmed |  |
| hs-0252 | Matías Godoy | 2026-08-11 | OT4302 | Banqueta | Tapicería | 5 |  | confirmed |  |
| hs-0253 | Matías Godoy | 2026-08-12 | OT4302 | Banqueta | Tapicería | 5 |  | confirmed |  |
| hs-0254 | Matías Godoy | 2026-08-13 | OT4302 | Banqueta | Tapicería | 5 |  | confirmed |  |
| hs-0255 | Sofía Arce | 2026-08-17 | OT4302 | Barra | Pintura y lustre | 6 |  | confirmed |  |
| hs-0256 | Sofía Arce | 2026-08-18 | OT4302 | Barra | Pintura y lustre | 6 |  | confirmed |  |
| hs-0257 | Sofía Arce | 2026-08-19 | OT4302 | Banqueta | Pintura y lustre | 5 |  | confirmed |  |
| hs-0258 | Sofía Arce | 2026-08-20 | OT4302 | Banqueta | Pintura y lustre | 5 |  | confirmed |  |
| hs-0284 | Lucía Benítez | 2026-07-29 | OT4303 |  |  | 8 | Diseño escritorios y lockers | pendiente |  |
| hs-0351 | Diego Paz | 2026-08-17 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0352 | Diego Paz | 2026-08-18 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0353 | Diego Paz | 2026-08-19 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0354 | Diego Paz | 2026-08-20 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0355 | Diego Paz | 2026-08-21 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0356 | Diego Paz | 2026-08-24 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0357 | Diego Paz | 2026-08-25 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0358 | Diego Paz | 2026-08-26 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0359 | Diego Paz | 2026-08-27 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0360 | Diego Paz | 2026-08-28 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0361 | Diego Paz | 2026-08-31 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0362 | Diego Paz | 2026-09-01 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0363 | Diego Paz | 2026-09-02 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0364 | Diego Paz | 2026-09-03 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0365 | Diego Paz | 2026-09-04 | OT4303 | Escritorio | Carpintería | 6 |  | confirmed |  |
| hs-0366 | Camila Rivas | 2026-08-24 | OT4303 | Locker | Carpintería | 4 |  | confirmed |  |
| hs-0367 | Camila Rivas | 2026-08-25 | OT4303 | Locker | Carpintería | 4 |  | confirmed |  |
| hs-0368 | Camila Rivas | 2026-08-26 | OT4303 | Locker | Carpintería | 4 |  | confirmed |  |
| hs-0369 | Camila Rivas | 2026-08-27 | OT4303 | Locker | Carpintería | 4 |  | confirmed |  |
| hs-0370 | Camila Rivas | 2026-08-28 | OT4303 | Locker | Carpintería | 4 |  | confirmed |  |
| hs-0371 | Camila Rivas | 2026-08-31 | OT4303 | Locker | Carpintería | 4 |  | confirmed |  |
| hs-0372 | Camila Rivas | 2026-09-01 | OT4303 | Locker | Carpintería | 4 |  | confirmed |  |
| hs-0373 | Camila Rivas | 2026-09-02 | OT4303 | Locker | Carpintería | 4 |  | confirmed |  |
| hs-0374 | Camila Rivas | 2026-09-03 | OT4303 | Locker | Carpintería | 4 |  | confirmed |  |
| hs-0375 | Camila Rivas | 2026-09-04 | OT4303 | Locker | Carpintería | 4 |  | confirmed |  |
| hs-0376 | Joaquín Ledesma | 2026-08-17 | OT4303 | Escritorio | Herrería | 4 |  | confirmed |  |
| hs-0377 | Joaquín Ledesma | 2026-08-18 | OT4303 | Escritorio | Herrería | 4 |  | confirmed |  |
| hs-0378 | Joaquín Ledesma | 2026-08-19 | OT4303 | Escritorio | Herrería | 4 |  | confirmed |  |
| hs-0379 | Joaquín Ledesma | 2026-08-20 | OT4303 | Escritorio | Herrería | 4 |  | confirmed |  |
| hs-0380 | Joaquín Ledesma | 2026-08-21 | OT4303 | Escritorio | Herrería | 4 |  | confirmed |  |
| hs-0381 | Joaquín Ledesma | 2026-08-24 | OT4303 | Escritorio | Herrería | 4 |  | confirmed |  |
| hs-0382 | Joaquín Ledesma | 2026-08-25 | OT4303 | Escritorio | Herrería | 4 |  | confirmed |  |
| hs-0383 | Joaquín Ledesma | 2026-08-26 | OT4303 | Escritorio | Herrería | 4 |  | confirmed |  |
| hs-0384 | Joaquín Ledesma | 2026-08-27 | OT4303 | Escritorio | Herrería | 4 |  | confirmed |  |
| hs-0385 | Joaquín Ledesma | 2026-08-28 | OT4303 | Escritorio | Herrería | 4 |  | confirmed |  |
| hs-0386 | Sofía Arce | 2026-09-14 | OT4303 | Escritorio | Pintura y lustre | 4 |  | confirmed |  |
| hs-0387 | Sofía Arce | 2026-09-15 | OT4303 | Escritorio | Pintura y lustre | 4 |  | confirmed |  |
| hs-0388 | Sofía Arce | 2026-09-16 | OT4303 | Escritorio | Pintura y lustre | 4 |  | confirmed |  |
| hs-0389 | Sofía Arce | 2026-09-17 | OT4303 | Escritorio | Pintura y lustre | 4 |  | confirmed |  |
| hs-0390 | Sofía Arce | 2026-09-18 | OT4303 | Escritorio | Pintura y lustre | 4 |  | confirmed |  |
| hs-0391 | Sofía Arce | 2026-09-21 | OT4303 | Locker | Pintura y lustre | 4 |  | confirmed |  |
| hs-0392 | Sofía Arce | 2026-09-22 | OT4303 | Locker | Pintura y lustre | 4 |  | confirmed |  |
| hs-0393 | Iván Correa | 2026-10-05 | OT4303 | Escritorio | Armado y montaje | 4 |  | confirmed |  |
| hs-0394 | Iván Correa | 2026-10-06 | OT4303 | Escritorio | Armado y montaje | 4 |  | confirmed |  |
| hs-0395 | Iván Correa | 2026-10-07 | OT4303 | Escritorio | Armado y montaje | 4 |  | confirmed |  |
| hs-0396 | Iván Correa | 2026-10-08 | OT4303 | Escritorio | Armado y montaje | 4 |  | confirmed |  |
| hs-0397 | Iván Correa | 2026-10-09 | OT4303 | Escritorio | Armado y montaje | 4 |  | confirmed |  |
| hs-0418 | Lucía Benítez | 2026-08-05 | OT4304 |  |  | 7 | Diseño mostradores | pendiente |  |
| hs-0419 | Lucía Benítez | 2026-08-06 | OT4304 |  |  | 6 | Detalles exhibidores | pendiente |  |
| hs-0473 | Iván Correa | 2026-08-24 | OT4304 | Mostrador | Carpintería | 3 |  | confirmed |  |
| hs-0474 | Iván Correa | 2026-08-25 | OT4304 | Mostrador | Carpintería | 3 |  | confirmed |  |
| hs-0475 | Iván Correa | 2026-08-26 | OT4304 | Mostrador | Carpintería | 3 |  | confirmed |  |
| hs-0476 | Iván Correa | 2026-08-27 | OT4304 | Mostrador | Carpintería | 3 |  | confirmed |  |
| hs-0477 | Iván Correa | 2026-08-28 | OT4304 | Mostrador | Carpintería | 3 |  | confirmed |  |
| hs-0478 | Iván Correa | 2026-08-31 | OT4304 | Mostrador | Carpintería | 3 |  | confirmed |  |
| hs-0479 | Iván Correa | 2026-09-01 | OT4304 | Mostrador | Carpintería | 3 |  | confirmed |  |
| hs-0480 | Iván Correa | 2026-09-02 | OT4304 | Mostrador | Carpintería | 3 |  | confirmed |  |
| hs-0481 | Iván Correa | 2026-09-03 | OT4304 | Mostrador | Carpintería | 3 |  | confirmed |  |
| hs-0482 | Iván Correa | 2026-09-04 | OT4304 | Mostrador | Carpintería | 3 |  | confirmed |  |
| hs-0483 | Camila Rivas | 2026-09-07 | OT4304 | Exhibidor de pared | Carpintería | 4 |  | confirmed |  |
| hs-0484 | Camila Rivas | 2026-09-08 | OT4304 | Exhibidor de pared | Carpintería | 4 |  | confirmed |  |
| hs-0485 | Camila Rivas | 2026-09-09 | OT4304 | Exhibidor de pared | Carpintería | 4 |  | confirmed |  |
| hs-0486 | Camila Rivas | 2026-09-10 | OT4304 | Exhibidor de pared | Carpintería | 4 |  | confirmed |  |
| hs-0487 | Camila Rivas | 2026-09-11 | OT4304 | Exhibidor de pared | Carpintería | 4 |  | confirmed |  |
| hs-0488 | Camila Rivas | 2026-09-14 | OT4304 | Exhibidor de pared | Carpintería | 4 |  | confirmed |  |
| hs-0489 | Camila Rivas | 2026-09-15 | OT4304 | Exhibidor de pared | Carpintería | 4 |  | confirmed |  |
| hs-0490 | Camila Rivas | 2026-09-16 | OT4304 | Exhibidor de pared | Carpintería | 4 |  | confirmed |  |
| hs-0491 | Camila Rivas | 2026-09-17 | OT4304 | Exhibidor de pared | Carpintería | 4 |  | confirmed |  |
| hs-0492 | Camila Rivas | 2026-09-18 | OT4304 | Exhibidor de pared | Carpintería | 4 |  | confirmed |  |
| hs-0498 | Sofía Arce | 2026-09-23 | OT4304 | Mostrador | Pintura y lustre | 4 |  | confirmed |  |
| hs-0499 | Sofía Arce | 2026-09-24 | OT4304 | Mostrador | Pintura y lustre | 4 |  | confirmed |  |
| hs-0500 | Sofía Arce | 2026-09-25 | OT4304 | Mostrador | Pintura y lustre | 4 |  | confirmed |  |
| hs-0501 | Iván Correa | 2026-10-12 | OT4304 | Mostrador | Armado y montaje | 4 |  | confirmed |  |
| hs-0502 | Iván Correa | 2026-10-13 | OT4304 | Mostrador | Armado y montaje | 4 |  | confirmed |  |
| hs-0526 | Lucía Benítez | 2026-08-12 | OT4305 |  |  | 6 | Diseño recepción | pendiente |  |
| hs-0584 | Diego Paz | 2026-09-07 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0585 | Diego Paz | 2026-09-08 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0586 | Diego Paz | 2026-09-09 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0587 | Diego Paz | 2026-09-10 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0588 | Diego Paz | 2026-09-11 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0589 | Diego Paz | 2026-09-14 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0590 | Diego Paz | 2026-09-15 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0591 | Diego Paz | 2026-09-16 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0592 | Diego Paz | 2026-09-17 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0593 | Diego Paz | 2026-09-18 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0594 | Diego Paz | 2026-09-28 | OT4305 | Mostrador de recepción | Carpintería | 8 |  | confirmed |  |
| hs-0595 | Diego Paz | 2026-09-29 | OT4305 | Mostrador de recepción | Carpintería | 8 |  | confirmed |  |
| hs-0596 | Diego Paz | 2026-09-30 | OT4305 | Mostrador de recepción | Carpintería | 8 |  | confirmed |  |
| hs-0493 | Camila Rivas | 2026-09-21 | OT4304 | Exhibidor de pared | Pintura y lustre | 4 |  | confirmed |  |
| hs-0597 | Camila Rivas | 2026-09-21 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0494 | Camila Rivas | 2026-09-22 | OT4304 | Exhibidor de pared | Pintura y lustre | 4 |  | confirmed |  |
| hs-0598 | Camila Rivas | 2026-09-22 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0495 | Camila Rivas | 2026-09-23 | OT4304 | Exhibidor de pared | Pintura y lustre | 4 |  | confirmed |  |
| hs-0599 | Camila Rivas | 2026-09-23 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0496 | Camila Rivas | 2026-09-24 | OT4304 | Exhibidor de pared | Pintura y lustre | 4 |  | confirmed |  |
| hs-0600 | Camila Rivas | 2026-09-24 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0497 | Camila Rivas | 2026-09-25 | OT4304 | Exhibidor de pared | Pintura y lustre | 4 |  | confirmed |  |
| hs-0601 | Camila Rivas | 2026-09-25 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0602 | Camila Rivas | 2026-09-28 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0603 | Camila Rivas | 2026-09-29 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0604 | Camila Rivas | 2026-09-30 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0605 | Camila Rivas | 2026-10-01 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0606 | Camila Rivas | 2026-10-02 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0607 | Camila Rivas | 2026-10-05 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0608 | Camila Rivas | 2026-10-06 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0609 | Camila Rivas | 2026-10-07 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0610 | Camila Rivas | 2026-10-08 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0611 | Camila Rivas | 2026-10-09 | OT4305 | Mueble de guardado | Carpintería | 4 |  | confirmed |  |
| hs-0612 | Joaquín Ledesma | 2026-09-14 | OT4305 | Sillón de espera | Herrería | 2 |  | confirmed |  |
| hs-0613 | Joaquín Ledesma | 2026-09-15 | OT4305 | Sillón de espera | Herrería | 2 |  | confirmed |  |
| hs-0614 | Joaquín Ledesma | 2026-09-16 | OT4305 | Sillón de espera | Herrería | 2 |  | confirmed |  |
| hs-0615 | Joaquín Ledesma | 2026-09-17 | OT4305 | Sillón de espera | Herrería | 2 |  | confirmed |  |
| hs-0616 | Joaquín Ledesma | 2026-09-18 | OT4305 | Sillón de espera | Herrería | 2 |  | confirmed |  |
| hs-0617 | Joaquín Ledesma | 2026-09-21 | OT4305 | Sillón de espera | Herrería | 2 |  | confirmed |  |
| hs-0618 | Joaquín Ledesma | 2026-09-22 | OT4305 | Sillón de espera | Herrería | 2 |  | confirmed |  |
| hs-0619 | Joaquín Ledesma | 2026-09-23 | OT4305 | Sillón de espera | Herrería | 2 |  | confirmed |  |
| hs-0620 | Joaquín Ledesma | 2026-09-24 | OT4305 | Sillón de espera | Herrería | 2 |  | confirmed |  |
| hs-0621 | Joaquín Ledesma | 2026-09-25 | OT4305 | Sillón de espera | Herrería | 2 |  | confirmed |  |
| hs-0622 | Diego Paz | 2026-10-12 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0623 | Diego Paz | 2026-10-13 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0624 | Diego Paz | 2026-10-14 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0627 | Camila Rivas | 2026-10-12 | OT4305 | Mueble de guardado | Carpintería | 6 |  | confirmed |  |
| hs-0628 | Camila Rivas | 2026-10-13 | OT4305 | Mueble de guardado | Carpintería | 6 |  | confirmed |  |
| hs-0629 | Camila Rivas | 2026-10-14 | OT4305 | Mueble de guardado | Carpintería | 6 |  | confirmed |  |
| hs-0680 | Lucía Benítez | 2026-09-03 | OT4306 |  |  | 7 | Diseño barra y mesas | pendiente |  |
| hs-0681 | Lucía Benítez | 2026-09-04 | OT4306 |  |  | 6 | Diseño silla | pendiente |  |
| hs-0682 | Lucía Benítez | 2026-09-04 | Trabajo interno |  |  | 2 | Capacitación interna | pendiente |  |
| hs-0683 | Tomás Ferreyra | 2026-09-07 | OT4306 |  |  | 4 | Negociación con el cliente | pendiente |  |
| hs-0684 | Paula Sosa | 2026-09-17 | OT4306 |  |  | 3 | Pedidos de caño, espuma y tela | pendiente |  |
| hs-0685 | Paula Sosa | 2026-09-17 | Trabajo interno |  |  | 4 | Orden del depósito | pendiente |  |
| hs-0746 | Lucía Benítez | 2026-09-23 | OT4307 |  |  | 6 | Diseño biblioteca | pendiente |  |
| hs-0747 | Lucía Benítez | 2026-10-05 | OT4307 |  |  | 4 | Ajustes de diseño (BOM v2) | pendiente |  |
| hs-0798 | Joaquín Ledesma | 2026-09-28 | OT4306 | Silla | Herrería | 4 |  | confirmed |  |
| hs-0799 | Joaquín Ledesma | 2026-09-29 | OT4306 | Silla | Herrería | 4 |  | confirmed |  |
| hs-0800 | Joaquín Ledesma | 2026-09-30 | OT4306 | Silla | Herrería | 4 |  | confirmed |  |
| hs-0801 | Joaquín Ledesma | 2026-10-01 | OT4306 | Silla | Herrería | 4 |  | confirmed |  |
| hs-0802 | Joaquín Ledesma | 2026-10-02 | OT4306 | Silla | Herrería | 4 |  | confirmed |  |
| hs-0803 | Joaquín Ledesma | 2026-10-05 | OT4306 | Silla | Herrería | 4 |  | confirmed |  |
| hs-0804 | Joaquín Ledesma | 2026-10-06 | OT4306 | Silla | Herrería | 4 |  | confirmed |  |
| hs-0805 | Joaquín Ledesma | 2026-10-07 | OT4306 | Silla | Herrería | 4 |  | confirmed |  |
| hs-0806 | Joaquín Ledesma | 2026-10-08 | OT4306 | Silla | Herrería | 4 |  | confirmed |  |
| hs-0807 | Joaquín Ledesma | 2026-10-09 | OT4306 | Silla | Herrería | 4 |  | confirmed |  |
| hs-0808 | Diego Paz | 2026-10-01 | OT4306 | Barra | Carpintería | 4 |  | confirmed |  |
| hs-0809 | Diego Paz | 2026-10-02 | OT4306 | Barra | Carpintería | 4 |  | confirmed |  |
| hs-0810 | Diego Paz | 2026-10-05 | OT4306 | Barra | Carpintería | 4 |  | confirmed |  |
| hs-0811 | Diego Paz | 2026-10-06 | OT4306 | Barra | Carpintería | 4 |  | confirmed |  |
| hs-0812 | Diego Paz | 2026-10-07 | OT4306 | Barra | Carpintería | 4 |  | confirmed |  |
| hs-0813 | Diego Paz | 2026-10-08 | OT4306 | Barra | Carpintería | 4 |  | confirmed |  |
| hs-0814 | Diego Paz | 2026-10-09 | OT4306 | Barra | Carpintería | 4 |  | confirmed |  |
| hs-0815 | Iván Correa | 2026-10-14 | OT4306 | Mesa | Carpintería | 6 |  | confirmed |  |
| hs-0816 | Iván Correa | 2026-10-15 | OT4306 | Mesa | Carpintería | 6 |  | confirmed |  |
| hs-0817 | Iván Correa | 2026-10-16 | OT4306 | Mesa | Carpintería | 6 |  | confirmed |  |
| hs-0818 | Matías Godoy | 2026-10-12 | OT4306 | Silla | Tapicería | 6 |  | confirmed |  |
| hs-0819 | Matías Godoy | 2026-10-13 | OT4306 | Silla | Tapicería | 6 |  | confirmed |  |
| hs-0820 | Matías Godoy | 2026-10-14 | OT4306 | Silla | Tapicería | 6 |  | confirmed |  |
| hs-0821 | Matías Godoy | 2026-10-15 | OT4306 | Silla | Tapicería | 6 |  | confirmed |  |
| hs-0822 | Matías Godoy | 2026-10-16 | OT4306 | Silla | Tapicería | 6 |  | confirmed |  |
| hs-0823 | Joaquín Ledesma | 2026-10-12 | OT4306 | Mesa | Herrería | 3 |  | confirmed |  |
| hs-0824 | Joaquín Ledesma | 2026-10-13 | OT4306 | Mesa | Herrería | 3 |  | confirmed |  |
| hs-0825 | Joaquín Ledesma | 2026-10-14 | OT4306 | Mesa | Herrería | 3 |  | confirmed |  |
| hs-0826 | Joaquín Ledesma | 2026-10-15 | OT4306 | Mesa | Herrería | 3 |  | confirmed |  |
| hs-0827 | Joaquín Ledesma | 2026-10-16 | OT4306 | Mesa | Herrería | 3 |  | confirmed |  |
| hs-0837 | Lucía Benítez | 2026-10-15 | OT4308 |  |  | 6 | Planos respaldos | pendiente |  |
| hs-0838 | Lucía Benítez | 2026-10-16 | OT4308 |  |  | 5 | BOM borrador | pendiente |  |
| hs-0625 | Diego Paz | 2026-10-15 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0925 | Diego Paz | 2026-10-15 | OT4306 | Mesa | Carpintería | 4 |  | confirmed |  |
| hs-0626 | Diego Paz | 2026-10-16 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | confirmed |  |
| hs-0926 | Diego Paz | 2026-10-16 | OT4306 | Mesa | Carpintería | 4 |  | corrected | 5 → 4 h |
| hs-0927 | Camila Rivas | 2026-10-15 | OT4305 | Mueble de guardado | Carpintería | 10 |  | confirmed |  |
| hs-0928 | Diego Paz | 2026-10-19 | OT4306 | Barra | Carpintería | 4 |  | pendiente |  |
| hs-0929 | Diego Paz | 2026-10-19 | OT4305 | Mostrador de recepción | Carpintería | 4 |  | pendiente |  |
| hs-0930 | Iván Correa | 2026-10-19 | OT4306 | Barra | Carpintería | 8 |  | pendiente |  |
| hs-0931 | Joaquín Ledesma | 2026-10-19 | OT4306 | Mesa | Herrería | 6 |  | pendiente |  |
| hs-0932 | Joaquín Ledesma | 2026-10-19 | Trabajo interno |  |  | 2 | Mantenimiento de la soldadora | pendiente |  |
| hs-0933 | Matías Godoy | 2026-10-19 | OT4306 | Silla | Tapicería | 6 |  | pendiente |  |
| hs-0934 | Matías Godoy | 2026-10-19 | OT4305 | Sillón de espera | Tapicería | 2 |  | pendiente |  |
| hs-0935 | Camila Rivas | 2026-10-19 | OT4305 | Mueble de guardado | Carpintería | 6 |  | pendiente |  |
| hs-0936 | Camila Rivas | 2026-10-19 | Trabajo interno |  |  | 2 | Limpieza y orden del taller | pendiente |  |
| hs-0937 | Raúl Medina | 2026-10-19 | OT4306 |  |  | 2 | Seguimiento de producción | pendiente |  |
| hs-0938 | Raúl Medina | 2026-10-19 | Trabajo interno |  |  | 6 | Planificación semanal y control | pendiente |  |
| hs-0939 | Paula Sosa | 2026-10-19 | Trabajo interno |  |  | 3 | Inventario de herrajes | pendiente |  |
| hs-0940 | Matías Godoy | 2026-10-20 | OT4305 | Sillón de espera | Tapicería | 2 |  | pendiente |  |

## Otros costos reales

Archivo: `datos/otros_costos.csv` · 2 registros.

| id | ot | fecha | descripcion | categoria | monto |
| --- | --- | --- | --- | --- | --- |
| oc-gasto-0265 | OT4302 | 2026-08-27 | Flete de entrega (camioneta alquilada) | Fletes | 95000 |
| oc-gasto-0829 | OT4306 | 2026-10-09 | Flete urgente de caños (proveedor sin stock) | Fletes | 85000 |

## Ingresos efectivos

Archivo: `datos/ingresos.csv` · 11 registros.

| id | ot | fecha | importe | referencia |
| --- | --- | --- | --- | --- |
| ing-0025 | OT4301 | 2026-06-09 | 1960000 | Seña transferencia |
| ing-0115 | OT4301 | 2026-08-05 | 1960000 | Saldo transferencia |
| ing-0136 | OT4302 | 2026-07-03 | 1748000 | Seña |
| ing-0262 | OT4302 | 2026-08-10 | 1311000 | Cuota 1 (con 7 días de atraso) |
| ing-0273 | OT4303 | 2026-08-05 | 2252000 | Seña |
| ing-0401 | OT4303 | 2026-09-15 | 2252000 | Cuota |
| ing-0409 | OT4304 | 2026-08-12 | 1750000 | Seña |
| ing-0506 | OT4304 | 2026-09-25 | 875000 | Cuota |
| ing-0515 | OT4305 | 2026-08-20 | 1209000 | Seña |
| ing-0667 | OT4306 | 2026-09-15 | 3235000 | Seña transferencia |
| ing-0717 | OT4307 | 2026-10-01 | 1665000 | Seña |

## Revisiones de contrato

Archivo: `datos/revisiones_contrato.csv` · 1 registros.

| id | ot | fecha | anterior | nuevo | nota |
| --- | --- | --- | --- | --- | --- |
| rev-0637 | OT4305 | 2026-09-30 | 4030000 | 4450000 | Adicional Tapicería |

## Entregas al cliente

Archivo: `datos/entregas_cliente.csv` · 4 registros.

| id | ot | fecha | nota |
| --- | --- | --- | --- |
| entc-0113 | OT4301 | 2026-07-28 | Entregado e instalado en el local |
| entc-0263 | OT4302 | 2026-08-27 |  |
| entc-0402 | OT4303 | 2026-10-14 | Entregado en el edificio |
| entc-0507 | OT4304 | 2026-10-15 |  |

## Cierres

Archivo: `datos/cierres.csv` · 2 registros.

| ot | fecha | por | contract | materials | labor | staff | other | operatingCost | operatingProfit | operatingMarginPct | collected | financialAtClose |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OT4301 | 2026-08-10 | Marina Quiroga | 3920000 | 1237100 | 1055200 | 165000 | 0 | 2457300 | 1462700 | 37,31 | 3920000 | 23143,86 |
| OT4302 | 2026-09-04 | Marina Quiroga | 4370000 | 1492000 | 1483600 | 84000 | 95000 | 3154600 | 1215400 | 27,81 | 3059000 | 10282,64 |

## Historial de las OTs

Archivo: `datos/historial.csv` · 89 registros.

| id | ot | fecha | por | tipo | automatico | texto |
| --- | --- | --- | --- | --- | --- | --- |
| act-0856 | OT4311 | 2026-10-19 | Tomás Ferreyra | created |  | OT OT4311_RestoCardoAjo_AlacenaCocina creada para Restó Cardo y Ajo |
| act-0852 | OT4310 | 2026-10-09 | Tomás Ferreyra | created |  | OT OT4310_CafeBrujula_TerrazaMesasExteriores creada para Café Brújula |
| act-0853 | OT4310 | 2026-10-12 | Tomás Ferreyra | quote |  | Cotización: Enviada, sin respuesta |
| act-0854 | OT4310 | 2026-10-15 | Tomás Ferreyra | quote |  | Cotización: En negociación |
| act-0849 | OT4309 | 2026-10-06 | Tomás Ferreyra | created |  | OT OT4309_EscuelaMusicaClave_AtrilesBancos creada para Escuela de Música Clave de Sol |
| act-0850 | OT4309 | 2026-10-08 | Tomás Ferreyra | quote |  | Cotización: Enviada, sin respuesta |
| act-0833 | OT4308 | 2026-10-01 | Tomás Ferreyra | created |  | OT OT4308_HotelPuertoColibri_RespaldosMesasLuz12 creada para Hotel Puerto Colibrí |
| act-0834 | OT4308 | 2026-10-02 | Tomás Ferreyra | quote |  | Cotización: Enviada, sin respuesta |
| act-0835 | OT4308 | 2026-10-07 | Tomás Ferreyra | quote |  | Cotización: En negociación |
| act-0836 | OT4308 | 2026-10-14 | Tomás Ferreyra | status |  | En cotización → Aprobado · Aprobada por el cliente · contrato 8830000 |
| act-0714 | OT4307 | 2026-09-21 | Tomás Ferreyra | created |  | OT OT4307_EstudioArenal_BibliotecaEscritorio creada para Estudio Arenal Arquitectura |
| act-0715 | OT4307 | 2026-09-22 | Tomás Ferreyra | quote |  | Cotización: Enviada, sin respuesta |
| act-0716 | OT4307 | 2026-09-29 | Tomás Ferreyra | status |  | En cotización → Aprobado · Aprobada por el cliente · contrato 3330000 |
| act-0726 | OT4307 | 2026-10-02 | Tomás Ferreyra | bom |  | BOM v1 publicado y enviado a Compras |
| act-0727 | OT4307 | 2026-10-02 | Tomás Ferreyra | status | sí | Aprobado → Compras · BOM publicado |
| act-0745 | OT4307 | 2026-10-06 | Tomás Ferreyra | bom |  | BOM v2 publicado y enviado a Compras (3 cambios) |
| act-0663 | OT4306 | 2026-09-01 | Tomás Ferreyra | created |  | OT OT4306_CafeBrujula_BarraMesas12Sillas creada para Café Brújula |
| act-0664 | OT4306 | 2026-09-02 | Tomás Ferreyra | quote |  | Cotización: Enviada, sin respuesta |
| act-0665 | OT4306 | 2026-09-08 | Tomás Ferreyra | quote |  | Cotización: En negociación |
| act-0666 | OT4306 | 2026-09-14 | Tomás Ferreyra | status |  | En cotización → Aprobado · Aprobada por el cliente · contrato 6470000 |
| act-0678 | OT4306 | 2026-09-16 | Tomás Ferreyra | bom |  | BOM v1 publicado y enviado a Compras |
| act-0679 | OT4306 | 2026-09-16 | Tomás Ferreyra | status | sí | Aprobado → Compras · BOM publicado |
| act-0694 | OT4306 | 2026-09-22 | Paula Sosa | stock |  | Stock asignado: Placa MDF 18 mm 2 |
| act-0695 | OT4306 | 2026-09-22 | Paula Sosa | status | sí | Compras → Producción · stock libre asignado |
| act-0698 | OT4306 | 2026-09-22 | Paula Sosa | stock |  | Stock asignado: Tapacanto PVC 22 mm 30 |
| act-0756 | OT4306 | 2026-10-13 | Paula Sosa | stock |  | Recepción revertida en OC-0020: Multilaminado fenólico 18 mm 6 · Se contaron 6 placas y llegaron 4 |
| act-0828 | OT4306 | 2026-10-16 | Raúl Medina | units |  | Silla: 0/12 → 8/12 terminadas |
| act-0512 | OT4305 | 2026-08-10 | Tomás Ferreyra | created |  | OT OT4305_ClinicaDental_MueblesRecepcion creada para Clínica Dental Sonrisa Norte |
| act-0513 | OT4305 | 2026-08-11 | Tomás Ferreyra | quote |  | Cotización: Enviada, sin respuesta |
| act-0514 | OT4305 | 2026-08-18 | Tomás Ferreyra | status |  | En cotización → Aprobado · Aprobada por el cliente · contrato 4030000 |
| act-0524 | OT4305 | 2026-08-21 | Tomás Ferreyra | bom |  | BOM v1 publicado y enviado a Compras |
| act-0525 | OT4305 | 2026-08-21 | Tomás Ferreyra | status | sí | Aprobado → Compras · BOM publicado |
| act-0544 | OT4305 | 2026-08-31 | Paula Sosa | status | sí | Compras → Producción · material recibido (OC-0013) |
| act-0630 | OT4305 | 2026-10-02 | Raúl Medina | units |  | Sillón de espera: 0/3 → 2/3 terminadas |
| act-0636 | OT4305 | 2026-09-30 | Tomás Ferreyra | additional |  | Adicional aprobado: Tapicería en Sillón de espera · 12 h |
| act-0638 | OT4305 | 2026-09-30 | Tomás Ferreyra | contract |  | Contrato vigente 4030000 → 4450000 · Adicional Tapicería |
| act-0649 | OT4305 | 2026-09-30 | Tomás Ferreyra | bom |  | BOM v2 publicado y enviado a Compras (2 cambios) |
| act-0406 | OT4304 | 2026-08-03 | Tomás Ferreyra | created |  | OT OT4304_OpticaVisionClara_MostradoresExhibidores creada para Óptica Visión Clara |
| act-0407 | OT4304 | 2026-08-04 | Tomás Ferreyra | quote |  | Cotización: Enviada, sin respuesta |
| act-0408 | OT4304 | 2026-08-10 | Tomás Ferreyra | status |  | En cotización → Aprobado · Aprobada por el cliente · contrato 3500000 |
| act-0416 | OT4304 | 2026-08-12 | Tomás Ferreyra | bom |  | BOM v1 publicado y enviado a Compras |
| act-0417 | OT4304 | 2026-08-12 | Tomás Ferreyra | status | sí | Aprobado → Compras · BOM publicado |
| act-0433 | OT4304 | 2026-08-24 | Paula Sosa | status | sí | Compras → Producción · material recibido (OC-0011) |
| act-0438 | OT4304 | 2026-09-21 | Paula Sosa | stock |  | Stock asignado: Laca nitro 2.5 |
| act-0503 | OT4304 | 2026-09-25 | Raúl Medina | units |  | Exhibidor de pared: 0/6 → 6/6 terminadas |
| act-0504 | OT4304 | 2026-10-13 | Raúl Medina | units |  | Mostrador: 0/2 → 2/2 terminadas |
| act-0505 | OT4304 | 2026-10-13 | Raúl Medina | units | sí | Todos los muebles terminados: lista para revisar cierre (Gerencia) |
| act-0508 | OT4304 | 2026-10-15 | Raúl Medina | handover |  | Entregado al cliente el 2026-10-15 |
| act-0270 | OT4303 | 2026-07-27 | Tomás Ferreyra | created |  | OT OT4303_CoworkingNodoSur_EscritoriosLockers creada para Coworking Nodo Sur |
| act-0271 | OT4303 | 2026-07-28 | Tomás Ferreyra | quote |  | Cotización: Enviada, sin respuesta |
| act-0272 | OT4303 | 2026-08-03 | Tomás Ferreyra | status |  | En cotización → Aprobado · Aprobada por el cliente · contrato 5630000 |
| act-0282 | OT4303 | 2026-08-06 | Tomás Ferreyra | bom |  | BOM v1 publicado y enviado a Compras |
| act-0283 | OT4303 | 2026-08-06 | Tomás Ferreyra | status | sí | Aprobado → Compras · BOM publicado |
| act-0294 | OT4303 | 2026-08-17 | Paula Sosa | status | sí | Compras → Producción · material recibido (OC-0008) |
| act-0305 | OT4303 | 2026-08-17 | Paula Sosa | stock |  | Stock asignado: Melamina blanca 18 mm 5 |
| act-0308 | OT4303 | 2026-08-17 | Paula Sosa | stock |  | Stock asignado: Tapacanto PVC 22 mm 60 |
| act-0311 | OT4303 | 2026-08-24 | Paula Sosa | stock |  | Stock asignado: Bisagra cazoleta 16 |
| act-0314 | OT4303 | 2026-10-05 | Paula Sosa | stock |  | Stock asignado: Tornillo 4×40 (caja de 100) 6 |
| act-0398 | OT4303 | 2026-09-22 | Raúl Medina | units |  | Locker: 0/4 → 4/4 terminadas |
| act-0399 | OT4303 | 2026-10-09 | Raúl Medina | units |  | Escritorio: 0/10 → 10/10 terminadas |
| act-0400 | OT4303 | 2026-10-09 | Raúl Medina | units | sí | Todos los muebles terminados: lista para revisar cierre (Gerencia) |
| act-0403 | OT4303 | 2026-10-14 | Raúl Medina | handover |  | Entregado al cliente el 2026-10-14 |
| act-0120 | OT4302 | 2026-06-22 | Tomás Ferreyra | created |  | OT OT4302_RestoCardoAjo_BarraBanquetas creada para Restó Cardo y Ajo |
| act-0121 | OT4302 | 2026-06-23 | Tomás Ferreyra | quote |  | Cotización: Enviada, sin respuesta |
| act-0122 | OT4302 | 2026-06-26 | Tomás Ferreyra | quote |  | Cotización: En negociación |
| act-0123 | OT4302 | 2026-07-01 | Tomás Ferreyra | status |  | En cotización → Aprobado · Aprobada por el cliente · contrato 4370000 |
| act-0134 | OT4302 | 2026-07-02 | Tomás Ferreyra | bom |  | BOM v1 publicado y enviado a Compras |
| act-0135 | OT4302 | 2026-07-02 | Tomás Ferreyra | status | sí | Aprobado → Compras · BOM publicado |
| act-0157 | OT4302 | 2026-07-06 | Paula Sosa | status | sí | Compras → Producción · material recibido (OC-0004) |
| act-0259 | OT4302 | 2026-08-18 | Raúl Medina | units |  | Barra: 0/1 → 1/1 terminadas |
| act-0260 | OT4302 | 2026-08-20 | Raúl Medina | units |  | Banqueta: 0/8 → 8/8 terminadas |
| act-0261 | OT4302 | 2026-08-20 | Raúl Medina | units | sí | Todos los muebles terminados: lista para revisar cierre (Gerencia) |
| act-0264 | OT4302 | 2026-08-27 | Raúl Medina | handover |  | Entregado al cliente el 2026-08-27 |
| act-0266 | OT4302 | 2026-09-04 | Marina Quiroga | status |  | Producción → Cerrado · cierre de Gerencia |
| act-0267 | OT4302 | 2026-09-04 | Marina Quiroga | closure |  | Cierre: costo operativo 3154600, cobrado 3059000 de 4370000 |
| act-0013 | OT4301 | 2026-06-01 | Tomás Ferreyra | created |  | OT OT4301_LibreriaFaroAzul_EstanteriasSalon creada para Librería El Faro Azul |
| act-0014 | OT4301 | 2026-06-02 | Tomás Ferreyra | quote |  | Cotización: Enviada, sin respuesta |
| act-0015 | OT4301 | 2026-06-08 | Tomás Ferreyra | status |  | En cotización → Aprobado · Aprobada por el cliente · contrato 3920000 |
| act-0023 | OT4301 | 2026-06-09 | Tomás Ferreyra | bom |  | BOM v1 publicado y enviado a Compras |
| act-0024 | OT4301 | 2026-06-09 | Tomás Ferreyra | status | sí | Aprobado → Compras · BOM publicado |
| act-0043 | OT4301 | 2026-06-15 | Paula Sosa | status | sí | Compras → Producción · material recibido (OC-0001) |
| act-0055 | OT4301 | 2026-06-15 | Paula Sosa | stock |  | Stock asignado: Tapacanto PVC 22 mm 80 |
| act-0058 | OT4301 | 2026-06-15 | Paula Sosa | stock |  | Stock asignado: Laca nitro 4 |
| act-0110 | OT4301 | 2026-07-08 | Raúl Medina | units |  | Estantería alta: 0/4 → 4/4 terminadas |
| act-0111 | OT4301 | 2026-07-09 | Raúl Medina | units |  | Mesa de exhibición: 0/2 → 2/2 terminadas |
| act-0112 | OT4301 | 2026-07-09 | Raúl Medina | units | sí | Todos los muebles terminados: lista para revisar cierre (Gerencia) |
| act-0114 | OT4301 | 2026-07-28 | Raúl Medina | handover |  | Entregado al cliente el 2026-07-28 |
| act-0116 | OT4301 | 2026-08-10 | Marina Quiroga | status |  | Producción → Cerrado · cierre de Gerencia |
| act-0117 | OT4301 | 2026-08-10 | Marina Quiroga | closure |  | Cierre: costo operativo 2457300, cobrado 3920000 de 3920000 |
