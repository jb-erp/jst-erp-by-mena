/* ===================== find more leads: Google Maps and channel searches through the viewer's Apify connector ===================== */
const APIFY = 'Apify';
const ACTOR_MAPS = 'compass/crawler-google-places';
const ACTOR_SERP = 'apify/google-search-scraper';
const PRICE_PLACE = 0.004;      // USD per place, Apify Free tier, checked 11 Oct 2026
const PRICE_SERP = 0.0045;      // USD per Google results page, Apify Free tier, checked 11 Oct 2026
const PRICE_NOTE = 'ราคาแพ็กเกจ Free ของ Apify ณ 11 ต.ค. 2026 แพ็กเกจเสียเงินถูกกว่านี้';
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT', 'TIMED_OUT']);
const MAPS_FIELDS = 'title,categoryName,address,city,state,phone,website,totalScore,reviewsCount,permanentlyClosed,temporarilyClosed,placeId,searchString,openingHours';
const SUGGEST_Q = ['คลังสินค้าให้เช่า', 'ห้องเย็น', 'ศูนย์กระจายสินค้า', 'fulfillment', 'บริษัทขนส่งสินค้า', 'โกดังสินค้า', 'โรงงานผลิตเครื่องสำอาง', 'โรงงานผลิตอาหารเสริม'];
const MAX_PLACES = 1000;
const KIND_TAB = { gmaps: 'find', brand: 'brand', chan: 'chan' };
const normQ = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/* ---- talking to the connector ---- */
function firstJson(t) {
  t = String(t || '').trim();
  try { const v = JSON.parse(t); if (v && typeof v === 'object') return v; } catch (e) { /* not pure JSON: look for an object inside */ }
  const i = t.indexOf('{');
  if (i < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let k = i; k < t.length; k++) {
    const c = t[k];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; }
    else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { try { return JSON.parse(t.slice(i, k + 1)); } catch (e) { return null; } }
  }
  return null;
}
function payloadOf(r) {
  const p = r ? r.payload : null;
  if (p && typeof p === 'object') return p;
  const texts = [];
  if (typeof p === 'string') texts.push(p);
  if (r && Array.isArray(r.content)) for (const b of r.content) if (b && b.type === 'text' && typeof b.text === 'string') texts.push(b.text);
  for (const t of texts) { const j = firstJson(t); if (j) return j; }
  return {};
}
/* Reads may be retried once when the platform says so; a call that starts a run never is. */
async function callApify(tool, input, isRead) {
  const once = () => S.mcp.callTool(APIFY, tool, input, { cache: false }).then(payloadOf);
  try { return await once(); }
  catch (e) {
    if (isRead && e && e.retryable === true) {
      await sleep(e.retryAfterMs > 0 ? Math.min(e.retryAfterMs, 60000) : 900 + Math.random() * 900);
      return await once();
    }
    throw e;
  }
}
function explain(e, phase) {
  const code = e && e.code;
  const raw = e && e.message ? String(e.message).slice(0, 280) : '';
  switch (code) {
    case 'needs_reauth':
      return { msg: 'การเชื่อมต่อ Apify หมดอายุ เชื่อมต่อใหม่ที่ Settings → Connectors ใน claude.ai แล้วกดอีกครั้ง' };
    case 'server_not_connected': case 'selection_required': case 'server_not_found':
      return { msg: 'บัญชี Claude นี้ยังไม่ได้เชื่อมต่อ Apify หรือยังไม่ได้เลือกบัญชีที่จะใช้ ตั้งค่าได้ที่ Settings → Connectors ใน claude.ai' };
    case 'not_in_manifest': case 'consent_required':
      return { msg: 'หน้านี้ยังไม่ได้รับอนุญาตให้ใช้ Apify เปิดสิทธิ์ได้จากเมนู Permissions ของหน้านี้', manage: true };
    case 'approval_required':
      return { msg: 'คำสั่งนี้ต้องให้คุณกดอนุญาตก่อน และยังไม่ได้รับอนุญาต จึงยังไม่ได้ทำและไม่มีค่าใช้จ่าย กดอีกครั้งแล้วกดอนุญาตเมื่อ Claude ถาม' };
    case 'blocked_by_policy':
      return { msg: 'องค์กรของคุณไม่อนุญาตให้หน้านี้สั่ง Apify ติดต่อผู้ดูแลระบบขององค์กร' };
    case 'tool_error':
      return { msg: 'Apify แจ้งว่า: ' + (raw || 'ทำรายการไม่สำเร็จ'),
        hint: /usage|limit|billing|credit|subscription|plan/i.test(raw) ? 'น่าจะเป็นเพราะเครดิต Apify ของรอบบิลนี้หมด ตรวจได้ที่หน้า Billing ใน Apify Console' : '' };
    case 'rate_limited':
      return { msg: 'สั่ง Apify ถี่เกินไป รอสักครู่แล้วกดอีกครั้ง' };
    case 'cancelled':
      return { msg: 'ยกเลิกคำสั่งแล้ว' };
    case 'not_granted': case 'capability_disabled': case 'capability_removed':
      return { msg: 'มุมมองนี้สั่ง Apify ไม่ได้ ใช้ช่อง "ให้ Claude ค้นแทน" ในเมนู ค้นจาก Google Maps ได้' };
    case 'bad_request': case 'transform_error':
      return { msg: 'คำสั่งที่แอปส่งไป Apify ไม่ถูกต้อง แจ้ง Claude ให้ตรวจแอปนี้' + (raw ? ' (' + raw + ')' : '') };
    case 'bad_payload':
      return { msg: 'อ่านผลที่ Apify ส่งกลับมาไม่ได้ กดลองอีกครั้ง ถ้ายังไม่ได้ให้แจ้ง Claude ตรวจแอปนี้' };
    default:
      return { msg: phase === 'start'
        ? 'สั่ง Apify ไม่สำเร็จ ถ้ามีหน้าต่างถามสิทธิ์ใช้ Apify ค้างอยู่ ให้ตอบก่อนแล้วกดอีกครั้ง ถ้าไม่มี ให้ตรวจที่ Apify Console ว่ามีการรันเกิดขึ้นแล้วหรือยัง จะได้ไม่เสียค่าใช้จ่ายซ้ำ'
        : 'ติดต่อ Apify ไม่ได้ชั่วคราว กดลองอีกครั้งได้' };
  }
}
async function checkApify() {
  try {
    const r = await S.mcp.listTools(APIFY);
    const sv = r && Array.isArray(r.servers) ? r.servers.find(x => x && x.server === APIFY) : null;
    if (!sv || (Array.isArray(sv.tools) && !sv.tools.length && sv.authStatus !== 'needs_reauth')) S.mcpState = 'missing';
    else S.mcpState = sv.authStatus === 'needs_reauth' ? 'reauth' : 'ready';
  } catch (e) { S.mcpState = 'ready'; }       // listing failed: the first call will report the real reason
  renderFind(true);
  scheduleRender();
}

/* ---- jobs ---- */
const jobBusy = () => !!S.polling || !!(S.jobUi && (S.jobUi.phase === 'starting' || S.jobUi.phase === 'collecting' || S.jobUi.phase === 'saving'));
const getJob = id => S.jobs.find(j => j.id === id) || S.localJobs[id] || null;
async function saveJob(id, fields) {
  const j = getJob(id);
  if (j) Object.assign(j, fields);
  if (!S.db || /^local/.test(id)) return;
  try { await S.db.doc('jobs/' + id).update(fields); } catch (e) { /* the history line may lag; the work itself is not affected */ }
}
function showJob(ui) {
  S.jobUi = ui;
  renderFind(true);
  scheduleRender();
}

