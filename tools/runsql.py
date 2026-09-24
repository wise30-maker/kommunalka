# Выполняет SQL в базе Supabase через Management API (нужен PAT sbp_...).
# Использование: python tools/runsql.py path/to/query.sql
# Или: python tools/runsql.py --inline "SELECT 1"
# Токен: ~/.kommunalka-supabase-token
import os, json, urllib.request, sys

TOKEN = open(os.path.expanduser("~/.kommunalka-supabase-token"), encoding="ascii").read().strip()
REF = "jtooyjofbosgspeonaza"

if len(sys.argv) < 2:
    print(__doc__); sys.exit(2)
if sys.argv[1] == "--inline":
    sql = sys.argv[2]
else:
    sql = open(sys.argv[1], encoding="utf-8").read()

r = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query",
                           method="POST", data=json.dumps({"query": sql}).encode())
r.add_header("Authorization", f"Bearer {TOKEN}")
r.add_header("Content-Type", "application/json")
try:
    with urllib.request.urlopen(r) as resp:
        print("OK:", resp.read()[:2000].decode())
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read()[:800].decode()); sys.exit(1)
