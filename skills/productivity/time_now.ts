import type { Skill } from "../../src/types.ts";
export default {
  name: "time_now",
  description: "Get current time",
  async execute(args: Record<string, unknown>) {
    const tz = args.timezone || args.args || "UTC";
    const date = new Date();
    return `Time in ${tz}: ${date.toLocaleString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "long" })}`;
  },
} as Skill;