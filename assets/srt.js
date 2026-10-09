function pad(n, width = 2) {
  return String(Math.floor(n)).padStart(width, "0");
}

export function formatTime(seconds, separator = ",") {
  const safe = Math.max(0, seconds || 0);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}${separator}${pad(ms, 3)}`;
}

const END_PUNCT = /[.!?।…]["')\]]*\s*$/;

export function refineSegments(segments, { maxChars = 64, maxDuration = 6 } = {}) {
  if (!segments || !segments.length) return [];

  const cleaned = segments
    .map((seg) => ({
      start: Math.max(0, seg.start || 0),
      end: Math.max(seg.start || 0, seg.end || 0),
      text: (seg.text || "").replace(/\s+/g, " ").trim(),
    }))
    .filter((seg) => seg.text.length > 0);

  const merged = [];
  for (const seg of cleaned) {
    const prev = merged[merged.length - 1];
    const combinedLen = prev ? (prev.text + " " + seg.text).length : Infinity;
    const combinedDur = prev ? seg.end - prev.start : Infinity;
    if (prev && combinedLen <= maxChars && combinedDur <= maxDuration && !END_PUNCT.test(prev.text)) {
      prev.text = (prev.text + " " + seg.text).trim();
      prev.end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  }

  const result = [];
  for (const seg of merged) {
    if (seg.text.length <= maxChars) {
      result.push(seg);
      continue;
    }
    const words = seg.text.split(" ");
    const duration = seg.end - seg.start;
    const chunks = [];
    let current = [];
    for (const word of words) {
      const candidate = current.concat(word).join(" ");
      if (candidate.length > maxChars && current.length) {
        chunks.push(current);
        current = [word];
      } else {
        current.push(word);
      }
    }
    if (current.length) chunks.push(current);

    const totalChars = chunks.reduce((sum, c) => sum + c.join(" ").length, 0) || 1;
    let cursor = seg.start;
    chunks.forEach((chunk, index) => {
      const share = (chunk.join(" ").length / totalChars) * duration;
      const start = cursor;
      const end = index === chunks.length - 1 ? seg.end : cursor + share;
      result.push({ start, end, text: chunk.join(" ") });
      cursor = end;
    });
  }

  for (let i = 0; i < result.length; i++) {
    if (i < result.length - 1 && result[i].end > result[i + 1].start) {
      result[i].end = result[i + 1].start;
    }
    if (result[i].end <= result[i].start) {
      result[i].end = result[i].start + 0.5;
    }
  }
  return result;
}

export function toSRT(segments) {
  return segments
    .map((seg, index) => {
      const start = formatTime(seg.start, ",");
      const end = formatTime(seg.end, ",");
      return `${index + 1}\n${start} --> ${end}\n${seg.text}\n`;
    })
    .join("\n");
}

export function toVTT(segments) {
  const body = segments
    .map((seg) => {
      const start = formatTime(seg.start, ".");
      const end = formatTime(seg.end, ".");
      return `${start} --> ${end}\n${seg.text}\n`;
    })
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

export function toTXT(segments) {
  return segments.map((seg) => seg.text).join("\n");
}

export function toTimestampedTXT(segments) {
  return segments
    .map((seg) => `[${formatTime(seg.start, ".")} --> ${formatTime(seg.end, ".")}] ${seg.text}`)
    .join("\n");
}
