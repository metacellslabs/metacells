import path from "node:path";

import { ConversionResult } from "../core/conversion-result.js";
import { readZipEntries, listZipFiles, readZipText } from "../core/archive.js";
import { HtmlConverter } from "./html-converter.js";
import { extractZipImages } from "./shared.js";

export class EpubConverter {
  async convert({ filePath, imageTags = [] }) {
    const zip = await readZipEntries(filePath);
    const htmlConverter = new HtmlConverter();
    const textFiles = listZipFiles(
      zip,
      (name) => /\.(xhtml|html|htm)$/iu.test(name) && !name.includes("nav")
    ).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const sections = [];

    for (const entry of textFiles) {
      const html = await readZipText(zip, entry.name);
      if (!html) {
        continue;
      }
      const markdown = htmlConverter.convertString(html);
      if (markdown) {
        sections.push(markdown);
      }
    }

    const images = await extractZipImages({
      filePath,
      prefixes: ["OEBPS/images/", "images/"],
      imageTags
    });

    return new ConversionResult({
      fileName: path.basename(filePath),
      markdown: sections.join("\n\n---\n\n"),
      images
    });
  }
}
