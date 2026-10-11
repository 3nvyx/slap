"""Throwaway: is a local translation model faster than Google Translate for live captions?
Translates the same lecture sentences English -> Japanese and Vietnamese with each backend,
one sentence at a time (how the server translates finals), and records wall time per sentence.

  uv run --with mlx-lm --with ctranslate2 --with transformers --with sentencepiece --with torch \
      python bench.py [google] [nllb] [translategemma-4b] [translategemma-12b] [hunyuan-7b]

Results merge into results.json; translations go to translations.md for a quality read.
Google needs GOOGLE_TRANSLATE_API_KEY in the environment.
"""
import json, os, re, statistics, sys, time
from pathlib import Path

HERE = Path(__file__).parent
FIXTURE = HERE / "../../apps/api/fixtures/lecture_sample.txt"
LANGS = {"ja": ("Japanese", "jpn_Jpan"), "vi": ("Vietnamese", "vie_Latn")}
MLX = {
    "translategemma-4b": "mlx-community/translategemma-4b-it-4bit",
    "translategemma-12b": "mlx-community/translategemma-12b-it-4bit",
    "hunyuan-7b": "mlx-community/Hunyuan-MT-7B-4bit",
}


def sentences():
    raw = re.sub(r"\s+", " ", FIXTURE.read_text())
    s = [x for x in re.split(r"(?<=[.?!])\s+", raw) if 8 <= len(x.split(" ")) <= 28]
    return s[5:17]   # the same 12 sentences as the first Google measurement


def summarise(times):
    t = sorted(times)
    return {"median_ms": round(statistics.median(t)), "p90_ms": round(t[int(len(t) * 0.9)]), "max_ms": round(t[-1])}


def run(name, translate, sents, extra=None):
    """translate(text, lang) -> str. One warm-up call per language, then every sentence in turn."""
    out = {"per_lang": {}, "translations": {}}
    both = [0.0] * len(sents)
    for lang in LANGS:
        translate(sents[-1] + " ", lang)
        times, texts = [], []
        for i, s in enumerate(sents):
            t = time.perf_counter()
            texts.append(translate(s, lang).strip())
            dt = (time.perf_counter() - t) * 1000
            times.append(dt)
            both[i] += dt
        out["per_lang"][lang] = summarise(times)
        out["translations"][lang] = texts
    out["both_langs"] = summarise(both)   # one after the other, as a single local model would run them
    if extra:
        out.update(extra())
    print(name, json.dumps({k: v for k, v in out.items() if k != "translations"}, ensure_ascii=False), flush=True)
    return out


def google():
    import http.client
    key = os.environ["GOOGLE_TRANSLATE_API_KEY"]
    conn = http.client.HTTPSConnection("translation.googleapis.com", timeout=10)   # kept open, as the server's fetch does

    def tr(text, lang):
        body = json.dumps({"q": [text], "target": lang, "source": "en", "format": "text"})
        conn.request("POST", "/language/translate/v2?key=" + key, body, {"content-type": "application/json"})
        return json.loads(conn.getresponse().read())["data"]["translations"][0]["translatedText"]
    return tr, None


def nllb():
    import ctranslate2, transformers
    out = Path.home() / ".cache/slap-spikes/nllb-200-distilled-600M-ct2-int8"   # outside the repo
    if not out.exists():   # converted locally from Meta's own checkpoint
        from ctranslate2.converters import TransformersConverter
        TransformersConverter("facebook/nllb-200-distilled-600M").convert(str(out), quantization="int8")
    tok = transformers.AutoTokenizer.from_pretrained("facebook/nllb-200-distilled-600M", src_lang="eng_Latn")
    mt = ctranslate2.Translator(str(out), device="cpu", compute_type="int8", inter_threads=1, intra_threads=8)

    def tr(text, lang):
        src = tok.convert_ids_to_tokens(tok.encode(text))
        res = mt.translate_batch([src], target_prefix=[[LANGS[lang][1]]], beam_size=4, max_decoding_length=200)
        return tok.decode(tok.convert_tokens_to_ids(res[0].hypotheses[0][1:]), skip_special_tokens=True)
    return tr, None


def mlx(name):
    from mlx_lm import load, stream_generate
    model, tok = load(MLX[name])
    END = "<end_of_turn>"
    stats = {"tps": [], "first_token_ms": [], "out_tokens": []}

    def prompt(text, lang):
        if name.startswith("translategemma"):
            msg = [{"role": "user", "content": [{"type": "text", "source_lang_code": "en", "target_lang_code": lang, "text": text}]}]
        else:   # Hunyuan-MT's documented prompt for pairs without Chinese
            msg = [{"role": "user", "content": f"Translate the following segment into {LANGS[lang][0]}, without additional explanation.\n\n{text}"}]
        return tok.apply_chat_template(msg, add_generation_prompt=True, tokenize=False)

    def tr(text, lang):
        t0 = time.perf_counter()
        parts, first, last = [], None, None
        for r in stream_generate(model, tok, prompt=prompt(text, lang), max_tokens=200):
            if first is None:
                first = (time.perf_counter() - t0) * 1000
            last = r
            if END in r.text:   # Gemma ends a turn with this marker; mlx-lm does not stop on it by itself
                parts.append(r.text.split(END)[0])
                break
            parts.append(r.text)
        stats["first_token_ms"].append(first)
        stats["tps"].append(last.generation_tps)
        stats["out_tokens"].append(last.generation_tokens)
        return "".join(parts)

    def extra():
        import mlx.core as mx
        return {"first_token_median_ms": round(statistics.median(stats["first_token_ms"])),
                "tokens_per_s_median": round(statistics.median(stats["tps"])),
                "out_tokens_median": round(statistics.median(stats["out_tokens"])),
                "peak_memory_gb": round(mx.get_peak_memory() / 1e9, 2)}
    return tr, extra


def main():
    which = sys.argv[1:] or ["google", "nllb", *MLX]
    sents = sentences()
    path = HERE / "results.json"
    results = json.loads(path.read_text()) if path.exists() else {}
    results["_sentences"] = sents
    for name in which:
        tr, extra = google() if name == "google" else nllb() if name == "nllb" else mlx(name)
        results[name] = run(name, tr, sents, extra)
        path.write_text(json.dumps(results, ensure_ascii=False, indent=1))
    names = [n for n in results if not n.startswith("_")]
    md = ["# Translations, side by side", ""]
    for i, s in enumerate(sents):
        md.append(f"**{i + 1}. {s}**\n")
        for lang in LANGS:
            md += [f"- {lang} · {n}: {results[n]['translations'][lang][i]}" for n in names]
        md.append("")
    (HERE / "translations.md").write_text("\n".join(md))


main()
