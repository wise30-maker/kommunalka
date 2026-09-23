// Приложение «Коммуналка»: экраны, ввод, отчёты.
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

const state = { user: null, objects: [], object: null, data: null, view: 'objects' };

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
function monthNum(label) {
  const lower = label.toLowerCase();
  for (let i = 0; i < MONTHS.length; i++) if (lower.includes(MONTHS[i].toLowerCase())) return i + 1;
  return 0;
}
function showError(err) {
  app.prepend(el('div', { class: 'error' }, String(err?.message || err)));
  window.scrollTo(0, 0);
}
function navButton(text, view, active) {
  const b = el('button', { class: active ? 'active' : '', onclick: () => { state.view = view; render(); } }, text);
  return b;
}

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
  document.getElementById('btn-logout').onclick = () => { DB.logout(); location.reload(); };
  await loadObjects();
  render();
}

async function loadObjects() {
  state.objects = await DB.listObjects();
}

// ---------- render root ----------
function render() {
  topbarNav.innerHTML = '';
  topbarNav.append(navButton('Объекты', 'objects', state.view !== 'reports'));
  topbarNav.append(navButton('Отчёты', 'reports', state.view === 'reports'));
  if (state.view === 'reports') return renderReports();
  if (state.object) return renderObjectDetail();
  renderObjects();
}

// ---------- objects ----------
function renderObjects() {
  state.object = null;
  app.innerHTML = '';
  const nameInput = el('input', { placeholder: 'Новый объект, напр. «Ленина 1»' });
  const add = async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    try {
      await DB.createObject({ name, sort_order: state.objects.length });
      await loadObjects(); renderObjects();
    } catch (err) { showError(err); }
  };
  const list = el('div', { class: 'obj-list' });
  for (const o of state.objects) {
    list.append(el('button', { class: 'item', onclick: () => { state.object = o; render(); } }, o.name));
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
  app.append(el('button', { class: 'back', onclick: () => { state.object = null; render(); } }, '← Объекты'));
  app.append(el('h1', {}, o.name));
  try {
    state.data = await DB.loadObjectData(o.id);
    state.items = await DB.listItems(o.id);
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
      const edit = el('button', { class: 'link', onclick: () => renderPeriodForm(p) }, 'изменить');
      const del = el('button', {
        class: 'link', style: 'color:var(--danger)',
        onclick: async () => { if (confirm(`Удалить период «${p.label}»?`)) { try { await DB.deletePeriod(p.id); renderObjectDetail(); } catch (e) { showError(e); } } }
      }, 'удалить');
      table.append(el('tr', {}, el('td', {}, p.label), el('td', {}, fmtMoney(periodTotal(p))), el('td', {}, edit), el('td', {}, del)));
    }
    hist.append(table);
  }

  const newBtn = el('button', { class: 'btn', onclick: () => renderPeriodForm(null) }, '+ Новый месяц');
  const settingsBtn = el('button', { class: 'btn secondary', onclick: renderObjectSettings }, 'Настройки объекта');
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
function renderPeriodForm(period) {
  const o = state.object;
  app.innerHTML = '';
  app.append(el('button', { class: 'back', onclick: renderObjectDetail }, `← ${o.name}`));
  app.append(el('h1', {}, period ? `Изменить: ${period.label}` : 'Новый месяц'));

  const year = el('input', { type: 'number', inputmode: 'numeric', value: period?.year || new Date().getFullYear() });
  const label = el('input', { value: period?.label || '', placeholder: 'Октябрь или Август + Сентябрь' });
  const sugg = el('div', { class: 'row', style: 'margin-top:6px' });
  MONTHS.forEach(m => sugg.append(el('button', { class: 'btn secondary', style: 'padding:6px 10px;font-size:13px', onclick: () => { label.value = m; updateTotal(); } }, m)));

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
        await renderObjectDetail();
      } catch (err) { showError(err); }
    }
  }, 'Сохранить');

  app.append(
    el('div', { class: 'card' },
      el('div', { class: 'row' },
        el('div', {}, el('label', {}, 'Год'), year),
        el('div', { style: 'flex:2' }, el('label', {}, 'Период'), label)),
      sugg),
    cardItems, totalDiv, cardRead,
    el('div', { style: 'margin:14px 0' }, save)
  );
  updateTotal();
}

