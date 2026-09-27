"""SERTP 2026 Preliminary 10-Year Transmission Expansion Plan -> data/projects/sertp.json

The Southeastern Regional Transmission Planning (SERTP) process publishes one PDF with every
planned transmission project in the region (Southern Co., Duke, TVA, LG&E/KU, ...): in-service
year, project name, description and the reliability need behind it. That's the regional
plan FERC Order 1920 builds on.

Pipeline: PDF text -> project blocks -> parsed fields (voltage, endpoints, action, miles)
-> substations geocoded by name against OpenStreetMap -> contract JSON.

    python ingest/sertp.py            # downloads the PDF + OSM substations into ingest/cache
"""

from __future__ import annotations

import json
import math
import re
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

from pypdf import PdfReader

from common import PARENT

URL = "https://www.southeasternrtp.com/docs/general/2026/2026_SERTP_Preliminary_Expansion_Plan_Report_(Non-CEII).pdf"
ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache"
OUT = ROOT.parent / "data" / "projects" / "sertp.json"

# Balancing areas -> fallback utility when OSM doesn't name the substation operator.
BA_UTILITY = {
    "DUKE CAROLINAS": ("duke-energy-carolinas-llc", "Duke Energy Carolinas, LLC", "investor_owned"),
    "DUKE PROGRESS EAST": ("duke-energy-progress-nc", "Duke Energy Progress - (NC)", "investor_owned"),
    "DUKE PROGRESS WEST": ("duke-energy-progress-nc", "Duke Energy Progress - (NC)", "investor_owned"),
    "LG&E/KU": ("lge-ku", "LG&E and KU Energy", "investor_owned"),
    "SOUTHERN": ("southern-company", "Southern Company (SERTP Southern BA)", "investor_owned"),
    "TVA": ("tennessee-valley-authority", "Tennessee Valley Authority", "federal"),
}
# OSM operator text -> utility, used to attribute Southern BA projects to the operating company.
OPERATORS = [
    ("georgia power", ("georgia-power-co", "Georgia Power Co", "investor_owned")),
    ("alabama power", ("alabama-power-co", "Alabama Power Co", "investor_owned")),
    ("mississippi power", ("mississippi-power-co", "Mississippi Power Co", "investor_owned")),
    ("georgia transmission", ("georgia-transmission-corp", "Georgia Transmission Corp", "cooperative")),
    ("meag", ("meag-power", "MEAG Power", "municipal")),
    ("municipal electric authority of georgia", ("meag-power", "MEAG Power", "municipal")),
]
PALETTE = ["#f97316", "#a855f7", "#14b8a6", "#eab308", "#ec4899", "#22c55e", "#3b82f6", "#ef4444", "#06b6d4", "#84cc16"]

STRIP = re.compile(
    r"\b(SUBSTATION|SUBSTA|SUB|SWITCHING STATION|SWITCHYARD|SWITCHING|STATION|TIE|RETAIL|SS|SW|PLANT|STEAM|CC|CT|DS|TS|"
    r"PRIMARY|DELIVERY POINT|DP|SWITCH|ENERGY CENTER|FOSSIL|NUCLEAR|HYDRO)\b"
)


