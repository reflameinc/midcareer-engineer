'use strict';
// Step-by-step booking form for the IT engineer LP (API-direct, like kensetsu pro/step).
// It asks the questions of booking link mid-ad-eng one at a time, then books in an in-page calendar.
// - Answers go to SF with the link's own field keys (field7 job / field8 years / field6 age / field5 tel).
//   The option strings must match the link's Form_Schema character for character.
// - Measurement (no personal data in any event):
//     form_step_view    a step was shown (first time per step)
//     form_step_answer  a step was answered (first time per step; is_edit=1 when changed later)
//     form_complete     steps 1-4 done and the server accepted them (/gate). Not a CV.
//     form_abandon      the page was hidden/closed mid-form (once). Read drop-off from the step funnel first.
//     schedule_complete booking confirmed (bookingId returned). Same shape as the booking tool's embed,
//                       so the existing GTM tags for CHUTO (GA4 generate_lead, Meta, TikTok) fire on it.
// - Off reflame.co.jp the form runs in demo mode: no request leaves the page and nothing reaches dataLayer.
(function () {
  const CFG = {
    API: 'https://designer.my.site.com/schedulingvforcesite/services/apexrest/booking/v1',
    LINK_ID: 'a1TQ800000Le3CnMAJ',   // booking link mid-ad-eng
    SLUG: 'mid-ad-eng',
    BUSINESS_UNIT: 'CHUTO',          // GTM picks the mid-career Meta/TikTok CV tags by this value
    LP: 'midcareer_engineer',        // dataLayer "lp". Do not rename once live (GTM conditions use it)
    WINDOW_DAYS: 14,                 // same as the link's windowDays (today + 14 days)
    GATE: true,                      // ask /gate before showing slots (the link may get decline rules later)
    BLOCK_CAPTURE: true,             // keep declined answers as a contact (/form), like the embed
    THANKS_URL: '',                  // page to move to after booking (e.g. 'thanks/'). Empty = show the thanks in place
    THANKS_DELAY_MS: 1200,           // let the CV tags send before leaving
    PRIVACY_URL: 'https://reflame.co.jp/privacy/'
  };

  const JOBS = [
    'システムエンジニア（SE）',
    'インフラ・クラウドエンジニア',
    'プロジェクトマネージャー（PM）・プロジェクトリーダー（PL）',
    'PMO（プロジェクトマネジメント支援）',
    'ITコンサルタント',
    'その他'
  ];
  const YEARS = ['1年未満', '1〜2年', '3〜5年', '6〜10年', '11年以上'];
  // value = the link's option string (half-width "~" in the first one), label = what people see
  const AGES = [
    { v: '~22歳', label: '〜22歳' }, { v: '23〜25歳', label: '23〜25歳' }, { v: '26〜28歳', label: '26〜28歳' },
    { v: '29〜31歳', label: '29〜31歳' }, { v: '32〜35歳', label: '32〜35歳' }, { v: '36歳〜', label: '36歳〜' }
  ];
  const STEPS = [
    null,
    { name: 'job', title: '現在の職種を選んでください' },
    { name: 'years', title: 'IT業界での経験年数を選んでください' },
    { name: 'profile', title: 'お名前とご年齢を教えてください' },
    { name: 'contact', title: 'ご連絡先を入力してください' },
    { name: 'schedule', title: '面談の日程を選んでください' }
  ];
  const TOTAL = 5;
  const W = ['日', '月', '火', '水', '木', '金', '土'];

  const mount = document.getElementById('reflame-stepform');
  if (!mount) return;
  const DEMO = !/(^|\.)reflame\.co\.jp$/.test(location.hostname);

  const st = {
    step: 1, maxStep: 1,
    job: '', years: '', last: '', first: '', age: '', email: '', tel: '', agree: false,
    routed: [], date: '', iso: '', booking: false, booked: false
  };
  const viewed = new Set();
  const answered = {};
  let formCompleted = false, abandonSent = false, anchorNavAt = 0;

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function $(sel) { return mount.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(mount.querySelectorAll(sel)); }
  function toHalf(s) { return String(s || '').replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' '); }
  function normTel(s) { return toHalf(s).replace(/[\s\-ー－‐―()（）]/g, ''); }
  function okEmail(s) { return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s); }
  function okTel(s) { return /^0\d{9,10}$/.test(s); }

  // JST calendar parts of a Date (people book in Japan time whatever the phone is set to)
  const JST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  function jst(d) {
    const p = {};
    JST.formatToParts(d).forEach(x => { p[x.type] = x.value; });
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    return { ymd: p.year + '-' + p.month + '-' + p.day, m: +p.month, d: +p.day, wd: wd, hm: (p.hour === '24' ? '00' : p.hour) + ':' + p.minute };
  }
  function addDaysYmd(ymd, n) {
    const t = new Date(ymd + 'T12:00:00+09:00'); t.setUTCDate(t.getUTCDate() + n); return jst(t).ymd;
  }
  function labelOf(iso) {
    const a = jst(new Date(iso)), b = jst(new Date(new Date(iso).getTime() + 60 * 60000));
    return a.m + '月' + a.d + '日（' + W[a.wd] + '） ' + a.hm + '〜' + b.hm;
  }

  /* ---------- measurement ---------- */
  function track(o) {
    o = Object.assign({ lp: CFG.LP }, o);
    if (DEMO) {
      (window.__stepformLog = window.__stepformLog || []).push(o);
      document.dispatchEvent(new CustomEvent('stepform:log', { detail: o }));
      return;
    }
    try { window.dataLayer = window.dataLayer || []; window.dataLayer.push(o); } catch (e) { /* never block the form */ }
  }
  function stepParams(n) { return { form_step: n, form_step_name: STEPS[n].name }; }
  function trackView(n) {
    if (viewed.has(n)) return;
    viewed.add(n);
    track(Object.assign({ event: 'form_step_view' }, stepParams(n), { virtual_path: location.pathname + '#step' + n }));
  }
  function trackAnswer(n, value) {
    trackView(n);   // a step can be answered before the visibility check fires; keep view before answer
    const key = value == null ? '(input)' : value;
    if (answered[n] === key) return;
    const isEdit = answered[n] !== undefined;
    answered[n] = key;
    const p = Object.assign({ event: 'form_step_answer' }, stepParams(n));
    if (value != null) p.answer = value;
    if (isEdit) p.is_edit = '1';
    track(p);
  }
  function trackAbandon() {
    if (abandonSent || st.booked || !viewed.size) return;
    abandonSent = true;
    track(Object.assign({ event: 'form_abandon' }, stepParams(st.step), { steps_answered: Object.keys(answered).length }));
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') trackAbandon(); });
  window.addEventListener('pagehide', trackAbandon);

  function utm() {
    const p = new URLSearchParams(location.search), t = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(k => { if (p.get(k)) t[k] = p.get(k); });
    if (p.get('aff_id') || p.get('aff')) t.aff_id = p.get('aff_id') || p.get('aff');
    if (p.get('cid')) t.cid = p.get('cid');
    ['ls_major', 'ls_mid', 'ls_sub', 'ls_detail', 'ls_touch', 'campaign2'].forEach(k => { if (p.get(k)) t[k] = p.get(k); });
    return t;
  }
  // Same shape the booking tool's embed sends, so SF fills the same source fields.
  function tracking() {
    const p = new URLSearchParams(location.search), t = utm(), all = {};
    p.forEach((v, k) => { if (k && v) all[k] = v; });
    if (Object.keys(all).length) t.params = all;
    t.lp = p.get('lp') || location.href;
    try {
      const ck = {}, c = document.cookie || '';
      const m1 = c.match(/(?:^|; )_fbp=([^;]+)/); if (m1) ck.fbp = decodeURIComponent(m1[1]);
      const m2 = c.match(/(?:^|; )_fbc=([^;]+)/); if (m2) ck.fbc = decodeURIComponent(m2[1]);
      const m3 = c.match(/(?:^|; )_ttp=([^;]+)/); if (m3) ck.ttp = decodeURIComponent(m3[1]);
      if (p.get('fbclid')) ck.fbclid = p.get('fbclid');
      if (p.get('ttclid')) ck.ttclid = p.get('ttclid');
      if (navigator.userAgent) ck.ua = String(navigator.userAgent).slice(0, 512);
      if (Object.keys(ck).length) t.click = ck;
    } catch (e) { /* none */ }
    return t;
  }
  function pushBooking(bookingId, test) {
    const t = utm();
    const r = {
      booking_id: bookingId || null, business_unit: CFG.BUSINESS_UNIT, link_slug: CFG.SLUG,
      conversion_type: test ? 'test' : 'booking',
      utm_source: t.utm_source || null, utm_medium: t.utm_medium || null, utm_campaign: t.utm_campaign || null,
      utm_content: t.utm_content || null, utm_term: t.utm_term || null, affiliate_id: t.aff_id || null,
      ls_major: t.ls_major || null, ls_mid: t.ls_mid || null, ls_sub: t.ls_sub || null,
      ls_detail: t.ls_detail || null, ls_touch: t.ls_touch || null
    };
    if (test) r.is_test = true;
    track({ event: 'schedule_complete', reflame: r });
  }

  /* ---------- API (demo answers locally) ---------- */
  function api(path, opts) {
    if (DEMO) return demoApi(path, opts || {});
    opts = opts || {};
    const head = {}; if (opts.body) head['Content-Type'] = 'application/json';
    return fetch(CFG.API + path, Object.assign({ credentials: 'omit' }, opts, { headers: head })).then(r =>
      r.json().catch(() => { throw new Error('サーバーから不正な応答が返りました'); }).then(j => {
        if (!j || j.ok !== true) throw new Error((j && j.error) || '通信に失敗しました');
        return j.data;
      }));
  }
  function demoApi(path) {
    const wait = ms => new Promise(res => setTimeout(res, ms));
    if (path.indexOf('/slots-range') === 0) {
      const q = new URLSearchParams(path.split('?')[1]), from = q.get('from'), out = {};
      const now = Date.now();
      for (let i = 0; i < 7; i++) {
        const ymd = addDaysYmd(from, i), wd = jst(new Date(ymd + 'T12:00:00+09:00')).wd, list = [];
        if (wd !== 0 && wd !== 6) {
          for (let h = 10; h <= 21; h++) {
            const iso = ymd + 'T' + String(h).padStart(2, '0') + ':00:00+09:00', at = new Date(iso).getTime();
            const seed = (+ymd.replace(/-/g, '') * 31 + h * 7) % 10;
            if (at > now + 2 * 3600000 && seed > 3) list.push({ startIso: new Date(at).toISOString() });
          }
        }
        out[ymd] = list;
      }
      return wait(450).then(() => out);
    }
    if (path === '/gate') return wait(300).then(() => ({ action: 'pass', assignees: [] }));
    if (path === '/book') return wait(700).then(() => ({ bookingId: 'DEMO-' + Date.now() }));
    return wait(200).then(() => ({}));   // /capture, /form
  }

  function answersSF() {
    return {
      field7: st.job, field8: st.years, LastName: st.last, FirstName: st.first,
      field6: st.age, Email: st.email, field5: st.tel
    };
  }
  function snapshot() {
    const a = answersSF(), s = {};
    Object.keys(a).forEach(k => { if (a[k]) s[k] = a[k]; });
    return s;
  }

  // Keep people who leave before booking: create the SF contact as soon as a valid email is in (like the embed).
  let captured = '';
  function capture() {
    const em = st.email.trim().toLowerCase();
    if (!okEmail(em) || em === captured) return;
    captured = em;
    const s = snapshot(); s.Email = em;
    api('/capture', { method: 'POST', body: JSON.stringify({ linkId: CFG.LINK_ID, payload: s, tracking: tracking() }) })
      .catch(e => { if (window.console) console.warn('[stepform] capture failed:', e && e.message); });
  }

  /* ---------- slots ---------- */
  const rangeCache = {};
  function weekStarts() {
    const today = jst(new Date()).ymd, out = [];
    for (let i = 0; i <= CFG.WINDOW_DAYS; i += 7) out.push(addDaysYmd(today, i));
    return out;
  }
  function fetchWeek(from) {
    const key = from + '|' + st.routed.join(',');
    const hit = rangeCache[key];
    if (hit && Date.now() - hit.at < 300000) return hit.promise;
    const pr = api('/slots-range?linkId=' + encodeURIComponent(CFG.LINK_ID) + '&from=' + encodeURIComponent(from) + '&days=7' +
      (st.routed.length ? '&routed=' + encodeURIComponent(st.routed.join(',')) : ''));
    pr.catch(() => { delete rangeCache[key]; });
    rangeCache[key] = { at: Date.now(), promise: pr };
    return pr;
  }
  function fetchDay(ymd) {
    return api('/slots?linkId=' + encodeURIComponent(CFG.LINK_ID) + '&date=' + encodeURIComponent(ymd) +
      (st.routed.length ? '&routed=' + encodeURIComponent(st.routed.join(',')) : '')).catch(() => []);
  }
  // All open slots in the window, grouped by JST date: { 'YYYY-MM-DD': [iso, ...] }
  function loadSlots() {
    const today = jst(new Date()).ymd, last = addDaysYmd(today, CFG.WINDOW_DAYS);
    return Promise.all(weekStarts().map(from => fetchWeek(from).then(byDay => {
      const days = [];
      for (let i = 0; i < 7; i++) days.push(addDaysYmd(from, i));
      return Promise.all(days.map(d => (byDay && Object.prototype.hasOwnProperty.call(byDay, d))
        ? Promise.resolve(byDay[d] || []) : fetchDay(d)));
    }, () => Promise.all([0, 1, 2, 3, 4, 5, 6].map(i => fetchDay(addDaysYmd(from, i))))))).then(weeks => {
      const out = {};
      weeks.forEach(list => list.forEach(slots => (slots || []).forEach(sl => {
        const iso = sl.startIso, p = jst(new Date(iso));
        if (p.ymd < today || p.ymd > last) return;
        (out[p.ymd] = out[p.ymd] || []).push(iso);
      })));
      Object.keys(out).forEach(k => out[k].sort());
      return out;
    });
  }
  function prefetch() { weekStarts().forEach(f => fetchWeek(f).catch(() => {})); }

  /* ---------- routing (browser back goes to the previous question) ---------- */
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (a) anchorNavAt = Date.now();
  }, true);
  window.addEventListener('popstate', e => {
    if (st.booked) return;
    const s = e.state && e.state.sf;
    if (s) { go(Math.min(s, st.maxStep), false); return; }
    if (Date.now() - anchorNavAt < 1000) return;   // an in-page link (CTA) changed the hash, not "back"
    if (st.step !== 1) go(1, false);
  });
  if (/^#step\d$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);

  function go(n, push) {
    st.step = n;
    st.maxStep = Math.max(st.maxStep, n);
    if (push) history.pushState({ sf: n }, '', location.pathname + location.search + '#step' + n);
    render();
    trackView(n);
    if (n === 4) prefetch();
  }
  function back() {
    if (st.step <= 1) return;
    if (history.state && history.state.sf === st.step) history.back();
    else go(st.step - 1, false);
  }

  /* ---------- rendering ---------- */
  function head(n) {
    let bars = '';
    for (let i = 1; i <= TOTAL; i++) bars += '<i class="' + (i <= n ? 'on' : '') + '"></i>';
    return '<div class="sf-head">' +
      '<div class="sf-meta">' +
        (n > 1 ? '<button type="button" class="sf-back" data-back>‹ 前の質問に戻る</button>' : '<span></span>') +
        '<span class="sf-count">STEP <b>' + n + '</b> / ' + TOTAL + '</span>' +
      '</div>' +
      '<div class="sf-bar" aria-hidden="true">' + bars + '</div>' +
      '<h4 class="sf-title" tabindex="-1">' + esc(STEPS[n].title) + (n < 5 ? '<span class="sf-req">必須</span>' : '') + '</h4>' +
    '</div>';
  }
  function choice(name, value, label, selected, extra) {
    return '<button type="button" role="radio" class="sf-opt' + (extra || '') + '" data-' + name + '="' + esc(value) + '" aria-checked="' + (selected ? 'true' : 'false') + '" aria-label="' + esc(label) + '">' +
      '<span class="sf-opt-label">' + esc(label) + '</span><span class="sf-opt-mark" aria-hidden="true"></span></button>';
  }

  function render() {
    const n = st.step;
    let body = '';
    if (n === 1) {
      body = '<div class="sf-list" role="radiogroup" aria-label="現在の職種">' +
        JOBS.map(j => choice('job', j, j, st.job === j)).join('') + '</div>';
    } else if (n === 2) {
      body = '<div class="sf-grid2" role="radiogroup" aria-label="IT業界での経験年数">' +
        YEARS.map((y, i) => choice('years', y, y, st.years === y, i === YEARS.length - 1 ? ' sf-wide' : '')).join('') + '</div>';
    } else if (n === 3) {
      body =
        '<div class="sf-field"><span class="sf-lb" id="sf-lb-name">お名前</span>' +
          '<div class="sf-namerow">' +
            '<input class="sf-input" id="sf-last" type="text" autocomplete="family-name" placeholder="姓（例）山田" aria-label="姓" value="' + esc(st.last) + '">' +
            '<input class="sf-input" id="sf-first" type="text" autocomplete="given-name" placeholder="名（例）太郎" aria-label="名" value="' + esc(st.first) + '">' +
          '</div><p class="sf-err" id="sf-e-name">姓・名の両方をご入力ください</p></div>' +
        '<div class="sf-field"><span class="sf-lb">ご年齢</span>' +
          '<div class="sf-grid3" role="radiogroup" aria-label="ご年齢">' + AGES.map(a => choice('age', a.v, a.label, st.age === a.v)).join('') + '</div>' +
          '<p class="sf-err" id="sf-e-age">ご年齢を選んでください</p></div>' +
        '<button type="button" class="sf-next" data-next>次へ進む</button>';
    } else if (n === 4) {
      body =
        '<div class="sf-field"><label class="sf-lb" for="sf-email">メールアドレス</label>' +
          '<input class="sf-input" id="sf-email" type="email" inputmode="email" autocomplete="email" placeholder="例）taro@example.com" value="' + esc(st.email) + '">' +
          '<p class="sf-err" id="sf-e-email">メールアドレスを正しくご入力ください</p></div>' +
        '<div class="sf-field"><label class="sf-lb" for="sf-tel">電話番号</label>' +
          '<input class="sf-input" id="sf-tel" type="tel" inputmode="numeric" autocomplete="tel" placeholder="例）09012345678" value="' + esc(st.tel) + '">' +
          '<p class="sf-err" id="sf-e-tel">電話番号をハイフンなしの10〜11桁でご入力ください</p></div>' +
        '<label class="sf-agree"><input type="checkbox" id="sf-agree"' + (st.agree ? ' checked' : '') + '>' +
          '<span><a href="' + esc(CFG.PRIVACY_URL) + '" target="_blank" rel="noopener">個人情報の取り扱い</a>に同意する</span></label>' +
        '<p class="sf-err" id="sf-e-agree">個人情報の取り扱いへの同意が必要です</p>' +
        '<p class="sf-err sf-err-box" id="sf-e-send" role="alert"></p>' +
        '<button type="button" class="sf-next" data-next>面談の日程を選ぶ</button>' +
        '<p class="sf-small">次の画面で、空いている日時から選べます。</p>';
    } else {
      body = '<p class="sf-sub">オンライン（Zoom）・60分・無料。担当のアドバイザーとお話しします。</p>' +
        '<div id="sf-cal" class="sf-cal"><p class="sf-loading">空き日時を取得しています…</p></div>';
    }
    mount.innerHTML = '<div class="sf" data-step="' + n + '">' + head(n) + '<div class="sf-body">' + body + '</div></div>';
    bind(n);
    if (n === 5) drawCalendar();
    const top = mount.getBoundingClientRect().top;
    if (top < 0) mount.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const h = $('.sf-title'); if (h && viewed.size) h.focus({ preventScroll: true });
  }

  function bind(n) {
    const b = $('[data-back]'); if (b) b.addEventListener('click', back);
    if (n === 1 || n === 2) {
      const key = n === 1 ? 'job' : 'years';
      $$('[data-' + key + ']').forEach(btn => btn.addEventListener('click', () => {
        st[key] = btn.getAttribute('data-' + key);
        $$('[data-' + key + ']').forEach(x => x.setAttribute('aria-checked', x === btn ? 'true' : 'false'));
        trackAnswer(n, st[key]);
        setTimeout(() => go(n + 1, true), 220);   // let the tap show before moving on
      }));
    }
    if (n === 3) {
      $$('[data-age]').forEach(btn => btn.addEventListener('click', () => {
        st.age = btn.getAttribute('data-age');
        $$('[data-age]').forEach(x => x.setAttribute('aria-checked', x === btn ? 'true' : 'false'));
        $('#sf-e-age').classList.remove('show');
      }));
      ['#sf-last', '#sf-first'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); }));
      $('[data-next]').addEventListener('click', () => {
        st.last = $('#sf-last').value.trim(); st.first = $('#sf-first').value.trim();
        const okName = !!(st.last && st.first), okAge = !!st.age;
        $('#sf-e-name').classList.toggle('show', !okName);
        $('#sf-last').classList.toggle('bad', !st.last); $('#sf-first').classList.toggle('bad', !st.first);
        $('#sf-e-age').classList.toggle('show', !okAge);
        if (!okName || !okAge) return;
        trackAnswer(3, st.age);
        go(4, true);
      });
    }
    if (n === 4) {
      const em = $('#sf-email'), tel = $('#sf-tel');
      em.addEventListener('change', () => { st.email = toHalf(em.value).trim(); capture(); });
      em.addEventListener('blur', () => { st.email = toHalf(em.value).trim(); capture(); });
      [em, tel].forEach(x => x.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); }));
      $('#sf-agree').addEventListener('change', e => { st.agree = e.target.checked; if (st.agree) $('#sf-e-agree').classList.remove('show'); });
      $('[data-next]').addEventListener('click', submitContact);
    }
  }

  function submitContact() {
    const em = $('#sf-email'), tel = $('#sf-tel'), btn = $('[data-next]');
    st.email = toHalf(em.value).trim(); st.tel = normTel(tel.value); st.agree = $('#sf-agree').checked;
    const okE = okEmail(st.email), okT = okTel(st.tel);
    $('#sf-e-email').classList.toggle('show', !okE); em.classList.toggle('bad', !okE);
    $('#sf-e-tel').classList.toggle('show', !okT); tel.classList.toggle('bad', !okT);
    $('#sf-e-agree').classList.toggle('show', !st.agree);
    if (!okE || !okT || !st.agree) return;
    tel.value = st.tel;
    capture();
    btn.disabled = true; btn.textContent = '確認しています…';
    const gate = CFG.GATE
      ? api('/gate', { method: 'POST', body: JSON.stringify({ linkId: CFG.LINK_ID, payload: answersSF(), tracking: tracking() }) })
      : Promise.resolve({ action: 'pass' });
    gate.then(g => {
      trackAnswer(4, null);
      if (!formCompleted) {
        formCompleted = true;
        track({ event: 'form_complete', form_step: 4, job: st.job, years: st.years, age: st.age, gate: (g && g.action) || 'pass' });
      }
      if (g && g.action === 'block') {
        if (CFG.BLOCK_CAPTURE) {
          api('/form', { method: 'POST', body: JSON.stringify({ linkId: CFG.LINK_ID, payload: answersSF(), tracking: tracking() }) })
            .catch(e => { if (window.console) console.warn('[stepform] form failed:', e && e.message); });
        }
        st.booked = true;   // nothing left to do on this page
        mount.innerHTML = '<div class="sf"><div class="sf-done"><h4>ご回答ありがとうございました</h4><p>' +
          esc(g.message || 'ご案内できる日程が現在ございません。') + '</p></div></div>';
        return;
      }
      const routed = (g && g.assignees) || [];
      if (routed.join(',') !== st.routed.join(',')) st.routed = routed;
      go(5, true);
    }).catch(e => {
      btn.disabled = false; btn.textContent = '面談の日程を選ぶ';
      const box = $('#sf-e-send');
      box.textContent = '送信できませんでした（' + (e.message || '通信エラー') + '）。通信の良い所で、もう一度お試しください。';
      box.classList.add('show');
      track({ event: 'schedule_error', error_type: 'gate' });
    });
  }

  let slotsByDay = {}, calErr = '';
  function drawCalendar() {
    const box = $('#sf-cal');
    loadSlots().then(byDay => {
      slotsByDay = byDay;
      if (st.step !== 5) return;
      const days = Object.keys(byDay).filter(d => byDay[d].length).sort();
      if (!days.length) {
        box.innerHTML = '<p class="sf-empty">申し訳ありません。ただいま空いている日時がありません。<br>担当より、お電話かメールでご連絡いたします。</p>';
        return;
      }
      if (days.indexOf(st.date) < 0) st.date = days[0];
      if (st.iso && (byDay[st.date] || []).indexOf(st.iso) < 0) st.iso = '';
      paintCalendar(days);
    }).catch(() => {
      box.innerHTML = '<p class="sf-empty">空き日時を読み込めませんでした。<br><button type="button" class="sf-retry">もう一度読み込む</button></p>';
      box.querySelector('.sf-retry').addEventListener('click', () => { box.innerHTML = '<p class="sf-loading">空き日時を取得しています…</p>'; drawCalendar(); });
      track({ event: 'schedule_error', error_type: 'slots' });
    });
  }
  function paintCalendar(days) {
    const box = $('#sf-cal');
    const dateBtns = days.map(d => {
      const p = jst(new Date(d + 'T12:00:00+09:00'));
      return '<button type="button" role="radio" class="sf-date' + (p.wd === 6 ? ' sat' : '') + (p.wd === 0 ? ' sun' : '') + '" data-date="' + d + '" aria-checked="' + (d === st.date ? 'true' : 'false') + '">' +
        '<b>' + p.m + '/' + p.d + '</b><span>（' + W[p.wd] + '）</span></button>';
    }).join('');
    const times = (slotsByDay[st.date] || []).map(iso =>
      '<button type="button" role="radio" class="sf-time" data-iso="' + esc(iso) + '" aria-checked="' + (iso === st.iso ? 'true' : 'false') + '">' + jst(new Date(iso)).hm + '</button>').join('');
    box.innerHTML =
      (calErr ? '<p class="sf-err sf-err-box show" role="alert">' + esc(calErr) + '</p>' : '') +
      '<p class="sf-lb">希望日</p><div class="sf-dates" role="radiogroup" aria-label="希望日">' + dateBtns + '</div>' +
      '<p class="sf-lb">希望時間帯（開始時刻）</p><div class="sf-times" role="radiogroup" aria-label="希望時間帯">' + times + '</div>' +
      '<p class="sf-picked" aria-live="polite">' + (st.iso ? 'ご希望の日時<br><b>' + esc(labelOf(st.iso)) + '</b>' : '時間を選んでください') + '</p>' +
      '<button type="button" class="sf-next sf-book" data-book' + (st.iso ? '' : ' disabled') + '>無料相談を予約する</button>' +
      '<p class="sf-small">予約が確定すると、確認メールをお送りします。</p>';
    calErr = '';
    $$('[data-date]').forEach(b => b.addEventListener('click', () => {
      st.date = b.getAttribute('data-date'); st.iso = ''; paintCalendar(days);
    }));
    $$('[data-iso]').forEach(b => b.addEventListener('click', () => {
      st.iso = b.getAttribute('data-iso'); paintCalendar(days);
      const go2 = $('[data-book]'); if (go2) go2.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }));
    $('[data-book]').addEventListener('click', book);
  }

  function book() {
    if (st.booking || !st.iso) return;
    st.booking = true;
    const btn = $('[data-book]'), iso = st.iso;
    btn.disabled = true; btn.textContent = '予約を確定しています…';
    api('/book', { method: 'POST', body: JSON.stringify({ linkId: CFG.LINK_ID, slotIso: iso, payload: answersSF(), tracking: tracking(), assignee: null }) })
      .then(r => {
        if (!r || !r.bookingId) throw new Error('予約を確定できませんでした');
        st.booked = true;
        pushBooking(r.bookingId, false);
        try { sessionStorage.setItem('sf_booked', iso); } catch (e) { /* private mode */ }
        if (CFG.THANKS_URL) {
          mount.innerHTML = '<div class="sf"><div class="sf-done" role="status"><div class="sf-tick" aria-hidden="true">✓</div><h4>ご予約を受け付けました</h4><p>' + esc(labelOf(iso)) + '</p><p class="sf-small">完了ページへ移動しています…</p></div></div>';
          setTimeout(() => {
            const u = new URL(CFG.THANKS_URL, location.href), t = utm();
            ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(k => { if (t[k]) u.searchParams.set(k, t[k]); });
            location.assign(u.toString());
          }, CFG.THANKS_DELAY_MS);
        } else {
          history.replaceState(null, '', location.pathname + location.search + '#thanks');
          mount.innerHTML = '<div class="sf"><div class="sf-done" role="status"><div class="sf-tick" aria-hidden="true">✓</div><h4>ご予約ありがとうございます</h4><p class="sf-when">' + esc(labelOf(iso)) + '</p>' +
            '<p>確認メールを <b>' + esc(st.email) + '</b> 宛にお送りしました。当日はメールに記載のURLからご参加ください。</p>' +
            '<p class="sf-small">メールが見当たらない時は、迷惑メールフォルダもご確認ください。</p></div></div>';
        }
      })
      .catch(e => {
        st.booking = false; st.iso = '';
        calErr = '予約できませんでした（' + (e.message || '通信エラー') + '）。お手数ですが、別の日時をお選びください。';
        track({ event: 'schedule_error', error_type: 'book' });
        Object.keys(rangeCache).forEach(k => delete rangeCache[k]);
        drawCalendar();
      });
  }

  /* ---------- start ---------- */
  // CV test: open the LP with #reflame_cvtest to fire a test booking CV (GTM/GA4 only; Meta/TikTok skip is_test).
  if (/(^|[?#&])reflame_cvtest(\b|=)/.test(location.hash + location.search)) {
    pushBooking(null, true);
    mount.innerHTML = '<div class="sf"><div class="sf-done"><h4>CV計測テスト</h4><p>予約完了CV（テスト）を試し発火しました。GA4 の DebugView で cv_debug の着弾を確かめてください。実際の予約は #reflame_cvtest を外したURLで行います。</p></div></div>';
    return;
  }
  render();
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      if (es.some(x => x.isIntersecting)) { trackView(1); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(mount);
  } else trackView(1);
  window.addEventListener('pageshow', e => {
    if (e.persisted && st.booked && CFG.THANKS_URL) {
      mount.innerHTML = '<div class="sf"><div class="sf-done"><div class="sf-tick" aria-hidden="true">✓</div><h4>ご予約は完了しています</h4><p>確認メールをご確認ください。</p></div></div>';
    }
  });
})();
