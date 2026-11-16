/* ===================== export, events, start ===================== */
function csvCell(v, free) {
  v = v == null ? '' : String(v);
  if (free && /^[=+\-@\t\r]/.test(v)) v = "'" + v;        // typed text must never run as a spreadsheet formula
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
const EXPORT_HEAD = ['ชื่อ', 'กลุ่ม', 'เกรด', 'คะแนน', 'สถานะ', 'วันนัดตามต่อ', 'โน้ต', 'โทรศัพท์', 'เว็บไซต์', 'Facebook', 'Shopee', 'Lazada', 'TikTok', 'LINE',
    'วันที่ค้นหา', 'คำค้น', 'จังหวัด', 'โซน', 'อำเภอ/เขต', 'ที่อยู่', 'ประเภทใน Google Maps', 'คะแนน Google', 'จำนวนรีวิว', 'Google Maps', 'อัปเดตล่าสุด'];
const exportRows = () => inFind() ? S.leads.slice().sort(SORTS.score) : S.view;
async function exportCsv() {
  if (!S.dl || !S.loaded) return;
  flushNote();
  const rows = exportRows();
  if (!rows.length) { toast('ไม่มีรายการให้ส่งออกในมุมมองนี้'); return; }
  const head = EXPORT_HEAD;
  const lines = [head.join(',')];
  for (const L of rows) {
    const t = trackOf(L.id) || {}, c = chanOf(L);
    lines.push([
      csvCell(L.name, true), csvCell(GROUPS[L.group].name), L.grade, L.score, csvCell(STATUS_BY[statusOf(L.id)].label), t.followUp || '', csvCell(t.note, true),
      csvCell(L.local, true), csvCell(L.webUrl && !L.webPlat ? L.webUrl : ''), csvCell(c.facebook), csvCell(c.shopee), csvCell(c.lazada), csvCell(c.tiktok), csvCell(c.line, true),
      foundDay(L.addedAt), csvCell(L.search, true), csvCell(L.prov === NOPROV ? '' : L.prov), L.zone >= 0 ? ZCODE[L.zone] : '', csvCell(L.dist), csvCell(L.addr, true), csvCell(L.cat),
      L.rating == null ? '' : L.rating, L.reviews || '', csvCell(mapsUrl(L)), t.updatedAt ? fmtStamp(t.updatedAt) : '',
    ].join(','));
  }
  await saveExport('lead-tracking-' + today() + '.csv', '﻿' + lines.join('\r\n') + '\r\n', rows.length);
}
async function saveExport(filename, data, n) {
  try {
    await S.dl.save({ filename, data });
    toast('ส่งออก ' + fmt(n) + ' รายการแล้ว');
  } catch (e) {
    const code = e && e.code;
    if (code === 'declined') return;
    if (code === 'rate_limited') toast('มีหน้าต่างบันทึกไฟล์เปิดค้างอยู่ ปิดก่อนแล้วกดอีกครั้ง');
    else if (code === 'rejected_extension' || code === 'extension_not_enabled') toast('มุมมองนี้บันทึกไฟล์ Excel ไม่ได้ ใช้ปุ่ม CSV แทน', 6000);
    else { toast('มุมมองนี้ส่งออกไฟล์ไม่ได้'); if (code !== 'too_large' && code !== 'bad_request') $('#exp').hidden = true; }
  }
}

/* ---- Excel: the spreadsheet library loads only when someone exports ---- */
let xlsxLib = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxLib) return xlsxLib;
  xlsxLib = new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => window.XLSX ? ok(window.XLSX) : bad(new Error('no XLSX'));
    s.onerror = () => { xlsxLib = null; s.remove(); bad(new Error('load failed')); };
    document.head.append(s);
  });
  return xlsxLib;
}
/* a day as an Excel date serial (days since 30 Dec 1899), so no time zone can shift it */
const xDate = ymd => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 + 25569 : null; };
function sheetFrom(X, aoa, widths, opts) {
  const ws = X.utils.aoa_to_sheet(aoa);
  for (const c of (opts && opts.dates) || []) for (let r = 1; r < aoa.length; r++) { const a = ws[X.utils.encode_cell({ r, c })]; if (a && a.t === 'n') a.z = 'd mmm yyyy'; }
  ws['!cols'] = widths.map(w => ({ wch: w }));
  if (opts && opts.filter && aoa.length > 1) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: aoa[0].length - 1 } }) };
  return ws;
}
async function exportXlsx() {
  if (!S.dl || !S.loaded) return;
  flushNote();
  const rows = exportRows();
  if (!rows.length) { toast('ไม่มีรายการให้ส่งออกในมุมมองนี้'); return; }
  const btn = $('#btn-xlsx');
  btn.disabled = true; btn.textContent = 'กำลังสร้างไฟล์…';
  let X;
  try { X = await loadXlsx(); }
  catch (e) { toast('โหลดตัวสร้างไฟล์ Excel ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง หรือใช้ปุ่ม CSV', 6000); btn.disabled = false; btn.textContent = 'ส่งออก Excel'; return; }
  try {
    const aoa = [EXPORT_HEAD];
    const links = [];
    for (const L of rows) {
      const t = trackOf(L.id) || {}, c = chanOf(L), maps = mapsUrl(L);
      links.push(maps);
      aoa.push([L.name, GROUPS[L.group].name, L.grade, L.score, STATUS_BY[statusOf(L.id)].label, xDate(t.followUp), t.note || '',
        L.local || '', L.webUrl && !L.webPlat ? L.webUrl : '', c.facebook || '', c.shopee || '', c.lazada || '', c.tiktok || '', c.line || '',
        xDate(foundDay(L.addedAt)), L.search || '', L.prov === NOPROV ? '' : L.prov, L.zone >= 0 ? ZCODE[L.zone] : '', L.dist, L.addr, L.cat,
        L.rating == null ? '' : L.rating, L.reviews || 0, maps, t.updatedAt ? xDate(foundDay(t.updatedAt)) : null]);
    }
    const ws = sheetFrom(X, aoa, [36, 26, 6, 7, 14, 13, 30, 14, 28, 24, 24, 24, 24, 16, 13, 18, 16, 6, 18, 40, 24, 9, 9, 16, 13], { filter: true, dates: [5, 14, 24] });
    const mc = EXPORT_HEAD.indexOf('Google Maps');
    links.forEach((u, i) => { const a = X.utils.encode_cell({ r: i + 1, c: mc }); if (ws[a]) { ws[a].v = 'เปิดแผนที่'; ws[a].l = { Target: u }; } });
    const d = reportData();
    const sum = [['สรุป', ''], ['ส่งออกเมื่อ', fmtStamp(new Date().toISOString())], ['จำนวนในไฟล์', rows.length], ['', ''],
      ['ผลการติดต่อ (ทั้งสมุด)', ''], ['Lead ทั้งหมด', d.total], ['ติดต่อแล้ว', d.contacted], ['คุยได้', d.reached], ['สนใจหรือเป็นลูกค้า', d.interested], ['เป็นลูกค้าแล้ว', d.won], ['', ''],
      ['สถานะ', 'จำนวน']];
    const stCount = Object.create(null);
    for (const L of S.leads) { const s = statusOf(L.id); stCount[s] = (stCount[s] || 0) + 1; }
    for (const s of STATUS) sum.push([s.label, stCount[s.k] || 0]);
    const found = [['วันที่ค้นหา', 'คำค้น', 'ทั้งหมด', 'ติดต่อแล้ว', 'สนใจ']].concat(d.found.map(r => [xDate(r.d), r.q, r.n, r.c, r.i]));
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'รายชื่อ Lead');
    X.utils.book_append_sheet(wb, sheetFrom(X, found, [14, 28, 10, 11, 8], { filter: true, dates: [0] }), 'ตามวันที่ค้นหา');
    X.utils.book_append_sheet(wb, sheetFrom(X, sum, [26, 20]), 'สรุป');
    const buf = X.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
    await saveExport('lead-tracking-' + today() + '.xlsx', buf, rows.length);
  } catch (e) { toast('สร้างไฟล์ Excel ไม่สำเร็จ ลองอีกครั้ง หรือใช้ปุ่ม CSV', 6000); }
  btn.disabled = false; btn.textContent = 'ส่งออก Excel';
}

