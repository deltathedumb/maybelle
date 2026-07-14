#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import secrets
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

APP_NAME = "Maybelle Wiki Host"
DEFAULT_PORT = 80
CURRENT_SCHEMA_VERSION = 3


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def read_json(path: Path, fallback):
    if not path.exists():
        return fallback
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def stable_id(prefix, item, index):
    if isinstance(item, dict) and item.get("id"):
        return str(item["id"])
    text = (
        json.dumps(item, ensure_ascii=False, sort_keys=True)
        if isinstance(item, (dict, list))
        else repr(item)
    )
    h = 2166136261
    for ch in text:
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return f"{prefix}-import-{index + 1}-{h:x}"


def repair_ids(items, prefix):
    seen = set()
    for i, x in enumerate(items):
        if not x.get("id") or x["id"] in seen:
            x["id"] = stable_id(prefix, {**x, "id": "", "_repair": i}, i)
        seen.add(x["id"])
    return items


def normalize_wiki(raw: Any):
    if not isinstance(raw, dict):
        raise ValueError("Wiki JSON root must be an object")
    roots = []
    raw_roots = raw.get("roots") if isinstance(raw.get("roots"), list) else []
    for i, r in enumerate(raw_roots):
        if isinstance(r, dict):
            roots.append({
                "id": stable_id("root", r, i),
                "glyph": str(r.get("glyph") or ""),
                "root_name": str(r.get("root_name") or r.get("rootName") or ""),
                "description": str(r.get("description") or ""),
                "notes": str(r.get("notes") or ""),
            })

    dictionary = []
    entries = raw.get("dictionary", raw.get("entries", []))
    for i, e in enumerate(entries if isinstance(entries, list) else []):
        if isinstance(e, dict):
            fields = (
                e.get("fields", {}) if isinstance(e.get("fields", {}), dict) else {}
            )
            dictionary.append({
                "id": stable_id("entry", e, i),
                "compound": str(e.get("compound") or e.get("word") or ""),
                "description": str(e.get("description") or e.get("meaning") or ""),
                "literal_meaning": str(
                    e.get("literal_meaning") or e.get("literalMeaning") or ""
                ),
                "notes": str(e.get("notes") or ""),
                "fields": fields,
            })
    dictionary.sort(
        key=lambda x: (
            (x.get("description") or "").casefold(),
            (x.get("compound") or "").casefold(),
        )
    )
    return {
        "schema_version": CURRENT_SCHEMA_VERSION,
        "imported_from_schema_version": raw.get("schema_version", 1),
        "updated_at": raw.get("updated_at") or now(),
        "roots": repair_ids(roots, "root"),
        "dictionary": repair_ids(dictionary, "entry"),
        "grammar_notes": str(raw.get("grammar_notes") or raw.get("grammarNotes") or ""),
    }


def diff_items(old, new, label):
    out = []
    om = {x.get("id"): x for x in old if x.get("id")}
    nm = {x.get("id"): x for x in new if x.get("id")}
    for k, v in nm.items():
        if k not in om:
            out.append({"type": label + ".added", "id": k, "after": v})
        elif om[k] != v:
            out.append({
                "type": label + ".updated",
                "id": k,
                "before": om[k],
                "after": v,
            })
    for k, v in om.items():
        if k not in nm:
            out.append({"type": label + ".removed", "id": k, "before": v})
    return out


def diff_wiki(old, new):
    out = diff_items(old.get("roots", []), new.get("roots", []), "root") + diff_items(
        old.get("dictionary", []), new.get("dictionary", []), "word"
    )
    if old.get("grammar_notes", "") != new.get("grammar_notes", ""):
        out.append({
            "type": "grammar_notes.updated",
            "before": old.get("grammar_notes", ""),
            "after": new.get("grammar_notes", ""),
        })
    return out


