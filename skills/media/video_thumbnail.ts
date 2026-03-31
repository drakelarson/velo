import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "video_thumbnail",
  description: "Extract video thumbnail",
  async execute(args: Record<string, unknown>) {
    const input = args.input || args.args || "";
    const output = args.output || input.replace(/\.\w+$/, ".jpg");
    const time = args.time || "00:00:01";
    if (!input) return "No input video";
    try {
      execSync(`ffmpeg -i "${input}" -ss ${time} -vframes 1 "${output}"`);
      return `Thumbnail: ${output}`;
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
