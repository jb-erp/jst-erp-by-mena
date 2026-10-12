/* ===================== today's plan, results report ===================== */
S.plan = { daily: 20 };

function applyPlan(d) { if (d && +d.daily > 0) S.plan = { daily: Math.min(500, Math.round(+d.daily)) }; scheduleRender(); }
async function saveDoc(id, d, ls) {
  if (S.db && canEdit()) { await writeOnce(() => S.db.doc('settings/' + id).set(d)); }
  else lsSet(ls, d);
}

/* ---- the day: done today, follow-ups due, then the best of the queue ---- */
const bkkDay = iso => { const t = Date.parse(iso); return isNaN(t) ? '' : new Date(t + BKK).toISOString().slice(0, 10); };
function todayData() {
  const td = today(), done = [], due = [], queue = [];
  for (const L of S.leads) {
    const t = trackOf(L.id), st = statusOf(L.id);
    if (t && Array.isArray(t.log) && t.log.some(e => bkkDay(e.t) === td)) { done.push(L); continue; }
    if (FOLLOW.has(st) && t.followUp && t.followUp <= td) due.push(L);
    else if (inQueue(L, st)) queue.push(L);
  }
  due.sort((a, b) => (trackOf(a.id).followUp < trackOf(b.id).followUp ? -1 : 1) || b.score - a.score);
  const openRank = L => openNow(L.hours) === true ? 0 : openNow(L.hours) == null ? 1 : 2;
  queue.sort((a, b) => b.score - a.score || openRank(a) - openRank(b) || b.reviews - a.reviews);
  const need = Math.max(0, S.plan.daily - done.length);
  return { td, done, due, next: queue.slice(0, Math.max(0, Math.min(60, need - due.length))), need, queueLeft: queue.length };
}
function openLead(id, tab) {
  resetFilters();
  setTab(tab, true);
  S.ui.sort = tab === 'follow' ? 'follow' : 'score';
  $('#f-sort').value = S.ui.sort;
  saveUi();
  renderAll();
  const i = S.view.findIndex(L => L.id === id);
  if (i < 0) { S.ui.sel = id; renderDetail(true); if (!wide()) openSheet(); return; }
  if (i >= S.ui.shown) { S.ui.shown = i + 50; renderList(); }
  select(id, true);
  const row = $('#rows .row[aria-selected="true"]');
  if (row) row.scrollIntoView({ block: 'center' });
}
function todayRow(L, why, tab) {
  const on = openNow(L.hours);
  return h('li', null, h('button', { class: 'trow', type: 'button', onclick: () => openLead(L.id, tab) },
    h('span', { class: 'gr', 'data-g': L.grade }, L.grade),
    h('span', { class: 'tr-main' },
      h('span', { class: 'tr-name' }, L.name),
      h('span', { class: 'tr-sub' }, why, L.prov !== NOPROV ? ' · ' + L.prov : '', on === true ? [' · ', h('span', { class: 'open-y' }, 'เปิดอยู่ตอนนี้')] : on === false ? ' · ตอนนี้ปิด' : '')),
    h('span', { class: 'tr-phone num' }, L.local || 'ไม่มีเบอร์')));
}
function renderToday() {
  const d = todayData(), goal = S.plan.daily, pct = Math.min(100, d.done.length / goal * 100);
  const day = bkkNow();
  $('#today-h').textContent = 'แผนงานวัน' + TH_DAY[day.getUTCDay()] + 'ที่ ' + day.getUTCDate() + ' ' + TH_MON[day.getUTCMonth()];
  const fill = h('div', { class: 'u-fill' });
  fill.style.width = pct.toFixed(1) + '%';
  const inp = $('#plan-daily');
  if (document.activeElement !== inp) inp.value = String(goal);
  $('#today-goal').replaceChildren(
    h('div', { class: 'tg-num' }, h('span', { class: 'big num' }, fmt(d.done.length)), h('span', null, ' / ' + fmt(goal) + ' ราย ติดต่อแล้ววันนี้')),
    h('div', { class: 'u-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(goal), 'aria-valuenow': String(d.done.length), 'aria-label': 'ความคืบหน้าวันนี้' }, fill),
    h('div', { class: 'hint', style: 'margin:0' }, d.done.length >= goal ? 'ครบเป้าวันนี้แล้ว ทำต่อได้จากคิวติดต่อ' : 'เหลืออีก ' + fmt(goal - d.done.length) + ' ราย นับรายที่บันทึกสถานะวันนี้'));
  const sec = (title, note, list, why, tab, empty) => h('section', { class: 'tsec' },
    h('h3', null, title, h('span', { class: 'n' }, fmt(list.length))), note ? h('p', { class: 'hint' }, note) : null,
    list.length ? h('ol', { class: 'tlist' }, list.map(L => todayRow(L, why(L), tab))) : h('p', { class: 'hint' }, empty));
  $('#today-lists').replaceChildren(
    sec('ถึงกำหนดตามต่อ', 'นัดตามต่อที่ถึงวันแล้ว ทำก่อน', d.due, L => 'นัด ' + fmtDay(trackOf(L.id).followUp) + ' · ' + STATUS_BY[statusOf(L.id)].label, 'follow', 'ไม่มีนัดตามต่อที่ถึงกำหนด'),
    sec('ติดต่อรายใหม่', 'เรียงจากคะแนนสูงสุด รายที่เปิดทำการอยู่ตอนนี้ขึ้นก่อนเมื่อคะแนนเท่ากัน', d.next, L => 'เกรด ' + L.grade + ' · ' + GROUPS[L.group].short, 'queue',
      d.need <= d.due.length ? 'วันนี้งานตามนัดครบเป้าแล้ว' : 'ไม่มี Lead ค้างในคิว หาเพิ่มได้ที่เมนู ค้นจาก Google Maps'),
    sec('ทำแล้ววันนี้', '', d.done, L => STATUS_BY[statusOf(L.id)].label, 'all', 'ยังไม่มี กดรายชื่อด้านบนเพื่อเริ่มโทร แล้วบันทึกสถานะในหน้ารายละเอียด'));
}
async function savePlan() {
  const v = Math.round(+$('#plan-daily').value);
  if (!(v >= 1 && v <= 500)) { toast('ใส่เป้าเป็นตัวเลข 1 ถึง 500'); return; }
  const d = { daily: v, updatedAt: new Date().toISOString(), by: S.uid || null };
  try { await saveDoc('plan', d, 'leadbook.plan'); } catch (e) { onDbError(e, 'save'); return; }
  applyPlan(d);
  toast('ตั้งเป้าวันละ ' + v + ' ราย');
}

/* ---- results report ---- */
const REACHED = new Set(['waiting', 'interested', 'won', 'lost']);
function reportData() {
  const g = GROUPS.map(x => ({ name: x.name, n: 0, c: 0, i: 0 })), prov = Object.create(null), term = Object.create(null);
  let contacted = 0, reached = 0, interested = 0, won = 0, tg = 0;
  const days = [];
  for (let k = 13; k >= 0; k--) days.push({ d: new Date(Date.now() + BKK - k * 864e5).toISOString().slice(0, 10), n: 0 });
  const dayIdx = Object.fromEntries(days.map((x, k) => [x.d, k]));
  for (const L of S.leads) {
    const st = statusOf(L.id), t = trackOf(L.id);
    const isC = st !== 'new', isI = st === 'interested' || st === 'won';
    if (L.target) tg++;
    if (isC) contacted++;
    if (REACHED.has(st)) reached++;
    if (isI) interested++;
    if (st === 'won') won++;
    const gg = g[L.group]; gg.n++; if (isC) gg.c++; if (isI) gg.i++;
    const p = prov[L.prov] || (prov[L.prov] = { name: L.prov === NOPROV ? 'ไม่ระบุจังหวัด' : L.prov, n: 0, c: 0, i: 0 }); p.n++; if (isC) p.c++; if (isI) p.i++;
    const q = L.search || (L.src === 'manual' ? 'เพิ่มเอง' : '');
    if (q) { const e = term[q] || (term[q] = { name: q, n: 0, c: 0, i: 0 }); e.n++; if (isC) e.c++; if (isI) e.i++; }
    if (t && Array.isArray(t.log)) for (const e of t.log) { const k = dayIdx[bkkDay(e.t)]; if (k != null) days[k].n++; }
  }
  return { contacted, reached, interested, won, tg, total: S.leads.length, days, groups: g.filter(x => x.n),
    provs: Object.values(prov).sort((a, b) => b.c - a.c || b.n - a.n).slice(0, 8),
    terms: Object.values(term).sort((a, b) => b.i - a.i || b.c - a.c || b.n - a.n).slice(0, 8) };
}
const pctTxt = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
function kpi(label, value, sub) { return h('div', { class: 'kpi' }, h('div', { class: 'kpi-v num' }, value), h('div', { class: 'kpi-l' }, label), sub ? h('div', { class: 'kpi-s' }, sub) : null); }
function barTable(title, rows, note) {
  return h('section', { class: 'rsec' }, h('h3', null, title), note ? h('p', { class: 'hint' }, note) : null,
    rows.length ? h('table', { class: 'btab' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'r' }, 'ทั้งหมด'), h('th', { class: 'r' }, 'ติดต่อแล้ว'), h('th', { class: 'r' }, 'สนใจ'), h('th', { class: 'bar-h' }, 'สัดส่วนที่ติดต่อแล้ว'))),
      h('tbody', null, rows.map(r => {
        const w = h('span', { class: 'bfill' }), w2 = h('span', { class: 'bdone' });
        w2.style.width = (r.n ? r.c / r.n * 100 : 0).toFixed(1) + '%';
        w.append(w2);
        return h('tr', { title: r.name + ': ติดต่อแล้ว ' + r.c + ' จาก ' + r.n + ' · สนใจ ' + r.i },
          h('td', { class: 'nm' }, r.name), h('td', { class: 'r num' }, fmt(r.n)), h('td', { class: 'r num' }, fmt(r.c)), h('td', { class: 'r num' }, fmt(r.i)),
          h('td', { class: 'bar-c' }, h('span', { class: 'btrack' }, w), h('span', { class: 'bpct num' }, pctTxt(r.c, r.n))));
      }))) : h('p', { class: 'hint' }, 'ยังไม่มีข้อมูล'));
}
function renderReport() {
  const d = reportData();
  $('#rep-kpis').replaceChildren(
    kpi('ติดต่อแล้ว', fmt(d.contacted), pctTxt(d.contacted, d.total) + ' ของทั้งหมด ' + fmt(d.total) + ' ราย'),
    kpi('คุยได้', fmt(d.reached), pctTxt(d.reached, d.contacted) + ' ของที่ติดต่อ'),
    kpi('สนใจหรือเป็นลูกค้า', fmt(d.interested), pctTxt(d.interested, d.reached) + ' ของที่คุยได้'),
    kpi('เป็นลูกค้าแล้ว', fmt(d.won), pctTxt(d.won, d.interested) + ' ของที่สนใจ'));
  const max = Math.max(1, ...d.days.map(x => x.n)), td = today();
  $('#rep-days').replaceChildren(...d.days.map((x, k) => {
    const b = h('span', { class: 'dbar' + (x.d === td ? ' now' : '') });
    b.style.height = (x.n / max * 100).toFixed(1) + '%';
    const showVal = x.n && (x.n === max || x.d === td);
    return h('div', { class: 'dcol', title: fmtDay(x.d) + ': ' + x.n + ' ครั้ง' },
      h('span', { class: 'dval num' }, showVal ? String(x.n) : ''), h('span', { class: 'dplot' }, b),
      h('span', { class: 'dlab' }, (k % 2 === 1 || x.d === td) ? fmtDay(x.d) : ''));
  }));
  $('#rep-days-note').textContent = 'จำนวนครั้งที่บันทึกสถานะต่อวัน 14 วันล่าสุด รวม ' + fmt(d.days.reduce((a, x) => a + x.n, 0)) + ' ครั้ง';
  $('#rep-tables').replaceChildren(
    barTable('แยกตามกลุ่มธุรกิจ', d.groups),
    barTable('จังหวัดที่ติดต่อมากที่สุด', d.provs),
    barTable('คำค้นที่ได้ผล', d.terms, 'เรียงจากจำนวนรายที่สนใจ ใช้ดูว่าคำค้นไหนควรค้นเพิ่ม'));
}
