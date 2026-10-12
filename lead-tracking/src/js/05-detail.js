/* ===================== detail: one lead as a consignment note ===================== */
let noteTimer = 0, noteDraft = null;      // noteDraft: { id, value } typed but not yet handed to patch()
function noteInput(id, value) {
  noteDraft = { id, value };
  clearTimeout(noteTimer);
  noteTimer = setTimeout(flushNote, 900);
}
function flushNote() {
  clearTimeout(noteTimer);
  if (!noteDraft) return;
  const d = noteDraft;
  noteDraft = null;
  const cur = (trackOf(d.id) || {}).note || '';
  if (d.value !== cur) patch(d.id, { set: { note: d.value } });
}
function setStatus(id, k) {
  if (statusOf(id) === k) return;
  flushNote();
  patch(id, { set: { status: k }, log: [{ t: new Date().toISOString(), s: k }] });
}
function saveChannel(id, k, value) {
  const L = S.byId.get(id);
  if (!L) return;
  let v = String(value || '').trim();
  if (v && k !== 'line') {
    const u = safeUrl(v);
    if (!u) { toast('ลิงก์ ' + PLAT[k].label + ' ไม่ถูกต้อง วางลิงก์ที่ขึ้นต้นด้วย https://'); renderDetail(true); return; }
    v = u;
  }
  const cur = chanOf(L)[k] || '';
  if (v === cur) return;
  if (!v && L.ch0[k]) { toast('ช่องทางนี้มาจากข้อมูลต้นทาง ใส่ลิงก์ใหม่ทับได้ แต่ลบออกไม่ได้'); renderDetail(true); return; }
  patch(id, { ch: { [k]: v } });
  toast(v ? 'บันทึก ' + PLAT[k].label + ' แล้ว' : 'ลบ ' + PLAT[k].label + ' แล้ว');
  setTimeout(() => renderDetail(true), 0);     // after focus has settled, so the row shows its "open" link
}

function navBtn(d) {
  const i = S.view.findIndex(L => L.id === S.ui.sel);
  const n = S.view.length;
  const off = !n || (i >= 0 && (d < 0 ? i === 0 : i === n - 1)) || (i < 0 && d < 0 && S.ui.selIdx <= 0);
  return h('button', { class: 'btn sm', type: 'button', disabled: off, onclick: () => step(d) }, d < 0 ? 'ก่อนหน้า' : 'ถัดไป');
}

