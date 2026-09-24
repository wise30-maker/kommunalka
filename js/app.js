// Приложение «Коммуналка»: экраны, ввод, отчёты. Навигация — через hash-роутинг,
// свайп вправо = назад (как в iOS), никогда не выбрасывает из приложения.
const ITEM_CATALOG = [
  ['kvartplata', 'Квартплата (коммуналка)'],
  ['electro', 'Электроэнергия'],
  ['voda', 'Вода'],
  ['tko', 'ТКО'],
  ['domofon', 'Домофон'],
  ['kapremont', 'Капремонт'],
  ['otoplenie', 'Отопление'],
  ['gaz', 'Газ'],
  ['tv', 'ТВ'],
];
const READING_KINDS = [
  ['water_cold', 'Холодная вода'],
  ['water_hot', 'Горячая вода'],
  ['elec_day', 'Электро день (т2)'],
  ['elec_night', 'Электро ночь (т1)'],
];
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

const app = document.getElementById('app');
const topbar = document.getElementById('topbar');
const topbarNav = document.getElementById('topbar-nav');

const state = { user: null, objects: [], object: null, data: null, items: null, view: 'objects', sub: null, periodId: null };

// ---------- helpers ----------
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids) e.append(kid?.nodeType ? kid : document.createTextNode(kid ?? ''));
  return e;
}
function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function periodTotal(p) {
  return (p.payments || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
}
function labelSortKey(year, label) {
  const lower = label.toLowerCase();
  for (let i = 0; i < MONTHS.length; i++) {
    if (lower.includes(MONTHS[i].toLowerCase())) return year + (i + 1) / 100;
  }
  return year;
}
function showError(err) {
  app.prepend(el('div', { class: 'error' }, String(err?.message || err)));
  window.scrollTo(0, 0);
}

// ---------- hash router ----------
// fwdStack — стек «вперёд»: свайп вправо кладёт текущий экран в стек,
// свайп влево возвращает его (навигация как в iOS, без выхода из приложения)
const fwdStack = [];
function parseHash() {
  return (location.hash || '#/objects').replace(/^#\/?/, '').split('/');
}
function go(hash, keepFwd) {
  if (!keepFwd) fwdStack.length = 0;
  if (location.hash === hash) render();
  else location.hash = hash;
}
function parentHash(h) {
  const seg = h.replace(/^#\/?/, '').split('/');
  if (seg[0] === 'object' && seg[1] && seg[2]) return `#/object/${seg[1]}`;
  if (seg[0] === 'object' && seg[1]) return '#/objects';
  return null;
}
function syncStateFromHash() {
  const seg = parseHash();
  state.sub = null; state.periodId = null;
  if (seg[0] === 'reports') { state.view = 'reports'; state.object = null; return; }
  state.view = 'objects';
  if (seg[0] === 'object' && seg[1]) {
    if (!state.object || state.object.id !== seg[1]) {
      state.object = state.objects.find(o => o.id === seg[1]) || null;
      state.data = null; state.items = null;
    }
    state.sub = seg[2] || null;
    state.periodId = seg[3] || null;
  } else {
    state.object = null; state.data = null; state.items = null;
  }
}
window.addEventListener('hashchange', () => { syncStateFromHash(); render(); });

// свайпы: вправо = «назад», влево = «вперёд» (как в iOS). Никогда не выбрасывает из приложения.
(function swipeNav() {
  let x0 = null, y0 = null;
  document.addEventListener('touchstart', e => {
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = y0 = null;
    if (Math.abs(dx) <= 70 || Math.abs(dx) <= Math.abs(dy) * 2) return;
    if (dx > 0) {
      // назад: запоминаем текущий экран, уходим к родителю
      const cur = location.hash || '#/objects';
      const parent = parentHash(cur);
      if (parent) { fwdStack.push(cur); go(parent, true); }
      // на верхнем уровне ничего не делаем
    } else {
      // вперёд: возвращаем экран из стека
      const next = fwdStack.pop();
      if (next) go(next, true);
    }
  }, { passive: true });
})();

// закрытие выпадающих панелей по тапу мимо
document.addEventListener('click', () => {
  document.querySelectorAll('.drop-panel').forEach(p => { p.style.display = 'none'; });
});

// ---------- тема (светлая/тёмная, macOS/iOS-палитры) ----------
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('kommunalka_theme', cur);
  applyTheme(cur);
  render(); // перерисовать графики в новых цветах
}
function initTheme() {
  const saved = localStorage.getItem('kommunalka_theme');
  applyTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
}
initTheme();

// ---------- клавиатура на телефоне: поле не должно уходить под клавиатуру ----------
(function keyboardFit() {
  // добавляем нижний отступ на высоту клавиатуры (iOS не меняет layout viewport)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      const kb = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
      document.body.style.paddingBottom = kb > 40 ? (kb + 24) + 'px' : '';
    });
  }
  // при фокусе прокручиваем поле к центру экрана — над клавиатурой
  document.addEventListener('focusin', e => {
    if (e.target.matches('input, select, textarea')) {
      setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
    }
  });
})();

