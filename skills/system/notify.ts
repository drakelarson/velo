import type { Skill } from "../../src/types.ts";

export default {
  name: "notify",
  description:
    "Send a message or notification to the user across active channels. Usage: notify <message>. This will attempt to reach the user via Telegram, webhook, or whichever channel is available. Use this to proactively update the user without waiting for them to ask.",

  async execute(args: Record<string, unknown>, context?: { agent?: any }): Promise<string> {
    const message = String(args.action || args.message || args.args || "").trim();
    if (!message) return "Usage: notify <message>";

    const agent = context?.agent;
    if (!agent) {
      return "❌ notify requires an agent context (used within Velo, not standalone)";
    }

    let sent = 0;
    const errors: string[] = [];

    // Try Telegram (send to user's DM)
    if (agent.telegramBot && agent.telegramBot.sendDM) {
      try {
        await agent.telegramBot.sendDM(message);
        sent++;
      } catch (e: any) {
        errors.push(`Telegram: ${e.message}`);
      }
    }

    // Try webhook (send to configured webhook URL)
    if (agent.webhookUrl) {
      try {
        await fetch(agent.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        sent++;
      } catch (e: any) {
        errors.push(`Webhook: ${e.message}`);
      }
    }

    if (sent === 0) {
      return `❌ Could not reach user:\n${errors.join("\n")}`;
    }

    return `✅ Notification sent via ${sent} channel(s).`;
  },
} as Skill;
