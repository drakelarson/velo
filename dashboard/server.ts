/**
 * Velo Dashboard Server
 * Simple HTTP server for web UI
 */

import { serve } from "bun";
import * as fs from "fs";
import * as path from "path";
import { Database } from "bun:sqlite";

const PORT = process.env.DASHBOARD_PORT || 3333;
const VELO_HOME = process.env.VELO_HOME || path.join(process.env.HOME || "/root", ".velo");
const DB_PATH = path.join(VELO_HOME, "data", "velo.db");
const CONFIG_PATH = path.join(VELO_HOME, "config.toml");
const ENV_PATH = path.join(VELO_HOME, "velo.env");

// Serve static files
async function serveStatic(filepath: string): Promise<Response> {
    const fullPath = path.join(__dirname, filepath);
    if (!fs.existsSync(fullPath)) {
        return new Response("Not Found", { status: 404 });
    }
    const content = fs.readFileSync(fullPath);
    const ext = path.extname(filepath);
    const contentType = ext === ".html" ? "text/html" : ext === ".css" ? "text/css" : ext === ".js" ? "application/javascript" : "text/plain";
    return new Response(content, { headers: { "Content-Type": contentType } });
}

// Get database
function getDB(): Database | null {
    if (!fs.existsSync(DB_PATH)) return null;
    return new Database(DB_PATH);
}

// API Handlers
const api = {
    // GET /api/status
    async status(): Promise<object> {
        const db = getDB();
        if (!db) return { running: false, sessions: 0, messages: 0, tokens: 0, cost: 0 };
        
        try {
            const sessions = db.prepare("SELECT COUNT(DISTINCT session_id) as count FROM messages").get() as { count: number };
            const messages = db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number };
            const usage = db.prepare("SELECT SUM(total_tokens) as tokens, SUM(prompt_tokens + completion_tokens) * 0.001 as cost FROM usage").get() as { tokens: number; cost: number };
            const config = fs.readFileSync(CONFIG_PATH, "utf-8");
            const modelMatch = config.match(/model\s*=\s*"([^"]+)"/);
            
            return {
                running: true,
                sessions: sessions?.count || 0,
                messages: messages?.count || 0,
                tokens: usage?.tokens || 0,
                cost: usage?.cost || 0,
                model: modelMatch?.[1] || "unknown",
            };
        } finally {
            db.close();
        }
    },
    
    // GET /api/sessions
    async sessions(): Promise<object[]> {
        const db = getDB();
        if (!db) return [];
        
        try {
            const rows = db.prepare(`
                SELECT 
                    session_id,
                    COUNT(*) as messages,
                    (SELECT COUNT(*) FROM usage WHERE session_id = m.session_id) as tokens,
                    MAX(created_at) as last_active
                FROM messages m
                GROUP BY session_id
                ORDER BY last_active DESC
                LIMIT 50
            `).all() as any[];
            
            return rows.map(r => ({
                id: r.session_id,
                messages: r.messages,
                tokens: r.tokens || 0,
                lastActive: r.last_active,
            }));
        } finally {
            db.close();
        }
    },
    
    // GET /api/logs
    async logs(): Promise<object[]> {
        const logPath = "/tmp/velo_telegram.log";
        if (!fs.existsSync(logPath)) return [];
        
        const content = fs.readFileSync(logPath, "utf-8");
        const lines = content.split("\n").slice(-100);
        
        return lines.filter(l => l.trim()).map(line => {
            const match = line.match(/^\[?([^\]]+)\]?\s*(.*)$/);
            return {
                time: match?.[1] || "",
                message: match?.[2] || line,
            };
        });
    },
    
    // GET /api/config
    async getConfig(): Promise<object> {
        if (!fs.existsSync(CONFIG_PATH)) {
            return { agent: { name: "Velo", personality: "" }, model: "", keys: {} };
        }
        
        const config = fs.readFileSync(CONFIG_PATH, "utf-8");
        const env = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "";
        
        // Parse simple values
        const nameMatch = config.match(/name\s*=\s*"([^"]+)"/);
        const personalityMatch = config.match(/personality\s*=\s*"([^"]+)"/);
        const modelMatch = config.match(/model\s*=\s*"([^"]+)"/);
        
        // Parse env keys (don't expose values, just whether they're set)
        const keys: Record<string, string> = {};
        for (const line of env.split("\n")) {
            const [key, value] = line.split("=");
            if (key && value) {
                keys[key] = value.includes("nvapi") ? "nvapi-..." : 
                           value.includes("sk-") ? "sk-..." : 
                           value.length > 10 ? value.slice(0, 6) + "..." : "***";
            }
        }
        
        return {
            agent: {
                name: nameMatch?.[1] || "Velo",
                personality: personalityMatch?.[1] || "",
            },
            model: modelMatch?.[1] || "",
            keys,
        };
    },
    
    // POST /api/config
    async saveConfig(body: any): Promise<object> {
        // Update config.toml
        if (fs.existsSync(CONFIG_PATH)) {
            let config = fs.readFileSync(CONFIG_PATH, "utf-8");
            
            if (body.agent?.name) {
                config = config.replace(/name\s*=\s*"[^"]*"/, `name = "${body.agent.name}"`);
            }
            if (body.agent?.personality) {
                config = config.replace(/personality\s*=\s*"[^"]*"/, `personality = "${body.agent.personality}"`);
            }
            if (body.model) {
                config = config.replace(/model\s*=\s*"[^"]*"/, `model = "${body.model}"`);
            }
            
            fs.writeFileSync(CONFIG_PATH, config);
        }
        
        // Update env keys
        if (body.keys) {
            let env = "";
            if (fs.existsSync(ENV_PATH)) {
                env = fs.readFileSync(ENV_PATH, "utf-8");
            }
            
            for (const [key, value] of Object.entries(body.keys)) {
                if (value && String(value).trim()) {
                    const envKey = key.toUpperCase() + "_API_KEY";
                    const regex = new RegExp(`^${envKey}=.*$`, "m");
                    if (regex.test(env)) {
                        env = env.replace(regex, `${envKey}=${value}`);
                    } else {
                        env += `\n${envKey}=${value}`;
                    }
                }
            }
            
            fs.writeFileSync(ENV_PATH, env.trim() + "\n");
        }
        
        return { success: true };
    },
    
    // POST /api/start
    async start(): Promise<object> {
        // Signal to start the agent (would typically use IPC or spawn process)
        return { success: true, message: "Agent starting..." };
    },
    
    // POST /api/restart
    async restart(): Promise<object> {
        return { success: true, message: "Agent restarting..." };
    },
    
    // POST /api/compact
    async compact(): Promise<object> {
        return { success: true, message: "Sessions compacted" };
    },
    
    // GET /api/whatsapp/qr
    async whatsappQR(): Promise<object> {
        // This would connect to the WhatsApp bridge and get the QR
        return { qr: "QR code placeholder - run 'velo whatsapp login' in terminal" };
    },
};

