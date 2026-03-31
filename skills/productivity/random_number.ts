import * as crypto from "crypto";
import type { Skill } from "../../src/types.ts";
export default {
  name: "random_number",
  description: "Generate random number",
  async execute(args: Record<string, unknown>) {
    const min = Number(args.min) || 0;
    const max = Number(args.max) || 100;
    const range = max - min;
    const rand = crypto.randomInt(0, range + 1);
    return `Random: ${min + rand}`;
  },
} as Skill;
