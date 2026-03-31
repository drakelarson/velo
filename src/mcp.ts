/**
 * MCP (Model Context Protocol) Support
 * Enables Velo to act as both MCP server and client
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Skill } from "./types.ts";
import type { Agent } from "./agent.ts";

export interface MCPServerConfig {
  name: string;
  version: string;
  skills: Map<string, Skill>;
  agent?: Agent;
}

export class VeloMCPServer {
  private server: McpServer;
  private skills: Map<string, Skill>;
  private agent?: Agent;

  constructor(config: MCPServerConfig) {
    this.server = new McpServer({
      name: config.name,
      version: config.version,
    });
    this.skills = config.skills;
    this.agent = config.agent;

    // Register all skills as MCP tools
    this.registerTools();
  }

  private registerTools() {
    for (const [name, skill] of this.skills) {
      this.server.tool(
        name,
        skill.description,
        {
          action: z.string().optional().describe("Action to perform"),
          args: z.record(z.unknown()).optional().describe("Additional arguments"),
        },
        async (params: { action?: string; args?: Record<string, unknown> }) => {
          try {
            const result = await skill.execute({
              action: params.action,
              ...params.args,
            });
            return {
              content: [{ type: "text", text: result }],
            };
          } catch (err: any) {
            return {
              content: [{ type: "text", text: `Error: ${err.message}` }],
              isError: true,
            };
          }
        }
      );
    }
  }

  // Add a resource (for exposing memory, config, etc.)
  addResource(uri: string, name: string, description: string, read: () => Promise<string>) {
    this.server.resource(name, uri, { mimeType: "text/plain" }, async () => ({
      contents: [{ uri, mimeType: "text/plain", text: await read() }],
    }));
  }

  // Add a prompt template
  addPrompt(name: string, description: string, template: string) {
    this.server.prompt(name, { description }, () => ({
      messages: [{ role: "user", content: { type: "text", text: template } }],
    }));
  }

  // Start MCP server over stdio (for Claude Desktop, etc.)
  async startStdio() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("[MCP] Server started on stdio");
  }

  // Get server info for HTTP endpoint
  getServerInfo() {
    return {
      name: "Velo MCP Server",
      version: "0.1.0",
      tools: Array.from(this.skills.keys()),
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
      },
    };
  }
}

// MCP Client for connecting to external MCP servers
export class MCPClient {
  private tools: Map<string, { name: string; description: string; execute: (args: any) => Promise<string> }> = new Map();

  // Connect to an MCP server and discover tools
  async connectStdio(command: string, args: string[] = []): Promise<void> {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
    
    const client = new Client({ name: "velo-mcp-client", version: "0.1.0" }, {});
    const transport = new StdioClientTransport({ command, args });
    
    await client.connect(transport);
    
    // List available tools
    const { tools } = await client.request({ method: "tools/list" }, z.object({ tools: z.array(z.any()) }));
    
    for (const tool of tools) {
      this.tools.set(tool.name, {
        name: tool.name,
        description: tool.description || "",
        execute: async (args: any) => {
          const result = await client.request(
            { method: "tools/call", params: { name: tool.name, arguments: args } },
            z.any()
          );
          return result.content?.[0]?.text || JSON.stringify(result);
        },
      });
    }
    
    console.error(`[MCP] Connected to server, discovered ${tools.length} tools`);
  }

  // Get all discovered tools as Velo skills
  getToolsAsSkills(): Skill[] {
    return Array.from(this.tools.values()).map(t => ({
      name: `mcp_${t.name}`,
      description: t.description,
      execute: async (args) => t.execute(args),
    }));
  }

  // Call a specific tool
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`MCP tool not found: ${name}`);
    return tool.execute(args);
  }
}
