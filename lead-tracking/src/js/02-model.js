/* ===================== the lead model ===================== */
const GROUPS = [
  { name: 'คลังสินค้า / พื้นที่จัดเก็บ', short: 'คลังสินค้า' },
  { name: 'Fulfillment / อีคอมเมิร์ซ', short: 'Fulfillment' },
  { name: 'ศูนย์กระจายสินค้าของแบรนด์', short: 'ศูนย์กระจายสินค้า' },
  { name: 'โลจิสติกส์ / ขนส่งสินค้า', short: 'โลจิสติกส์' },
  { name: 'เครือข่ายขนส่งพัสดุ', short: 'ขนส่งพัสดุ' },
  { name: 'ผู้ผลิต / ค้าส่ง / แบรนด์สินค้า', short: 'ผู้ผลิต/แบรนด์' },
  { name: 'อื่น ๆ (อาจไม่เกี่ยวข้อง)', short: 'อื่น ๆ' },
];
const TARGET = new Set([0, 1, 2, 3, 5]);     // groups counted as the target market

const STATUS = [
  { k: 'new', label: 'ยังไม่ติดต่อ' },
  { k: 'no_answer', label: 'ติดต่อไม่ได้' },
  { k: 'waiting', label: 'รอตอบกลับ' },
  { k: 'interested', label: 'สนใจ' },
  { k: 'won', label: 'เป็นลูกค้าแล้ว' },
  { k: 'lost', label: 'ไม่สนใจ' },
  { k: 'invalid', label: 'ข้อมูลไม่ตรง' },
];
const STATUS_BY = Object.create(null);
for (const s of STATUS) STATUS_BY[s.k] = s;
const FOLLOW = new Set(['no_answer', 'waiting', 'interested']);

/* Sales zones: Bangkok and vicinity and the East split out of the four administrative regions. */
const ZONES = ['กรุงเทพฯ และปริมณฑล', 'ภาคตะวันออก', 'ภาคกลางและตะวันตก', 'ภาคเหนือ', 'ภาคอีสาน', 'ภาคใต้'];
const ZCODE = ['BKK', 'E', 'C', 'N', 'NE', 'S'];
const NOPROV = '(ไม่ระบุ)';
const PROV_ROWS = `กรุงเทพมหานคร|0|Bangkok|Krung Thep Maha Nakhon
นนทบุรี|0|Nonthaburi
ปทุมธานี|0|Pathum Thani
สมุทรปราการ|0|Samut Prakan
สมุทรสาคร|0|Samut Sakhon
นครปฐม|0|Nakhon Pathom
ชลบุรี|1|Chon Buri|Chonburi
ระยอง|1|Rayong
ฉะเชิงเทรา|1|Chachoengsao
จันทบุรี|1|Chanthaburi
ตราด|1|Trat
ปราจีนบุรี|1|Prachin Buri|Prachinburi
สระแก้ว|1|Sa Kaeo
พระนครศรีอยุธยา|2|Phra Nakhon Si Ayutthaya|Ayutthaya
อ่างทอง|2|Ang Thong
ลพบุรี|2|Lop Buri|Lopburi
สิงห์บุรี|2|Sing Buri|Singburi
ชัยนาท|2|Chai Nat|Chainat
สระบุรี|2|Saraburi
นครนายก|2|Nakhon Nayok
สุพรรณบุรี|2|Suphan Buri|Suphanburi
สมุทรสงคราม|2|Samut Songkhram
กาญจนบุรี|2|Kanchanaburi
ราชบุรี|2|Ratchaburi
เพชรบุรี|2|Phetchaburi
ประจวบคีรีขันธ์|2|Prachuap Khiri Khan
เชียงใหม่|3|Chiang Mai
เชียงราย|3|Chiang Rai
ลำพูน|3|Lamphun
ลำปาง|3|Lampang
แพร่|3|Phrae
น่าน|3|Nan
พะเยา|3|Phayao
แม่ฮ่องสอน|3|Mae Hong Son
อุตรดิตถ์|3|Uttaradit
ตาก|3|Tak
สุโขทัย|3|Sukhothai
พิษณุโลก|3|Phitsanulok
พิจิตร|3|Phichit
กำแพงเพชร|3|Kamphaeng Phet
เพชรบูรณ์|3|Phetchabun
นครสวรรค์|3|Nakhon Sawan
อุทัยธานี|3|Uthai Thani
กาฬสินธุ์|4|Kalasin
ขอนแก่น|4|Khon Kaen
ชัยภูมิ|4|Chaiyaphum
นครพนม|4|Nakhon Phanom
นครราชสีมา|4|Nakhon Ratchasima|Korat
บึงกาฬ|4|Bueng Kan
บุรีรัมย์|4|Buri Ram|Buriram
มหาสารคาม|4|Maha Sarakham
มุกดาหาร|4|Mukdahan
ยโสธร|4|Yasothon
ร้อยเอ็ด|4|Roi Et
เลย|4|Loei
ศรีสะเกษ|4|Si Sa Ket|Sisaket
สกลนคร|4|Sakon Nakhon
สุรินทร์|4|Surin
หนองคาย|4|Nong Khai
หนองบัวลำภู|4|Nong Bua Lam Phu|Nong Bua Lamphu
อำนาจเจริญ|4|Amnat Charoen
อุดรธานี|4|Udon Thani
อุบลราชธานี|4|Ubon Ratchathani
กระบี่|5|Krabi
ชุมพร|5|Chumphon
ตรัง|5|Trang
นครศรีธรรมราช|5|Nakhon Si Thammarat
นราธิวาส|5|Narathiwat
ปัตตานี|5|Pattani
พังงา|5|Phang Nga|Phangnga
พัทลุง|5|Phatthalung
ภูเก็ต|5|Phuket
ยะลา|5|Yala
ระนอง|5|Ranong
สงขลา|5|Songkhla
สตูล|5|Satun
สุราษฎร์ธานี|5|Surat Thani`;
const PROV_ZONE = Object.create(null);   // Thai name -> zone index
const PROV_EN = Object.create(null);     // Thai name -> English name for a Google Maps search
const PROV_ALIAS = Object.create(null);  // squashed English name -> Thai name
const squash = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
for (const line of PROV_ROWS.split('\n')) {
  const p = line.split('|');
  PROV_ZONE[p[0]] = +p[1];
  PROV_EN[p[0]] = p[2];
  for (let i = 2; i < p.length; i++) PROV_ALIAS[squash(p[i])] = p[0];
}
const PROV_LIST = Object.keys(PROV_ZONE);

