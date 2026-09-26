# Independent LiftCheck review

Reviewer: adversarial_design agent. Started 2026-09-26. This report separates observed defects from planned checks. The reviewer owns only `tests/reviewer.test.mjs` and this report; implementation fixes belong to the other agents.

**Final bounded review outcome:** all **20 reviewer tests passed** after the fixes described below. No observed defect from this review remains open in the tested implementation. This supports continuing local prototype review; it is not approval of real-world access reliability or a contest-ready Alexa submission.

## Initial adapter/store review

Command actually run: `node --test tests/reviewer.test.mjs` from `liftcheck/`.

Initial result: **5 passed, 3 failed**. The fixtures are invented protocol cases, not MBTA outage evidence. Engine, service, server and browser behavior were not yet present for this initial run.

### Observed findings

1. **P1 — Pagination can silently narrow coverage while certifying completeness.** `allowedLink` verifies origin, path and that the first `filter[activity]` value is `ALL`, but permits additional filters. A second-page link containing `filter[stop]=place-other` is followed and its final result is marked `complete: true`. An alert source marked complete may then support an unjustified absence-of-reported-closure result. Restrict pagination to the original immutable query scope plus explicitly supported, validated paging fields. Reject duplicate/conflicting query keys. Regression: `pagination cannot silently narrow alert coverage to one stop`.

2. **P1 — Missing pagination metadata becomes a complete empty source.** `{data: [], links: {}}` passes the current validator and returns a complete snapshot. Absence of a `next` property is being treated like an explicit end-of-pagination marker. Require the expected MBTA pagination shape, or another documented complete-response signal; malformed metadata must produce unknown. Regression: `a malformed links object cannot certify the end of pagination`.

3. **P2 — Saved input aliases bypass revision control.** `JourneyStore.save` retains the supplied `legs` array and nested objects in memory. Mutating them after a successful save changes `read()` without increasing the revision or changing disk data. Clone accepted inputs when committing them. Regression: `caller mutation cannot change a saved journey without a revision`.

### Positive behavior actually exercised

- Two pages are accumulated; an old `updated_at` field does not incorrectly expire a newly fetched alert.
- A cross-origin next link is rejected before being followed.
- Duplicate alert IDs across pages reject the snapshot.
- A cache at the exact 60-second refresh threshold is refreshed; if that fetch fails, the retained data is explicitly incomplete.
- Failure on a later page does not expose the partial new page as a complete snapshot.

### Remaining review scope

Review directed station paths, simultaneous failures in all alternate dependencies, future departure/active-period boundaries, platform/direction mismatches, unknown or malformed relevant alert scope, incomplete source propagation, untrusted source text, browser escaping, and saved-journey revision conflicts after integration. Check actual live pagination separately from invented cases. Passing these tests will establish bounded implementation behavior, not station usability, user demand, competition advantage or a successful Alexa integration.

## Integration review and follow-up counterexamples

The original three findings were fixed by root and independently retested successfully. The store fixture was updated to use the service's real `fromId`/`toId` field names; the original aliasing finding did not depend on those names.

Further observed cases:

4. **P1 — Malformed end markers and a gap in page offsets could certify completeness.** A boolean `last:false` was accepted as an end marker. A next link jumped from offset 0 to 2000 with page limit 1000 and still produced a complete snapshot. Root changed marker/query validation and requires contiguous offsets. Both reviewer regressions passed afterward.
5. **P1 — Malformed relevant entity selectors were mistaken for unrelated alerts.** A station closure with `direction_id:"0"` was ignored when compared against integer direction 0, returning `no_reported_closure`. The engine agent added selector validation. The reviewer now exercises malformed direction, route type, route identifier and activity values; all pass.
6. **P1 — A known facility ID was treated as sufficient map evidence despite inconsistent station/type.** An elevator edge linked to another station's facility produced `no_reported_closure`. The engine agent now requires matching station and, for elevator edges, an elevator facility type. The reviewer also checks a link to an escalator; both are unresolved rather than usable.
7. **P2 — Alternative path placement blurred the requested/alternate distinction.** The API originally placed the alternate in both `path` and `alternatives`, causing the UI to show it first under “Mapped path inspected” and again under “Alternative entrance.” The engine now leaves `path:null` when the requested path is unavailable; a usable proposal appears only in `alternatives`. The regression checks that the selected path was not silently replaced.
8. **P1 — Impossible calendar dates roll forward and suppress applicable uncertainty.** `2026-09-31T16:00:00Z` was accepted by JavaScript date parsing as October 1, causing a malformed relevant alert to be treated as inactive on September 26. The original probe returned `no_reported_closure` instead of `unknown`. The engine agent added strict calendar/time-field validation, and the independent regression now passes. This is a fabricated malformed-input test, not a claim about MBTA's current feed.

