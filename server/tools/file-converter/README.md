# SuperFoldersFileConverter

A Swift library and CLI tool for converting documents and images to Markdown format, optimized for LLM processing. Includes Vision-based image analysis for object detection.

## Features

### Document Conversion

- **Excel (.xlsx)**
- **Word (.docx)**
- **OpenDocument (.odt)**
- **PDF**
- **PowerPoint (.pptx)**
- **HTML (.html, .htm)**
- **Keynotes**
- **Numbers**
- **Pages**
- **RTF**
- **EPUB**

### Image Analysis (Apple Vision)

- **Supported formats:** PNG, JPEG, HEIC, HEIF, TIFF, BMP, GIF, WebP
- **Object detection:** Classifies images and detects charts, graphs, tables, text, faces, barcodes
- **Smart extraction:** Automatically exports important images (matching specified tags) to temp folder
- **Rich metadata:** Extracts dimensions, format, color space, DPI, EXIF data, camera info

## Installation

### Swift Package Manager

Add to your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/VladimirTalyzin/SuperFoldersFileConverter.git", from: "1.0.0")
]
```

### CLI Installation

```bash
git clone https://github.com/VladimirTalyzin/SuperFoldersFileConverter.git
cd SuperFoldersFileConverter
swift build -c release
cp .build/release/file-converter /usr/local/bin/
```

## Usage

### As a Library

#### Basic Document Conversion

```swift
import SuperFoldersFileConverter

let converter = FileConverter()

// Simple conversion
let result = try await converter.convert(path: "/path/to/file.xlsx")
print(result.markdown)
```

#### With Image Tags (for Excel files with embedded images)

```swift
// Convert with image analysis - images matching tags are exported to temp folder
let result = try await converter.convert(
    path: "/path/to/spreadsheet.xlsx",
    imageTags: ["chart", "graph", "diagram"]
)

// Access conversion result
print(result.markdown)

// Check detected images
for image in result.images {
    print("Image: \(image.originalPath)")
    print("  Format: \(image.format ?? "unknown")")
    print("  Dimensions: \(image.width ?? 0) × \(image.height ?? 0)")
    print("  Objects: \(image.detectedObjects.joined(separator: ", "))")
    print("  Is Important: \(image.isImportant)")

    if image.isImportant, let path = image.exportedPath {
        print("  Exported to: \(path)")
    }

    if let metadata = image.metadata {
        print("  Metadata: \(metadata.toDictionary())")
    }
}
```

#### Image Analysis Only

```swift
// Analyze a standalone image file
let result = try await converter.convert(path: "/path/to/image.png")

// Get detected objects and metadata
if let imageInfo = result.images.first {
    print("Format: \(imageInfo.format ?? "unknown")")
    print("Size: \(imageInfo.width ?? 0) × \(imageInfo.height ?? 0)")
    print("Objects: \(imageInfo.detectedObjects)")
    print("Is Important: \(imageInfo.isImportant)")
}
```

#### Get Result as JSON

```swift
// Convert result to JSON format for API responses
let result = try await converter.convert(path: "/path/to/file.xlsx", imageTags: ["chart"])
let json = try FileConverter.resultToJSON(result)
print(json)
```

**Output format:**

```json
{
  "markdown": "## Sheet1\n...",
  "images": {
    "picture1": {
      "objects": ["chart", "graph", "rectangle", "text"],
      "isImportant": true,
      "width": 800,
      "height": 600,
      "format": "PNG",
      "file": "/var/folders/.../UUID.png",
      "metadata": {
        "colorSpace": "RGB",
        "hasAlpha": true,
        "dpi": 72.0
      }
    },
    "picture2": {
      "objects": ["flower", "plant", "outdoor"],
      "isImportant": false,
      "width": 1920,
      "height": 1080,
      "format": "JPEG"
    }
  }
}
```

#### Check Supported Formats

```swift
// Get all supported file extensions
let extensions = FileConverter.supportedExtensions
// ["xlsx", "xls", "docx", "doc", "odt", "pdf", "pptx", "ppt", "png", "jpg", ...]

