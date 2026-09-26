# Verification record

Verified September 26, 2026. This report describes performed checks, not simulated customer use.

## Product story

A rider chooses a named station entrance and platform. The browser negotiates MCP 2025-11-25, calls the actual server tool, fetches the complete public MBTA alert response, evaluates a directed station graph, and renders an evidence-linked answer. A saved journey survives restart; every leg uses one snapshot. A separately labeled replay demonstrates an alternative becoming unavailable.

| Boundary | Observed evidence |
| --- | --- |
| Browser loads | agent-browser 0.38.1 opened the actual local server, found the station/entrance/platform controls, and reported no page errors. Desktop screenshot inspected. |
| Browser → MCP | The page sends initialize, initialized notification and tools/call requests directly to /mcp. The five browser stories exercise this transport. |
| MCP protocol and storage | A real official SDK client negotiated 2025-11-25, discovered all six tools, saved/read/checked a journey, rejected a stale write and read the same state after restarting the server. |
| Source → engine | Actual unauthenticated all-activity alert fetches succeeded. One reviewer fetch at 16:30:58 UTC contained 104 alerts on one page. Alert edit time is not used as fetch freshness. |
| Engine → result | The genuine Assembly topology uses 716/717 from Foley. A synthetic 717 closure yields the Revolution 718/719 alternative; adding 719 withdraws it; expired/incomplete evidence yields unknown. |
| Browser result and persistence | Five Playwright stories pass: double outage/staleness; two-leg save/reload with escaped malicious-looking text; exit direction and evidence download; visible expiry;390 px phone layout without horizontal overflow. |

`npm test`: **48 passed**, comprising 26 engine/data tests,20 independent reviewer cases and2 transport/security integration tests. `npm run test:browser`: **5 passed**. Tests use invented alerts where documented. A successful live read and the live browser observation were performed separately from those fixtures.

The first browser run had two test-harness failures: an accessible button name omitted a space, and the simulated clock was installed after the page had already registered its real interval. Correcting the selector and installing the clock before navigation made those same assertions pass. The assertions were not weakened and the application expiry code was not changed to fit them.

The map-refresh path was run against the captured real archive into a separate temporary output. It produced 3 stations, 133 nodes, 454 directed edges and 20 facilities and passed the actual network validator. This verifies import and staging, not a second current network download.

## Recorded demonstration

`artifacts/liftcheck-demo.mp4` is a **97.92-second** actual automated browser recording with synthetic narration. The recording completed without browser errors. Its captured MCP trace contains 12 responses, including protocol negotiation, current-source path and saved-journey checks, and the three synthetic failure scenarios. The observed replay sequence is alternate_entrance → blocked → unknown. The entire encoded file was decoded successfully with ffmpeg, and an extracted replay frame was inspected visually. SHA-256: `a046e706ef8de2184ad55f022359914438dd1fde266fb9e9b11d59384d1d4ef8`.

The trace and media manifest preserve actual sources, source modes, requests and outputs. Synthetic narration does not impersonate a rider or Alexa. This local/GitHub-download artifact still needs public YouTube/Vimeo hosting for the official Amazon entry.

## Findings fixed

The independent review preserves its initial failures in REVIEW.md. Fixes cover narrowed/skipped/malformed pagination, input-reference mutation of persisted state, invalid entity selectors, elevator facilities of the wrong type or station, and impossible calendar dates. The UI also stopped displaying an alternative twice under the requested entrance's heading.

## Not established

No physical station survey, wheelchair-user study, screen-reader session with a user, Alexa device integration, remote account linking, production hosting, end-to-end transit journey, or competitor task benchmark was performed. Keyboard-friendly native form controls, escaping and phone layout checks are not a complete accessibility audit. Passing tests do not predict prize placement.

The current graph has a finite service-date window, and the source feed can lag or omit a real barrier. Every result preserves these limits. The local server is deliberately single-user and rejects foreign hosts/origins; public deployment needs authentication and operational work.
