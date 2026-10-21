// Punta a punta del circuito sobre la base local (migraciones reales + 4 usuarios). Cada eslabón: PASA / FALLA / NO PROBADO.
import { as, go, shot, errors, browser } from "./common.mjs";
const results = [];
const step = async (name, fn) => {
  try { const note = await fn(); results.push({ name, ok: true, note: note ?? "" }); }
  catch (e) { results.push({ name, ok: false, note: String(e.message ?? e).split("\n")[0].slice(0, 200) }); }
};
const session = async (who, mode) => {
  const page = await as(who);
  if (mode) await page.addInitScript((m) => localStorage.setItem("nexo-ui-v2", JSON.stringify({ state: { currentMode: m, actingOperatorId: null }, version: 5 })), mode);
  return page;
};
const saved = async (page) => { await page.waitForTimeout(1500); await page.reload(); await page.waitForTimeout(2500); };
const expectText = async (loc, re, what) => { const t = await loc.innerText(); if (!re.test(t)) throw new Error(`No aparece ${what}`); };
const admin = await session("laura", "administracion");
const ger = await session("laura", "gerencia");
const compras = await session("martin");
const jefe = await session("carla");
const P = "/projects/p-1056";

await step("1. Administración: renegociación de precio (queda en cotización, subestado En negociación)", async () => {
  await go(admin, P);
  await admin.getByRole("button", { name: "Renegociar precio" }).click();
  const d = admin.getByRole("dialog");
  await d.getByLabel("Precio nuevo (sin IVA)").fill("5200000");
  await d.getByLabel("Motivo").fill("El cliente pidió ajustar el precio");
  await d.getByRole("button", { name: "Guardar renegociación" }).click();
  await saved(admin);
  await expectText(admin.locator("main"), /En negociación/, "En negociación después de recargar");
});
await step("2. Administración: aprobado por el cliente → Diseño", async () => {
  await admin.getByRole("button", { name: "Aprobado por el cliente" }).click();
  await saved(admin);
  await expectText(admin.locator("main"), /Aprobado · en Diseño/, "Aprobado · en Diseño");
});
await step("3. Diseño: corrige MDF 18 mm de 8 a 10 con motivo (corrección auditada)", async () => {
  await admin.getByRole("tab", { name: "Muebles" }).click();
  await admin.getByRole("button", { name: /Corregir cantidad \(Diseño\)/ }).click();
  const d = admin.getByRole("dialog");
  const opt = await d.getByLabel("Material").locator("option", { hasText: "MDF 18 mm" }).first().getAttribute("value");
  await d.getByLabel("Material").selectOption(opt);
  await d.getByLabel(/Cantidad real/).fill("10");
  await d.getByLabel("Motivo").fill("con los planos finales se necesitan 10 placas");
  await d.getByRole("button", { name: "Guardar corrección" }).click();
  await saved(admin);
  await admin.getByRole("tab", { name: "Muebles" }).click();
  await expectText(admin.locator("main"), /cotizado 8 → real 10 \(\+2\)/, "cotizado 8 → real 10 (+2)");
  await expectText(admin.locator("main"), /con los planos finales/, "el motivo");
  await shot(admin, "e2e-03-diseno-cotizado-real");
});
await step("4. Administración: Diseño listo → Compras", async () => {
  await admin.getByRole("button", { name: /enviar a Compras/ }).click();
  await saved(admin);
  await expectText(admin.locator("main"), /En proceso · Compras/, "En proceso · Compras");
});
await step("5a. Compras: le llega en 'Proyectos nuevos para comprar'", async () => {
  await go(compras, "/compras");
  await expectText(compras.getByRole("region", { name: "Proyectos nuevos para comprar" }), /P-1056/, "P-1056");
});
await step("5b. Compras: la necesidad usa la cantidad real (10)", async () => {
  await go(compras, "/compras/proyectos?p=p-1056");
  await compras.getByRole("radio", { name: "Todos" }).click().catch(() => {});
  await expectText(compras.locator("main"), /MDF 18 mm[\s\S]*Necesario 10 placa/, "Necesario 10 placa");
  await shot(compras, "e2e-05-compras-necesidad");
});
await step("5c. Compras: marca 'Aumentó por Diseño (+2)' y presupuesto original", async () => {
  await expectText(compras.locator("main"), /Aumentó por Diseño/, "Aumentó por Diseño");
});
await step("6. Gerencia: desvío por cantidad en la ficha y alerta con $", async () => {
  await go(ger, P);
  await expectText(ger.getByText("Por cantidad (Diseño)").locator("xpath=.."), /\+\$/, "desvío por cantidad");
  await go(ger, "/dashboard");
  await expectText(ger.getByRole("region", { name: "Diseño cambió materiales" }), /P-1056[\s\S]*\+\$/, "alerta con impacto");
  await shot(ger, "e2e-06-gerencia-dashboard");
});
await step("7. Administración: Compras → enviar a planta", async () => {
  await go(admin, P);
  await admin.getByRole("button", { name: "Enviar a planta" }).click();
  await saved(admin);
  await expectText(admin.locator("main"), /En proceso · Planta/, "En proceso · Planta");
});
await step("8a. Jefe: le llega en 'Proyectos nuevos para recibir'", async () => {
  await go(jefe, "/planta");
  await expectText(jefe.getByRole("region", { name: "Proyectos nuevos para recibir" }), /P-1056/, "P-1056");
});
await step("8b. Jefe: ve la cantidad real de materiales (sin importes)", async () => {
  await go(jefe, "/planta/proyectos");
  await expectText(jefe.locator("main"), /cotizado 8 → real 10/, "cotizado 8 → real 10");
});
await step("9. Jefe: carga las unidades terminadas y le aparece '¿Se terminó este proyecto?'", async () => {
  await go(jefe, "/planta/proyectos");
  await jefe.getByRole("button", { name: "Una unidad más de Stand institucional 50 m²" }).click();
  await saved(jefe);
  await expectText(jefe.getByRole("region", { name: "¿Se terminó este proyecto?" }), /Todas las unidades están terminadas/, "la pregunta");
  await shot(jefe, "e2e-09-jefe-termino");
});
await step("10. Administración: 'Proyecto listo: ¿qué se hace?' → se finaliza", async () => {
  await go(admin, "/administracion");
  await expectText(admin.getByRole("region", { name: "Proyectos listos: ¿qué se hace?" }), /P-1056/, "P-1056 listo");
  await go(admin, P);
  await admin.getByRole("button", { name: /Proyecto listo/ }).click();
  const d = admin.getByRole("dialog");
  await d.getByRole("radio", { name: "Se finaliza" }).click();
  await d.getByRole("button", { name: "Guardar" }).click();
  await saved(admin);
  await expectText(admin.locator("main"), /Entrega definida/, "Entrega definida");
});
await step("11. Gerencia: le llega 'Listos para cerrar'", async () => {
  await go(ger, "/dashboard");
  await expectText(ger.getByRole("region", { name: "Listos para cerrar" }), /P-1056/, "P-1056");
});
for (const x of results) console.log(`${x.ok ? "PASA " : "FALLA"} ${x.name}${x.note ? " — " + x.note : ""}`);
console.log("errores", JSON.stringify(errors.slice(0, 10)));
await browser.close();
