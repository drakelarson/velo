import type { Skill } from "../../src/types.ts";
import type { Agent } from "../../src/agent.ts";

// Global MCP connections registry (persists across skill calls)
const activeConnections: Map<string, {
  name: string;
  status: string;
  tools: string[];
  client?: any;
}> = new Map();

// Store reference to agent for dynamic skill registration
let agentRef: Agent | null = null;

export function setAgentRef(agent: Agent) {
  agentRef = agent;
}

export default {
  name: "mcp_connect",
  description: "Connect to an MCP (Model Context Protocol) server. MCP servers provide additional tools and resources. Usage: mcp_connect <server_command_or_url>. Examples: mcp_connect npx -y @modelcontextprotocol/server-filesystem /path, mcp_connect http://localhost:3001/mcp",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action || args.args || "");
    
    // Help
    if (!action || action === "help") {
      return `MCP (Model Context Protocol) Connection

Usage: mcp_connect <server> [options]

Server Types:
  1. Stdio: Local command that speaks MCP over stdin/stdout
     mcp_connect npx -y @modelcontextprotocol/server-filesystem ./data
     mcp_connect python mcp_server.py
     
  2. HTTP: Remote MCP server (coming soon)
     mcp_connect http://localhost:3001/mcp

Popular MCP Servers:
  - @modelcontextprotocol/server-filesystem - File system access
  - @modelcontextprotocol/server-github - GitHub API
  - @modelcontextprotocol/server-postgres - PostgreSQL databases
  - @modelcontextprotocol/server-sqlite - SQLite databases
  - @modelcontextprotocol/server-brave-search - Web search

Current connections: ${activeConnections.size}
${activeConnections.size > 0 ? "\n" + Array.from(activeConnections.entries()).map(([id, s]) => `  ${id}: ${s.name} (${s.status}, ${s.tools.length} tools)`).join("\n") : "No active MCP connections"}

Commands:
  mcp_connect <server>     Connect to an MCP server
  mcp_connect list         List active connections
  mcp_connect disconnect <id>  Disconnect from server`;
    }

    // List connections
    if (action === "list") {
      if (activeConnections.size === 0) {
        return "No active MCP connections.";
      }
      let output = "Active MCP Connections:\n\n";
      for (const [id, conn] of activeConnections) {
        output += `  ${id}: ${conn.name}\n`;
        output += `    Status: ${conn.status}\n`;
        output += `    Tools: ${conn.tools.length}\n`;
      }
      return output;
    }

    // Disconnect
    if (action.startsWith("disconnect ")) {
      const connId = action.replace("disconnect ", "");
      const conn = activeConnections.get(connId);
      if (!conn) {
        return `Connection not found: ${connId}`;
      }
      if (conn.client) {
        try {
          await conn.client.close?.();
        } catch {}
      }
      activeConnections.delete(connId);
      return `✓ Disconnected from: ${connId}`;
    }

    // Connect to stdio MCP server
    try {
      const { MCPClient } = await import("../../src/mcp.ts");
      const client = new MCPClient();
      
      // Parse command (e.g., "npx -y @modelcontextprotocol/server-filesystem ./data")
      const parts = action.split(" ");
      const command = parts[0];
      const cmdArgs = parts.slice(1);
      
      // Connect via stdio
      await client.connectStdio(command, cmdArgs);
      
      // Get discovered tools
      const tools = client.getToolsAsSkills();
      const toolNames = tools.map(t => t.name);
      
      // Generate connection ID
      const connId = `mcp_${Date.now().toString(36)}`;
      const serverName = command.replace(/[^a-zA-Z0-9]/g, "_");
      
      // Register tools with agent
      if (agentRef) {
        for (const tool of tools) {
          agentRef.registerSkill(tool);
        }
      }
      
      // Store connection
      activeConnections.set(connId, {
        name: serverName,
        status: "connected",
        tools: toolNames,
        client,
      });
      
      return `✓ MCP Server connected

ID: ${connId}
Server: ${serverName}
Command: ${action}
Status: Connected

Tools discovered: ${tools.length}
${toolNames.slice(0, 10).map(t => `  - ${t}`).join("\n")}${toolNames.length > 10 ? `\n  ... and ${toolNames.length - 10} more` : ""}

All tools are now available for use.
Disconnect: mcp_connect disconnect ${connId}`;
      
    } catch (err: any) {
      return `Failed to connect to MCP server: ${err.message}

Make sure the MCP server is installed and accessible.
For npm packages, try: npx -y <package-name>

Example:
  mcp_connect npx -y @modelcontextprotocol/server-filesystem ./data`;
    }
  },
} as Skill;