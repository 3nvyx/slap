# Competitive landscape (researched 7 October 2026)

## Voice AI tutors and learning partners, by reach
1. ChatGPT voice + Study Mode (~900M weekly users; Study Mode works in voice). Grounded only in what the user uploads. [TechCrunch](https://techcrunch.com/2025/07/29/openai-launches-study-mode-in-chatgpt), [OpenAI help](https://help.openai.com/en/articles/11780217-using-study-mode-in-chatgpt)
2. Google Gemini Live + Guided Learning (free in Workspace for Education). Not grounded in lectures. [Technology Magazine](https://technologymagazine.com/news/guided-learning-googles-ai-tool-that-teaches-not-answers)
3. Duolingo Max Video Call (12.7M paid subs; language only). [Subscription Insider](https://www.subscriptioninsider.com/blog/duolingo-s-q2-paid-subscriber-growth-outpaces-subscription-bookings-news)
4. Khanmigo (2.0M users; voice input, text replies; Khan content). [Khan annual report](https://www.annualreport.khanacademy.org/)
5. Speak ($1B valuation; language). [TechCrunch](https://techcrunch.com/2024/12/10/openai-backed-speak-raises-78m-at-1b-valuation-to-help-users-learn-languages-by-talking-out-loud)
6. Praktika, ELSA (language).
7. StudyFetch Tutor Me (Feb 2025): the closest to Slap, a voice tutor grounded in uploaded lectures. [Speech Technology](https://speechtechmag.com/Articles/News/Speech-Technology-News/StudyFetch-Launches-Conversational-TutorMe-App-168270.aspx)
8. Sesame (companion), Aristotle, Eevi, ElevenLabs Professor program (2026 newcomers).

Lesson: nobody except StudyFetch grounds the conversation in course material; none in a lecture captured minutes ago, in the student's language, with their own weak spots.

## Lecture capture and AI study apps, by student reach
1. Quizlet (60M+ MAU), acquired Coconote (lecture recorder) Feb 2026. [THE Journal](https://thejournal.com/articles/2026/02/13/quizlet-adds-ai-powered-tools-for-active-practice-notetaking.aspx)
2. Otter.ai ($100M ARR; live transcription, no translation). [BusinessWire](https://www.businesswire.com/news/home/20251222704206/en/)
3. Anki (FSRS default since 25.07). 4. Turbo AI (5M users, profitable). [TechCrunch](https://techcrunch.com/2025/10/23/20-year-old-dropouts-built-ai-notetaker-turbo-ai-to-5-million-users)
5. StudyFetch, Knowt, Mindgrasp. 6. Plaud NotePin (1.5M devices; personal, no translation). 7. Granola ($1.5B), Notion AI, Google Recorder.
8. Live translation in class is a paid tier of meeting software (Zoom Business Plus, Meet AI Pro for Education, Teams Premium) or phone-based (Microsoft Translator for Education); Vivi Live Captions runs on school displays. Nearest hardware: Timekettle X1 presentation mode (QR join, two preset languages, no study output).

Verdict: no product is a dedicated classroom-shared device that captions in each student's language and turns the lecture into a graph, FSRS cards and a study plan. That gap is Slap.

## Speech stacks (2026)
Default voice-agent pipeline: Deepgram STT → LLM → Cartesia or ElevenLabs TTS, or OpenAI Realtime. Fish Audio S2.1-Pro: $15/M bytes TTS, $0.36/hr ASR, 141 ms median latency, humanness #8 of 21 on Vapi's index, 3–5× cheaper than ElevenLabs/Cartesia; leaderboards disagree on quality ranking. [Vapi index](https://humannessindex.vapi.ai/models/fish-s2-1-pro), [Fish pricing](https://docs.fish.audio/developer-platform/models-pricing/pricing-and-rate-limits)

## Recommendation for the learning partner
One loop: press to talk → the partner asks a question from the lecture graph → grades the spoken answer → updates FSRS → explains in the lecture's own words. Fish S2.1-Pro TTS + transcribe-1-pro ASR (one vendor, under $0.05 per 10-minute demo). Swap ASR to OpenAI gpt-4o-mini-transcribe if accented speech disappoints. Pre-cache opening questions as audio so the first turn is instant on stage.
