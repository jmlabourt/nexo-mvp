// Capturas antes / después (pedido §11.1): Dashboard, Proyecto, Cotizador, Compras, Planta y Mi día, escritorio y móvil.
// MODE=antes → versión anterior (cuenta real, usuarios locales). MODE=despues → modo demostración.
import { as, go, errors, browser } from "./common.mjs";
const OUT = process.env.OUT;
const MODE = process.env.MODE;
const ui = (page, mode, op = null) => page.evaluate(([m, o]) => localStorage.setItem("nexo-ui-v2", JSON.stringify({ state: { currentMode: m, actingOperatorId: o }, version: 5 })), [mode, op]);
const screens = [
  ["1-gerencia-dashboard", "gerencia", "laura", "/dashboard"],
  ["2-gerencia-proyecto", "gerencia", "laura", "/projects/p-1058"],
  ["3-administracion-cotizador", "administracion", "laura", "/quotes"],
  ["4-compras-necesidades", "compras", "martin", "/compras/proyectos"],
  ["5-jefe-proyectos", "jefe_planta", "carla", "/planta/proyectos"],
  ["6-operario-mi-dia", "operario", "juan", "/taller"],
];
const viewports = { escritorio: { width: 1440, height: 900 }, movil: { width: 390, height: 844 } };
for (const [vpName, vp] of Object.entries(viewports)) {
  const pages = {};
  const pageFor = async (who) => {
    const key = MODE === "despues" ? "laura" : who;
    if (pages[key]) return pages[key];
    const page = await as(key, vp);
    await go(page, "/dashboard");
    if (MODE === "despues") {
      const btn = page.getByRole("button", { name: "Abrir modo demostración" });
      if (await btn.isVisible()) await btn.click();
      else {
        // En el celular el botón está en el menú lateral: mismo efecto que tocarlo.
        await page.evaluate(() => localStorage.setItem("blerp-demo:activa", "1"));
        await page.reload();
      }
      await page.waitForTimeout(1500);
    }
    pages[key] = page;
    return page;
  };
  for (const [name, mode, who, path] of screens) {
    const page = await pageFor(who);
    if (MODE === "despues" || who === "laura") await ui(page, mode, mode === "operario" ? "op-juan" : null);
    await go(page, path);
    if (name.includes("cotizador") && MODE === "despues") await page.getByRole("button", { name: "Cargar condiciones de cobro" }).click().catch(() => errors.push("sin botón de condiciones"));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}${name}-${vpName}.png`, fullPage: true });
  }
}
console.log(errors.length ? errors.join("\n") : "sin errores de consola");
await browser.close();
