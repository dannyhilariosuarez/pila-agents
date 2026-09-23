import type { PilaAgentManifest } from "@pila/protocol";

/** Manifest for the GitHub Issues Agent — issue tracking operations. */
export const githubIssuesManifest: PilaAgentManifest = {
  id: "github-issues-agent",
  name: "GitHub Issues Agent",
  version: "1.0.0",
  author: "Danny",
  description:
    "Specialist GitHub agent for issue tracking — searching, filtering, creating, labeling, assigning, closing, and commenting on issues",
  category: "Technical",
  capabilities: [
    "Search and filter issues by label, status, or assignee",
    "Create new issues with title, body, and labels",
    "Add comments to existing issues",
  ],
  inputSchema: {
    task: "string — the original user task",
    subTask: "string — the specific issue operation assignment",
  },
  outputSchema: {
    success: true,
    data: {
      repository: "object — repository metadata",
      results: "array or object — issue-specific results",
    },
    summary: "string — human readable summary of issue data",
    confidence: 0.9,
    sources: ["GitHub REST API"],
    executionTime: 0,
  },
  pricing: {
    perExecution: 0.02,
    currency: "USD",
  },
  tags: ["github", "issues", "bug-tracking", "issue-management"],
};