function buildContact(L) {
  const cells = h('div', { class: 'cells' });
  /* phone */
  const pc = h('div', { class: 'cell' }, h('div', { class: 'k' }, 'โทรศัพท์'));
  if (L.phone) {
    const num = h('a', { class: 'phone', href: telHref(L.phone) }, L.local);
    pc.append(h('div', { class: 'phoneline' }, num,
      h('button', { class: 'btn sm', type: 'button', onclick: () => copyText(phoneDigits(L.phone), 'คัดลอกเบอร์แล้ว', num) }, 'คัดลอกเบอร์')),
      h('div', { class: 's' }, L.phoneType === 'mobile' ? 'เบอร์มือถือ อาจเป็นเบอร์ส่วนตัวของเจ้าของ' : 'เบอร์สำนักงาน'));
  } else pc.append(h('div', { class: 's' }, 'ไม่มีเบอร์ในข้อมูลต้นทาง ลองช่องทางออนไลน์ด้านล่าง'));
  cells.append(pc);
  /* area */
  const place = [L.dist, L.prov === NOPROV ? '' : L.prov].filter(Boolean).join(' ') || 'ไม่ระบุจังหวัด';
  const ac = h('div', { class: 'cell' }, h('div', { class: 'k' }, 'พื้นที่'),
    h('div', null, place, L.zone >= 0 ? [' ', h('span', { class: 'zc', title: 'โซน ' + ZONES[L.zone] }, ZCODE[L.zone])] : null));
  if (L.addr) ac.append(h('div', { class: 's' }, L.addr.replace(/\s*ไทย$/, '')));
  ac.append(h('div', { class: 's' }, ext(mapsUrl(L), 'เปิดใน Google Maps')));
  cells.append(ac);
  /* hours */
  if (L.hours) {
    const day = bkkNow().getUTCDay(), on = openNow(L.hours);
    const hc = h('div', { class: 'cell' }, h('div', { class: 'k' }, 'เวลาทำการวันนี้ (วัน' + TH_DAY[day] + ')'),
      h('div', null, hoursText(L.hours[day]), on == null ? null : [' · ', h('span', { class: on ? 'open-y' : 'open-n' }, on ? 'ตอนนี้เปิดอยู่' : 'ตอนนี้ปิด')]));
    const tb = h('table', null, h('tbody', null, L.hours.map((v, i) => h('tr', { 'data-today': i === day ? '1' : null }, h('td', null, 'วัน' + TH_DAY[i]), h('td', { class: 'num' }, hoursText(v))))));
    hc.append(h('details', { class: 'week' }, h('summary', null, 'ดูทั้งสัปดาห์'), tb));
    cells.append(hc);
  }
  /* google listing */
  const gc = h('div', { class: 'cell' }, h('div', { class: 'k' }, 'ข้อมูลจาก Google Maps'));
  if (L.src === 'manual') gc.append(h('div', { class: 's' }, 'รายการที่เพิ่มเอง ไม่มีข้อมูลจาก Google Maps'));
  else if (L.src === 'web') {
    gc.firstChild.textContent = 'ที่มา';
    gc.append(h('div', null, 'พบจากการค้นใน ' + (L.srcPlat ? PLAT[L.srcPlat].label : 'แพลตฟอร์มออนไลน์')),
      h('div', { class: 's' }, (L.search ? 'คำค้น "' + L.search + '" ' : '') + 'ชื่อมาจากหัวข้อของผลค้นหา ตรวจกับหน้าจริงก่อนติดต่อ'));
  } else {
    gc.append(h('div', null, L.rating != null ? 'คะแนน ' + L.rating.toFixed(1) + ' จาก ' + fmt(L.reviews) + ' รีวิว' : 'ยังไม่มีรีวิว'));
    if (L.cat) gc.append(h('div', { class: 's' }, 'ประเภท: ' + L.cat));
    if (L.search) gc.append(h('div', { class: 's' }, 'พบจากคำค้น "' + L.search + '"'));
  }
  cells.append(gc);
  return h('section', { class: 't-sec' }, h('h3', null, 'ติดต่อ'), cells);
}

