"use strict";
// Mock data for the screen lab. All of it is made up: change it freely.

// Starting values for the controls on the right of the page.
const MOCK = {
  classCode: "CS229",
  joinBase: "https://slap.example/j/",   // the join link is this + the class code; a longer link makes a denser QR
  message: "Lost connection to the server",
  level: 0.55,      // sound level, 0 to 1
  seconds: 754,     // how long the recording has been running
  wifiOk: true,
};

// The font menu. Three kinds of entry:
//   { name: "Helvetica" }                             a font installed on this computer
//   { name: "My Font", file: "fonts/my-font.ttf" }    a font file kept in the fonts/ folder
//   { name: "Silkscreen", google: true }              fetched from Google Fonts by name (needs internet)
const FONTS = [
  { name: "Helvetica", note: "the device today" },
  { name: "Arial" },
  { name: "Verdana" },
  { name: "Georgia" },
  { name: "Menlo" },
  { name: "Courier New" },
  { name: "Pixelify Sans", google: true },
  { name: "Silkscreen", google: true },
  { name: "VT323", google: true },
  { name: "DotGothic16", google: true },
];

// Same twelve languages as the web app (apps/web/src/lib/languages.ts).
// `sample` is the caption shown for that language; the translations are placeholders, not checked by a native speaker.
// `deviceBoxes: true` marks a language the real device cannot draw yet: its server has no font for the
// script, so every character comes out as an empty box (checked against apps/api/src/oled.ts on 10 October).
// The lab still draws it with this computer's fonts and shows a warning. Remove the flag once the server has a font.
const LANGUAGES = [
  { code: "en", name: "English", native: "English", sample: [
    "So what does a Gaussian look like?",
    "It is a bell curve centred on the mean.",
    "With enough data, this is a pretty good model.",
  ] },
  { code: "es", name: "Spanish", native: "Español", sample: [
    "¿Y qué aspecto tiene una gaussiana?",
    "Es una curva de campana centrada en la media.",
    "Con suficientes datos, es un modelo bastante bueno.",
  ] },
  { code: "zh", name: "Chinese", native: "中文", deviceBoxes: true, sample: [
    "那么高斯分布是什么样子的？",
    "它是一条以均值为中心的钟形曲线。",
    "只要数据足够多，这就是一个相当好的模型。",
  ] },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", sample: [
    "Vậy phân phối Gauss trông như thế nào?",
    "Đó là một đường cong hình chuông có tâm tại giá trị trung bình.",
    "Khi có đủ dữ liệu, đây là một mô hình khá tốt.",
  ] },
  { code: "ko", name: "Korean", native: "한국어", deviceBoxes: true, sample: [
    "그렇다면 가우시안은 어떤 모양일까요?",
    "평균을 중심으로 한 종 모양의 곡선입니다.",
    "데이터가 충분하면 꽤 좋은 모델이 됩니다.",
  ] },
  { code: "hi", name: "Hindi", native: "हिन्दी", deviceBoxes: true, sample: [
    "तो गाउसियन कैसा दिखता है?",
    "यह माध्य पर केंद्रित एक घंटी के आकार का वक्र है।",
    "पर्याप्त डेटा होने पर यह काफ़ी अच्छा मॉडल है।",
  ] },
  { code: "ar", name: "Arabic", native: "العربية", rtl: true, deviceBoxes: true, sample: [
    "إذن كيف يبدو التوزيع الغاوسي؟",
    "إنه منحنى على شكل جرس يتمركز حول المتوسط.",
    "مع بيانات كافية، يُعد هذا نموذجًا جيدًا إلى حد كبير.",
  ] },
  { code: "fr", name: "French", native: "Français", sample: [
    "Alors, à quoi ressemble une gaussienne ?",
    "C'est une courbe en cloche centrée sur la moyenne.",
    "Avec assez de données, c'est un assez bon modèle.",
  ] },
  { code: "de", name: "German", native: "Deutsch", sample: [
    "Wie sieht also eine Gauß-Verteilung aus?",
    "Sie ist eine Glockenkurve um den Mittelwert.",
    "Mit genügend Daten ist das ein ziemlich gutes Modell.",
  ] },
  { code: "pt", name: "Portuguese", native: "Português", sample: [
    "Então, como é uma gaussiana?",
    "É uma curva em forma de sino centrada na média.",
    "Com dados suficientes, este é um modelo bastante bom.",
  ] },
  { code: "ja", name: "Japanese", native: "日本語", deviceBoxes: true, sample: [
    "では、ガウス分布はどんな形でしょうか。",
    "平均を中心とした釣鐘型の曲線です。",
    "データが十分にあれば、これはかなり良いモデルです。",
  ] },
  { code: "tl", name: "Tagalog", native: "Tagalog", sample: [
    "Kaya ano ang hitsura ng isang Gaussian?",
    "Isa itong kurbang hugis-kampana na nakasentro sa mean.",
    "Kapag sapat ang data, medyo mahusay na modelo ito.",
  ] },
];