// ---------- распознавание квитанции: локально в браузере (WASM), без LLM ----------
const ReceiptOCR = (() => {
  let scriptPromise = null, workerPromise = null, statusSink = null;
  const BASE = () => new URL('vendor/tesseract/', location.href).href;

  function loadEngine() {
    if (window.Tesseract) return Promise.resolve();
    if (!scriptPromise) {
      scriptPromise = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = BASE() + 'tesseract.min.js';
        s.onload = () => res();
        s.onerror = () => rej(new Error('не удалось загрузить движок распознавания'));
        document.head.append(s);
      });
    }
    return scriptPromise;
  }

  // предобработка: до 1600px по большей стороне, grayscale + контраст
  function preprocess(img) {
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      let g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      g = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128));
      px[i] = px[i + 1] = px[i + 2] = g;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  }

  function loadImage(file) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('не удалось открыть изображение'));
      i.src = URL.createObjectURL(file);
    });
  }

  async function recognize(file, onStatus) {
    statusSink = onStatus || null;
    const say = s => { if (statusSink) statusSink(s); };
    say('подготовка изображения…');
    const img = await loadImage(file);
    const canvas = preprocess(img);
    say('загружаю движок распознавания (один раз ~10 МБ)…');
    await loadEngine();
    if (!workerPromise) {
      workerPromise = Tesseract.createWorker('rus', 1, {
        workerPath: BASE() + 'worker.min.js',
        corePath: BASE(),                                  // воркер сам выберет -simd-lstm или -lstm
        langPath: BASE().replace(/\/$/, ''),
        logger: m => { if (m.status) say(m.status + ' — ' + Math.round((m.progress || 0) * 100) + '%'); }
      }).then(async w => {
        await w.setParameters({ tessedit_pageseg_mode: '11' });   // режим проверен на квитанциях ВЦ
        return w;
      });
    }
    const worker = await workerPromise;
    say('распознаю текст…');
    const { data } = await worker.recognize(canvas);
    return data.text;
  }

  return { recognize };
})();

// ---------- auth ----------
async function renderLogin() {
  topbar.hidden = true;
  app.innerHTML = '';
  const email = el('input', { type: 'email', autocomplete: 'username' });
  const pass = el('input', { type: 'password', autocomplete: 'current-password' });
  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        await DB.login(email.value.trim(), pass.value);
        await boot();
      } catch (err) { showError(err); }
    }
  },
    el('h1', {}, 'Вход'),
    el('label', {}, 'Email'), email,
    el('label', {}, 'Пароль'), pass,
    el('div', { style: 'margin-top:16px' }, el('button', { class: 'btn', type: 'submit' }, 'Войти'))
  );
  app.append(el('div', { class: 'card', style: 'max-width:400px;margin:40px auto' }, form));
}

async function boot() {
  state.user = await DB.currentUser();
  if (!state.user) return renderLogin();
  topbar.hidden = false;
  document.getElementById('btn-logout').onclick = () => { DB.logout(); location.hash = ''; location.reload(); };
  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn) themeBtn.onclick = toggleTheme;
  await loadObjects();
  if (!location.hash) location.hash = '#/objects';
  syncStateFromHash();
  render();
}

async function loadObjects() {
  state.objects = await DB.listObjects();
}