/* spec: { kind: 'gmaps' | 'chan', label, actor, input, est, cap, params } */
async function startJob(spec, confirmed) {
  if (!spec || !S.mcp || !canEdit() || jobBusy()) return;
  const offscreen = () => { if (!inFind() || $('#find-side').hidden) setTab(KIND_TAB[spec.kind]); };
  const max = S.cfg.maxRun;
  if (max > 0 && spec.cap > max + 1e-9) {
    S.jobProg = null;
    showJob({ phase: 'error', where: 'start', kind: spec.kind, error: { msg: 'การค้นหานี้อาจใช้ถึง ' + usd(spec.cap) + ' เกินเพดานต่อครั้งที่ตั้งไว้ ' + usd(max) + ' จึงยังไม่ได้เริ่มและไม่มีค่าใช้จ่าย ลดจำนวนลง หรือปรับเพดานที่เมนู ตั้งค่า Apify', settings: true } });
    offscreen();
    return;
  }
  if (S.cfg.confirm && !confirmed) {
    S.pendingSpec = spec;
    showJob({ phase: 'confirm', kind: spec.kind, label: spec.label, est: spec.est, cap: spec.cap });
    offscreen();
    return;
  }
  S.pendingSpec = null;
  S.jobProg = null;
  showJob({ phase: 'starting', label: spec.label, kind: spec.kind });
  if ($('#find-side').hidden || !inFind()) toast('เริ่มค้นหาแล้ว ดูความคืบหน้าได้ที่เมนู ' + TAB_NAME[KIND_TAB[spec.kind]]);
  else { const r = $('#card-job').getBoundingClientRect(); if (r.top < 0 || r.top > window.innerHeight * 0.45) $('#card-job').scrollIntoView({ block: 'start' }); }
  /* Ask for the connector's consent on its own, before the call that costs money, so a pending
     consent window can never leave a paid run in doubt. A "no" stops here; anything else goes on. */
  if (S.perms) {
    try {
      const got = await S.perms.request(['mcp:' + APIFY]);
      if (got && got['mcp:' + APIFY] === 'denied') {
        showJob({ phase: 'error', where: 'start', kind: spec.kind, error: { msg: 'หน้านี้ยังไม่ได้รับอนุญาตให้ใช้ Apify จึงยังไม่ได้เริ่มค้นหาและไม่มีค่าใช้จ่าย เปิดสิทธิ์ได้จากเมนู Permissions ของหน้านี้ แล้วกดค้นหาอีกครั้ง', manage: true } });
        return;
      }
    } catch (e) { /* no answer about consent: the call itself will ask */ }
  }
  let p;
  try { p = await callApify('call-actor', { actor: spec.actor, input: spec.input, callOptions: { maxTotalChargeUsd: spec.cap }, waitSecs: 0 }, false); }
  catch (e) { const er = explain(e, 'start'); if (er.hint) { S.usageFull = true; renderUsage(); } showJob({ phase: 'error', where: 'start', kind: spec.kind, error: er }); return; }
  const runId = p && p.runId;
  const ds = p && p.storages && p.storages.datasets && p.storages.datasets.default;
  if (!runId) {
    showJob({ phase: 'error', where: 'start', kind: spec.kind, error: { msg: 'Apify ไม่ได้ส่งรหัสการรันกลับมา ตรวจที่ Apify Console ว่ามีการรันเกิดขึ้นหรือไม่ก่อนกดค้นหาอีกครั้ง' } });
    return;
  }
  const job = { kind: spec.kind, label: spec.label, params: spec.params, est: spec.est, cap: spec.cap, runId: String(runId),
    datasetId: (ds && ds.id) || '', status: 'running', startedAt: new Date().toISOString(), by: S.uid || null };
  let id = 'local' + Date.now();
  try { const ref = S.db.collection('jobs').doc(); await ref.set(job); id = ref.id; }
  catch (e) { /* could not write the history line: carry on with a record kept for this visit */ }
  S.localJobs[id] = Object.assign({ id }, job);
  runJob(id);
}
async function runJob(id) {
  if (S.polling || !S.mcp) return;
  S.polling = id;
  showJob({ phase: 'running', jobId: id });
  let finished = false;
  try {
    const t0 = Date.now();
    for (;;) {
      const j = getJob(id);
      if (!j) { S.jobUi = null; return; }
      const t1 = Date.now();
      let r;
      try { r = await callApify('get-actor-run', { runId: j.runId, waitSecs: 20 }, true); }
      catch (e) { S.jobUi = { phase: 'error', where: 'poll', jobId: id, error: explain(e, 'poll') }; return; }
      const st = r && r.status;
      const ds = r && r.storages && r.storages.datasets && r.storages.datasets.default;
      S.jobProg = { status: st || '', message: String((r && r.statusMessage) || '').slice(0, 300), items: ds && typeof ds.itemCount === 'number' ? ds.itemCount : null };
      renderFind(true);
      if (!st) { S.jobUi = { phase: 'error', where: 'poll', jobId: id, error: { msg: 'อ่านสถานะการรันจาก Apify ไม่ได้ กดตรวจสถานะอีกครั้ง' } }; return; }
      if (TERMINAL.has(st)) {
        await saveJob(id, { status: 'finished', runStatus: st, message: S.jobProg.message, itemCount: S.jobProg.items || 0,
          datasetId: (ds && ds.id) || j.datasetId || '', finishedAt: new Date().toISOString() });
        finished = true;
        break;
      }
      if (Date.now() - t0 > 25 * 60e3) { S.jobUi = { phase: 'paused', jobId: id }; return; }
      const dt = Date.now() - t1;
      if (dt < 5000) await sleep(5000 - dt);      // never a tight loop, whatever the connector does with waitSecs
    }
  } finally {
    S.polling = null;
    renderFind(true);
    scheduleRender();
  }
  if (finished) collectJob(id);
}
async function fetchItems(j) {
  const serp = j.kind !== 'gmaps';
  const page = serp ? 20 : 50, max = serp ? 400 : 1000;
  const out = [];
  for (let off = 0; off < max; off += page) {
    const p = await callApify('get-dataset-items', { datasetId: j.datasetId, limit: page, offset: off, clean: true,
      fields: serp ? 'searchQuery,organicResults' : MAPS_FIELDS }, true);
    if (!p || !Array.isArray(p.items)) { if (off === 0) throw { code: 'bad_payload' }; break; }
    out.push(...p.items);
    if (p.items.length < page) break;
  }
  return out;
}
async function collectJob(id) {
  const j = getJob(id);
  if (!j || jobBusy() || !S.mcp) return;
  if (!j.datasetId) { showJob({ phase: 'error', where: 'fetch', jobId: id, error: { msg: 'ไม่พบที่เก็บผลของการรันนี้ใน Apify' } }); return; }
  showJob({ phase: 'collecting', jobId: id });
  let items;
  try { items = await fetchItems(j); }
  catch (e) { showJob({ phase: 'error', where: 'fetch', jobId: id, error: explain(e, 'fetch') }); return; }
  if (j.kind === 'gmaps') showJob({ phase: 'preview', jobId: id, preview: previewLeads(j, items) });
  else if (j.kind === 'brand') showJob({ phase: 'preview', jobId: id, preview: previewBrands(j, items) });
  else await applyChannels(j, items);
}
async function abortJob(id) {
  const j = getJob(id);
  if (!j || !S.mcp) return;
  try { await callApify('abort-actor-run', { runId: j.runId }, false); toast('สั่งหยุดแล้ว รอ Apify ยืนยันสักครู่'); }
  catch (e) { toast(explain(e, 'poll').msg, 6000); }
}
async function discardJob(id) {
  await saveJob(id, { status: 'discarded' });
  showJob(null);
}

/* ---- Google Maps results -> new leads ---- */
/* The area box takes anything. Blank means the whole country; a Thai province, in Thai or English, is sent
   in the English form Google Maps resolves best; any other text goes to Apify exactly as typed. */
