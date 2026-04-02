import type { Skill } from "../../src/types.ts";
export default {
  name: "devto_articles",
  description: "Get DEV.to articles",
  async execute(args: Record<string, unknown>) {
    const limit = Number(args.limit) || 5;
    try {
      const res = await fetch(`https://dev.to/api/articles?per_page=${limit}`);
      const data = await res.json() as any[];
      return data.map((a, i) => `${i+1}. ${a.title}\n   ${a.user.name} | ${a.positive_reactions_count} reactions`).join("\n\n");
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