function provFromText(s) {
  s = String(s || '').trim().replace(/^จังหวัด\s*/, '').replace(/^จ\.\s*/, '').replace(/^chang\s?wat\s+/i, '').replace(/\s+province$/i, '').trim();
  if (!s) return '';
  if (PROV_ZONE[s] != null) return s;
  const a = PROV_ALIAS[squash(s)];
  if (a) return a;
  if (/^กรุงเทพ/.test(s)) return 'กรุงเทพมหานคร';
  return '';
}
/* Province as Google gave it; when missing, the word right before the postal code in the address. */
function normProvince(state, addr) {
  const s = String(state || '').trim();
  if (s) return provFromText(s) || s.replace(/^จังหวัด\s*/, '');
  if (addr) {
    const th = /([฀-๿.]+)\s+\d{5}(?!\d)/.exec(addr);
    if (th) { const p = provFromText(th[1]); if (p) return p; }
    const en = /,\s*([A-Za-z .'-]+?)\s+\d{5}(?!\d)/.exec(addr);
    if (en) { const p = provFromText(en[1]); if (p) return p; }
  }
  return NOPROV;
}

/* ---- business group: decided from the listing name and its Google Maps category ---- */
const RE_COURIER = /kerry|kex|flash|แฟลช|j&t|shopee|ช้อปปี้|spx|lazada|ลาซาด้า|best express|ninja|dhl|ไปรษณีย์|nim express|นิ่ม|scg express|เคอรี่|เจแอนด์ที/i;
const RE_FULFIL = /fulfil+ment|ฟูลฟิลเมน/i;
const RE_DCWORD = /ศูนย์กระจาย|distribution cent/i;
const RE_WH = /คลัง|โกดัง|warehouse|storage/i;
const RE_LOG = /logistic|โลจิสติก|ขนส่ง|cargo|express/i;
const RE_MAKER = /ค้าส่ง|ผู้ผลิต|โรงงาน|ผู้จำหน่าย|ผู้จัดจำหน่าย|อุตสาหกรรม|การผลิต/;
const RE_WORDCH = /[\p{L}\p{N}_]/u;
const CAT_WH = new Set(['คลังสินค้า', 'โรงจัดเก็บสิ่งของ', 'คลังสินค้าศุลกากร', 'ตู้เช่าเก็บสัมภาระ']);
const CAT_LOG = new Set(['บริการการขนส่ง', 'บริการโลจิสติกส์', 'บริการขนส่งสินค้า', 'บริการการกระจายสินค้า', 'บริษัทนำเข้าส่งออก',
  'บริการจัดส่งพัสดุและไปรษณีย์', 'บริการคูเรียร์', 'ที่ทำการไปรษณีย์', 'ผู้ส่งออก', 'ผู้นำเข้า', 'บริษัทดำเนินกิจการท่าเรือ']);
const CAT_MALL = new Set(['ศูนย์การค้า', 'ไฮเปอร์มาร์เก็ต']);
function hasWordDC(t) {           // "DC" standing alone as a word
  const re = /dc/gi;
  let m;
  while ((m = re.exec(t))) {
    const a = t[m.index - 1], b = t[m.index + 2];
    if (!(a && RE_WORDCH.test(a)) && !(b && RE_WORDCH.test(b))) return true;
  }
  return false;
}
function classify(name, cat) {
  if (RE_COURIER.test(name)) return 4;
  if (RE_FULFIL.test(name) || cat === 'บริการอีคอมเมิร์ซ') return 1;
  if (RE_DCWORD.test(name) || hasWordDC(name)) return 2;
  if (CAT_WH.has(cat) || RE_WH.test(name)) return 0;
  if (CAT_LOG.has(cat) || RE_LOG.test(name)) return 3;
  if (RE_MAKER.test(cat) || cat === 'สำนักงานของบริษัท') return 5;
  return 6;
}

/* ---- online channels ---- */
const PLATS = [
  { k: 'facebook', label: 'Facebook', code: 'FB', site: 'facebook.com', host: /(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch|m\.me)$/i,
    search: q => 'https://www.facebook.com/search/pages/?q=' + enc(q) },
  { k: 'shopee', label: 'Shopee', code: 'SP', site: 'shopee.co.th', host: /(^|\.)(shopee\.co\.th|shopee\.com|shope\.ee)$/i,
    search: q => 'https://shopee.co.th/search_user?keyword=' + enc(q) },
  { k: 'lazada', label: 'Lazada', code: 'LZ', site: 'lazada.co.th', host: /(^|\.)(lazada\.co\.th|lazada\.com)$/i,
    search: q => 'https://www.lazada.co.th/catalog/?q=' + enc(q) },
  { k: 'tiktok', label: 'TikTok', code: 'TT', site: 'tiktok.com', host: /(^|\.)tiktok\.com$/i,
    search: q => 'https://www.tiktok.com/search/user?q=' + enc(q) },
  { k: 'line', label: 'LINE', code: 'LN', site: null, host: /(^|\.)(line\.me|lin\.ee)$/i, search: null },
  { k: 'instagram', label: 'Instagram', code: 'IG', site: 'instagram.com', host: /(^|\.)instagram\.com$/i, search: null },
];
const PLAT = Object.create(null);
for (const p of PLATS) PLAT[p.k] = p;
const AUTO_PLATS = ['facebook', 'shopee', 'lazada', 'tiktok'];   // the ones the automatic search covers
const RE_SOCIAL = /facebook|instagram|line\.me|lin\.ee|tiktok|shopee|lazada|linktr|wa\.me|fb\.com/i;

/* Only http(s) links are ever turned into anchors; stored text is untrusted. */
function safeUrl(u) {
  let s = String(u == null ? '' : u).trim();
  if (!s || /\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    if (/^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(s)) s = 'https://' + s; else return null;
  }
  try {
    const x = new URL(s);
    return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : null;
  } catch (e) { return null; }
}
function platOf(url) {
  try {
    const hst = new URL(url).hostname;
    for (const p of PLATS) if (p.host.test(hst)) return p.k;
  } catch (e) { /* not a url */ }
  return null;
}
function shortUrl(url) {
  try {
    const x = new URL(url);
    let s = x.hostname.replace(/^www\./, '') + decodeURIComponent(x.pathname).replace(/\/$/, '');
    if (x.search && s.length < 28) s += x.search;
    return s.length > 46 ? s.slice(0, 45) + '…' : s;
  } catch (e) { return String(url).slice(0, 46); }
}
function mapsUrl(L) {
  if (/^(ChIJ|GhIJ)/.test(L.id)) return 'https://www.google.com/maps/search/?api=1&query=' + enc(L.name) + '&query_place_id=' + enc(L.id);
  return 'https://www.google.com/maps/search/?api=1&query=' + enc(L.name + (L.prov !== NOPROV ? ' ' + L.prov : ''));
}
function googleUrl(q) { return 'https://www.google.com/search?q=' + enc(q); }

/* The part of a listing name worth searching for: no brackets, no tagline, no generic prefix. */
function searchName(name) {
  let s = String(name || '').replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）/g, ' ');
  s = s.split(/\s[-–—|:]\s|\s@|\|/)[0];
  s = s.replace(/^\s*(สำนักงาน)?\s*(คลังสินค้า|ศูนย์กระจายสินค้า|โกดังสินค้า|โกดัง|คลัง)\s*/, '').replace(/\s+/g, ' ').trim();
  if (s.length < 3) s = String(name || '').replace(/\s+/g, ' ').trim();
  return s.slice(0, 70);
}
const STOP_WORDS = new Set(['warehouse', 'fulfillment', 'fulfilment', 'center', 'centre', 'thailand', 'company', 'limited', 'shop', 'store',
  'express', 'logistics', 'logistic', 'group', 'service', 'services', 'official', 'the', 'and', 'co', 'ltd',
  'คลังสินค้า', 'บริษัท', 'จำกัด', 'ศูนย์กระจายสินค้า', 'สาขา', 'ประเทศไทย', 'มหาชน', 'สำนักงานใหญ่', 'โกดัง']);
function nameTokens(name) {
  const out = [];
  for (const w of searchName(name).toLowerCase().split(/[\s,./&()'"+_-]+/)) {
    if (!w || STOP_WORDS.has(w)) continue;
    if (/^[a-z0-9]+$/.test(w) ? w.length >= 3 : w.length >= 4) out.push(w);
  }
  return out;
}

const FB_SKIP = new Set(['groups', 'events', 'watch', 'marketplace', 'hashtag', 'photo', 'photo.php', 'photos', 'story.php', 'permalink.php',
  'share', 'sharer', 'sharer.php', 'login', 'login.php', 'public', 'search', 'reel', 'reels', 'videos', 'video.php', 'media', 'notes',
  'gaming', 'help', 'policies', 'business', 'ads', 'dialog', 'plugins', 'l.php', 'tr', 'stories', 'places', 'directory', 'legal',
  'privacy', 'terms', 'r.php', 'recover', 'home.php', 'pg']);
const SHOPEE_SKIP = new Set(['search', 'search_user', 'list', 'm', 'mall', 'daily_discover', 'flash_sale', 'buyer', 'user', 'cart',
  'events3', 'blog', 'docs', 'legaldoc', 'web', 'universal-link', 'coins', 'collections', 'top_products', 'find_similar_products']);
const IG_SKIP = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'direct']);
/* Reduce a search-result URL to the page, shop or profile it belongs to. Returns null for pages that are neither. */
function normalizeChan(k, x) {
  const seg = x.pathname.split('/').filter(Boolean);
  if (k === 'facebook') {
    if (!/facebook\.com$/i.test(x.hostname)) return { url: x.href, type: 'link' };
    if (!seg.length) return null;
    const s0 = seg[0].toLowerCase();
    if (s0 === 'profile.php') { const id = x.searchParams.get('id'); return id ? { url: 'https://www.facebook.com/profile.php?id=' + enc(id), type: 'page' } : null; }
    if (s0 === 'p' && seg[1]) return { url: 'https://www.facebook.com/p/' + seg[1] + '/', type: 'page' };
    if (s0 === 'people' && seg[2]) return { url: 'https://www.facebook.com/people/' + seg[1] + '/' + seg[2] + '/', type: 'page' };
    if (s0 === 'pages' && seg[2]) return { url: 'https://www.facebook.com/pages/' + seg[1] + '/' + seg[2] + '/', type: 'page' };
    if (FB_SKIP.has(s0)) return null;
    return { url: 'https://www.facebook.com/' + seg[0] + '/', type: 'page' };
  }
  if (k === 'tiktok') {
    if (/^(vt|vm)\./i.test(x.hostname)) return { url: x.href, type: 'link' };
    return seg[0] && seg[0][0] === '@' ? { url: 'https://www.tiktok.com/' + seg[0], type: 'profile' } : null;
  }
  if (k === 'shopee') {
    if (/shope\.ee$/i.test(x.hostname)) return { url: x.href, type: 'link' };
    if (!seg.length) return null;
    const s0 = seg[0].toLowerCase();
    if ((s0 === 'shop' || s0 === 'product') && /^\d+$/.test(seg[1] || '')) return { url: 'https://shopee.co.th/shop/' + seg[1], type: s0 === 'shop' ? 'shop' : 'item' };
    const item = /-i\.(\d+)\.(\d+)$/.exec(seg[seg.length - 1]);
    if (item) return { url: 'https://shopee.co.th/shop/' + item[1], type: 'item' };
    if (seg.length === 1 && !SHOPEE_SKIP.has(s0)) return { url: 'https://shopee.co.th/' + seg[0], type: 'shop' };
    return null;
  }
  if (k === 'lazada') {
    if (/^s\./i.test(x.hostname)) return { url: x.href, type: 'link' };
    if (seg[0] === 'shop' && seg[1]) return { url: 'https://www.lazada.co.th/shop/' + seg[1] + '/', type: 'shop' };
    if (seg[0] === 'products' && seg[1]) return { url: 'https://www.lazada.co.th/products/' + seg[1], type: 'item' };
    return null;
  }
  if (k === 'instagram') return seg[0] && !IG_SKIP.has(seg[0].toLowerCase()) ? { url: 'https://www.instagram.com/' + seg[0] + '/', type: 'profile' } : null;
  return { url: x.href, type: 'link' };
}
/* A search-result title reduced to the page, shop or account name. */
function cleanTitle(t) {
  return String(t || '')
    .replace(/\s*[|\-–—]\s*(facebook|shopee thailand|shopee|lazada\.co\.th|lazada|tiktok)\b.*$/i, '')
    .replace(/\s*[,|\-–—]?\s*ร้านค้าออนไลน์.*$/, '')
    .replace(/\s*\(@[^)]*\)\s*$/, '')
    .replace(/\s*[|\-–—]\s*(หน้าหลัก|home)\s*$/i, '')
    .split(/\s\|\s/)[0].replace(/\s+/g, ' ').trim();
}
const urlKey = u => String(u || '').toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
/* One Google result inside a platform -> a brand lead, or null when it is not a page, shop or account. */
function brandFromResult(k, r, kw) {
  const u = safeUrl(r && r.url);
  if (!u) return null;
  let x;
  try { x = new URL(u); } catch (e) { return null; }
  if (!PLAT[k] || !PLAT[k].host.test(x.hostname)) return null;
  const norm = normalizeChan(k, x);
  if (!norm || norm.type === 'item' || norm.type === 'link') return null;
  const seg = x.pathname.split('/').filter(Boolean);
  let name = cleanTitle(r && r.title);
  if (k === 'tiktok' && seg.length > 1) name = '';            // a video result: its caption is not the account name
  if (name.length < 2) {
    try { name = decodeURIComponent(seg[k === 'lazada' ? 1 : 0] || ''); } catch (e) { name = seg[0] || ''; }
  }
  if (name.length < 2) return null;
  const key = urlKey(norm.url);
  const raw = { i: 'w_' + hashId(key).toString(36) + hashId(key.split('').reverse().join('')).toString(36), n: name.slice(0, 140), g: 5, sp: k, ch: {} };
  raw.ch[k] = norm.url;
  if (kw) raw.q = String(kw).slice(0, 80);
  return raw;
}
const CAND_LABEL = { page: 'เพจ', shop: 'ร้าน', profile: 'บัญชี', item: 'ร้านของสินค้าที่พบ', link: 'ลิงก์' };
const CAND_RANK = { page: 0, shop: 0, profile: 0, link: 1, item: 2 };

