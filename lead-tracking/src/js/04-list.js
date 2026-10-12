/* ===================== list view: tabs, status lanes, filters, rows ===================== */
const wide = () => window.matchMedia('(min-width: 1080px)').matches;
const FIND_TABS = new Set(['today', 'report', 'find', 'brand', 'chan', 'manual', 'history', 'settings']);
const TAB_NAME = { today: 'แผนงานวันนี้', report: 'รายงานผล', queue: 'คิวติดต่อ', follow: 'ต้องตามต่อ', all: 'ทั้งหมด', find: 'ค้นจาก Google Maps', brand: 'หาแบรนด์ออนไลน์', chan: 'หาช่องทางของ Lead', manual: 'เพิ่ม Lead เอง', history: 'ประวัติการค้นหา', settings: 'ตั้งค่า Apify' };
const inFind = () => FIND_TABS.has(S.ui.tab);
const collator = new Intl.Collator('th');
const listTab = () => inFind() ? S.ui.listTab : S.ui.tab;

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderAll(); });
}
function renderAll() {
  if (!S.loaded) return;
  renderTabs();
  renderLanes();
  renderList();
  renderDetail(false);
  renderFind();
}

function renderSync() {
  const el = $('#sync'), tx = $('#sync-text'), retry = $('#btn-retry');
  let s = 'idle', text = '';
  if (S.saveError) { s = 'err'; text = S.saveError; }
  else if (S.dbState === 'connecting') text = 'กำลังเชื่อมต่อที่เก็บข้อมูล…';
  else if (S.dbState === 'absent') text = 'ดูได้อย่างเดียว มุมมองนี้บันทึกไม่ได้';
  else if (S.canWrite === false) text = 'ดูได้อย่างเดียว';
  else if (S.saving > 0) { s = 'busy'; text = 'กำลังบันทึก…'; }
  else if (S.lastSaved) { s = 'ok'; text = 'บันทึกแล้ว ' + fmtClock(S.lastSaved) + ' น.'; }
  else { s = 'ok'; text = 'พร้อมบันทึก'; }
  if (S.trackOverflow && !S.saveError) { s = 'err'; text = 'ข้อมูลติดตามมากเกินที่แอปแสดงได้ แจ้ง Claude ให้ขยายที่เก็บ'; }
  el.dataset.s = s;
  tx.textContent = text;
  retry.hidden = !(S.saveError && Object.keys(pending).length && canEdit());
}

