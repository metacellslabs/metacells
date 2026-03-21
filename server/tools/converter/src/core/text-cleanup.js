export function decodeBasicEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gu, " ")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&#39;/gu, "'");
}

export function collapseWhitespace(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n[ \t]+/gu, "\n")
    .replace(/[ \t]{2,}/gu, " ");
}

export function isLikelyHeading(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || trimmed.length > 100) return false;

  if (
    trimmed === trimmed.toUpperCase() &&
    trimmed.length > 3 &&
    trimmed.length < 60 &&
    !trimmed.includes(".")
  ) {
    const letters = Array.from(trimmed).filter((char) =>
      /[A-Za-zА-Яа-яЁё]/.test(char),
    );
    if (letters.length > 2) return true;
  }

  return trimmed.endsWith(":") && trimmed.length < 50 && !trimmed.includes(",");
}

export function joinLinesIntelligently(lines) {
  const result = [];
  let currentParagraph = "";

  for (const rawLine of Array.isArray(lines) ? lines : []) {
    const line = String(rawLine || "");
    if (!line) {
      if (currentParagraph) {
        result.push(currentParagraph);
        currentParagraph = "";
      }
      continue;
    }

    if (line.startsWith("#")) {
      if (currentParagraph) {
        result.push(currentParagraph);
        currentParagraph = "";
      }
      result.push(line);
      continue;
    }

    const lastChar = currentParagraph.slice(-1);
    const startsUppercase = /^[A-ZА-ЯЁ]/u.test(line);
    const shouldStartNew =
      startsUppercase &&
      lastChar !== "-" &&
      lastChar !== "," &&
      (lastChar === "." ||
        lastChar === "!" ||
        lastChar === "?" ||
        lastChar === ":" ||
        !currentParagraph);

    if (shouldStartNew && currentParagraph) {
      result.push(currentParagraph);
      currentParagraph = line;
      continue;
    }

    if (!currentParagraph) {
      currentParagraph = line;
      continue;
    }

    if (lastChar === "-") {
      currentParagraph = currentParagraph.slice(0, -1) + line;
    } else {
      currentParagraph += ` ${line}`;
    }
  }

  if (currentParagraph) {
    result.push(currentParagraph);
  }

  return result.join("\n\n").trim();
}

export function cleanupStructuredText(text, options = {}) {
  const detectHeadings = options.detectHeadings !== false;
  const lines = collapseWhitespace(text).split("\n");

  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

  const normalized = [];
  let previousLineEmpty = false;

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      if (!previousLineEmpty) {
        normalized.push("");
        previousLineEmpty = true;
      }
      continue;
    }

    previousLineEmpty = false;
    normalized.push(
      detectHeadings && isLikelyHeading(trimmed) ? `### ${trimmed}` : trimmed,
    );
  }

  return joinLinesIntelligently(normalized);
}

export function isLikelyNaturalText(text) {
  const value = String(text || "").trim();
  if (value.length < 10) return false;

  const letters = Array.from(value).filter((char) =>
    /[A-Za-zА-Яа-яЁё]/.test(char),
  ).length;
  const spaces = (value.match(/\s/gu) || []).length;
  const codeChars = (value.match(/[{}\[\]<>=;:/\\]/gu) || []).length;

  if (letters <= value.length / 3) return false;
  if (spaces === 0 && value.length >= 30) return false;
  if (codeChars >= value.length / 4) return false;

  return true;
}

export function filterSimilarStrings(strings) {
  const result = [];
  for (const item of Array.isArray(strings) ? strings : []) {
    const value = String(item || "").trim();
    if (!value) continue;
    const duplicate = result.some(
      (existing) => existing.includes(value) || value.includes(existing),
    );
    if (!duplicate) {
      result.push(value);
    }
  }
  return result;
}

export function stripHtmlToText(html) {
  return collapseWhitespace(
    decodeBasicEntities(String(html || "").replace(/<[^>]+>/gu, " ")),
  ).trim();
}
