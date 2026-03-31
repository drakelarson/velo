import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "video_info",
  description: "Get video metadata",
  async execute(args: Record<string, unknown>) {
    const path = args.path || args.args || "";
    if (!path) return "No video path";
    try {
      return execSync(`ffprobe -v quiet -show_format -show_streams "${path}" 2>&1 | grep -E "(duration|width|height|codec)"`, { encoding: "utf-8" });
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;