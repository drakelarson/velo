/**
 * Velo Dashboard Server
 * Real-time monitoring for Velo agent
 */

import { serve } from "bun";
import { Database } from "bun:sqlite";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const VELO_DIR = path.join(os.homedir(), ".velo");
const DB_PATH = path.join(VELO_DIR, "data", "velo.db");
const CONFIG_PATH = path.join(VELO_DIR, "velo.toml");

// Get database connection
function getDb(): Database | null {
  if (!fs.existsSync(DB_PATH)) {
    return null;
  }
  return new Database(DB_PATH);
}

// Get real stats from database
function getStats(): any {
  const db = getDb();
  if (!db) {
    return { error: "Database not found", running: false };
  }

  try {
    const messages = db.prepare("SELECT COUNT(*) as count FROM messages").get() as any;
    const facts = db.prepare("SELECT COUNT(*) as count FROM facts").get() as any;
    const sessions = db.prepare("SELECT COUNT(DISTINCT session_id) as count FROM messages").get() as any;
    const usage = db.prepare("SELECT SUM(total_tokens) as total, SUM(prompt_tokens) as prompt, SUM(completion_tokens) as completion FROM usage").get() as any;
    
    // Recent messages
    const recentMsgs = db.prepare(`
      SELECT session_id, role, content, created_at 
      FROM messages 
      ORDER BY created_at DESC 
      LIMIT 10
    `).all() as any[];
    
    // Facts
    const allFacts = db.prepare("SELECT key, value FROM facts").all() as any[];
    
    // Sessions list
    const sessionList = db.prepare(`
      SELECT session_id, COUNT(*) as msg_count, MAX(created_at) as last_active
      FROM messages
      GROUP BY session_id
      ORDER BY last_active DESC
    `).all() as any[];

    return {
      running: true,
      totalMessages: messages?.count || 0,
      totalFacts: facts?.count || 0,
      totalSessions: sessions?.count || 0,
      totalTokens: usage?.total || 0,
      promptTokens: usage?.prompt || 0,
      completionTokens: usage?.completion || 0,
      recentMessages: recentMsgs,
      facts: allFacts,
      sessions: sessionList,
      uptime: process.uptime(),
      pid: process.pid,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    return { error: err.message, running: true };
  } finally {
    db?.close();
  }
}

// Get config
function getConfig(): any {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { model: "not configured" };
  }
  const content = fs.readFileSync(CONFIG_PATH, "utf-8");
  const modelMatch = content.match(/model\s*=\s*"([^"]+)"/);
  const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
  return {
    model: modelMatch?.[1] || "unknown",
    name: nameMatch?.[1] || "Velo",
  };
}

serve({
  port: 3333,
  hostname: "0.0.0.0",
  
  async fetch(req) {
    const url = new URL(req.url);
    
    // CORS headers
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    
    if (req.method === "OPTIONS") {
      return new Response(null, { headers });
    }
    
    // API endpoints
    if (url.pathname === "/api/stats") {
      return Response.json(getStats(), { headers });
    }
    
    if (url.pathname === "/api/config") {
      return Response.json(getConfig(), { headers });
    }
    
    // Serve HTML dashboard
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const htmlPath = path.join(VELO_DIR, "dashboard", "index.html");
      if (fs.existsSync(htmlPath)) {
        return new Response(fs.readFileSync(htmlPath), {
          headers: { ...headers, "Content-Type": "text/html" },
        });
      }
      // Fallback inline HTML
      return new Response(getInlineDashboard(), {
        headers: { ...headers, "Content-Type": "text/html" },
      });
    }
    
    return new Response("Not found", { status: 404, headers });
  },
});

console.log("📊 Velo Dashboard running at http://localhost:3333");
console.log("📁 Data directory:", VELO_DIR);

function getInlineDashboard(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Velo Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: #0a0a0a; }
    .glass { background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); }
    .glow { box-shadow: 0 0 20px rgba(99, 102, 241, 0.3); }
  </style>
