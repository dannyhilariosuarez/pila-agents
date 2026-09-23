import type { PilaAgentManifest } from "@pila/protocol";

/** Manifest for the GitHub CI Agent — continuous integration monitoring. */
export const githubCiManifest: PilaAgentManifest = {
  id: "github-ci-agent",
  name: "GitHub CI Agent",
  version: "1.0.0",
  author: "Danny",
  description:
    "Specialist GitHub agent for CI/CD monitoring — listing GitHub Actions workflow runs, checking build status, identifying failures, and reporting on CI health",
  category: "Technical",
  capabilities: [
    "List recent GitHub Actions workflow runs and their status",
    "Check if CI is passing or failing for a repository",
    "Identify failed workflow runs with details",
  ],
  inputSchema: {
    task: "string — the original user task",
    subTask: "string — the specific CI/CD monitoring assignment",
  },
  outputSchema: {
    success: true,
    data: {
      repository: "object — repository metadata",
      results: "array or object — CI/CD-specific results",
    },
    summary: "string — human readable summary of CI/CD status",
    confidence: 0.9,
    sources: ["GitHub REST API"],
    executionTime: 0,
  },
  pricing: {
    perExecution: 0.02,
    currency: "USD",
  },
  tags: ["github", "ci-cd", "github-actions", "workflows", "build-status"],
};
