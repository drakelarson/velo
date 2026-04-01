import type { Skill } from "../../src/types.ts";
export default {
  name: "webhook_create",
  description: "Create webhook endpoint info",
  async execute(args: Record<string, unknown>) {
    const name = args.action || args.name || args.args || "webhook";
    return `Webhook endpoint: /api/${name}\nMethod: POST\nBody: { "data": "your payload" }\n\nConfigure in your velo.toml`;
  },
} as Skill;
