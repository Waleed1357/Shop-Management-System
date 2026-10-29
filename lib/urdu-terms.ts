import { urduFont } from "./fonts";

/** Warranty terms printed on every receipt (from the shop's warranty card). Edit the text here. */
export const WARRANTY_TITLE = "مندرجہ ذیل نکات کی صورت میں وارنٹی خارج تصور کی جائے گی۔";
export const WARRANTY_TERMS = [
  "اگر وارنٹی کارڈ مکمل طور پر پُر نہ کیا گیا ہو، بدل گیا ہو یا کسی بھی نقطے کو تبدیل کرنے کی کوشش کی گئی ہو۔",
  "TV کسی غیر متعلقہ ٹیکنیشن سے کھلوایا گیا ہو یا پہلے کسی قسم کے پرزہ جات استعمال کیے گئے ہوں جو کہ اعوان الیکٹرونکس نے فراہم نہ کیے ہوں۔",
  "TV کے سیریل نمبر یا اس کے اوپر لگی ہوئی سیل کی تبدیلی یا اس کو توڑنا۔",
  "TV کا کسی حادثے سے گرنا، غیر مناسب استعمال، غیر معیاری تنصیب، غیر مناسب نقل و حمل، کسی کھانے پینے کی اشیاء کا ٹی وی پر گرنا یا کسی قدرتی آفت کی وجہ سے ٹی وی کا خراب ہونا۔",
  "کیبل کے بیک کرنٹ یا واپڈا کی ہائی وولٹیج سے شارٹ سرکٹنگ۔",
  "15 دن میں اپنا اپلائنس لے لیں ورنہ کمپنی ذمہ دار نہ ہوگی۔",
  "LED پینل ریپئرنگ کی 15 دن سے زیادہ وارنٹی نہیں ہوگی۔",
];

const PX_PER_MM = 12; // ~300 dpi, stays sharp when printed

/**
 * The round red "اعوان" badge from the bill book, drawn on a canvas (PDF fonts can't join Urdu).
 * Returns a PNG data URL, or null outside the browser.
 */
export async function renderUrduBadge(sizeMm: number): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const family = `${urduFont.style.fontFamily}, "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Urdu Typesetting", serif`;
  const size = Math.round(sizeMm * PX_PER_MM);
  const textPx = size * 0.34;
  try {
    await document.fonts.load(`700 ${textPx}px ${family}`, "اعوان");
  } catch {
    /* offline: the browser's own Urdu font is used */
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#c8102e";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${textPx}px ${family}`;
  ctx.fillText("اعوان", size / 2, size * 0.47);
  return canvas.toDataURL("image/png");
}

/**
 * PDF fonts can't join Urdu letters, so the terms are drawn on a canvas with a real
 * Nastaliq font (the browser shapes the text correctly) and placed in the PDF as an image.
 * Returns null outside the browser.
 */
export async function renderUrduTerms(widthMm: number): Promise<{ dataUrl: string; heightMm: number } | null> {
  if (typeof document === "undefined") return null;

  const family = `${urduFont.style.fontFamily}, "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Urdu Typesetting", serif`;
  const textPx = 2.9 * PX_PER_MM; // ~8pt
  const titlePx = 3.2 * PX_PER_MM;
  const lineHeight = textPx * 1.85; // Nastaliq letters are tall
  const numberWidth = 5 * PX_PER_MM;
  const width = Math.round(widthMm * PX_PER_MM);

  try {
    await Promise.all([
      document.fonts.load(`${textPx}px ${family}`, WARRANTY_TERMS.join(" ")),
      document.fonts.load(`700 ${titlePx}px ${family}`, WARRANTY_TITLE),
    ]);
  } catch {
    /* font couldn't download (offline) - the browser's own Urdu font is used */
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Word-wrap each term to the available width (measured with the real font).
  ctx.font = `${textPx}px ${family}`;
  const wrap = (text: string, maxWidth: number) => {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const wrapped = WARRANTY_TERMS.map((term) => wrap(term, width - numberWidth));
  const lineCount = wrapped.reduce((n, lines) => n + lines.length, 0);
  const titleHeight = titlePx * 2;
  canvas.width = width;
  canvas.height = Math.ceil(titleHeight + lineCount * lineHeight + textPx * 0.6);

  // Canvas resets when resized: set everything again.
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#991b1b";
  ctx.font = `700 ${titlePx}px ${family}`;
  ctx.fillText(WARRANTY_TITLE, width, titlePx * 1.35);

  ctx.fillStyle = "#1e293b";
  let y = titleHeight + lineHeight * 0.75;
  wrapped.forEach((lines, i) => {
    ctx.font = `700 ${textPx}px ${family}`;
    ctx.fillText(`${i + 1}.`, width, y);
    ctx.font = `${textPx}px ${family}`;
    for (const line of lines) {
      ctx.fillText(line, width - numberWidth, y);
      y += lineHeight;
    }
  });

  return { dataUrl: canvas.toDataURL("image/png"), heightMm: canvas.height / PX_PER_MM };
}
