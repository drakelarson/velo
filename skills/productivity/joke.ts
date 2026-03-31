import type { Skill } from "../../src/types.ts";
export default {
  name: "joke",
  description: "Get random joke",
  async execute() {
    try {
      const res = await fetch("https://official-joke-api.appspot.com/random_joke");
      const data = await res.json() as any;
      return `${data.setup}\n\n${data.punchline}`;
    } catch { return "Why do programmers prefer dark mode? Because light attracts bugs!"; }
  },
} as Skill;
