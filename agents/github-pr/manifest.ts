import type { PilaAgentManifest } from "@pila/protocol";

/** Manifest for the GitHub PR Agent — pull request operations. */
export const githubPrManifest: PilaAgentManifest = {
  id: "github-pr-agent",
  name: "GitHub PR Agent",
  version: "1.0.0",
  author: "Danny",
  description:
    "Specialist GitHub agent for pull request operations — listing, filtering, reviewing diffs with AI-powered code review, creating, merging, and commenting on pull requests",
  category: "Technical",
  capabilities: [
    "List and filter pull requests by state, author, or label",
    "Review pull request diffs with AI-powered code analysis",
    "Create new pull requests from branch to base",
    "Merge pull requests",
    "Add review comments to pull requests",
  ],
  inputSchema: {
    task: "string — the original user task",
    subTask: "string — the specific PR operation assignment",
  },
  outputSchema: {
    success: true,
    data: {
      repository: "object — repository metadata",
      results: "array or object — PR-specific results",
    },
    summary: "string — human readable summary of PR data",
    confidence: 0.9,
    sources: ["GitHub REST API"],
    executionTime: 0,
  },
  pricing: {
    perExecution: 0.02,
    currency: "USD",
  },
  tags: ["github", "pull-requests", "code-review", "merge", "diff"],
};
