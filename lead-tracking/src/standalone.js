/* Standalone runtime for the GitHub Pages build.
   Stands in for the claude.ai viewer runtime (window.claude.use) with the same small surface the app uses:
   db      -> documents kept in this browser's localStorage
   user    -> a random id for this browser
   downloads -> a file saved through a download link
   mcp     -> the four Apify calls the app makes, sent straight to the Apify REST API with the viewer's own token
   The token and every record stay in this browser; nothing is sent anywhere except api.apify.com. */
(() => {
  'use strict';
  const P = 'ltpl:';
  const ls = {
    get(k) { try { return localStorage.getItem(P + k); } catch (e) { return null; } },
    set(k, v) { localStorage.setItem(P + k, v); },
    del(k) { try { localStorage.removeItem(P + k); } catch (e) { /* nothing to remove */ } },
    keys(prefix) { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(P + prefix)) out.push(k.slice(P.length)); } } catch (e) { /* storage blocked */ } return out; },
  };
  const clone = x => JSON.parse(JSON.stringify(x));
  const err = (code, message) => Object.assign(new Error(message || code), { code });

  /* ---- db ---- */
  const subs = new Set();
  let auto = 0;
  const notify = col => { for (const s of subs) if (s.col === col) setTimeout(s.fire, 0); };
  const meta = { fromCache: false, hasPendingWrites: false };
  const readDoc = path => { const v = ls.get('db:' + path); if (v == null) return null; try { return JSON.parse(v); } catch (e) { return null; } };
  function colDocs(col) {
    const out = [];
    for (const k of ls.keys('db:' + col + '/')) {
      const path = k.slice(3), id = path.slice(col.length + 1);
      if (id.includes('/')) continue;
      const d = readDoc(path);
      if (d) out.push({ id, exists: true, data: () => d, metadata: meta });
    }
    return out.sort((a, b) => a.id < b.id ? -1 : 1);
  }
  function write(path, data) {
    try { ls.set('db:' + path, JSON.stringify(data)); }
    catch (e) { throw err('quota_exceeded', 'พื้นที่เก็บข้อมูลของเบราว์เซอร์เต็ม'); }
  }
  function docRef(path) {
    const i = path.lastIndexOf('/'), col = path.slice(0, i), id = path.slice(i + 1);
    return { id, path,
      async get() { const d = readDoc(path); return { id, exists: !!d, data: () => d, metadata: meta }; },
      async set(d) { write(path, clone(d)); notify(col); },
      async update(d) { const cur = readDoc(path); if (!cur) throw err('not_found'); write(path, Object.assign(cur, clone(d))); notify(col); },
      async delete() { ls.del('db:' + path); notify(col); },
    };
  }
  function colRef(col) {
    let lim = 1000;
    const snap = () => { const docs = colDocs(col).slice(0, lim); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta }; };
    const q = { path: col, limit(n) { lim = n; return q; }, where() { return q; }, orderBy() { return q; },
      async get() { return snap(); },
      onSnapshot(next) { const s = { col, fire: () => next(snap()) }; subs.add(s); setTimeout(s.fire, 0); return () => subs.delete(s); },
      doc(id) { return docRef(col + '/' + (id || ('a' + Date.now().toString(36) + (++auto) + Math.random().toString(36).slice(2, 6)))); },
      async add(d) { const r = q.doc(); await r.set(d); return r; } };
    return q;
  }
  const db = { doc: docRef, collection: colRef };
  /* another tab of this page wrote something: refresh what is on screen */
  window.addEventListener('storage', e => {
    if (!e.key || !e.key.startsWith(P + 'db:')) return;
    const path = e.key.slice(P.length + 3);
    notify(path.slice(0, path.lastIndexOf('/')));
  });

  /* ---- user ---- */
  let uid = ls.get('uid');
  if (!uid) { uid = 'u_local' + Math.random().toString(36).slice(2, 12); try { ls.set('uid', uid); } catch (e) { /* stays for this visit */ } }
  const user = { id: async () => uid, can: async () => true };

  /* ---- downloads ---- */
  const downloads = {
    async save(req) {
      const blob = new Blob([req.data], { type: /\.json$/.test(req.filename) ? 'application/json' : 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = req.filename;
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      return { status: 'saved' };
    },
  };

  /* ---- Apify over REST ---- */
  const API = 'https://api.apify.com/v2';
  const token = () => ls.get('apify-token') || '';
  async function api(method, path, body) {
    const t = token();
    if (!t) throw err('server_not_connected', 'no token');
    let res;
    try {
      res = await fetch(API + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + t }, body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) { throw err('network', 'network'); }
    let j = null;
    try { j = await res.json(); } catch (e) { /* empty body */ }
    if (res.status === 401) throw err('needs_reauth', 'token rejected');
    if (res.status === 429) throw Object.assign(err('rate_limited', 'rate limited'), { retryable: true, retryAfterMs: 2000 });
    if (!res.ok) throw err('tool_error', (j && j.error && j.error.message) || ('HTTP ' + res.status));
    return j;
  }
  const actorPath = a => encodeURIComponent(String(a).replace('/', '~'));
  const runOut = d => ({ runId: d.id, status: d.status, statusMessage: d.statusMessage || '',
    storages: { datasets: { default: { id: d.defaultDatasetId } } } });
  const mcp = {
    async listTools(server) {
      return { servers: token() ? [{ server: 'Apify', authStatus: 'unknown', tools: [{ name: 'call-actor' }, { name: 'get-actor-run' }, { name: 'get-dataset-items' }, { name: 'abort-actor-run' }] }] : [] };
    },
    async callTool(server, tool, input) {
      if (server !== 'Apify') throw err('not_in_manifest');
      if (tool === 'call-actor') {
        const cap = input.callOptions && input.callOptions.maxTotalChargeUsd;
        const j = await api('POST', '/acts/' + actorPath(input.actor) + '/runs' + (cap ? '?maxTotalChargeUsd=' + encodeURIComponent(cap) : ''), input.input || {});
        return { payload: runOut(j.data) };
      }
      if (tool === 'get-actor-run') {
        const j = await api('GET', '/actor-runs/' + encodeURIComponent(input.runId) + '?waitForFinish=' + Math.min(60, input.waitSecs || 0));
        const out = runOut(j.data);
        try {
          const ds = await api('GET', '/datasets/' + encodeURIComponent(j.data.defaultDatasetId));
          out.storages.datasets.default.itemCount = ds.data.itemCount;
        } catch (e) { /* the count is only a progress hint */ }
        return { payload: out };
      }
      if (tool === 'get-dataset-items') {
        const qs = new URLSearchParams({ clean: input.clean ? '1' : '0', limit: String(input.limit || 20), offset: String(input.offset || 0), format: 'json' });
        if (input.fields) qs.set('fields', input.fields);
        const items = await api('GET', '/datasets/' + encodeURIComponent(input.datasetId) + '/items?' + qs);
        return { payload: { items: Array.isArray(items) ? items : [] } };
      }
      if (tool === 'abort-actor-run') {
        const j = await api('POST', '/actor-runs/' + encodeURIComponent(input.runId) + '/abort');
        return { payload: { status: j && j.data && j.data.status } };
      }
      throw err('not_in_manifest');
    },
  };

  /* ---- what the app's settings page uses ---- */
  window.__ltpl = {
    hasToken: () => !!token(),
    setToken(t) { if (t) ls.set('apify-token', t); else ls.del('apify-token'); },
    async limits() { const j = await api('GET', '/users/me/limits'); return j.data; },
    leads() { const v = ls.get('leads'); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } },
    setLeads(obj) { try { ls.set('leads', JSON.stringify(obj)); } catch (e) { throw err('quota_exceeded', 'ไฟล์ใหญ่เกินพื้นที่ของเบราว์เซอร์'); } },
    backup() {
      const out = { type: 'ltpl-backup', v: 1, at: new Date().toISOString(), leads: window.__ltpl.leads(), db: {} };
      for (const k of ls.keys('db:')) { const d = readDoc(k.slice(3)); if (d) out.db[k.slice(3)] = d; }
      return out;
    },
    restore(b) {
      if (!b || b.type !== 'ltpl-backup' || typeof b.db !== 'object') throw err('bad_file');
      for (const k of ls.keys('db:')) ls.del(k);
      for (const p in b.db) write(p, b.db[p]);
      if (b.leads) window.__ltpl.setLeads(b.leads); else ls.del('leads');
    },
    wipe() { for (const k of ls.keys('')) if (k !== 'uid') ls.del(k); },
  };
  const caps = { db, user, downloads, mcp };
  window.__STANDALONE = true;
  window.claude = { use: name => Promise.resolve(name in caps ? caps[name] : null) };
})();
