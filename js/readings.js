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

  // средний месячный расход за год: разницы между соседними показаниями,
  // включая переход с прошлого года на текущий. Нулевые разницы учитываются
  // (счётчик не менялся = расход 0), убывающие игнорируются (замена/сброс счётчика).
  function avgMonthly(periods, kind, zone, year, excludeId) {
    const s = series(periods, kind, zone, excludeId);
    const deltas = [];
    let prev = null, decreasing = 0;
    for (const row of s) {
      if (prev && (prev.year === Number(year) || row.year === Number(year))) {
        const d = row.value - prev.value;
        if (d >= 0) deltas.push(d);
        else decreasing++;
      }
      prev = row;
    }
    if (!deltas.length) return null;
    const average = deltas.reduce((sum, v) => sum + v, 0) / deltas.length;
    return { average, samples: deltas.length, unchanged: deltas.every(d => d === 0), decreasing };
  }

  // сколько знаков после запятой, чтобы предложение не было точнее, чем сами показания
  function decimals(v) {
    const s = String(v);
    const dot = s.indexOf('.');
    return dot === -1 ? 0 : Math.min(3, s.length - dot - 1);
  }

  // предложение показания: последнее + средний расход за год
  function suggest(periods, kind, zone, year, excludeId) {
    const prev = previous(periods, kind, zone, excludeId);
    const stat = avgMonthly(periods, kind, zone, year, excludeId);
    if (!prev || !stat) return { prev, average: null, samples: 0, unchanged: false, value: null };
    const value = Number((prev.value + stat.average).toFixed(decimals(prev.value)));
    return { prev, average: stat.average, samples: stat.samples, unchanged: stat.unchanged, value };
  }

  root.Readings = { series, previous, avgMonthly, suggest, decimals };
})(typeof window !== 'undefined' ? window : globalThis);
