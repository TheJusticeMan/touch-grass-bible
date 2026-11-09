#!/usr/bin/env node
import * as fs from "node:fs";
import { spawnSync } from "node:child_process";

const command = process.argv[2] || "status";
const root = process.cwd();
const aiDir = `${root}/ai`;
const pidFile = `${aiDir}/wander.pid`;
const logFile = `${aiDir}/wander.log`;
const stateFile = `${aiDir}/wander-state.json`;

function isRunning() {
  try {
    if (!fs.existsSync(pidFile)) return false;
    const pid = Number.parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
    if (!Number.isFinite(pid)) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

function start() {
  if (isRunning()) {
    console.log(`wander-tsk is already running (pid=${fs.readFileSync(pidFile, "utf8").trim()}).`);
    return 0;
  }

  fs.mkdirSync(aiDir, { recursive: true });
  if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);

  const child = spawnSync(
    "bash",
    ["-lc", `cd "${root}" && nohup npm run ai:wander >> "${logFile}" 2>&1 & echo $! > "${pidFile}"`],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);

  const pid = fs.readFileSync(pidFile, "utf8").trim();
  console.log(`wander-tsk started (pid=${pid}).`);
  if (fs.existsSync(stateFile)) {
    console.log(`resume source: ${stateFile}`);
  } else {
    console.log("no state file found; walker will initialize at START_OSIS/default.");
  }
  return 0;
}

function stop() {
  if (!isRunning()) {
    console.log("wander-tsk is not running.");
    try {
      fs.unlinkSync(pidFile);
    } catch {
      console.log(`Failed to remove pid file ${pidFile}.`);
    }
    return 0;
  }

  const pid = Number.parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    console.log(`Failed to send SIGTERM to process ${pid}. It may not be running.`);
  }

  for (let i = 0; i < 20; i++) {
    try {
      process.kill(pid, 0);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    } catch {
      break;
    }
  }

  try {
    process.kill(pid, 0);
    process.kill(pid, "SIGKILL");
  } catch {
    console.log(`Failed to send SIGKILL to process ${pid}. It may not be running.`);
  }

  try {
    fs.unlinkSync(pidFile);
  } catch {
    console.log(`Failed to remove pid file ${pidFile}.`);
  }
  console.log("wander-tsk stopped.");
  return 0;
}

function status() {
  if (isRunning()) {
    console.log(`running (pid=${fs.readFileSync(pidFile, "utf8").trim()})`);
  } else {
    console.log("not running");
  }

  console.log(fs.existsSync(stateFile) ? `state: present (${stateFile})` : "state: missing");
  console.log(fs.existsSync(logFile) ? `log: present (${logFile})` : "log: missing");
  return 0;
}

function tailLogs() {
  fs.mkdirSync(aiDir, { recursive: true });
  const child = spawnSync("bash", ["-lc", `tail -f "${logFile}"`], {
    stdio: "inherit",
    env: process.env,
  });
  if (child.error) throw child.error;
  process.exit(child.status ?? 0);
}

switch (command) {
  case "start":
  case "resume":
    process.exit(start());
    break;
  case "stop":
    process.exit(stop());
    break;
  case "restart":
    stop();
    process.exit(start());
    break;
  case "status":
    process.exit(status());
    break;
  case "tail":
    process.exit(tailLogs());
    break;
  default:
    console.log("Usage: node scripts/ai/wander-control.mjs <start|stop|restart|resume|status|tail>");
    process.exit(1);
}