function renderTabs() {
  let nq = 0, nf = 0, due = 0;
  const td = today();
  for (const L of S.leads) {
    const t = trackOf(L.id);
    const st = (t && STATUS_BY[t.status]) ? t.status : 'new';
    if (inQueue(L, st)) nq++;
    if (FOLLOW.has(st)) { nf++; if (t.followUp && t.followUp <= td) due++; }
  }
  $('#n-queue').textContent = fmt(nq);
  $('#n-follow').textContent = fmt(nf);
  $('#n-due').textContent = 'ถึงกำหนด ' + fmt(due) + ' ราย';
  $('#n-due').hidden = !due;
  if (due) $('#tab-follow').dataset.flag = 'bad'; else delete $('#tab-follow').dataset.flag;
  $('#n-all').textContent = fmt(S.leads.length);
  $('#mark').textContent = fmt(S.leads.length);
  if (S.loaded) { const d = todayData(); $('#n-today').textContent = fmt(d.due.length + d.next.length); }
  renderNav();
}
function renderNav() {
  const tab = S.ui.tab, find = inFind();
  for (const b of $$('.tab')) { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
  $('#view-list').hidden = find;
  $('#view-find').hidden = !find;
  for (const c of $$('#find-main > .card')) c.hidden = c.dataset.page !== tab;
  $('#find-side').hidden = !(tab === 'find' || tab === 'brand' || tab === 'chan');
  $('#card-ask').hidden = tab !== 'find';
  $('.find-grid').toggleAttribute('data-wide', tab === 'today' || tab === 'report');
  renderJobFlags();
}


function renderLanes() {
  const counts = Object.create(null);
  let tg = 0, done = 0;
  for (const L of S.leads) {
    const st = statusOf(L.id);
    counts[st] = (counts[st] || 0) + 1;
    if (L.target) { tg++; if (st !== 'new') done++; }
  }
  const fill = h('div', { class: 'fill', 'data-zero': done ? null : '1' });
  fill.style.width = (tg ? Math.round(done / tg * 1000) / 10 : 0) + '%';
  const kids = [h('div', { class: 'lane meter', role: 'group', 'aria-label': 'ความคืบหน้าการติดต่อกลุ่มเป้าหมาย' },
    h('span', { class: 'v' }, fmt(done) + ' / ' + fmt(tg)),
    h('span', { class: 'l' }, 'กลุ่มเป้าหมายที่ติดต่อแล้ว'),
    h('div', { class: 'track' }, fill))];
  for (const s of STATUS) {
    kids.push(h('button', { class: 'lane', type: 'button', 'aria-pressed': String(S.ui.tab === 'all' && S.ui.status === s.k),
      title: 'ดูเฉพาะสถานะนี้', onclick: () => laneClick(s.k) },
      h('span', { class: 'v' }, fmt(counts[s.k] || 0)),
      h('span', { class: 'l', 'data-t': s.k }, h('span', { class: 'dot' }), s.label)));
  }
  const box = $('#lanes'), left = box.scrollLeft;
  box.replaceChildren(...kids);
  box.scrollLeft = left;
}
function laneClick(k) {
  if (S.ui.tab === 'all' && S.ui.status === k) S.ui.status = '';
  else { setTab('all', true); S.ui.status = k; }
  S.ui.shown = 150;
  S.ui.reselect = true;
  saveUi();
  renderAll();
}

function chanFilter(L, f) {
  const c = chanOf(L);
  switch (f) {
    case 'phone': return !!L.phone;
    case 'web': return !!(L.webUrl && !L.webPlat);
    case 'sugg': return suggCount(L) > 0;
    case 'noonline': return !L.webUrl && !Object.keys(c).length;
    case 'none': return !contactable(L, c);
    default: return !!c[f];
  }
}
const SORTS = {
  score: (a, b) => b.score - a.score || b.reviews - a.reviews || collator.compare(a.name, b.name),
  name: (a, b) => collator.compare(a.name, b.name),
  reviews: (a, b) => b.reviews - a.reviews || b.score - a.score,
  follow: (a, b) => {
    const x = (trackOf(a.id) || {}).followUp || '', y = (trackOf(b.id) || {}).followUp || '';
    return (x ? 0 : 1) - (y ? 0 : 1) || (x < y ? -1 : x > y ? 1 : 0) || b.score - a.score;
  },
  updated: (a, b) => {
    const x = (trackOf(a.id) || {}).updatedAt || '', y = (trackOf(b.id) || {}).updatedAt || '';
    return (y > x ? 1 : y < x ? -1 : 0) || b.score - a.score;
  },
  added: (a, b) => (b.addedAt > a.addedAt ? 1 : b.addedAt < a.addedAt ? -1 : 0) || b.score - a.score,
};
function computeView() {
  const u = S.ui, tab = listTab(), q = u.q.trim().toLowerCase();
  const out = [];
  for (const L of S.leads) {
    const t = trackOf(L.id);
    const st = (t && STATUS_BY[t.status]) ? t.status : 'new';
    if (tab === 'queue') { if (!inQueue(L, st)) continue; }
    else if (tab === 'follow') { if (!FOLLOW.has(st)) continue; }
    else if (u.status && st !== u.status) continue;
    if (u.group !== '' && L.group !== +u.group) continue;
    if (u.grade && L.grade !== u.grade) continue;
    if (u.area) {
      if (u.area[0] === 'z') { if (L.zone !== +u.area.slice(1)) continue; }
      else if (L.prov !== u.area.slice(2)) continue;
    }
    if (u.chan && !chanFilter(L, u.chan)) continue;
    if (q && !(L.key.includes(q) || (t && t.note && t.note.toLowerCase().includes(q)))) continue;
    out.push(L);
  }
  return out.sort(SORTS[u.sort] || SORTS.score);
}

function buildRow(L) {
  const t = trackOf(L.id);
  const st = (t && STATUS_BY[t.status]) ? t.status : 'new';
  const c = chanOf(L), sg = suggCount(L);
  const sub = [h('span', null, GROUPS[L.group].short), h('span', null, L.prov === NOPROV ? 'ไม่ระบุจังหวัด' : L.prov)];
  if (L.zone >= 0) sub.push(h('span', { class: 'zc', title: 'โซน ' + ZONES[L.zone] }, ZCODE[L.zone]));
  if (L.phone) sub.push(h('span', { class: 'cc', title: 'มีเบอร์โทร' }, 'โทร'));
  if (L.webUrl && !L.webPlat) sub.push(h('span', { class: 'cc', title: 'มีเว็บไซต์' }, 'เว็บ'));
  for (const p of PLATS) if (c[p.k]) sub.push(h('span', { class: 'cc', title: 'มี ' + p.label }, p.code));
  if (sg) sub.push(h('span', { class: 'cc todo', title: 'มีตัวเลือกช่องทางรอตรวจ' }, 'รอตรวจ ' + sg));
  if (t && t.followUp && FOLLOW.has(st)) sub.push(h('span', { class: t.followUp <= today() ? 'due' : null }, 'ตามต่อ ' + fmtDay(t.followUp)));
  return h('button', { class: 'row', type: 'button', role: 'option', 'aria-selected': String(L.id === S.ui.sel), 'data-id': L.id,
    onclick: () => select(L.id, true) },
    h('span', { class: 'gr', 'data-g': L.grade, title: 'เกรด ' + L.grade + ' · ' + L.score + ' คะแนน' }, L.grade),
    h('span', { class: 'nm' }, L.name),
    h('span', { class: 'pill st', 'data-t': st }, h('span', { class: 'dot' }), STATUS_BY[st].label),
    h('span', { class: 'sub' }, sub));
}
function emptyText() {
  const u = S.ui, tab = listTab();
  const filtered = u.q || u.area || u.group !== '' || u.grade || u.chan || (tab === 'all' && u.status);
  if (filtered) return 'ไม่พบ Lead ตามตัวกรองนี้ ลองล้างตัวกรอง';
  if (tab === 'queue') return 'ไม่มี Lead ค้างในคิวแล้ว หารายชื่อใหม่ได้ที่เมนู ค้นจาก Google Maps';
  if (tab === 'follow') return 'ยังไม่มี Lead ที่ต้องตามต่อ เมื่อบันทึกสถานะเป็น ติดต่อไม่ได้ รอตอบกลับ หรือ สนใจ รายการจะมาอยู่ที่นี่';
  return 'ยังไม่มี Lead ในสมุด';
}
/* The search box doubles as the way out to Google Maps: the same words, searched through Apify at one press.
   A province picked in the area filter becomes the search area; otherwise the find tab's own setting is used. */
function askMoreLoc() {
  const a = S.ui.area;
  return (a && a.slice(0, 2) === 'p:' && PROV_EN[a.slice(2)]) ? a.slice(2) : $('#g-loc').value;
}
function renderAskMore() {
  const box = $('#askmore'), q = S.ui.q.trim();
  if (q.length < 2) { box.hidden = true; return; }
  const ready = !!S.mcp && S.mcpState === 'ready' && canEdit();
  const n = mapsCount() || 50, loc = mapsLoc(askMoreLoc()).label;
  const cap = ceil2(n * PRICE_PLACE * 1.15 + 0.01);
  $('#askmore-text').textContent = ready
    ? 'ไม่เจอที่ต้องการในสมุด กดปุ่มนี้แล้ว Apify จะค้นคำนี้จาก Google Maps ทันที พื้นที่ ' + loc + ' สูงสุด ' + fmt(n) + ' ร้าน'
    : 'ไม่เจอที่ต้องการในสมุด ค้นคำนี้ได้ที่เมนู ค้นจาก Google Maps';
  const b = $('#askmore-btn');
  b.textContent = ready ? 'ค้น "' + (q.length > 22 ? q.slice(0, 21) + '…' : q) + '" ด้วย Apify (ไม่เกิน ' + usd(cap) + ')' : 'ไปที่ ค้นจาก Google Maps';
  b.disabled = ready && jobBusy();
  box.hidden = false;
}
function askMoreGo() {
  const q = S.ui.q.trim().slice(0, 80);
  if (q.length < 2) return;
  const loc = askMoreLoc();
  $('#g-q').value = q;
  $('#g-loc').value = loc;
  if (!mapsCount()) $('#g-n').value = '50';
  const ready = !!S.mcp && S.mcpState === 'ready' && canEdit() && !jobBusy();
  setTab('find');
  if (ready) startJob(mapsSpec()); else $('#g-q').focus();
}
function renderList() {
  S.view = computeView();
  if (inFind()) return;
  renderAskMore();
  const box = $('#rows'), n = S.view.length, show = Math.min(n, S.ui.shown);
  const hadFocus = box.contains(document.activeElement), top = box.scrollTop;
  const kids = [];
  for (let i = 0; i < show; i++) kids.push(buildRow(S.view[i]));
  if (!n) kids.push(h('div', { class: 'empty' }, emptyText()));
  if (show < n) kids.push(h('div', { class: 'more' }, h('button', { class: 'btn sm', type: 'button',
    onclick: () => { S.ui.shown += 150; renderList(); } }, 'แสดงเพิ่มอีก ' + fmt(Math.min(150, n - show)) + ' รายการ')));
  box.replaceChildren(...kids);
  box.scrollTop = top;
  if (hadFocus) { const cur = $('.row[aria-selected="true"]', box); if (cur) cur.focus({ preventScroll: true }); }
  const tabNow = listTab();
  $('#list-count').textContent = (show < n ? 'แสดง ' + fmt(show) + ' จาก ' + fmt(n) + ' รายการ' : fmt(n) + ' รายการ')
    + (tabNow === 'queue' ? ' · กลุ่มเป้าหมายที่ยังไม่ติดต่อ' : tabNow === 'follow' ? ' · ติดต่อไม่ได้ รอตอบกลับ หรือสนใจ' : '');
  const on = [S.ui.area, S.ui.group !== '' ? 1 : '', S.ui.grade, S.ui.chan].filter(Boolean).length;
  $('#btn-filters').textContent = on ? 'ตัวกรอง (' + on + ')' : 'ตัวกรอง';
  /* Keep the open card when its lead merely leaves the list (a status change); move on when the user changed the list itself. */
  const selOk = !!(S.ui.sel && S.byId.has(S.ui.sel));
  const inView = selOk && S.view.some(L => L.id === S.ui.sel);
  if (wide() && n && (!selOk || (S.ui.reselect && !inView))) select(S.view[0].id, false);
  S.ui.reselect = false;
}

function select(id, fromUser) {
  flushNote();
  S.ui.sel = id;
  const i = S.view.findIndex(L => L.id === id);
  if (i >= 0) S.ui.selIdx = i;
  for (const r of $$('#rows .row')) r.setAttribute('aria-selected', String(r.dataset.id === id));
  if (S.db && !isKnown(id)) fetchOne(id);
  renderDetail(true);
  if (fromUser && !wide()) openSheet();
}
function step(d) {
  const n = S.view.length;
  if (!n) return;
  let i = S.view.findIndex(L => L.id === S.ui.sel);
  i = i >= 0 ? i + d : (d > 0 ? S.ui.selIdx : S.ui.selIdx - 1);   // a lead that left the list: its slot now holds the next one
  i = Math.max(0, Math.min(n - 1, i));
  if (i >= S.ui.shown) { S.ui.shown = i + 50; renderList(); }
  select(S.view[i].id, false);
  const row = $('#rows .row[aria-selected="true"]');
  if (row && wide()) row.scrollIntoView({ block: 'nearest' });
}
function openSheet() {
  $('#detail').classList.add('open');
  const b = $('#sheet-back');
  if (b) b.focus({ preventScroll: true });
}
function closeSheet() {
  flushNote();
  $('#detail').classList.remove('open');
  const row = $('#rows .row[aria-selected="true"]');
  if (row) row.focus({ preventScroll: true });
}

function setTab(tab, quiet) {
  flushNote();
  S.ui.tab = tab;
  S.ui.reselect = true;
  $('#detail').classList.remove('open');
  if (!FIND_TABS.has(tab)) {
    if (S.ui.listTab !== tab) { S.ui.shown = 150; S.ui.sort = tab === 'follow' ? 'follow' : 'score'; }
    S.ui.listTab = tab;
    if (tab !== 'all') S.ui.status = '';
  }
  $('#f-sort').value = S.ui.sort;
  try { history.replaceState(null, '', '#' + tab); } catch (e) { /* the link just keeps its old anchor */ }
  if (!quiet) { saveUi(); renderAll(); if (FIND_TABS.has(tab)) { refreshFindForms(); $('#view-find').scrollTop = 0; } }
}
function saveUi() {
  const u = S.ui;
  lsSet('leadbook.ui', { tab: u.tab, listTab: u.listTab, area: u.area, group: u.group, grade: u.grade, chan: u.chan, sort: u.sort });
}
function fillFilterOptions() {
  const count = Object.create(null);
  for (const L of S.leads) count[L.prov] = (count[L.prov] || 0) + 1;
  const area = $('#f-area'), keepA = S.ui.area;
  const provs = Object.keys(count).sort((a, b) => count[b] - count[a] || collator.compare(a, b));
  const zoneGroup = h('optgroup', { label: 'โซน' });
  ZONES.forEach((z, i) => zoneGroup.append(h('option', { value: 'z' + i }, z + ' (' + ZCODE[i] + ')')));
  const provGroup = h('optgroup', { label: 'จังหวัด' });
  for (const p of provs) provGroup.append(h('option', { value: 'p:' + p }, (p === NOPROV ? 'ไม่ระบุจังหวัด' : p) + ' · ' + fmt(count[p])));
  area.replaceChildren(h('option', { value: '' }, 'ทุกพื้นที่'), zoneGroup, provGroup);
  area.value = keepA;
  if (area.value !== keepA) { S.ui.area = ''; area.value = ''; }
  const grp = $('#f-group');
  grp.replaceChildren(h('option', { value: '' }, 'ทุกกลุ่ม'), ...GROUPS.map((g, i) => h('option', { value: String(i) }, g.name)));
  grp.value = String(S.ui.group);
  $('#f-grade').value = S.ui.grade;
  $('#f-chan').value = S.ui.chan;
  $('#f-sort').value = S.ui.sort;
  $('#f-q').value = S.ui.q;
}
