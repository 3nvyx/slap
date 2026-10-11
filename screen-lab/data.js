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
//                                                     (add bold: "fonts/my-font-bold.ttf" when it has a bold file)
//   { name: "Silkscreen", google: true }              fetched from Google Fonts by name (needs internet)
// The first entry is the device's own font: the same files the server draws with (fonts/device).
const FONTS = [
  { name: "Noto Sans", file: "fonts/device/noto-sans/NotoSans-Regular.ttf", bold: "fonts/device/noto-sans/NotoSans-Bold.ttf", note: "the device today" },
  { name: "Helvetica" },
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

// The three caption languages of the device (DEVICE_LANGS in packages/contracts): the English transcript, and its
// Vietnamese or Japanese translation. `sample` is the caption shown for that language; the translations are
// placeholders, not checked by a native speaker.
const LANGUAGES = [
  { code: "en", name: "English", native: "English", sample: [
    "So what does a Gaussian look like?",
    "It is a bell curve centred on the mean.",
    "With enough data, this is a pretty good model.",
  ] },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", sample: [
    "Vậy phân phối Gauss trông như thế nào?",
    "Đó là một đường cong hình chuông có tâm tại giá trị trung bình.",
    "Khi có đủ dữ liệu, đây là một mô hình khá tốt.",
  ] },
  { code: "ja", name: "Japanese", native: "日本語", sample: [
    "では、ガウス分布はどんな形でしょうか。",
    "平均を中心とした釣鐘型の曲線です。",
    "データが十分にあれば、これはかなり良いモデルです。",
  ] },
];