// ---------- render root ----------
function render() {
  topbarNav.innerHTML = '';
  topbarNav.append(el('button', { class: state.view !== 'reports' ? 'active' : '', onclick: () => go('#/objects') }, 'Объекты'));
  topbarNav.append(el('button', { class: state.view === 'reports' ? 'active' : '', onclick: () => go('#/reports') }, 'Отчёты'));
  if (state.view === 'reports') return renderReports();
  if (!state.object) return renderObjects();
  if (state.sub === 'settings') return renderObjectSettings();
  if (state.sub === 'period') return renderPeriodForm(state.periodId);
  return renderObjectDetail();
}

// ---------- objects ----------
function renderObjects() {
  app.innerHTML = '';
  const nameInput = el('input', { placeholder: 'Новый объект, напр. «Ленина 1»' });
  const add = async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    try {
      const [created] = await DB.createObject({ name, sort_order: state.objects.length });
      await loadObjects();
      go(`#/object/${created.id}`);
    } catch (err) { showError(err); }
  };
  const list = el('div', { class: 'obj-list' });
  for (const o of state.objects) {
    list.append(el('button', { class: 'item', onclick: () => go(`#/object/${o.id}`) }, o.name));
  }
  app.append(
    el('h1', {}, 'Объекты'),
    list,
    el('div', { class: 'card row' }, nameInput, el('button', { class: 'btn secondary', onclick: add }, 'Добавить'))
  );
}

// ---------- object detail ----------
async function renderObjectDetail() {
  const o = state.object;
  app.innerHTML = '';
  app.append(el('button', { class: 'back', onclick: () => go('#/objects') }, 'Объекты'));
  app.append(el('h1', {}, o.name));
  try {
    if (!state.data) state.data = await DB.loadObjectData(o.id);
    if (!state.items) state.items = await DB.listItems(o.id);
  } catch (err) { return showError(err); }

  if (!state.items.length) await ensureDefaultItems(o);

  // одна таблица на все годы: колонки выровнены, новые записи сверху
  const hist = el('div', { class: 'card' }, el('h2', {}, 'История'));
  if (!state.data.length) {
    hist.append(el('div', { class: 'muted' }, 'Пока нет записей'));
  } else {
    const table = el('table');
    table.append(el('tr', {}, el('th', {}, 'Период'), el('th', {}, 'Итого, ₽'), el('th', {}), el('th', {})));
    const desc = [...state.data].sort((a, b) => b.sort_key - a.sort_key);
    let lastYear = null;
    for (const p of desc) {
      if (p.year !== lastYear) {
        lastYear = p.year;
        table.append(el('tr', { class: 'year-sep' }, el('td', { colspan: 4 }, String(p.year))));
      }
      const edit = el('button', { class: 'link', onclick: () => go(`#/object/${o.id}/period/${p.id}`) }, 'изменить');
      const del = el('button', {
        class: 'link', style: 'color:var(--danger)',
        onclick: async () => { if (confirm(`Удалить период «${p.label}»?`)) { try { await DB.deletePeriod(p.id); state.data = null; renderObjectDetail(); } catch (e) { showError(e); } } }
      }, 'удалить');
      table.append(el('tr', {}, el('td', {}, p.label), el('td', {}, fmtMoney(periodTotal(p))), el('td', {}, edit), el('td', {}, del)));
    }
    hist.append(table);
  }

  const newBtn = el('button', { class: 'btn', onclick: () => go(`#/object/${o.id}/period/new`) }, '+ Новый месяц');
  const settingsBtn = el('button', { class: 'btn secondary', onclick: () => go(`#/object/${o.id}/settings`) }, 'Настройки объекта');
  app.append(el('div', { class: 'row', style: 'margin-bottom:14px' }, newBtn, settingsBtn), hist);
}

async function ensureDefaultItems(o) {
  for (let i = 0; i < ITEM_CATALOG.length; i++) {
    const [key, title] = ITEM_CATALOG[i];
    await DB.upsertItem({ object_id: o.id, key, title, sort_order: i });
  }
  state.items = await DB.listItems(o.id);
}

