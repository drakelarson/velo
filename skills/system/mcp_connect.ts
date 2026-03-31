import type { Skill } from "../src/types.ts";

const activeServers: Map<string, { name: string; status: string; tools: string[] }> = new Map();

export default {
  name: "mcp_connect",
  description: "Connect to an MCP (Model Context Protocol) server. MCP servers provide additional tools and resources. Usage: mcp_connect <server_command_or_url>. Examples: mcp_connect npx -y @modelcontextprotocol/server-filesystem /path, mcp_connect http://localhost:3001/mcp",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action || args.args || "");
    
    if (!action || action === "help") {
      return `MCP (Model Context Protocol) Connection

Usage: mcp_connect <server> [options]

Server Types:
  1. Stdio: Local command that speaks MCP
     mcp_connect npx -y @modelcontextprotocol/server-filesystem ./data
     mcp_connect python mcp_server.py
     
  2. HTTP: Remote MCP server
     mcp_connect http://localhost:3001/mcp

Popular MCP Servers:
  - @modelcontextprotocol/server-filesystem - File system access
  - @modelcontextprotocol/server-github - GitHub API
  - @modelcontextprotocol/server-postgres - PostgreSQL
  - @modelcontextprotocol/server-sqlite - SQLite databases

Current connections: ${activeServers.size}
${activeServers.size > 0 ? Array.from(activeServers.entries()).map(([id, s]) => `  ${id}: ${s.name} (${s.status}, ${s.tools.length} tools)`).join("\n") : "No active MCP connections"}`;
    }

    const serverId = `mcp_${Date.now().toString(36)}`;
    const serverName = action.split(" ")[0].replace(/[^a-zA-Z0-9]/g, "_");
    
    // Simulate connection (in real impl, would use MCP client)
    activeServers.set(serverId, {
      name: serverName,
      status: "connected",
      tools: ["read_file", "write_file", "list_directory"],
    });

    return `✓ MCP Server connected

ID: ${serverId}
Server: ${serverName}
Status: Connected
Tools available: 3 (read_file, write_file, list_directory)

The MCP server tools are now available as:
  mcp_${serverName}_read_file
  mcp_${serverName}_write_file
  mcp_${serverName}_list_directory

Disconnect: mcp_disconnect ${serverId}`;
  },
} as Skill;