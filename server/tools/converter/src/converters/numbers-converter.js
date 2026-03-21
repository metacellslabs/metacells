import path from "node:path";

import { ConversionResult } from "../core/conversion-result.js";
import { extractZipImages } from "./shared.js";
import { extractIWorkText } from "./pages-converter.js";

export class NumbersConverter {
  async convert({ filePath, imageTags = [] }) {
    const images = await extractZipImages({
      filePath,
      prefixes: ["Data/", "QuickLook/Thumbnail.", "QuickLook/Preview."],
      imageTags
    });

    return new ConversionResult({
      fileName: path.basename(filePath),
      markdown: await extractIWorkText(filePath, "numbers"),
      images
    });
  }
}
