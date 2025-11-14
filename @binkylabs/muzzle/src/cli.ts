import { resolvePath } from "@typespec/compiler";
import { parseTypeSpecAndSuppressEverything, type SuppressionOptions } from "./index.js";

function showHelp() {
  console.log(`
Usage: muzzle <entrypoint> [options]

Important:
  The rule sets package must be installed in your project or globally for muzzle to work correctly.

Arguments:
  <entrypoint>              Path to the TypeSpec entry file

Options:
  -r, --rule-set <ruleset>  Specify a rule set to apply (can be used multiple times)
  -m, --message <message>   Suppression message to add to all suppressions
  -h, --help                Show this help message

Examples:
  muzzle main.tsp --rule-set "@typespec/http/recommended"
  muzzle main.tsp -r "@typespec/http/recommended" -r "@typespec/openapi/recommended"
  muzzle main.tsp -r "@typespec/http/recommended" -m "Suppressing existing violations"
`);
}

function parseCliArguments(args: string[]): SuppressionOptions {
  let entryPoint: string | undefined;
  const ruleSets: `${string}/${string}`[] = [];
  let message: string | undefined;

  for (let i = 0; i < args.length; ) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      showHelp();
      process.exit(0);
    } else if (arg === "--rule-set" || arg === "-r") {
      const ruleSet = args[i + 1];
      if (!ruleSet || ruleSet.startsWith("-")) {
        console.error(`Error: ${arg} requires a value`);
        process.exit(1);
      }
      ruleSets.push(ruleSet as `${string}/${string}`);
      i += 2; // Skip both the flag and its value
    } else if (arg === "--message" || arg === "-m") {
      const messageValue = args[i + 1];
      if (!messageValue || messageValue.startsWith("-")) {
        console.error(`Error: ${arg} requires a value`);
        process.exit(1);
      }
      message = messageValue;
      i += 2; // Skip both the flag and its value
    } else if (arg.startsWith("-")) {
      console.error(`Error: Unknown argument: ${arg}`);
      process.exit(1);
    } else {
      // First non-flag argument is the entry point
      if (!entryPoint) {
        entryPoint = resolvePath(arg);
      }
      i++;
    }
  }

  return { entryPoint: entryPoint || "", ruleSets, message };
}

const options = parseCliArguments(process.argv.slice(2));

try {
  await parseTypeSpecAndSuppressEverything(options);
} catch (err) {
  console.error("An error occurred while parsing TypeSpec:", err);
  process.exit(1);
}
