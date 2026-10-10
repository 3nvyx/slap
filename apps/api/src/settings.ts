// The only module that reads process.env. Everything else imports from here.
const env = (k: string, d?: string) => process.env[k] ?? d;

export const settings = {
  mode: (env("MODE", "demo") as "demo" | "local" | "cloud"),
  port: Number(env("PORT", "8787")),
  publicUrl: env("PUBLIC_URL", "http://localhost:8787")!,       // fixed tunnel hostname in demo
  databaseUrl: env("DATABASE_URL"),
  stt: { backend: env("STT_BACKEND", "deepgram") as "deepgram" | "mock", deepgramKey: env("DEEPGRAM_API_KEY") },
  translate: { backend: env("TRANSLATE_BACKEND", env("GOOGLE_TRANSLATE_API_KEY") ? "google" : "mock") as "google" | "mock", googleKey: env("GOOGLE_TRANSLATE_API_KEY") },
  llm: {
    backend: env("LLM_BACKEND", env("ANTHROPIC_API_KEY") ? "claude" : env("OPENAI_API_KEY") ? "openai" : env("GEMINI_API_KEY") ? "gemini" : "mock") as "claude" | "openai" | "gemini" | "mock",
    anthropicKey: env("ANTHROPIC_API_KEY"),
    anthropicModel: env("ANTHROPIC_MODEL", "claude-sonnet-5-5")!,
    geminiKey: env("GEMINI_API_KEY"),
    geminiModel: env("GEMINI_MODEL", "gemini-2.5-flash")!,
    openaiKey: env("OPENAI_API_KEY"),
    openaiModel: env("OPENAI_MODEL") || "gpt-5-mini",   // Responses API model id; fill in .env.local
    openaiReasoning: env("OPENAI_REASONING", "low")!,    // reasoning.effort for reasoning models; "" sends none
  },
  fish: {
    key: env("FISH_API_KEY"),
    ttsModel: env("FISH_TTS_MODEL", "s2.1-pro")!,
    asrModel: env("FISH_ASR_MODEL", "transcribe-1-pro")!,
    voiceId: env("FISH_VOICE_ID"),                 // default partner voice (Fish voice model id)
    voices: env("FISH_VOICES", "")!,                // "id:Name:style,..." curated partner voices
    diarize: env("FISH_DIARIZE", env("FISH_API_KEY") ? "1" : "0") === "1",
  },
  deviceKeys: (env("DEVICE_KEYS", "dev-device-key") ?? "").split(",").map(s => s.trim()).filter(Boolean),
  webDist: env("WEB_DIST", "../web/dist")!,
};