class Tracker:
    def __init__(self, data_dir: Path, interval: int):
        self.data_dir = data_dir
        self.interval = max(1, interval)
        self.lock = threading.Lock()
        self.state_path = data_dir / "push_state.json"
        self.pending = data_dir / "changes_pending.jsonl"
        self.backups = data_dir / "backups"
        self.state = read_json(
            self.state_path, {"push_count": 0, "last_backup_push": 0}
        )

    def push(self, source, changes, actor="system"):
        if not changes:
            return {
                "ok": True,
                "tracked": False,
                "push_count": self.state.get("push_count", 0),
                "backup_created": False,
            }
        with self.lock:
            self.state["push_count"] = int(self.state.get("push_count", 0)) + 1
            pid = self.state["push_count"]
            self.data_dir.mkdir(parents=True, exist_ok=True)
            with self.pending.open("a", encoding="utf-8") as f:
                f.write(
                    json.dumps(
                        {
                            "push_id": pid,
                            "created_at": now(),
                            "source": source,
                            "actor": actor,
                            "changes": changes,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
            made = False
            if pid - int(self.state.get("last_backup_push", 0)) >= self.interval:
                self.backup_locked(pid)
                made = True
            write_json(self.state_path, self.state)
            return {
                "ok": True,
                "tracked": True,
                "push_count": pid,
                "backup_created": made,
            }

    def backup_locked(self, pid):
        rows = []
        if self.pending.exists():
            for line in self.pending.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    rows.append(json.loads(line))
        path = (
            self.backups
            / f"changes_{int(self.state.get('last_backup_push', 0)) + 1}_to_{pid}_{now().replace(':', '-')}.json"
        )
        write_json(
            path,
            {
                "type": "maybelle-change-only-backup",
                "created_at": now(),
                "from_push": int(self.state.get("last_backup_push", 0)) + 1,
                "to_push": pid,
                "change_count": sum(len(r.get("changes", [])) for r in rows),
                "pushes": rows,
            },
        )
        self.pending.write_text("", encoding="utf-8")
        self.state["last_backup_push"] = pid
        return path

    def force(self):
        with self.lock:
            p = self.backup_locked(int(self.state.get("push_count", 0)))
            write_json(self.state_path, self.state)
            return p


def safe_html(s):
    s = str(s or "")[:12000]
    s = re.sub(r"(?is)<\s*(script|style).*?>.*?<\s*/\s*\1\s*>", "", s)
    s = re.sub(r'(?i)\son[a-z]+\s*=\s*(["\']).*?\1', "", s)
    s = re.sub(r"(?i)javascript\s*:", "", s)
    allowed = {
        "b",
        "strong",
        "i",
        "em",
        "u",
        "p",
        "br",
        "ul",
        "ol",
        "li",
        "a",
        "blockquote",
        "code",
        "pre",
        "span",
    }

    def tag(m):
        close = m.group(1)
        name = m.group(2).lower()
        attrs = m.group(3) or ""
        if name not in allowed:
            return ""
        if close:
            return f"</{name}>"
        if name == "a":
            hm = re.search(r'href\s*=\s*["\']([^"\']+)["\']', attrs, re.I)
            href = hm.group(1) if hm else ""
            if href and not re.match(r"(?i)^(https?://|mailto:|#)", href):
                href = ""
            return f'<a href="{href}" target="_blank" rel="noopener noreferrer">'
        return f"<{name}>"

    return re.sub(r"<\s*(/?)\s*([a-zA-Z0-9]+)([^>]*)>", tag, s)


class Threads:
    def __init__(
        self, path: Path, tracker: Tracker, enabled=True, password="", admin_pass=""
    ):
        self.path = path
        self.tracker = tracker
        self.enabled = enabled
        self.password = password
        self.admin_pass = admin_pass
        self.lock = threading.Lock()
        self.users = {}
        self.names = {}
        self.data = read_json(
            path, {"schema_version": 1, "updated_at": now(), "threads": []}
        )
        if not isinstance(self.data, dict) or not isinstance(
            self.data.get("threads"), list
        ):
            self.data = {"schema_version": 1, "updated_at": now(), "threads": []}

    def check(self):
        if not self.enabled:
            raise PermissionError("Threads are disabled")

    def admin(self, pw):
        if self.admin_pass and pw != self.admin_pass:
            raise PermissionError("Admin password is incorrect")

    def save(self):
        self.data["updated_at"] = now()
        write_json(self.path, self.data)

    def status(self):
        return {
            "enabled": self.enabled,
            "password_required": bool(self.password),
            "thread_count": len(self.data.get("threads", [])),  # ty:ignore[invalid-argument-type]
            "claimed_user_count": len(self.users),
            "path": str(self.path.resolve()),
        }

    def claim(self, username, password=""):
        self.check()
        if self.password and password != self.password:
            raise PermissionError("Thread password is incorrect")
        u = " ".join(str(username or "").strip().split())
        if not u:
            raise ValueError("Username is required")
        if len(u) > 32:
            raise ValueError("Username too long")
        k = u.casefold()
        with self.lock:
            if k in self.names:
                raise ValueError("Username is already taken")
            tok = secrets.token_urlsafe(24)
            self.names[k] = tok
            self.users[tok] = {"username": u, "joined_at": now(), "last_seen": now()}
            return {"ok": True, "token": tok, "username": u}

    def user(self, token):
        u = self.users.get(str(token or ""))
        if not u:
            raise PermissionError("Claim a username first")
        u["last_seen"] = now()
        return u

    def summaries(self):
        return sorted(
            [
                {
                    "id": t["id"],
                    "name": t["name"],
                    "created_by": t.get("created_by", "Unknown"),
                    "created_at": t.get("created_at", ""),
                    "updated_at": t.get("updated_at", ""),
                    "message_count": len(t.get("messages", [])),
                }
                for t in self.data.get("threads", [])  # ty:ignore[not-iterable]
            ],
            key=lambda x: x.get("updated_at", ""),
            reverse=True,
        )

    def list(self):
        self.check()
        return {"ok": True, "threads": self.summaries()}

    def create(self, token, name):
        self.check()
        name = " ".join(str(name or "").strip().split())
        if not name:
            raise ValueError("Thread name is required")
        with self.lock:
            u = self.user(token)
            t = {
                "id": secrets.token_urlsafe(12),
                "name": name[:80],
                "created_by": u["username"],
                "created_at": now(),
                "updated_at": now(),
                "messages": [],
            }
            self.data.setdefault("threads", []).append(t)  # ty:ignore[unresolved-attribute]
            self.save()
            self.tracker.push(
                "threads", [{"type": "thread.added", "after": t}], u["username"]
            )
            return {"ok": True, "thread": t, "threads": self.summaries()}

    def get(self, thread_id):
        self.check()
        for t in self.data.get("threads", []):  # ty:ignore[not-iterable]
            if t["id"] == str(thread_id or ""):
                return {"ok": True, "thread": t}
        raise ValueError("Thread not found")

    def message(self, token, thread_id, html_value, images):
        self.check()
        body = safe_html(html_value)
        imgs = []
        if isinstance(images, list):
            for img in images[:5]:
                if (
                    isinstance(img, dict)
                    and str(img.get("data_url", "")).startswith("data:image/")
                    and len(str(img.get("data_url", ""))) < 3000000
                ):
                    imgs.append({
                        "name": str(img.get("name") or "image"),
                        "type": str(img.get("type") or "image"),
                        "data_url": str(img.get("data_url")),
                    })
        if not body.strip() and not imgs:
            raise ValueError("Message is empty")
        with self.lock:
            u = self.user(token)
            for t in self.data.get("threads", []):  # ty:ignore[not-iterable]
                if t["id"] == str(thread_id or ""):
                    m = {
                        "id": secrets.token_urlsafe(12),
                        "username": u["username"],
                        "html": body,
                        "images": imgs,
                        "created_at": now(),
                    }
                    t.setdefault("messages", []).append(m)
                    t["updated_at"] = now()
                    self.save()
                    self.tracker.push(
                        "threads",
                        [
                            {
                                "type": "thread.message.added",
                                "thread_id": t["id"],
                                "thread_name": t["name"],
                                "after": m,
                            }
                        ],
                        u["username"],
                    )
                    return {
                        "ok": True,
                        "message": m,
                        "thread": t,
                        "threads": self.summaries(),
                    }
        raise ValueError("Thread not found")

    def rename(self, thread_id, name, admin_pass):
        self.check()
        self.admin(admin_pass)
        name = " ".join(str(name or "").strip().split())
        if not name:
            raise ValueError("Thread name is required")
        with self.lock:
            for t in self.data.get("threads", []):  # ty:ignore[not-iterable]
                if t["id"] == str(thread_id or ""):
                    before = dict(t)
                    t["name"] = name[:80]
                    t["updated_at"] = now()
                    self.save()
                    self.tracker.push(
                        "threads",
                        [{"type": "thread.renamed", "before": before, "after": t}],
                        "admin",
                    )
                    return {"ok": True, "thread": t, "threads": self.summaries()}
        raise ValueError("Thread not found")

    def delete(self, thread_id, admin_pass):
        self.check()
        self.admin(admin_pass)
        with self.lock:
            for i, t in enumerate(self.data.get("threads", [])):  # ty:ignore[invalid-argument-type]
                if t["id"] == str(thread_id or ""):  # ty:ignore[not-subscriptable]
                    old = self.data["threads"].pop(i)  # ty:ignore[unresolved-attribute]
                    self.save()
                    self.tracker.push(
                        "threads", [{"type": "thread.removed", "before": old}], "admin"
                    )
                    return {"ok": True, "threads": self.summaries()}
        raise ValueError("Thread not found")

    def delete_msg(self, thread_id, message_id, admin_pass):
        self.check()
        self.admin(admin_pass)
        with self.lock:
            for t in self.data.get("threads", []):  # ty:ignore[not-iterable]
                if t["id"] == str(thread_id or ""):
                    for i, m in enumerate(t.get("messages", [])):
                        if m["id"] == str(message_id or ""):
                            old = t["messages"].pop(i)
                            t["updated_at"] = now()
                            self.save()
                            self.tracker.push(
                                "threads",
                                [
                                    {
                                        "type": "thread.message.removed",
                                        "thread_id": t["id"],
                                        "before": old,
                                    }
                                ],
                                "admin",
                            )
                            return {
                                "ok": True,
                                "thread": t,
                                "threads": self.summaries(),
                            }
        raise ValueError("Message not found")


class App:
    def __init__(self, args):
        self.wiki_path = Path(args.wiki)
        self.editor_root = Path(args.editor_root)
        self.tracker = Tracker(self.wiki_path.parent, args.backup_interval)
        self.admin_pass = args.admin_pass
        self.threads = Threads(
            Path(args.threads),
            self.tracker,
            not args.disable_forum,
            args.forum_password,
            args.admin_pass,
        )

    def admin(self, pw):
        if self.admin_pass and pw != self.admin_pass:
            raise PermissionError("Admin password is incorrect")

    def read_wiki(self):
        if not self.wiki_path.exists():
            return {
                "schema_version": CURRENT_SCHEMA_VERSION,
                "updated_at": now(),
                "roots": [],
                "dictionary": [],
                "grammar_notes": "",
            }
        return normalize_wiki(read_json(self.wiki_path, {}))

    def write_wiki(self, data):
        old = self.read_wiki()
        new = normalize_wiki(data)
        new["updated_at"] = now()
        write_json(self.wiki_path, new)
        self.tracker.push(
            "wiki", diff_wiki(old, new), str(data.get("actor") or "wiki-editor")
        )
        return new


def make_handler(app: App):
    class H(BaseHTTPRequestHandler):
        server_version = "MaybelleWikiHost/3.0"

        def end_headers(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def log_message(self, format, *args):
            sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), format % args))

        def json(self, data, status=200):
            b = json.dumps(data, ensure_ascii=False, indent=2).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def text(self, s, status=200):
            b = s.encode()
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def body(self):
            n = int(self.headers.get("Content-Length", "0"))
            return json.loads(self.rfile.read(n).decode()) if n > 0 else {}

        def do_OPTIONS(self):
            self.send_response(204)
            self.end_headers()

        def do_GET(self):
            p = urlparse(self.path).path
            try:
                if p in ("/api/status", "/api/status/"):
                    return self.json({
                        "ok": True,
                        "name": APP_NAME,
                        "schema": f"v{CURRENT_SCHEMA_VERSION}",
                        "wiki_path": str(app.wiki_path.resolve()),
                        "editor_root": str(app.editor_root.resolve()),
                        "threads": app.threads.status(),
                        "admin_password_enabled": bool(app.admin_pass),
                    })
                if p in ("/api/wiki", "/api/wiki/"):
                    return self.json(app.read_wiki())
                if p in ("/api/threads/status", "/api/threads/status/"):
                    return self.json({"ok": True, "threads": app.threads.status()})
                if p in ("/api/threads", "/api/threads/"):
                    return self.json(app.threads.list())
                if p in ("/", "/index.html", "/page.html"):
                    return self.file(app.editor_root / "page.html")

                safe = Path(p.lstrip("/"))
                if safe.is_absolute() or ".." in safe.parts:
                    return self.text("Forbidden", 403)
                cand = app.editor_root / safe
                if cand.exists() and cand.is_file():
                    return self.file(cand)
                return self.text("Not found", 404)
            except PermissionError as e:
                return self.json({"ok": False, "error": str(e)}, 403)
            except Exception as e:
                return self.json({"ok": False, "error": str(e)}, 500)

        def do_POST(self):
            p = urlparse(self.path).path
            try:
                d = self.body()
                if p in ("/api/wiki", "/api/wiki/"):
                    return self.json({
                        "ok": True,
                        "path": str(app.wiki_path.resolve()),
                        **{
                            k: app.write_wiki(d)[k]
                            for k in ("schema_version", "updated_at")
                        },
                    })
                if p in ("/api/admin/backup", "/api/admin/backup/"):
                    app.admin(d.get("admin_pass"))
                    return self.json({
                        "ok": True,
                        "backup_path": str(app.tracker.force().resolve()),
                    })
                if p in ("/api/threads/claim", "/api/threads/claim/"):
                    return self.json(
                        app.threads.claim(d.get("username"), d.get("password"))
                    )
                if p in ("/api/threads/create", "/api/threads/create/"):
                    return self.json(app.threads.create(d.get("token"), d.get("name")))
                if p in ("/api/threads/thread", "/api/threads/thread/"):
                    return self.json(app.threads.get(d.get("thread_id")))
                if p in ("/api/threads/message", "/api/threads/message/"):
                    return self.json(
                        app.threads.message(
                            d.get("token"),
                            d.get("thread_id"),
                            d.get("html"),
                            d.get("images"),
                        )
                    )
                if p in ("/api/threads/rename", "/api/threads/rename/"):
                    return self.json(
                        app.threads.rename(
                            d.get("thread_id"), d.get("name"), d.get("admin_pass")
                        )
                    )
                if p in ("/api/threads/delete", "/api/threads/delete/"):
                    return self.json(
                        app.threads.delete(d.get("thread_id"), d.get("admin_pass"))
                    )
                if p in ("/api/threads/message/delete", "/api/threads/message/delete/"):
                    return self.json(
                        app.threads.delete_msg(
                            d.get("thread_id"), d.get("message_id"), d.get("admin_pass")
                        )
                    )
                return self.text("Not found", 404)
            except PermissionError as e:
                return self.json({"ok": False, "error": str(e)}, 403)
            except Exception as e:
                return self.json({"ok": False, "error": str(e)}, 400)

        def file(self, path):
            if not path.exists():
                return self.text("File not found", 404)
            b = path.read_bytes()
            self.send_response(200)
            self.send_header(
                "Content-Type",
                mimetypes.guess_type(str(path))[0] or "application/octet-stream",
            )
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

    return H


def parse_args():
    root = Path(__file__).resolve().parent
    p = argparse.ArgumentParser(description="Maybelle Wiki Host")
    p.add_argument("--name", default="Maybelle Wiki Host")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=DEFAULT_PORT)
    p.add_argument("--wiki", default=str(root / "data" / "wiki.json"))
    p.add_argument("--threads", default=str(root / "data" / "threads.json"))
    p.add_argument("--editor-root", default=str(root / "wiki"))
    p.add_argument("--disable-forum", action="store_true")
    p.add_argument("--forum-password", default="")
    p.add_argument("--admin-pass", default="")
    p.add_argument("--backup-interval", type=int, default=10)
    return p.parse_args()


def main():
    args = parse_args()
    app = App(args)
    if not (app.editor_root / "page.html").exists():
        print("ERROR: page.html not found in", app.editor_root)
        return 1
    try:
        httpd = ThreadingHTTPServer((args.host, args.port), make_handler(app))
    except PermissionError:
        print("ERROR: Port 80 usually requires Administrator/root. Try --port 8765.")
        return 1
    ip = lan_ip()
    print(args.name)
    print("-" * len(args.name))
    print(
        "Local:   http://127.0.0.1"
        if args.port == 80
        else f"Local:   http://127.0.0.1:{args.port}"
    )
    print(
        (
            f"LAN:     http://{ip}"
            if args.port == 80
            else f"LAN:     http://{ip}:{args.port}"
        )
        + "   (use --host 0.0.0.0 for LAN)"
    )
    print("Wiki:   ", app.wiki_path.resolve())
    print("Threads:", Path(args.threads).resolve())
    print("Editor: ", app.editor_root.resolve())
    print("Backups:", (app.wiki_path.parent / "backups").resolve())
    print("Admin:  ", "enabled" if args.admin_pass else "disabled")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping host.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
