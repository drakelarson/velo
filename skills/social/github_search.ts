import type { Skill } from "../../src/types.ts";
export default {
  name: "github_search",
  description: "Search GitHub repositories",
  async execute(args: Record<string, unknown>) {
    const query = args.query || args.args || "";
    if (!query) return "No search query";
    try {
      const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=10`);
      const data = await res.json() as any;
      return data.items.map((r: any, i: number) => `${i+1}. ${r.full_name} (${r.stargazers_count} stars)\n   ${r.description || ""}`).join("\n\n");
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
