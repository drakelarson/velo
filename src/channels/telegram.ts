import { Telegraf, Context } from "telegraf";
import { CrashRecovery } from "../recovery.ts";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "bun";

export function createTelegramChannel(agent: any, token: string) {
  const bot = new Telegraf(token);
  const recovery = new CrashRecovery(agent.config?.memory?.path || "./data/velo.db");
  
  // No premature cleanup - handle cleanup only on explicit shutdown

  // Handle voice messages
  bot.on("voice", async (ctx: Context) => {
    const voice = ctx.message?.voice;
    if (!voice) return;

    const userId = ctx.from?.id?.toString() || "unknown";
    const sessionId = `telegram:${userId}`;
    agent.setSession(sessionId);

    await ctx.reply("🎧 Transcribing voice message...");
    await ctx.sendChatAction("typing");

    try {
      // Get file info
      const fileInfo = await ctx.telegram.getFile(voice.file_id);
      const fileUrl = await ctx.telegram.getFileLink(fileInfo);

      // Download voice file (OGG format)
      const tempDir = path.join(process.cwd(), "temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const oggPath = path.join(tempDir, `${voice.file_id}.ogg`);
      const wavPath = path.join(tempDir, `${voice.file_id}.wav`);

      // Download file
      const response = await fetch(fileUrl.toString());
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(oggPath, Buffer.from(buffer));

      // Convert OGG to WAV using ffmpeg
      const ffmpegResult = spawn({
        cmd: ["ffmpeg", "-y", "-i", oggPath, "-ar", "16000", "-ac", "1", wavPath],
        stdout: "pipe",
        stderr: "pipe",
      });
      await ffmpegResult.exited;

      if (ffmpegResult.exitCode !== 0) {
        throw new Error("Failed to convert audio format");
      }

      // Transcribe using the transcribe skill
      const transcribeSkill = (agent as any).skills?.get("transcribe");
      if (!transcribeSkill) {
        await ctx.reply("❌ Transcription skill not available.");
        return;
      }

      const transcription = await transcribeSkill.execute({ 
        file: wavPath, 
        language: "en",
        model: "tiny" 
      });

      // Clean up temp files
      fs.unlinkSync(oggPath);
      fs.unlinkSync(wavPath);

      // Send transcription
      await ctx.reply(transcription);

      // Now process the transcribed text with the agent
      const transcribedText = transcription.replace(/^[📝\s]*TRANSCRIPTION:?\s*/i, "").trim();
      if (transcribedText && transcribedText.length > 0) {
        recovery.save(sessionId, `[Voice] ${transcribedText}`);
        
        const response = await agent.process(transcribedText);
        
        if (response.length > 4000) {
          const chunks = response.match(/.{1,4000}/g) || [];
          for (const chunk of chunks) {
            await ctx.reply(chunk);
          }
        } else {
          await ctx.reply(response);
        }
      }

    } catch (err: any) {
      console.error("[Telegram] Voice transcription error:", err?.message);
      await ctx.reply(`❌ Voice transcription failed: ${err.message}`);
    }
  });

  // Handle audio files (same as voice but different format)
  bot.on("audio", async (ctx: Context) => {
    const audio = ctx.message?.audio;
    if (!audio) return;

    const userId = ctx.from?.id?.toString() || "unknown";
    const sessionId = `telegram:${userId}`;
    agent.setSession(sessionId);

    await ctx.reply("🎧 Transcribing audio file...");
    await ctx.sendChatAction("typing");

    try {
      const fileInfo = await ctx.telegram.getFile(audio.file_id);
      const fileUrl = await ctx.telegram.getFileLink(fileInfo);

      const tempDir = path.join(process.cwd(), "temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const audioPath = path.join(tempDir, audio.file_name || `${audio.file_id}.mp3`);

      // Download
      const response = await fetch(fileUrl.toString());
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(audioPath, Buffer.from(buffer));

      // Transcribe
      const transcribeSkill = (agent as any).skills?.get("transcribe");
      if (!transcribeSkill) {
        await ctx.reply("❌ Transcription skill not available.");
        return;
      }

      const transcription = await transcribeSkill.execute({ 
        file: audioPath,
        model: "tiny" 
      });

      // Clean up
      fs.unlinkSync(audioPath);

      await ctx.reply(transcription);

      // Process with agent
      const transcribedText = transcription.replace(/^[📝\s]*TRANSCRIPTION:?\s*/i, "").trim();
      if (transcribedText && transcribedText.length > 0) {
        recovery.save(sessionId, `[Audio] ${transcribedText}`);
        const response = await agent.process(transcribedText);
        
        if (response.length > 4000) {
          const chunks = response.match(/.{1,4000}/g) || [];
          for (const chunk of chunks) {
            await ctx.reply(chunk);
          }
        } else {
          await ctx.reply(response);
        }
      }

    } catch (err: any) {
      console.error("[Telegram] Audio transcription error:", err?.message);
      await ctx.reply(`❌ Audio transcription failed: ${err.message}`);
    }
  });

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

    // Handle /usage command
    if (message === "/usage") {
      await ctx.reply(agent.getUsageStatus(sessionId));
      return;
    }

    // Handle /status command
    if (message === "/status") {
      const skills = Array.from((agent as any).skills?.keys?.() || []);
      await ctx.reply(`🤖 Velo Bot Status\n\nPID: ${process.pid}\nModel: ${(agent as any).config?.agent?.model || "unknown"}\nTools: ${skills.length}\nSession: ${sessionId}`);
      return;
    }

    // Handle /help command
    if (message === "/help") {
      await ctx.reply(`🤖 Velo Bot Commands

/memory - View agent memory (facts & sessions)
/clear - Clear conversation history
/tools - List available tools
/recover - Recover from crashed session
/status - Check bot status
/help - Show this message

Just chat with me normally for anything else!`);
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
      
      // Register commands for autocomplete popup
      bot.telegram.setMyCommands([
        { command: "memory", description: "View agent memory (facts & sessions)" },
        { command: "clear", description: "Clear conversation history" },
        { command: "tools", description: "List available tools" },
        { command: "usage", description: "View token usage statistics" },
        { command: "recover", description: "Recover from crashed session" },
        { command: "help", description: "Show help message" },
        { command: "status", description: "Check bot status" },
      ]).catch(err => console.error("[Telegram] Failed to set commands:", err.message));
      
      // Enable graceful stop
      bot.launch({
        dropPendingUpdates: true,
      });
      
      // Log when bot is ready
      bot.telegram.getMe().then((botInfo) => {
        console.log(`[Telegram] Connected as @${botInfo.username}`);
        console.log("[Telegram] Commands registered: /memory, /clear, /tools, /recover, /help, /status");
      }).catch(console.error);
      
      return bot;
    },
    stop: () => {
      bot.stop("shutdown");
    },
  };
}