function buildChannels(L, can) {
  const c = chanOf(L), sg = suggOf(L) || {};
  const q0 = S.chq[L.id] != null ? S.chq[L.id] : searchName(L.name);
  const sec = h('section', { class: 't-sec', id: 'sec-ch' }, h('h3', null, 'ช่องทางออนไลน์'));
  const qInput = h('input', { class: 'field', id: 'ch-q', type: 'text', value: q0, maxlength: '80' });
  sec.append(h('div', { class: 'chq' }, h('label', { for: 'ch-q' }, 'คำที่ใช้ค้นหาเพจหรือร้านของรายนี้ แก้ให้สั้นลงได้'), qInput));
  if (L.webUrl && !L.webPlat) sec.append(h('div', { class: 'ch' }, h('span', { class: 'lab' }, 'เว็บไซต์'), h('span', { class: 'val' }, ext(L.webUrl, shortUrl(L.webUrl))), h('span', { class: 'acts' })));
  for (const p of PLATS) {
    if (p.k === 'instagram' && !c.instagram) continue;
    const val = c[p.k] || '', url = safeUrl(val);
    const input = h('input', { class: 'field', id: 'ch-' + p.k, type: 'text', value: val, maxlength: '400', disabled: !can,
      placeholder: p.k === 'line' ? 'วาง @ไอดี หรือลิงก์ LINE' : 'วางลิงก์ที่พบ',
      onchange: e => saveChannel(L.id, p.k, e.target.value),
      onkeydown: e => { if (e.key === 'Enter') e.target.blur(); } });
    const acts = h('span', { class: 'acts' });
    if (url) acts.append(ext(url, 'เปิด'));
    if (p.search) { const a = ext(p.search(q0.trim() || L.name), 'ค้นหาใน ' + p.label); a.dataset.search = p.k; acts.append(a); }
    const row = h('div', { class: 'ch' }, h('label', { class: 'lab', for: 'ch-' + p.k }, p.label), input, acts);
    const list = sg[p.k];
    if (list && list.length) {
      row.append(h('div', { class: 'sg' }, list.map(cand => h('div', { class: 'sg-item' },
        ext(cand.u, cand.t || shortUrl(cand.u)),
        h('span', { class: 'why' }, (CAND_LABEL[cand.y] || 'ลิงก์') + (cand.m ? ' · ชื่อตรงกับคำค้น' : ' · ชื่อไม่ตรง ตรวจให้ดี')),
        can ? h('button', { class: 'linkbtn', type: 'button', onclick: () => { patch(L.id, { ch: { [p.k]: cand.u } }); toast('บันทึก ' + p.label + ' แล้ว'); } }, 'ใช้ลิงก์นี้') : null,
        can ? h('button', { class: 'linkbtn', type: 'button', onclick: () => patch(L.id, { dis: [cand.u] }) }, 'ไม่ใช่') : null))));
    }
    sec.append(row);
  }
  const foot = h('div', { class: 'ch-foot' });
  const g = ext(googleUrl((q0.trim() || L.name) + (L.prov !== NOPROV ? ' ' + L.prov : '')), 'ค้นชื่อนี้ใน Google');
  g.id = 'ch-google';
  foot.append(g);
  const need = AUTO_PLATS.filter(k => !c[k] && !(sg[k] && sg[k].length) && !(S.searched[L.id] && S.searched[L.id][k]));
  const doneAll = AUTO_PLATS.every(k => c[k] || (S.searched[L.id] && S.searched[L.id][k]));
  if (S.mcp && can && need.length) {
    foot.append(h('button', { class: 'btn sm', type: 'button', id: 'ch-auto', disabled: jobBusy(),
      title: 'ค้น Google ผ่าน Apify แล้วเสนอลิงก์ให้ตรวจ',
      onclick: () => startJob(chanSpec([{ id: L.id, q: (qInput.value.trim() || searchName(L.name)).slice(0, 70), pl: need }])) },
      'ค้นหาอัตโนมัติ ' + need.length + ' แพลตฟอร์ม (ประมาณ ' + usd(need.length * PRICE_SERP) + ')'));
  } else if (doneAll && !Object.keys(sg).length && AUTO_PLATS.some(k => !c[k])) {
    foot.append(h('span', null, 'ค้นอัตโนมัติแล้ว ไม่พบช่องทางเพิ่ม'));
  }
  sec.append(foot);
  qInput.addEventListener('input', () => {
    S.chq[L.id] = qInput.value;
    const q = qInput.value.trim() || L.name;
    for (const a of $$('a[data-search]', sec)) a.href = PLAT[a.dataset.search].search(q);
    g.href = googleUrl(q + (L.prov !== NOPROV ? ' ' + L.prov : ''));
  });
  return sec;
}

