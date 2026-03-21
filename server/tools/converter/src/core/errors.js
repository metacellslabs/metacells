export class ConversionError extends Error {
  constructor(message, code = "conversion_failed") {
    super(message);
    this.name = "ConversionError";
    this.code = code;
  }

  static unsupportedFormat(extension) {
    return new ConversionError(`Unsupported file format: ${extension}`, "unsupported_format");
  }

  static fileNotFound(path) {
    return new ConversionError(`File not found: ${path}`, "file_not_found");
  }

  static invalidFile(reason) {
    return new ConversionError(`Invalid file: ${reason}`, "invalid_file");
  }
}
