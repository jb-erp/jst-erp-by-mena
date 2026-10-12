/* ===================== state ===================== */
const S = {
  base: [],                 // leads from leads.json
  leads: [],                // base + leads added from searches and by hand
  byId: new Map(),
  view: [],                 // the filtered, sorted list on screen
  loaded: false,
  loadError: '',
  batchDocs: [],            // documents of added leads
  jobs: [],                 // search jobs kept in the store
  localJobs: Object.create(null),
  sugg: Object.create(null),      // lead id -> { platform: [candidate, ...] } waiting for review
  searched: Object.create(null),  // lead id -> { platform: true } already covered by an automatic search
  chq: Object.create(null),       // lead id -> edited search text (this visit only)
  ui: { tab: 'queue', listTab: 'queue', q: '', area: '', group: '', grade: '', chan: '', status: '', sort: 'score', sel: null, selIdx: 0, shown: 150, reselect: false },
  db: null, dbState: 'connecting', user: null, uid: null, canWrite: null, revoked: false,
  dl: null, mcp: null, mcpState: 'pending', perms: null,
  saving: 0, lastSaved: 0, saveError: '', trackOverflow: false,
  jobUi: null, jobProg: null, polling: null,
  cfg: { maxRun: 0, confirm: false }, pendingSpec: null, usage: null, usageFull: false,
};

/* ===================== contact tracking: one document per lead =====================
   Documents live in four collections, track0..track3, picked by a hash of the lead id, so no single
   subscription has to carry more than 1,000 documents. A document:
   { id, status, note, followUp, ch: {facebook, shopee, ...}, dismissed: [url], log: [{t, s}], updatedAt, by } */
const NB = 4;
const server = Object.create(null);    // lead id -> last document seen in the store
const pending = Object.create(null);   // lead id -> changes not yet sent
const flight = Object.create(null);    // lead id -> changes being written right now
const fetched = Object.create(null);   // lead id -> true once its document was read directly
const flushing = Object.create(null);
const snapDocs = Array.from({ length: NB }, () => Object.create(null));
const bucketReady = new Array(NB).fill(false);

function hashId(id) { let x = 0; for (let i = 0; i < id.length; i++) x = (x * 31 + id.charCodeAt(i)) >>> 0; return x; }
const bucketOf = id => hashId(id) % NB;
function docId(id) {                   // store ids allow letters, digits and _ - . ~ : @ +
  if (/^[A-Za-z0-9_\-~:@+][A-Za-z0-9_\-.~:@+]{0,180}$/.test(id)) return id;
  return 'x' + Array.from(new TextEncoder().encode(id)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 180);
}
const trackRef = id => S.db.collection('track' + bucketOf(id)).doc(docId(id));
const canEdit = () => !!S.db && S.canWrite !== false && !S.revoked;
const isKnown = id => !S.db || bucketReady[bucketOf(id)] || !!fetched[id];

function applyPatch(m, p) {
  for (const k in p.set) m[k] = p.set[k];
  if (p.ch) {
    m.ch = Object.assign({}, m.ch);
    for (const k in p.ch) { if (p.ch[k]) m.ch[k] = p.ch[k]; else delete m.ch[k]; }
  }
  if (p.dis.length) m.dismissed = (m.dismissed || []).concat(p.dis).slice(-40);
  if (p.log.length) m.log = (m.log || []).concat(p.log).slice(-12);
}
/* the document as the page should show it: store copy, plus what is on its way, plus what is waiting */
function trackOf(id) {
  const s = server[id], f = flight[id], p = pending[id];
  if (!f && !p) return s || null;
  const m = s ? Object.assign({}, s) : {};
  if (f) applyPatch(m, f);
  if (p) applyPatch(m, p);
  return m;
}
const statusOf = id => { const t = trackOf(id); return (t && STATUS_BY[t.status]) ? t.status : 'new'; };
function mergePatch(a, b) {            // b is newer than a
  if (!a) return b || null;
  if (!b) return a;
  return { set: Object.assign({}, a.set, b.set), ch: (a.ch || b.ch) ? Object.assign({}, a.ch, b.ch) : null, dis: a.dis.concat(b.dis), log: a.log.concat(b.log) };
}
function tidy(d) {
  const o = { id: d.id, status: STATUS_BY[d.status] ? d.status : 'new' };
  if (d.note) o.note = String(d.note).slice(0, 4000);
  if (d.followUp) o.followUp = String(d.followUp).slice(0, 10);
  if (d.ch) {
    const c = {};
    for (const p of PLATS) if (d.ch[p.k]) c[p.k] = String(d.ch[p.k]).slice(0, 500);
    if (Object.keys(c).length) o.ch = c;
  }
  if (d.dismissed && d.dismissed.length) o.dismissed = d.dismissed.slice(-40);
  if (d.log && d.log.length) o.log = d.log.slice(-12);
  o.updatedAt = d.updatedAt;
  if (d.by) o.by = d.by;
  return o;
}