// ---------- object settings ----------
function renderObjectSettings() {
  const o = state.object;
  app.innerHTML = '';
  app.append(el('button', { class: 'back', onclick: renderObjectDetail }, `← ${o.name}`));
  app.append(el('h1', {}, 'Настройки объекта'));

  const name = el('input', { value: o.name });
  const split = el('input', { type: 'checkbox' }); split.checked = o.split_water;
  const checks = {};
  const cardItems = el('div', { class: 'card' }, el('h2', {}, 'Статьи платежей'));
  for (const [key, title] of ITEM_CATALOG) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = state.items.some(i => i.key === key);
    checks[key] = cb;
    cardItems.append(el('label', { class: 'chk' }, cb, title));
  }

  app.append(
    el('div', { class: 'card' },
      el('label', {}, 'Название'), name,
      el('label', { class: 'chk' }, split, 'Разделять воду на кухня/ванная'),
      cardItems),
    el('button', {
      class: 'btn', onclick: async () => {
        try {
          await DB.updateObject(o.id, { name: name.value.trim(), split_water: split.checked });
          for (const [key, title] of ITEM_CATALOG) {
            const existing = state.items.find(i => i.key === key);
            if (checks[key].checked && !existing) await DB.upsertItem({ object_id: o.id, key, title, sort_order: ITEM_CATALOG.findIndex(c => c[0] === key) });
            if (!checks[key].checked && existing) await DB.deleteItem(existing.id);
          }
          o.name = name.value.trim(); o.split_water = split.checked;
          state.items = await DB.listItems(o.id);
          await loadObjects();
          renderObjectDetail();
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
  const yearInp = el('input', { type: 'number', inputmode: 'numeric', value: now.getFullYear() });
  const monthSel = el('select', {});
  monthSel.append(el('option', { value: '' }, 'Весь год'));
  MONTHS.forEach((m, i) => monthSel.append(el('option', { value: i + 1 }, m)));
  const objSel = el('select', {});
  objSel.append(el('option', { value: '' }, 'Все объекты'));
  for (const o of state.objects) objSel.append(el('option', { value: o.name }, o.name));
  const go = el('button', { class: 'btn', onclick: showReport, style: 'margin-top:22px' }, 'Показать');
  const out = el('div', {});
  app.append(el('div', { class: 'card' },
    el('div', { class: 'row' },
      el('div', {}, el('label', {}, 'Год'), yearInp),
      el('div', {}, el('label', {}, 'Период'), monthSel),
      el('div', {}, el('label', {}, 'Объект'), objSel)),
    go), out);

  const monthOf = (p) => Math.round((p.sort_key - p.year) * 100);

  async function showReport() {
    out.innerHTML = '';
    try {
      const y = parseInt(yearInp.value, 10);
      const mFilter = monthSel.value ? parseInt(monthSel.value, 10) : null;
      const oFilter = objSel.value;
      let periods = await DB.allPeriodsWithPayments(y);
      if (mFilter) periods = periods.filter(p => monthOf(p) === mFilter);
      if (oFilter) periods = periods.filter(p => p.objects?.name === oFilter);

      const byObject = {};
      for (const p of periods) {
        const name = p.objects?.name || '?';
        byObject[name] = (byObject[name] || 0) + periodTotal(p);
      }
      const names = Object.keys(byObject);
      const periodName = mFilter ? `${MONTHS[mFilter - 1]} ${y}` : `${y} год`;
      if (!names.length) { out.append(el('div', { class: 'card muted' }, `Нет данных: ${periodName}`)); return; }

      const table = el('table');
      table.append(el('tr', {}, el('th', {}, 'Объект'), el('th', {}, `Итого, ₽`)));
      let sum = 0;
      names.forEach(n => { sum += byObject[n]; table.append(el('tr', {}, el('td', {}, n), el('td', {}, fmtMoney(byObject[n])))); });
      table.append(el('tr', { class: 'total' }, el('td', {}, 'Всего'), el('td', {}, fmtMoney(sum))));
      out.append(el('div', { class: 'card' }, el('h2', {}, `Итоги: ${periodName}`), table));

      const cv = el('canvas', {});
      out.append(el('div', { class: 'card' }, cv));
      drawBars(cv, names, names.map(n => byObject[n]), `Итого: ${periodName}, ₽`);

      // динамика по объекту (за год, если выбран месяц — только этот месяц по годам нет, берём год)
      const dynObj = oFilter || names[0];
      const list = (await DB.allPeriodsWithPayments(y))
        .filter(p => p.objects?.name === dynObj)
        .sort((a, b) => a.sort_key - b.sort_key);
      const labels = list.map(p => p.label.length > 12 ? p.label.slice(0, 11) + '…' : p.label);
      const dynCard = el('div', { class: 'card' }, el('h2', {}, `Динамика: ${dynObj}`), el('canvas', {}));
      out.append(dynCard);
      drawLine(dynCard.querySelector('canvas'), labels, list.map(periodTotal), `${dynObj}, ${y} год, ₽/месяц`);
    } catch (err) { showError(err); }
  }
}

boot().catch(showError);