function mapsLoc(text) {
  const raw = String(text == null ? $('#g-loc').value : text).replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!raw || /^(ทั้งประเทศ(ไทย)?|ทั่วประเทศ(ไทย)?|ประเทศไทย|เมืองไทย|ไทย|thailand)$/i.test(raw)) return { query: 'Thailand', label: 'ทั้งประเทศไทย', whole: true };
  const core = raw.replace(/[,\s]*(thailand|ประเทศไทย)$/i, '').replace(/^(จังหวัด|จ\.)\s*/, '').trim();
  let th = '';
  if (PROV_ZONE[core] != null) th = core;
  else if (/^(กรุงเทพ(ฯ|มหานคร)?|กทม\.?)$/.test(core)) th = 'กรุงเทพมหานคร';
  else if (/^[a-z .'-]+$/i.test(core)) th = PROV_ALIAS[squash(core.replace(/\s+province$/i, ''))] || '';
  if (th) return { query: PROV_EN[th] + ', Thailand', label: th, whole: false };
  return { query: raw, label: raw, whole: false };
}
function mapsCount() {
  const v = $('#g-n').value.trim();
  if (!/^\d{1,4}$/.test(v)) return 0;
  return +v >= 1 && +v <= MAX_PLACES ? +v : 0;
}
function mapsSpec() {
  const q = $('#g-q').value.replace(/\s+/g, ' ').trim().slice(0, 80), loc = mapsLoc(), n = mapsCount();
  if (q.length < 2 || !n) return null;
  const est = n * PRICE_PLACE, g = $('#g-group').value;
  return { kind: 'gmaps', actor: ACTOR_MAPS, est, cap: ceil2(est * 1.15 + 0.01),
    label: 'Google Maps: "' + q + '" · ' + loc.label + ' · สูงสุด ' + fmt(n) + ' ร้าน',
    input: { searchStringsArray: [q], locationQuery: loc.query, language: 'th',
      maxCrawledPlacesPerSearch: n, maxReviews: 0, maxImages: 0 },
    params: { q, loc: loc.label, n, nomall: $('#g-nomall').checked, g: g === '' ? null : +g } };
}
function previewLeads(j, items) {
  const fresh = [], seen = new Set();
  let dup = 0, cut = 0, bad = 0;
  const pr = j.params || {};
  for (const it of items) {
    const raw = rawFromPlace(it, pr.q);
    if (!raw) { bad++; continue; }
    if (pr.nomall && CAT_MALL.has(raw.c || '')) { cut++; continue; }
    if (S.byId.has(raw.i) || seen.has(raw.i)) { dup++; continue; }
    if (Number.isInteger(pr.g) && GROUPS[pr.g]) raw.g = pr.g;      // the group picked on the form, for searches outside the usual trades
    seen.add(raw.i);
    fresh.push(raw);
  }
  const leads = fresh.map(r => makeLead(r, 'gmaps'));
  const byGrade = { A: 0, B: 0, C: 0, D: 0 }, byGroup = new Array(GROUPS.length).fill(0);
  let phone = 0, target = 0;
  for (const L of leads) { byGrade[L.grade]++; byGroup[L.group]++; if (L.phone) phone++; if (L.target) target++; }
  leads.sort(SORTS.score);
  return { found: items.length, fresh, dup, cut, bad, byGrade, byGroup, phone, target,
    top: leads.slice(0, 5).map(L => ({ name: L.name, grade: L.grade, prov: L.prov })) };
}
async function importLeads(id) {
  const ui = S.jobUi, j = getJob(id);
  if (!ui || ui.phase !== 'preview' || !j || !canEdit()) return;
  const pv = ui.preview, fresh = pv.fresh;
  showJob({ phase: 'saving', jobId: id });
  const at = new Date().toISOString(), pr = j.params || {};
  let chunks = 0;
  try {
    for (let i = 0; i < fresh.length; i += 100) {
      const part = fresh.slice(i, i + 100), n = chunks;
      await writeOnce(() => S.db.doc('batches/' + id + '-' + n).set({ src: j.kind === 'brand' ? 'web' : 'gmaps', job: id, createdAt: at, by: S.uid || null, q: pr.q || '', loc: pr.loc || '', leads: part }));
      chunks++;
    }
  } catch (e) {
    await saveJob(id, { chunks });
    onDbError(e, 'save');
    showJob({ phase: 'preview', jobId: id, preview: pv, saveError: 'บันทึกรายชื่อไม่สำเร็จ กดเพิ่มอีกครั้งได้ รายการที่บันทึกไปแล้วจะไม่ซ้ำ' });
    return;
  }
  await saveJob(id, { status: 'imported', added: fresh.length, dup: pv.dup, cut: pv.cut, chunks });
  showJob({ phase: 'imported', jobId: id, added: fresh.length });
}
async function removeBatch(id) {
  const j = getJob(id);
  if (!j || !S.db) return;
  try {
    for (let n = 0; n < (j.chunks || 0); n++) await S.db.doc('batches/' + id + '-' + n).delete();
    await saveJob(id, { status: 'removed' });
    toast('ลบรายชื่อจากการค้นหานี้แล้ว');
  } catch (e) { onDbError(e, 'save'); }
}

/* ---- channel search: Google results -> suggestions waiting for review ---- */
function chanTargets(scope, plats) {
  const parts = String(scope).split(':'), n = +parts[1] || 10;
  let list = S.view;
  if (parts[0] === 'queue') {
    list = S.leads.filter(L => inQueue(L, statusOf(L.id))).sort(SORTS.score);
  }
  const out = [];
  for (const L of list) {
    if (out.length >= n) break;
    const c = chanOf(L), sg = S.sugg[L.id] || {}, done = S.searched[L.id] || {};
    const need = plats.filter(k => !c[k] && !(sg[k] && sg[k].length) && !done[k]);
    if (need.length) out.push({ id: L.id, q: searchName(L.name), pl: need });
  }
  return out;
}
/* a query shared by several leads (branches of one company) is searched, and paid for, once */
function chanQueryMap(targets) {
  const m = new Map();
  for (const t of targets || []) for (const k of t.pl || []) {
    if (!PLAT[k] || !PLAT[k].site) continue;
    const text = t.q + ' site:' + PLAT[k].site, key = normQ(text);
    const e = m.get(key) || { text, hits: [] };
    e.hits.push({ id: t.id, k });
    m.set(key, e);
  }
  return m;
}
const SERP_INPUT = { maxPagesPerQuery: 1, countryCode: 'th', languageCode: 'th', saveHtml: false, saveHtmlToKeyValueStore: false };
function chanSpec(targets) {
  const qm = chanQueryMap(targets);
  if (!qm.size) return null;
  const queries = Array.from(qm.values(), e => e.text);
  const est = queries.length * PRICE_SERP;
  return { kind: 'chan', actor: ACTOR_SERP, est, cap: ceil2(est * 1.15 + 0.01), nq: queries.length, nt: targets.length,
    label: 'หาช่องทางออนไลน์ ' + targets.length + ' ราย (' + queries.length + ' คำค้น)',
    input: Object.assign({ queries: queries.join('\n') }, SERP_INPUT),
    params: { targets } };
}
/* Up to three links whose title or address carries a word of the lead's name; failing that, one weak guess. */
function pickCandidates(k, results, L) {
  const P = PLAT[k], seen = new Set(), out = [];
  const toks = L ? nameTokens(L.name) : [];
  for (const r of results) {
    const u = safeUrl(r && r.url);
    if (!u) continue;
    let x;
    try { x = new URL(u); } catch (e) { continue; }
    if (!P.host.test(x.hostname)) continue;
    const norm = normalizeChan(k, x);
    if (!norm || seen.has(norm.url)) continue;
    seen.add(norm.url);
    const title = String((r && r.title) || '').slice(0, 90);
    let path = x.pathname;
    try { path = decodeURIComponent(path); } catch (e) { /* keep it encoded */ }
    const hay = (title + ' ' + path).toLowerCase();
    out.push({ u: norm.url, t: title, y: norm.type, m: toks.some(t => hay.includes(t)) ? 1 : 0 });
  }
  out.sort((a, b) => (CAND_RANK[a.y] || 0) - (CAND_RANK[b.y] || 0));
  const matched = out.filter(c => c.m);
  if (matched.length) return matched.slice(0, 3);
  const weak = out.find(c => c.y !== 'item');
  return weak ? [weak] : [];
}
async function applyChannels(j, items) {
  const id = j.id;
  showJob({ phase: 'saving', jobId: id });
  const targets = (j.params && j.params.targets) || [];
  const qm = chanQueryMap(targets);
  const rows = new Map();
  let pages = 0, found = 0;
  for (const it of items) {
    const sq = it && it.searchQuery;
    const e = qm.get(normQ((sq && sq.term) || (it && it['searchQuery.term']) || ''));
    if (!e) continue;
    pages++;
    const results = (it && Array.isArray(it.organicResults)) ? it.organicResults : [];
    for (const hit of e.hits) {
      const row = rows.get(hit.id) || { id: hit.id, done: [], c: {} };
      rows.set(hit.id, row);
      if (row.done.indexOf(hit.k) < 0) row.done.push(hit.k);
      const cands = pickCandidates(hit.k, results, S.byId.get(hit.id));
      if (cands.length) row.c[hit.k] = cands;
    }
  }
  const all = Array.from(rows.values());
  for (const r of all) if (Object.keys(r.c).length) found++;
  const at = new Date().toISOString();
  let chunks = 0;
  try {
    for (let i = 0; i < all.length; i += 40) {
      const part = all.slice(i, i + 40), n = chunks;
      await writeOnce(() => S.db.doc('chansets/' + id + '-' + n).set({ kind: 'web', job: id, createdAt: at, by: S.uid || null, rows: part }));
      chunks++;
    }
  } catch (e) {
    onDbError(e, 'save');
    showJob({ phase: 'error', where: 'fetch', jobId: id, error: { msg: 'บันทึกผลค้นหาช่องทางไม่สำเร็จ กดดึงผลอีกครั้งได้โดยไม่เสียค่าใช้จ่ายเพิ่ม' } });
    return;
  }
  await saveJob(id, { status: 'applied', found, searched: all.length, pages, chunks });
  showJob({ phase: 'applied', jobId: id, found, searched: all.length, asked: targets.length });
}

/* ---- brand search: Google results inside a platform -> new leads with that platform as their contact channel ---- */
const BRAND_Q = {
  facebook: kw => kw + ' site:facebook.com',
  shopee: kw => kw + ' "ร้านค้าออนไลน์" site:shopee.co.th',     // the phrase sits in the title of Shopee shop pages
  lazada: kw => kw + ' site:lazada.co.th/shop',                 // Lazada shop pages live under /shop/
  tiktok: kw => kw + ' site:tiktok.com',
};
const brandPlats = () => AUTO_PLATS.filter(k => $('#b-' + k).checked);
function brandSpec() {
  const kw = $('#b-q').value.trim().slice(0, 60), plats = brandPlats();
  const pages = Math.max(1, Math.min(3, +$('#b-pages').value || 1));
  if (kw.length < 2 || !plats.length) return null;
  const est = plats.length * pages * PRICE_SERP;
  return { kind: 'brand', actor: ACTOR_SERP, est, cap: ceil2(est * 1.15 + 0.01),
    label: 'หาแบรนด์ "' + kw + '" ใน ' + plats.map(k => PLAT[k].label).join(', ') + ' · ' + pages + ' หน้าต่อแพลตฟอร์ม',
    input: Object.assign({ queries: plats.map(k => BRAND_Q[k](kw)).join('\n') }, SERP_INPUT, { maxPagesPerQuery: pages }),
    params: { q: kw, plats, pages } };
}
function previewBrands(j, items) {
  const pr = j.params || {};
  const known = new Set();
  for (const L of S.leads) { const c = chanOf(L); for (const k in c) known.add(urlKey(c[k])); if (L.webUrl) known.add(urlKey(L.webUrl)); }
  const seen = new Set(), fresh = [], byPlat = {};
  let dup = 0, found = 0;
  for (const it of items) {
    const term = normQ((it && it.searchQuery && it.searchQuery.term) || (it && it['searchQuery.term']) || '');
    const k = AUTO_PLATS.find(p => term.includes('site:' + PLAT[p].site));
    if (!k) continue;
    for (const r of (it && Array.isArray(it.organicResults)) ? it.organicResults : []) {
      found++;
      const raw = brandFromResult(k, r, pr.q);
      if (!raw) continue;
      if (known.has(urlKey(raw.ch[k])) || S.byId.has(raw.i) || seen.has(raw.i)) { dup++; continue; }
      seen.add(raw.i);
      fresh.push(raw);
      byPlat[k] = (byPlat[k] || 0) + 1;
    }
  }
  return { kind: 'brand', found, fresh, dup, cut: 0, byPlat, top: fresh.slice(0, 8).map(r => ({ name: r.n, grade: PLAT[r.sp].code, prov: NOPROV })) };
}

/* ---- adding a lead by hand ---- */
async function addManual() {
  const err = $('#m-err');
  const fail = msg => { err.textContent = msg; err.hidden = false; };
  err.hidden = true;
  if (!canEdit()) return fail('มุมมองนี้บันทึกไม่ได้');
  const name = $('#m-name').value.trim();
  if (name.length < 2) return fail('ใส่ชื่อร้านหรือแบรนด์ก่อน');
  if (S.leads.some(L => L.name.toLowerCase() === name.toLowerCase())) return fail('มี Lead ชื่อนี้อยู่ในสมุดแล้ว');
  const raw = { i: 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), n: name.slice(0, 140), g: +$('#m-group').value };
  const prov = $('#m-prov').value;
  if (prov) raw.st = prov;
  const phone = $('#m-phone').value.trim();
  if (phone) raw.p = phone.slice(0, 40);
  const web = $('#m-web').value.trim();
  if (web) { const u = safeUrl(web); if (!u) return fail('เว็บไซต์ต้องเป็นลิงก์ เช่น https://example.com'); raw.w = u; }
  const ch = {};
  for (const k of AUTO_PLATS) {
    const v = $('#m-' + k).value.trim();
    if (!v) continue;
    const u = safeUrl(v);
    if (!u) return fail('ลิงก์ ' + PLAT[k].label + ' ไม่ถูกต้อง วางลิงก์ที่ขึ้นต้นด้วย https://');
    ch[k] = u;
  }
  const line = $('#m-line').value.trim();
  if (line) ch.line = line.slice(0, 120);
  if (Object.keys(ch).length) raw.ch = ch;
  $('#m-add').disabled = true;
  try { await writeOnce(() => S.db.collection('batches').add({ src: 'manual', createdAt: new Date().toISOString(), by: S.uid || null, leads: [raw] })); }
  catch (e) { onDbError(e, 'save'); $('#m-add').disabled = false; return fail('บันทึกไม่สำเร็จ ลองอีกครั้ง'); }
  for (const k of ['name', 'phone', 'web', 'facebook', 'shopee', 'lazada', 'tiktok', 'line']) $('#m-' + k).value = '';
  $('#m-add').disabled = false;
  toast('เพิ่ม ' + name + ' เข้าสมุดแล้ว ดูได้ที่เมนู ทั้งหมด');
}

