#!/usr/bin/env python3
"""Fetch public MBTA topology, validate an import, then replace the bundled map.

This changes static map data only. It does not invent or cache live outages.
Use --source for a previously captured archive and provenance record.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.request
from import_gtfs import build

ROOT = Path(__file__).resolve().parents[1]
URL = "https://cdn.mbta.com/MBTA_GTFS.zip"

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=Path)
parser.add_argument("--output", type=Path, default=ROOT / "data")
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix="liftcheck-map-") as scratch:
    scratch = Path(scratch)
    source = args.source
    if source is None:
        source = scratch / "source"
        source.mkdir()
        with urllib.request.urlopen(URL, timeout=60) as response:
            data = response.read(150_000_001)
            headers = {key: response.headers[key] for key in ("Last-Modified", "ETag") if key in response.headers}
        if len(data) > 150_000_000:
            raise RuntimeError("GTFS archive exceeds the bounded download.")
        (source / "MBTA_GTFS.zip").write_bytes(data)
        (source / "MBTA_GTFS.zip.source.json").write_text(json.dumps({
            "url": URL, "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "bytes": len(data), "headers": headers,
        }))
    staged = scratch / "staged"
    build(source, staged)
    validate = "import {readFileSync} from 'node:fs'; import {createNetwork,stationCatalog} from './src/engine.mjs'; const n=createNetwork(JSON.parse(readFileSync(process.argv[1],'utf8'))); if(stationCatalog(n).some(s=>!s.entrances.length||!s.platforms.length))throw Error('A supported station lost its endpoints');"
    subprocess.run(["node", "--input-type=module", "-e", validate, str(staged / "network.json")], cwd=ROOT, check=True)
    args.output.mkdir(parents=True, exist_ok=True)
    for name in ("network.json", "SOURCE.json"):
        destination = args.output / name
        temporary = destination.with_suffix(destination.suffix + ".tmp")
        temporary.write_bytes((staged / name).read_bytes())
        os.replace(temporary, destination)
    print("Map updated. Restart the server and run npm test before using the new topology.")
