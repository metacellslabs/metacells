import path from "node:path";

export class ConversionResult {
  constructor({ fileName, markdown, images = [] }) {
    this.fileName = fileName;
    this.markdown = markdown;
    this.images = images;
  }

  get suggestedName() {
    const parsed = path.parse(this.fileName);
    return `${parsed.name}.md`;
  }
}
