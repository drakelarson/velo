import type { Skill } from "../../src/types.ts";
export default {
  name: "github_repo_info",
  description: "Get GitHub repository info",
  async execute(args: Record<string, unknown>) {
    const repo = args.repo || args.args || "";
    if (!repo || !repo.includes("/")) return "Usage: github_repo_info owner/repo";
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}`);
      const data = await res.json() as any;
      if (data.message) return `Error: ${data.message}`;
      return `Repo: ${data.full_name}\nStars: ${data.stargazers_count}\nLanguage: ${data.language}\n${data.description}`;
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;