// ---------- period form ----------
// periodId: uuid существующего периода, 'new' или null
async function renderPeriodForm(periodId) {
  const o = state.object;
  app.innerHTML = '';
  app.append(el('button', { class: 'back', onclick: () => go(`#/object/${o.id}`) }, o.name));
  try {
    if (!state.items) state.items = await DB.listItems(o.id);
    if (periodId && periodId !== 'new' && !state.data) state.data = await DB.loadObjectData(o.id);
  } catch (err) { return showError(err); }
  const period = periodId && periodId !== 'new'
    ? (state.data || []).find(p => p.id === periodId) : null;
  app.append(el('h1', {}, period ? `Изменить: ${period.label}` : 'Новый месяц'));

  const year = el('input', { type: 'number', inputmode: 'numeric', value: period?.year || new Date().getFullYear() });
  const label = el('input', { value: period?.label || '', placeholder: 'Октябрь или Август + Сентябрь' });
  const sugg = el('div', { class: 'row', style: 'margin-top:6px' });
  MONTHS.forEach(m => sugg.append(el('button', { class: 'btn secondary small', onclick: () => { label.value = m; } }, m)));

  const itemInputs = {};
  const cardItems = el('div', { class: 'card' }, el('h2', {}, 'Платежи по квитанции'));
  for (const item of state.items) {
    const existing = period?.payments?.find(x => x.item_id === item.id);
    const inp = el('input', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: existing?.amount ?? '', placeholder: '0.00' });
    inp.addEventListener('input', updateTotal);
    itemInputs[item.id] = inp;
    cardItems.append(el('label', {}, item.title), inp);
  }
  const totalDiv = el('div', { class: 'total-big' }, 'Итого: ', el('span', {}, '0,00'), ' ₽');
  function updateTotal() {
    const sum = Object.values(itemInputs).reduce((s, i) => s + (parseFloat(i.value.replace(',', '.')) || 0), 0);
    totalDiv.querySelector('span').textContent = fmtMoney(sum);
  }

  // --- распознавание квитанции: локально, суммы раскладываются по статьям ---
  const ocrStatus = el('div', { class: 'muted' });
  const ocrOut = el('div', {});
  const fileInp = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  const ocrBtn = el('button', { class: 'btn secondary', type: 'button', onclick: () => fileInp.click() }, '📷 С квитанции');

  function buildPreview(res, text) {
    const box = el('div', {});
    const known = res.rows.filter(r => r.itemId).length;
    const head = el('div', { class: 'muted', style: 'margin:10px 0' });
    head.textContent = `документов: ${res.rows.length}, сопоставлено со статьями: ${known}`
      + `, распознано ${fmtMoney(res.recognized)} ₽`
      + (res.total !== null ? `, в квитанции «К оплате» ${fmtMoney(res.total)} ₽ (расхождение ${fmtMoney(res.diff)} ₽)` : ', итог «К оплате» в тексте не найден');
    box.append(head);

    const table = el('table', { class: 'ocr-table' });
    table.append(el('tr', {}, el('th', {}, 'Получатель и статья'), el('th', {}, 'Сумма')));
    const rowsState = [];
    res.rows.forEach(r => {
      const sel = el('select', {});
      sel.append(el('option', { value: '' }, '— выберите статью —'));
      state.items.forEach(it => {
        const opt = el('option', { value: it.id }, it.title);
        if (it.id === r.itemId) opt.selected = true;
        sel.append(opt);
      });
      const value = r.suspicious ? (r.suggested ?? '') : r.amount;
      const amt = el('input', { class: 'ocr-amt', type: 'number', inputmode: 'decimal', step: '0.01', value: value === '' ? '' : String(value) });

      // получатель сверху, статья — под ним; сумма остаётся справа
      const cell = el('td', {}, el('div', { class: 'ocr-payee' }, r.payee || 'получатель не распознан'));
      if (r.suspicious) cell.append(el('div', { class: 'ocr-note' }, 'сумма распознана без копеек — проверьте'));
      cell.append(el('div', { class: 'ocr-pick' }, sel));

      table.append(el('tr', {}, cell, el('td', { class: 'ocr-amt-cell' }, amt)));
      rowsState.push({ sel, amt });
    });
    box.append(table);

    if (res.problems.length) {
      const list = el('div', { class: 'muted', style: 'margin-top:8px;font-size:13px' });
      res.problems.forEach(p => list.append(el('div', {}, '• ' + p.text)));
      box.append(list);
    }

    box.append(el('details', { style: 'margin-top:8px' },
      el('summary', { class: 'muted', style: 'font-size:13px' }, 'показать распознанный текст'),
      el('pre', { style: 'white-space:pre-wrap;font-size:12px' }, text.trim())));

    const apply = el('button', {
      class: 'btn', type: 'button', onclick: () => {
        const sums = {};
        rowsState.forEach(({ sel, amt }) => {
          const id = sel.value;
          if (!id) return;
          const v = parseFloat(String(amt.value).replace(',', '.'));
          if (isNaN(v)) return;
          sums[id] = (sums[id] || 0) + v;
        });
        let applied = 0;
        for (const [id, v] of Object.entries(sums)) {
          if (itemInputs[id]) { itemInputs[id].value = v.toFixed(2); applied++; }
        }
        updateTotal();
        ocrOut.innerHTML = '';
        ocrStatus.textContent = `применено статей: ${applied} — проверьте суммы и нажмите «Сохранить»`;
      }
    }, 'Применить');
    const cancel = el('button', {
      class: 'btn secondary', type: 'button',
      onclick: () => { ocrOut.innerHTML = ''; ocrStatus.textContent = 'распознавание отменено'; }
    }, 'Отмена');
    box.append(el('div', { class: 'row', style: 'margin-top:10px' }, apply, cancel));
    return box;
  }

  fileInp.addEventListener('change', async () => {
    const f = fileInp.files && fileInp.files[0];
    if (!f) return;
    ocrOut.innerHTML = '';
    try {
      const text = await ReceiptOCR.recognize(f, s => { ocrStatus.textContent = s; });
      const res = ReceiptParse.parse(text, state.items);
      ocrOut.append(buildPreview(res, text));
      ocrStatus.textContent = res.rows.length ? 'готово — проверьте сопоставление' : 'суммы в тексте не найдены';
    } catch (err) {
      ocrStatus.textContent = 'ОШИБКА: ' + (err && err.message ? err.message : err);
    } finally {
      fileInp.value = '';
    }
  });

  const cardOcr = el('div', { class: 'card' }, el('h2', {}, 'Распознать квитанцию'),
    el('div', { class: 'row' }, ocrBtn), fileInp, ocrStatus, ocrOut);

  const cardRead = el('div', { class: 'card' }, el('h2', {}, 'Показания счётчиков'));
  const readingInputs = [];
  const zones = o.split_water ? [['kitchen', 'Кухня'], ['bath', 'Ванная']] : [[null, '']];
  for (const [kind, kindTitle] of READING_KINDS) {
    const kindZones = kind.startsWith('water') ? zones : [[null, '']];
    for (const [zone, zoneTitle] of kindZones) {
      const existing = period?.meter_readings?.find(r => r.kind === kind && (r.zone ?? null) === zone);
      const inp = el('input', { type: 'number', inputmode: 'decimal', step: 'any', value: existing?.value ?? '', placeholder: '—' });
      readingInputs.push({ kind, zone, inp });
      const caption = zoneTitle ? `${kindTitle} — ${zoneTitle.toLowerCase()}` : kindTitle;
      cardRead.append(el('label', {}, caption), inp);
    }
  }

  const save = el('button', {
    class: 'btn', onclick: async () => {
      try {
        const y = parseInt(year.value, 10);
        if (!y || !label.value.trim()) throw new Error('Укажите год и название периода');
        const [saved] = await DB.upsertPeriod({ object_id: o.id, year: y, label: label.value.trim(), sort_key: labelSortKey(y, label.value) });
        const pid = period?.id || saved.id;
        for (const item of state.items) {
          const v = parseFloat((itemInputs[item.id].value || '').replace(',', '.'));
          if (!isNaN(v) && v !== 0) await DB.upsertPayment({ period_id: pid, item_id: item.id, amount: v });
          else if (period?.payments?.find(x => x.item_id === item.id)) await DB.upsertPayment({ period_id: pid, item_id: item.id, amount: 0 });
        }
        await DB.deleteReadings(pid);
        for (const { kind, zone, inp } of readingInputs) {
          const v = parseFloat((inp.value || '').replace(',', '.'));
          if (!isNaN(v)) await DB.upsertReading({ period_id: pid, kind, zone, value: v });
        }
        state.data = null;
        go(`#/object/${o.id}`);
      } catch (err) { showError(err); }
    }
  }, 'Сохранить');

  app.append(
    el('div', { class: 'card' },
      el('div', { class: 'row' },
        el('div', {}, el('label', {}, 'Год'), year),
        el('div', { style: 'flex:2' }, el('label', {}, 'Период'), label)),
      sugg),
    cardOcr, cardItems, totalDiv, cardRead,
    el('div', { style: 'margin:14px 0' }, save)
  );
  updateTotal();
}

