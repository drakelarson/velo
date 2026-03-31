import type { Skill } from "../../src/types.ts";
export default {
  name: "url_shorten",
  description: "Shorten URLs using is.gd",
  async execute(args: Record<string, unknown>) {
    const url = args.url || args.args || "";
    if (!url) return "No URL provided";
    try {
      const res = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`);
      const shortUrl = await res.text();
      return shortUrl.startsWith("http") ? `Shortened: ${shortUrl}` : `Error: ${shortUrl}`;
    } catch (err: any) { return `Shorten failed: ${err.message}`; }
  },
} as Skill;