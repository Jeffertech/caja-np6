// Cloudflare Pages Function: shared orders for Caja NP6 (production screen).
// Bound D1 database: env.DB (Pages project → Settings → Bindings → D1 database, variable name "DB").
// The whole site, /api included, sits behind Cloudflare Access, so only the owner's email reaches this.

const MAX_BODY = 64 * 1024;
const ID_RE = /^[a-z0-9]{6,40}$/;
const NUM_RE = /^\d{1,8}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
let ready = false;

async function ensure(db) {
  if (ready) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, status TEXT NOT NULL DEFAULT \'new\', ready_ts INTEGER, data TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS orders_ts ON orders (ts)'),
    db.prepare('CREATE TABLE IF NOT EXISTS managers (num TEXT PRIMARY KEY, data TEXT NOT NULL)')
  ]);
  ready = true;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error('too_large');
  const body = text ? JSON.parse(text) : {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('bad_body');
  return body;
}

export async function onRequest({ request, env, params }) {
  const db = env.DB;
  if (!db) return json({ error: 'La base de datos no está conectada (binding DB).' }, 500);
  try {
    await ensure(db);
    const url = new URL(request.url);
    const [resource, id] = params.path || [];
    const method = request.method;
    const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
    if (resource === 'managers') {
      // Managers: number, name and a SHA-256 hash of the password (never the password itself).
      if (id !== undefined && !NUM_RE.test(id)) return json({ error: 'número inválido' }, 400);
      if (method === 'GET' && !id) {
        const { results } = await db.prepare('SELECT data FROM managers ORDER BY CAST(num AS INTEGER)').all();
        return json(results.map(r => JSON.parse(r.data)));
      }
      if (method === 'PUT' && id) {
        const b = await readBody(request);
        if (!HASH_RE.test(String(b.hash || ''))) return json({ error: 'datos inválidos' }, 400);
        const m = { num: id, name: String(b.name || '').slice(0, 30), hash: b.hash, owner: !!b.owner };
        await db.prepare('INSERT INTO managers (num, data) VALUES (?, ?) ON CONFLICT(num) DO UPDATE SET data = excluded.data').bind(id, JSON.stringify(m)).run();
        return json({ ok: true });
      }
      if (method === 'DELETE' && id) {
        await db.prepare('DELETE FROM managers WHERE num = ?').bind(id).run();
        return json({ ok: true });
      }
      return json({ error: 'no encontrado' }, 404);
    }
    if (id !== undefined && !ID_RE.test(id)) return json({ error: 'id inválido' }, 400);

    if (resource === 'orders') {
      if (method === 'GET') {
        const { results } = await db.prepare('SELECT status, ready_ts, data FROM orders WHERE ts >= ? ORDER BY ts DESC LIMIT 800').bind(since).all();
        return json(results.map(r => ({ ...JSON.parse(r.data), status: r.status, ready_ts: r.ready_ts })));
      }
      if (method === 'PUT' && id) {
        const body = await readBody(request);
        body.id = id;
        await db.prepare('INSERT INTO orders (id, ts, status, data) VALUES (?, ?, \'new\', ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, ts = excluded.ts')
          .bind(id, Number(body.ts) || Date.now(), JSON.stringify(body)).run();
        return json({ ok: true });
      }
      if (method === 'PATCH' && id) {
        const body = await readBody(request);
        const row = await db.prepare('SELECT status, ready_ts, data FROM orders WHERE id = ?').bind(id).first();
        if (!row) return json({ error: 'no existe' }, 404);
        const data = JSON.parse(row.data);
        let status = row.status, readyTs = row.ready_ts;
        if ('status' in body) { status = body.status === 'ready' ? 'ready' : 'new'; readyTs = status === 'ready' ? Date.now() : null; }
        for (const k of ['entered', 'voided']) if (k in body) data[k] = !!body[k];
        await db.prepare('UPDATE orders SET status = ?, ready_ts = ?, data = ? WHERE id = ?').bind(status, readyTs, JSON.stringify(data), id).run();
        return json({ ok: true });
      }
      if (method === 'DELETE' && !id) {
        await db.prepare('DELETE FROM orders').run();
        return json({ ok: true });
      }
    }

    return json({ error: 'no encontrado' }, 404);
  } catch (e) {
    const msg = String(e && e.message || e);
    return json({ error: msg === 'too_large' ? 'demasiado grande' : msg === 'bad_body' ? 'datos inválidos' : 'error del servidor' }, msg === 'too_large' || msg === 'bad_body' ? 400 : 500);
  }
}
