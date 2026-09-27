# LiftCheck interface review — September 26, 2026

The frontend now centers the station path and its evidence. This is a working local interface refinement, not a field-validated accessibility product or a claim of competition success. Backend, network data, routing rules, MCP tools and their contracts are unchanged.

## Design decisions and research

| Primary source | What it informed here |
| --- | --- |
| [MBTA Subway Access Guide](https://www.mbta.com/accessibility/subway-guide) | Elevator information is one part of access; gates, boarding and assistance matter separately. The interface therefore names the exact entrance and platform, shows elevator dependencies, links to official assistance, and keeps its station-path scope explicit. It never labels a path “accessible” or “safe.” |
| [W3C: status messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages) | A short, atomic status region announces completed checks and draft changes. The entire result, including its evidence JSON, is no longer a live region. Errors have an alert role and a visible recovery message. |
| [W3C: reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | At narrow widths, the elevator sequence becomes vertical and content wraps in one column. Actual checks were made at 390 and 320 CSS pixels. This is bounded reflow evidence, not a 400% browser-zoom or complete WCAG assessment. |
| [W3C: minimum target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Primary controls have 44–50px minimum heights, with a 48–49px select/input target. Compact draft controls remain above the 24px minimum. Native fields retain labels and keyboard interaction. |
| [IBM Plex Sans in Google Fonts’ official repository](https://github.com/google/fonts/tree/main/ofl/ibmplexsans) | The variable font is self-hosted, with its [OFL license](../public/fonts/OFL.txt) included. There is no third-party font request during use or recording. |

The visual design uses a dark transit-style masthead, a warm white canvas, compact numbered sections, a custom direction mark and IBM Plex typography. Color supplements written status labels. Source timing appears beside the report and inside every result card. Replay mode is repeated on the dependency diagram so a cropped path does not look like a live check. All displayed times name the Eastern time zone.

The main check button is fully visible in the initial 1280×720 viewport: measured top 656.6px, bottom 704.6px. A completed check scrolls to its report. The alternative path carries a specific outdoor-approach limitation next to the proposed entrance. Detailed sources, limitations and original evidence remain available in an expandable section.

## Working behavior added

- Draft station checks can be edited, removed and moved up/down. An unfinished edit disables Save journey until updated or cancelled. Duplicate paths and the four-check limit have recoverable messages.
- A saved journey can be loaded with **Use as draft**. Its copy is named and described as a new journey; the existing append-only backend is not presented as supporting overwrite or deletion.
- A report checked from the form shows a “selection has changed” note after an endpoint or direction change. Named saved-journey reports use that journey’s name as the heading.
- Live evidence expiry, missing timing or incompleteness withdraws the path diagram and former positive summary. The visible status changes to **Evidence expired or unavailable**. Original evidence remains inspectable and downloadable; it is not rewritten to look current.
- Fresh source text is **Live MBTA REPORTS**; invented scenarios remain **SYNTHETIC OUTAGE REPLAY**. The working MCP and untested Alexa-device boundary is preserved in the connection disclosure.

## Verification actually performed

**Automated project checks:** `npm test` passed all 48 Node tests. `npm run test:browser` passed all five existing browser stories after the final functional changes. These cover alternative withdrawal after a second outage, stale replay, saved journey persistence and label escaping, directed exit endpoints and evidence download, on-screen live expiry, and the 390px layout. No backend tests were altered to accommodate the design.

**Manual browser review:** Chrome against the running app on loopback port 4322, using a separate temporary journey directory. These were genuine UI actions, not injected application-state changes:

1. Added Assembly and State, moved State first, edited Assembly to exit through Revolution Dr, removed State, saved, reloaded, and checked the saved journey. The displayed path ran from the Forest Hills platform through elevators 719 then 718 to Revolution Dr.
2. Loaded that saved journey as a draft, changed the form to boarding, cancelled that edit, and saved the copy. Both saved entries remained; the copy still checked the original exit direction, confirming cancellation did not mutate the draft.
3. The saved exit check fetched actual MBTA alerts, showed its fetch time and the relevant service advisory, and displayed the directed path. This verifies the live UI request path; it does not independently verify physical station conditions.
4. Ran the 717-closure replay: only the Revolution Dr alternative with elevators 718 and 719 appeared. Ran the second 719 closure: no path diagram remained. Ran the stale-feed replay: the result was unknown and no diagram remained. All carried visible invented-data labels.
5. At 390px, checked the alternate, blocked and unknown states. At 320px, tested a duplicate-path error, focus on its message, controls, clearing and recovery. Document width equalled viewport width at both sizes.
6. Checked native label exposure and rendered controls: no unnamed visible button/input/select; no visible button target below 24px in the inspected mobile state. Tab moved from station to entrance to platform with a visible 3px focus outline. This does not replace assistive-technology user testing.
7. Inspected the browser’s error/warning log after the live and draft flows: no entries. A computed-style text-contrast check of the initial page and alternate-result state returned no failures at 4.5:1 for normal text or 3:1 for large text. See [the bounded contrast audit](design/contrast-audit.json) for its method and limits.

A minor issue found during this review—an old duplicate-path error remaining after the draft was cleared—was fixed and rechecked. Decorative icon and logo-period colors were darkened during the contrast pass. An automation attempt initially used the wrong option ID for Revolution Dr; it was corrected to the observed option label. That was a test-control mistake, not a product defect.

## Screenshots

- [Desktop initial state, 1280×720](design/desktop-initial-1280.png)
- [Desktop alternative and explicit replay provenance](design/desktop-alternative-1280.png)
- [Actual live exit-path fetch during review](design/desktop-live.png)
- [Mobile alternative, 390px](design/mobile-alternative-390.png)
- [Mobile blocked state, 390px](design/mobile-blocked-390.png)
- [Mobile unknown state, 390px](design/mobile-unknown-390.png)
- [Narrow controls, 320px](design/narrow-controls-320.png)
- [Full mobile screenshot from the existing browser suite](design/browser-suite-mobile.png)

Screenshots are genuine browser output. “Design QA” journey names are temporary review fixtures, not a real rider’s travel data. The live screenshot is a dated observation, not a standing report about current conditions.

## Recording compatibility and boundaries

Existing labels retained: **Check current reports**, **+ Add this check to a saved journey**, **Journey name**, **Save journey**, the saved journey name plus station-check count, and all four numbered replay buttons. Existing selectors retained: `.check-card`, `.path-box.alternative`, `.status-badge.blocked`, `.status-badge.unknown`, `.connection summary`, `#source-pill`, `#export` and `#results`.

Source mode and fetch time repeat inside `.card-provenance`; the replay dependency box is separately marked **SYNTHETIC REPLAY**. The heading `#report-title` follows the selected saved journey or demonstration. Draft controls have explicit accessible names such as “Edit check 2: Assembly” and “Move check 2 up.”

No claim is made of screen-reader usability, WCAG conformance, field navigation success, accessibility clearance, validated superiority to MBTA’s tools, or Alexa voice/device testing. Browser review covered Chromium, not Safari or Firefox. The contrast check does not assess every possible dynamic state, forced colors, browser zoom or assistive-technology combination. Those remain practical next checks before broader use.

## September 27 custom composition

The current design is a navy/blue transit worksheet: horizontal station/entrance/platform selection, full-width dated path report, then saved journeys and connection details. It replaces the large hero/sidebar composition. Its mobile report stacks the route vertically, retains written source mode and wraps enlarged replay labels. The backend and MCP contracts remain unchanged.

The independent review exercised live source retrieval, both saved legs after reload, duplicate-save recovery, all three replay outcomes, desktop/390px layouts and doubled text. A missing deployed stylesheet and an enlarged-phone replay-label overflow were observed and fixed. Four bounded axe scans across the two portfolio apps reported no violations, with some contrast checks still incomplete; this is not an accessibility certification. See [current evidence in QA](QA.md#september-27-portfolio-recheck).
