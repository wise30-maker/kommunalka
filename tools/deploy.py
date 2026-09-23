# Коммитит текущее деревео через GitHub API: содержимое деревьев + base_tree
import os, json, urllib.request, base64, sys, subprocess
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

# файлы: отслеживаемые git'ом + локальный js/config.js (в .gitignore, но нужен на сайте)
# автоматический кэш-бастинг: ?v=<sha8 содержимого файла> в index.html —
# любое изменение css/js само инвалидирует кэш браузера, руками бампить не нужно
import hashlib, re
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

files = subprocess.check_output(["git", "ls-files"], text=True).split()
skip_prefixes = (".hermes/",)
files = [f for f in files if not f.startswith(skip_prefixes)]
if os.path.exists("js/config.js") and "js/config.js" not in files:
    files.append("js/config.js")
print("deploy files:", files)

base = req("GET", f"{API}/git/ref/heads/main")
base_sha = base["object"]["sha"]

blobs = {}
for p in files:
    b = req("POST", f"{API}/git/blobs", {"content": base64.b64encode(open(p,'rb').read()).decode(), "encoding": "base64"})
    blobs[p] = b["sha"]

tree = req("POST", f"{API}/git/trees", {"base_tree": base_sha, "tree": [
    {"path": p, "mode": "100644", "type": "blob", "sha": s} for p, s in blobs.items()
]})
commit = req("POST", f"{API}/git/commits", {"message": sys.argv[1], "tree": tree["sha"], "parents": [base_sha]})
req("PATCH", f"{API}/git/refs/heads/main", {"sha": commit["sha"]})
print("deployed:", commit["sha"][:10])
