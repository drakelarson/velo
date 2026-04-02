import type { Skill } from "../../src/types.ts";

export default {
  name: "cron",
  description: "Manage autonomous scheduled tasks. Usage: cron <action> [args]\n\nActions:\n  cron list                    - Show all scheduled tasks\n  cron add <name> <interval> <prompt>  - Add a task (e.g. cron add news 1h \"Summarize top AI news\")\n  cron remove <name>          - Remove a task\n  cron run <name>             - Run a task immediately\n\nIntervals: 10s, 5m, 1h, 6h, 1d",
  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action || args.args || "").trim();
    const parts = action.split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    // This skill is informational - actual scheduling is handled by the Scheduler class
    // which is configured via config.toml or managed by the agent's internal scheduler

    if (!cmd || cmd === "list") {
      return `⏰ **Cron Tasks**\n\nTasks are configured in ~/.velo/config.toml under [scheduler.tasks]\n\nExample config:\n[[scheduler.tasks]]\nname = \"daily_summary\"\ninterval = \"24h\"\nprompt = \"Summarize today's work and save key findings\"\n\nTo add a task, edit ~/.velo/config.toml and restart the bot.`;
    }

    if (cmd === "add") {
      return `📝 To add a scheduled task, edit ~/.velo/config.toml:\n\n[[scheduler.tasks]]\nname = \"${parts[1] || '<name>'}\"\ninterval = \"${parts[2] || '<interval>'}\"\nprompt = \"${parts.slice(3).join(" ") || "<prompt>"}\"\n\nThen restart the bot.`;
    }

    if (cmd === "remove") {
      return `🗑️ To remove a task, delete it from ~/.velo/config.toml and restart the bot.`;
    }

    if (cmd === "run") {
      return `▶️ To run a task immediately, use: /run ${parts[1] || '<task_name>'}\n\nOr tell me to "run [task name]" directly and I'll execute it.`;
    }

    return `⏰ Unknown cron command. Use: cron list, cron add, cron remove, cron run`;
  },
} as Skill;
