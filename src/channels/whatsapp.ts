import * as os from "os";
/**
 * WhatsApp Channel for Velo
 * Connects to Node.js bridge via WebSocket for WhatsApp Web protocol
 */

import * as fs from "fs";
import * as path from "path";
import { spawn } from "bun";
import type { Agent } from "../agent.ts";

interface WhatsAppConfig {
  enabled: boolean;
  bridgeUrl: string;
  bridgeToken?: string;
  allowFrom: string[];
  groupPolicy: "open" | "mention";
}

interface InboundMessage {
  id: string;
  sender: string;
  pn: string;
  content: string;
  timestamp: number;
  isGroup: boolean;
  wasMentioned?: boolean;
  media?: string[];
}

export class WhatsAppChannel {
  private agent: Agent;
  private config: WhatsAppConfig;
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private processedMessages: Set<string> = new Set();
  private bridgeProcess: any = null;

  constructor(agent: Agent, config: Partial<WhatsAppConfig> = {}) {
    this.agent = agent;
    this.config = {
      enabled: true,
      bridgeUrl: "ws://127.0.0.1:3001",
      allowFrom: [],
      groupPolicy: "open",
      ...config,
    };
  }

  async ensureBridge(): Promise<boolean> {
    const bridgeDir = path.join(os.homedir(), ".velo", "bridge");
    const distPath = path.join(bridgeDir, "dist", "index.js");

    // Check if bridge is built
    if (!fs.existsSync(distPath)) {
      console.log("[WhatsApp] Building bridge...");
      
      // Ensure bridge directory exists
      if (!fs.existsSync(bridgeDir)) {
        fs.mkdirSync(bridgeDir, { recursive: true });
      }
      
      // Install dependencies
      const installResult = spawn({
        cmd: ["npm", "install"],
        cwd: bridgeDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      await installResult.exited;
      
      if (installResult.exitCode !== 0) {
        console.error("[WhatsApp] Failed to install bridge dependencies");
        return false;
      }

      // Build
      const buildResult = spawn({
        cmd: ["npm", "run", "build"],
        cwd: bridgeDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      await buildResult.exited;
      
      if (buildResult.exitCode !== 0) {
        console.error("[WhatsApp] Failed to build bridge");
        return false;
      }
    }

    return true;
  }

  async login(): Promise<void> {
    const bridgeDir = path.join(os.homedir(), ".velo", "bridge");
    
    console.log("[WhatsApp] Starting bridge for QR login...");
    console.log("[WhatsApp] Scan the QR code with WhatsApp (Settings > Linked Devices > Link a Device)");
    
    const env = {
      ...process.env,
      BRIDGE_PORT: "3001",
      AUTH_DIR: path.join(os.homedir(), ".velo", "data", "whatsapp-auth"),
    };
    
    if (this.config.bridgeToken) {
      env.BRIDGE_TOKEN = this.config.bridgeToken;
    }

    const result = spawn({
      cmd: ["npm", "start"],
      cwd: bridgeDir,
      env,
      stdout: "inherit",
      stderr: "inherit",
    });
    
    await result.exited;
  }

  async start(): Promise<void> {
    if (!await this.ensureBridge()) {
      throw new Error("Failed to setup WhatsApp bridge");
    }

    const bridgeDir = path.join(os.homedir(), ".velo", "bridge");
    const env = {
      ...process.env,
      BRIDGE_PORT: "3001",
      AUTH_DIR: path.join(os.homedir(), ".velo", "data", "whatsapp-auth"),
    };
    
    if (this.config.bridgeToken) {
      env.BRIDGE_TOKEN = this.config.bridgeToken;
    }

    // Start bridge in background
    this.bridgeProcess = spawn({
      cmd: ["npm", "start"],
      cwd: bridgeDir,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });

    // Give bridge time to start
    await new Promise(r => setTimeout(r, 2000));

    // Connect to bridge via WebSocket
    await this.connect();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[WhatsApp] Connecting to bridge at ${this.config.bridgeUrl}...`);
      
      this.ws = new WebSocket(this.config.bridgeUrl);

      this.ws.onopen = () => {
        console.log("[WhatsApp] Connected to bridge");
        
        // Send auth if configured
        if (this.config.bridgeToken) {
          this.ws?.send(JSON.stringify({
            type: "auth",
            token: this.config.bridgeToken,
          }));
        }
        
        this.connected = true;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          this.handleBridgeMessage(data);
        } catch (err) {
          console.error("[WhatsApp] Error parsing bridge message:", err);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        console.log("[WhatsApp] Disconnected from bridge");
        
        // Reconnect after 5 seconds
        setTimeout(() => {
          if (!this.connected) {
            this.connect().catch(console.error);
          }
        }, 5000);
      };

      this.ws.onerror = (err) => {
        console.error("[WhatsApp] WebSocket error:", err);
        reject(err);
      };
    });
  }

  private handleBridgeMessage(data: any): void {
    const { type } = data;

    if (type === "message") {
      // Skip already processed
      if (data.id && this.processedMessages.has(data.id)) return;
      if (data.id) {
        this.processedMessages.add(data.id);
        // Limit cache size
        if (this.processedMessages.size > 1000) {
          const arr = Array.from(this.processedMessages).slice(0, 500);
          this.processedMessages = new Set(arr);
        }
      }

      // Check group policy
      if (data.isGroup && this.config.groupPolicy === "mention") {
        if (!data.wasMentioned) return;
      }

      // Extract sender ID
      const senderId = data.sender.split("@")[0];
      const sessionId = `whatsapp:${senderId}`;

      // Handle message
      this.handleMessage(sessionId, data.sender, data.content, data.media);
    } else if (type === "status") {
      console.log(`[WhatsApp] Status: ${data.status}`);
      this.connected = data.status === "connected";
    } else if (type === "qr") {
      console.log("[WhatsApp] QR code displayed in bridge terminal");
    } else if (type === "error") {
      console.error("[WhatsApp] Bridge error:", data.error);
    }
  }

  private async handleMessage(
    sessionId: string,
    chatId: string,
    content: string,
    media?: string[]
  ): Promise<void> {
    this.agent.setSession(sessionId);

    // Handle voice messages
    if (content === "[Voice Message]" && media && media.length > 0) {
      const transcribeSkill = (this.agent as any).skills?.get("transcribe");
      if (transcribeSkill) {
        const transcription = await transcribeSkill.execute({
          file: media[0],
          model: "tiny",
        });
        content = transcription.replace(/^[📝\s]*TRANSCRIPTION:?\\s*/i, "").trim();
      }
    }

    // Build full content with media tags
    let fullContent = content;
    if (media && media.length > 0) {
      for (const mediaPath of media) {
        const mime = this.getMimeType(mediaPath);
        const mediaType = mime.startsWith("image/") ? "image" : "file";
        fullContent += `\\n[${mediaType}: ${mediaPath}]`;
      }
    }

    console.log(`[WhatsApp] Message from ${sessionId}: ${content.slice(0, 50)}...`);

    try {
      const response = await this.agent.process(fullContent);
      await this.send(chatId, response);
    } catch (err: any) {
      console.error("[WhatsApp] Error processing message:", err);
      await this.send(chatId, "Sorry, I encountered an error.");
    }
  }

  async send(chatId: string, text: string): Promise<void> {
    if (!this.ws || !this.connected) {
      console.error("[WhatsApp] Not connected to bridge");
      return;
    }

    // Split long messages (WhatsApp has 4096 char limit)
    const chunks = text.length > 4000 
      ? text.match(/.{1,4000}/g) || [] 
      : [text];

    for (const chunk of chunks) {
      this.ws.send(JSON.stringify({
        type: "send",
        to: chatId,
        text: chunk,
      }));
    }
  }

  async sendMedia(chatId: string, filePath: string, mimetype: string, caption?: string): Promise<void> {
    if (!this.ws || !this.connected) return;

    this.ws.send(JSON.stringify({
      type: "send_media",
      to: chatId,
      filePath,
      mimetype,
      caption,
    }));
  }

  private getMimeType(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const mimes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      mp4: "video/mp4",
      mp3: "audio/mpeg",
      ogg: "audio/ogg",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    return mimes[ext] || "application/octet-stream";
  }

  async stop(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.bridgeProcess) {
      this.bridgeProcess.kill();
      this.bridgeProcess = null;
    }
    this.connected = false;
  }
}

export function createWhatsAppChannel(agent: Agent, config?: Partial<WhatsAppConfig>) {
  return new WhatsAppChannel(agent, config);
}
