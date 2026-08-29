"""Import the establishment -> Area Enforcement Officer (AEO) map from a CSV.

The CSV needs at least the columns ``est_id`` and ``aeo`` (any others are
ignored). Each establishment row is updated in place and every distinct AEO
name is also added to the /api/aeo directory.

Usage:
    python backend/import_est_aeo.py <csv_path> [api_base]

    api_base defaults to http://localhost:8000
    Production:
        python backend/import_est_aeo.py establishments_filtered_all.csv https://bluebook-redbook.onrender.com

Only the standard library is used, so it runs anywhere Python does.
"""

import csv
import json
import sys
import urllib.request

BATCH = 2000


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)

    csv_path = sys.argv[1]
    api_base = (sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8000").rstrip("/")

    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    mappings = [
        {"est_id": (r.get("est_id") or "").strip(), "aeo": (r.get("aeo") or "").strip()}
        for r in rows
        if (r.get("est_id") or "").strip() and (r.get("aeo") or "").strip()
    ]
    print(f"{len(mappings)} est->AEO mappings read from {csv_path}")
    print(f"target: {api_base}/api/establishments/aeo/import")

    url = f"{api_base}/api/establishments/aeo/import"
    totals = {"establishments_updated": 0, "est_ids_not_found": 0, "directory_names_added": 0}

    for i in range(0, len(mappings), BATCH):
        chunk = mappings[i:i + BATCH]
        body = json.dumps({"mappings": chunk}).encode()
        req = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/json"}, method="POST"
        )
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read())
        for k in totals:
            totals[k] += data.get(k, 0)
        print(f"  batch {i // BATCH + 1}/{(len(mappings) + BATCH - 1) // BATCH}: {data}")

    print("DONE:", totals)


if __name__ == "__main__":
    main()
