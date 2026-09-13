"""Download muṣḥaf pages 1–540 (words with verse keys) into raw/quran-pages/ for finding similar ayat
across the whole Quran. Pages 541–604 are already in raw/pages/. Safe to re-run; cached pages are skipped."""
import json, os, re, sys, time, urllib.request

SP = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(SP, "raw", "quran-pages")
os.makedirs(OUT, exist_ok=True)
U = "https://mcp.quran.ai"
HDR = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
state = {"sid": None, "id": 0, "nonce": None}

def post(body, notify=False):
    h = dict(HDR)
    if state["sid"]: h["mcp-session-id"] = state["sid"]
    req = urllib.request.Request(U, data=json.dumps(body).encode(), headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=180) as r:
        state["sid"] = r.headers.get("mcp-session-id") or state["sid"]
        raw = r.read().decode()
    if notify: return None
    d = [l[5:].strip() for l in raw.splitlines() if l.startswith("data:")]
    return json.loads(d[-1] if d else raw)

def call(name, args):
    state["id"] += 1
    m = post({"jsonrpc": "2.0", "id": state["id"], "method": "tools/call", "params": {"name": name, "arguments": args}})
    r = m.get("result", m)
    if r.get("isError"): raise RuntimeError(json.dumps(r)[:200])
    return r

def init():
    state["sid"] = None
    post({"jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "juz-similars", "version": "1"}}})
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, notify=True)
    g = call("fetch_grounding_rules", {})
    m = re.search(r"gnd-[0-9a-f]{16}", json.dumps(g)); state["nonce"] = m.group(0) if m else None

init()
first, last = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (1, 540)
for p in range(first, last + 1):
    f = os.path.join(OUT, f"p{p:03d}.json")
    if os.path.exists(f): continue
    for attempt in range(6):
        try:
            s = call("fetch_mushaf", {"page": p, "grounding_nonce": state["nonce"]}).get("structuredContent") or {}
            vk = {v["verse_id"]: v["verse_key"] for v in s["verses"]}
            data = {"p": p, "lines": [{"n": ln["line_number"], "w": [[w["text"], *map(int, vk[w["verse_id"]].split(":")), 1 if w["char_type_name"] == "end" else 0] for w in ln["words"]]} for ln in s["lines"]]}
            json.dump(data, open(f, "w"), ensure_ascii=False)
            break
        except Exception as e:
            print(time.strftime("%H:%M:%S"), "retry page", p, str(e)[:120], flush=True)
            time.sleep(3 * (attempt + 1))
            try: init()
            except Exception: pass
    if p % 50 == 0: print(time.strftime("%H:%M:%S"), "page", p, flush=True)
    time.sleep(0.1)
print("done", len(os.listdir(OUT)), "pages cached", flush=True)