/* ---- rendering the find tab ---- */
function runStatusText(st) {
  return st === 'SUCCEEDED' ? 'เสร็จแล้ว' : st === 'FAILED' ? 'ล้มเหลว' : st === 'ABORTED' ? 'ถูกหยุด' : (st === 'TIMED-OUT' || st === 'TIMED_OUT') ? 'หมดเวลา'
    : st === 'READY' ? 'รอคิวเริ่ม' : st === 'RUNNING' ? 'กำลังทำงาน' : st === 'ABORTING' ? 'กำลังหยุด' : (st || 'ไม่ทราบ');
}
function errorBlock(er, actions) {
  const kids = [h('div', { class: 'note bad' }, er.msg, er.hint ? [h('br'), er.hint] : null)];
  const acts = h('div', { class: 'actions' }, actions);
  if (er.manage && S.perms) {
    acts.append(h('button', { class: 'btn', type: 'button', onclick: () => S.perms.manage().catch(() => toast('เปิดหน้าสิทธิ์ไม่ได้ เปิดจากเมนู Permissions ของหน้านี้แทน')) }, 'เปิดหน้าสิทธิ์'));
  }
  if (er.settings) acts.append(h('button', { class: 'btn', type: 'button', onclick: () => setTab('settings') }, 'ไปที่ตั้งค่า Apify'));
  kids.push(acts);
  return kids;
}
function previewBlock(id, ui) {
  const pv = ui.preview, j = getJob(id) || {};
  const n = pv.fresh.length;
  const kids = pv.kind === 'brand' ? [
    h('div', null, h('div', { class: 'big' }, fmt(n)), h('div', { class: 'hint' }, 'เพจ ร้าน หรือบัญชีใหม่ จากผลค้นหา ' + fmt(pv.found) + ' รายการ')),
    h('dl', { class: 'kv' },
      AUTO_PLATS.filter(k => pv.byPlat[k]).map(k => [h('dt', null, PLAT[k].label), h('dd', { class: 'num' }, fmt(pv.byPlat[k]))]),
      h('dt', null, 'มีในสมุดแล้ว'), h('dd', { class: 'num' }, fmt(pv.dup))),
    h('div', { class: 'note' }, 'ชื่อมาจากหัวข้อของผลค้นหา บางรายการอาจเป็นร้านค้าปลีกหรือเพจที่ไม่ใช่แบรนด์ ตรวจในหน้ารายละเอียดแล้วตั้งสถานะ ข้อมูลไม่ตรง ได้'),
  ] : [
    h('div', null, h('div', { class: 'big' }, fmt(n)), h('div', { class: 'hint' }, 'รายการใหม่ที่ยังไม่มีในสมุด จากที่ Apify ส่งมา ' + fmt(pv.found) + ' รายการ')),
    h('dl', { class: 'kv' },
      h('dt', null, 'ซ้ำกับที่มีอยู่'), h('dd', { class: 'num' }, fmt(pv.dup)),
      pv.cut ? [h('dt', null, 'ศูนย์การค้าที่ตัดออก'), h('dd', { class: 'num' }, fmt(pv.cut))] : null,
      h('dt', null, 'อยู่ในกลุ่มเป้าหมาย'), h('dd', { class: 'num' }, fmt(pv.target)),
      h('dt', null, 'มีเบอร์โทร'), h('dd', { class: 'num' }, fmt(pv.phone)),
      h('dt', null, 'เกรด A / B / C / D'), h('dd', { class: 'num' }, [pv.byGrade.A, pv.byGrade.B, pv.byGrade.C, pv.byGrade.D].join(' / '))),
  ];
  if (j.runStatus && j.runStatus !== 'SUCCEEDED') kids.push(h('div', { class: 'note bad' }, 'การรันจบแบบ "' + runStatusText(j.runStatus) + '" จึงอาจได้ผลไม่ครบ' + (j.message ? ' Apify แจ้งว่า: ' + j.message : '')));
  if (pv.top.length) kids.push(h('ul', { class: 'log' }, pv.top.map(t => h('li', null, h('span', { class: 'num' }, t.grade), t.name + (t.prov !== NOPROV ? ' · ' + t.prov : '')))));
  if (ui.saveError) kids.push(h('div', { class: 'note bad' }, ui.saveError));
  kids.push(h('div', { class: 'actions' },
    n ? h('button', { class: 'btn primary', type: 'button', id: 'job-import', onclick: () => importLeads(id) }, 'เพิ่ม ' + fmt(n) + ' รายการเข้าสมุด') : null,
    h('button', { class: 'btn', type: 'button', id: 'job-discard', onclick: e => n ? confirmThen(e.target, 'ยืนยันทิ้งผลนี้', () => discardJob(id)) : discardJob(id) }, n ? 'ทิ้งผลนี้' : 'ปิด')));
  return kids;
}
const waitingJobs = () => S.jobs.concat(Object.values(S.localJobs)).filter(x => x.status === 'running' || x.status === 'finished');
/* the menu shows which search has something going on, wherever the viewer is */
function renderJobFlags() {
  const flag = { find: null, brand: null, chan: null, settings: null };
  if (S.mcpState === 'missing' || S.mcpState === 'reauth') flag.settings = ['ต้องเชื่อมต่อ', 'bad'];
  const ui = S.jobUi, j = ui && ui.jobId ? getJob(ui.jobId) : null;
  const tab = KIND_TAB[(j && j.kind) || (ui && ui.kind)];
  if (ui && tab) {
    const p = ui.phase;
    flag[tab] = p === 'starting' || p === 'running' ? ['กำลังค้น', ''] : p === 'collecting' || p === 'saving' ? ['กำลังดึงผล', '']
      : p === 'preview' ? ['มีผลรอดู', 'todo'] : p === 'paused' ? ['ยังไม่จบ กดตรวจสถานะ', 'todo'] : p === 'error' ? ['ค้นไม่สำเร็จ', 'bad'] : p === 'confirm' ? ['รอยืนยัน', 'todo'] : null;
  } else if (!ui) {
    for (const w of waitingJobs()) { const t = KIND_TAB[w.kind]; if (t && !flag[t]) flag[t] = [w.status === 'running' ? 'รอตรวจสถานะ' : 'มีผลรอดึง', 'todo']; }
  }
  for (const k in flag) {
    const el = $('#flag-' + k);
    el.hidden = !flag[k];
    if (flag[k]) { el.textContent = flag[k][0]; el.dataset.k = flag[k][1]; }
    const t = $('#tab-' + k);
    if (flag[k]) { t.dataset.flag = flag[k][1] || 'busy'; t.title = flag[k][0]; } else { delete t.dataset.flag; t.removeAttribute('title'); }
  }
}
function renderJobBox() {
  const ui = S.jobUi, box = $('#jobbox');
  const j = ui && ui.jobId ? getJob(ui.jobId) : null;
  const waiting = ui ? [] : waitingJobs();
  const sig = JSON.stringify([ui && ui.phase, ui && ui.jobId, ui && ui.error, ui && ui.saveError, ui && ui.added, ui && ui.found, S.jobProg, j && j.status, waiting.map(x => x.id + x.status), !!S.mcp, canEdit(), S.polling]);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const kids = [];
  if (!ui) {
    if (!waiting.length) kids.push(h('p', { class: 'hint' }, 'ยังไม่มีงานค้นหาที่กำลังทำงาน เริ่มได้จากแบบฟอร์มในหน้านี้'));
    for (const w of waiting) {
      kids.push(h('div', null, h('div', null, w.label), h('div', { class: 'hint' }, w.status === 'running' ? 'เริ่มเมื่อ ' + fmtStamp(w.startedAt) + ' น. ยังไม่ได้ตรวจผล' : 'รันจบแล้ว ยังไม่ได้ดึงผลเข้าสมุด')),
        h('div', { class: 'actions' },
          w.status === 'running'
            ? h('button', { class: 'btn primary', type: 'button', disabled: !S.mcp || jobBusy(), onclick: () => runJob(w.id) }, 'ตรวจสถานะ')
            : h('button', { class: 'btn primary', type: 'button', disabled: !S.mcp || jobBusy(), onclick: () => collectJob(w.id) }, 'ดึงผลมาดู'),
          h('button', { class: 'btn', type: 'button', onclick: e => confirmThen(e.target, 'ยืนยันทิ้งงานนี้', () => discardJob(w.id)) }, 'ทิ้งงานนี้')));
    }
  } else if (ui.phase === 'starting') {
    kids.push(h('div', null, ui.label), h('p', { class: 'hint' }, 'กำลังส่งคำสั่งไป Apify… ถ้า Claude ถามสิทธิ์ใช้ Apify ให้กดอนุญาต'));
  } else if (ui.phase === 'running') {
    const pg = S.jobProg || {};
    kids.push(h('div', null, j ? j.label : ''),
      h('dl', { class: 'kv' },
        h('dt', null, 'สถานะ'), h('dd', null, runStatusText(pg.status || 'RUNNING')),
        h('dt', null, 'ได้ผลแล้ว'), h('dd', { class: 'num' }, pg.items == null ? '—' : fmt(pg.items) + ' รายการ'),
        pg.message ? [h('dt', null, 'Apify แจ้ง'), h('dd', null, pg.message)] : null),
      h('p', { class: 'hint' }, 'ปิดหน้านี้ได้ งานยังทำต่อใน Apify กลับมาที่หน้านี้แล้วกดตรวจสถานะเพื่อรับผล'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'job-abort', onclick: e => confirmThen(e.target, 'ยืนยันหยุดการค้นหา', () => abortJob(ui.jobId)) }, 'หยุดการค้นหา')));
  } else if (ui.phase === 'collecting') {
    kids.push(h('div', null, j ? j.label : ''), h('p', { class: 'hint' }, 'กำลังดึงผลจาก Apify…'));
  } else if (ui.phase === 'saving') {
    kids.push(h('div', null, j ? j.label : ''), h('p', { class: 'hint' }, 'กำลังบันทึกเข้าสมุด…'));
  } else if (ui.phase === 'preview') {
    kids.push(h('div', null, j ? j.label : ''), ...previewBlock(ui.jobId, ui));
  } else if (ui.phase === 'imported') {
    kids.push(h('div', { class: 'note ok' }, 'เพิ่ม ' + fmt(ui.added) + ' รายการเข้าสมุดแล้ว'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => { S.jobUi = null; S.ui.sel = null; resetFilters(); setTab('all', true); S.ui.sort = 'added'; $('#f-sort').value = 'added'; saveUi(); renderAll(); } }, 'ดูรายการที่เพิ่ม'),
        h('button', { class: 'btn', type: 'button', onclick: () => showJob(null) }, 'ปิด')));
  } else if (ui.phase === 'applied') {
    kids.push(h('div', { class: ui.found ? 'note ok' : 'note' },
      ui.searched ? 'ค้นแล้ว ' + fmt(ui.searched) + ' ราย พบตัวเลือกช่องทางของ ' + fmt(ui.found) + ' ราย' + (ui.searched < ui.asked ? ' อีก ' + fmt(ui.asked - ui.searched) + ' รายไม่ได้ผลกลับมา ค้นใหม่ได้ภายหลัง' : '')
        : 'ไม่ได้ผลค้นหากลับมาจาก Apify' + (j && j.message ? ' Apify แจ้งว่า: ' + j.message : '')),
      h('div', { class: 'actions' },
        ui.found ? h('button', { class: 'btn primary', type: 'button', onclick: () => { S.jobUi = null; S.ui.sel = null; resetFilters(); S.ui.chan = 'sugg'; $('#f-chan').value = 'sugg'; setTab('all', true); saveUi(); renderAll(); } }, 'ตรวจตัวเลือกที่พบ') : null,
        h('button', { class: 'btn', type: 'button', onclick: () => showJob(null) }, 'ปิด')));
  } else if (ui.phase === 'confirm') {
    kids.push(h('div', null, ui.label),
      h('dl', { class: 'kv' }, h('dt', null, 'ค่าใช้จ่ายประมาณ'), h('dd', { class: 'num' }, usd(ui.est)), h('dt', null, 'เพดานของการรันนี้'), h('dd', { class: 'num' }, usd(ui.cap))),
      h('p', { class: 'hint' }, 'ยังไม่ได้สั่ง Apify และยังไม่มีค่าใช้จ่าย กดยืนยันเพื่อเริ่มค้นหา'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', type: 'button', id: 'job-confirm', onclick: () => startJob(S.pendingSpec, true) }, 'ยืนยันเริ่มค้นหา (ไม่เกิน ' + usd(ui.cap) + ')'),
        h('button', { class: 'btn', type: 'button', onclick: () => { S.pendingSpec = null; showJob(null); } }, 'ยกเลิก')));
  } else if (ui.phase === 'paused') {
    kids.push(h('div', null, j ? j.label : ''), h('p', { class: 'hint' }, 'งานยังไม่จบหลังรอ 25 นาที งานยังทำต่อใน Apify กดตรวจสถานะอีกครั้งได้'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => runJob(ui.jobId) }, 'ตรวจสถานะ')));
  } else if (ui.phase === 'error') {
    const retry = ui.where === 'poll' ? h('button', { class: 'btn primary', type: 'button', onclick: () => runJob(ui.jobId) }, 'ตรวจสถานะอีกครั้ง')
      : ui.where === 'fetch' ? h('button', { class: 'btn primary', type: 'button', onclick: () => collectJob(ui.jobId) }, 'ดึงผลอีกครั้ง') : null;
    if (j) kids.push(h('div', null, j.label));
    kids.push(...errorBlock(ui.error, [retry, h('button', { class: 'btn', type: 'button', onclick: () => showJob(null) }, 'ปิด')]));
  }
  box.replaceChildren(...kids);
}
function jobLine(j) {
  let res = '';
  if (j.status === 'running') res = 'กำลังทำงาน หรือยังไม่ได้ตรวจผล';
  else if (j.status === 'finished') res = 'รัน' + runStatusText(j.runStatus) + ' ได้ ' + fmt(j.itemCount) + ' รายการ ยังไม่ได้ดึงเข้าสมุด';
  else if (j.status === 'imported') res = 'เพิ่ม ' + fmt(j.added) + ' รายการ ซ้ำ ' + fmt(j.dup) + (j.cut ? ' ตัดออก ' + fmt(j.cut) : '');
  else if (j.status === 'applied') res = 'ค้น ' + fmt(j.searched) + ' ราย พบตัวเลือกของ ' + fmt(j.found) + ' ราย';
  else if (j.status === 'discarded') res = 'ทิ้งผลแล้ว';
  else if (j.status === 'removed') res = 'ลบรายชื่อที่เพิ่มจากงานนี้แล้ว';
  const li = h('li', null, h('div', null, j.label), h('div', null, res),
    h('div', { class: 'meta' }, fmtStamp(j.startedAt) + ' น. · ประมาณการไม่เกิน ' + usd(j.est || 0) + (j.runStatus && j.runStatus !== 'SUCCEEDED' && j.message ? ' · Apify แจ้ง: ' + j.message : '')));
  if (j.status === 'imported' && j.added > 0 && canEdit()) {
    li.append(h('div', null, h('button', { class: 'linkbtn', type: 'button', onclick: e => confirmThen(e.target, 'ยืนยันลบ ' + fmt(j.added) + ' รายการนี้ออกจากสมุด', () => removeBatch(j.id)) }, 'ลบรายชื่อที่เพิ่มจากงานนี้')));
  }
  return li;
}
function renderJobs() {
  const list = S.jobs.concat(Object.values(S.localJobs)).sort((a, b) => String(b.startedAt || '') > String(a.startedAt || '') ? 1 : -1).slice(0, 30);
  const box = $('#jobs');
  const sig = JSON.stringify(list.map(j => [j.id, j.status, j.added, j.found, j.itemCount])) + canEdit();
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.replaceChildren(...(list.length ? list.map(jobLine) : [h('li', { class: 'meta' }, 'ยังไม่มีประวัติการค้นหา')]));
}
function renderApifyState() {
  let cls = 'note', text, tip = '';
  if (S.mcpState === 'pending') text = 'กำลังตรวจการเชื่อมต่อ Apify…';
  else if (S.mcpState === 'absent') { text = 'มุมมองนี้สั่ง Apify จากในแอปไม่ได้'; tip = ' ใช้ช่อง "ให้ Claude ค้นแทน" ในหน้านี้ได้'; }
  else if (S.mcpState === 'reauth') { cls = 'note bad'; text = 'การเชื่อมต่อ Apify หมดอายุ เชื่อมต่อใหม่ที่ Settings → Connectors ใน claude.ai'; }
  else if (S.mcpState === 'missing') { cls = 'note bad'; text = 'บัญชี Claude นี้ยังไม่ได้เชื่อมต่อ Apify เพิ่มได้ที่ Settings → Connectors ใน claude.ai'; }
  else if (!canEdit()) text = S.dbState === 'connecting' ? 'กำลังเชื่อมต่อที่เก็บข้อมูล…' : 'มุมมองนี้บันทึกไม่ได้ จึงเพิ่ม Lead ใหม่จากการค้นหาไม่ได้';
  else { cls = 'note ok'; text = 'พร้อมค้นหา กดปุ่มเริ่มแล้วแอปจะสั่ง Apify รันทันที ครั้งแรก Claude จะถามสิทธิ์ใช้ Apify ก่อน'; }
  const ux = usageNow();
  if (cls === 'note ok' && ux && ux.full) { cls = 'note bad'; text = 'เชื่อมต่อ Apify แล้ว แต่บัญชีถึงเพดานการใช้งานรอบบิลนี้ การค้นหาจะไม่สำเร็จจนกว่าจะรีเซ็ตหรืออัปเกรดแพ็กเกจ'; }
  for (const el of $$('[data-apify-state]')) { el.className = cls; el.textContent = text + (el.id === 'apify-state' ? tip : ''); }
}
function chanPlats() { return AUTO_PLATS.filter(k => $('#c-' + k).checked); }
function renderCosts() {
  const ready = !!S.mcp && S.mcpState === 'ready' && canEdit() && !jobBusy();
  const n = mapsCount(), q = $('#g-q').value.replace(/\s+/g, ' ').trim(), loc = mapsLoc();
  const est = n * PRICE_PLACE, cap = ceil2(est * 1.15 + 0.01);
  $('#g-cost').replaceChildren(
    h('dl', { class: 'kv' },
      h('dt', null, 'Actor'), h('dd', null, ACTOR_MAPS),
      h('dt', null, 'ค้นคำว่า'), h('dd', null, q.length >= 2 ? '"' + q + '"' : 'ยังไม่ได้พิมพ์คำค้น'),
      h('dt', null, 'location'), h('dd', null, loc.query),
      h('dt', null, 'ภาษา'), h('dd', null, 'th'),
      h('dt', null, 'จำนวน'), h('dd', null, n ? 'สูงสุด ' + fmt(n) + ' ร้าน' : '—'),
      h('dt', null, 'ไม่ดึง'), h('dd', null, 'รีวิว รูป add-on'),
      h('dt', null, 'ค่าใช้จ่าย'), h('dd', null, n ? ['ประมาณ ', h('b', null, usd(est)), ' เพดาน ', h('b', null, usd(cap))] : '—')),
    n ? h('div', { class: 'fine' }, 'คิดร้านละ $0.004 ตาม' + PRICE_NOTE + ' ถ้าเจอร้านน้อยกว่าที่ตั้งไว้ จ่ายตามจำนวนที่ได้จริง การรันจะหยุดเองเมื่อถึงเพดาน'
        + (loc.whole ? ' การค้นทั้งประเทศแบบจำกัดจำนวน ผลมักกระจุกอยู่ไม่กี่จังหวัด ใส่จังหวัดจะตรงพื้นที่กว่า' : '')
        + (n >= 300 ? ' จำนวนมากใช้เวลาหลายนาที ปิดหน้านี้ระหว่างรอได้' : ''))
      : h('div', { class: 'fine warn' }, 'ใส่จำนวนร้านเป็นเลขจำนวนเต็ม 1 ถึง ' + fmt(MAX_PLACES)),
    (n && usageWarn(cap)) || '');
  for (const c of $$('#g-loc-chips .chip')) c.setAttribute('aria-pressed', String(mapsLoc(c.dataset.v).query === loc.query));
  for (const c of $$('#g-n-chips .chip')) c.setAttribute('aria-pressed', String(+c.dataset.v === n));
  const gb = $('#g-start');
  gb.disabled = !(ready && q.length >= 2 && n);
  gb.textContent = n ? 'เริ่มค้นหา (ไม่เกิน ' + usd(cap) + ')' : 'เริ่มค้นหา';
  const plats = chanPlats();
  const targets = plats.length ? chanTargets($('#c-scope').value, plats) : [];
  const cs = chanSpec(targets);
  S.chanSpecNow = cs;
  $('#c-cost').replaceChildren(...(cs
    ? ['จะค้น ' + fmt(cs.nt) + ' ราย รวม ' + fmt(cs.nq) + ' คำค้น ประมาณ ', h('b', null, usd(cs.est)), ' คิดคำค้นละ $0.0045 ตาม' + PRICE_NOTE + ' เพดานของการรันนี้ ', h('b', null, usd(cs.cap)), ' รายที่มีช่องทางนั้นแล้วหรือเคยค้นแล้วจะถูกข้าม']
    : [plats.length ? 'ไม่มี Lead ในกลุ่มนี้ที่ยังต้องค้น รายที่มีช่องทางแล้วหรือเคยค้นแล้วจะถูกข้าม' : 'เลือกอย่างน้อยหนึ่งแพลตฟอร์ม']));
  const cb = $('#c-start');
  cb.disabled = !(ready && cs);
  cb.textContent = cs ? 'เริ่มค้นหาช่องทาง (ไม่เกิน ' + usd(cs.cap) + ')' : 'เริ่มค้นหาช่องทาง';
  const bp = brandPlats(), pg = Math.max(1, Math.min(3, +$('#b-pages').value || 1)), bn = bp.length * pg;
  const best = bn * PRICE_SERP, bcap = ceil2(best * 1.15 + 0.01);
  $('#b-cost').replaceChildren(...(bn
    ? ['ค้น ' + bp.length + ' แพลตฟอร์ม รวม ' + bn + ' หน้าผลค้นหา ประมาณ ', h('b', null, usd(best)), ' คิดหน้าละ $0.0045 ตาม' + PRICE_NOTE + ' เพดานของการรันนี้ ', h('b', null, usd(bcap))]
    : ['เลือกอย่างน้อยหนึ่งแพลตฟอร์ม']));
  const bb = $('#b-start');
  bb.disabled = !(ready && brandSpec());
  bb.textContent = bn ? 'เริ่มค้นหาแบรนด์ (ไม่เกิน ' + usd(bcap) + ')' : 'เริ่มค้นหาแบรนด์';
  $('#m-add').disabled = !canEdit();
}
function updateAsk() {
  const q = $('#g-q').value.replace(/\s+/g, ' ').trim() || 'คลังสินค้าให้เช่า', loc = mapsLoc().query, n = mapsCount() || 50;
  $('#ask-text').value = 'ใช้ Apify รัน Google Maps Scraper (compass/crawler-google-places)\n'
    + 'ค้นคำว่า "' + q + '" location: ' + loc + ' ภาษา th\n'
    + 'เอา ' + n + ' ร้าน ไม่ต้องดึงรีวิว รูป หรือ add-on ใดๆ\n'
    + 'บอกค่าใช้จ่ายโดยประมาณก่อนรัน แล้วรอผมยืนยัน\n'
    + 'จากนั้นเพิ่มรายการที่ยังไม่มี เข้าเว็บแอป "Lead Tracking & Performance Log"';
}
function updateProspectLinks() {
  const q = $('#m-kw').value.trim();
  const box = $('#m-links');
  if (!q) { box.replaceChildren(h('span', { class: 'hint' }, 'พิมพ์คำค้นแล้วลิงก์ค้นหาของแต่ละแพลตฟอร์มจะขึ้นที่นี่')); return; }
  box.replaceChildren(
    ext(PLAT.shopee.search(q), 'ร้านใน Shopee', 'btn sm'), ext(PLAT.lazada.search(q), 'Lazada', 'btn sm'),
    ext(PLAT.tiktok.search(q), 'บัญชี TikTok', 'btn sm'), ext(PLAT.facebook.search(q), 'เพจ Facebook', 'btn sm'), ext(googleUrl(q), 'Google', 'btn sm'));
}
function refreshFindForms() { renderCosts(); updateAsk(); updateProspectLinks(); }
function renderFind(force) {
  if (!S.loaded) return;
  renderJobFlags();
  renderUsage();
  if (!inFind() && !force) return;
  renderApifyState();
  renderJobBox();
  renderJobs();
  if (inFind()) renderCosts();
  if (S.ui.tab === 'settings') renderSettings();
  if (S.ui.tab === 'today') renderToday();
  if (S.ui.tab === 'report') renderReport();
}
/* ---- settings: spending limits kept in the store, so they hold on every device ---- */
function applyCfg(d) {
  d = d || {};
  S.cfg = { maxRun: +d.maxRun > 0 ? Math.round(+d.maxRun * 100) / 100 : 0, confirm: !!d.confirm, updatedAt: d.updatedAt || '' };
  fillSettings();
  scheduleRender();
}
function fillSettings() {
  if (document.activeElement && /^set-/.test(document.activeElement.id)) return;
  $('#set-max').value = S.cfg.maxRun ? S.cfg.maxRun.toFixed(2) : '';
  $('#set-confirm').checked = S.cfg.confirm;
}
async function saveSettings() {
  const err = $('#set-err'), v = $('#set-max').value.trim();
  err.hidden = true;
  if (v && !(+v > 0)) { err.textContent = 'เพดานต้องเป็นตัวเลขมากกว่า 0 หรือเว้นว่างไว้'; err.hidden = false; return; }
  const d = { maxRun: v ? Math.round(+v * 100) / 100 : 0, confirm: $('#set-confirm').checked, updatedAt: new Date().toISOString(), by: S.uid || null };
  if (S.db && canEdit()) {
    try { await writeOnce(() => S.db.doc('settings/apify').set(d)); }
    catch (e) { onDbError(e, 'save'); err.textContent = 'บันทึกไม่สำเร็จ ลองอีกครั้ง'; err.hidden = false; return; }
  } else lsSet('leadbook.apify', d);
  $('#set-max').blur();
  applyCfg(d);
  $('#set-saved').textContent = 'บันทึกแล้ว ' + fmtStamp(d.updatedAt) + ' น.';
  toast('บันทึกการตั้งค่า Apify แล้ว');
}
function renderSettings() {
  $('#set-perm').hidden = !S.perms;
  const month = today().slice(0, 7);
  let n = 0, sum = 0;
  for (const j of S.jobs.concat(Object.values(S.localJobs))) {
    if (!j.startedAt || fmtYm(j.startedAt) !== month) continue;
    n++; sum += +j.est || 0;
  }
  $('#set-usage').replaceChildren(h('dl', { class: 'kv' },
    h('dt', null, 'ค้นผ่านแอปนี้เดือนนี้'), h('dd', null, fmt(n) + ' ครั้ง'),
    h('dt', null, 'ประมาณการรวม'), h('dd', null, 'ไม่เกิน ' + usd(sum))),
    h('div', { class: 'fine' }, 'นับเฉพาะการค้นหาที่สั่งจากแอปนี้ ตัวเลขเป็นค่าประมาณสูงสุด ยอดจริงทั้งหมดของบัญชีดูได้ที่หน้า Billing ของ Apify'));
}
/* ---- the Apify spending limit of this billing cycle ----
   The page cannot read the account's usage itself; the figure comes from the store (written by Claude from the
   account, or typed in from the Billing page) plus the estimates of searches started here since then. */
