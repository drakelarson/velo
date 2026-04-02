import type { Skill } from "../../src/types.ts";

export default {
  name: "mcp_tools"
    category: "System",,
  description: "List all available MCP tools from connected servers. Shows tool names, descriptions, and parameters.",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    // Import the connections map from mcp_connect
    const mcpConnect = await import("./mcp_connect.ts");
    const activeConnections = (mcpConnect as any).activeConnections || new Map();
    
    let output = "📡 MCP Tools Overview\n\n";
    
    // Built-in MCP capabilities
    output += "Built-in MCP-capable skills:\n";
    output += "  • mcp_connect - Connect to MCP servers\n";
    output += "  • mcp_tools - List available MCP tools\n\n";
    
    // Show connected servers and their tools
    if (activeConnections.size === 0) {
      output += "No MCP servers connected.\n\n";
      output += "To connect:\n";
      output += "  mcp_connect npx -y @modelcontextprotocol/server-filesystem ./data\n";
      output += "  mcp_connect npx -y @modelcontextprotocol/server-github\n";
    } else {
      output += `Connected Servers: ${activeConnections.size}\n\n`;
      
      for (const [id, conn] of activeConnections) {
        output += `━━━ ${conn.name} (${id}) ━━━\n`;
        output += `  Status: ${conn.status}\n`;
        output += `  Tools: ${conn.tools.length}\n`;
        
        if (conn.tools.length > 0) {
          output += "  Available:\n";
          for (const tool of conn.tools.slice(0, 15)) {
            output += `    - ${tool}\n`;
          }
          if (conn.tools.length > 15) {
            output += `    ... and ${conn.tools.length - 15} more\n`;
          }
        }
        output += "\n";
      }
      
      output += "All MCP tools are automatically available for use.\n";
      output += "Disconnect: mcp_connect disconnect <id>";
    }
    
    return output;
  },
} as Skill;