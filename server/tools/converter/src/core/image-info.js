export class ImageInfo {
  constructor({
    originalPath,
    suggestedFileName,
    mimeType = null,
    isImportant = false,
    matchedTags = [],
    position = null,
    altText = null,
    width = null,
    height = null,
    detectedObjects = [],
    exportedPath = null,
    format = null,
    metadata = null,
    extractedText = null
  }) {
    this.originalPath = originalPath;
    this.suggestedFileName = suggestedFileName;
    this.mimeType = mimeType;
    this.isImportant = isImportant;
    this.matchedTags = matchedTags;
    this.position = position;
    this.altText = altText;
    this.width = width;
    this.height = height;
    this.detectedObjects = detectedObjects;
    this.exportedPath = exportedPath;
    this.format = format;
    this.metadata = metadata;
    this.extractedText = extractedText;
  }

  toDictionary() {
    const result = {
      objects: this.detectedObjects,
      isImportant: this.isImportant
    };

    if (this.width != null) {
      result.width = this.width;
    }

    if (this.height != null) {
      result.height = this.height;
    }

    if (this.format) {
      result.format = this.format;
    }

    if (this.exportedPath) {
      result.file = this.exportedPath;
    }

    if (this.metadata && Object.keys(this.metadata).length > 0) {
      result.metadata = this.metadata;
    }

    if (this.extractedText) {
      result.text = this.extractedText;
    }

    return result;
  }
}
