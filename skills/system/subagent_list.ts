import type { Skill } from "../src/types.ts";

export default {
  name: "subagent_list"
    category: "System",,
  description: "List all active subagents and their status. Shows running, completed, and failed subagents.",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    // This would check the actual subagent registry
    return `Subagent Registry

Active subagents are tracked per-session.
Use 'velo subagent' CLI command for full management.

In conversation, you can spawn subagents for:
  - Parallel research tasks
  - Background file processing  
  - Independent analysis work
  - Test generation

To spawn: subagent_spawn <task>
To check: subagent_status <id>`;
  },
} as Skill;