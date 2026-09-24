// Разбор распознанного текста квитанции в суммы по статьям расходов.
// Работает полностью на клиенте; ничего не отправляет. Используется формой периода:
// OCR → ReceiptParse.parse(text, items) → превью → «Применить».
//
// Порядок сопоставления:
//   1) реквизит статьи «Соответствие ГИС ЖКХ» (подстроки получателя через «;»),
//   2) словарь синонимов услуги по названию статьи,
//   3) иначе — строка «не распознано» (пользователь выбирает статью вручную).
window.ReceiptParse = (() => {
  // латинские/цифровые двойники кириллицы, которые подставляет OCR
  const HOMOGLYPHS = {
    a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', k: 'к', m: 'м', t: 'т',
    h: 'н', b: 'в', 0: 'о', 3: 'з', 6: 'б'
  };

  // нормализация для показа человеку: кавычки, пробелы
  function norm(s) {
    return String(s || '')
      .replace(/[«»“”„‟″]/g, '"')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  // ключ для сравнения: без регистра, знаков и пробелов, с учётом двойников
  function key(s) {
    const lowered = norm(s).toLowerCase().replace(/ё/g, 'е');
    let out = '';
    for (const ch of lowered) {
      if (/[а-яa-z0-9]/.test(ch)) out += (HOMOGLYPHS[ch] || ch);
    }
    return out;
  }

  // денежное число с валютным признаком: «795,63 Р», «К оплате 8 292,04 ₽», «56756 Р»
  // (важно: \b не работает с кириллицей — используем явный запрет следующего символа)
  const MONEY_RE = /(\d[\d \u00a0]*(?:[.,]\d{2})?)\s*(?:₽|руб\.?|(?:р|е)(?![а-яёa-z0-9]))/gi;

  function toNumber(raw) {
    return parseFloat(String(raw).replace(/[ \u00a0]/g, '').replace(',', '.'));
  }

  // суммы в тексте: [{ amount, suspicious, suggested, line }]
  function parseAmounts(text) {
    const out = [];
    for (const rawLine of String(text).split('\n')) {
      const l = norm(rawLine);
      if (!l) continue;
      MONEY_RE.lastIndex = 0;
      let m;
      while ((m = MONEY_RE.exec(l)) !== null) {
        const digits = m[1].trim();
        const hasDecimals = /[.,]\d{1,2}$/.test(digits);
        const value = toNumber(digits);
        if (!isFinite(value) || value <= 0) continue;
        // «56756» — OCR потерял запятую: помечаем и предлагаем 567,56
        const suspicious = !hasDecimals && digits.replace(/[^\d]/g, '').length >= 4;
        out.push({
          amount: suspicious ? null : value,
          suspicious,
          suggested: suspicious ? toNumber(digits.replace(/[^\d]/g, '').replace(/(\d{2})$/, ',$1')) : null,
          line: l
        });
      }
    }
    return out;
  }

  // итог квитанции «К оплате 8 292,04 ₽»
  function parseTotal(text) {
    for (const rawLine of String(text).split('\n')) {
      const l = norm(rawLine);
      if (/к\s*оплате/i.test(l)) {
        const found = parseAmounts(l).filter(a => a.amount !== null);
        if (found.length) return found[found.length - 1].amount;
      }
    }
    return null;
  }

  // получатель: ближайшая строка выше с признаком организации, пропуская «платёжный документ…»
  const ORG_RE = /(ооо|оао|зао|пао|ао|муп|гуп|ип|филиал|нко|фонд|тсж|жск|энергосбыт|водоканал|регионгаз|расчетный)/i;

  // чистим хвостовые артефакты OCR: «ООО "РЕГСТРОЙКОМ" 2», «... 7», «... @»
  function cleanPayee(s) {
    return norm(s).replace(/[\s"'«»]+\d{1,2}$/, '').replace(/\s+[^\wа-яё"'\-().]+\s*$/i, '').trim();
  }

  function parseEntries(text) {
    const lines = String(text).split('\n').map(norm);
    const entries = [];
    lines.forEach((line, idx) => {
      if (!line) return;
      if (/к\s*оплате/i.test(line)) return;   // это итог квитанции, а не документ
      const amounts = parseAmounts(line);
      if (!amounts.length) return;
      for (const a of amounts) {
        // получатель — выше по тексту: организация, без «платёжный документ» и без сумм
        let payee = null;
        for (let back = idx - 1; back >= Math.max(0, idx - 6); back--) {
          const cand = lines[back];
          if (!cand) continue;
          if (/платёжн|не оплачен|сбросить|к оплате/i.test(cand)) continue;
          if (parseAmounts(cand).length) break;
          if (ORG_RE.test(cand)) { payee = cleanPayee(cand); break; }
        }
        entries.push({
          payee,
          payeeKey: payee ? key(payee) : null,
          amount: a.amount,
          suspicious: a.suspicious,
          suggested: a.suggested,
          line: a.line
        });
      }
    });
    return entries;
  }

  // словарь синонимов — только названия УСЛУГ (получатели определяются реквизитом
  // «Соответствие ГИС ЖКХ», а не угадыванием по названию организации)
  const SYNONYMS = {
    kvartplata: ['коммунал', 'квартплат', 'содержан', 'жилищн'],
    electro: ['электро', 'энерг'],
    voda: ['водоканал', 'водоснабж', 'водоотведен', 'холодная вода', 'горячая вода'],
    tko: ['тко', 'отход', 'мусор'],
    domofon: ['домофон'],
    kapremont: ['капремонт', 'капитальн'],
    otoplenie: ['отоплен', 'теплоснаб', 'тепло'],
    gaz: ['газоснабж', 'межрегионгаз', 'газ'],
    tv: ['телевид', 'тв']
  };

  function matchesItem(entry, item) {
    const variants = String(item.gis_match || '').split(/[;,]/).map(v => key(v)).filter(v => v.length >= 3);
    for (const v of variants) {
      if (entry.payeeKey && entry.payeeKey.includes(v)) return true;
      if (key(entry.line).includes(v)) return true;
    }
    return false;
  }

  function matchesSynonyms(entry, item) {
    const pool = key((entry.payee || '') + ' ' + entry.line);
    const dict = SYNONYMS[item.key] || [];
    const titleWords = key(item.title);
    return dict.some(w => pool.includes(key(w))) || (titleWords.length >= 5 && pool.includes(titleWords));
  }

  // главная функция: текст + статьи объекта → строки «статья → сумма» + проблемы
  function parse(text, items) {
    const entries = parseEntries(text);
    const rows = [];
    const problems = [];

    for (const e of entries) {
      const byMatch = items.filter(it => matchesItem(e, it));
      const bySyn = byMatch.length ? [] : items.filter(it => matchesSynonyms(e, it));
      const candidates = byMatch.length ? byMatch : bySyn;

      if (e.suspicious) {
        problems.push({ kind: 'amount', text: `Сумма без копеек: «${e.line}» — проверьте (возможно ${e.suggested !== null ? e.suggested.toFixed(2).replace('.', ',') : '?'})`, entry: e });
      }
      if (!candidates.length) {
        problems.push({ kind: 'unmatched', text: `Не найдена статья для «${e.payee || e.line}»`, entry: e });
        rows.push({ itemId: null, itemTitle: null, amount: e.amount, suspicious: e.suspicious, suggested: e.suggested, payee: e.payee, status: 'unknown' });
      } else if (candidates.length > 1) {
        problems.push({ kind: 'ambiguous', text: `Получателю «${e.payee}» соответствуют несколько статей: ${candidates.map(c => c.title).join(', ')}`, entry: e });
        rows.push({ itemId: candidates[0].id, itemTitle: candidates[0].title, amount: e.amount, suspicious: e.suspicious, suggested: e.suggested, payee: e.payee, status: 'ambiguous', candidates: candidates.map(c => c.id) });
      } else {
        rows.push({ itemId: candidates[0].id, itemTitle: candidates[0].title, amount: e.amount, suspicious: e.suspicious, suggested: e.suggested, payee: e.payee, status: 'matched' });
      }
    }

    // суммирование по статьям (несколько документов одного получателя → одна статья)
    const byItem = new Map();
    let unassigned = 0;
    for (const r of rows) {
      const value = r.suspicious ? (r.suggested || 0) : r.amount;
      if (r.itemId) byItem.set(r.itemId, (byItem.get(r.itemId) || 0) + value);
      else unassigned += value;
    }

    const total = parseTotal(text);
    const recognized = [...byItem.values()].reduce((s, v) => s + v, 0) + unassigned;

    return {
      rows,
      problems,
      total,                                   // «К оплате» из квитанции (или null)
      byItem: [...byItem.entries()].map(([id, amount]) => ({ itemId: id, amount })),
      recognized,                              // сумма всех разобранных документов
      diff: total === null ? null : Number((recognized - total).toFixed(2)),
      hasSuspicious: rows.some(r => r.suspicious)
    };
  }

  return { parse, parseAmounts, parseTotal, parseEntries, key, norm };
})();
