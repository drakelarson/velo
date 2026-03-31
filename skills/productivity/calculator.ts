import type { Skill } from "../../src/types.ts";
export default {
  name: "calculator",
  description: "Perform calculations",
  async execute(args: Record<string, unknown>) {
    const expr = args.expression || args.args || "";
    if (!expr) return "Usage: calculator expression=<math>";
    try {
      const safe = /^[0-9+\-*/().eE\s]+$/;
      if (!safe.test(expr)) return "Invalid expression";
      const result = Function(`"use strict"; return (${expr})`)();
      return `${expr} = ${result}`;
    } catch { return "Calculation error"; }
  },
} as Skill;