import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "image_resize",
  description: "Resize image",
  async execute(args: Record<string, unknown>) {
    const input = args.input || args.args || "";
    const output = args.output || input.replace(/\.(\w+)$/, "_resized.$1");
    const size = args.size || "50%";
    if (!input) return "No input image";
    try {
      execSync(`convert "${input}" -resize ${size} "${output}"`);
      return `Resized: ${input} -> ${output} (${size})`;
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
