// QA local: "Supabase" mínimo sobre PGlite con todas las migraciones del repo, RLS y funciones reales.
import http from "node:http";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { buildSeed } from "@/lib/seed-data";
import { workspacePayload } from "@/lib/supabase/workspace";
import { asUser, createDb, signUp } from "../tests/db/harness";

const db = await createDb();
const laura = await signUp(db, "laura@demo.com", "Laura Gómez");
const org = (await db.query<{ organization_id: string }>("select organization_id from organization_members where user_id = $1", [laura])).rows[0].organization_id;
await db.query("update organizations set is_demo = true, demo_seeded = true, name = 'Madera Sur (demo)' where id = $1", [org]);
const s = buildSeed(new Date());
const payload = workspacePayload(org, { projects: s.projects, operators: s.operators, stock: s.stock, requests: [], assignments: s.assignments, orders: s.orders, settings: { ...DEFAULT_SETTINGS }, resolvedAlertIds: [], dayExceptions: s.dayExceptions });
await asUser(db, laura, (tx) => tx.query("select reset_workspace($1::jsonb)", [JSON.stringify(payload)]));
const inv = (p: Record<string, unknown>) => asUser(db, laura, (tx) => tx.query("select admin_invite_member($1::jsonb)", [JSON.stringify(p)]));
await inv({ email: "carla@demo.com", display_name: "Carla Sosa", role: "jefe_planta" });
await inv({ email: "martin@demo.com", display_name: "Martín Ruiz", role: "compras" });
await inv({ email: "juan@demo.com", display_name: "Juan Pérez", role: "operator", operator_id: "op-juan" });
const users: Record<string, string> = {
  laura,
  carla: await signUp(db, "carla@demo.com", "Carla Sosa"),
  martin: await signUp(db, "martin@demo.com", "Martín Ruiz"),
  juan: await signUp(db, "juan@demo.com", "Juan Pérez"),
};
console.log(JSON.stringify(users));
const ident = (x: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(x)) throw new Error(`identificador inválido: ${x}`); return `"${x}"`; };
const send = (res: http.ServerResponse, code: number, body?: unknown) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const userOf = (req: http.IncomingMessage) => {
  try { return JSON.parse(Buffer.from((req.headers.authorization ?? "").replace(/^Bearer /, "").split(".")[1], "base64url").toString()).sub as string; } catch { return ""; }
};
function where(url: URL, params: unknown[], alias = "") {
  const out: string[] = [];
  for (const [k, v] of url.searchParams) {
    if (["select", "order", "limit", "on_conflict", "columns"].includes(k)) continue;
    const [op, ...rest] = v.split("."); const val = rest.join(".");
    const col = `${alias}${ident(k)}`;
    if (op === "eq") { params.push(val); out.push(`${col}::text = $${params.length}`); }
    else if (op === "neq") { params.push(val); out.push(`${col}::text <> $${params.length}`); }
    else if (op === "is" && val === "null") out.push(`${col} is null`);
    else if (op === "in") { params.push(val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""))); out.push(`${col}::text = any($${params.length}::text[])`); }
    else throw new Error(`filtro no soportado ${k}=${v}`);
  }
  return out.length ? `where ${out.join(" and ")}` : "";
}
const orderBy = (url: URL) => { const o = url.searchParams.get("order"); return o ? "order by " + o.split(",").map((x) => { const [c, d] = x.split("."); return `${ident(c)} ${d === "desc" ? "desc" : "asc"}`; }).join(", ") : ""; };
http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      if (req.method === "OPTIONS") return send(res, 204);
      const url = new URL(req.url ?? "/", "http://x"); const uid = userOf(req);
      if (url.pathname === "/auth/v1/user") {
        const u = (await db.query<{ id: string; email: string; raw_user_meta_data: Record<string, unknown> }>("select * from auth.users where id = $1", [uid])).rows[0];
        return u ? send(res, 200, { id: u.id, email: u.email, aud: "authenticated", role: "authenticated", user_metadata: u.raw_user_meta_data, app_metadata: {} }) : send(res, 401, { message: "no" });
      }
      if (url.pathname.startsWith("/auth/v1/")) return send(res, 200, {});
      const m = url.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z_]+)$/); if (!m) return send(res, 404, { message: "no" });
      const [, rpc, name] = m; const single = (req.headers.accept ?? "").includes("vnd.pgrst.object"); const data = body ? JSON.parse(body) : {};
      const result = await asUser(db, uid, async (tx) => {
        if (rpc) {
          const args = Object.entries(data as Record<string, unknown>);
          const params = args.map(([, v]) => (typeof v === "object" ? JSON.stringify(v) : v));
          const list = args.map(([k, v], i) => `${ident(k)} => $${i + 1}${typeof v === "object" ? "::jsonb" : typeof v === "number" ? "::numeric" : typeof v === "boolean" ? "::boolean" : "::text"}`);
          return (await tx.query<{ r: unknown }>(`select to_jsonb(public.${ident(name)}(${list.join(", ")})) as r`, params)).rows[0]?.r ?? null;
        }
        const params: unknown[] = [];
        if (req.method === "GET") {
          if (name === "organization_members") {
            const r = await tx.query(`select m.*, to_jsonb(o) as organizations from organization_members m join organizations o on o.id = m.organization_id ${where(url, params, "m.")} order by m.created_at`, params);
            return single ? (r.rows[0] ?? null) : r.rows;
          }
          const lim = url.searchParams.get("limit");
          const r = await tx.query(`select * from public.${ident(name)} ${where(url, params)} ${orderBy(url)} ${lim ? `limit ${Number(lim)}` : ""}`, params);
          return single ? (r.rows[0] ?? null) : r.rows;
        }
        if (req.method === "POST") {
          const rows = Array.isArray(data) ? data : [data]; if (!rows.length) return [];
          const cols = [...new Set(rows.flatMap((x) => Object.keys(x)))].map(ident); const conflict = url.searchParams.get("on_conflict");
          await tx.query(`insert into public.${ident(name)} (${cols.join(", ")}) select ${cols.join(", ")} from jsonb_populate_recordset(null::public.${ident(name)}, $1::jsonb)` + (conflict ? ` on conflict (${conflict.split(",").map(ident).join(", ")}) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}` : ""), [JSON.stringify(rows)]);
          return [];
        }
        if (req.method === "PATCH") {
          params.push(JSON.stringify(data));
          await tx.query(`update public.${ident(name)} t set ${Object.keys(data).map((c) => `${ident(c)} = r.${ident(c)}`).join(", ")} from jsonb_populate_record(null::public.${ident(name)}, $1::jsonb) r ${where(url, params, "t.")}`, params);
          return [];
        }
        if (req.method === "DELETE") { await tx.query(`delete from public.${ident(name)} ${where(url, params)}`, params); return []; }
        throw new Error("método no soportado");
      });
      return send(res, req.method === "POST" && !rpc ? 201 : 200, result);
    } catch (e) { const err = e as { message?: string; code?: string }; console.error("ERR", req.method, req.url, err.message); return send(res, 400, { message: err.message, code: err.code }); }
  });
}).listen(54321, () => console.log("pg-supabase en :54321"));
setInterval(() => {}, 1 << 30);
