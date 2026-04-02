import type { Skill } from "../../src/types.ts";
import { spawn } from "bun";
import * as fs from "fs";
import * as path from "path";

// Model sizes and their download URLs
const MODELS = {
  "tiny": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
  "tiny.multi": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
  "base": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
  "base.multi": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
  "small": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
};

const DEFAULT_MODEL = "tiny";

function getModelPath(modelName: string): string {
  const modelDir = path.join(process.cwd(), "models");
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }
  return path.join(modelDir, `ggml-${modelName}.bin`);
}

async function downloadModel(modelName: string): Promise<string> {
  const modelPath = getModelPath(modelName);
  
  if (fs.existsSync(modelPath)) {
    return modelPath;
  }
  
  const url = MODELS[modelName as keyof typeof MODELS] || MODELS.tiny;
  console.error(`[Transcribe] Downloading model: ${modelName}...`);
  
  // Use curl to download
  const result = spawn({
    cmd: ["curl", "-L", "-o", modelPath, url],
    stdout: "pipe",
    stderr: "pipe",
  });
  
  await result.exited;
  
  if (result.exitCode !== 0) {
    throw new Error(`Failed to download model ${modelName}`);
  }
  
  console.error(`[Transcribe] Model downloaded: ${modelPath}`);
  return modelPath;
}

async function ensureWhisperCpp(): Promise<string> {
  // Check if whisper-cpp is installed
  let whisperPath = "whisper-cli";
  
  // Try to find in common locations
  const possiblePaths = [
    "/usr/local/bin/whisper-cpp",
    "/usr/bin/whisper-cpp",
    path.join(process.cwd(), "whisper-cli"),
    path.join(process.cwd(), "main"),
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      whisperPath = p;
      break;
    }
  }
  
  // Check if it exists
  const checkResult = spawn({
    cmd: ["which", "whisper-cli"],
    stdout: "pipe",
  });
  await checkResult.exited;
  
  if (checkResult.exitCode === 0) {
    return "whisper-cli";
  }
  
  // Try alternative binary name (whisper-cli from whisper.cpp)
  const checkResult2 = spawn({
    cmd: ["which", "whisper-cli"],
    stdout: "pipe",
  });
  await checkResult2.exited;
  
  if (checkResult2.exitCode === 0) {
    return "whisper-cli";
  }
  
  // Install whisper.cpp via system package or build from source
  console.error("[Transcribe] Installing whisper.cpp...");
  
  // Try apt install first
  const aptResult = spawn({
    cmd: ["apt-get", "install", "-y", "whisper.cpp"],
    stdout: "pipe",
    stderr: "pipe",
  });
  await aptResult.exited;
  
  if (aptResult.exitCode === 0) {
    return "whisper-cli";
  }
  
  // Build from source
  console.error("[Transcribe] Building whisper.cpp from source...");
  const buildDir = path.join(process.cwd(), "whisper-cpp-build");
  
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
    
    // Clone repo
    const cloneResult = spawn({
      cmd: ["git", "clone", "https://github.com/ggerganov/whisper.cpp.git", buildDir],
      stdout: "pipe",
      stderr: "pipe",
    });
    await cloneResult.exited;
    
    if (cloneResult.exitCode !== 0) {
      throw new Error("Failed to clone whisper.cpp");
    }
    
    // Build
    const buildResult = spawn({
      cmd: ["make"],
      cwd: buildDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    await buildResult.exited;
    
    if (buildResult.exitCode !== 0) {
      throw new Error("Failed to build whisper.cpp");
    }
  }
  
  const binaryPath = path.join(buildDir, "main");
  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }
  
  throw new Error("Could not find or install whisper.cpp");
}

export default {
  name: "transcribe"
    category: "Media",,
  description: "Transcribe audio files to text using local Whisper model. Use when user sends audio/voice memo. Args: file (path or URL), language (optional), model (tiny/base/small).",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const filePath = String(args.file || args.action || args.path || "");
    const language = String(args.language || "en");
    const modelName = String(args.model || DEFAULT_MODEL);
    
    if (!filePath) {
      return `Voice Transcription

Usage: transcribe file="path/to/audio.mp3" [language="en"] [model="tiny"]

Models:
  tiny (39MB) - Fast, good for short clips
  base (75MB) - Better accuracy
  small (500MB) - Best quality

Supported formats: mp3, wav, m4a, ogg, flac, webm

Examples:
  transcribe file="voice_memo.m4a"
  transcribe file="meeting.mp3" language="en" model="base"`;
    }
    
    try {
      // Ensure whisper.cpp is available
      const whisperPath = await ensureWhisperCpp();
      
      // Download model if needed
      const modelPath = await downloadModel(modelName);
      
      // Resolve file path
      let audioPath = filePath;
      if (!fs.existsSync(filePath)) {
        // Could be relative path
        audioPath = path.resolve(process.cwd(), filePath);
        if (!fs.existsSync(audioPath)) {
          return `Error: Audio file not found: ${filePath}`;
        }
      }
      
      // Run transcription
      const result = spawn({
        cmd: [
          whisperPath,
          "-m", modelPath,
          "-f", audioPath,
          "-l", language,
          "--output-txt",
          "--no-timestamps",
        ],
        stdout: "pipe",
        stderr: "pipe",
      });
      
      const output = await result.stdout.text();
      const stderr = await result.stderr.text();
      await result.exited;
      
      if (result.exitCode !== 0) {
        console.error("[Transcribe] Error:", stderr);
        return `Transcription failed: ${stderr.slice(0, 200)}`;
      }
      
      // Extract just the text (whisper.cpp outputs to .txt file)
      const txtPath = audioPath.replace(/\.[^.]+$/, ".txt");
      if (fs.existsSync(txtPath)) {
        const text = fs.readFileSync(txtPath, "utf-8").trim();
        return `📝 TRANSCRIPTION:\n\n${text}`;
      }
      
      // Fallback to stdout output
      const lines = output.split("\n").filter(l => 
        !l.startsWith("[") && l.trim().length > 0
      );
      
      if (lines.length > 0) {
        return `📝 TRANSCRIPTION:\n\n${lines.join("\n")}`;
      }
      
      return "Transcription completed but no text was extracted.";
      
    } catch (err: any) {
      console.error("[Transcribe] Error:", err);
      return `Error: ${err.message}`;
    }
  },
} as Skill;