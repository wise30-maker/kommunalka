// Тонкая обёртка над Supabase REST (GoTrue + PostgREST). Без внешних зависимостей.
const DB = (() => {
  const URL = window.KONFIG.SUPABASE_URL;
  const KEY = window.KONFIG.SUPABASE_ANON_KEY;
  const LS_KEY = 'kommunalka_session';

  async function auth(path, opts = {}) {
    const r = await fetch(`${URL}/auth/v1${path}`, {
      method: opts.method || 'POST',
      headers: { 'apikey': KEY, 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error_description || data.msg || data.message || `Auth error ${r.status}`);
    return data;
  }

  function session() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; }
  }
  function saveSession(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(LS_KEY); }

  async function rest(path, opts = {}) {
    const s = session();
    if (!s) throw new Error('Нет сессии');
    const headers = {
      'apikey': KEY,
      'Authorization': `Bearer ${s.access_token}`,
      'Content-Type': 'application/json'
    };
    if (opts.prefer) headers['Prefer'] = opts.prefer;
    const r = await fetch(`${URL}/rest/v1${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (r.status === 204) return null;
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(data?.message || `API error ${r.status}`);
    return data;
  }

  return {
    async login(email, password) {
      const data = await auth('/token?grant_type=password', { body: { email, password } });
      saveSession(data);
      return data;
    },
    async currentUser() {
      const s = session();
      if (!s) return null;
      try {
        const r = await fetch(`${URL}/auth/v1/user`, { headers: { 'apikey': KEY, 'Authorization': `Bearer ${s.access_token}` } });
        if (!r.ok) { clearSession(); return null; }
        return await r.json();
      } catch { return null; }
    },
    logout() { clearSession(); },

    // данные
    listObjects: () => rest('/objects?select=*&order=sort_order'),
    createObject: (o) => rest('/objects', { method: 'POST', body: o, prefer: 'return=representation' }),
    updateObject: (id, o) => rest(`/objects?id=eq.${id}`, { method: 'PATCH', body: o, prefer: 'return=representation' }),
    deletePeriod: (id) => rest(`/periods?id=eq.${id}`, { method: 'DELETE' }),

    // gis_match — «Соответствие ГИС ЖКХ» (получатели платежей через «;»), используется при OCR
    listItems: (objectId) => rest(`/payment_items?object_id=eq.${objectId}&select=id,key,title,sort_order,gis_match&order=sort_order`),
    upsertItem: (row) => rest('/payment_items?on_conflict=object_id,key', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation' }),
    deleteItem: (id) => rest(`/payment_items?id=eq.${id}`, { method: 'DELETE' }),

    // объект целиком: периоды + платежи + статьи + показания
    // (явные колонки: select=* с вложенным embed вешает PostgREST — зависание запроса)
    loadObjectData: (objectId) => rest(
      `/periods?object_id=eq.${objectId}&select=id,year,label,sort_key,payments(amount,item_id,payment_items(key,title)),meter_readings(kind,zone,value)&order=sort_key`
    ),

    upsertPeriod: (row) => rest('/periods?on_conflict=object_id,year,label', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation' }),
    upsertPayment: (row) => rest('/payments?on_conflict=period_id,item_id', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation' }),
    upsertReading: (row) => rest('/meter_readings?on_conflict=period_id,kind,zone', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation' }),
    deleteReadings: (periodId) => rest(`/meter_readings?period_id=eq.${periodId}`, { method: 'DELETE' }),

    // отчёты (итоги считаются по сумме payments; разбивка по статьям не нужна)
    allPeriodsWithPayments: (year) => rest(
      `/periods?year=eq.${year}&select=year,label,sort_key,object_id,objects(name),payments(amount)&order=sort_key`
    ),
  };
})();
