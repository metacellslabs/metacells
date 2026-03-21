import path from "node:path";

import { ConversionResult } from "../core/conversion-result.js";
import { analyzeImageFile } from "./shared.js";

export class ImageConverter {
  async convert({ filePath, imageTags = [] }) {
    const image = await analyzeImageFile(filePath, imageTags);
    const lines = [
      `# Image: ${path.basename(filePath)}`,
      "",
      `**Format:** ${image.format ?? "unknown"}`,
      `**Dimensions:** ${image.width ?? "unknown"} × ${image.height ?? "unknown"}`,
      `**Detected objects:** ${image.detectedObjects.length ? image.detectedObjects.join(", ") : "none"}`
    ];

    if (image.extractedText) {
      lines.push("", "## Extracted Text", "", image.extractedText);
    }

    return new ConversionResult({
      fileName: path.basename(filePath),
      markdown: lines.join("\n"),
      images: [image]
    });
  }
}
