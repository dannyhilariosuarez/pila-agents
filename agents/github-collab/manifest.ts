import type { PilaAgentManifest } from "@pila/protocol";

/** Manifest for the GitHub Collaboration Agent — people and access management. */
export const githubCollabManifest: PilaAgentManifest = {
  id: "github-collab-agent",
  name: "GitHub Collaboration Agent",
  version: "1.0.0",
  author: "Danny",
  description:
    "Specialist GitHub agent for collaboration and access management — adding and removing collaborators, managing repository labels, and controlling permissions",
  category: "Technical",
  capabilities: [
    "Add collaborators to repositories with configurable permissions",
    "Manage repository labels (create, list)",
  ],
  inputSchema: {
    task: "string — the original user task",
    subTask: "string — the specific collaboration operation assignment",
  },
  outputSchema: {
    success: true,
    data: {
      repository: "object — repository metadata",
      results: "array or object — collaboration-specific results",
    },
    summary: "string — human readable summary of collaboration data",
    confidence: 0.9,
    sources: ["GitHub REST API"],
    executionTime: 0,
  },
  pricing: {
    perExecution: 0.02,
    currency: "USD",
  },
  tags: ["github", "collaborators", "labels", "permissions", "access-control"],
};
