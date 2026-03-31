import { Telegraf, Context } from "telegraf";
import { Agent } from "../agent.ts";

export function createTelegramChannel(agent: Agent, token: string) {
  const bot = new Telegraf(token);

  bot.on("text", async (ctx: Context) => {
    const message = ctx.message?.text;
    if (!message) return;

    // Use Telegram user ID as session
    const userId = ctx.from?.id?.toString() || "unknown";
    agent.setSession(`telegram:${userId}`);

    // Handle /memory command
    if (message === "/memory") {
      await ctx.reply(agent.getMemoryStatus());
      return;
    }

    // Handle /clear command
    if (message === "/clear") {
      agent.clearSession(`telegram:${userId}`);
      await ctx.reply("✓ Conversation history cleared.");
      return;
    }

    // Show typing indicator
    await ctx.sendChatAction("typing");

    try {
      const response = await agent.process(message);
      
      // Telegram has 4096 char limit
      if (response.length > 4000) {
        const chunks = response.match(/.{1,4000}/g) || [];
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      } else {
        await ctx.reply(response);
      }
    } catch (err) {
      console.error("[Telegram] Error:", err);
      await ctx.reply("Sorry, I encountered an error processing your request.");
    }
  });

  return {
    start: () => {
      console.log("[Telegram] Bot started");
      bot.launch();
      return bot;
    },
    stop: () => {
      bot.stop("shutdown");
    },
  };
}