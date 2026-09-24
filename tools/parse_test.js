// Стенд парсера квитанций: прогоняет js/receipt-parse.js по тексту (обычно — выводу OCR)
// с набором статей объекта и печатает результат «статья → сумма» + проблемы.
//
// Использование:
//   node tools/parse_test.js migrate/ocr_sample_f193.txt [items.json]
// items.json (необязательно) — массив статей вида
//   [{"id":"1","key":"kvartplata","title":"Квартплата","gis_match":"Магнит"}]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const textFile = process.argv[2];
const itemsFile = process.argv[3];
if (!textFile) { console.error('укажите файл с текстом квитанции'); process.exit(2); }

// статьи по умолчанию — пример под Хабаровск (реальные заполняются в настройках объекта)
const DEFAULT_ITEMS = [
  { id: '1', key: 'kvartplata', title: 'Квартплата (коммуналка)', gis_match: 'Магнит' },
  { id: '2', key: 'voda', title: 'Вода', gis_match: 'Водоканал;МУП города Хабаровска' },
  { id: '3', key: 'electro', title: 'Электроэнергия', gis_match: 'ДЭК' },
  { id: '4', key: 'tko', title: 'ТКО', gis_match: null }
];

const items = itemsFile ? JSON.parse(fs.readFileSync(itemsFile, 'utf8')) : DEFAULT_ITEMS;
const text = fs.readFileSync(textFile, 'utf8');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'receipt-parse.js'), 'utf8'), sandbox);
const R = sandbox.window.ReceiptParse;

const res = R.parse(text, items);

console.log('=== документы ===');
res.rows.forEach(r => {
  const amount = r.suspicious ? `? ${r.amount === null ? '(подозрительно, похоже ' + r.suggested + ')' : r.amount}` : r.amount.toFixed(2);
  console.log(`  ${r.status.padEnd(10)} ${(r.payee || '—').padEnd(34)} ${String(amount).padStart(22)} → ${r.itemTitle || 'НЕ РАСПОЗНАНО'}`);
});

console.log('\n=== итоги по статьям ===');
res.byItem.forEach(b => {
  const it = items.find(i => i.id === b.itemId);
  console.log(`  ${(it ? it.title : b.itemId).padEnd(28)} ${b.amount.toFixed(2)}`);
});

console.log('\n=== контроль ===');
console.log('  разобрано документов:', res.rows.length);
console.log('  распознано всего:', res.recognized.toFixed(2));
console.log('  итог «К оплате» из квитанции:', res.total === null ? 'не найден' : res.total.toFixed(2));
console.log('  расхождение:', res.diff === null ? '—' : res.diff.toFixed(2));
if (res.problems.length) {
  console.log('\n=== на проверку ===');
  res.problems.forEach(p => console.log('  [' + p.kind + '] ' + p.text));
}