function resetFilters() {
  Object.assign(S.ui, { q: '', area: '', group: '', grade: '', chan: '', status: '', shown: 150 });
  fillFilterOptions();
}
function onFilterChange() {
  S.ui.area = $('#f-area').value;
  S.ui.group = $('#f-group').value;
  S.ui.grade = $('#f-grade').value;
  S.ui.chan = $('#f-chan').value;
  S.ui.sort = $('#f-sort').value;
  S.ui.shown = 150;
  S.ui.reselect = true;
  saveUi();
  renderAll();
}

function wire() {
  for (const b of $$('.tab')) b.addEventListener('click', () => setTab(b.dataset.tab));
  let qTimer = 0;
  $('#f-q').addEventListener('input', e => {
    clearTimeout(qTimer);
    const v = e.target.value;
    qTimer = setTimeout(() => { S.ui.q = v; S.ui.shown = 150; S.ui.reselect = true; renderList(); renderDetail(false); }, 140);
  });
  for (const id of ['#f-area', '#f-group', '#f-grade', '#f-chan', '#f-sort']) $(id).addEventListener('change', onFilterChange);
  $('#btn-clear').addEventListener('click', () => { resetFilters(); S.ui.reselect = true; saveUi(); renderAll(); });
  $('#btn-filters').addEventListener('click', e => {
    const open = $('#filters').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  $('#rows').addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    step(e.key === 'ArrowDown' ? 1 : -1);
    const row = $('#rows .row[aria-selected="true"]');
    if (row) row.focus({ preventScroll: true });
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('#detail').classList.contains('open')) closeSheet();
  });
  $('#btn-export').addEventListener('click', exportCsv);
  $('#btn-xlsx').addEventListener('click', exportXlsx);
  $('#btn-theme').addEventListener('click', () => { const t = isDark() ? 'light' : 'dark'; applyTheme(t); lsSet('leadbook.theme', t); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderThemeBtn);
  $('#btn-retry').addEventListener('click', retrySaves);

  for (const id of ['#g-q', '#g-loc', '#g-n', '#m-kw', '#b-q']) $(id).addEventListener('input', refreshFindForms);
  for (const id of ['#g-group', '#g-nomall', '#c-scope', '#c-facebook', '#c-shopee', '#c-lazada', '#c-tiktok',
    '#b-facebook', '#b-shopee', '#b-lazada', '#b-tiktok', '#b-pages']) $(id).addEventListener('change', refreshFindForms);
  $('#g-start').addEventListener('click', () => startJob(mapsSpec()));
  $('#b-start').addEventListener('click', () => startJob(brandSpec()));
  $('#t-start').addEventListener('click', () => startJob(ttsSpec()));
  $('#t-n').addEventListener('input', refreshFindForms);
  $('#askmore-btn').addEventListener('click', askMoreGo);
  /* Enter in a keyword box presses that form's own search button, whose label carries the cost */
  for (const [box, btn] of [['#g-q', '#g-start'], ['#b-q', '#b-start']]) {
    $(box).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && !$(btn).disabled) { e.preventDefault(); $(btn).click(); } });
  }
  $('#c-start').addEventListener('click', () => startJob(S.chanSpecNow));
  $('#m-add').addEventListener('click', addManual);
  $('#set-save').addEventListener('click', saveSettings);
  $('#plan-daily').addEventListener('change', savePlan);
  $('#u-save').addEventListener('click', saveUsage);
  $('#g-ex').addEventListener('input', () => { lsSet('leadbook.ex', $('#g-ex').value); refreshFindForms(); });
  if (STANDALONE) wireStandalone();
  $('#usage-side').addEventListener('click', () => setTab('settings'));
  $('#set-check').addEventListener('click', () => { if (!S.mcp) { toast('มุมมองนี้สั่ง Apify จากในแอปไม่ได้'); return; } S.mcpState = 'pending'; renderFind(true); checkApify().then(() => toast(S.mcpState === 'ready' ? 'เชื่อมต่อ Apify ได้' : 'ยังเชื่อมต่อ Apify ไม่ได้ ดูรายละเอียดในกรอบด้านบน')); });
  $('#set-perm').addEventListener('click', () => S.perms && S.perms.manage().catch(() => toast('เปิดหน้าสิทธิ์ไม่ได้ เปิดจากเมนู Permissions ของหน้านี้แทน')));
  $('#ask-copy').addEventListener('click', () => copyText($('#ask-text').value, 'คัดลอกข้อความแล้ว', $('#ask-text')));
  window.addEventListener('hashchange', () => {
    const t = (location.hash || '').slice(1);
    if (TABS.has(t) && t !== S.ui.tab) setTab(t);
  });
  window.addEventListener('pagehide', flushNote);
  setInterval(() => { if (S.loaded && !document.hidden) { renderTabs(); if (S.ui.sel) renderDetail(false); } }, 5 * 60e3);   // "due today" and "open now" drift with the clock
}