// Router
async function handleAPI(method: string, path: string, body?: any): Promise<Response> {
    const route = path.replace("/api", "").replace(/^\//, "");
    
    try {
        let result: any;
        
        if (method === "GET") {
            switch (route) {
                case "status": result = await api.status(); break;
                case "sessions": result = await api.sessions(); break;
                case "logs": result = await api.logs(); break;
                case "config": result = await api.getConfig(); break;
                case "whatsapp/qr": result = await api.whatsappQR(); break;
                default: return new Response("Not Found", { status: 404 });
            }
        } else if (method === "POST") {
            switch (route) {
                case "config": result = await api.saveConfig(body); break;
                case "start": result = await api.start(); break;
                case "restart": result = await api.restart(); break;
                case "compact": result = await api.compact(); break;
                default: return new Response("Not Found", { status: 404 });
            }
        }
        
        return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}

// Main server
console.log(`
  ▓▓▓  Velo Dashboard  ▓▓▓
  
  Running on: http://localhost:${PORT}
  Config: ${CONFIG_PATH}
  Database: ${DB_PATH}
  
`);

serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);
        const method = req.method;
        const pathname = url.pathname;
        
        // API routes
        if (pathname.startsWith("/api")) {
            let body: any = null;
            if (method === "POST") {
                try {
                    body = await req.json();
                } catch {}
            }
            return handleAPI(method, pathname, body);
        }
        
        // Static files
        if (pathname === "/" || pathname === "/index.html") {
            return serveStatic("index.html");
        }
        
        return new Response("Not Found", { status: 404 });
    },
});