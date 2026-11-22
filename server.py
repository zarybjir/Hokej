#!/usr/bin/env python3
"""Lokální server Hokej '98: servíruje hru a umí ji aktualizovat z GitHubu.

GET  /api/version  -> místní version.json + způsob aktualizace (git / zip)
GET  /api/check    -> version.json z GitHubu (větev main)
POST /api/update   -> stáhne a nainstaluje novou verzi (git pull, jinak ZIP)
Spouští ho hokej.sh: python3 server.py 47098
"""
import http.server
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

DIR = os.path.dirname(os.path.abspath(__file__))
REPO = 'zarybjir/Hokej'
BRANCH = 'main'
RAW = f'https://raw.githubusercontent.com/{REPO}/{BRANCH}/version.json'
ZIP = f'https://codeload.github.com/{REPO}/zip/refs/heads/{BRANCH}'
UA = {'User-Agent': 'hokej98-updater'}


def local_version():
    try:
        with open(os.path.join(DIR, 'version.json'), encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {'build': 0, 'version': '?'}


def mode():
    return 'git' if os.path.isdir(os.path.join(DIR, '.git')) and shutil.which('git') else 'zip'


def fetch(url, timeout=15):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def update_git():
    r = subprocess.run(['git', '-C', DIR, 'pull', '--ff-only', 'origin', BRANCH], capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip()[-400:])
    return r.stdout.strip()[-400:]


def update_zip():
    data = fetch(ZIP, timeout=120)
    n = 0
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for info in z.infolist():
            parts = info.filename.split('/', 1)
            if len(parts) < 2 or not parts[1] or info.is_dir():
                continue
            rel = os.path.normpath(parts[1])
            if rel.startswith('..') or os.path.isabs(rel):
                continue
            dst = os.path.join(DIR, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            # zápis přes dočasný soubor + přejmenování: běžící skripty (hokej.sh, server.py) se nerozbijí
            fd, tmp = tempfile.mkstemp(dir=os.path.dirname(dst))
            with os.fdopen(fd, 'wb') as f:
                f.write(z.read(info))
            if rel.endswith(('.sh', '.py')):
                os.chmod(tmp, 0o755)
            else:
                os.chmod(tmp, 0o644)
            os.replace(tmp, dst)
            n += 1
    return f'{n} souborů aktualizováno'


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIR, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')  # po aktualizaci se hned načte nový kód
        super().end_headers()

    def log_message(self, *a):
        pass

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/api/version'):
            return self.send_json({**local_version(), 'mode': mode()})
        if self.path.startswith('/api/check'):
            try:
                return self.send_json({'ok': True, 'remote': json.loads(fetch(RAW, timeout=10))})
            except Exception as e:
                return self.send_json({'ok': False, 'error': str(e)[:300]})
        return super().do_GET()

    def do_POST(self):
        if not self.path.startswith('/api/update'):
            return self.send_json({'ok': False, 'error': 'neznámá adresa'}, 404)
        before = local_version()
        try:
            m = mode()
            try:
                log = update_git() if m == 'git' else update_zip()
            except Exception as e:
                if m != 'git':
                    raise
                log = 'git selhal (' + str(e)[:200] + '), stahuji ZIP: ' + update_zip()
            self.send_json({'ok': True, 'from': before, 'to': local_version(), 'log': log})
        except Exception as e:
            self.send_json({'ok': False, 'error': str(e)[:300]})


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 47098
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f"Hokej '98 server na http://127.0.0.1:{port}/ ({mode()})", flush=True)
    srv.serve_forever()