const TABS = new Set(Object.keys(TAB_NAME));
/* White or dark, chosen by the button; until then the page follows the viewer's own setting. */
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; };
function renderThemeBtn() {
  const d = isDark(), b = $('#btn-theme');
  b.setAttribute('aria-pressed', String(d));
  $('#theme-text').textContent = d ? 'ธีมขาว' : 'ธีมมืด';
  b.title = d ? 'เปลี่ยนเป็นธีมขาว' : 'เปลี่ยนเป็นธีมมืด';
}
function applyTheme(t) {
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  renderThemeBtn();
}
function restoreUi() {
  applyTheme(lsGet('leadbook.theme'));
  applyCfg(lsGet('leadbook.apify'));
  applyUsage(lsGet('leadbook.usage'));
  applyPlan(lsGet('leadbook.plan'));
  const s = lsGet('leadbook.ui') || {};
  if (/^(z[0-5]|p:.{1,60})$/.test(s.area || '')) S.ui.area = s.area;
  if (/^[0-6]$/.test(s.group || '')) S.ui.group = s.group;
  if (/^[ABCD]$/.test(s.grade || '')) S.ui.grade = s.grade;
  if (/^(phone|web|facebook|shopee|lazada|tiktok|line|sugg|noonline|none)$/.test(s.chan || '')) S.ui.chan = s.chan;
  if (s.listTab === 'follow' || s.listTab === 'all' || s.listTab === 'queue') S.ui.listTab = s.listTab;
  const hash = (location.hash || '').slice(1);
  const tab = TABS.has(hash) ? hash : (TABS.has(s.tab) ? s.tab : 'today');
  S.ui.tab = tab;
  if (!FIND_TABS.has(tab)) S.ui.listTab = tab;
  if (SORTS[s.sort]) S.ui.sort = s.sort;
  if (S.ui.listTab === 'follow' && !SORTS[s.sort]) S.ui.sort = 'follow';
}

