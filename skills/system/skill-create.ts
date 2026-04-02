import type { Skill } from "../../src/types.ts";

/**
 * Skill Creator - Guides Velo in creating new my-skills
 * 
 * This is a META-skill: when called, it returns guidance for creating
 * and installing a new skill into ~/.velo/my-skills/
 * 
 * Usage: "create a skill to..." or "make a new skill..."
 */
export default {
  name: "skill_create",
  description: "Creates and installs new Velo my-skills. Use when user wants to build a custom skill to extend Velo's capabilities. Triggers: 'create a skill', 'make a new skill', 'build a skill', 'add a skill', 'I need a skill that...'",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const intent = args.intent as string || "";
    
    // Return the skill creation guide
    return `## Velo Skill Creator Guide

To create a new my-skills skill:

### 1. Determine the Skill
- **Name**: Short, lowercase with underscores (e.g., \`crypto_price\`, \`weather_fetch\`)
- **Description**: Clear explanation of what it does and when to use it
- **Arguments**: What inputs it needs

### 2. Create the Skill File
Create at: \`~/.velo/my-skills/<skill-name>.ts\`

\`\`\`typescript
import type { Skill } from "../src/types.ts";

export default {
  name: "my_skill",
  description: "What this skill does and when to use it",
  async execute(args: Record<string, unknown>): Promise<string> {
    const input = args.query || args.input || "";
    
    // Your logic here
    
    return \`Result: \${input}\`;
  },
} as Skill;
\`\`\`

### 3. Handle Multiple Arg Names
\`\`\`typescript
const query = args.query || args.input || args.text || args.q || "";
const action = args.action || args.command || "";
const url = args.url || args.link || "";
const symbol = args.symbol || args.id || "";
\`\`\`

### 4. Best Practices
- Always handle errors gracefully
- Return useful, structured output
- Don't hardcode API keys - use process.env
- Write clear descriptions explaining WHEN to use the skill

### 5. Verify
Restart Velo or run \`/recover\`, then test:
\`use <skill_name> with query=value\`

### File Location
**Community skills**: \`~/.velo/my-skills/<skill-name>.ts\`
**Built-in skills**: \`/path/to/velo/skills/<category>/\`

### Example - Crypto Price Skill
\`\`\`typescript
import type { Skill } from "../src/types.ts";

export default {
  name: "crypto_price",
  description: "Fetch cryptocurrency prices from CoinGecko API",
  async execute(args: Record<string, unknown>): Promise<string> {
    const symbol = (args.symbol || "bitcoin").toString().toLowerCase();
    const currency = (args.currency || "usd").toString().toLowerCase();
    
    const response = await fetch(
      \`https://api.coingecko.com/api/v3/simple/price?ids=\${symbol}&vs_currencies=\${currency}\`
    );
    
    if (!response.ok) {
      return \`Error: \${response.statusText}\`;
    }
    
    const data = await response.json() as Record<string, Record<string, number>>;
    const price = data[symbol]?.[currency];
    
    return price ? \`\${symbol.toUpperCase()} = $\${price.toLocaleString()}\` : "Price not found";
  },
} as Skill;
\`\`\`

After creating, tell the user:
"Skill created at ~/.velo/my-skills/<skill-name>.ts — restart Velo or run /recover to load it."`;
  },
} as Skill;
