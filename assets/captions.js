const STOPWORDS = new Set(
  (
    "the a an and or but is are was were be been being am do does did doing have has had " +
    "having to of in on at for with from by as it its this that these those i you he she " +
    "we they me him her us them my your his their our mine yours theirs mine our who whom " +
    "which what when where why how there here not no nor so then than too very just really " +
    "can could would should will shall may might must about into over after before again " +
    "up down out off only own same such because if while any all each few more most other " +
    "some get got go going gone gonna wanna kinda sorta like know think want need see look " +
    "ok okay yeah yep nah hey hmm um uh oh ah well la li le lo " +
    "hai hain ha ho hoga honge tha thi the thein hu hun hoon nahi nahin na ni bhi to toh " +
    "ka ki ke ko se mein me ek ekdum ye yeh yehi wo woh vo hum tum aap main mai mujhe " +
    "tujhe humko tumko apna apni apne kuch koi kya kyun kyu kaise kar karna karo karte " +
    "karta karti kiya kiyaa raha rahi rahe gaya gayi gaye matlab acha achha accha bhai " +
    "yaar yr abi abhi bas bus phir fir ja jaata jaati jata jati aa aao aaya aayi ki koi " +
    "bhot bahut bhut bohot thoda thodi zyada sab sabhi apna bana banao banaa de dena diya " +
    "di do dena dena padega paida hota hoti hote hoti sir ji bhaiya didi"
  ).split(/\s+/)
);

const EMOJI_POOL = ["🔥", "😱", "💯", "👀", "🤯", "😭", "💀", "✨", "🚀", "👉"];

const HOOK_TEMPLATES = [
  (k) => `Wait for it… the ${k} part is unreal`,
  (k) => `You won't believe what happened with this ${k}`,
  (k) => `POV: ${k} hits different`,
  (k) => `This ${k} moment broke the internet`,
  (k) => `Nobody was ready for this ${k}`,
  (k) => `Watch till the end… ${k} will shock you`,
  (k) => `The ${k} that everyone is talking about`,
  (k) => `When ${k} goes too far`,
  (k) => `This is your sign to not ignore ${k}`,
  (k) => `${k}? Trust me, you need to see this`,
];

const CTA_TEMPLATES = [
  "Follow for more 👉",
  "Save this for later ✅",
  "Tag someone who needs to see this 👀",
  "Share if you felt this 🔥",
  "Drop a ❤️ if you agree",
  "Comment your thoughts below 👇",
];

const GENERIC_HASHTAGS = [
  "viral", "trending", "fyp", "foryou", "foryoupage", "reels", "shorts",
  "explore", "viralvideo", "trendingreels", "trendingnow", "mustwatch",
];

const LANGUAGE_HASHTAGS = {
  hi: ["hinglish", "hindishorts", "hindireels", "desicomedy", "indianreels", "desicontent"],
  en: ["englishreels", "englishshorts", "contentcreator", "storytime"],
  auto: ["hinglish", "hindishorts", "indianreels", "desicontent"],
};

function capitalize(text) {
  return text.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function toHashtag(word) {
  const clean = word.replace(/[^a-z0-9]/gi, "");
  if (!clean || clean.length < 3) return null;
  return "#" + clean.toLowerCase();
}

function stripEmoji(text) {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractKeywords(segments, limit = 12) {
  const counts = new Map();
  const fullText = segments.map((s) => s.text).join(" ");
  const tokens = fullText.toLowerCase().match(/[a-z][a-z0-9']*/g) || [];
  for (const token of tokens) {
    const word = token.replace(/'+$/, "");
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    if (/^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, score: count * (1 + word.length / 8) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.word);
}

export function generateCaptions(segments, { language = "auto", emojis = true } = {}) {
  const keywords = extractKeywords(segments);
  const primary = keywords[0] || "this";
  const secondary = keywords[1] || primary;

  const title = keywords.length
    ? capitalize(keywords.slice(0, 3).join(" "))
    : "Must Watch Clip";

  const hooks = HOOK_TEMPLATES.map((fn, index) => {
    const base = fn(index % 2 ? secondary : primary);
    return emojis ? `${base} ${EMOJI_POOL[index % EMOJI_POOL.length]}` : base;
  });

  const langKey = language === "english" ? "en" : language === "hindi" || language === "hinglish" ? "hi" : "auto";
  const keywordTags = keywords.map(toHashtag).filter(Boolean);
  const langTags = LANGUAGE_HASHTAGS[langKey] || LANGUAGE_HASHTAGS.auto;
  const seen = new Set();
  const hashtags = [];
  for (const raw of [...keywordTags, ...langTags, ...GENERIC_HASHTAGS]) {
    const tag = raw.startsWith("#") ? raw : `#${raw}`;
    if (!seen.has(tag)) {
      seen.add(tag);
      hashtags.push(tag);
    }
    if (hashtags.length >= 12) break;
  }

  const cta = emojis ? CTA_TEMPLATES[0] : stripEmoji(CTA_TEMPLATES[0]);
  const hook = hooks[0];
  const hashtagLine = hashtags.join(" ");
  const caption = `${hook}\n\n${cta}\n\n${hashtagLine}`;

  const variants = hooks.slice(0, 4).map((h, index) => ({
    style: ["Hook", "Curiosity", "Relatable", "Bold"][index] || `Option ${index + 1}`,
    text: `${h}\n\n${cta}\n\n${hashtagLine}`,
  }));

  const wordCount = (segments.map((s) => s.text).join(" ").match(/[a-z0-9]+/gi) || []).length;
  const duration = segments.length ? segments[segments.length - 1].end : 0;

  return {
    title,
    hook,
    caption,
    hashtags,
    hashtagLine,
    variants,
    keywords,
    stats: { words: wordCount, duration, segments: segments.length },
  };
}
