import { Telegraf, Context } from "telegraf";
import { CrashRecovery } from "../recovery.ts";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "bun";

// Track voice mode and preferred voice per user
const voiceModeUsers = new Map<string, { enabled: boolean; voice: string }>();

// Available Kokoro voices
const AVAILABLE_VOICES = [
  { id: "af_bella", name: "Bella", gender: "female", accent: "American" },
  { id: "af_sarah", name: "Sarah", gender: "female", accent: "American" },
  { id: "af_nicole", name: "Nicole", gender: "female", accent: "American" },
  { id: "af_sky", name: "Sky", gender: "female", accent: "American" },
  { id: "am_adam", name: "Adam", gender: "male", accent: "American" },
  { id: "am_michael", name: "Michael", gender: "male", accent: "American" },
  { id: "bf_emma", name: "Emma", gender: "female", accent: "British" },
  { id: "bf_isabella", name: "Isabella", gender: "female", accent: "British" },
  { id: "bm_george", name: "George", gender: "male", accent: "British" },
  { id: "bm_lewis", name: "Lewis", gender: "male", accent: "British" },
];

const DEFAULT_VOICE = "af_bella";

export function createTelegramChannel(agent: any, token: string) {
  const bot = new Telegraf(token);
  const recovery = new CrashRecovery(agent.config?.memory?.path || "./data/velo.db");
  
  // Handle voice messages (transcription)
  bot.on("voice", async (ctx: Context) => {
    const voice = ctx.message?.voice;
    if (!voice) return;

    const userId = ctx.from?.id?.toString() || "unknown";
    const sessionId = `telegram:${userId}`;
    agent.setSession(sessionId);

    await ctx.reply("🎧 Transcribing voice message...");
    await ctx.sendChatAction("typing");

    try {
      const fileInfo = await ctx.telegram.getFile(voice.file_id);
      const fileUrl = await ctx.telegram.getFileLink(fileInfo);

      const tempDir = path.join(process.cwd(), "temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const oggPath = path.join(tempDir, `${voice.file_id}.ogg`);
      const wavPath = path.join(tempDir, `${voice.file_id}.wav`);

      const response = await fetch(fileUrl.toString());
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(oggPath, Buffer.from(buffer));

      const ffmpegResult = spawn({
        cmd: ["ffmpeg", "-y", "-i", oggPath, "-ar", "16000", "-ac", "1", wavPath],
        stdout: "pipe",
        stderr: "pipe",
      });
      await ffmpegResult.exited;

      if (ffmpegResult.exitCode !== 0) {
        throw new Error("Failed to convert audio format");
      }

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

      fs.unlinkSync(oggPath);
      fs.unlinkSync(wavPath);

      await ctx.reply(transcription);

      const transcribedText = transcription.replace(/^[📝\s]*TRANSCRIPTION:?\s*/i, "").trim();
      if (transcribedText && transcribedText.length > 0) {
        recovery.save(sessionId, `[Voice] ${transcribedText}`);
        
        const response = await agent.process(transcribedText);
        await sendResponse(ctx, response, userId, agent);
      }

    } catch (err: any) {
      console.error("[Telegram] Voice transcription error:", err?.message);
      await ctx.reply(`❌ Voice transcription failed: ${err.message}`);
    }
  });

  // Handle audio files
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

      const response = await fetch(fileUrl.toString());
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(audioPath, Buffer.from(buffer));

      const transcribeSkill = (agent as any).skills?.get("transcribe");
      if (!transcribeSkill) {
        await ctx.reply("❌ Transcription skill not available.");
        return;
      }

      const transcription = await transcribeSkill.execute({ 
        file: audioPath,
        model: "tiny" 
      });

      fs.unlinkSync(audioPath);

      await ctx.reply(transcription);

      const transcribedText = transcription.replace(/^[📝\s]*TRANSCRIPTION:?\s*/i, "").trim();
      if (transcribedText && transcribedText.length > 0) {
        recovery.save(sessionId, `[Audio] ${transcribedText}`);
        const response = await agent.process(transcribedText);
        await sendResponse(ctx, response, userId, agent);
      }

    } catch (err: any) {
      console.error("[Telegram] Audio transcription error:", err?.message);
      await ctx.reply(`❌ Audio transcription failed: ${err.message}`);
    }
  });

  bot.on("text", async (ctx: Context) => {
    const message = ctx.message?.text;
    if (!message) return;

    const userId = ctx.from?.id?.toString() || "unknown";
    const sessionId = `telegram:${userId}`;
    agent.setSession(sessionId);

    // NOTE: Inactivity tracking is now handled by Agent.process() automatically
    // No need for channel-specific tracking

    // Handle /voice command
    if (message === "/voice" || message.startsWith("/voice ")) {
      const args = message.replace("/voice", "").trim().toLowerCase();
      
      // Get current user settings
      let userSettings = voiceModeUsers.get(userId) || { enabled: false, voice: DEFAULT_VOICE };
      
      // /voice list - show available voices
      if (args === "list" || args === "voices") {
        const voiceList = AVAILABLE_VOICES.map(v => 
          `• ${v.name} (${v.gender}, ${v.accent})${userSettings.voice === v.id ? " ✓" : ""}`
        ).join("\n");
        
        await ctx.reply(
          `🎤 Available Voices:\n\n${voiceList}\n\nUsage: /voice <name>\nExample: /voice Emma\n\nCurrent: ${getVoiceName(userSettings.voice)}`
        );
        return;
      }
      
      // /voice <name> - set voice
      if (args && args !== "on" && args !== "off") {
        const voiceName = args.charAt(0).toUpperCase() + args.slice(1);
        const voice = AVAILABLE_VOICES.find(v => v.name.toLowerCase() === args);
        
        if (voice) {
          userSettings.voice = voice.id;
          voiceModeUsers.set(userId, userSettings);
          await ctx.reply(`🎤 Voice set to: ${voice.name} (${voice.gender}, ${voice.accent})`);
          return;
        } else {
          await ctx.reply(`❌ Unknown voice: "${args}"\n\nUse /voice list to see available voices.`);
          return;
        }
      }
      
      // /voice on/off or just /voice - toggle
      if (args === "on") {
        userSettings.enabled = true;
        userSettings.enabled = false;
      } else {
        userSettings.enabled = !userSettings.enabled;
      }
      
      voiceModeUsers.set(userId, userSettings);
      
      if (userSettings.enabled) {
        await ctx.reply(
          `🔊 Voice mode ENABLED\n\nVoice: ${getVoiceName(userSettings.voice)}\n\nUse /voice list to change voice.`
        );
      } else {
        await ctx.reply("🔇 Voice mode DISABLED. I'll respond with text messages.");
      }
      return;
    }

    // Handle /memory command
    if (message === "/memory") {
      await ctx.reply(agent.getMemoryStatus());
      return;
    }

    if (message === "/new") {
      agent.clearSession(sessionId);
      await ctx.reply("✓ New conversation started. Previous context cleared. What would you like to work on?");
      return;
    }

    if (message === "/clear") {
      agent.clearSession(sessionId);
      await ctx.reply("✓ Conversation history cleared.");
      return;
    }

    if (message === "/recover") {
      const crashed = recovery.getCrashed();
      if (crashed.length === 0) {
        await ctx.reply("✓ No crashed sessions to recover.");
      } else {
        await ctx.reply(`Found ${crashed.length} crashed sessions. Last input: "${crashed[0]?.last_input?.slice(0, 30) || "(none)"}"`);
      }
      return;
    }

    if (message === "/tools") {
      const skills = Array.from((agent as any).skills?.keys?.() || []);
      await ctx.reply(`I have ${skills.length} tools available:\n${skills.slice(0, 20).join(", ")}${skills.length > 20 ? "..." : ""}`);
      return;
    }

    if (message === "/usage") {
      await ctx.reply(agent.getUsageStatus(sessionId));
      return;
    }

    if (message === "/status") {
      const skills = Array.from((agent as any).skills?.keys?.() || []);
      const userSettings = voiceModeUsers.get(userId) || { enabled: false, voice: DEFAULT_VOICE };
      const voiceStatus = userSettings.enabled ? `ON 🔊 (${getVoiceName(userSettings.voice)})` : "OFF 🔇";
      await ctx.reply(`🤖 Velo Bot Status\n\nPID: ${process.pid}\nModel: ${(agent as any).config?.agent?.model || "unknown"}\nTools: ${skills.length}\nSession: ${sessionId}\nVoice Mode: ${voiceStatus}`);
      return;
    }

    if (message === "/help") {
      await ctx.reply(`🤖 Velo Bot Commands

/memory - View agent memory (facts & sessions)
/clear - Clear conversation history
/tools - List available tools
/recover - Recover from crashed session
/status - Check bot status
/voice - Toggle voice mode
/voice list - Show available voices
/voice <name> - Set your preferred voice
/new - Start a new conversation
/help - Show this message

Just chat with me normally for anything else!`);
      return;
    }

    recovery.save(sessionId, message);
    await ctx.sendChatAction("typing");

    try {
      console.log(`[Telegram] Processing: "${message.slice(0, 50)}..."`);
      const response = await agent.process(message);  // This now tracks activity automatically
      console.log(`[Telegram] Response generated (${response.length} chars)`);
      
      recovery.markClean(sessionId);
      await sendResponse(ctx, response, userId, agent);
      
    } catch (err: any) {
      console.error("[Telegram] Error:", err?.message || err);
      console.error(err?.stack);
      recovery.markCrashed(sessionId);
      try {
        await ctx.reply("Sorry, I encountered an error processing your request. Use /recover to see crash details.");
      } catch {}
    }
  });

  bot.catch((err: any) => {
    console.error("[Telegram] Bot error:", err?.message || err);
  });

  return {
    start: () => {
      console.log("[Telegram] Bot starting with long polling...");
      
      bot.telegram.setMyCommands([
        { command: "new", description: "Start a new conversation" },
        { command: "memory", description: "View agent memory (facts & sessions)" },
        { command: "clear", description: "Clear conversation history" },
        { command: "tools", description: "List available tools" },
        { command: "usage", description: "View token usage statistics" },
        { command: "recover", description: "Recover from crashed session" },
        { command: "help", description: "Show help message" },
        { command: "status", description: "Check bot status" },
        { command: "voice", description: "Toggle voice mode or set voice" },
      ]).catch(err => console.error("[Telegram] Failed to set commands:", err.message));
      
      bot.launch({ dropPendingUpdates: false });
      
      bot.telegram.getMe().then((botInfo) => {
        console.log(`[Telegram] Connected as @${botInfo.username}`);
        console.log("[Telegram] Commands registered: /memory, /clear, /tools, /recover, /help, /status, /voice");
      }).catch(console.error);
      
      return bot;
    },
    stop: () => {
      bot.stop("shutdown");
    },
  };
}

