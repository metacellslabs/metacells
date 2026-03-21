import fs from "node:fs/promises";
import path from "node:path";

import { ConversionResult } from "./conversion-result.js";
import { ConversionError } from "./errors.js";
import { FileFormat } from "./file-format.js";
import { HtmlConverter } from "../converters/html-converter.js";
import { ImageConverter } from "../converters/image-converter.js";
import { DocxConverter } from "../converters/docx-converter.js";
import { ExcelConverter } from "../converters/excel-converter.js";
import { OdtConverter } from "../converters/odt-converter.js";
import { PptxConverter } from "../converters/pptx-converter.js";
import { PdfConverter } from "../converters/pdf-converter.js";
import { PagesConverter } from "../converters/pages-converter.js";
import { NumbersConverter } from "../converters/numbers-converter.js";
import { KeynoteConverter } from "../converters/keynote-converter.js";
import { RtfConverter } from "../converters/rtf-converter.js";
import { EpubConverter } from "../converters/epub-converter.js";

const CONVERTERS = {
  xlsx: ExcelConverter,
  docx: DocxConverter,
  odt: OdtConverter,
  pdf: PdfConverter,
  pptx: PptxConverter,
  pages: PagesConverter,
  numbers: NumbersConverter,
  key: KeynoteConverter,
  rtf: RtfConverter,
  epub: EpubConverter,
  html: HtmlConverter,
  htm: HtmlConverter,
  png: ImageConverter,
  jpg: ImageConverter,
  jpeg: ImageConverter,
  heic: ImageConverter,
  heif: ImageConverter,
  tiff: ImageConverter,
  tif: ImageConverter,
  bmp: ImageConverter,
  gif: ImageConverter,
  webp: ImageConverter
};

export { FileFormat, ConversionError };

export class FileConverter {
  static supportedExtensions = FileFormat.supportedExtensions;
  static implementedExtensions = FileFormat.implementedExtensions;
  static supportedImageExtensions = FileFormat.supportedImageExtensions;

  static convertHTML(html) {
    return new HtmlConverter().convertString(html);
  }

  static isSupported(filePath) {
    const format = FileFormat.from(filePath);
    return format ? FileFormat.isSupported(format) : false;
  }

  static isImage(filePath) {
    const format = FileFormat.from(filePath);
    return format ? FileFormat.isImage(format) : false;
  }

  static imagesToJSON(images) {
    return JSON.stringify(
      Object.fromEntries(images.map((image) => [image.originalPath, image.toDictionary()])),
      null,
      2
    );
  }

  static resultToJSON(result) {
    return JSON.stringify(
      {
        markdown: result.markdown,
        images: Object.fromEntries(result.images.map((image) => [image.originalPath, image.toDictionary()]))
      },
      null,
      2
    );
  }

  convertHTML(html) {
    return FileConverter.convertHTML(html);
  }

  async convert({ path: filePath, url, imageTags = [] }) {
    const resolved = path.resolve(url ? new URL(url).pathname : filePath);

    try {
      await fs.access(resolved);
    } catch {
      throw ConversionError.fileNotFound(resolved);
    }

    const format = FileFormat.from(resolved);
    if (!format) {
      throw ConversionError.unsupportedFormat(path.extname(resolved).replace(/^\./u, ""));
    }

    const Converter = CONVERTERS[format];
    if (!Converter) {
      throw ConversionError.unsupportedFormat(format);
    }

    const converter = new Converter();
    const result = await converter.convert({ filePath: resolved, imageTags });

    return result instanceof ConversionResult
      ? result
      : new ConversionResult({
          fileName: path.basename(resolved),
          markdown: result.markdown,
          images: result.images ?? []
        });
  }
}
