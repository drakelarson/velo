import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "image_info",
  description: "Get image info",
  async execute(args: Record<string, unknown>) {
    const path = args.path || args.args || "";
    if (!path) return "No image path";
    try {
      return execSync(`identify "${path}"`, { encoding: "utf-8" });
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;