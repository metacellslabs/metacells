import path from "node:path";

import { ConversionResult } from "../core/conversion-result.js";
import { readZipEntries, listZipFiles, readZipText } from "../core/archive.js";
import { cleanupStructuredText, decodeBasicEntities } from "../core/text-cleanup.js";
import { extractZipImages } from "./shared.js";

export class PptxConverter {
  async convert({ filePath, imageTags = [] }) {
    const zip = await readZipEntries(filePath);
    const slideFiles = listZipFiles(zip, (name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );
    const sections = [];

    for (const [index, slide] of slideFiles.entries()) {
      const xml = await readZipText(zip, slide.name);
      if (!xml) {
        continue;
      }

      const textRuns = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/gu)].map((match) => decodeXml(match[1]));
      if (textRuns.length > 0) {
        sections.push(
          `## Slide ${index + 1}\n\n${cleanupStructuredText(textRuns.join("\n"), {
            detectHeadings: false
          })}`
        );
      }
    }

    const images = await extractZipImages({ filePath, prefixes: ["ppt/media/"], imageTags });

    return new ConversionResult({
      fileName: path.basename(filePath),
      markdown: sections.join("\n\n---\n\n"),
      images
    });
  }
}

function decodeXml(value) {
  return decodeBasicEntities(value);
}
