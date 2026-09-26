# Prepared Amazon entry — LiftCheck

Status: source and working prototype prepared. No new Devpost draft or submission has been created. Public YouTube/Vimeo hosting, registration declarations and actual submission remain outstanding. User authorization to submit has been given; required unknown personal facts have not been invented.

**Name:** LiftCheck

**Tagline:** Check your station entrance and every elevator on its alternative, with current reports and inspectable evidence.

**Primary track:** Alexa+ — working self-hosted MCP server.

**Built with:** JavaScript, Node.js, Model Context Protocol, Express, Zod, Python, GTFS, MBTA API, Playwright.

## The problem

An elevator outage can break a particular entrance-to-platform path without closing a whole station. Advice to use another entrance is only useful when that alternative's elevators have also been checked. Existing accessible trip planners and outage subscriptions already help riders; LiftCheck focuses on the exact station dependencies of a saved routine and on explaining what changed.

## What we built

LiftCheck checks selected station entrances and subway platforms at Assembly, State and Malden Center in Boston. A user chooses the actual entrance, platform and boarding/exit direction, then saves up to four station checks as a journey. One complete MBTA snapshot is used for all the saved legs.

The application joins directed GTFS pathways to facility IDs and current alerts. It excludes stairs and escalators, preserves direction, applies alert time windows, and separately evaluates each alternative. A result distinguishes no reported closure, a different mapped entrance, a reported blockage and unknown evidence. It never turns a missing report into a claim that an elevator works.

The browser is a real MCP client. It negotiates MCP 2025-11-25 over Streamable HTTP and calls the same six registered tools that a compatible AI assistant can use. The server handles route computation and evidence; a connecting assistant can handle the conversation. No internal model, imitation chat parser or Alexa device connection is claimed.

## The demonstration

First, the application fetches current public reports and shows a chosen path, its elevator IDs and its relevant advisories. Then an explicitly labeled replay closes Assembly elevator 717. LiftCheck changes the candidate entrance to Revolution Drive and checks elevators 718 and 719. Closing 719 too withdraws that alternative. An expired feed produces unknown with no path. The replay uses a real source map and invented outages; it is not presented as current transit information.

## Why this use of MCP matters

A language model should not guess whether a workaround's second elevator is available. Typed tools preserve the user's exact station/platform context, evaluate the dependency graph, and return source URLs, active periods, topology hashes and retrieval time. The response supplies enough evidence to explain a failure and enough uncertainty to avoid pretending the task is resolved.

The working visual client makes these results inspectable without requiring an Alexa device during judging. The entry follows the self-hosted MCP path, not a claim of an account-linked Alexa add-on or a voice simulation.

## What was tested

The prototype passes 48 engine/adapter/reviewer/transport checks and 5 browser stories. A separate agent wrote 20 adversarial cases and found defects that were fixed and retested. Actual public-data fetches succeeded; the web application and an official SDK client exercised the actual server. Source provenance and a reproducible importer are included.

## Limits and next work

This is a three-station local prototype. Outdoor paths, entrance hours, slopes, gate widths, train operation and boarding assistance are not verified. “No reported closure” is not an accessibility guarantee. Real riders and real Alexa devices have not tested it. Before expanding, the next work is supervised rider workflow research, account-linked remote deployment and comparison against the official MBTA/Transit workflow for the same saved station task.

All work was produced with AI assistance, including coding, independent agent review and synthetic video narration. No customer endorsements, physical station checks or performance advantage over competing apps are claimed.

## Actual developer feedback

The current event rules were used to choose the self-hosted MCP path and protocol version. Reconciling the event's acceptable local demonstration with the general Alexa add-on documentation's remote/authenticated deployment path required several separate documentation reads. A single track checklist that distinguishes a conforming local MCP demo, a permitted agentic simulation and an actual account-linked Alexa add-on would make this clearer.

We built a real SDK transport test to verify negotiation of the specified protocol. A sponsor-provided conformance fixture for this exact entry path would help entrants show runtime integration consistently. No device onboarding or service authentication attempt was completed, so no device/API failure is asserted here.

## Submission checklist

- Working repository with open-source code license, provider-data license, setup/run instructions and verification evidence: prepared.
- Actual runtime hook to required track technology: implemented and tested through the MCP SDK and visible client.
- Less-than-three-minute demonstration of the working product: local recording prepared by scripts/record-demo.mjs; inspect its manifest for the actual final duration.
- Public YouTube or Vimeo URL: not yet supplied. A local file or GitHub download does not satisfy this requirement.
- Required personal registration/submission declarations: unresolved facts remain unfilled.
- Official submission confirmation: none. Do not describe this entry as submitted.
