import { validateDiscoveredFormulasOnServer } from "./validate-formulas.js";
import { validateDiscoveredAIProvidersOnServer } from "./validate-ai-providers.js";
import "../../api/ai/index.js";
import "../../api/files/index.js";
import "../../api/settings/index.js";
import "../../api/sheets/index.js";

const formulaHashes = validateDiscoveredFormulasOnServer();
console.log("[formulas] registry.validated", { count: formulaHashes.length, files: formulaHashes });
const providerHashes = validateDiscoveredAIProvidersOnServer();
console.log("[providers] registry.validated", { count: providerHashes.length, files: providerHashes });
