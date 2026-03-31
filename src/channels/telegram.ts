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

    // Handle /tools command
    if (message === "/tools") {
      const skills = Array.from((agent as any).skills?.keys?.() || []);
      await ctx.reply(`I have ${skills.length} tools available:\n${skills.slice(0, 20).join(", ")}${skills.length > 20 ? "..." : ""}`);
      return;
    }

    // Show typing indicator
    await ctx.sendChatAction("typing");

    try {
      console.log(`[Telegram] Processing: "${message.slice(0, 50)}..."`);
      const response = await agent.process(message);
      console.log(`[Telegram] Response generated (${response.length} chars)`);
      
      // Telegram has 4096 char limit
      if (response.length > 4000) {
        const chunks = response.match(/.{1,4000}/g) || [];
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      } else {
        await ctx.reply(response);
      }
    } catch (err: any) {
      console.error("[Telegram] Error:", err?.message || err);
      console.error(err?.stack);
      try {
        await ctx.reply("Sorry, I encountered an error processing your request.");
      } catch {}
    }
  });

  // Handle all errors
  bot.catch((err: any) => {
    console.error("[Telegram] Bot error:", err?.message || err);
  });

  return {
    start: () => {
      console.log("[Telegram] Bot starting with long polling...");
      // Enable graceful stop
      bot.launch({
        dropPendingUpdates: true, // Clear old updates on restart
      });
      
      // Log when bot is ready
      bot.telegram.getMe().then((botInfo) => {
        console.log(`[Telegram] Connected as @${botInfo.username}`);
      }).catch(console.error);
      
      return bot;
    },
    stop: () => {
      bot.stop("shutdown");
    },
  };
}