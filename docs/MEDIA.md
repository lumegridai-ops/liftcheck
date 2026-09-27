# Final presentation provenance

The v0.2.0 release contains `liftcheck-demo-4k.mp4`, its English SRT captions, and `presentation-source.zip` containing the original narration clips and native captured frames. Source frames and API traces show actual application operations. Fictional records and outage replays are visibly labeled.

- Final file: 78.371000 seconds, 3840×2160 H.264, 30fps delivery, AAC narration, English mov_text track.
- SHA-256: `78646d6654dc959e5f48e3e265d0f8b0e00606c425511f8af6aaabfa5475a9e7`.
- Two hash-locked capture flashes replaced by preceding real frame, preserving time; 9–17.9s uses a disclosed 1.33x crop; title cards refreshed; English selectable captions embedded.
- Native PNG screenshots are timestamped and repeated unchanged frames are held. This is not 30 unique captures per second. The focus crop resamples a 2880×1620 portion of a genuine source frame; no app results or text are fabricated.
- Gemini model `gemini-3.8-flash-tts`, voice Sulafat. All eight clips are disclosed synthetic narration. Credentials are not in this repository or the source-media archive.
- Independent audio-input transcription matched the scripts; full decode, duration and measured peak checks passed. No human listening test or audience-comprehension study was performed.
- English captions are sentence-timed from measured narration segments and visually reviewed. Embedded MP4 captions depend on player support; use the SRT sidecar where necessary.

`scripts/record-widescreen-demo.mjs` records a fresh real workflow. The finalization script documents hash-locked edits for this specific archived capture and refuses different originals. It is an editorial reproducibility record, not a generic promise that fresh live data will produce identical pixels. The raw frames and first-cut manifest remain preserved.

The public YouTube upload includes the English SRT and offers 2160p playback. Alexa device use and rider testing remain unverified.

## September 27 wayfinding refresh

The current-interface recording is `artifacts/liftcheck-wayfinding-demo-4k.mp4`, separate from the previous v0.2.0 master. It is 78.374 seconds, native 3840×2160 PNG capture delivered at 30 fps, with the same eight hash-verified Google Gemini / Sulafat narration clips. The source contains 36 distinct frames held for their measured elapsed times, not 30 unique captures per second. No generated app-result overlay was used.

The actual local session recorded synthetic 717 closure → second 719 closure → expired evidence, then a complete live MBTA fetch, saved/reloaded journey and real MCP connection. Twelve MCP responses include ten tool calls. All demonstrated critical labels remained in frame. Full decode (2,351 frames), ten-position browser playback, ten encoded-frame reviews and captions checks passed. Audio measured −16.00 LUFS and −1.42 dBTP. [QA](../artifacts/wayfinding-video/QA.json) · [manifest](../artifacts/wayfinding-video/manifest.json) · [captions](../artifacts/liftcheck-wayfinding-demo-4k.srt).

MP4 SHA-256: `3e32b3d65b7db1b6cdb390cf5fc924310c52e3bd350d25d30bccc678b3508f13`. Its YouTube replacement is pending publication; the existing verified public video remains linked to the Devpost entry until that succeeds. No new human audio panel, rider/device test or audience validation is claimed.
