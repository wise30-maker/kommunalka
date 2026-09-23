#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Разбор Таблица (13).xlsx -> JSON для заливки в Supabase. Только stdlib."""
import zipfile, re, json, sys, os
from xml.etree import ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}

MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь']

# Конфигурация листов: колонки Excel -> модель.
# items: заголовок в Excel -> ключ статьи; readings: колонка -> (kind, zone)
SHEETS = {
    'Фурманова 193': {
        'split_water': True,
        'start_year': 2024,
        'items': {'Комуналка': 'kvartplata', 'Э\\Э': 'electro', 'Вода': 'voda', 'ТКО': 'tko',
                  'Домофон': 'domofon', 'Кап. Рем': 'kapremont'},
        'readings': {'B': ('water_cold', 'kitchen'), 'C': ('water_hot', 'kitchen'),
                     'D': ('water_cold', 'bath'), 'E': ('water_hot', 'bath'),
                     'F': ('elec_day', None), 'G': ('elec_night', None)},
    },
    'Фурманова 177': {
        'split_water': False,
        'start_year': 2024,
        'items': {'Комуналка': 'kvartplata', 'Э\\Э': 'electro', 'Вода': 'voda', 'ТКО': 'tko',
                  'Домофон': 'domofon', 'Кап. Рем': 'kapremont'},
        'readings': {'B': ('water_cold', None), 'C': ('water_hot', None),
                     'D': ('elec_day', None), 'E': ('elec_night', None)},
    },
    'Нордик': {
        'split_water': False,
        'start_year': 2024,
        'items': {'Комуналка': 'kvartplata', 'Э\\Э': 'electro', 'Отопление': 'otoplenie', 'ТКО': 'tko',
                  'Домофон': 'domofon', 'Кап. Рем': 'kapremont', 'Вода': 'voda'},
        'readings': {'B': ('water_cold', None), 'C': ('water_hot', None),
                     'D': ('elec_day', None), 'E': ('elec_night', None)},
    },
    'Вахова 4': {
        'split_water': False,
        'start_year': 2026,
        'items': {'Комуналка': 'kvartplata', 'КапРемонт': 'kapremont'},
        'readings': {},
    },
    'Даниловского': {
        'split_water': False,
        'start_year': 2026,
        'items': {'Газ': 'gaz', 'ТВ': 'tv', 'ТКО': 'tko', 'Кап рем.': 'kapremont', 'Вода': 'voda',
                  'Комуналка': 'kvartplata', 'Отопление': 'otoplenie', 'Э/Э': 'electro', 'домофон': 'domofon'},
        'readings': {'B': ('water_cold', None), 'C': ('water_hot', None),
                     'D': ('elec_day', None), 'E': ('elec_night', None)},
    },
}

def col_to_num(col):
    n = 0
    for c in col:
        n = n * 26 + (ord(c) - 64)
    return n

def month_num(label):
    lower = label.lower()
    for i, m in enumerate(MONTHS):
        if m in lower:
            return i + 1
    return None

def parse_xlsx(path):
    z = zipfile.ZipFile(path)
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    sheets = [s.get('name') for s in wb.findall('.//m:sheet', NS)]
    ss_root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    shared = [''.join(t.text or '' for t in si.iter('{%s}t' % NS['m']))
              for si in ss_root.findall('m:si', NS)]
    out = {}
    for idx, name in enumerate(sheets, start=1):
        root = ET.fromstring(z.read(f'xl/worksheets/sheet{idx}.xml'))
        rows, formulas = {}, {}
        for row in root.findall('.//m:sheetData/m:row', NS):
            rnum = int(row.get('r'))
            cells, forms = {}, {}
            for c in row.findall('m:c', NS):
                ref = c.get('r')
                col = re.match(r'([A-Z]+)', ref).group(1)
                t = c.get('t')
                f = c.find('m:f', NS)
                v = c.find('m:v', NS)
                val = None
                if v is not None:
                    val = v.text
                    if t == 's':
                        val = shared[int(val)]
                    else:
                        try:
                            val = float(val)
                        except (TypeError, ValueError):
                            pass
                if f is not None and f.text:
                    forms[col] = f.text
                cells[col] = val
            rows[rnum] = cells
            if forms:
                formulas[rnum] = forms
        out[name] = (rows, formulas)
    return out

def convert(data):
    result = []
    for sheet_name, cfg in SHEETS.items():
        rows, formulas = data.get(sheet_name, ({}, {}))
        year = cfg['start_year']
        prev_month = None
        periods = []
        for rnum in sorted(rows):
            if rnum < 3:  # шапки
                continue
            label = rows[rnum].get('A')
            if not isinstance(label, str) or not label.strip():
                continue
            label = label.strip()
            m = month_num(label)
            if m is None:
                continue  # посторонние строки (например, блок подсчёта воды)
            if prev_month is not None and m < prev_month:
                year += 1
            prev_month = m
            colmap = _items_by_col(rows, cfg)
            approximate = False
            # Старый стиль: итог-формула из чисел в строке, а по-статьевых значений нет
            # (например I4 = "=4674.9+553.45+174+1680.55+515.03+2689.12").
            # Тогда слагаемые распределяются позиционно по статьям листа.
            numeric_formula = None
            for col, ftext in formulas.get(rnum, {}).items():
                if re.fullmatch(r'\s*\d+(\.\d+)?(\s*\+\s*\d+(\.\d+)?)*\s*', ftext):
                    numeric_formula = ftext
                    break
            row_forms = formulas.get(rnum, {})
            real_values = sum(1 for c in colmap
                              if c not in row_forms
                              and isinstance(rows[rnum].get(c), (int, float)))
            if numeric_formula and real_values == 0:
                terms = [float(t) for t in numeric_formula.split('+')]
                keys = [colmap[c] for c in sorted(colmap, key=col_to_num)]
                payments = {}
                for i, t in enumerate(terms):
                    key = keys[min(i, len(keys) - 1)]
                    payments[key] = round(payments.get(key, 0) + t, 2)
                approximate = True  # позиционное распределение — на проверку
            else:
                payments = {}
                for col, key in colmap.items():
                    v = rows[rnum].get(col)
                    if isinstance(v, (int, float)) and v != 0:
                        payments[key] = round(float(v), 2)
            readings = []
            for col, (kind, zone) in cfg['readings'].items():
                v = rows[rnum].get(col)
                if isinstance(v, (int, float)):
                    readings.append({'kind': kind, 'zone': zone, 'value': v})
            periods.append({'year': year, 'label': label, 'month': m,
                            'payments': payments, 'readings': readings,
                            'approximate': approximate})
        result.append({'name': sheet_name, 'split_water': cfg['split_water'],
                       'items': cfg['items'], 'periods': periods})
    return result

def _items_by_col(rows, cfg):
    """Находит колонки статей по заголовкам первых строк (шапка может быть в 1 или 2 строке)."""
    if '_colmap' in cfg:
        return cfg['_colmap']
    colmap = {}
    for rnum in (1, 2):
        for col, val in rows.get(rnum, {}).items():
            if isinstance(val, str):
                v = val.strip()
                if v in cfg['items']:
                    colmap[col] = cfg['items'][v]
    cfg['_colmap'] = colmap
    return colmap

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'data', 'Таблица (13).xlsx')
    out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), 'data.json')
    data = parse_xlsx(src)
    result = convert(data)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    for obj in result:
        labels = [f"{p['label']} {p['year']}" for p in obj['periods']]
        print(f"{obj['name']}: {len(obj['periods'])} периодов")
        print('  ' + '; '.join(labels))

if __name__ == '__main__':
    main()
