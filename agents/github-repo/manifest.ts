import type { PilaAgentManifest } from "@pila/protocol";

/** Manifest for the GitHub Repo Agent — repository structure operations. */
export const githubRepoManifest: PilaAgentManifest = {
  id: "github-repo-agent",
  name: "GitHub Repo Agent",
  version: "1.0.0",
  author: "Danny",
  description:
    "Specialist GitHub agent for repository operations — creating repos, listing user repositories, getting repo info, creating branches, reading and writing files, viewing recent activity, top contributors, and releases",
  category: "Technical",
  capabilities: [
    "List and count user repositories",
    "Get detailed repository information (stars, forks, language)",
    "Create new repositories",
    "Create branches from any base",
    "Create and update files in repositories",
    "Summarize recent repository activity (commits, merged PRs, open issues)",
    "Retrieve top contributors by commit count",
    "Show latest releases and tags",
  ],
  inputSchema: {
    task: "string — the original user task",
    subTask: "string — the specific repository operation assignment",
  },
  outputSchema: {
    success: true,
    data: {
      repository: "object — repository metadata",
      results: "array or object — repo-specific results",
    },
    summary: "string — human readable summary of repository data",
    confidence: 0.9,
    sources: ["GitHub REST API"],
    executionTime: 0,
  },
  pricing: {
    perExecution: 0.02,
    currency: "USD",
  },
  tags: [
    "github",
    "repositories",
    "branches",
    "files",
    "activity",
    "contributors",
    "releases",
  ],
};
