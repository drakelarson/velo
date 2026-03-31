import * as crypto from "crypto";
import type { Skill } from "../../src/types.ts";
export default {
  name: "password_gen",
  description: "Generate secure password",
  async execute(args: Record<string, unknown>) {
    const length = Number(args.length) || 16;
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    const password = Array.from(crypto.randomBytes(length)).map(b => chars[b % chars.length]).join("");
    return `Password (${length} chars): ${password}`;
  },
} as Skill;