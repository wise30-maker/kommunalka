#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Заливка migrate/data.json в Supabase через REST (upsert, идемпотентно).

Реквизиты владельца читаются из файла ~/.kommunalka-owner:
    строка 1: email
    строка 2: пароль
Файл локальный, в репозиторий не коммитится. Анон-ключ берётся из js/config.js.
"""
import json, re, sys, os, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg_js = open(os.path.join(ROOT, 'js', 'config.js'), encoding='utf-8').read()
URL = re.search(r'SUPABASE_URL:\s*"([^"]+)"', cfg_js).group(1)
KEY = re.search(r'SUPABASE_ANON_KEY:\s*"([^"]+)"', cfg_js).group(1)

creds = open(os.path.join(os.path.expanduser('~'), '.kommunalka-owner'), encoding='utf-8').read().splitlines()
EMAIL, PASSWORD = creds[0].strip(), creds[1].strip()

def req(method, path, body=None, token=None):
    r = urllib.request.Request(URL + path, method=method)
    r.add_header('apikey', KEY)
    r.add_header('Authorization', 'Bearer ' + (token or KEY))
    r.add_header('Content-Type', 'application/json')
    if method == 'POST':
        r.add_header('Prefer', 'resolution=merge-duplicates,return=representation')
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(r, data) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code} {path}: {e.read()[:400]}")

# вход владельца
auth = req('POST', '/auth/v1/token?grant_type=password',
           {'email': EMAIL, 'password': PASSWORD})
TOK = auth['access_token']
print('вход выполнен:', auth['user']['email'])

def rest(method, path, body=None):
    return req(method, path, body, token=TOK)

data = json.load(open(os.path.join(ROOT, 'migrate', 'data.json'), encoding='utf-8'))
ITEM_TITLES = {
    'kvartplata': 'Квартплата (коммуналка)', 'electro': 'Электроэнергия', 'voda': 'Вода',
    'tko': 'ТКО', 'domofon': 'Домофон', 'kapremont': 'Капремонт',
    'otoplenie': 'Отопление', 'gaz': 'Газ', 'tv': 'ТВ',
}

stats = {'objects': 0, 'items': 0, 'periods': 0, 'payments': 0, 'readings': 0}
for obj in data:
    # объект (по имени)
    existing = rest('GET', f"/rest/v1/objects?name=eq.{urllib.request.quote(obj['name'])}")
    if existing:
        oid = existing[0]['id']
        rest('PATCH', f"/rest/v1/objects?id=eq.{oid}", {'split_water': obj['split_water']})
    else:
        oid = rest('POST', '/rest/v1/objects',
                   {'name': obj['name'], 'sort_order': stats['objects'],
                    'split_water': obj['split_water']})[0]['id']
    stats['objects'] += 1

    # статьи (в JSON: ключ = заголовок из Excel, значение = ключ статьи)
    for i, key in enumerate(obj['items'].values()):
        rest('POST', '/rest/v1/payment_items?on_conflict=object_id,key',
             {'object_id': oid, 'key': key, 'title': ITEM_TITLES[key], 'sort_order': i})
        stats['items'] += 1
    item_rows = rest('GET', f"/rest/v1/payment_items?object_id=eq.{oid}&select=id,key")
    item_id = {r['key']: r['id'] for r in item_rows}

    for p in obj['periods']:
        sort_key = p['year'] + p['month'] / 100
        # склеенные периоды после одиночного с тем же месяцем: небольшой сдвиг, чтобы не совпадали
        saved = rest('POST', '/rest/v1/periods?on_conflict=object_id,year,label',
                     {'object_id': oid, 'year': p['year'], 'label': p['label'],
                      'sort_key': sort_key})
        pid = saved[0]['id']
        stats['periods'] += 1
        for key, amount in p['payments'].items():
            rest('POST', '/rest/v1/payments?on_conflict=period_id,item_id',
                 {'period_id': pid, 'item_id': item_id[key], 'amount': amount})
            stats['payments'] += 1
        for r in p['readings']:
            rest('POST', '/rest/v1/meter_readings?on_conflict=period_id,kind,zone',
                 {'period_id': pid, 'kind': r['kind'], 'zone': r['zone'], 'value': r['value']})
            stats['readings'] += 1

print('залито:', json.dumps(stats, ensure_ascii=False))
