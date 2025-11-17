import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { suppressEverything } from "./index.js";
import {
  compile,
  NodeHost,
  resolveCompilerOptions,
  formatTypeSpec,
} from "@typespec/compiler";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("suppressEverything", () => {
  let testDir: string;
  let testFilePath: string;

  beforeEach(() => {
    // Use a fixtures directory in the project for testing
    const projectRoot = resolve(__dirname, "..", "..");
    testDir = join(projectRoot, "test-fixtures");
    testFilePath = join(testDir, "test.tsp");

    // Create test directory if it doesn't exist
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test file
    if (existsSync(testFilePath)) {
      rmSync(testFilePath);
    }
  });

  it("should add suppress directives to TypeSpec model and properties", async () => {
    const inputTypeSpec = `namespace OpenAI;

model Foo {
  message: string;
}
`;

    const expectedOutput = `namespace OpenAI;

#suppress "@azure-tools/typespec-azure-core/documentation-required" "Auto-suppressed warnings non-applicable rules during import."
model Foo {
  #suppress "@azure-tools/typespec-azure-core/documentation-required" "Auto-suppressed warnings non-applicable rules during import."
  message: string;
}
`;

    // Write the test TypeSpec file
    writeFileSync(testFilePath, inputTypeSpec);

    // Compile the TypeSpec program with linting rules
    const [options] = await resolveCompilerOptions(NodeHost, {
      cwd: testDir,
      entrypoint: testFilePath,
      overrides: {
        linter: {
          extends: ["@azure-tools/typespec-azure-rulesets/data-plane"],
        },
      },
    });

    const program = await compile(NodeHost, testFilePath, options);

    // Apply suppressions
    await suppressEverything(program, {
      message: "Auto-suppressed warnings non-applicable rules during import.",
    });

    // Format the file
    const sourceCode = await NodeHost.readFile(testFilePath);
    const formattedSource = await formatTypeSpec(sourceCode.text);
    await NodeHost.writeFile(testFilePath, formattedSource);

    // Read the modified file
    const result = readFileSync(testFilePath, "utf-8");

    // Verify the output matches expected
    expect(result.trim()).toBe(expectedOutput.trim());
  });
});
