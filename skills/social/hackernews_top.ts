import type { Skill } from "../../src/types.ts";
export default {
  name: "hackernews_top",
  description: "Get top Hacker News stories",
  async execute(args: Record<string, unknown>) {
    const limit = Number(args.limit) || 5;
    try {
      const idsRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
      const ids = await idsRes.json() as number[];
      const stories = await Promise.all(ids.slice(0, limit).map(id => 
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json())
      ));
      return stories.map((s: any, i) => `${i+1}. ${s.title}\n   ${s.url || "No URL"}`).join("\n\n");
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;