/* ---- phone ---- */
function localPhone(p) {          // "+66 81 234 5678" -> "081 234 5678", the way it is dialled in Thailand
  let s = String(p || '').trim();
  if (!s) return '';
  let extn = '';
  const m = /\s*(?:ext\.?|ต่อ)\s*(.+)$/i.exec(s);
  if (m) { extn = ' ต่อ ' + m[1].trim(); s = s.slice(0, m.index); }
  if (/^\+66\s?/.test(s)) s = '0' + s.replace(/^\+66\s?/, '');
  return s + extn;
}
const phoneDigits = p => localPhone(p).replace(/\s*ต่อ.*$/, '').replace(/[^\d+]/g, '');
const telHref = p => 'tel:' + String(p || '').replace(/\s*(?:ext\.?|ต่อ).*$/i, '').replace(/[^\d+]/g, '');

/* ---- opening hours: seven strings, Sunday first; "x" closed, "24" open all day, "8:00-17:00" otherwise ---- */
const DAY_IDX = { 'วันอาทิตย์': 0, 'วันจันทร์': 1, 'วันอังคาร': 2, 'วันพุธ': 3, 'วันพฤหัสบดี': 4, 'วันศุกร์': 5, 'วันเสาร์': 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
function hoursFromPlace(oh) {
  if (!Array.isArray(oh) || !oh.length) return null;
  const out = ['', '', '', '', '', '', ''];
  for (const d of oh) {
    if (!d) continue;
    const i = DAY_IDX[String(d.day || '').trim().toLowerCase()];
    let v = String(d.hours || '').trim();
    if (i == null || !v) continue;
    if (v === 'ปิดทำการ' || /^closed$/i.test(v)) v = 'x';
    else if (v === 'เปิด 24 ชั่วโมง' || /^open 24 hours$/i.test(v)) v = '24';
    else v = v.replace(/\s+to\s+/gi, '-');
    out[i] = v.slice(0, 40);
  }
  return out.some(Boolean) ? out : null;
}
const hoursText = v => v === 'x' ? 'ปิด' : v === '24' ? 'เปิด 24 ชั่วโมง' : v ? v.replace(/-/g, ' – ') : 'ไม่ระบุ';
function hourRanges(v) {
  if (!v || v === 'x') return [];
  if (v === '24') return [[0, 1440]];
  const out = [];
  for (const r of v.split(',')) {
    const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(r.trim());
    if (m) out.push([+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]]);
  }
  return out;
}
/* true / false, or null when today's hours are not listed */
function openNow(hours) {
  if (!hours) return null;
  const d = bkkNow(), day = d.getUTCDay(), m = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (!hours[day]) return null;
  for (const [a, b] of hourRanges(hours[day])) if (b > a ? (m >= a && m < b) : m >= a) return true;
  for (const [a, b] of hourRanges(hours[(day + 6) % 7])) if (b <= a && m < b) return true;
  return false;
}

