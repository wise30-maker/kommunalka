# Деплой репозитория на GitHub через API (git push в этой сети не работает).
# Инкрементально: blob'ы, чей git-hash уже совпадает с содержимым репозитория,
# не загружаются повторно (важно для 7 МБ ассетов OCR в vendor/).
# Использование: python tools/deploy.py "сообщение коммита"
import os, json, urllib.request, base64, sys, subprocess, hashlib, re

TOKEN_PATH = os.path.join(os.path.expanduser("~"), ".kommunalka-github-token")
TOKEN = os.environ.get('GITHUB_TOKEN') or open(TOKEN_PATH, encoding='ascii').read().strip()
REPO = "wise30-maker/kommunalka"
API = f"https://api.github.com/repos/{REPO}"

def req(method, url, payload=None):
    r = urllib.request.Request(url, method=method)
    r.add_header("Authorization", f"Bearer {TOKEN}")
    r.add_header("Accept", "application/vnd.github+json")
    data = json.dumps(payload).encode() if payload is not None else None
    try:
        with urllib.request.urlopen(r, data) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read()[:300]); sys.exit(1)

# --- кэш-бастинг: ?v=<sha8 содержимого> в index.html (руками бампить не нужно) ---
idx_path = "index.html"
if os.path.exists(idx_path):
    html = open(idx_path, encoding="utf-8").read()
    def bump(m):
        path = m.group(1)
        if os.path.exists(path):
            h = hashlib.sha256(open(path, "rb").read()).hexdigest()[:8]
            return f"{path}?v={h}"
        return m.group(0)
    html = re.sub(r"(css/style\.css|js/[\w.]+)\?v=[^\"']+", bump, html)
    open(idx_path, "w", encoding="utf-8", newline="\n").write(html)
    # важно: обновлённый index.html должен попасть в индекс, иначе уедет старая версия
    # со старыми ?v= (браузер подтянет устаревшие js/css)
    subprocess.run(["git", "add", idx_path], check=False)

# --- файлы: отслеживаемые git'ом + локальный js/config.js (gitignored, но нужен на сайте) ---
files = subprocess.check_output(["git", "ls-files"], text=True).split()
files = [f for f in files if not f.startswith((".hermes/",))]
if os.path.exists("js/config.js") and "js/config.js" not in files:
    files.append("js/config.js")

base_sha = req("GET", f"{API}/git/ref/heads/main")["object"]["sha"]
tree_info = req("GET", f"{API}/git/trees/{base_sha}?recursive=1")
remote_sha = {t["path"]: t["sha"] for t in tree_info.get("tree", []) if t.get("type") == "blob"}

# sha и содержимое берём из индекса git (канонический вид, LF) — тогда сравнение
# с репозиторием стабильно и не зависит от autocrlf/CRLF в рабочей копии
staged = {}
for line in subprocess.check_output(["git", "ls-files", "-s"], text=True).splitlines():
    meta, path = line.split("\t", 1)
    staged[path] = meta.split()[1]

def staged_bytes(path):
    return subprocess.check_output(["git", "cat-file", "blob", f":{path}"])

def raw_sha(path):
    return subprocess.check_output(["git", "hash-object", path], text=True).strip()

uploaded, skipped = [], []
for p in files:
    if p in staged:
        sha, content = staged[p], staged_bytes(p)          # канонический вид из индекса
    elif os.path.exists(p):
        sha, content = raw_sha(p), open(p, "rb").read()    # вне индекса (js/config.js и т.п.)
    else:
        print("нет файла, пропуск:", p); continue
    if remote_sha.get(p) == sha:
        skipped.append(p); continue
    b = req("POST", f"{API}/git/blobs",
            {"content": base64.b64encode(content).decode(), "encoding": "base64"})
    uploaded.append({"path": p, "mode": "100644", "type": "blob", "sha": b["sha"]})

print(f"загружено: {len(uploaded)}, без изменений: {len(skipped)}")
for u in uploaded:
    print("  +", u["path"])
if skipped:
    print("  (пропущены: " + ", ".join(skipped[:8]) + (" …" if len(skipped) > 8 else "") + ")")

if not uploaded:
    print("нечего деплоить — репозиторий уже совпадает с рабочей копией")
    sys.exit(0)

tree = req("POST", f"{API}/git/trees", {"base_tree": base_sha, "tree": uploaded})
commit = req("POST", f"{API}/git/commits",
             {"message": sys.argv[1] if len(sys.argv) > 1 else "deploy", "tree": tree["sha"], "parents": [base_sha]})
req("PATCH", f"{API}/git/refs/heads/main", {"sha": commit["sha"]})
print("deployed:", commit["sha"][:10])
