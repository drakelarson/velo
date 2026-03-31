import type { Skill } from "../../src/types.ts";
export default {
  name: "date",
  description: "Get current date/time",
  async execute(args: Record<string, unknown>) {
    const fmt = args.format || "iso";
    const now = new Date();
    if (fmt === "iso") return now.toISOString();
    if (fmt === "unix") return Math.floor(now.getTime() / 1000).toString();
    return now.toString();
  },
} as Skill;
