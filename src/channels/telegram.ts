import { Telegraf, Context } from "telegraf";
import { Agent, CrashRecovery } from "../agent.ts";

export function createTelegramChannel(agent: Agent, token: string) {
  const bot = new Telegraf(token);
  const recovery = new CrashRecovery((agent as any).config?.memory?.path || "./data/velo.db");
  
  // Mark clean on shutdown
  const cleanup = () => {
    recovery.markClean();
    recovery.close();
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("beforeExit", cleanup);

  bot.on("text", async (ctx: Context) => {
    const message = ctx.message?.text;
    if (!message) return;

    // Use Telegram user ID as session
    const userId = ctx.from?.id?.toString() || "unknown";
    const sessionId = `telegram:${userId}`;
    agent.setSession(sessionId);

    // Handle /memory command
    if (message === "/memory") {
      await ctx.reply(agent.getMemoryStatus());
      return;
    }

    // Handle /clear command
    if (message === "/clear") {
      agent.clearSession(sessionId);
      await ctx.reply("✓ Conversation history cleared.");
      return;
    }

    // Handle /recover command
    if (message === "/recover") {
      const crashed = recovery.getCrashed();
      if (crashed.length === 0) {
        await ctx.reply("✓ No crashed sessions to recover.");
      } else {
        await ctx.reply(`Found ${crashed.length} crashed sessions. Last input: "${crashed[0]?.last_input?.slice(0, 30) || "(none)"}"`);
      }
      return;
    }

    // Handle /tools command
    if (message === "/tools") {
      const skills = Array.from((agent as any).skills?.keys?.() || []);
      await ctx.reply(`I have ${skills.length} tools available:\n${skills.slice(0, 20).join(", ")}${skills.length > 20 ? "..." : ""}`);
      return;
    }

    // Save checkpoint before processing (for crash recovery)
    recovery.save(sessionId, message);

    // Show typing indicator
    await ctx.sendChatAction("typing");

    try {
      console.log(`[Telegram] Processing: "${message.slice(0, 50)}..."`);
      const response = await agent.process(message);
      console.log(`[Telegram] Response generated (${response.length} chars)`);
      
      // Mark clean after successful processing
      recovery.markClean(sessionId);
      
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
      // Mark as crashed on error
      recovery.markCrashed(sessionId);
      try {
        await ctx.reply("Sorry, I encountered an error processing your request. Use /recover to see crash details.");
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