async function loadLeads() {
  S.loadError = '';
  try {
    let data;
    if (STANDALONE) data = window.__ltpl.leads() || { leads: [] };
    else {
      const res = await fetch('leads.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    }
    const list = Array.isArray(data) ? data : (data && data.leads);
    if (!Array.isArray(list)) throw new Error('bad file');
    const base = [];
    /* the day the lead file was scraped; copies made before the date was kept fall back to the day of the first Apify search */
    const fileDay = (data && !Array.isArray(data) && data.scrapedAt) || '2026-10-11';
    for (const r of list) { if (r && r.i && r.n) base.push(makeLead(r, 'base', { at: r.d || fileDay })); }
    S.base = base;
    S.loaded = true;
  } catch (e) {
    $('#list-count').textContent = 'โหลดรายชื่อไม่สำเร็จ';
    $('#rows').replaceChildren(h('div', { class: 'empty' }, 'โหลดไฟล์รายชื่อไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วกดลองอีกครั้ง ',
      h('button', { class: 'btn sm', type: 'button', onclick: loadLeads }, 'ลองอีกครั้ง')));
    return;
  }
  rebuildLeads();
  fillFilterOptions();
  fillFindOptions();
  refreshFindForms();
  renderAll();
}

/* Capabilities arrive later, one by one, or never: the page works without each of them. */
function use(name) {
  try {
    if (window.claude && typeof window.claude.use === 'function') return Promise.resolve(window.claude.use(name)).catch(() => null);
  } catch (e) { /* no runtime here */ }
  return Promise.resolve(null);
}
function initCaps() {
  use('db').then(db => {
    S.db = db || null;
    S.dbState = db ? 'ready' : 'absent';
    if (db) { try { subscribeAll(); } catch (e) { onDbError(e, 'sub'); } }
    renderSync();
    renderAll();
    if (db && S.ui.sel && !isKnown(S.ui.sel)) fetchOne(S.ui.sel);
  });
  use('user').then(async u => {
    if (!u) return;
    S.user = u;
    try { S.uid = await u.id(); } catch (e) { /* no identity here */ }
    try { if ((await u.can('data.write')) === false) S.canWrite = false; } catch (e) { /* not told: keep the inputs */ }
    renderSync();
    renderAll();
  });
  use('downloads').then(d => { S.dl = d || null; $('#exp').hidden = !d; });
  use('mcp').then(m => {
    S.mcp = m || null;
    S.mcpState = m ? 'ready' : 'absent';
    if (m) checkApify(); else { renderFind(true); scheduleRender(); }
  });
  use('permissions').then(p => { S.perms = p || null; });
}

restoreUi();
if (STANDALONE) {
  for (const el of $$('[data-standalone]')) el.hidden = false;
  for (const el of $$('[data-claude]')) el.hidden = true;
}
wire();
renderSync();
renderNav();
loadLeads();
initCaps();
