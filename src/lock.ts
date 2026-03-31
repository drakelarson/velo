import * as fs from "fs";
import * as path from "path";

// Per-channel locks - each channel gets its own lock
const LOCK_DIR = "/tmp/velo-locks";

function ensureLockDir() {
  if (!fs.existsSync(LOCK_DIR)) {
    fs.mkdirSync(LOCK_DIR, { recursive: true });
  }
}

// Acquire lock for a specific channel (telegram, webhook, discord, etc.)
export function acquireChannelLock(channel: string): boolean {
  ensureLockDir();
  const lockFile = `${LOCK_DIR}/${channel}.lock`;
  
  if (fs.existsSync(lockFile)) {
    const pid = parseInt(fs.readFileSync(lockFile, "utf-8").trim());
    
    // Check if process is still running
    try {
      process.kill(pid, 0);
      return false; // Process exists, can't acquire lock
    } catch {
      // Process dead, remove stale lock
      fs.unlinkSync(lockFile);
    }
  }
  
  // Write our PID to lock file
  fs.writeFileSync(lockFile, process.pid.toString());
  return true;
}

export function releaseChannelLock(channel: string): void {
  const lockFile = `${LOCK_DIR}/${channel}.lock`;
  if (fs.existsSync(lockFile)) {
    const pid = parseInt(fs.readFileSync(lockFile, "utf-8").trim());
    if (pid === process.pid) {
      fs.unlinkSync(lockFile);
    }
  }
}

export function getChannelLockInfo(channel: string): { pid: number } | null {
  const lockFile = `${LOCK_DIR}/${channel}.lock`;
  if (!fs.existsSync(lockFile)) return null;
  
  const pid = parseInt(fs.readFileSync(lockFile, "utf-8").trim());
  try {
    process.kill(pid, 0);
    return { pid };
  } catch {
    // Stale lock, clean it up
    fs.unlinkSync(lockFile);
    return null;
  }
}

// Legacy support - acquire all locks (for "start" command that runs all channels)
export function acquireLock(): boolean {
  ensureLockDir();
  const mainLock = `${LOCK_DIR}/main.lock`;
  
  if (fs.existsSync(mainLock)) {
    const pid = parseInt(fs.readFileSync(mainLock, "utf-8").trim());
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      fs.unlinkSync(mainLock);
    }
  }
  
  fs.writeFileSync(mainLock, process.pid.toString());
  return true;
}

export function releaseLock(): void {
  const mainLock = `${LOCK_DIR}/main.lock`;
  if (fs.existsSync(mainLock)) {
    const pid = parseInt(fs.readFileSync(mainLock, "utf-8").trim());
    if (pid === process.pid) {
      fs.unlinkSync(mainLock);
    }
  }
}