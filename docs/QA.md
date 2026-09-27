# Verification record

Verified September 26, 2026, including the **v0.2.0** interface refinement. This report describes performed checks, not simulated customer use. Final revised-video publication and media-hash confirmation are tracked separately below.

## Product story

A rider chooses a named station entrance and platform. The browser negotiates MCP 2025-11-25, calls the actual server tool, fetches the complete public MBTA alert response, evaluates a directed station graph, and renders an evidence-linked answer. A saved journey survives restart; every leg uses one snapshot. A separately labeled replay demonstrates an alternative becoming unavailable.

| Boundary | Observed evidence |
| --- | --- |
| Browser loads | The initial agent-browser check and the later manual Chrome review opened the actual local server. The redesigned station/entrance/platform controls, desktop layout and actual result states were inspected. No browser error/warning entries were observed during the design-review flows. |
| Browser → MCP | The page sends initialize, initialized notification and tools/call requests directly to /mcp. The five browser stories exercise this transport. |
| MCP protocol and storage | A real official SDK client negotiated 2025-11-25, discovered all six tools, saved/read/checked a journey, rejected a stale write and read the same state after restarting the server. |
| Source → engine | Actual unauthenticated all-activity alert fetches succeeded. One reviewer fetch at 16:30:58 UTC contained 104 alerts on one page. Alert edit time is not used as fetch freshness. |
| Engine → result | The genuine Assembly topology uses 716/717 from Foley. A synthetic 717 closure yields the Revolution 718/719 alternative; adding 719 withdraws it; expired/incomplete evidence yields unknown. |
| Browser result and persistence | Five Playwright stories pass: double outage/staleness; two-leg save/reload with escaped malicious-looking text; exit direction and evidence download; visible expiry;390 px phone layout without horizontal overflow. |
| Redesigned draft workflow | Actual Chrome actions added Assembly and State, reordered them, changed Assembly to an exit through Revolution Dr, removed State, saved and reloaded. The displayed exit path used 719 then 718. Loading a saved journey as a new draft, cancelling an edit and saving a copy preserved the original exit direction. |
| Layout and evidence clarity | At 1280×720 the primary button is fully visible (bottom 704.6px). At 390px and 320px there was no document overflow. Replay labels repeat within cards and diagrams; source mode and fetch time stay attached to the result. Screenshots and exact review limits are in [DESIGN_REVIEW.md](DESIGN_REVIEW.md). |

`npm test`: **48 passed**, comprising 26 engine/data tests, 20 independent reviewer cases and 2 transport/security integration tests. `npm run test:browser`: **5 passed**, including a rerun after the final functional UI changes. Tests use invented alerts where documented. Successful live reads and actual live browser observations were performed separately from those fixtures.

The first browser run had two test-harness failures: an accessible button name omitted a space, and the simulated clock was installed after the page had already registered its real interval. Correcting the selector and installing the clock before navigation made those same assertions pass. The assertions were not weakened and the application expiry code was not changed to fit them.

The map-refresh path was run against the captured real archive into a separate temporary output. It produced 3 stations, 133 nodes, 454 directed edges and 20 facilities and passed the actual network validator. This verifies import and staging, not a second current network download.

## Recorded demonstration

The **v0.2.0** master is `artifacts/liftcheck-demo-4k.mp4`. The currently recorded [manifest](../artifacts/widescreen-demo-manifest.json) reports **3840×2160**, **30fps delivery**, **78.371 seconds**, 12 captured MCP responses and no browser errors. The final file decoded completely without errors. SHA-256: `78646d6654dc959e5f48e3e265d0f8b0e00606c425511f8af6aaabfa5475a9e7`.

The new sequence opens with synthetic elevator 717 closure → second closure of 719 → expired feed. Its results are alternative → blocked → unknown. It then switches to a real current MBTA fetch, saves and reloads a journey, and shows the real MCP connection and integration limits. The original order, which began with current reports, no longer describes this revised demo.

The source is native 4K browser imagery from actual interactions, with capture timing and held frames. It is not claimed to contain 30 independent browser captures per second or interpolated motion. The manifest identifies the narration provider as **Google Gemini**, model `gemini-3.8-flash-tts`, voice `Sulafat`; all narration is disclosed synthetic speech. It does not impersonate a rider or Alexa. [Timed captions](../artifacts/liftcheck-demo-4k.srt) are included.

The revised [YouTube video](https://www.youtube.com/watch?v=jHp5xAW9RQM) was published and its anonymous oEmbed response matched the uploaded title. The watch-page menu offered 2160p 4K; the uploaded English caption track rendered. The original source frames remain preserved. Two approximately 0.1-second capture/reload flashes are replaced with the preceding genuine frame, preserving duration; 9–17.9 seconds uses a 1.33× editorial crop that retains source and uncertainty labels. See [media provenance](MEDIA.md). This is video publication, not a Devpost submission.

For historical separation: the earlier v0.1.0 recording was 97.92 seconds and was published on YouTube on September 26, 2026. Its full-decode check and SHA-256 `a046e706ef8de2184ad55f022359914438dd1fde266fb9e9b11d59384d1d4ef8` apply only to `artifacts/liftcheck-demo.mp4`, not to the revised 4K file.

## Interface review

The [design review](DESIGN_REVIEW.md) records the primary MBTA/W3C sources, screenshots and the complete manual flow. The browser exposes labeled native fields, concise status announcements and recoverable error messages. Draft controls support editing, removal and reordering; the interface explicitly says a copied saved journey becomes a new entry.

The review checked written status in addition to color, keyboard focus, visible control names and mobile target dimensions. A bounded computed-style contrast check of the initial and alternate-result views returned no failures at its 4.5:1 normal-text and 3:1 large-text thresholds. No screen-reader user session, complete WCAG conformance assessment or cross-browser study was performed. Clearing a draft initially left an obsolete duplicate-path error on screen; that defect was fixed and rechecked.

Expired or incomplete live evidence now withdraws the usable path view and former positive summary, changes the visible status to **Evidence expired or unavailable**, and retains the original dated evidence for inspection. Synthetic stale-feed replay remains visibly synthetic and produces unknown without a path.

## Entry status

Required personal answers have been received privately. Registration rules and eligibility consent remain pending acceptance. No Devpost draft or submission has been created. A working local MCP endpoint and prepared media do not establish completed registration, remote Alexa account linking or submission.

## Findings fixed

The independent review preserves its initial failures in REVIEW.md. Fixes cover narrowed/skipped/malformed pagination, input-reference mutation of persisted state, invalid entity selectors, elevator facilities of the wrong type or station, and impossible calendar dates. The UI also stopped displaying an alternative twice under the requested entrance's heading.

## Not established

No physical station survey, wheelchair-user study, screen-reader session with a user, Alexa device integration, remote account linking, production hosting, end-to-end transit journey, or competitor task benchmark was performed. Keyboard-friendly native form controls, escaping and phone layout checks are not a complete accessibility audit. Passing tests do not predict prize placement.

The current graph has a finite service-date window, and the source feed can lag or omit a real barrier. Every result preserves these limits. The local server is deliberately single-user and rejects foreign hosts/origins; public deployment needs authentication and operational work.
