import path from "node:path";

import * as XLSX from "xlsx";

import { ConversionResult } from "../core/conversion-result.js";
import { tableToMarkdown } from "../core/markdown.js";
import { extractZipImages } from "./shared.js";

export class ExcelConverter {
  async convert({ filePath, imageTags = [] }) {
    const workbook = XLSX.readFile(filePath, { cellDates: true, raw: false });
    const sections = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false });
      const markdownTable = tableToMarkdown(rows);

      if (markdownTable) {
        sections.push(`## ${sheetName}\n\n${markdownTable}`);
      }
    }

    const images = await extractZipImages({ filePath, prefixes: ["xl/media/"], imageTags });

    return new ConversionResult({
      fileName: path.basename(filePath),
      markdown: sections.join("\n\n---\n\n").trim(),
      images
    });
  }
}
