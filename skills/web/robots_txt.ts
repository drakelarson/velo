import type { Skill } from "../../src/types.ts";
export default {
  name: "robots_txt",
  description: "Read robots.txt for a domain",
  async execute(args: Record<string, unknown>) {
    const domain = args.domain || args.args || "";
    if (!domain) return "No domain";
    try {
      const res = await fetch(`https://${domain}/robots.txt`);
      return await res.text();
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
