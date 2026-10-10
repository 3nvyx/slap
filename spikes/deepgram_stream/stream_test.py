"""Throwaway: stream a 16 kHz 16-bit mono WAV to Deepgram in 100 ms chunks, the
exact format the device will send, and measure caption latency.

Latency here = (wall time an interim/final result arrives) - (wall time the
audio for the end of that result was sent). Real-time pacing: one 3,200-byte
chunk every 100 ms, like the ESP32.

Usage: DEEPGRAM_API_KEY in ../../.env, then
  uv run --with websockets --with python-dotenv python stream_test.py audio.wav
"""
import asyncio, json, os, sys, time, wave
from pathlib import Path
from dotenv import load_dotenv
import websockets

for f in (Path(__file__).resolve().parents[2] / ".env", Path(__file__).resolve().parents[3] / ".env.local"):
    load_dotenv(f)
KEY = os.environ.get("DEEPGRAM_API_KEY")
if not KEY:
    sys.exit("DEEPGRAM_API_KEY missing in slap/.env")

URL = ("wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16"
       "&sample_rate=16000&channels=1&interim_results=true&smart_format=true"
       "&punctuate=true&endpointing=300&utterance_end_ms=1000")
CHUNK = 3200  # 100 ms of 16 kHz 16-bit mono

async def main(path):
    w = wave.open(path, "rb")
    assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2, \
        "need 16 kHz mono 16-bit wav"
    pcm = w.readframes(w.getnframes())
    total_s = len(pcm) / 32000
    print(f"audio: {total_s:.1f} s, {len(pcm)//CHUNK} chunks")

    sent_at = {}       # audio_seconds_sent -> wall time
    t0 = None
    interim_lat, final_lat = [], []
    finals = []

    async with websockets.connect(URL, additional_headers={"Authorization": f"Token {KEY}"}) as ws:
        async def sender():
            nonlocal t0
            t0 = time.perf_counter()
            for i in range(0, len(pcm), CHUNK):
                target = t0 + (i / 32000)          # real-time pacing
                now = time.perf_counter()
                if target > now:
                    await asyncio.sleep(target - now)
                await ws.send(pcm[i:i+CHUNK])
                sent_at[round((i + CHUNK) / 32000, 1)] = time.perf_counter()
            await ws.send(json.dumps({"type": "CloseStream"}))

        async def receiver():
            first = None
            async for msg in ws:
                d = json.loads(msg)
                if d.get("type") != "Results":
                    continue
                alt = d["channel"]["alternatives"][0]
                text = alt.get("transcript", "")
                if not text:
                    continue
                end_audio = d["start"] + d["duration"]      # seconds of audio this covers
                # when did we finish sending that audio?
                key = round(end_audio, 1)
                while key not in sent_at and key < total_s + 1:
                    key = round(key + 0.1, 1)
                if key in sent_at:
                    lat = time.perf_counter() - sent_at[key]
                else:
                    lat = float("nan")
                if d.get("is_final"):
                    final_lat.append(lat)
                    words = alt.get("words", [])
                    finals.append(text)
                    print(f"FINAL   +{lat*1000:6.0f} ms  words={len(words):3d}  {text[:70]}")
                else:
                    interim_lat.append(lat)
                    if first is None:
                        first = lat
                        print(f"first interim after {lat*1000:.0f} ms")
            return first

        await asyncio.gather(sender(), receiver())

    import statistics as st
    def summ(name, xs):
        xs = [x for x in xs if x == x]
        if xs:
            print(f"{name}: n={len(xs)} median={st.median(xs)*1000:.0f} ms  p90={sorted(xs)[int(len(xs)*0.9)-1]*1000:.0f} ms")
    summ("interim latency", interim_lat)
    summ("final latency  ", final_lat)
    Path("transcript_deepgram.txt").write_text("\n".join(finals))
    print("transcript saved: transcript_deepgram.txt")

asyncio.run(main(sys.argv[1]))
