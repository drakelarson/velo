// Discord channel adapter
// Requires: npm install discord.js

import { Agent } from "../agent.ts";

export interface DiscordConfig {
  token: string;
}

export function createDiscordChannel(agent: Agent, config: DiscordConfig) {
  // Dynamic import to avoid bundling if not used
  const start = async () => {
    const { Client, GatewayIntentBits, Events } = await import("discord.js");
    
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    client.on(Events.MessageCreate, async (message) => {
      // Ignore bot messages
      if (message.author.bot) return;

      // Only respond to mentions or DMs
      const isDM = !message.guild;
      const isMention = message.mentions.has(client.user?.id || "");

      if (!isDM && !isMention) return;

      // Clean the message (remove mention)
      let content = message.content.replace(/<@!?\d+>/g, "").trim();
      if (!content) {
        content = "Hello! How can I help you?";
      }

      // Use Discord user ID as session
      const userId = message.author.id;
      agent.setSession(`discord:${userId}`);

      try {
        const response = await agent.process(content);
        
        // Discord has 2000 char limit
        if (response.length > 1900) {
          const chunks = response.match(/.{1,1900}/g) || [];
          for (const chunk of chunks) {
            await message.reply(chunk);
          }
        } else {
          await message.reply(response);
        }
      } catch (err) {
        console.error("[Discord] Error:", err);
        await message.reply("Sorry, I encountered an error.");
      }
    });

    await client.login(config.token);
    console.log("[Discord] Bot started");
    return client;
  };

  return { start };
}