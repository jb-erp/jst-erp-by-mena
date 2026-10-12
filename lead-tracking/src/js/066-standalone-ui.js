/* ===================== GitHub Pages build: token, lead file, backup ===================== */
function renderDataInfo() {
  if (!STANDALONE) return;
  const n = S.base.length, added = S.leads.length - S.base.length;
  $('#data-info').replaceChildren(h('dl', { class: 'kv' },
    h('dt', null, 'รายชื่อจากไฟล์'), h('dd', null, n ? fmt(n) + ' ราย' : 'ยังไม่ได้นำเข้า'),
    h('dt', null, 'เพิ่มจากการค้นหาหรือเพิ่มเอง'), h('dd', null, fmt(added) + ' ราย'),
    h('dt', null, 'Apify token'), h('dd', null, window.__ltpl.hasToken() ? 'ใส่แล้วในเครื่องนี้' : 'ยังไม่ได้ใส่')));
}
function readJsonFile(input) {
  return new Promise((ok, bad) => {
    const f = input.files && input.files[0];
    if (!f) return bad(new Error('no file'));
    const r = new FileReader();
    r.onload = () => { try { ok(JSON.parse(r.result)); } catch (e) { bad(e); } };
    r.onerror = () => bad(r.error);
    r.readAsText(f);
  });
}
function wireStandalone() {
  $('#ap-save').addEventListener('click', () => {
    const t = $('#ap-token').value.trim();
    if (!/^[A-Za-z0-9_\-]{20,200}$/.test(t)) { toast('token ไม่ถูกรูปแบบ คัดลอกจากหน้า Integrations ของ Apify อีกครั้ง'); return; }
    window.__ltpl.setToken(t);
    $('#ap-token').value = '';
    S.mcpState = 'pending'; renderFind(true);
    checkApify().then(() => toast(S.mcpState === 'ready' ? 'เชื่อมต่อ Apify ด้วย token นี้ได้แล้ว' : 'Apify ไม่รับ token นี้ ตรวจแล้วใส่ใหม่'));
  });
  $('#ap-remove').addEventListener('click', e => confirmThen(e.target, 'ยืนยันลบ token', () => {
    window.__ltpl.setToken('');
    S.mcpState = 'missing'; renderFind(true); renderDataInfo();
    toast('ลบ token จากเครื่องนี้แล้ว');
  }));
  $('#imp-leads').addEventListener('change', async e => {
    try {
      const d = await readJsonFile(e.target);
      const list = Array.isArray(d) ? d : d && d.leads;
      if (!Array.isArray(list) || !list.some(r => r && r.i && r.n)) throw new Error('bad');
      window.__ltpl.setLeads({ v: 1, leads: list.filter(r => r && r.i && r.n) });
      toast('นำเข้า ' + fmt(list.length) + ' รายแล้ว กำลังโหลดใหม่…');
      setTimeout(() => location.reload(), 600);
    } catch (err) { toast(err && err.code === 'quota_exceeded' ? err.message : 'อ่านไฟล์ไม่ได้ ต้องเป็นไฟล์ leads.json ของแอปนี้', 6000); }
    e.target.value = '';
  });
  $('#bk-save').addEventListener('click', () => {
    flushNote();
    S.dl.save({ filename: 'lead-tracking-backup-' + today() + '.json', data: JSON.stringify(window.__ltpl.backup()) });
  });
  $('#bk-load').addEventListener('change', async e => {
    try {
      const b = await readJsonFile(e.target);
      window.__ltpl.restore(b);
      toast('กู้ข้อมูลแล้ว กำลังโหลดใหม่…');
      setTimeout(() => location.reload(), 600);
    } catch (err) { toast('ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอปนี้', 6000); }
    e.target.value = '';
  });
  $('#data-wipe').addEventListener('click', e => confirmThen(e.target, 'กดอีกครั้งเพื่อล้างทั้งหมด', () => {
    window.__ltpl.wipe();
    location.reload();
  }));
}
