const INDEPENDENT = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
  "ऋ": "ri", "ॠ": "ree", "ऌ": "li", "ॡ": "lee", "ए": "e", "ऐ": "ai",
  "ओ": "o", "औ": "au", "ऍ": "e", "ऑ": "o", "ऎ": "e", "ऒ": "o",
};

const CONSONANTS = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh",
  "स": "s", "ह": "h", "ळ": "l", "ऩ": "n", "ऱ": "r", "ऴ": "l",
};

const NUKTA = {
  "क": "q", "ख": "kh", "ग": "g", "ज": "z", "ड": "r",
  "ढ": "rh", "फ": "f", "य": "y", "न": "n", "र": "r", "ळ": "l",
};

const MATRAS = {
  "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri",
  "ॄ": "ree", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o",
  "ॅ": "e", "ॆ": "e", "ॊ": "o", "ॢ": "li",
};

const VIRAMA = "\u094D";
const NUKTA_SIGN = "\u093C";

const DEVANAGARI_RANGE = /[\u0900-\u097F]/;

function romanizeDevanagariWord(word) {
  const chars = Array.from(word);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (ch === VIRAMA || ch === NUKTA_SIGN || ch === "\u200C" || ch === "\u200D") {
      continue;
    }

    if (CONSONANTS[ch] !== undefined) {
      let cons = CONSONANTS[ch];
      let consumed = 1;
      if (chars[i + 1] === NUKTA_SIGN && NUKTA[ch] !== undefined) {
        cons = NUKTA[ch];
        consumed = 2;
      }
      out += cons;
      const nxt = chars[i + consumed];
      if (nxt === VIRAMA) {
        i += consumed;
        continue;
      }
      if (nxt !== undefined && MATRAS[nxt] !== undefined) {
        out += MATRAS[nxt];
        i += consumed;
        continue;
      }
      out += "a";
      i += consumed - 1;
      continue;
    }

    if (INDEPENDENT[ch] !== undefined) {
      out += INDEPENDENT[ch];
      continue;
    }
    if (MATRAS[ch] !== undefined) {
      out += MATRAS[ch];
      continue;
    }
    if (ch === "ं" || ch === "ँ") {
      out += "n";
      continue;
    }
    if (ch === "ः") {
      out += "h";
      continue;
    }
    if (ch === "।" || ch === "॥") {
      out += ".";
      continue;
    }
    if (ch >= "०" && ch <= "९") {
      out += String(ch.codePointAt(0) - 0x0966);
      continue;
    }
    out += ch;
  }

  out = out.replace(/chchh/g, "chh");
  out = out.replace(/a([.,!?;:)\]"'…]*)$/, "$1");
  out = out.replace(/aa([.,!?;:)\]"'…]*)$/, "a$1");
  out = out.replace(/ee([.,!?;:)\]"'…]*)$/, "i$1");
  out = out.replace(/oo([.,!?;:)\]"'…]*)$/, "u$1");
  out = out.replace(/een([.,!?;:)\]"'…]*)$/, "in$1");
  out = out.replace(/en([.,!?;:)\]"'…]*)$/, "ein$1");
  out = out.replace(/aai([.,!?;:)\]"'…]*)$/, "ai$1");
  return out;
}

export function romanize(text) {
  if (!text) return "";
  return text
    .split(/(\s+)/)
    .map((token) => (DEVANAGARI_RANGE.test(token) ? romanizeDevanagariWord(token) : token))
    .join("")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function hasDevanagari(text) {
  return DEVANAGARI_RANGE.test(text || "");
}

export function romanizeSegments(segments) {
  return segments.map((seg) => ({ ...seg, text: romanize(seg.text) }));
}
