// Throwaway: Fish Audio ASR (transcribe-1-pro) on the CS229 clip, timed, with a
// word-overlap comparison against the Deepgram transcript of the same clip.
import { readFileSync, writeFileSync } from "node:fs";
const KEY = process.env.FISH_API_KEY;
if (!KEY) throw new Error("FISH_API_KEY missing in .env.local");
const [wavPath, refPath] = process.argv.slice(2);
const wav = readFileSync(wavPath);
const form = new FormData();
form.append("audio", new Blob([wav], { type: "audio/wav" }), "clip.wav");
form.append("language", "en");
form.append("ignore_timestamps", "false");
form.append("diarize", "auto");
const t0 = performance.now();
const res = await fetch("https://api.fish.audio/v1/asr", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, model: "transcribe-1-pro" }, body: form });
const dt = performance.now() - t0;
if (!res.ok) { console.log("ASR failed", res.status, await res.text()); process.exit(1); }
const j = await res.json() as { text: string; duration: number; segments: { text: string; start: number; end: number }[]; speaker_turns?: { speaker: string; text: string; start: number; end: number }[] };
const clean = j.text.replace(/<\|[^|]*\|>/g, " ").replace(/\[[^\]]*\]/g, " ");
writeFileSync("transcript_fish.txt", clean.trim());
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
const a = norm(clean), b = norm(readFileSync(refPath, "utf8"));
const bag = new Map<string, number>(); for (const w of b) bag.set(w, (bag.get(w) ?? 0) + 1);
let hit = 0; for (const w of a) { const n = bag.get(w) ?? 0; if (n > 0) { hit++; bag.set(w, n - 1); } }
console.log(`ASR transcribe-1-pro: ${dt.toFixed(0)} ms for ${j.duration.toFixed(0)} s of audio (${(j.duration*1000/dt).toFixed(1)}x realtime); ${a.length} words, ${j.segments.length} timed segments`);
console.log(`word overlap with Deepgram transcript: ${(100*hit/Math.max(a.length,b.length)).toFixed(1)}% (Deepgram ${b.length} words)`);
const turns = j.speaker_turns ?? [];
console.log(`speaker turns: ${turns.length}, distinct speakers: ${new Set(turns.map(t => t.speaker)).size}`);
for (const t of turns.slice(0, 4)) console.log(`  ${t.speaker} ${t.start.toFixed(1)}-${t.end.toFixed(1)}s: ${t.text.slice(0, 80)}`);
console.log("sample:", clean.trim().slice(0, 240));
