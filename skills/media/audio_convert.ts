import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "audio_convert",
  description: "Convert audio format",
  async execute(args: Record<string, unknown>) {
    const input = args.input || args.args || "";
    const output = args.output || input.replace(/\.\w+$/, ".mp3");
    if (!input) return "No input audio";
    try {
      execSync(`ffmpeg -i "${input}" -q:a 2 "${output}"`, { timeout: 300000 });
      return `Converted: ${input} -> ${output}`;
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
