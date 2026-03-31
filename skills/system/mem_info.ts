import * as os from "os";
import type { Skill } from "../../src/types.ts";
function fmt(n: number) { return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`; }
export default {
  name: "mem_info",
  description: "Get memory information",
  async execute() {
    const total = os.totalmem();
    const free = os.freemem();
    return `Total: ${fmt(total)}\nFree: ${fmt(free)}\nUsed: ${fmt(total - free)} (${Math.round((total - free) / total * 100)}%)`;
  },
} as Skill;
