import type { Skill } from "../../src/types.ts";
export default {
  name: "countdown",
  description: "Countdown to a date/event",
  async execute(args: Record<string, unknown>) {
    const target = args.date || args.args || "";
    if (!target) return "No target date";
    try {
      const targetDate = new Date(target);
      const now = new Date();
      const diff = targetDate.getTime() - now.getTime();
      if (diff < 0) return "Date has passed";
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      return `${days} days, ${hours} hours until ${target}`;
    } catch { return "Invalid date format"; }
  },
} as Skill;
