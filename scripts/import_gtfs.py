#!/usr/bin/env python3
"""Build a small, attributed station-path snapshot from the supplied MBTA archive.

No network requests. The archive and response provenance must already exist.
Only the explicitly listed stations are exposed; cross-station paths are counted
and omitted, not silently rewritten into within-station connections.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import zipfile

STATION_IDS = ("place-astao", "place-state", "place-mlmnl")
ROOT = Path(__file__).resolve().parents[1]


def number(value, cast=float):
    return cast(value) if value not in (None, "") else None


def build(source_dir, output_dir):
    archive_path = source_dir / "MBTA_GTFS.zip"
    archive_bytes = archive_path.read_bytes()
    provenance = json.loads((source_dir / "MBTA_GTFS.zip.source.json").read_text())
    archive = zipfile.ZipFile(io.BytesIO(archive_bytes))

    def table(name):
        return csv.DictReader(io.TextIOWrapper(archive.open(name), encoding="utf-8-sig"))

    stop_rows = list(table("stops.txt"))
    stop_by_id = {row["stop_id"]: row for row in stop_rows}
    selected = {row["stop_id"]: row for row in stop_rows
                if row["stop_id"] in STATION_IDS or row["parent_station"] in STATION_IDS}
    selected_platforms = {key for key, row in selected.items() if row["location_type"] == "0"}
    route_types = {row["route_id"]: int(row["route_type"]) for row in table("routes.txt")}
    trips = {row["trip_id"]: (row["route_id"], number(row["direction_id"], int))
             for row in table("trips.txt")}
    boardings = {stop_id: set() for stop_id in selected_platforms}
    for row in table("stop_times.txt"):
        if row["stop_id"] in boardings and row["trip_id"] in trips:
            route_id, direction = trips[row["trip_id"]]
            boardings[row["stop_id"]].add((route_id, route_types[route_id], direction))

    nodes = []
    kinds = {"0": "platform", "1": "station", "2": "entrance", "3": "node", "4": "boarding_area"}
    for stop_id, row in sorted(selected.items()):
        name = row["stop_desc"] or row["stop_name"]
        nodes.append({
            "id": stop_id, "name": name,
            "stationId": row["parent_station"] or stop_id,
            "kind": kinds.get(row["location_type"], "unknown"),
            "wheelchairBoarding": number(row["wheelchair_boarding"], int) or 0,
            "levelId": row["level_id"] or None,
            "latitude": number(row["stop_lat"]), "longitude": number(row["stop_lon"]),
            "sourceUrl": row["stop_url"] or None,
            "boardings": [{"routeId": rid, "routeType": rt, "directionId": direction}
                          for rid, rt, direction in sorted(boardings.get(stop_id, set()), key=str)],
        })

    node_by_id = {node["id"]: node for node in nodes}
    edges = []
    omitted_cross_station = {station: 0 for station in STATION_IDS}
    for row in table("pathways.txt"):
        origin, destination = row["from_stop_id"], row["to_stop_id"]
        if origin not in selected and destination not in selected:
            continue
        if (origin not in selected or destination not in selected or
                node_by_id[origin]["stationId"] != node_by_id[destination]["stationId"]):
            for station in {node_by_id[key]["stationId"] for key in [origin, destination] if key in node_by_id}:
                omitted_cross_station[station] += 1
            continue
        edges.append({
            "id": row["pathway_id"], "from": origin, "to": destination,
            "stationId": node_by_id[origin]["stationId"],
            "mode": int(row["pathway_mode"]), "bidirectional": row["is_bidirectional"] == "1",
            "facilityId": row["facility_id"] or None,
            "lengthM": number(row["length"]), "traversalSeconds": number(row["traversal_time"]),
            "maxSlope": number(row["max_slope"]), "stairCount": number(row["stair_count"], int),
            "name": row["pathway_name"], "signpostedAs": row["signposted_as"] or None,
        })

    api_facilities = {}
    facility_api_path = source_dir / "facilities.json"
    if facility_api_path.exists():
        api_facilities = {row["id"]: row for row in json.loads(facility_api_path.read_text()).get("data", [])}
    facilities = []
    used_facility_ids = {edge["facilityId"] for edge in edges if edge["facilityId"]}
    for row in table("facilities.txt"):
        if row["facility_id"] not in used_facility_ids:
            continue
        api = api_facilities.get(row["facility_id"], {})
        properties = api.get("attributes", {}).get("properties", [])
        facilities.append({
            "id": row["facility_id"], "name": row["facility_long_name"],
            "type": row["facility_type"].upper(), "stationId": row["stop_id"],
            "alternateServiceText": [p["value"] for p in properties if p.get("name") == "alternate-service-text"],
            "sourceUrl": "https://api-v3.mbta.com/facilities/" + row["facility_id"],
        })

    connected = {edge[key] for edge in edges for key in ("from", "to")}
    stations = []
    for station_id in STATION_IDS:
        station_nodes = [node for node in nodes if node["stationId"] == station_id]
        station_edges = [edge for edge in edges if edge["stationId"] == station_id]
        stations.append({
            "id": station_id, "name": stop_by_id[station_id]["stop_name"],
            "entranceIds": [node["id"] for node in station_nodes if node["kind"] == "entrance" and node["id"] in connected],
            "platformIds": [node["id"] for node in station_nodes if node["kind"] == "platform" and node["id"] in connected],
            "routeIds": sorted({b["routeId"] for node in station_nodes for b in node["boardings"]}),
            "coverage": {
                "scope": "published within-station pathways only; not field verified",
                "pathwayCount": len(station_edges),
                "elevatorEdgesWithoutFacility": sum(edge["mode"] == 5 and not edge["facilityId"] for edge in station_edges),
                "omittedCrossStationEdges": omitted_cross_station[station_id],
            },
        })

    feed = next(table("feed_info.txt"))
    source = {
        "publisher": "Massachusetts Bay Transportation Authority (MBTA), MassDOT",
        "url": provenance["url"], "fetchedAt": provenance["fetched_at"],
        "lastModified": provenance.get("headers", {}).get("Last-Modified"),
        "sha256": hashlib.sha256(archive_bytes).hexdigest(),
        "feedVersion": feed["feed_version"],
        "feedStartDate": feed["feed_start_date"], "feedEndDate": feed["feed_end_date"],
        "documentationUrl": "https://github.com/mbta/gtfs-documentation/blob/master/reference/gtfs.md#pathwaystxt",
        "attribution": "Contains MBTA/MassDOT data. Independently developed; not an official MBTA product. No guarantee of completeness or current physical accessibility.",
        "selectedStationIds": list(STATION_IDS),
        "fileHashes": {name: hashlib.sha256(archive.read(name)).hexdigest()
                       for name in ["stops.txt", "pathways.txt", "facilities.txt", "feed_info.txt", "routes.txt", "trips.txt", "stop_times.txt"]},
    }
    if facility_api_path.exists():
        source["facilityResponseSha256"] = hashlib.sha256(facility_api_path.read_bytes()).hexdigest()
        source["facilitySourceUrl"] = "https://api-v3.mbta.com/facilities"
    network = {"schemaVersion": 1, "source": source, "stations": stations,
               "nodes": nodes, "edges": sorted(edges, key=lambda row: row["id"]),
               "facilities": sorted(facilities, key=lambda row: row["id"])}
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "network.json").write_text(json.dumps(network, ensure_ascii=False, separators=(",", ":")) + "\n")
    (output_dir / "SOURCE.json").write_text(json.dumps(source, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"stations": len(stations), "nodes": len(nodes), "edges": len(edges),
                      "facilities": len(facilities), "output": str(output_dir / "network.json")}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Directory containing the GTFS archive and its source JSON")
    parser.add_argument("--output", type=Path, default=ROOT / "data")
    args = parser.parse_args()
    build(args.source, args.output)
