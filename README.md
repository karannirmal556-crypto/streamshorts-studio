# StreamShorts Browser Studio — MVP 0.1

A browser-first prototype for creating vertical gaming clips from a local video file. Video analysis and rendering happen in the user's browser; the app does not upload video files to a backend.

## What works in this build
- Responsive dark creator dashboard.
- Local video upload and preview.
- Audio-energy scan to find candidate timestamps.
- Configurable 20 / 25 / 30 second clip length and clip count.
- FFmpeg WebAssembly vertical 9:16 render (blurred background + centered full frame).
- Optional editable caption card burned into every exported clip.
- Download rendered MP4 files.
- No account, database, paid API or video server.

## Important: what this MVP does NOT do yet
- It does not understand game semantics, humour, rage, clutch events or facial emotions. The moment finder ranks audio-energy spikes only. A high score is a candidate, not an AI guarantee.
- It does not generate word-by-word automatic speech captions. The caption field is a manually entered overlay card.
- It does not import normal YouTube/Twitch watch URLs directly. Browser CORS, authentication, DRM and platform terms prevent reliable direct extraction. Upload a recording you are authorized to use.
- It does not capture or process a continuous live stream.
- It does not detect/reposition a separate facecam. It preserves the full source frame and adds a blurred vertical fill.
- Browser memory and CPU/GPU vary. For 8 GB RAM, use 720p and shorter clips; very large source files may fail.

## Run locally
Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. FFmpeg WebAssembly is downloaded from unpkg the first time you render, so internet is needed for the engine. Video bytes remain in the browser tab.

## Deploy free to Vercel
1. Create a GitHub repository and upload this project.
2. Import the repository into Vercel.
3. Framework preset: Vite.
4. Build command: `npm run build`
5. Output directory: `dist`
6. Deploy. `vercel.json` sets cross-origin isolation headers needed by FFmpeg.wasm.

A free static deployment can host the interface. It does not provide free cloud compute; this project uses the visitor's browser.

## Recommended test
Use a 1–3 minute MP4 with an audio track, then:
1. Upload it.
2. Choose 20 or 25 seconds and 2 clips.
3. Click Find moments.
4. Preview the timestamps.
5. Add a short caption card if wanted.
6. Render at 720p and download.

## Next engineering milestones
1. Add actual speech transcription (Whisper-compatible browser model) with timed word/phrase captions.
2. Add visual scene-change and facecam detection, with user-adjustable facecam/gameplay layout.
3. Add better semantic moment ranking using on-device multimodal models where feasible.
4. Add authorized live tab/screen capture with rolling buffer.
5. Add persistence/export queue and mobile-friendly review.

## Rights and privacy
Only process videos you own or have permission to use. This build has no server-side storage; closing or refreshing the tab clears the current session's clip state.
