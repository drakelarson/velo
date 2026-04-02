import type { Skill } from "../../src/types.ts";
export default {
  name: "product_hunt",
  description: "Get Product Hunt posts",
  async execute() {
    try {
      const res = await fetch("https://www.producthunt.com/feed");
      const text = await res.text();
      const titles = text.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/g)?.slice(1, 11) || [];
      return "Product Hunt Today:\n" + titles.map((t: string, i: number) => `${i+1}. ${t.replace(/<.+?>/g, "")}`).join("\n");
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
