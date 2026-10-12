/* ===================== export, events, start ===================== */
function csvCell(v, free) {
  v = v == null ? '' : String(v);
  if (free && /^[=+\-@\t\r]/.test(v)) v = "'" + v;        // typed text must never run as a spreadsheet formula
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
async function exportCsv() {
  if (!S.dl || !S.loaded) return;
  flushNote();
  const rows = inFind() ? S.leads.slice().sort(SORTS.score) : S.view;
  if (!rows.length) { toast('ไม่มีรายการให้ส่งออกในมุมมองนี้'); return; }
  const head = ['ชื่อ', 'กลุ่ม', 'เกรด', 'คะแนน', 'สถานะ', 'วันนัดตามต่อ', 'โน้ต', 'โทรศัพท์', 'เว็บไซต์', 'Facebook', 'Shopee', 'Lazada', 'TikTok', 'LINE',
    'จังหวัด', 'โซน', 'อำเภอ/เขต', 'ที่อยู่', 'ประเภทใน Google Maps', 'คะแนน Google', 'จำนวนรีวิว', 'Google Maps', 'อัปเดตล่าสุด'];
  const lines = [head.join(',')];
  for (const L of rows) {
    const t = trackOf(L.id) || {}, c = chanOf(L);
    lines.push([
      csvCell(L.name, true), csvCell(GROUPS[L.group].name), L.grade, L.score, csvCell(STATUS_BY[statusOf(L.id)].label), t.followUp || '', csvCell(t.note, true),
      csvCell(L.local, true), csvCell(L.webUrl && !L.webPlat ? L.webUrl : ''), csvCell(c.facebook), csvCell(c.shopee), csvCell(c.lazada), csvCell(c.tiktok), csvCell(c.line, true),
      csvCell(L.prov === NOPROV ? '' : L.prov), L.zone >= 0 ? ZCODE[L.zone] : '', csvCell(L.dist), csvCell(L.addr, true), csvCell(L.cat),
      L.rating == null ? '' : L.rating, L.reviews || '', csvCell(mapsUrl(L)), t.updatedAt ? fmtStamp(t.updatedAt) : '',
    ].join(','));
  }
  try {
    await S.dl.save({ filename: 'warehouse-leads-' + today() + '.csv', data: '﻿' + lines.join('\r\n') + '\r\n' });
    toast('ส่งออก ' + fmt(rows.length) + ' รายการแล้ว');
  } catch (e) {
    const code = e && e.code;
    if (code === 'declined') return;
    if (code === 'rate_limited') toast('มีหน้าต่างบันทึกไฟล์เปิดค้างอยู่ ปิดก่อนแล้วกดอีกครั้ง');
    else { toast('มุมมองนี้ส่งออกไฟล์ไม่ได้'); if (code !== 'too_large' && code !== 'bad_request') $('#btn-export').hidden = true; }
  }
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
  $('#btn-theme').addEventListener('click', () => { const t = isDark() ? 'light' : 'dark'; applyTheme(t); lsSet('leadbook.theme', t); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderThemeBtn);
  $('#btn-retry').addEventListener('click', retrySaves);

  for (const id of ['#g-q', '#g-loc', '#g-n', '#m-kw', '#b-q']) $(id).addEventListener('input', refreshFindForms);
  for (const id of ['#g-group', '#g-nomall', '#c-scope', '#c-facebook', '#c-shopee', '#c-lazada', '#c-tiktok',
    '#b-facebook', '#b-shopee', '#b-lazada', '#b-tiktok', '#b-pages']) $(id).addEventListener('change', refreshFindForms);
  $('#g-start').addEventListener('click', () => startJob(mapsSpec()));
  $('#b-start').addEventListener('click', () => startJob(brandSpec()));
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
    const res = await fetch('leads.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data && data.leads);
    if (!Array.isArray(list)) throw new Error('bad file');
    const base = [];
    for (const r of list) { if (r && r.i && r.n) base.push(makeLead(r, 'base')); }
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
  use('downloads').then(d => { S.dl = d || null; $('#btn-export').hidden = !d; });
  use('mcp').then(m => {
    S.mcp = m || null;
    S.mcpState = m ? 'ready' : 'absent';
    if (m) checkApify(); else { renderFind(true); scheduleRender(); }
  });
  use('permissions').then(p => { S.perms = p || null; });
}

restoreUi();
wire();
renderSync();
renderNav();
loadLeads();
initCaps();