// ---------- object settings (в т.ч. свои статьи: добавить/переименовать/удалить) ----------
async function renderObjectSettings() {
  const o = state.object;
  app.innerHTML = '';
  app.append(el('button', { class: 'back', onclick: () => go(`#/object/${o.id}`) }, o.name));
  app.append(el('h1', {}, 'Настройки объекта'));
  try {
    if (!state.items) state.items = await DB.listItems(o.id);
  } catch (err) { return showError(err); }

  const name = el('input', { value: o.name });
  const split = el('input', { type: 'checkbox' }); split.checked = o.split_water;

  // локальные копии для редактирования списка статей
  const items = state.items.map(i => ({ ...i }));
  const removed = new Set();

  const itemsCard = el('div', { class: 'card' }, el('h2', {}, 'Статьи платежей'));
  const listBox = el('div', {});
  itemsCard.append(listBox);

  function refreshList() {
    listBox.innerHTML = '';
    items.filter(i => !removed.has(i.id)).forEach((item, idx) => {
      const titleInp = el('input', { value: item.title, oninput: () => { item.title = titleInp.value; } });
      const matchInp = el('input', {
        value: item.gis_match || '',
        placeholder: 'например: Водоканал;МУП города Хабаровска',
        oninput: () => { item.gis_match = matchInp.value; }
      });
      const up = el('button', { class: 'link', title: 'Выше', onclick: () => { if (idx > 0) { const vis = items.filter(i => !removed.has(i.id)); const a = vis[idx], b = vis[idx - 1]; const ia = items.indexOf(a), ib = items.indexOf(b); [items[ia], items[ib]] = [items[ib], items[ia]]; refreshList(); } } }, '↑');
      const down = el('button', { class: 'link', title: 'Ниже', onclick: () => { const vis = items.filter(i => !removed.has(i.id)); if (idx < vis.length - 1) { const a = vis[idx], b = vis[idx + 1]; const ia = items.indexOf(a), ib = items.indexOf(b); [items[ia], items[ib]] = [items[ib], items[ia]]; refreshList(); } } }, '↓');
      const del = el('button', { class: 'link', style: 'color:var(--danger)', onclick: () => { removed.add(item.id); refreshList(); } }, 'удалить');
      listBox.append(
        el('div', { class: 'item-block' },
          el('div', { class: 'item-row' }, titleInp, up, down, del),
          el('div', { class: 'item-row', style: 'margin-bottom:10px' },
            el('div', { style: 'flex:1' },
              el('label', { style: 'margin:0 0 4px' }, 'Соответствие ГИС ЖКХ (получатель в квитанции, через «;»)'),
              matchInp)))
      );
    });
    if (!items.filter(i => !removed.has(i.id)).length) listBox.append(el('div', { class: 'muted' }, 'Статей нет — добавьте хотя бы одну ниже.'));
  }
  refreshList();

  // добавление стандартной статьи из справочника
  const usedKeys = () => new Set(items.filter(i => !removed.has(i.id)).map(i => i.key));
  const stdSel = el('select', {});
  function refreshStd() {
    stdSel.innerHTML = '';
    const used = usedKeys();
    const avail = ITEM_CATALOG.filter(([k]) => !used.has(k));
    if (!avail.length) { stdSel.append(el('option', { value: '' }, '— все стандартные добавлены —')); return; }
    avail.forEach(([k, t]) => stdSel.append(el('option', { value: k }, t)));
  }
  refreshStd();
  const addStd = () => {
    if (!stdSel.value) return;
    const t = ITEM_CATALOG.find(([k]) => k === stdSel.value)[1];
    items.push({ id: null, key: stdSel.value, title: t, gis_match: '' });
    refreshList(); refreshStd();
  };

  // добавление своей статьи
  const customInp = el('input', { placeholder: 'Название своей статьи, напр. «Интернет»' });
  const addCustom = () => {
    const t = customInp.value.trim();
    if (!t) return;
    const slug = 'custom_' + Date.now().toString(36);
    items.push({ id: null, key: slug, title: t, gis_match: '' });
    customInp.value = '';
    refreshList(); refreshStd();
  };

  itemsCard.append(
    el('div', { class: 'row', style: 'margin-top:12px;align-items:center' },
      el('div', { style: 'flex:2' }, stdSel), el('button', { class: 'btn secondary small', onclick: addStd }, 'Добавить')),
    el('div', { class: 'row', style: 'margin-top:8px;align-items:center' },
      el('div', { style: 'flex:2' }, customInp), el('button', { class: 'btn secondary small', onclick: addCustom }, 'Своя статья'))
  );

  app.append(
    el('div', { class: 'card' },
      el('label', {}, 'Название'), name,
      el('label', { class: 'chk' }, split, 'Разделять воду на кухня/ванная')),
    itemsCard,
    el('button', {
      class: 'btn', onclick: async () => {
        try {
          await DB.updateObject(o.id, { name: name.value.trim(), split_water: split.checked });
          // удалённые
          for (const id of removed) await DB.deleteItem(id);
          // переименованные / новые порядок / изменённое соответствие
          const visible = items.filter(i => !removed.has(i.id));
          for (let i = 0; i < visible.length; i++) {
            const it = visible[i];
            const match = (it.gis_match || '').trim() || null;
            if (it.id) {
              const orig = state.items.find(x => x.id === it.id);
              const origMatch = (orig.gis_match || '').trim() || null;
              if (orig.title !== it.title || orig.sort_order !== i || origMatch !== match) {
                await DB.upsertItem({ object_id: o.id, key: it.key, title: it.title, sort_order: i, gis_match: match });
              }
            } else {
              await DB.upsertItem({ object_id: o.id, key: it.key, title: it.title, sort_order: i, gis_match: match });
            }
          }
          o.name = name.value.trim(); o.split_water = split.checked;
          state.items = await DB.listItems(o.id);
          await loadObjects();
          state.data = null;
          go(`#/object/${o.id}`);
        } catch (err) { showError(err); }
      }
    }, 'Сохранить')
  );
}

