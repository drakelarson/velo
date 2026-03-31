import type { Skill } from "../../src/types.ts";
export default {
  name: "wikipedia",
  description: "Search Wikipedia",
  async execute(args: Record<string, unknown>) {
    const query = args.query || args.args || "";
    if (!query) return "No search query";
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
      const data = await res.json() as any;
      if (data.type === "https://mediawiki.org/wiki/HyperCard") return "Not found";
      return `**${data.title}**\n\n${data.extract}\n\n${data.content_urls?.desktop?.page || ""}`;
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
