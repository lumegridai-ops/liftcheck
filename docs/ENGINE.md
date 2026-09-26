# LiftCheck station engine

Implemented 26 September 2026. This engine assesses the published pathways inside one supported MBTA station against a supplied alert snapshot. It does not certify physical accessibility or plan an entire transit journey.

## Data and reproduction

Run `python3 scripts/import_gtfs.py` from the project directory. It reads the already downloaded archive and provenance under `../research/round2/liftcheck`; it makes no network requests. Optional `--source` and `--output` arguments select other local directories.

The importer reads stops, pathways, facilities, feed information, routes, trips and stop times from the actual archive. Platform route and direction identifiers come from the GTFS trip/stop-time relationship, not a guess from station names. It also includes official alternate-service text from the supplied facilities API response. That text is reference material, not a route the engine blindly recommends.

The output currently contains three explicitly selected stations: Assembly, State and Malden Center; 133 nodes, 454 directed edges and 20 referenced facilities. Cross-station edges would be counted and omitted. These stations had no omitted cross-station edges in this snapshot. The first selectable workflow supports heavy-rail platforms with an unambiguous route and direction. Other source nodes remain available for walking-path topology; bus and commuter-rail platforms are not exposed as supported endpoints.

`data/SOURCE.json` and the network's source object record the actual feed version, service dates, retrieval time, publisher attribution, archive SHA-256 and hashes for the relevant GTFS files. The input was feed version `Fall 2026, 2026-09-24T17:51:42+00:00, version D`, dated 17 September–12 December 2026. The archive SHA-256 is `e3fdffe291bbe715d09356c1f2ceb58c8fc0781478e4041ba46160d964723133`.

Primary references:

