import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "docker_images",
  description: "List Docker images",
  async execute() {
    try {
      return execSync("docker images", { encoding: "utf-8" });
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
