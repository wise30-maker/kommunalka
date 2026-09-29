// Стенд для отладки распознавания квитанций: гоняет наш vendored Tesseract.js
// (vendor/tesseract) с русским пакетом по изображению и перебирает режимы сегментации.
// Требует установленный рядом tesseract.js (npm i tesseract.js@5) — используется только
// для разработки, на сайте движок подключается напрямую из vendor/.
//
// Использование:
//   node tools/ocr_test.js путь/к/скриншоту.png            # перебор PSM
//   node tools/ocr_test.js путь/к/скриншоту.png 11         # один режим, полный текст
const { createWorker } = require('tesseract.js');
const path = require('path');

const VENDOR = path.join(__dirname, '..', 'vendor', 'tesseract').replace(/\\/g, '/');
const IMG = process.argv[2];
const ONLY = process.argv[3];

if (!IMG) { console.error('укажите путь к изображению'); process.exit(2); }

const VARIANTS = [
  { name: 'psm 3 (по умолчанию)', psm: '3' },
  { name: 'psm 4 (колонка текста)', psm: '4' },
  { name: 'psm 6 (единый блок)', psm: '6' },
  { name: 'psm 11 (разрозненный текст)', psm: '11' },
];

(async () => {
  // cachePath — во временный каталог: иначе tesseract.js распаковывает языковой файл
  // рядом с рабочей копией (в корень проекта)
  const cachePath = require('os').tmpdir();
  const worker = await createWorker('rus', 1, { langPath: VENDOR, corePath: VENDOR, gzip: true, cachePath });
  const list = ONLY ? VARIANTS.filter(v => v.psm === ONLY) : VARIANTS;
  for (const v of list) {
    await worker.setParameters({ tessedit_pageseg_mode: v.psm });
    const t0 = Date.now();
    const { data } = await worker.recognize(IMG);
    const lines = data.text.trim().split('\n').filter(l => l.trim());
    const money = lines.filter(l => /\d+[.,]\d{2}/.test(l));
    console.log(`\n===== ${v.name} ===== (${((Date.now() - t0) / 1000).toFixed(1)} с, ${Math.round(data.confidence)}%, строк ${lines.length}, с суммами ${money.length})`);
    if (ONLY) console.log(data.text.trim());
    else money.forEach(l => console.log('   ₽:', l.trim()));
  }
  await worker.terminate();
})().catch(e => { console.error('ОШИБКА:', e.message); process.exit(1); });
