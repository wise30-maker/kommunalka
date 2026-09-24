// Расчёты по показаниям счётчиков: предыдущее показание и средний месячный расход за год.
// Используется формой периода («предыдущие показания» и кнопка «заполнить по среднему»).
// Работает и в браузере, и в Node (для стенда tools/readings_test.js).
(function (root) {
  const num = v => (v === null || v === undefined || v === '' ? null : Number(v));

  // периоды объекта: [{id, year, label, sort_key, meter_readings|readings:[{kind, zone, value}]}]
  function sortKeyOf(p) {
    if (p.sort_key !== null && p.sort_key !== undefined) return Number(p.sort_key);
    return Number(p.year || 0) + (Number(p.month) || 0) / 100;
  }

  function series(periods, kind, zone, excludeId) {
    const rows = [];
    for (const p of periods || []) {
      if (excludeId && p.id === excludeId) continue;
      const list = p.meter_readings || p.readings || [];
      const r = list.find(x => x.kind === kind && ((x.zone ?? null) === (zone ?? null)));
      const value = r ? num(r.value) : null;
      if (value !== null && !isNaN(value)) {
        rows.push({ sort_key: sortKeyOf(p), year: Number(p.year), label: p.label, value });
      }
    }
    return rows.sort((a, b) => a.sort_key - b.sort_key);
  }

  // последнее известное показание (обычно за предыдущий месяц)
  function previous(periods, kind, zone, excludeId) {
    const s = series(periods, kind, zone, excludeId);
    return s.length ? s[s.length - 1] : null;
  }

  // средний месячный расход по последним 3 месяцам:
  // берём последние (3 + 1) показания → до 3 промежутков, суммарную разницу делим
  // на число промежутков. Ноль = показания не менялись; убывание (замена/сброс) — без расчёта.
  const WINDOW_MONTHS = 3;

  function avgMonthly(periods, kind, zone, excludeId, windowMonths = WINDOW_MONTHS) {
    const s = series(periods, kind, zone, excludeId);
    if (s.length < 2) return null;
    const tail = s.slice(-(windowMonths + 1));
    const first = tail[0], last = tail[tail.length - 1];
    const intervals = tail.length - 1;
    const diff = last.value - first.value;
    return {
      average: diff > 0 ? diff / intervals : 0,
      intervals,
      unchanged: diff === 0,
      decreasing: diff < 0,
      from: first,
      to: last
    };
  }

  // сколько знаков после запятой, чтобы предложение не было точнее, чем сами показания
  function decimals(v) {
    const s = String(v);
    const dot = s.indexOf('.');
    return dot === -1 ? 0 : Math.min(3, s.length - dot - 1);
  }

  // предложение показания: последнее + средний расход по последним 3 месяцам
  function suggest(periods, kind, zone, excludeId, windowMonths) {
    const prev = previous(periods, kind, zone, excludeId);
    const stat = avgMonthly(periods, kind, zone, excludeId, windowMonths);
    if (!prev || !stat) return { prev, average: null, intervals: 0, unchanged: false, value: null };
    const value = Number((prev.value + stat.average).toFixed(decimals(prev.value)));
    return { prev, average: stat.average, intervals: stat.intervals, unchanged: stat.unchanged, value };
  }

  root.Readings = { series, previous, avgMonthly, suggest, decimals };
})(typeof window !== 'undefined' ? window : globalThis);