/* ---- contact-readiness score, out of 100. Same rules as the Excel workbook's "เกณฑ์คะแนน" sheet. ---- */
function scoreOf(L) {
  const social = L.webType === 'social';
  const parts = [
    { label: 'มีเบอร์โทรศัพท์', pts: 40, ok: !!L.phone },
    { label: social ? 'มีเพจโซเชียลหรือร้านในมาร์เก็ตเพลส (ยังไม่มีเว็บของตัวเอง)' : 'มีเว็บไซต์ของตัวเอง', pts: social ? 15 : 25, ok: L.webType !== 'none' },
    { label: (L.reviews >= 1 && L.reviews < 10) ? 'มีรีวิว 1-9 รายการ' : 'มีรีวิว 10 รายการขึ้นไป', pts: (L.reviews >= 1 && L.reviews < 10) ? 8 : 15, ok: L.reviews >= 1 },
    { label: 'คะแนน Google 4.0 ขึ้นไป', pts: 10, ok: (L.rating || 0) >= 4 },
    { label: 'อยู่ในกลุ่มเป้าหมาย', pts: 10, ok: L.target },
  ];
  let score = 0;
  if (!L.closed) for (const p of parts) if (p.ok) score += p.pts;
  return { score, grade: score >= 75 ? 'A' : score >= 50 ? 'B' : score >= 25 ? 'C' : 'D', parts };
}

