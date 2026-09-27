# Prepared Amazon entry — LiftCheck

Status: **Submitted** to the Amazon Alexa+ track. Devpost confirmed submission **1200369**, project **1446292**, at **2026-09-27 04:22:06 UTC**. A separate live project read confirmed its published state and hackathon submission timestamp. [Official entry](https://devpost.com/software/liftcheck). The user reaffirmed the previously presented registration confirmations; registration and required declarations were completed with the confirmed answers.

Repository: https://github.com/lumegridai-ops/liftcheck

Demonstration: **78.374 seconds**, native **3840×2160** browser captures delivered at 30fps, with disclosed Google Gemini synthetic narration. The current master is `artifacts/liftcheck-wayfinding-demo-4k.mp4`; [timed captions](../artifacts/liftcheck-wayfinding-demo-4k.srt) and the [recording manifest](../artifacts/wayfinding-video/manifest.json) accompany it. [Current public 4K demonstration](https://www.youtube.com/watch?v=Q-eO-lOigUU) · [v0.3.0 release](https://github.com/lumegridai-ops/liftcheck/releases/tag/v0.3.0). Its anonymous playback, English captions and 2160p stream were verified. Devpost readback at 06:28 UTC confirms this video on the still-submitted entry.

**Name:** LiftCheck

**Tagline:** Check your station entrance and every elevator on its alternative, with current reports and inspectable evidence.

**Primary track:** Alexa+ — working self-hosted MCP server.

**Built with:** JavaScript, Node.js, Model Context Protocol, Express, Zod, Python, GTFS, MBTA API, Playwright.

## The problem

An elevator outage can break a particular entrance-to-platform path without closing a whole station. Advice to use another entrance is only useful when that alternative's elevators have also been checked. Existing accessible trip planners and outage subscriptions already help riders; LiftCheck focuses on the exact station dependencies of a saved routine and on explaining what changed.

## What we built

LiftCheck checks selected station entrances and subway platforms at Assembly, State and Malden Center in Boston. A user chooses the actual entrance, platform and boarding/exit direction, then saves up to four station checks as a journey. Draft checks can be edited, removed and reordered. A saved journey can be reused as a new draft without changing the original. One complete MBTA snapshot is used for all the saved legs.

The application joins directed GTFS pathways to facility IDs and current alerts. It excludes stairs and escalators, preserves direction, applies alert time windows, and separately evaluates each alternative. A result distinguishes no reported closure, a different mapped entrance, a reported blockage and unknown evidence. It never turns a missing report into a claim that an elevator works.

The browser is a real MCP client. It negotiates MCP 2025-11-25 over Streamable HTTP and calls the same six registered tools that a compatible AI assistant can use. The server handles route computation and evidence; a connecting assistant can handle the conversation. No model decides station-path status, and no imitation chat parser or Alexa device connection is claimed.

The interface shows a readable sequence of the path’s elevator dependencies, with written status, source mode and retrieval time. On a phone, the sequence becomes vertical. A changed form selection is distinguished from its previous report. Expired live evidence withdraws the path view rather than leaving a reassuring diagram on screen. The [design review](DESIGN_REVIEW.md) documents the primary-source guidance, actual browser checks and remaining limits.

## The demonstration

The revised demonstration opens with an explicitly labeled replay: Assembly elevator 717 closes, and LiftCheck proposes Revolution Drive after checking its elevator dependencies 718 and 719. Closing 719 too withdraws that alternative. An expired feed produces unknown with no path. The replay uses a real source map and invented outages; it is not presented as current transit information.

The demo then switches to an actual current MBTA fetch, shows source times and facilities, saves the chosen path as a journey, reloads it, and exposes the working MCP connection. Its final section states the three-station scope and the absence of rider or Alexa-device testing. The narration is synthetic speech generated with Google Gemini, not a rider testimonial or an Alexa recording. The video uses native 4K browser source frames with measured timing and held frames; 30fps describes delivery, not a claim of 30 independent source captures per second.

## Why this use of MCP matters

A language model should not guess whether a workaround's second elevator is available. Typed tools preserve the user's exact station/platform context, evaluate the dependency graph, and return source URLs, active periods, topology hashes and retrieval time. The response supplies enough evidence to explain a failure and enough uncertainty to avoid pretending the task is resolved.

The working visual client makes these results inspectable without requiring an Alexa device during judging. The entry follows the self-hosted MCP path, not a claim of an account-linked Alexa add-on or a voice simulation.

## What was tested

The prototype passes 48 engine/adapter/reviewer/transport checks and 5 browser stories after the interface redesign. A separate agent wrote 20 adversarial cases and found defects that were fixed and retested. Actual public-data fetches succeeded; the web application and an official SDK client exercised the actual server. Manual browser review also exercised draft editing, ordering, removal, cancellation, copying and persistence, plus 390px/320px layouts, visible keyboard focus and bounded contrast checks. Source provenance and a reproducible importer are included. These checks are not a full accessibility audit or rider validation.

## Limits and next work

This is a three-station prototype with a [public OpenAI Sites demo](https://liftcheck.dgkv.chatgpt.site). The same engine and real MCP tools run remotely; browser-scoped saved journeys are persisted separately. Outdoor paths, entrance hours, slopes, gate widths, train operation and boarding assistance are not verified. “No reported closure” is not an accessibility guarantee. Real riders and real Alexa devices have not tested it. Before expanding, the next work is supervised rider workflow research, remote Alexa account linking and comparison against the official MBTA/Transit workflow for the same saved station task.

All work was produced with AI assistance, including coding, independent agent review, interface design and Google Gemini synthetic video narration. No customer endorsements, physical station checks or performance advantage over competing apps are claimed.

## Actual developer feedback

The current event rules were used to choose the self-hosted MCP path and protocol version. Reconciling the event's acceptable local demonstration with the general Alexa add-on documentation's remote/authenticated deployment path required several separate documentation reads. A single track checklist that distinguishes a conforming local MCP demo, a permitted agentic simulation and an actual account-linked Alexa add-on would make this clearer.

We built a real SDK transport test to verify negotiation of the specified protocol. A sponsor-provided conformance fixture for this exact entry path would help entrants show runtime integration consistently. No device onboarding or service authentication attempt was completed, so no device/API failure is asserted here.

## Submission checklist

- Working repository with open-source code license, provider-data license, setup/run instructions and verification evidence: prepared.
- Actual runtime hook to required track technology: implemented and tested through the MCP SDK and visible client.
- Less-than-three-minute demonstration of the working product: current native 4K source captures and 78.374-second master published; [captions](../artifacts/liftcheck-wayfinding-demo-4k.srt) included. The final file passed full decode; its hash is recorded in the manifest.
- Public YouTube URL for the current demonstration: https://www.youtube.com/watch?v=Q-eO-lOigUU; anonymous playback, 2160p and English captions verified.
- v0.3.0 release includes the current master video, captions and original source-media archive. Earlier releases remain historical evidence.
- Employee declaration: confirmed by the user. Amazon developer account: none.
- Registration rules and eligibility consent: reaffirmed by the user and accepted during registration.
- Official submission: **Submitted**, ID 1200369; published project and timestamp independently read back. Three actual screenshots and the 4K video are attached.
