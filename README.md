# LiftCheck

**Check the station path you actually use, then check the alternative's elevators too.**

LiftCheck combines public MBTA station pathways with current service and equipment alerts. It remembers up to four chosen station checks in a journey and exposes the same actions to its browser UI and an MCP client.

The working prototype covers **Assembly, State and Malden Center**. It checks mapped entrance→platform or platform→exit connections. It does not plan an entire transit journey or certify accessibility.

[Watch the 98-second working demonstration on YouTube](https://www.youtube.com/watch?v=agZEp9xEJXY), or [download the original recording](https://github.com/lumegridai-ops/liftcheck/releases/tag/v0.1.0). The recording distinguishes current-source checks from synthetic outage replays and uses disclosed synthetic narration. This project has not yet been submitted to the hackathon.

## Run it

Node.js 22 or newer is required. No model key or MBTA API key is needed for the current low-volume experiment.

```sh
npm ci
npm start
```

Open **http://127.0.0.1:4322**. The server binds to loopback. It is a single-user local prototype; it must not be exposed publicly without authentication, tenant separation and an operating/rate-limit plan.

Choose Assembly → Foley St → Orange Line / Forest Hills, then check current reports. Select “Exiting” to evaluate the actual reverse direction. Save multiple station legs under an explicit name to check them together against one snapshot.

The four replay controls demonstrate the failure case without changing live data: no injected closure; elevator 717 closed; both 717 and alternate 719 closed; expired evidence. **All replay outages are invented**, use a fixed September 26, 2026 evaluation time, and are visibly labeled. A live check independently fetches current alerts.

## What the result establishes

- **No reported closure:** a supported mapped path has no applicable reported blocking condition in the fetched snapshot. This does not mean the elevator is working or the journey is accessible.
- **Another entrance:** an independently checked mapped path begins or ends at a different entrance. The outdoor approach to that entrance is not checked.
- **Blocked:** reported closures prevent the selected mapped path, with no checked alternative found.
- **Unknown:** evidence is incomplete, expired, malformed or outside the supported coverage.

Stairs and escalators are excluded. The routing objective is fewest mapped edges, not shortest distance. The page shows facilities, source reports, map provenance and limits; a JSON download includes the complete calculation evidence. Results expire visibly after five minutes. Successful alert responses are shared for 60 seconds, and a failed refresh cannot convert missing records into reassurance.

## MCP integration

The actual endpoint is **http://127.0.0.1:4322/mcp**, implementing **MCP 2025-11-25 over Streamable HTTP** with the official SDK. It is stateless and accepts POST. The web application negotiates the protocol and calls these tools directly; it does not use a pretend chat parser.

| Tool | Purpose |
| --- | --- |
| get_station_catalog | Discover supported entrance/platform IDs and direction |
| get_saved_journeys | Read saved journeys and the current revision |
| save_journey | Save 1–4 explicit station legs with optimistic revision checking |
| check_station_path | Fetch current reports and assess a chosen leg |
| check_journey | Assess every saved leg from one consistent snapshot |
| run_assembly_replay | Run an explicitly synthetic demonstration |

Example configuration for a client that supports remote HTTP MCP servers:

```json
{"mcpServers":{"liftcheck":{"url":"http://127.0.0.1:4322/mcp"}}}
```

Client configuration formats vary. A useful prompt is: “Find Assembly's Foley Street entrance and Forest Hills platform in the catalog. Check that path using current reports. Explain every limitation and do not call the station accessible.”

This is a functioning MCP server intended for the Amazon Alexa+ hackathon track. **No Alexa device, voice conversation, account-linked add-on or deployed remote Alexa connection has been tested.** The page is a visual MCP client, not a claimed Alexa simulation. No LLM inference occurs inside this repository; the connecting assistant supplies that layer.

## Verify

```sh
npm test
npx playwright install chromium
npm run test:browser
```

The initial release passes 48 Node tests and five browser stories. Tests include a real SDK client over HTTP, restart persistence, double-outage withdrawal, alert pagination and malformed-data counterexamples. Browser fixture checks are synthetic and labeled; the separate live-source/browser observation is documented in docs/QA.md.

Read docs/ENGINE.md for exact graph/alert semantics and docs/REVIEW.md for the independent reviewer’s findings and fixes. Passing checks are engineering evidence, not rider validation or a competitive benchmark.

## Data and storage

The initial source feed covers September 17–December 12, 2026. Later live checks refuse an out-of-date graph. Refresh the static map with Python 3 and network access:

```sh
npm run data:refresh
npm test
```

Restart the app after refreshing. To reproduce a captured archive, use `python3 scripts/import_gtfs.py --source /path/to/archive-and-provenance --output data`. The refresh helper uses a temporary directory and validates the imported graph before replacing the bundled files.

Saved journeys live under `runtime/` by default, which is excluded from Git. Set `LIFTCHECK_DATA_DIR` to change it. A single-writer lock prevents two servers from writing the same data. If a process is forcibly killed, remove its `.lock` only after confirming no LiftCheck process is using that directory. Writes use a private temporary file and atomic rename; storage is not a multi-user database.

Code is MIT. Transportation data has its own provider license and attribution in data/NOTICE.md. All design and implementation were produced with AI assistance during September 26, 2026; no invented users, physical station survey or customer endorsement is claimed.