/* A stored lead ("raw") keeps short keys: i id, n name, c Google category, st province as given, ct district, a address,
   p phone, w website, r rating, rv review count, x closed for good, t closed for now, q search term, h hours,
   g fixed group (manual leads), ch known channels (manual leads). makeLead adds everything derived. */
function makeLead(raw, src, extra) {
  const name = String(raw.n || '').trim();
  const L = {
    id: String(raw.i), name, cat: raw.c || '', dist: raw.ct || '', addr: raw.a || '', phone: String(raw.p || '').trim(),
    web: raw.w || '', rating: typeof raw.r === 'number' ? raw.r : null, reviews: +raw.rv || 0, closed: !!raw.x, temp: !!raw.t,
    search: raw.q || '', hours: Array.isArray(raw.h) && raw.h.length === 7 ? raw.h : null,
    src, batch: (extra && extra.batch) || null, addedAt: (extra && extra.at) || '', ch0: {},
    srcPlat: PLAT[raw.sp] ? raw.sp : '',
  };
  L.prov = normProvince(raw.st, L.addr);
  L.zone = PROV_ZONE[L.prov] != null ? PROV_ZONE[L.prov] : -1;
  L.group = (Number.isInteger(raw.g) && GROUPS[raw.g]) ? raw.g : classify(name, L.cat);
  L.target = TARGET.has(L.group);
  if (raw.ch && typeof raw.ch === 'object') for (const p of PLATS) if (raw.ch[p.k]) L.ch0[p.k] = String(raw.ch[p.k]);
  L.webUrl = safeUrl(L.web);
  L.webPlat = L.webUrl ? platOf(L.webUrl) : null;
  if (L.webPlat && !L.ch0[L.webPlat]) L.ch0[L.webPlat] = L.webUrl;
  L.webType = L.web ? (RE_SOCIAL.test(L.web) ? 'social' : 'own') : (Object.keys(L.ch0).length ? 'social' : 'none');
  L.phoneType = !L.phone ? 'none' : (/^(\+66|0)[689]/.test(L.phone.replace(/[\s-]/g, '')) ? 'mobile' : 'land');
  const sc = scoreOf(L);
  L.score = sc.score; L.grade = sc.grade; L.parts = sc.parts;
  L.local = localPhone(L.phone);
  L.key = (name + ' ' + L.prov + ' ' + L.dist + ' ' + L.cat + ' ' + GROUPS[L.group].name + ' ' + L.phone + ' ' + L.local + ' ' + L.local.replace(/\D/g, '')).toLowerCase();
  return L;
}
/* One Google Maps Scraper item -> a stored lead. */
function rawFromPlace(it, fallbackQ) {
  if (!it || !it.placeId || !it.title) return null;
  const r = { i: String(it.placeId).slice(0, 120), n: String(it.title).slice(0, 200) };
  if (it.categoryName) r.c = String(it.categoryName).slice(0, 80);
  if (it.state) r.st = String(it.state).slice(0, 60);
  if (it.city) r.ct = String(it.city).slice(0, 80);
  if (it.address) r.a = String(it.address).slice(0, 300);
  const p = String(it.phone || '').trim();
  if (p) r.p = p.slice(0, 60);
  if (it.website) r.w = String(it.website).slice(0, 400);
  if (typeof it.totalScore === 'number') r.r = it.totalScore;
  if (it.reviewsCount > 0) r.rv = +it.reviewsCount;
  if (it.permanentlyClosed) r.x = 1;
  if (it.temporarilyClosed) r.t = 1;
  const q = it.searchString || fallbackQ;
  if (q) r.q = String(q).slice(0, 80);
  const hh = hoursFromPlace(it.openingHours);
  if (hh) r.h = hh;
  return r;
}