</head>
<body class="min-h-screen text-white">
  <div class="container mx-auto p-6">
    <header class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Velo Dashboard</h1>
        <p class="text-gray-400 mt-1">Real-time agent monitoring</p>
      </div>
      <div class="flex items-center gap-4">
        <span id="status-badge" class="px-3 py-1 rounded-full text-sm bg-green-500/20 text-green-400">● Online</span>
        <span id="uptime" class="text-gray-500 text-sm"></span>
      </div>
    </header>
    
    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div class="glass rounded-xl p-6 glow">
        <div class="text-gray-400 text-sm">Messages</div>
        <div id="stat-messages" class="text-3xl font-bold mt-2">-</div>
      </div>
      <div class="glass rounded-xl p-6">
        <div class="text-gray-400 text-sm">Sessions</div>
        <div id="stat-sessions" class="text-3xl font-bold mt-2">-</div>
      </div>
      <div class="glass rounded-xl p-6">
        <div class="text-gray-400 text-sm">Facts Learned</div>
        <div id="stat-facts" class="text-3xl font-bold mt-2">-</div>
      </div>
      <div class="glass rounded-xl p-6">
        <div class="text-gray-400 text-sm">Tokens Used</div>
        <div id="stat-tokens" class="text-3xl font-bold mt-2">-</div>
      </div>
    </div>
    
    <!-- Main Content -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Recent Messages -->
      <div class="lg:col-span-2 glass rounded-xl p-6">
        <h2 class="text-xl font-semibold mb-4">Recent Messages</h2>
        <div id="messages-list" class="space-y-3 max-h-96 overflow-y-auto">
          <div class="text-gray-500">Loading...</div>
        </div>
      </div>
      
      <!-- Sessions & Facts -->
      <div class="space-y-6">
        <div class="glass rounded-xl p-6">
          <h2 class="text-xl font-semibold mb-4">Sessions</h2>
          <div id="sessions-list" class="space-y-2 max-h-48 overflow-y-auto">
            <div class="text-gray-500">Loading...</div>
          </div>
        </div>
        
        <div class="glass rounded-xl p-6">
          <h2 class="text-xl font-semibold mb-4">Learned Facts</h2>
          <div id="facts-list" class="space-y-2 max-h-48 overflow-y-auto">
            <div class="text-gray-500">Loading...</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Footer -->
    <footer class="mt-8 text-center text-gray-600 text-sm">
      <span id="model-info">Model: -</span> | PID: <span id="pid">-</span>
    </footer>
  </div>
  
  <script>
    async function fetchStats() {
      try {
        const [statsRes, configRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/config')
        ]);
        const stats = await statsRes.json();
        const config = await configRes.json();
        updateDashboard(stats, config);
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
    }
    
    function updateDashboard(stats, config) {
      // Stats cards
      document.getElementById('stat-messages').textContent = stats.totalMessages || 0;
      document.getElementById('stat-sessions').textContent = stats.totalSessions || 0;
      document.getElementById('stat-facts').textContent = stats.totalFacts || 0;
      document.getElementById('stat-tokens').textContent = (stats.totalTokens || 0).toLocaleString();
      
      // Status
      const badge = document.getElementById('status-badge');
      badge.textContent = stats.running ? '● Online' : '● Offline';
      badge.className = stats.running 
        ? 'px-3 py-1 rounded-full text-sm bg-green-500/20 text-green-400'
        : 'px-3 py-1 rounded-full text-sm bg-red-500/20 text-red-400';
      
      // Uptime
      if (stats.uptime) {
        const mins = Math.floor(stats.uptime / 60);
        document.getElementById('uptime').textContent = \`Up: \${mins}m\`;
      }
      
      // Model info
      document.getElementById('model-info').textContent = \`Model: \${config.model || 'unknown'}\`;
      document.getElementById('pid').textContent = stats.pid || '-';
      
      // Recent messages
      const msgList = document.getElementById('messages-list');
      if (stats.recentMessages?.length > 0) {
        msgList.innerHTML = stats.recentMessages.map(m => \`
          <div class="p-3 rounded-lg bg-white/5">
            <div class="flex justify-between text-sm text-gray-400 mb-1">
              <span class="\${m.role === 'user' ? 'text-blue-400' : 'text-green-400'}">\${m.role}</span>
              <span>\${m.session_id}</span>
            </div>
            <div class="text-sm">\${m.content.slice(0, 100)}\${m.content.length > 100 ? '...' : ''}</div>
          </div>
        \`).join('');
      } else {
        msgList.innerHTML = '<div class="text-gray-500">No messages yet</div>';
      }
      
      // Sessions
      const sessList = document.getElementById('sessions-list');
      if (stats.sessions?.length > 0) {
        sessList.innerHTML = stats.sessions.map(s => \`
          <div class="flex justify-between items-center p-2 rounded bg-white/5 text-sm">
            <span class="truncate">\${s.session_id}</span>
            <span class="text-gray-400">\${s.msg_count} msgs</span>
          </div>
        \`).join('');
      } else {
        sessList.innerHTML = '<div class="text-gray-500">No sessions</div>';
      }
      
      // Facts
      const factsList = document.getElementById('facts-list');
      if (stats.facts?.length > 0) {
        factsList.innerHTML = stats.facts.map(f => \`
          <div class="p-2 rounded bg-white/5 text-sm">
            <span class="text-indigo-400">\${f.key}:</span> \${f.value.slice(0, 30)}\${f.value.length > 30 ? '...' : ''}
          </div>
        \`).join('');
      } else {
        factsList.innerHTML = '<div class="text-gray-500">No facts learned yet</div>';
      }
    }
    
    // Initial fetch and refresh every 5 seconds
    fetchStats();
    setInterval(fetchStats, 5000);
  </script>
</body>
</html>`;
}