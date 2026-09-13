"""Fetch Sahih International meanings for every ayah the Similars tab shows that isn't already in
raw/sNNN/tr.json (ayat from other juz). Writes raw/similars/tr_extra.json."""
import json
import os
import re
import time
import urllib.request

SP = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(SP, "raw")
U = "https://mcp.quran.ai"
HDR = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
st = {"sid": None, "id": 0, "nonce": None}


def post(body, notify=False):
    h = dict(HDR)
    if st["sid"]:
        h["mcp-session-id"] = st["sid"]
    req = urllib.request.Request(U, data=json.dumps(body).encode(), headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=240) as r:
        st["sid"] = r.headers.get("mcp-session-id") or st["sid"]
        raw = r.read().decode()
    if notify:
        return None
    d = [l[5:].strip() for l in raw.splitlines() if l.startswith("data:")]
    return json.loads(d[-1] if d else raw)


def tool(name, args):
    st["id"] += 1
    m = post({"jsonrpc": "2.0", "id": st["id"], "method": "tools/call", "params": {"name": name, "arguments": args}})
    r = m.get("result", m)
    if r.get("isError"):
        raise RuntimeError(json.dumps(r)[:200])
    return r.get("structuredContent") or {}


def init():
    st["sid"] = None
    post({"jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "juz-similars-tr", "version": "1"}}})
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, notify=True)
    st["id"] += 1
    g = post({"jsonrpc": "2.0", "id": st["id"], "method": "tools/call", "params": {"name": "fetch_grounding_rules", "arguments": {}}})
    m = re.search(r"gnd-[0-9a-f]{16}", json.dumps(g))
    st["nonce"] = m.group(0) if m else None


have = {}
for n in range(41, 115):
    f = os.path.join(RAW, f"s{n:03d}", "tr.json")
    if os.path.exists(f):
        for a, t in json.load(open(f, encoding="utf-8")).items():
            have[f"{n}:{a}"] = t
out_f = os.path.join(RAW, "similars", "tr_extra.json")
extra = json.load(open(out_f, encoding="utf-8")) if os.path.exists(out_f) else {}
needed = [k for k in json.load(open(os.path.join(RAW, "similars", "needed_keys.json"))) if k not in have and k not in extra]
print("meanings to fetch:", len(needed), flush=True)
init()
for i in range(0, len(needed), 80):
    batch = needed[i:i + 80]
    for attempt in range(5):
        try:
            s = tool("fetch_translation", {"ayahs": batch, "editions": "en-sahih-international", "grounding_nonce": st["nonce"]})
            while True:
                for e in (s.get("results") or {}).get("en-sahih-international", []):
                    extra[e["ayah"]] = re.sub(r"\s+", " ", re.sub(r"<sup[^>]*>.*?</sup>", "", e["text"])).strip()
                tok = (s.get("pagination") or {}).get("continuation")
                if not tok:
                    break
                s = tool("fetch_translation", {"continuation": tok, "grounding_nonce": st["nonce"]})
            break
        except Exception as e:
            print("retry", i, str(e)[:120], flush=True)
            time.sleep(3 * (attempt + 1))
            init()
    json.dump(extra, open(out_f, "w", encoding="utf-8"), ensure_ascii=False)
still = [k for k in needed if k not in extra]
print("saved", len(extra), "extra meanings; still missing:", still[:10], flush=True)
