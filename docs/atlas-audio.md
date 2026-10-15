# ATLAS voice assets

61 processed MP3 files in `apps/web/public/audio/atlas`, preserving all 10 source categories. `manifest.json` records category, URL, duration, source/output hashes and per-recording reference EQ.

Approved chain: reference EQ and level matching, phaser 30%, two delay taps (350 ms at 9%, 700 ms at 1%), additive reverb sends of 6% for the main voice, 35% for echo 1 and 75% for echo 2. Reverb RT60 0.7 s. No feedback. Mono 44.1 kHz, MP3 192 kbps. See `tools/atlas-voice-preset.json`.

Batch generation: `tools/build-atlas-voices.py` requires Python, NumPy and FFmpeg. Supply `--source`, `--output`, `--masters` and `--reference`. It refuses to overwrite existing outputs. The reference is `morbid_woman_10s_original.mp3` (archived with originals). EQ is calculated per recording. Runtime playback must not add this effect chain a second time.

Originals ZIP, PCM16 WAV masters, script, preset and manifest are archived at `C:/Users/aliat/Downloads/ATLAS_Anons/NexHold_Atlas_Archive`. All 61 archived originals were hash-verified. All 61 processed MP3 files decoded successfully and passed finite-sample, duration and clipping checks. Original `atlas` folder is retained. Game event playback is not wired up by this asset-generation task.

## Web build (2026-10-15)

The processed 192 kb/s masters above now live in `assets-src/atlas/` (not shipped; their original manifest is `assets-src/atlas/source-manifest.json`). `tools/build-atlas-voice.mjs` re-encodes them for the game into `apps/web/public/audio/atlas/<category>/<category>-NN.mp3`: mono, 44.1 kHz, 64 kb/s, two-pass loudnorm to about -18 LUFS with true peak at or below -1.5 dBTP, and a new `manifest.json` with relative URLs, durations, loudness and SHA-256 hashes. `node tools/build-atlas-voice.mjs --check` rebuilds into a temp folder and compares hashes. Playback rules: `apps/web/src/atlas-voice.ts`.
