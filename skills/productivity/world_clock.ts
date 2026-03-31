import type { Skill } from "../../src/types.ts";
export default {
  name: "world_clock",
  description: "Get time in multiple timezones",
  async execute(args: Record<string, unknown>) {
    const zones = (args.zones as string || "UTC,America/New_York,Europe/London,Asia/Tokyo").split(",");
    const now = new Date();
    return zones.map(z => `${z}: ${now.toLocaleString("en-US", { timeZone: z.trim(), hour: "2-digit", minute: "2-digit" })}`).join("\n");
  },
} as Skill;