def norm(name: str) -> str:
    n = name.upper()
    n = re.sub(r"\(.*?\)", " ", n)
    n = n.replace("&", " AND ").replace("#", " ")
    n = re.sub(r"\bST\.?\b", "SAINT", n) if n.startswith("ST") else n
    n = STRIP.sub(" ", n)
    n = re.sub(r"[^A-Z0-9 ]", " ", n)
    n = re.sub(r"\b\d+\s*KV\b", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def miles(a, b):
    r = 3958.8
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def fetch(url: str, dest: Path, data: bytes | None = None) -> Path:
    if not dest.exists():
        print(f"downloading {url[:90]}")
        req = urllib.request.Request(url, data=data, headers={"User-Agent": "GridSync-hackathon/0.1", "Accept": "*/*"})
        with urllib.request.urlopen(req, timeout=300) as r:
            dest.write_bytes(r.read())
    return dest


def osm_index() -> dict[str, list[dict]]:
    idx: dict[str, list[dict]] = {}
    files = sorted(CACHE.glob("osm_*.json"))
    if not files:
        for part, name in [("24.3,-92.5,31.9,-75.0", "osm_south.json"), ("31.9,-92.5,39.5,-75.0", "osm_north.json")]:
            q = f'[out:json][timeout:280];nwr["power"="substation"]["name"]({part});out center tags;'
            fetch("https://overpass-api.de/api/interpreter", CACHE / name, urllib.parse.urlencode({"data": q}).encode())
        files = sorted(CACHE.glob("osm_*.json"))
    for f in files:
        for e in json.loads(f.read_text()).get("elements", []):
            t = e.get("tags", {})
            c = e.get("center", e)
            if "lat" not in c:
                continue
            key = norm(t.get("name", ""))
            if key:
                idx.setdefault(key, []).append({"lat": c["lat"], "lon": c["lon"], "operator": t.get("operator", ""), "name": t["name"]})
    return idx


def parse_blocks(text: str):
    # Replace each page header with a marker naming its balancing area, so blocks that
    # span pages stay intact and every block knows its area.
    text = re.sub(
        r"==P\d+==\n.*?\n([A-Z&/ \-]+?) Balancing Authority Area\s*\nSERTP TRANSMISSION PROJECTS\s*\n",
        lambda m: f"\n@@BA={m.group(1).strip()}@@\n",
        text,
        flags=re.S,
    )
    ba = None
    for chunk in re.split(r"(?=In-Service\s*\nYear:)", text):
        markers = re.findall(r"@@BA=(.*?)@@", chunk)
        body = re.sub(r"\n?@@BA=.*?@@\n?", " ", chunk)
        m = re.search(
            r"In-Service\s*\nYear:\s*\n?\s*(\d{4})\s*\nProject Name:\s*(.*?)\nDescription:\s*(.*?)(?:\nSupporting\s*\nStatement:\s*(.*))?$",
            body,
            re.S,
        )
        if m:
            # A marker inside this chunk before the block starts belongs to the next block's page;
            # the block itself started on the page of the previous marker.
            name = re.sub(r"\s+", " ", m.group(2)).strip()
            desc = re.sub(r"\s+", " ", m.group(3)).strip()
            need = re.sub(r"\s+", " ", (m.group(4) or "")).strip()
            yield ba, int(m.group(1)), name, desc, need
        if markers:
            ba = markers[-1]


OWNER_PREFIX = {
    "GTC": ("georgia-transmission-corp", "Georgia Transmission Corp", "cooperative"),
    "MEAG": ("meag-power", "MEAG Power", "municipal"),
    "DALTON": ("dalton-utilities", "Dalton Utilities", "municipal"),
    "PS": ("powersouth-energy-cooperative", "PowerSouth Energy Cooperative", "cooperative"),
    "SMEPA": ("cooperative-energy", "Cooperative Energy (SMEPA)", "cooperative"),
}


def split_owner(name: str) -> tuple[str | None, str]:
    """'SOCO: SAV: GOSHEN - KRAFT ...' -> ('SOCO', 'GOSHEN - KRAFT ...'). First prefix is the owner."""
    owner, rest = None, name.strip()
    while m := re.match(r"^([A-Za-z]+):\s*(.*)$", rest):
        owner = owner or m.group(1).upper()
        rest = m.group(2)
    return owner, rest


def classify(name: str, desc: str) -> tuple[str, str | None, str | None]:
    """Returns (project type, endpoint A, endpoint B)."""
    u = split_owner(name.upper())[1].replace("\u2013", "-").replace("\u2014", "-")
    head = re.split(r"\s\d{2,3}(?:/\d{2,3})*\s*KV", u)[0]
    head = re.sub(r"\(.*?\)|\(.*$", " ", head)
    head = re.sub(r"\b(AREA|IMPROVEMENTS?|SOLUTION|PROJECT)\b", " ", head)
    is_line = "TRANSMISSION LINE" in u or " LINE" in u or re.search(r"\s(-|TO)\s", head) is not None
    new = bool(re.search(r"\b(NEW|CONSTRUCT|BUILD)\b", u + " " + desc.upper())) and "REBUILD" not in u
    parts = [x.strip() for x in re.split(r"\s+(?:-|TO)\s+", head) if x.strip()]
    if is_line and len(parts) >= 2:
        return ("transmission_line_new" if new else "transmission_line_upgrade"), parts[0], parts[-1]
    if "TRANSMISSION LINE" in u or " LINE" in u:
        return ("transmission_line_new" if new else "transmission_line_upgrade"), head.strip(), None
    return ("substation_new" if new else "substation_upgrade"), head.strip(), None


def build_months(ptype: str, line_miles: float | None) -> int:
    if ptype == "transmission_line_new":
        return 30
    if ptype == "transmission_line_upgrade":
        return int(min(30, max(9, 9 + (line_miles or 10) * 0.4)))
    if ptype == "substation_new":
        return 24
    return 12


def pick(cands, near=None, prefer_ops=()):
    if not cands:
        return None
    if near:
        return min(cands, key=lambda c: miles((c["lat"], c["lon"]), near))
    ops = [c for c in cands if any(o in c["operator"].lower() for o in prefer_ops)]
    pool = ops or cands
    # Ambiguous: same name in different places and nothing to break the tie.
    if len(pool) > 1 and max(miles((pool[0]["lat"], pool[0]["lon"]), (c["lat"], c["lon"])) for c in pool) > 15:
        return None
    return pool[0]


BA_STATES = {
    "DUKE CAROLINAS": {"NC", "SC"},
    "DUKE PROGRESS EAST": {"NC", "SC"},
    "DUKE PROGRESS WEST": {"NC", "SC"},
    "LG&E/KU": {"KY", "VA"},
    "SOUTHERN": {"GA", "AL", "MS", "FL"},
    "TVA": {"TN", "AL", "MS", "KY", "GA", "NC", "VA"},
}

BA_OPS = {
    "DUKE CAROLINAS": ("duke",),
    "DUKE PROGRESS EAST": ("duke", "progress"),
    "DUKE PROGRESS WEST": ("duke", "progress"),
    "LG&E/KU": ("kentucky utilities", "louisville gas", "lg&e", "lge"),
    "SOUTHERN": ("georgia power", "alabama power", "mississippi power", "georgia transmission", "meag", "southern"),
    "TVA": ("tennessee valley", "tva"),
}


def main() -> None:
    CACHE.mkdir(exist_ok=True)
    pdf = fetch(URL, CACHE / "sertp_2026.pdf") if len(sys.argv) < 2 else Path(sys.argv[1])
    reader = PdfReader(str(pdf))
    text = "".join(f"\n==P{i + 1}==\n" + (p.extract_text() or "") for i, p in enumerate(reader.pages))
    idx = osm_index()

    utilities, projects, skipped = {}, [], []
    for ba, year, name, desc, need in parse_blocks(text):
        if ba not in BA_UTILITY:
            skipped.append((ba, name, "balancing area outside map"))
            continue
        ptype, a_name, b_name = classify(name, desc)
        kv = [int(x) for x in re.findall(r"(\d{2,3})(?=(?:/\d{2,3})*\s*KV)", name.upper())]
        kv += [int(x) for x in re.findall(r"/(\d{2,3})\s*KV", name.upper())]
        m_miles = re.search(r"([\d.]+)[ -]mile", desc)
        line_miles = float(m_miles.group(1)) if m_miles else None

        ops = BA_OPS.get(ba, ())
        ok_states = BA_STATES.get(ba, set())
        in_area = lambda cands: [c for c in cands if state_of(c["lat"], c["lon"]) in ok_states]  # noqa: E731
        a = pick(in_area(idx.get(norm(a_name or ""), [])), prefer_ops=ops)
        b = None
        if b_name:
            b_cands = in_area(idx.get(norm(b_name), []))
            if a:
                b = pick(b_cands, near=(a["lat"], a["lon"]))
            else:
                b = pick(b_cands, prefer_ops=ops)
                if b:
                    a = pick(in_area(idx.get(norm(a_name or ""), [])), near=(b["lat"], b["lon"]))
            # A line whose ends are implausibly far apart is a bad match.
            if a and b and miles((a["lat"], a["lon"]), (b["lat"], b["lon"])) > max(80, (line_miles or 0) * 1.6):
                b = None
        if not a and not b:
            skipped.append((ba, name, "no geocode"))
            continue

        if a and b:
            geometry = {"type": "LineString", "coordinates": [[a["lon"], a["lat"]], [b["lon"], b["lat"]]]}
            precision = "approximate"  # straight line between the two substations, not the surveyed route
        else:
            p = a or b
            geometry = {"type": "Point", "coordinates": [p["lon"], p["lat"]]}
            precision = "exact" if ptype.startswith("substation") else "approximate"

        uid, uname, ukind = BA_UTILITY[ba]
        owner = split_owner(name)[0]
        if owner in OWNER_PREFIX:
            uid, uname, ukind = OWNER_PREFIX[owner]
        elif ba == "SOUTHERN":
            op = ((a or b)["operator"] or "").lower()
            for key, u in OPERATORS:
                if key in op:
                    uid, uname, ukind = u
                    break
        if uid not in utilities:
            utilities[uid] = {"id": uid, "name": uname, "kind": ukind, "states": [], "color": PALETTE[len(utilities) % len(PALETTE)]}
            if uid in PARENT:
                utilities[uid]["parent"] = PARENT[uid]

        months = build_months(ptype, line_miles)
        end_idx = year * 12 + 4  # SERTP gives a year; assume in service by May (ahead of summer peak)
        start_idx = end_idx - months
        ym = lambda i: f"{i // 12}-{i % 12 + 1:02d}"  # noqa: E731
        pid = "sertp-" + re.sub(r"[^a-z0-9]+", "-", f"{year} {name}".lower()).strip("-")[:90]
        if any(p["id"] == pid for p in projects):
            pid += f"-{len(projects)}"

        projects.append(
            {
                "id": pid,
                "utility": uid,
                "name": split_owner(name)[1].title().replace(" Kv ", " kV ").replace("\u2013", "-"),
                "type": ptype,
                "voltageKv": max(kv) if kv else None,
                "geometry": geometry,
                "locationPrecision": precision,
                "construction": {"start": ym(start_idx), "end": ym(end_idx), "precision": "estimated"},
                "inService": ym(end_idx),
                "status": "planned",
                "description": desc + (f" Need: {need}" if need else ""),
                "state": "??",  # filled below from coordinates
                "sources": [
                    {
                        "url": URL,
                        "title": "2026 SERTP Preliminary Transmission Expansion Plan Report (Non-CEII)",
                        "publisher": "Southeastern Regional Transmission Planning (SERTP)",
                        "retrieved": date.today().isoformat(),
                        "quote": f"In-Service Year: {year}. Project Name: {name}. Description: {desc}"[:600],
                    },
                    {
                        "url": "https://www.openstreetmap.org/",
                        "title": "Substation locations: " + ", ".join(x["name"] for x in (a, b) if x),
                        "publisher": "OpenStreetMap contributors (ODbL)",
                    },
                ],
            }
        )

    for p in projects:
        lon, lat = p["geometry"]["coordinates"][0] if p["geometry"]["type"] == "LineString" else p["geometry"]["coordinates"]
        p["state"] = state_of(lat, lon)
        st = utilities[p["utility"]]["states"]
        if p["state"] not in st:
            st.append(p["state"])

    OUT.write_text(json.dumps({"utilities": list(utilities.values()), "projects": projects}, indent=2) + "\n")
    print(f"wrote {len(projects)} projects from {len(utilities)} utilities -> {OUT}")
    print(f"skipped {len(skipped)}: " + ", ".join(f"{r}" for _, _, r in skipped[:0]) + str({r: sum(1 for s in skipped if s[2] == r) for r in {s[2] for s in skipped}}))


STATE_CODES = {
    "Alabama": "AL", "Florida": "FL", "Georgia": "GA", "Kentucky": "KY", "Mississippi": "MS", "North Carolina": "NC",
    "South Carolina": "SC", "Tennessee": "TN", "Virginia": "VA", "West Virginia": "WV", "Arkansas": "AR",
    "Louisiana": "LA", "Missouri": "MO", "Indiana": "IN", "Illinois": "IL", "Ohio": "OH", "Oklahoma": "OK", "Texas": "TX",
}
_STATES = None


def _rings(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return [poly[0] for poly in polys]


def _inside(lon, lat, ring):
    hit = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def state_of(lat: float, lon: float) -> str:
    """Point-in-polygon against US state boundaries (ingest/cache/us-states.json)."""
    global _STATES
    if _STATES is None:
        f = CACHE / "us-states.json"
        fetch("https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json", f)
        _STATES = [(STATE_CODES.get(ft["properties"]["name"]), _rings(ft["geometry"])) for ft in json.loads(f.read_text())["features"]]
    for code, rings in _STATES:
        if code and any(_inside(lon, lat, r) for r in rings):
            return code
    return "??"


if __name__ == "__main__":
    main()
