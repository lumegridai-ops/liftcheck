# LiftCheck

**Check the station path you actually use, then check the alternative's elevators too.**

LiftCheck combines public MBTA station pathways with current service and equipment alerts. It remembers up to four chosen station checks in a journey and exposes the same actions to its browser UI and an MCP client.

The working prototype covers **Assembly, State and Malden Center**. It checks mapped entrance→platform or platform→exit connections. It does not plan an entire transit journey or certify accessibility.

The **v0.3.0** wayfinding interface and matching **78.374-second** demo are published. The recording uses native **3840×2160** browser captures, 30fps video delivery and disclosed **Google Gemini synthetic narration**. It starts with labeled invented outages, then switches to actual current reports, saved-journey persistence and the working MCP connection. [Timed captions](artifacts/liftcheck-wayfinding-demo-4k.srt) and the [recording manifest](artifacts/wayfinding-video/manifest.json) accompany the master. [Watch the current 4K demo](https://www.youtube.com/watch?v=Q-eO-lOigUU) or [download the master and source media](https://github.com/lumegridai-ops/liftcheck/releases/tag/v0.3.0). **[Submitted to the Amazon Alexa+ track](https://devpost.com/software/liftcheck) on September 27, 2026 at 04:22 UTC.** The matching video and new listing thumbnail are attached to that entry; anonymous playback and the 2160p stream were checked separately.

## Try it online

[Open LiftCheck](https://liftcheck.dgkv.chatgpt.site) — hosted on OpenAI Sites, with no sign-in required. The public version uses the actual MCP tools and live MBTA feed. Saved journeys are isolated by browser; clearing cookies loses access. The remote endpoint is `https://liftcheck.dgkv.chatgpt.site/api/mcp`. See [hosting and verification](docs/HOSTING.md).

## Run it

Node.js 22 or newer is required. No model key or MBTA API key is needed for the current low-volume experiment.

```sh
npm ci
npm start
```

Open **http://127.0.0.1:4322**. The server binds to loopback. It is a single-user local prototype; it must not be exposed publicly without authentication, tenant separation and an operating/rate-limit plan.

Choose Assembly → Foley St → Orange Line / Forest Hills, then check current reports. Select “Exiting” to evaluate the actual reverse direction. Save multiple station legs under an explicit name to check them together against one snapshot. Draft checks can be edited, removed and reordered. **Use as draft** copies a saved journey into a new draft; saving it creates another journey rather than overwriting the original.

The redesigned interface puts the station, exact endpoints, status and source age together. Its elevator dependency sequence becomes vertical on phones. Replay labels appear on the report, inside each result card and on its path diagram. See the [design research and browser review](docs/DESIGN_REVIEW.md) for screenshots, the tested interactions and accessibility-review limits.

The four replay controls demonstrate the failure case without changing live data: no injected closure; elevator 717 closed; both 717 and alternate 719 closed; expired evidence. **All replay outages are invented**, use a fixed September 26, 2026 evaluation time, and are visibly labeled. A live check independently fetches current alerts.

## What the result establishes

- **No reported closure:** a supported mapped path has no applicable reported blocking condition in the fetched snapshot. This does not mean the elevator is working or the journey is accessible.
- **Another entrance:** an independently checked mapped path begins or ends at a different entrance. The outdoor approach to that entrance is not checked.
- **Blocked:** reported closures prevent the selected mapped path, with no checked alternative found.
- **Unknown:** evidence is incomplete, expired, malformed or outside the supported coverage.

Stairs and escalators are excluded. The routing objective is fewest mapped edges, not shortest distance. The page shows facilities, source reports, map provenance and limits; a JSON download includes the complete calculation evidence. After five minutes, live evidence expires visibly: its usable path diagram and former positive summary are withdrawn, while the dated evidence remains available to inspect. Successful alert responses are shared for 60 seconds, and a failed refresh cannot convert missing records into reassurance.

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

This is a functioning MCP server intended for the Amazon Alexa+ hackathon track. **No Alexa device, voice conversation, account-linked add-on or deployed remote Alexa connection has been tested.** The page is a visual MCP client, not a claimed Alexa simulation. No model decides station-path status in the application; a connecting assistant supplies the conversational layer. Gemini text-to-speech is used separately to produce the demonstration narration.

## Verify

```sh
npm test
npx playwright install chromium
npm run test:browser
```

The current interface passes the existing **48 Node tests and five browser stories**, plus **five hosted-store/protocol groups**. Tests include a real SDK client over HTTP, restart persistence, double-outage withdrawal, alert pagination and malformed-data counterexamples. Browser fixture checks are synthetic and labeled; separate actual live-source observations and the revised demonstration are documented in [the verification record](docs/QA.md).

Read [the engine notes](docs/ENGINE.md) for exact graph/alert semantics, [the independent review](docs/REVIEW.md) for findings and fixes, and [the interface review](docs/DESIGN_REVIEW.md) for manual draft-flow, keyboard, contrast and 390px/320px checks. Passing checks are engineering evidence, not rider validation, complete accessibility certification or a competitive benchmark.

## Data and storage

The initial source feed covers September 17–December 12, 2026. Later live checks refuse an out-of-date graph. Refresh the static map with Python 3 and network access:

```sh
npm run data:refresh
npm test
```

Restart the app after refreshing. To reproduce a captured archive, use `python3 scripts/import_gtfs.py --source /path/to/archive-and-provenance --output data`. The refresh helper uses a temporary directory and validates the imported graph before replacing the bundled files.

Saved journeys live under `runtime/` by default, which is excluded from Git. Set `LIFTCHECK_DATA_DIR` to change it. A single-writer lock prevents two servers from writing the same data. If a process is forcibly killed, remove its `.lock` only after confirming no LiftCheck process is using that directory. Writes use a private temporary file and atomic rename; storage is not a multi-user database.

Code is MIT. Transportation data has its own provider license and attribution in [data/NOTICE.md](data/NOTICE.md); the self-hosted IBM Plex font includes its [OFL license](public/fonts/OFL.txt). All design and implementation were produced with AI assistance during September 26, 2026; no invented users, physical station survey or customer endorsement is claimed.

## Entry readiness

[The Alexa+ entry](https://devpost.com/software/liftcheck) is submitted. Devpost confirmed submission 1200369 on September 27, 2026 at 04:22 UTC. See the [entry text and receipt](docs/SUBMISSION.md). No Alexa-device onboarding or account-linked integration is claimed.