function trackMeta(t) {
  if (!t || !t.updatedAt) return 'ยังไม่มีการบันทึกสำหรับรายนี้';
  return 'อัปเดตล่าสุด ' + fmtStamp(t.updatedAt) + ' น.' + (t.by && S.uid && t.by !== S.uid ? ' โดยผู้ใช้อีกคน' : '');
}
function buildLog(t) {
  const log = (t && t.log) || [];
  if (!log.length) return [h('li', null, 'ยังไม่มีประวัติการเปลี่ยนสถานะ')];
  return log.slice().reverse().map(e => h('li', null, h('span', { class: 'num' }, fmtStamp(e.t)), (STATUS_BY[e.s] || { label: e.s }).label));
}
function buildTracking(L, t, st, can) {
  const sec = h('section', { class: 't-sec', id: 'sec-trk' }, h('h3', null, 'ผลการติดต่อ'));
  if (!S.db) sec.append(h('div', { class: 'note' }, S.dbState === 'connecting' ? 'กำลังเชื่อมต่อที่เก็บข้อมูล อีกสักครู่จะบันทึกได้' : 'มุมมองนี้บันทึกไม่ได้ เปิดหน้านี้ใน Claude ด้วยบัญชีที่มีสิทธิ์แก้ไขเพื่อบันทึกผลการติดต่อ'));
  else if (!can) sec.append(h('div', { class: 'note' }, 'คุณมีสิทธิ์ดูอย่างเดียว เจ้าของหน้านี้ปรับสิทธิ์ให้แก้ไขได้จากเมนูแชร์'));
  const off = !can || !isKnown(L.id);
  const set = h('div', { class: 'stset', role: 'group', 'aria-label': 'สถานะการติดต่อ' });
  for (const s of STATUS) {
    set.append(h('button', { class: 'stbtn', type: 'button', 'data-t': s.k, 'data-k': s.k, 'aria-pressed': String(st === s.k), disabled: off,
      onclick: () => setStatus(L.id, s.k) }, h('span', { class: 'dot' }), s.label));
  }
  sec.append(set);
  if (can && !inFind() && S.view.length && !S.view.some(x => x.id === L.id)) {
    sec.append(h('div', { class: 'ch-foot' }, h('span', null, 'รายนี้ออกจากรายการที่เปิดอยู่แล้ว'),
      h('button', { class: 'btn sm primary', type: 'button', id: 'trk-next', onclick: () => step(1) }, 'ไปรายถัดไป')));
  }
  const fu = h('input', { class: 'field', id: 'trk-follow', type: 'date', value: (t && t.followUp) || '', min: '2020-01-01', max: '2099-12-31', disabled: off,
    onchange: e => { if (!e.target.value || e.target.validity.valid) patch(L.id, { set: { followUp: e.target.value || '' } }); } });
  const note = h('textarea', { class: 'field', id: 'trk-note', rows: '4', maxlength: '4000', disabled: off,
    value: (noteDraft && noteDraft.id === L.id) ? noteDraft.value : ((t && t.note) || ''),
    placeholder: 'เช่น คุยกับใคร สนใจเรื่องอะไร ให้ติดต่อกลับเมื่อไหร่',
    oninput: e => noteInput(L.id, e.target.value), onblur: flushNote });
  sec.append(h('div', { class: 'trk' },
    h('label', null, 'วันนัดตามต่อ', fu),
    h('label', { class: 'wide' }, 'โน้ต', note)),
    h('div', { class: 'trk-meta', id: 'trk-meta' }, trackMeta(t)));
  return sec;
}

function buildDetail(L) {
  const t = trackOf(L.id), st = (t && STATUS_BY[t.status]) ? t.status : 'new', can = canEdit();
  const flags = [];
  if (L.closed) flags.push(h('span', { class: 'pill', 'data-t': 'lost' }, 'ปิดถาวรตาม Google Maps'));
  if (L.temp) flags.push(h('span', { class: 'pill', 'data-t': 'invalid' }, 'ปิดชั่วคราว'));
  if (!L.target) flags.push(h('span', { class: 'pill' }, 'ไม่นับเป็นกลุ่มเป้าหมาย'));
  if (L.src === 'manual') flags.push(h('span', { class: 'pill' }, 'เพิ่มเอง ' + fmtStamp(L.addedAt)));
  if (L.src === 'gmaps') flags.push(h('span', { class: 'pill' }, 'เพิ่มจากการค้นหา ' + fmtStamp(L.addedAt)));
  if (L.src === 'web') flags.push(h('span', { class: 'pill' }, 'เพิ่มจากการค้นแบรนด์ ' + fmtStamp(L.addedAt)));
  const head = h('header', { class: 't-head' },
    h('div', { class: 't-code' }, h('span', { class: 'gr big', 'data-g': L.grade, title: 'เกรดความพร้อมติดต่อ' }, L.grade), h('span', { class: 't-score' }, L.score + ' / 100')),
    h('div', null, h('h2', { class: 't-name' }, L.name), h('div', { class: 't-meta' }, GROUPS[L.group].name), flags.length ? h('div', { class: 't-flags' }, flags) : null),
    h('div', { class: 't-nav' }, navBtn(-1), navBtn(1)));
  const why = h('section', { class: 't-sec' }, h('h3', null, 'ที่มาของเกรด ' + L.grade),
    L.closed ? h('div', { class: 'note' }, 'ร้านที่ปิดถาวรได้ 0 คะแนน') : null,
    h('ul', { class: 'why' }, L.parts.map(p => h('li', { 'data-ok': p.ok ? '1' : '0' }, h('span', { class: p.ok ? 'tick' : 'dash', 'aria-hidden': 'true' }), h('span', null, p.label), h('span', { class: 'pts' }, p.ok ? '+' + p.pts : '0')))),
    h('div', { class: 'trk-meta' }, 'A ตั้งแต่ 75 · B ตั้งแต่ 50 · C ตั้งแต่ 25 คะแนน วัดว่าติดต่อได้ง่ายแค่ไหน ไม่ได้วัดขนาดธุรกิจ'));
  const logSec = h('section', { class: 't-sec' }, h('h3', null, 'ประวัติสถานะ'), h('ul', { class: 'log', id: 'trk-log' }, buildLog(t)));
  if (L.src === 'manual' && can) {
    logSec.append(h('div', { class: 'ch-foot' }, h('button', { class: 'linkbtn', type: 'button', id: 'btn-del-lead', onclick: e => confirmThen(e.target, 'ยืนยันลบ Lead นี้', () => removeManual(L)) }, 'ลบ Lead ที่เพิ่มเองนี้')));
  }
  return h('article', { class: 'ticket' },
    h('div', { class: 'sheetbar' }, h('button', { class: 'btn sm', type: 'button', id: 'sheet-back', onclick: closeSheet }, 'กลับไปที่รายชื่อ'), h('span', { class: 't-nav' }, navBtn(-1), navBtn(1))),
    head, buildContact(L), buildChannels(L, can), buildTracking(L, t, st, can), why, logSec);
}
/* a destructive action asks once more, in place: the button changes its own label and acts on the second press */
function confirmThen(btn, label, fn) {
  if (btn.dataset.armed === '1') { fn(); return; }
  btn.dataset.armed = '1';
  btn.dataset.orig = btn.textContent;
  btn.textContent = label;
  setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = btn.dataset.orig; } }, 5000);
}
async function removeManual(L) {
  if (!L.batch || !S.db) return;
  try { await S.db.doc('batches/' + L.batch).delete(); toast('ลบ Lead แล้ว'); S.ui.sel = null; closeSheet(); }
  catch (e) { onDbError(e, 'save'); }
}