// NOTE: trackSessionActivity and triggerReflection functions removed
// The Agent class now handles inactivity tracking across ALL channels

// Helper function to get voice name from ID
function getVoiceName(voiceId: string): string {
  const voice = AVAILABLE_VOICES.find(v => v.id === voiceId);
  return voice ? voice.name : "Bella";
}

// Helper function to send response (text or voice)
async function sendResponse(ctx: Context, text: string, userId: string, agent: any) {
  const userSettings = voiceModeUsers.get(userId) || { enabled: false, voice: DEFAULT_VOICE };
  
  if (userSettings.enabled && text.length > 0) {
    // Send as voice message
    try {
      const ttsSkill = (agent as any).skills?.get("tts");
      if (ttsSkill) {
        const ttsResult = await ttsSkill.execute({ 
          text: text.slice(0, 500), 
          voice: userSettings.voice 
        });
        
        // Extract audio file path from result
        const match = ttsResult.match(/AUDIO_FILE:(.+)$/m);
        if (match && fs.existsSync(match[1])) {
          await ctx.replyWithAudio({ source: match[1] });
          // Clean up
          fs.unlinkSync(match[1]);
          return;
        }
      }
    } catch (err: any) {
      console.error("[Telegram] TTS error:", err.message);
      // Fall back to text
    }
  }
  
  // Send as text
  if (text.length > 4000) {
    const chunks = text.match(/.{1,4000}/g) || [];
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  } else {
    await ctx.reply(text);
  }
}