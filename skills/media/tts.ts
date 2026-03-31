import type { Skill } from "../../src/types.ts";
import { spawn } from "bun";
import * as fs from "fs";
import * as path from "path";

// Available voice models
const VOICES = {
  "default": "en_US-lessac-medium.onnx",
  "lessac": "en_US-lessac-medium.onnx",
  "ryan": "en_US-ryan-medium.onnx",
  "jenny": "en_US-jenny-medium.onnx",
  "amy": "en_GB-amy-medium.onnx",
  "alan": "en_GB-alan-medium.onnx",
};

const DEFAULT_VOICE = "lessac";

function getModelPath(voice: string): string {
  const modelDir = path.join(process.cwd(), "models", "piper");
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }
  
  const modelFile = VOICES[voice as keyof typeof VOICES] || VOICES.default;
  return path.join(modelDir, modelFile);
}

async function downloadModel(voice: string): Promise<string> {
  const modelPath = getModelPath(voice);
  
  if (fs.existsSync(modelPath)) {
    return modelPath;
  }
  
  const modelFile = VOICES[voice as keyof typeof VOICES] || VOICES.default;
  const baseName = modelFile.replace(".onnx", "");
  
  // Model URLs from Hugging Face
  const modelUrl = `https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/${voice}/medium/${modelFile}`;
  const configUrl = `https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/${voice}/medium/${modelFile}.json`;
  
  console.error(`[TTS] Downloading voice model: ${voice}...`);
  
  // Download model
  const modelResult = spawn({
    cmd: ["curl", "-L", "-o", modelPath, modelUrl],
    stdout: "pipe",
    stderr: "pipe",
  });
  await modelResult.exited;
  
  // Download config
  const configResult = spawn({
    cmd: ["curl", "-L", "-o", `${modelPath}.json`, configUrl],
    stdout: "pipe",
    stderr: "pipe",
  });
  await configResult.exited;
  
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Failed to download model for voice: ${voice}`);
  }
  
  console.error(`[TTS] Model downloaded: ${modelPath}`);
  return modelPath;
}

export default {
  name: "tts",
  description: "Convert text to speech audio using local Piper TTS. Returns audio file path. Use when user requests voice output or uses /voice command. Args: text (required), voice (optional: lessac, ryan, jenny, amy, alan).",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const text = String(args.text || args.action || args.message || "");
    const voice = String(args.voice || args.speaker || DEFAULT_VOICE).toLowerCase();
    
    if (!text) {
      return `Text-to-Speech (TTS)

Usage: tts text="Your message here" [voice="lessac"]

Available Voices:
  lessac (default) - Natural American English
  ryan - Male American English
  jenny - Female American English
  amy - Female British English
  alan - Male British English

Examples:
  tts text="Hello, how can I help you?"
  tts text="Bonjour!" voice="amy"

Output: WAV audio file (returned as file path for Telegram)`;
    }
    
    try {
      // Ensure model is downloaded
      const modelPath = await downloadModel(voice);
      
      // Generate output filename
      const outputDir = path.join(process.cwd(), "data", "tts");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const timestamp = Date.now();
      const outputFile = path.join(outputDir, `tts_${timestamp}.wav`);
      
      // Run Piper TTS
      const result = spawn({
        cmd: ["piper", "-m", modelPath, "-f", outputFile],
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      
      // Write text to stdin
      result.stdin.write(text);
      result.stdin.end();
      
      await result.exited;
      
      if (result.exitCode !== 0) {
        const stderr = await result.stderr.text();
        return `TTS failed: ${stderr.slice(0, 200)}`;
      }
      
      if (!fs.existsSync(outputFile)) {
        return "TTS failed: No output file generated";
      }
      
      const stats = fs.statSync(outputFile);
      
      return `✓ Audio generated: ${outputFile}
Size: ${(stats.size / 1024).toFixed(1)} KB
Voice: ${voice}
Text: "${text.slice(0, 50)}${text.length > 50 ? "..." : ""}"

AUDIO_FILE:${outputFile}`;
      
    } catch (err: any) {
      console.error("[TTS] Error:", err);
      return `Error: ${err.message}`;
    }
  },
} as Skill;