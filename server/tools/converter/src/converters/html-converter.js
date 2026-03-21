import fs from "node:fs/promises";
import path from "node:path";

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

import { ConversionResult } from "../core/conversion-result.js";
import { dedentParagraphs } from "../core/markdown.js";
import { cleanupStructuredText, stripHtmlToText } from "../core/text-cleanup.js";

const turndownService = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
turndownService.use(gfm);

export class HtmlConverter {
  convertString(html) {
    try {
      const markdown = dedentParagraphs(turndownService.turndown(html));
      return cleanupStructuredText(markdown, { detectHeadings: false });
    } catch {
      return stripHtmlToText(html);
    }
  }

  async convert({ filePath }) {
    const buffer = await fs.readFile(filePath);
    const html = String(buffer.toString("utf8") || buffer.toString("latin1") || "");
    return new ConversionResult({
      fileName: path.basename(filePath),
      markdown: this.convertString(html),
      images: []
    });
  }
}
