import type { Skill } from "../../src/types.ts";

export default {
  name: "slack_hello",
  description: "Example skill from velo-plugin-slack",
  async execute(args: Record<string, unknown>): Promise<string> {
    const name = args.name || args.action || "World";
    return `Hello from velo-plugin-slack! This is an example skill.`;
  },
} as Skill;

// You can export multiple skills
export const slack_echo: Skill = {
  name: "slack_echo",
  description: "Echo back the input",
  async execute(args) {
    return JSON.stringify(args, null, 2);
  },
};
