import * as fs from "fs";
import * as path from "path";
import type { Config } from "./types.ts";

const LOCK_FILE = "/tmp/velo-agent.lock";

export function acquireLock(): boolean {
  // Check if lock file exists
  if (fs.existsSync(LOCK_FILE)) {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, "utf-8").trim());
    
    // Check if process is still running
    try {
      process.kill(pid, 0); // Throws if process doesn't exist
      return false; // Process exists, can't acquire lock
    } catch {
      // Process dead, remove stale lock
      fs.unlinkSync(LOCK_FILE);
    }
  }
  
  // Write our PID to lock file
  fs.writeFileSync(LOCK_FILE, process.pid.toString());
  return true;
}

export function releaseLock(): void {
  if (fs.existsSync(LOCK_FILE)) {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, "utf-8").trim());
    if (pid === process.pid) {
      fs.unlinkSync(LOCK_FILE);
    }
  }
}

export function getLockInfo(): { pid: number; startTime: Date } | null {
  if (!fs.existsSync(LOCK_FILE)) return null;
  
  const pid = parseInt(fs.readFileSync(LOCK_FILE, "utf-8").trim());
  try {
    // Read process start time from /proc
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf-8");
    const starttime = parseInt(stat.split(" ")[21]);
    const startTime = new Date(starttime * 1000 / process.hrtime()[1] * 1000);
    return { pid, startTime };
  } catch {
    return null;
  }
}