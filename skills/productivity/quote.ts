import type { Skill } from "../../src/types.ts";
const quotes = [
  ["The only way to do great work is to love what you do.", "Steve Jobs"],
  ["Stay hungry, stay foolish.", "Steve Jobs"],
  ["Innovation distinguishes between a leader and a follower.", "Steve Jobs"],
];
export default {
  name: "quote",
  description: "Get random inspirational quote",
  async execute() {
    const [q, a] = quotes[Math.floor(Math.random() * quotes.length)];
    return `"${q}" — ${a}`;
  },
} as Skill;
