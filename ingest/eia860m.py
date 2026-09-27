"""EIA-860M planned generators -> data/projects/eia860m.json (GridSync dataset contract).

EIA-860M is the monthly federal survey of every planned generator >= 1 MW: owner, site
coordinates, planned operation month and permitting/construction status.

    python ingest/eia860m.py                     # downloads the July 2026 file
    python ingest/eia860m.py path/to/file.xlsx   # or use a local copy
"""

import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

import pandas as pd

from common import PARENT

URL = "https://www.eia.gov/electricity/data/eia860m/archive/xls/july_generator2026.xlsx"
STATES = {"FL", "GA", "SC", "NC", "AL"}
OUT = Path(__file__).resolve().parent.parent / "data" / "projects" / "eia860m.json"

# Typical months from construction start to commercial operation. EIA only publishes the
# in-service month, so the window is an estimate and is marked "estimated".
BUILD_MONTHS = {
    "generation_solar": 12,
    "generation_storage": 9,
    "generation_gas": 24,
    "generation_other": 18,
}
GAS_CC_MONTHS = 30

STATUS = {
    "P": "planned",
    "L": "permitting",
    "T": "approved",
    "U": "under_construction",
    "V": "under_construction",
    "TS": "under_construction",
}

PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#ca8a04", "#db2777", "#4f46e5", "#059669"]


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def project_type(tech: str) -> str:
    t = tech.lower()
    if "solar" in t:
        return "generation_solar"
    if "batter" in t:
        return "generation_storage"
    if "natural gas" in t:
        return "generation_gas"
    return "generation_other"


def utility_kind(name: str) -> str:
    n = name.lower()
    if "membership" in n or "cooperative" in n or " emc" in n or "electric member" in n or "el member" in n:
        return "cooperative"
    if "public service authority" in n:
        return "state"
    if "tennessee valley" in n:
        return "federal"
    if "oglethorpe" in n:
        return "cooperative"
    if n.startswith("city of") or "municipal" in n or "public services" in n:
        return "municipal"
    return "investor_owned"


def month_add(y: int, m: int, n: int) -> tuple[int, int]:
    i = y * 12 + (m - 1) + n
    return i // 12, i % 12 + 1


def ym(y: int, m: int) -> str:
    return f"{y}-{m:02d}"


def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else None
    if src is None:
        src = str(Path(__file__).resolve().parent / "cache" / "eia860m.xlsx")
        Path(src).parent.mkdir(exist_ok=True)
        if not Path(src).exists():
            print(f"downloading {URL}")
            urllib.request.urlretrieve(URL, src)

    df = pd.read_excel(src, sheet_name="Planned", header=2)
    df = df[df["Plant State"].isin(STATES) & (df["Sector"] == "Electric Utility")]
    df = df.dropna(subset=["Latitude", "Longitude", "Planned Operation Year", "Planned Operation Month"])

    projects, utilities = [], {}
    # One project per plant + technology (a plant's generators are built together).
    for (entity, plant_id, tech), g in df.groupby(["Entity Name", "Plant ID", "Technology"]):
        row = g.iloc[0]
        utility_id = slug(entity)
        if utility_id not in utilities:
            utilities[utility_id] = {
                "id": utility_id,
                "name": entity,
                "kind": utility_kind(entity),
                "states": [],
                "color": PALETTE[len(utilities) % len(PALETTE)],
            }
            if utility_id in PARENT:
                utilities[utility_id]["parent"] = PARENT[utility_id]
        if row["Plant State"] not in utilities[utility_id]["states"]:
            utilities[utility_id]["states"].append(row["Plant State"])

        ptype = project_type(tech)
        build = GAS_CC_MONTHS if "combined cycle" in tech.lower() else BUILD_MONTHS[ptype]
        years = g["Planned Operation Year"].astype(int)
        months = g["Planned Operation Month"].astype(int)
        last = max(zip(years, months))
        first = min(zip(years, months))
        start = month_add(*first, -build)
        status_code = str(row["Status"]).split(")")[0].strip("(")
        mw = round(float(g["Nameplate Capacity (MW)"].sum()), 1)
        units = ", ".join(str(x) for x in g["Generator ID"])

        projects.append(
            {
                "id": slug(f"eia-{int(plant_id)}-{tech}"),
                "utility": utility_id,
                "name": f"{row['Plant Name']} ({tech})",
                "type": ptype,
                "voltageKv": None,
                "capacityMw": mw,
                "geometry": {"type": "Point", "coordinates": [float(row["Longitude"]), float(row["Latitude"])]},
                "locationPrecision": "exact",
                "construction": {"start": ym(*start), "end": ym(*last), "precision": "estimated"},
                "inService": ym(*last),
                "status": STATUS.get(status_code, "planned"),
                "description": f"{mw} MW {tech.lower()} planned by {entity} (units {units}). Status: {row['Status']}.",
                "county": str(row["County"]),
                "state": row["Plant State"],
                "sources": [
                    {
                        "url": URL,
                        "title": f"EIA-860M Preliminary Monthly Electric Generator Inventory, July 2026 (plant {int(plant_id)})",
                        "publisher": "U.S. Energy Information Administration",
                        "retrieved": date.today().isoformat(),
                    }
                ],
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"utilities": list(utilities.values()), "projects": projects}, indent=2) + "\n")
    print(f"wrote {len(projects)} projects from {len(utilities)} utilities -> {OUT}")


if __name__ == "__main__":
    main()