/* change: { set?: {status, note, followUp}, ch?: {platform: value or ''}, dis?: [url], log?: [{t, s}] } */
function patch(id, change, now) {
  if (!canEdit()) return;
  const p = pending[id] || (pending[id] = { set: {}, ch: null, dis: [], log: [] });
  if (change.set) Object.assign(p.set, change.set);
  if (change.ch) p.ch = Object.assign({}, p.ch, change.ch);
  if (change.dis) p.dis.push(...change.dis);
  if (change.log) p.log.push(...change.log);
  scheduleRender();
  if (now === false) return;
  flush(id);
}
async function writeOnce(fn) {
  try { return await fn(); }
  catch (e) {
    if (e && e.code === 'unavailable') { await sleep(500 + Math.random() * 900); return await fn(); }
    throw e;
  }
}
async function flush(id) {
  if (flushing[id] || !pending[id] || !S.db) return;
  flushing[id] = true;
  S.saving++;
  renderSync();
  try {
    while (pending[id]) {
      if (!isKnown(id)) {                 // never overwrite a document this page has not seen yet
        const snap = await writeOnce(() => trackRef(id).get());
        if (snap.exists) server[id] = snap.data(); else delete server[id];
        fetched[id] = true;
      }
      const f = flight[id] = pending[id];
      delete pending[id];
      const doc = server[id] ? Object.assign({}, server[id]) : {};
      applyPatch(doc, f);
      const data = tidy(Object.assign(doc, { id, updatedAt: new Date().toISOString(), by: S.uid || null }));
      try { await writeOnce(() => trackRef(id).set(data)); }
      catch (e) { delete flight[id]; pending[id] = mergePatch(f, pending[id]); throw e; }
      delete flight[id];
      const live = snapDocs[bucketOf(id)][id];
      server[id] = (live && live.updatedAt && live.updatedAt > data.updatedAt) ? live : data;
      S.lastSaved = Date.now();
      S.saveError = '';
    }
  } catch (e) {
    onDbError(e, 'save');
  } finally {
    flushing[id] = false;
    S.saving--;
    renderSync();
    scheduleRender();
  }
}
function retrySaves() {
  S.saveError = '';
  renderSync();
  for (const id in pending) flush(id);
}
async function fetchOne(id) {
  if (fetched[id] || !S.db) return;
  try {
    const snap = await trackRef(id).get();
    if (!flight[id] && !flushing[id]) { if (snap.exists) server[id] = snap.data(); }
    fetched[id] = true;
  } catch (e) { /* stays unknown; the form stays locked and a later snapshot can unlock it */ }
  if (S.ui.sel === id) renderDetail(true);
}
function onDbError(e, where) {
  const code = e && e.code;
  if (code === 'revoked' || code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed') {
    S.revoked = true;
    S.saveError = 'มุมมองนี้บันทึกไม่ได้แล้ว เปิดหน้านี้ใหม่อีกครั้ง';
  } else if (code === 'invalid_argument' && where === 'save') {
    S.canWrite = false;                 // a well-formed write was refused: this viewer may only read
    S.saveError = 'คุณมีสิทธิ์ดูอย่างเดียว การแก้ไขล่าสุดไม่ถูกบันทึก';
  } else if (code === 'quota_exceeded') {
    S.saveError = 'ที่เก็บข้อมูลของแอปเต็ม ลบชุดรายชื่อที่ไม่ใช้จากประวัติการค้นหาก่อน';
  } else if (code === 'resource_exhausted') {
    S.saveError = 'บันทึกถี่เกินไป รอสักครู่แล้วกดลองบันทึกอีกครั้ง';
  } else if (where === 'save') {
    S.saveError = 'บันทึกไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วกดลองบันทึกอีกครั้ง';
  } else if (where === 'sub') {
    S.saveError = 'อ่านข้อมูลล่าสุดจากที่เก็บไม่ได้ เปิดหน้านี้ใหม่อีกครั้ง';
  }
  renderSync();
  scheduleRender();
}

