// Read-only clock diagnosis: no fixture dates or business expectations are changed.
import { expect,it } from "vitest";
import { createDb } from "./harness";
it("documenta fecha UTC del fixture y fecha argentina usada por las validaciones",async () => {
  const db = await createDb();
  try {
    const result = await db.query<{ utc_day:string;ar_day:string;db_now:string }>("select (clock_timestamp() at time zone 'UTC')::date::text as utc_day, private.today_ar()::text as ar_day, clock_timestamp()::text as db_now");
    const row = result.rows[0];
    console.info("AUDITORIA_RELOJ",JSON.stringify({ node_utc:new Date().toISOString(),...row }));
    expect(row.ar_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  } finally { await db.close(); }
},120000);