- [MBTA GTFS archive](https://cdn.mbta.com/MBTA_GTFS.zip).
- [MBTA pathway field semantics](https://github.com/mbta/gtfs-documentation/blob/master/reference/gtfs.md#pathwaystxt): directed edges, facility links, and incomplete network coverage.
- [MBTA V3 schema](https://api-v3.mbta.com/docs/swagger/swagger.json): informed-entity intersections, activities, active windows and facility data.
- [All-activity alert query](https://api-v3.mbta.com/alerts?filter%5Bactivity%5D=ALL&page%5Blimit%5D=1000). The default alerts endpoint excludes some accessibility-only activities. The adapter must request all required activities and follow pagination before asserting completeness.

## Public contract

```js
import {createNetwork, stationCatalog, evaluatePath} from './src/engine.mjs';
const network = createNetwork(rawNetwork);
const catalog = stationCatalog(network);
const result = evaluatePath(network,
  {stationId: 'place-astao', fromId: 'door-astao-foley', toId: '70278'},
  {alerts: rawMbtaDataArray, fetchedAt, complete: true, now, sourceUrl, responseHash});
```

`createNetwork` expects schema version 1 with source metadata and stations/nodes/edges/facilities arrays. It rejects duplicate identifiers, invalid edge endpoints, cross-station edges, invalid modes and unknown node station references. It does not fabricate missing facilities. The return value includes internal Maps and is intended as an in-memory object; persist the raw JSON, not those indexes.

`stationCatalog` returns `{id,name,entrances:[{id,name}],platforms:[{id,name}]}`. Known wheelchair-inaccessible endpoints and unsupported boarding contexts are excluded from the catalog. Explicit calls using an unsupported endpoint return unknown.

`evaluatePath` accepts same-station entrance→platform, platform→entrance, or platform→platform legs. It never mutates the network, request, snapshot or saved user trip. Times may be ISO timestamps with a time zone, Date instances, or epoch milliseconds. Omitted now uses the actual current time. The caller is responsible for distinguishing live operation from a frozen replay and must not present a replay's injected clock as a live check.

The result contains:

```js
{
  status: 'no_reported_closure' | 'alternate_entrance' | 'blocked' | 'unknown',
  summary: 'Short scoped explanation',
  path: null | {
    fromId, toId,
    nodes: [{id, name, kind}],
    edges: [{id, from, to, mode, facilityId, name, sourceEdgeId}],
    facilities: [{id, name, sourceUrl}],
    metric: 'fewest mapped edges', edgeCount, lengthM: null | number
  },
  alternatives: [{entranceId, entranceName, changeType: 'entrance' | 'exit', path}],
  closures: [{id, facilityId, facilityIds, header, effect, url, simulation, activePeriods, ...}],
  advisories: [{id, facilityId, facilityIds, header, effect, url, simulation, activePeriods, ...}],
  evidence: {evaluatedAt, fetchedAt, validUntil, maxAgeMs, complete, sourceUrl,
             responseHash, feedVersion, networkSourceUrl, networkSha256, ...},
  limitations: ['Explicit limitations']
}
```

`path` always refers to the requested endpoints. If the requested path cannot be confirmed, it is null. A proposed alternate is present only in `alternatives`, even when status is alternate_entrance. Accepting an alternate requires a separate product action; assessment does not rewrite the saved route.

## Decision behavior

| Status | Meaning |
| --- | --- |
| no_reported_closure | A directed mapped path satisfying the implemented step-free rules was found, and no applicable reported blocking/uncertain condition was found on that path in the current complete snapshot. Relevant informational advisories may still exist. |
| alternate_entrance | The preferred endpoint path could not be confirmed; a different mapped entrance/exit has a separately checked path. The outdoor route to it has not been evaluated. |
| blocked | Applicable reported closures prevent the selected mapped path and no checked alternative was found. It does not mean every real-world station access option is impossible. |
| unknown | Evidence is expired, incomplete, malformed, outside supported map/date coverage, or otherwise insufficient. No reassurance is inferred from missing data. |

Path search uses breadth-first search over directed edges. Only modes 1, 5, 6 and 7 support a confirmed path. Stairs, escalators, nonzero stair counts, and nodes marked wheelchair-inaccessible are excluded. An elevator requires a mapped facility of type ELEVATOR assigned to the same station. An unknown facility, mismatched station/type, or unsupported pathway mode cannot support a confirmed path. The engine may still find a different fully mapped path that avoids that uncertainty.

The objective is fewest mapped edges. This is deterministic and disclosed. It is neither shortest walking distance nor minimum time. `lengthM` is supplied only if every chosen edge has a numeric source length; it does not change the search objective.

Alerts are evaluated at the supplied time. Start is inclusive and end exclusive. Null end means continuing. A valid closed_timestamp at or before the check retires an alert. Invalid relevant periods remain unresolved. An old updated_at does not make a current long-running closure stale.

Within one informed entity, stop, route, route type, direction and facility constraints form an intersection. Separate entities are alternatives. The engine uses the endpoint's mapped boarding context; a different valid direction is not automatically treated as the selected direction. Specific train-trip selectors remain unresolved because this product does not choose a train. Malformed selector types and activity entries cannot quietly turn a closure into an irrelevant alert.

Confirmed closure effects remove their mapped facility/node or relevant whole context. Unresolved access/service changes and unknown effects exclude their affected scopes from confirmed paths. Delays and informational notices remain visible as advisories rather than being converted into physical closures. Escalator-only alerts do not remove a path that already excludes escalators. Each alternative is evaluated against its own endpoints, all applicable alerts and its complete facility chain.

Fetch freshness is independent of each alert's last edit. `MAX_SNAPSHOT_AGE_MS` is five minutes; a response at or past expiry produces unknown. The result exposes maxAgeMs and validUntil so the UI can visibly expire a displayed result. A retrieval timestamp more than 30 seconds after the check also produces unknown. The engine checks the GTFS feed's coverage date in America/New_York. The adapter supplies completeness; the engine cannot itself prove that a caller actually fetched every page.

Injected alerts with simulation:true or replay-/synthetic- identifiers do not receive official alert URLs. Ordinary source alerts link to their MBTA API record. UI/demo code must additionally label the overall source mode, including a dated archive with no modified alert rows.

## Verification actually completed

`npm test` passed 48 tests after the latest engine change: 26 engine/import tests, 20 independent reviewer tests, and two root-owned integration tests. The meaningful engine cases include the real Assembly dependency chain, the second-elevator failure, directed exit behavior, unrelated alerts, interval boundaries, old-updated current closures, stale/incomplete/future snapshots, map date boundaries, unknown effects, malformed selectors/windows, missing/mismatched facilities, unsupported platforms, node wheelchair exclusions, station/route/direction intersections, alternative entrance alerts, and source labeling. No claim of performance superiority or real rider usability follows from these tests.

Three independent review findings were fixed: malformed selector types could hide a relevant closure; an elevator edge could incorrectly trust a facility mapped to another station or an escalator; and JavaScript's date parser could silently roll an invalid calendar date into a different month. The engine now validates ISO calendar fields before parsing. The review cases are retained in tests/reviewer.test.mjs.

The actual imported Assembly baseline uses 716→717 from Foley St. A separately labeled injected 717 closure produces an alternate from Revolution Dr using 718→719. Adding an injected 719 closure removes that alternate. These are synthetic outage changes over genuine source topology, not claims about current Assembly conditions.

An additional read-only evaluation used the archived 105-record agency response at its recorded retrieval time, 26 September 2026 16:18:14 UTC. At that timestamp: Assembly Foley→Forest Hills had no reported closure and one informational notice; State Washington/Milk→Forest Hills encountered real closure 1031519 and offered other mapped entrances; Malden Summer/Pleasant→Forest Hills encountered closure 1035002 with no checked alternative. This was a dated archive sanity check, not a new live fetch or field verification. The State alternate does not certify any private/building entrance's opening hours.

## Remaining risks and deliberate limits

- The source graph and alert feed can be incomplete, delayed or wrong. The archive was not surveyed against physical stations. A current HTTP fetch does not prove that a reported elevator status matches reality.
- Entrance hours, private-building access, ramps' practical usability, widths, lift dimensions, fare controls, outdoor approaches, vehicle accessibility and operational assistance are not modeled sufficiently for an access guarantee. Even a mapped pathway can require a human decision.
- Service effects are deliberately conservative. A trip-specific cancellation or an unparsed access issue may yield unknown where a more complete transit planner could resolve the trip.
- Some relevant station alerts are shown even when the chosen path avoids their equipment. They provide context; the dependency evidence identifies what the displayed path actually uses.
- GTFS schedule-derived platform route/direction mappings are not a prediction that a train is operating at that moment. Calendar-specific departure selection and journey timing are outside scope.
- The fixture clock is injectable for reproducible tests. Production callers must use the real current time and honestly labeled replay state.
- No real Alexa device, account-linked add-on, customer validation or comparative competitor workflow trial was performed by this engine task. Root-owned integration and UI verification are separate work.