function applyUsage(d) {
  if (!d || !(+d.limit > 0)) return;
  S.usage = { used: Math.max(0, +d.used || 0), limit: +d.limit, start: d.start || '', end: d.end || '', at: d.at || '', src: d.src || '' };
  scheduleRender();
}
function usageNow() {
  const u = S.usage;
  if (!u) return null;
  const now = new Date().toISOString(), reset = u.end && now > u.end;
  const from = reset ? u.end : u.at;
  let extra = 0;
  for (const j of S.jobs.concat(Object.values(S.localJobs))) if (j.startedAt && j.startedAt > from) extra += +j.est || 0;   // every run that started costs, kept or not
  const used = (reset ? 0 : u.used) + extra;
  const full = (S.usageFull && !reset) || used >= u.limit - 0.005;
  return { used, limit: u.limit, left: Math.max(0, u.limit - used), pct: Math.min(100, used / u.limit * 100), full, reset, extra, end: u.end, at: u.at };
}
function fmtD(iso) { const t = Date.parse(iso); if (isNaN(t)) return ''; const d = new Date(t + BKK); return d.getUTCDate() + ' ' + TH_MON[d.getUTCMonth()]; }
function usageNodes(x, big) {
  const msg = x.full ? 'ถึงเพดานแล้ว ค้นหาไม่ได้จนกว่ารอบบิลจะรีเซ็ต' + (x.end ? ' (' + fmtD(new Date(Date.parse(x.end) + 1).toISOString()) + ')' : '') + ' หรืออัปเกรดแพ็กเกจ'
    : 'เหลือประมาณ ' + usd(x.left) + (x.end ? ' · รีเซ็ต ' + fmtD(new Date(Date.parse(x.end) + 1).toISOString()) : '');
  const fill = h('div', { class: 'u-fill' });
  fill.style.width = x.pct.toFixed(1) + '%';
  return [
    h('div', { class: 'u-top' }, h('span', { class: 'u-k' }, big ? 'เพดานการใช้งาน Apify รอบบิลนี้' : 'เพดาน Apify'), h('span', { class: 'u-v' }, usd(x.used) + ' / ' + usd(x.limit))),
    h('span', { class: 'u-sm' }, x.full ? 'เต็ม' : Math.round(x.pct) + '%'),
    h('div', { class: 'u-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(x.limit), 'aria-valuenow': x.used.toFixed(2), 'aria-label': 'ใช้ไป ' + usd(x.used) + ' จาก ' + usd(x.limit) }, fill),
    h('div', { class: 'u-msg' }, msg),
    h('div', { class: 'u-at' }, (x.reset ? 'รอบบิลใหม่แล้ว ยอดนี้นับเฉพาะที่ค้นจากแอป' : 'ยอดจากบัญชี ณ ' + fmtStamp(x.at) + ' น.' + (x.extra ? ' + ค้นจากแอปหลังจากนั้น ~' + usd(x.extra) : ''))),
  ];
}
function renderUsage() {
  const x = usageNow(), side = $('#usage-side'), big = $('#usage-big');
  side.hidden = !x;
  if (!x) { big.replaceChildren(h('div', null, 'ยังไม่มีข้อมูลยอดใช้ของบัญชี กรอกเองด้านล่าง หรือบอก Claude ให้อัปเดต')); return; }
  const s = x.full ? 'full' : x.pct >= 80 ? 'warn' : 'ok';
  side.dataset.s = s; big.dataset.s = s;
  side.replaceChildren(...usageNodes(x, false));
  big.replaceChildren(...usageNodes(x, true));
  if (S.usage && document.activeElement && !/^u-/.test(document.activeElement.id)) {
    $('#u-used').value = S.usage.used.toFixed(2); $('#u-limit').value = S.usage.limit.toFixed(2);
    $('#u-end').value = S.usage.end ? new Date(Date.parse(S.usage.end) + BKK).toISOString().slice(0, 10) : '';
  }
}
function usageWarn(cap) {
  const x = usageNow();
  if (!x) return null;
  if (x.full) return h('div', { class: 'fine warn' }, 'บัญชี Apify ถึงเพดานรอบบิลนี้แล้ว การค้นหาจะไม่สำเร็จจนกว่าจะรีเซ็ตหรืออัปเกรดแพ็กเกจ ดูที่เมนู ตั้งค่า Apify');
  if (cap > x.left) return h('div', { class: 'fine warn' }, 'วงเงินคงเหลือประมาณ ' + usd(x.left) + ' น้อยกว่าเพดานของการรันนี้ Apify อาจหยุดกลางทางและได้ผลไม่ครบ');
  return null;
}
async function saveUsage() {
  const used = +$('#u-used').value, limit = +$('#u-limit').value, end = $('#u-end').value;
  if (!(limit > 0) || !(used >= 0)) { toast('ใส่ยอดที่ใช้และวงเงินเป็นตัวเลข'); return; }
  const d = { used, limit, end: end ? new Date(Date.parse(end + 'T23:59:59.999+07:00')).toISOString() : (S.usage && S.usage.end) || '',
    start: (S.usage && S.usage.start) || '', at: new Date().toISOString(), src: 'manual', by: S.uid || null };
  if (S.db && canEdit()) { try { await writeOnce(() => S.db.doc('settings/usage').set(d)); } catch (e) { onDbError(e, 'save'); return; } }
  else lsSet('leadbook.usage', d);
  S.usageFull = false;
  applyUsage(d);
  $('#u-save').blur();
  toast('บันทึกยอดใช้ Apify แล้ว');
}
function fmtYm(iso) { const t = Date.parse(iso); return isNaN(t) ? '' : new Date(t + BKK).toISOString().slice(0, 7); }
function fillFindOptions() {
  const mp = $('#m-prov'), keepM = mp.value;
  const provs = PROV_LIST.slice().sort((a, b) => collator.compare(a, b));
  $('#g-loc-list').replaceChildren(h('option', { value: 'ทั้งประเทศไทย' }), ...provs.map(p => h('option', { value: p })));
  const count = Object.create(null);
  for (const L of S.base) if (PROV_EN[L.prov]) count[L.prov] = (count[L.prov] || 0) + 1;
  const top = Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 6);
  $('#g-loc-chips').replaceChildren(...['ทั้งประเทศไทย'].concat(top).map(p => h('button', { class: 'chip', type: 'button', 'data-v': p, 'aria-pressed': 'false',
    onclick: () => { $('#g-loc').value = p; refreshFindForms(); } }, p)));
  $('#g-n-chips').replaceChildren(...[20, 50, 100, 200, 500].map(n => h('button', { class: 'chip num', type: 'button', 'data-v': String(n), 'aria-pressed': 'false',
    onclick: () => { $('#g-n').value = String(n); refreshFindForms(); } }, String(n))));
  const gg = $('#g-group'), keepG = gg.value;
  gg.replaceChildren(h('option', { value: '' }, 'อัตโนมัติ ดูจากชื่อและประเภทธุรกิจ'), ...GROUPS.map((g, i) => h('option', { value: String(i) }, g.name)));
  gg.value = keepG;
  mp.replaceChildren(h('option', { value: '' }, 'ไม่ระบุ'), ...provs.map(p => h('option', { value: p }, p)));
  mp.value = keepM;
  const mg = $('#m-group');
  mg.replaceChildren(...GROUPS.map((g, i) => h('option', { value: String(i) }, g.name)));
  mg.value = '5';
  $('#g-chips').replaceChildren(...SUGGEST_Q.map(s => h('button', { class: 'chip', type: 'button', onclick: () => { $('#g-q').value = s; refreshFindForms(); } }, s)));
}