function subscribeAll() {
  const db = S.db;
  for (let b = 0; b < NB; b++) {
    db.collection('track' + b).limit(1000).onSnapshot(snap => {
      const m = Object.create(null);
      for (const d of snap.docs) { const data = d.data(); if (data) m[data.id || d.id] = data; }
      for (const id in snapDocs[b]) if (!(id in m) && !flight[id]) delete server[id];
      for (const id in m) if (!flight[id]) server[id] = m[id];
      snapDocs[b] = m;
      if (!(snap.metadata && snap.metadata.fromCache)) bucketReady[b] = true;
      if (snap.size >= 1000) S.trackOverflow = true;
      scheduleRender();
    }, e => onDbError(e, 'sub'));
  }
  db.collection('batches').limit(1000).onSnapshot(snap => {
    S.batchDocs = snap.docs.map(d => Object.assign({ _id: d.id }, d.data()));
    rebuildLeads();
    renderAll();
  }, e => onDbError(e, 'sub'));
  db.collection('settings').limit(20).onSnapshot(snap => {
    const d = snap.docs.find(x => x.id === 'apify');
    if (d) applyCfg(d.data());
    const u = snap.docs.find(x => x.id === 'usage');
    if (u) applyUsage(u.data());
    const pl = snap.docs.find(x => x.id === 'plan');
    if (pl) applyPlan(pl.data());
  }, e => onDbError(e, 'sub'));
  db.collection('jobs').limit(200).onSnapshot(snap => {
    S.jobs = snap.docs.map(d => Object.assign({}, d.data(), { id: d.id }));
    for (const j of S.jobs) delete S.localJobs[j.id];
    renderFind();
  }, e => onDbError(e, 'sub'));
  /* one document per saved slice of an automatic channel search:
     { kind, job, createdAt, by, rows: [{ id, done: [platform], c: { platform: [{u, t, y, m}] } }] } */
  db.collection('chansets').limit(1000).onSnapshot(snap => {
    const sugg = Object.create(null), searched = Object.create(null);
    for (const d of snap.docs) {
      const data = d.data() || {};
      for (const row of Array.isArray(data.rows) ? data.rows : []) {
        if (!row || !row.id) continue;
        const id = String(row.id);
        const mark = searched[id] || (searched[id] = {});
        for (const k of Array.isArray(row.done) ? row.done : []) mark[k] = true;
        const c = row.c || {};
        for (const k in c) {
          if (!PLAT[k] || !Array.isArray(c[k])) continue;
          const o = sugg[id] || (sugg[id] = {});
          const list = o[k] || (o[k] = []);
          for (const cand of c[k]) {
            const u = safeUrl(cand && cand.u);
            if (u && !list.some(z => z.u === u)) list.push({ u, t: String(cand.t || '').slice(0, 120), y: String(cand.y || 'link'), m: cand.m ? 1 : 0 });
          }
        }
      }
    }
    S.sugg = sugg;
    S.searched = searched;
    scheduleRender();
  }, e => onDbError(e, 'sub'));
}

/* ---- leads: the file, plus every batch added later ---- */
function rebuildLeads() {
  const leads = S.base.slice();
  const byId = new Map();
  for (const L of leads) byId.set(L.id, L);
  const docs = S.batchDocs.slice().sort((a, b) => String(a.createdAt || '') < String(b.createdAt || '') ? -1 : 1);
  for (const d of docs) {
    if (!Array.isArray(d.leads)) continue;
    for (const raw of d.leads) {
      if (!raw || !raw.i || !raw.n || byId.has(String(raw.i))) continue;
      let L;
      try { L = makeLead(raw, d.src === 'manual' ? 'manual' : d.src === 'web' ? 'web' : 'gmaps', { batch: d._id, at: d.createdAt || '' }); } catch (e) { continue; }
      byId.set(L.id, L);
      leads.push(L);
    }
  }
  S.leads = leads;
  S.byId = byId;
}

/* ---- effective channels and pending suggestions ---- */
function chanOf(L) {
  const t = trackOf(L.id);
  const saved = (t && t.ch) || null;
  const out = {};
  for (const p of PLATS) {
    const v = (saved && saved[p.k]) || L.ch0[p.k];
    if (v) out[p.k] = v;
  }
  return out;
}
function suggOf(L) {
  const all = S.sugg[L.id];
  if (!all) return null;
  const t = trackOf(L.id);
  const dis = (t && t.dismissed) || [];
  const have = chanOf(L);
  let out = null;
  for (const k in all) {
    if (have[k]) continue;
    const list = all[k].filter(c => dis.indexOf(c.u) < 0);
    if (list.length) (out || (out = {}))[k] = list;
  }
  return out;
}
function suggCount(L) {
  const s = suggOf(L);
  let n = 0;
  if (s) for (const k in s) n += s[k].length;
  return n;
}
const contactable = (L, c) => !!(L.phone || L.webUrl || Object.keys(c || chanOf(L)).length);
const inQueue = (L, st) => L.target && st === 'new' && !L.closed && contactable(L);
