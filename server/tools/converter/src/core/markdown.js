export function tableToMarkdown(rows) {
  const normalized = rows
    .map((row) => row.map((cell) => sanitizeCell(cell)))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (normalized.length === 0) {
    return "";
  }

  const width = Math.max(...normalized.map((row) => row.length));
  const padded = normalized.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")]);
  const header = padded[0];
  const body = padded.slice(1);
  const separator = Array(width).fill("---");

  return [header, separator, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

export function sanitizeCell(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, "<br>")
    .replace(/\|/g, "\\|")
    .trim();
}

export function dedentParagraphs(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function appendImageText(markdown, images) {
  const withText = images.filter((image) => image.extractedText);

  if (withText.length === 0) {
    return markdown;
  }

  const sections = withText.map(
    (image) => `### ${image.originalPath}\n\n${dedentParagraphs(image.extractedText)}`
  );

  return `${markdown}\n\n---\n\n## Extracted Text from Images\n\n${sections.join("\n\n")}`;
}