function renderDetail(force) {
  const box = $('#detail');
  const L = S.ui.sel ? S.byId.get(S.ui.sel) : null;
  if (!L) {
    box.dataset.id = '';
    box.classList.remove('open');
    box.replaceChildren(h('div', { class: 'blank' }, S.loaded ? 'เลือก Lead จากรายชื่อเพื่อดูช่องทางติดต่อและบันทึกผลการติดต่อ' : 'กำลังโหลดรายชื่อ…'));
    return;
  }
  const ae = document.activeElement;
  const inside = ae && box.contains(ae);
  const typing = inside && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
  const same = box.dataset.id === L.id;
  if (!force && same && typing) {       // do not rebuild under the cursor: refresh the read-only parts only
    const t = trackOf(L.id), st = (t && STATUS_BY[t.status]) ? t.status : 'new';
    for (const b of $$('.stbtn', box)) b.setAttribute('aria-pressed', String(b.dataset.k === st));
    const meta = $('#trk-meta', box), log = $('#trk-log', box);
    if (meta) meta.textContent = trackMeta(t);
    if (log) log.replaceChildren(...buildLog(t));
    return;
  }
  const pos = S.view.findIndex(x => x.id === L.id);
  const sig = [L.id, JSON.stringify(trackOf(L.id)), JSON.stringify(S.sugg[L.id] || 0), JSON.stringify(S.searched[L.id] || 0),
    canEdit(), isKnown(L.id), !!S.mcp, S.scriptsVer || 0, jobBusy(), S.dbState, pos, S.view.length, L.score, L.batch || ''].join('|');
  if (!force && same && box.dataset.sig === sig) return;      // nothing this card shows has changed
  box.dataset.sig = sig;
  const top = box.scrollTop;
  const refocus = inside ? (ae.id ? '#' + ae.id : (ae.dataset && ae.dataset.k) ? '.stbtn[data-k="' + ae.dataset.k + '"]' : '') : '';
  const weekOpen = !!$('details.week[open]', box);
  box.dataset.id = L.id;
  box.replaceChildren(buildDetail(L));
  box.scrollTop = same ? top : 0;
  if (same && weekOpen) { const d = $('details.week', box); if (d) d.open = true; }
  if (same && refocus) { const el = $(refocus, box); if (el && !el.disabled) el.focus({ preventScroll: true }); }
}
