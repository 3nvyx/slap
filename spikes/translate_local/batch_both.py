"""Throwaway: can one local model produce Japanese and Vietnamese at the same time?
Runs TranslateGemma 4B on both target languages as one batch per sentence.
  uv run --with mlx-lm python batch_both.py
"""
import json, statistics, time
from pathlib import Path
from mlx_lm import load, batch_generate

HERE = Path(__file__).parent
sents = json.loads((HERE / "results.json").read_text())["_sentences"]
model, tok = load("mlx-community/translategemma-4b-it-4bit")
tok.add_eos_token("<end_of_turn>")


def prompt(text, lang):
    msg = [{"role": "user", "content": [{"type": "text", "source_lang_code": "en", "target_lang_code": lang, "text": text}]}]
    return tok.apply_chat_template(msg, add_generation_prompt=True)


batch_generate(model, tok, [prompt(sents[-1] + " ", l) for l in ("ja", "vi")], max_tokens=120)   # warm-up
times, first = [], None
for s in sents:
    t = time.perf_counter()
    r = batch_generate(model, tok, [prompt(s, l) for l in ("ja", "vi")], max_tokens=120)
    times.append((time.perf_counter() - t) * 1000)
    first = first or r.texts
t = sorted(times)
out = {"median_ms": round(statistics.median(t)), "p90_ms": round(t[int(len(t) * 0.9)]), "max_ms": round(t[-1])}
print("translategemma-4b, ja+vi in one batch:", json.dumps(out))
print(first)
res = json.loads((HERE / "results.json").read_text())
res["translategemma-4b"]["both_langs_batched"] = out
(HERE / "results.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
