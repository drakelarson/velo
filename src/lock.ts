import * as fs from "fs";

const LOCK_DIR = "/tmp/velo-locks";

function ensureLockDir() {
  if (!fs.existsSync(LOCK_DIR)) {
    fs.mkdirSync(LOCK_DIR, { recursive: true });
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(lockFile: string): number | null {
  if (!fs.existsSync(lockFile)) return null;
  const content = fs.readFileSync(lockFile, "utf-8").trim();
  if (!content) return null;
  const pid = parseInt(content, 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

export function acquireChannelLock(channel: string): boolean {
  ensureLockDir();
  const lockFile = `${LOCK_DIR}/${channel}.lock`;

  const pid = readPid(lockFile);
  if (pid !== null && isProcessAlive(pid)) {
    return false; // Lock held by live process
  }

  // Stale or empty lock — remove it
  if (pid !== null) fs.unlinkSync(lockFile);

  fs.writeFileSync(lockFile, process.pid.toString());
  return true;
}

export function releaseChannelLock(channel: string): void {
  const lockFile = `${LOCK_DIR}/${channel}.lock`;
  const pid = readPid(lockFile);
  if (pid === process.pid) {
    fs.unlinkSync(lockFile);
  }
}

export function getChannelLockInfo(channel: string): { pid: number } | null {
  const lockFile = `${LOCK_DIR}/${channel}.lock`;
  const pid = readPid(lockFile);
  if (pid === null) return null;
  if (isProcessAlive(pid)) return { pid };
  // Stale lock — clean it up
  fs.unlinkSync(lockFile);
  return null;
}

export function acquireLock(): boolean {
  ensureLockDir();
  const mainLock = `${LOCK_DIR}/main.lock`;

  const pid = readPid(mainLock);
  if (pid !== null && isProcessAlive(pid)) {
    return false;
  }

  if (pid !== null) fs.unlinkSync(mainLock);

  fs.writeFileSync(mainLock, process.pid.toString());
  return true;
}

export function releaseLock(): void {
  const mainLock = `${LOCK_DIR}/main.lock`;
  const pid = readPid(mainLock);
  if (pid === process.pid) {
    fs.unlinkSync(mainLock);
  }
}
