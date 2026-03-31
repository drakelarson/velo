import type { Skill } from "../../src/types.ts";
export default {
  name: "reddit_hot",
  description: "Get hot Reddit posts",
  async execute(args: Record<string, unknown>) {
    const subreddit = args.subreddit || args.args || "all";
    try {
      const res = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=5`, { headers: { "User-Agent": "Velo/1.0" } });
      const data = await res.json() as any;
      return data.data.children.map((c: any, i: number) => `${i+1}. ${c.data.title.slice(0,80)}\n   ${c.data.score} pts`).join("\n\n");
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;