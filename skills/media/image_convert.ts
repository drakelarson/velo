import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "image_convert",
  description: "Convert image format",
  async execute(args: Record<string, unknown>) {
    const input = args.input || args.args || "";
    const output = args.output || "";
    if (!input || !output) return "Usage: image_convert input=<file> output=<file>";
    try {
      execSync(`convert "${input}" "${output}"`);
      return `Converted: ${input} -> ${output}`;
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
