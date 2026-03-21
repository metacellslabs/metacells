const FORMAT_DEFINITIONS = [
  ["xlsx", "Excel Workbook", true],
  ["docx", "Word Document", true],
  ["odt", "OpenDocument Text", true],
  ["pdf", "PDF Document", true],
  ["pptx", "PowerPoint Presentation", true],
  ["pages", "Apple Pages Document", true],
  ["numbers", "Apple Numbers Spreadsheet", true],
  ["key", "Apple Keynote Presentation", true],
  ["rtf", "Rich Text Format", true],
  ["epub", "EPUB eBook", true],
  ["html", "HTML Document", true],
  ["htm", "HTML Document", true],
  ["png", "PNG Image", true],
  ["jpg", "JPEG Image", true],
  ["jpeg", "JPEG Image", true],
  ["heic", "HEIC Image", true],
  ["heif", "HEIC Image", true],
  ["tiff", "TIFF Image", true],
  ["tif", "TIFF Image", true],
  ["bmp", "Bitmap Image", true],
  ["gif", "GIF Image", true],
  ["webp", "WebP Image", true]
];

const IMAGE_FORMATS = new Set([
  "png",
  "jpg",
  "jpeg",
  "heic",
  "heif",
  "tiff",
  "tif",
  "bmp",
  "gif",
  "webp"
]);

export class FileFormat {
  static allCases = FORMAT_DEFINITIONS.map(([extension]) => extension);

  static implementedExtensions = FORMAT_DEFINITIONS.filter(([, , implemented]) => implemented).map(
    ([extension]) => extension
  );

  static supportedExtensions = [...this.implementedExtensions];

  static supportedImageExtensions = [...IMAGE_FORMATS];

  static from(pathLike) {
    const extension = String(pathLike).split(".").pop()?.toLowerCase();
    return this.allCases.includes(extension) ? extension : null;
  }

  static description(format) {
    return FORMAT_DEFINITIONS.find(([extension]) => extension === format)?.[1] ?? format;
  }

  static isSupported(format) {
    return this.implementedExtensions.includes(format);
  }

  static isImplemented(format) {
    return this.isSupported(format);
  }

  static isImage(format) {
    return IMAGE_FORMATS.has(format);
  }
}
