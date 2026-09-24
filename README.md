# kommunalka

Учёт коммунальных платежей по объектам недвижимости. Личный проект.
Статика на GitHub Pages + Supabase (Postgres, Auth).

- Сайт: https://wise30-maker.github.io/kommunalka/
- Задачи и спецификации: `openspec/changes/utility-payments-site/` (базовый функционал),
  `openspec/changes/receipt-ocr/` (распознавание квитанций по фото)

## Локальная разработка

Открыть `index.html` не получится (нужен конфиг Supabase) — см. `js/config.example.js`.

## Деплой

`python tools/deploy.py "сообщение коммита"` — публикация через GitHub API (git push в этой
сети не проходит). Скрипт:

- сам проставляет версии `?v=<sha8 содержимого>` для css/js в `index.html` (правки в браузере
  подхватываются без Ctrl+F5);
- загружает только изменившиеся файлы (сравнение git-hash с содержимым репозитория), поэтому
  7 МБ ассетов OCR в `vendor/` не перезаливаются при каждой правке.

## Ассеты OCR (`vendor/tesseract/`)

Локальное распознавание квитанций (Tesseract.js, WASM) — без LLM и без внешних сервисов:

- `tesseract.min.js`, `worker.min.js` — tesseract.js v5;
- `tesseract-core.wasm.js` — WASM-ядро (~4,7 МБ);
- `rus.traineddata.gz` — русский языковой пакет, вариант `4.0.0_best_int` (~2,7 МБ).

Источник: cdn.jsdelivr.net. Загружаются лениво при первом распознавании, дальше из кэша браузера.

## Отладка парсера без телефона

`tools/winocr.ps1` — распознавание изображения встроенным OCR Windows (WinRT, движок `ru`),
полностью локально. Использование:

```
powershell -NoProfile -ExecutionPolicy Bypass -File tools/winocr.ps1 -Path "C:\путь\квитанция.png" -Out "$env:TEMP\receipt.txt"
```

Вывод пишется в UTF-8 (иначе кириллица ломается в консоли). Служит стендом для отладки
парсера `js/receipt-parse.js` на реальных скриншотах.

`tools/ocr_test.js` — прогон того же движка, что на сайте (Tesseract.js из `vendor/`), по
изображению с перебором режимов сегментации. Нужен установленный рядом `tesseract.js`:

```
npm install tesseract.js@5
NODE_PATH=<каталог>/node_modules node tools/ocr_test.js путь/к/квитанции.png      # перебор PSM
NODE_PATH=<каталог>/node_modules node tools/ocr_test.js путь/к/квитанции.png 11   # один режим, полный текст
```

Рабочий режим для квитанций — **PSM 11** (разрозненный текст): на тестовом скриншоте он единственный
верно распознал и все пять сумм, и итог «К оплате 8 292,04 ₽».

## Токены

Файлы `js/config.js` и любые токены НЕ коммитятся (см. `.gitignore`).
