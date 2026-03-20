#!/usr/bin/env node
/**
 * Kills any process using port 5180 so desktop:dev can start cleanly.
 * Run before npm run desktop:dev to avoid "Port 5180 is already in use".
 */
import { execSync } from 'node:child_process';
import { platform } from 'node:os';

const PORT = 5180;

function freePort() {
  try {
    if (platform() === 'win32') {
      const out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      const pids = [...new Set(out.split('\n').map((line) => line.trim().split(/\s+/).pop()).filter(Boolean))];
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          console.log(`[free-port] Killed PID ${pid} on port ${PORT}`);
        } catch {
          // ignore
        }
      }
    } else {
      const out = execSync(`lsof -i :${PORT} -t 2>/dev/null || true`, { encoding: 'utf8' });
      const pids = out.trim().split('\n').filter(Boolean);
      for (const pid of pids) {
        try {
          execSync(`kill ${pid} 2>/dev/null || true`, { stdio: 'ignore' });
          console.log(`[free-port] Killed PID ${pid} on port ${PORT}`);
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // lsof/netstat may fail if nothing is listening
  }
}

freePort();
