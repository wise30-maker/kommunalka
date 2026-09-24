// Стенд расчётов по показаниям: прогоняет js/readings.js по реальным данным
// (migrate/data.json — выгрузка из Excel) и печатает предыдущие показания,
// средний месячный расход и предложение на следующий месяц.
//
// Использование:
//   node tools/readings_test.js [год] [объект]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const year = Number(process.argv[2] || new Date().getFullYear());
const onlyObject = process.argv[3];

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'migrate', 'data.json'), 'utf8'));
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'readings.js'), 'utf8'), sandbox);
const R = sandbox.window.Readings;

const KINDS = [
  ['water_cold', 'Холодная вода'],
  ['water_hot', 'Горячая вода'],
  ['elec_day', 'Электро день'],
  ['elec_night', 'Электро ночь']
];

for (const obj of data) {
  if (onlyObject && obj.name !== onlyObject) continue;
  // приводим периоды объекта к виду, который понимает модуль (readings → meter_readings)
  const periods = obj.periods.map((p, i) => ({
    id: 'p' + i, year: p.year, label: p.label, month: p.month,
    meter_readings: (p.readings || []).map(r => ({ kind: r.kind, zone: r.zone ?? null, value: r.value }))
  }));
  console.log(`\n===== ${obj.name} (год ${year}, периодов ${periods.length}) =====`);
  for (const [kind, title] of KINDS) {
    const zones = (obj.split_water && kind.startsWith('water')) ? ['kitchen', 'bath'] : [null];
    for (const zone of zones) {
      const s = R.suggest(periods, kind, zone, year, null);
      const count = R.series(periods, kind, zone, null).length;
      const zoneName = zone === 'kitchen' ? 'кухня' : zone === 'bath' ? 'ванная' : '';
      const name = (title + (zoneName ? ' — ' + zoneName : '')).padEnd(34);
      if (s.value === null) {
        console.log(`  ${name} данных мало (записей: ${count}) — предложение не строится`);
      } else {
        console.log(`  ${name} предыдущее: ${s.prev.value} (${s.prev.label || s.prev.year})`
          + ` · средний расход: ${s.average.toFixed(3)} (по ${s.samples} разницам)`
          + ` → предложение: ${s.value}`);
      }
    }
  }
}
