#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Сверка итогов: БД (Supabase REST) против migrate/data.json (источник Excel)."""
import json, re, os, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg_js = open(os.path.join(ROOT, 'js', 'config.js'), encoding='utf-8').read()
URL = re.search(r'SUPABASE_URL:\s*"([^"]+)"', cfg_js).group(1)
KEY = re.search(r'SUPABASE_ANON_KEY:\s*"([^"]+)"', cfg_js).group(1)
creds = open(os.path.expanduser('~/.kommunalka-owner'), encoding='utf-8').read().splitlines()

def req(path, token):
    r = urllib.request.Request(URL + path)
    r.add_header('apikey', KEY)
    r.add_header('Authorization', 'Bearer ' + token)
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read())

auth_req = urllib.request.Request(URL + '/auth/v1/token?grant_type=password', method='POST',
    data=json.dumps({'email': creds[0].strip(), 'password': creds[1].strip()}).encode())
auth_req.add_header('apikey', KEY); auth_req.add_header('Content-Type', 'application/json')
TOK = json.loads(urllib.request.urlopen(auth_req).read())['access_token']

expected = json.load(open(os.path.join(ROOT, 'migrate', 'data.json'), encoding='utf-8'))
objects = req('/rest/v1/objects?select=id,name', TOK)
oid = {o['name']: o['id'] for o in objects}

fails = 0
checked = 0
for obj in expected:
    rows = req(f"/rest/v1/periods?object_id=eq.{oid[obj['name']]}&select=label,year,payments(amount)", TOK)
    db_index = {(r['label'], r['year']): sum(float(p['amount']) for p in r['payments']) for r in rows}
    for p in obj['periods']:
        exp = round(sum(p['payments'].values()), 2)
        got = round(db_index.get((p['label'], p['year']), -1), 2)
        checked += 1
        if abs(exp - got) > 0.005:
            fails += 1
            print(f"FAIL {obj['name']} | {p['label']} {p['year']} | БД {got} | Excel {exp}")

print(f"\nСверено периодов: {checked}, расхождений: {fails}")
print("ИТОГ:", "OK — все итоги БД совпадают с Excel" if fails == 0 else "ЕСТЬ РАСХОЖДЕНИЯ")
