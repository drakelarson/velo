import type { Skill } from "../src/types.ts";

export default {
  name: "get_weather",
  description: "Get current weather for a location",
  async execute(args: Record<string, unknown>) {
    const location = args.location || args.args || "unknown";
    // In production, call a real weather API
    return `Weather for ${location}: Sunny, 72°F (mock data - implement real API)`;
  },
} as Skill;