### Checks actually exercised during integration

- An ingress-only edge does not create an exit route. A route to one platform does not establish a path to the opposite platform.
- A primary lift closure yields the other entrance with both alternate dependencies. Closing its second lift withdraws the alternative.
- A scheduled closure applies at its start and stops applying exactly at its end. Beyond the snapshot age limit the result is unknown.
- Incomplete, stale, missing-time, future-dated and out-of-graph-date snapshots cannot clear the path.
- A schema-valid opposite-direction service alert is correctly irrelevant; unknown effects and malformed relevant windows, including impossible calendar dates, remain unresolved.
- Missing elevator facilities, escalators, stairs and unknown pathway modes cannot establish a usable selected path.
- Saving validates endpoint coverage, rejects stale revisions and commits the original legs. Checking a saved journey uses one source snapshot for all its legs and does not modify the saved choices.
- The actual local HTTP server rejects foreign Origin and Host values, rejects invalid JSON, and returns untrusted labels as JSON with `nosniff` and a restrictive Content Security Policy.

The HTTP Host probe initially used `fetch`, whose normalized authority did not transmit the desired foreign Host header. That was a reviewer test-method error, not a server defect. The corrected regression uses Node's raw HTTP request and verifies a 403 response. It now passes.

### Live read

Independently called the real `fetchCompleteAlerts` adapter on September 26 at **16:30:58.117 UTC**. It returned 104 alerts on one page with `complete:true` and SHA-256 `6a9db2845bb76e069b4a5184bd3135c2e1f82d4b4ce3daad3dd8025e52cdd9f1`. The endpoint was `https://api-v3.mbta.com/alerts?filter%5Bactivity%5D=ALL&page%5Blimit%5D=1000`. This establishes that the adapter worked on that actual response; it is not proof that MBTA reported every physical barrier. Pagination variants were tested separately with synthetic responses.

### Source-text and interface review

Inspected `public/app.js`, `service.mjs`, `mcp.mjs` and `server.mjs`. Dynamic text, labels, source headers and evidence JSON pass through the HTML escaping function; errors and the connection address use `textContent`. Generated links restrict their protocols and escape the attribute value. The HTTP test preserves a literal script/image-looking saved label as JSON data. This reviewer performed source review and HTTP tests, not an independent browser execution test; root owns the browser story tests. Source text and labels are explicitly untrusted in the MCP descriptions. That wording is a defense, not a proof that every assistant will resist prompt injection.

### Remaining boundaries

No field visit, rider usability study, real Alexa device test or independent browser run is claimed by this reviewer. The product checks published station paths; entrance hours, sidewalks, fare-gate width, slopes, assistance and complete trip operability remain outside the result. A successful local MCP server alone does not establish Amazon contest readiness.

### Final verification record

The reviewer reran `node --test tests/reviewer.test.mjs` after the last implementation correction: **20 pass, 0 fail, 0 skipped**. The cases exercise multiple adversarial variants; this count is not a claim of exhaustive coverage. No new implementation behavior was changed by this reviewer.

SHA-256 captured immediately after that run:

| File | SHA-256 |
|---|---|
| `src/alerts.mjs` | `e19e6e9f39ecde8335d80e4794bf9b5dba26e8dbda58cdf9fba08bf65265c918` |
| `src/engine.mjs` | `67bdd8862ff03296adba153f89addc373175a2f7447efa6273d7d6c7e11d62c4` |
| `src/service.mjs` | `e21375ae9f7cd8629104db8460eed64cfbe56dd438e37adc5091772930f31b3b` |
| `tests/reviewer.test.mjs` | `b21590be0d5ad7d06171bc914db17c26e300010d13b3066d25b3d743f4f58af6` |

Later edits require an appropriate rerun before applying this result to the changed behavior.
