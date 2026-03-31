import type { Skill } from "../../src/types.ts";
export default {
  name: "weather_get",
  description: "Get weather for location",
  async execute(args: Record<string, unknown>) {
    const location = args.location || args.args || "New York";
    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=3`);
      return (await res.text()).trim();
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;