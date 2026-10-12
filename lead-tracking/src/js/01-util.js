/* ===================== helpers ===================== */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const enc = encodeURIComponent;
const STANDALONE = !!window.__STANDALONE;     // the GitHub Pages build: own Apify token, data in this browser
const fmt = n => Number(n || 0).toLocaleString('en-US');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const usd = n => '$' + (Math.round(n * 100) / 100).toFixed(2);
const ceil2 = n => Math.ceil(n * 100 - 1e-9) / 100;
const pad2 = n => String(n).padStart(2, '0');

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'value') e.value = v;
    else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, String(v));
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
/* a link that leaves the app; only http(s) targets are ever rendered */
function ext(url, label, cls) {
  return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: cls || null }, label);
}

/* Times are shown in Thailand time (UTC+7, no daylight saving). */
const BKK = 7 * 3600e3;
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_DAY = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const bkkNow = () => new Date(Date.now() + BKK);          // read it with getUTC*()
const today = () => bkkNow().toISOString().slice(0, 10);
function fmtDay(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? (+m[3]) + ' ' + TH_MON[+m[2] - 1] : '';
}
function fmtStamp(iso) {
  const t = Date.parse(iso);
  if (isNaN(t)) return '';
  const d = new Date(t + BKK);
  return d.getUTCDate() + ' ' + TH_MON[d.getUTCMonth()] + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
}
function fmtClock(ms) {
  const d = new Date(ms + BKK);
  return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
}

let toastTimer = 0;
function toast(msg, ms) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms || 4000);
}
function selectText(el) {
  try {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  } catch (e) { /* nothing to select */ }
}
async function copyText(text, okMsg, fallbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg || 'คัดลอกแล้ว');
  } catch (e) {
    if (fallbackEl) {
      if (typeof fallbackEl.select === 'function') fallbackEl.select(); else selectText(fallbackEl);
    }
    toast('คัดลอกอัตโนมัติไม่ได้ในมุมมองนี้ เลือกข้อความไว้ให้แล้ว กดคัดลอกเองได้');
  }
}
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage is optional */ } }