// ---------- reports ----------
async function renderReports() {
  app.innerHTML = '';
  app.append(el('h1', {}, 'Отчёты'));
  const now = new Date();
  const curYear = now.getFullYear();
  const yearSel = el('select', {});
  for (let y = curYear + 1; y >= curYear - 10; y--) yearSel.append(el('option', { value: y }, String(y)));
  yearSel.value = String(curYear);
  const monthSel = el('select', {});
  monthSel.append(el('option', { value: '' }, 'Весь год'));
  MONTHS.forEach((m, i) => monthSel.append(el('option', { value: i + 1 }, m)));

  // мультивыбор объектов — шторка снизу экрана, как системный список iOS
  const allChk = el('input', { type: 'checkbox' });
  allChk.checked = true;
  const objChks = {};
  const objBox = el('div', { class: 'drop-sheet' });
  const back = el('div', { class: 'drop-back' });
  const doneBtn = el('button', { class: 'sheet-done', onclick: () => closeSheet() }, 'Готово');
  const dropBtn = el('button', { class: 'drop-btn', type: 'button' }, 'Все объекты');
  function dropLabel() {
    const checked = Object.values(objChks).filter(c => c.checked).length;
    const total = Object.keys(objChks).length;
    dropBtn.textContent = checked === total ? 'Все объекты' : `Выбрано: ${checked} из ${total}`;
  }
  function openSheet() { back.style.display = 'block'; objBox.style.display = 'block'; doneBtn.style.display = 'block'; }
  function closeSheet() { back.style.display = 'none'; objBox.style.display = 'none'; doneBtn.style.display = 'none'; }
  objBox.addEventListener('click', e => e.stopPropagation());
  doneBtn.addEventListener('click', e => e.stopPropagation());
  back.addEventListener('click', closeSheet);
  dropBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (objBox.style.display === 'block') closeSheet(); else openSheet();
  });
  const pairs = [];
  for (const o of state.objects) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = true;
    objChks[o.name] = cb;
    const lbl = el('label', { class: 'chk on' }, cb, o.name);
    cb.addEventListener('change', () => {
      if (!cb.checked) allChk.checked = false;
      else if (Object.values(objChks).every(c => c.checked)) allChk.checked = true;
      lbl.classList.toggle('on', cb.checked);
      allRow.classList.toggle('on', allChk.checked);
      dropLabel();
    });
    pairs.push([cb, lbl]);
    objBox.append(lbl);
  }
  allChk.addEventListener('change', () => {
    for (const [c, l] of pairs) { c.checked = allChk.checked; l.classList.toggle('on', allChk.checked); }
    dropLabel();
  });
  const allRow = el('label', { class: 'chk on' }, allChk, 'Все объекты');
  objBox.insertBefore(allRow, objBox.firstChild);
  dropLabel();

  const goBtn = el('button', { class: 'btn', onclick: showReport, style: 'margin-top:16px' }, 'Показать');
  const out = el('div', {});
  app.append(el('div', { class: 'card' },
    el('div', { class: 'row' },
      el('div', {}, el('label', {}, 'Год'), yearSel),
      el('div', {}, el('label', {}, 'Период'), monthSel)),
    el('label', {}, 'Объекты'),
    el('div', { class: 'drop-wrap' }, dropBtn),
    goBtn), out);
  // шторка и затемнение — fixed-элементы; app.innerHTML='' при перерисовке их уберёт
  app.append(back, objBox, doneBtn);

  const monthOf = (p) => Math.round((p.sort_key - p.year) * 100);

  async function showReport() {
    out.innerHTML = '';
    try {
      const y = parseInt(yearSel.value, 10);
      const mFilter = monthSel.value ? parseInt(monthSel.value, 10) : null;
      const activeNames = Object.entries(objChks).filter(([, c]) => c.checked).map(([n]) => n);
      const periodName = mFilter ? `${MONTHS[mFilter - 1]} ${y}` : `${y} год`;
      if (!activeNames.length) { out.append(el('div', { class: 'card muted' }, 'Отметьте хотя бы один объект')); return; }

      let periods = (await DB.allPeriodsWithPayments(y))
        .filter(p => activeNames.includes(p.objects?.name));
      if (mFilter) periods = periods.filter(p => monthOf(p) === mFilter);

      const byObject = {};
      for (const p of periods) {
        const name = p.objects?.name || '?';
        byObject[name] = (byObject[name] || 0) + periodTotal(p);
      }
      const names = activeNames.filter(n => byObject[n] !== undefined);
      if (!names.length) { out.append(el('div', { class: 'card muted' }, `Нет данных: ${periodName}`)); return; }

      const table = el('table');
      table.append(el('tr', {}, el('th', {}, 'Объект'), el('th', {}, 'Итого, ₽')));
      let sum = 0;
      names.forEach(n => { sum += byObject[n]; table.append(el('tr', {}, el('td', {}, n), el('td', {}, fmtMoney(byObject[n])))); });
      table.append(el('tr', { class: 'total' }, el('td', {}, 'Всего'), el('td', {}, fmtMoney(sum))));
      out.append(el('div', { class: 'card' }, el('h2', {}, `Итоги: ${periodName}`), table));

      const cv = el('canvas', {});
      out.append(el('div', { class: 'card' }, cv));
      drawBars(cv, names, names.map(n => byObject[n]), `Итого: ${periodName}, ₽`);

      // динамика: первый отмеченный объект
      const dynObj = activeNames[0];
      const list = (await DB.allPeriodsWithPayments(y))
        .filter(p => p.objects?.name === dynObj)
        .sort((a, b) => a.sort_key - b.sort_key);
      const labels = list.map(p => p.label);
      const dynCard = el('div', { class: 'card' }, el('h2', {}, `Динамика: ${dynObj}`), el('canvas', {}));
      out.append(dynCard);
      drawLine(dynCard.querySelector('canvas'), labels, list.map(periodTotal), `${dynObj}, ${y} год, ₽/месяц`);
    } catch (err) { showError(err); }
  }
}

boot().catch(showError);
