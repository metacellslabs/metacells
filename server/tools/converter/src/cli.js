import fs from "node:fs/promises";
import path from "node:path";

import { ConversionError, FileConverter, FileFormat } from "./core/file-converter.js";

export async function runCli(argv) {
  const command = argv[0];

  if (!command) {
    throw new ConversionError("Missing expected argument '<input-file>'", "missing_argument");
  }

  if (command === "formats") {
    const { flags } = parseFlags(argv.slice(1));
    printFormats(Boolean(flags.all));
    return;
  }

  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  const inputFile = command === "convert" ? argv[1] : command;
  const args = command === "convert" ? argv.slice(2) : argv.slice(1);

  if (!inputFile) {
    throw new ConversionError("Missing expected argument '<input-file>'", "missing_argument");
  }

  const { flags } = parseFlags(args);
  const converter = new FileConverter();
  const result = await converter.convert({
    path: inputFile,
    imageTags: flags.imageTags
  });

  if (flags.stdout) {
    process.stdout.write(`${result.markdown}\n`);
  } else {
    const outputPath = flags.output
      ? path.resolve(process.cwd(), flags.output)
      : path.resolve(path.dirname(inputFile), result.suggestedName);
    await fs.writeFile(outputPath, result.markdown, "utf8");
    if (flags.verbose) {
      process.stdout.write(`Output: ${outputPath}\n`);
    }
  }

  if (flags.imagesJson) {
    process.stdout.write(`${FileConverter.imagesToJSON(result.images)}\n`);
  }

  if (flags.verbose && result.images.length > 0) {
    process.stdout.write(`Found ${result.images.length} images\n`);
  }
}

function parseFlags(argv) {
  const flags = {
    output: null,
    imageTags: [],
    imagesJson: false,
    stdout: false,
    verbose: false,
    all: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "-o":
      case "--output":
        flags.output = argv[index + 1];
        index += 1;
        break;
      case "-t":
      case "--image-tags":
      case "--tag":
        flags.imageTags.push(argv[index + 1]);
        index += 1;
        break;
      case "--images-json":
        flags.imagesJson = true;
        break;
      case "-s":
      case "--stdout":
        flags.stdout = true;
        break;
      case "-v":
      case "--verbose":
        flags.verbose = true;
        break;
      case "--all":
      case "-a":
        flags.all = true;
        break;
      case "--version":
        process.stdout.write("1.0.0\n");
        process.exit(0);
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith("-")) {
          throw new ConversionError(`Unknown option: ${arg}`, "unknown_option");
        }
    }
  }

  return { flags };
}

function printFormats(showAll) {
  process.stdout.write("Supported file formats:\n\n");
  for (const format of FileFormat.allCases) {
    if (showAll || FileFormat.isSupported(format)) {
      const status = FileFormat.isSupported(format) ? "✓" : "○";
      process.stdout.write(`  ${status} .${format} - ${FileFormat.description(format)}\n`);
    }
  }
  if (!showAll) {
    process.stdout.write("\nUse --all to show formats not yet implemented\n");
  }
}

function printHelp() {
  process.stdout.write(`OVERVIEW: Convert documents to Markdown for LLM processing

USAGE: file-converter <subcommand>

SUBCOMMANDS:
  convert <input-file>    Convert a file to Markdown
  formats                 List supported file formats

OPTIONS:
  -o, --output <output>   Output file path
  -t, --image-tags <tag>  Tags for important images
  --images-json           Output image metadata JSON
  -s, --stdout            Print markdown to stdout
  -v, --verbose           Verbose output
  -h, --help              Show help information
  --version               Show the version
`);
}