// Get only fully implemented extensions
let implemented = FileConverter.implementedExtensions
// ["xlsx", "png", "jpg", "jpeg", "heic", ...]

// Get image extensions only
let images = FileConverter.supportedImageExtensions
// ["png", "jpg", "jpeg", "heic", "heif", "tiff", "tif", "bmp", "gif", "webp"]

// Check if a file is supported
let isSupported = FileConverter.isSupported("/path/to/file.xlsx")

// Check if a file is an image
let isImage = FileConverter.isImage("/path/to/photo.jpg")
```

#### Debug Mode (for Excel)

```swift
// Get detailed debug information about Excel conversion
let (result, debug) = try await converter.convertWithDebug(url: fileURL)

if let debugInfo = debug {
    print("Sheets: \(debugInfo.sheets.count)")
    print("Total rows: \(debugInfo.totalInputRows)")

    for sheet in debugInfo.sheets {
        print("\(sheet.name): \(sheet.rowCount) rows, \(sheet.cellCount) cells")
    }
}
```

### CLI Usage

```bash
# Convert file to markdown
file-converter input.xlsx

# Specify output file
file-converter input.xlsx -o output.md

# Print to stdout
file-converter input.xlsx --stdout

# With image tags (images matching these tags are exported)
file-converter input.xlsx -t chart -t graph -t diagram

# Get full JSON output (markdown + images)
file-converter input.xlsx --json

# Get images JSON only
file-converter input.xlsx --images-json

# Analyze image file
file-converter photo.png

# List supported formats
file-converter formats

# List all formats (including not implemented)
file-converter formats --all
```

## Image Detection

The Vision analyzer detects various objects and features in images:

### Classification

- General object classification (animals, plants, objects, scenes)
- Confidence threshold: 0.3

### Structure Detection

- **Rectangles:** Charts, tables, documents (when multiple rectangles detected)
- **Text:** Documents with text content
- **Data:** Numeric content (potential charts/graphs)

### Special Detection

- **Faces:** Person detection, group photos
- **Barcodes:** QR codes, various barcode formats

### Image Info Fields

Each image in the response includes:

| Field         | Type       | Description                                     |
| ------------- | ---------- | ----------------------------------------------- |
| `objects`     | `[String]` | List of detected objects/labels                 |
| `isImportant` | `Bool`     | Whether image matches any of the specified tags |
| `width`       | `Int`      | Image width in pixels                           |
| `height`      | `Int`      | Image height in pixels                          |
| `format`      | `String`   | Image format name (e.g., "JPEG", "PNG")         |
| `file`        | `String?`  | Path to exported temp file (only if important)  |
| `metadata`    | `Object?`  | Additional image metadata (if available)        |

### Metadata Fields

When available, metadata includes:

| Field              | Type     | Description                       |
| ------------------ | -------- | --------------------------------- |
| `colorSpace`       | `String` | Color model (e.g., "RGB", "Gray") |
| `hasAlpha`         | `Bool`   | Whether image has alpha channel   |
| `dpi`              | `Double` | Image resolution in DPI           |
| `orientation`      | `Int`    | EXIF orientation value            |
| `creationDate`     | `String` | Original creation date            |
| `modificationDate` | `String` | Last modification date            |
| `camera`           | `String` | Camera make and model             |
| `software`         | `String` | Software used to create/edit      |

### Example Output

```json
{
  "images": {
    "chart1": {
      "objects": ["chart", "table", "rectangle", "text", "data"],
      "isImportant": true,
      "width": 1024,
      "height": 768,
      "format": "PNG",
      "file": "/var/folders/.../UUID.png",
      "metadata": {
        "colorSpace": "RGB",
        "hasAlpha": false,
        "dpi": 144.0
      }
    },
    "photo1": {
      "objects": ["person", "face", "outdoor", "tree"],
      "isImportant": false,
      "width": 4032,
      "height": 3024,
      "format": "JPEG",
      "metadata": {
        "camera": "Apple iPhone 14 Pro",
        "creationDate": "2024:01:15 10:30:00",
        "dpi": 72.0,
        "orientation": 1
      }
    }
  }
}
```

## Requirements

- macOS 13.0+
- Swift 5.9+
