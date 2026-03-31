import type { Skill } from "../src/types.ts";

export default {
  name: "mcp_tools",
  description: "List all available MCP tools from connected servers. Shows tool names, descriptions, and parameters.",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    // In real implementation, would query actual MCP connections
    return `MCP Tools Available

Built-in MCP-capable skills:
  • mcp_connect - Connect to MCP servers
  • mcp_tools - List available MCP tools
  • subagent_spawn - Spawn parallel agents
  • subagent_list - List active subagents
  • subagent_status - Check subagent status

To add more tools:
  1. Connect an MCP server: mcp_connect <server>
  2. Tools will be prefixed with mcp_<server>_

Popular MCP servers provide:
  - File system operations
  - Database queries
  - API integrations
  - Code execution`;
  },
} as Skill;