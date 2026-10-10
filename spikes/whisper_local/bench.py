"""Throwaway: local Whisper speed on this Mac with MLX. Transcribes the 5-minute
lecture clip with two model sizes and prints wall time, real-time factor and
peak memory. Not a streaming test; it bounds what streaming could achieve.
"""
import sys, time, resource, json
import mlx_whisper

AUDIO = "audio/cs229_l03_12to17.wav"
MODELS = {
    "large-v3-turbo": "mlx-community/whisper-large-v3-turbo",
    "small":          "mlx-community/whisper-small-mlx",
}
AUDIO_S = 300.0
out = {}
for name, repo in MODELS.items():
    t0 = time.perf_counter()
    r = mlx_whisper.transcribe(AUDIO, path_or_hf_repo=repo, word_timestamps=True,
                               language="en", fp16=True)
    dt = time.perf_counter() - t0
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e9
    text = r["text"].strip()
    nwords = len(text.split())
    out[name] = {"wall_s": round(dt, 1), "rtf": round(dt / AUDIO_S, 3),
                 "speed_x_realtime": round(AUDIO_S / dt, 1), "peak_gb": round(rss, 2),
                 "words": nwords, "segments": len(r["segments"])}
    print(f"{name:16s} {dt:6.1f} s  RTF {dt/AUDIO_S:.3f}  ({AUDIO_S/dt:.1f}x realtime)  peak {rss:.2f} GB  {nwords} words", flush=True)
    open(f"transcript_{name}.txt", "w").write(text)
json.dump(out, open("results.json", "w"), indent=1)
