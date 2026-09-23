/** GitHub CI Agent — specialist agent for CI/CD monitoring. */

import Anthropic from "@anthropic-ai/sdk";
import { Octokit } from "@octokit/rest";
import { PilaBaseAgent } from "@pila/protocol";
import type {
  AgentConfig,
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "@pila/protocol";
import { githubCiManifest } from "./manifest.js";

/** Structured query extracted from the user's natural-language request. */
interface ParsedQuery {
  owner: string;
  repo: string;
  intent: string;
  limit?: number;
}

const anthropic = new Anthropic();
const CLAUDE_MODEL = "claude-haiku-4-5-20251001" as const;

/** Use Claude to extract repository info and intent from a natural-language query. */
async function parseQueryWithClaude(
  task: string,
  subTask: string,
): Promise<ParsedQuery> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    system: `Extract a GitHub query from the user's request. Return ONLY valid JSON.

Available intents:
- "list_workflows": list GitHub Actions workflow runs and their status

Rules:
- Extract owner and repo from the query. If user says "my repo X", set owner to "" and repo to "X".
- If no repo is mentioned, set owner and repo to "" — do NOT guess.
- "limit": number of results. Default 10.
- If intent is unclear, default to "list_workflows".

Return format:
{ "owner": "", "repo": "", "intent": "list_workflows", "limit": 10 }`,
    messages: [
      {
        role: "user",
        content: `Original task: ${task}\nSpecific assignment: ${subTask}`,
      },
    ],
  });

  const raw = (() => {
    const b = message.content[0];
    return b && b.type === "text" ? b.text : "{}";
  })();
  const cleaned = raw
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(start, end + 1)) as ParsedQuery;
}

/** CI/CD specialist — monitoring GitHub Actions workflow runs and build status. */
export class GitHubCiAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest = githubCiManifest;

  constructor(config?: AgentConfig) {
    super(config);
    PilaBaseAgent.loadEnv(import.meta.url);
  }

  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    this.log("Parsing GitHub CI query...");
    const query = await parseQueryWithClaude(input.task, input.subTask);
    this.log(`Target: ${query.owner}/${query.repo}, intent: ${query.intent}`);

    const token = this.getApiKey("GITHUB_TOKEN");
    const octokit = new Octokit({ auth: token });
    const limit = Math.min(query.limit ?? 10, 100);

    // If repo is given but no owner, try the authenticated user
    if (!query.owner && query.repo) {
      try {
        const { data: me } = await octokit.users.getAuthenticated();
        query.owner = me.login;
        this.log(`No owner specified — using authenticated user: ${me.login}`);
      } catch {
        /* will fail below */
      }
    }

    if (!query.owner || !query.repo) {
      return {
        success: false,
        data: { query },
        summary:
          'I need a specific repository to check CI status. Try something like "check CI on owner/repo".',
        confidence: 0,
        sources: ["GitHub REST API"],
        executionTime: 0,
        error: "No repository specified",
      };
    }

    let repoData!: Awaited<ReturnType<typeof octokit.repos.get>>["data"];
    try {
      const { data } = await octokit.repos.get({
        owner: query.owner,
        repo: query.repo,
      });
      repoData = data;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        // Retry with the authenticated user's login (handles "danny/pila" → "dannyhilariosuarez/pila")
        let retried = false;
        try {
          const { data: me } = await octokit.users.getAuthenticated();
          if (me.login !== query.owner) {
            this.log(
              `Repo not found as ${query.owner}/${query.repo}, retrying as ${me.login}/${query.repo}`,
            );
            const { data } = await octokit.repos.get({
              owner: me.login,
              repo: query.repo,
            });
            query.owner = me.login;
            repoData = data;
            retried = true;
          }
        } catch {
          /* retry also failed */
        }
        if (!retried)
          return {
            success: false,
            data: { query },
            summary: `Repository ${query.owner}/${query.repo} not found.`,
            confidence: 0,
            sources: ["GitHub REST API"],
            executionTime: 0,
            error: `Repository ${query.owner}/${query.repo} not found`,
          };
      } else if (status === 403)
        return {
          success: false,
          data: { query },
          summary: "GitHub API rate limit exceeded.",
          confidence: 0,
          sources: ["GitHub REST API"],
          executionTime: 0,
          error: "GitHub API rate limit exceeded",
        };
      else if (status === 401)
        return {
          success: false,
          data: { query },
          summary: "GitHub authentication failed. Check GITHUB_TOKEN.",
          confidence: 0,
          sources: ["GitHub REST API"],
          executionTime: 0,
          error: "GitHub authentication failed. Check GITHUB_TOKEN.",
        };
      else throw err;
    }

    const repoMeta = {
      full_name: repoData.full_name,
      description: repoData.description,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      open_issues: repoData.open_issues_count,
      language: repoData.language,
    };
    let results: unknown;
    let summary: string;

    try {
      switch (query.intent) {
        case "list_workflows": {
          const { data: runs } = await octokit.actions.listWorkflowRunsForRepo({
            owner: query.owner,
            repo: query.repo,
            per_page: limit,
          });
          results = runs.workflow_runs.map((r) => ({
            id: r.id,
            name: r.name,
            status: r.status,
            conclusion: r.conclusion,
            branch: r.head_branch,
            created_at: r.created_at,
            url: r.html_url,
          }));
          const failed = runs.workflow_runs.filter(
            (r) => r.conclusion === "failure",
          ).length;
          summary = `${runs.workflow_runs.length} recent workflow runs in ${repoData.full_name}. ${failed > 0 ? `${failed} failed.` : "All passing."}`;
          break;
        }
        default: {
          results = {};
          summary = `Unsupported CI operation. Try checking workflow run status or listing recent CI runs.`;
          break;
        }
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 403)
        return {
          success: false,
          data: { query, repository: repoMeta },
          summary: "GitHub API rate limit exceeded.",
          confidence: 0,
          sources: ["GitHub REST API"],
          executionTime: 0,
          error: "GitHub API rate limit exceeded",
        };
      throw err;
    }

    return {
      success: true,
      data: { query, repository: repoMeta, results },
      summary,
      confidence: 0.9,
      sources: ["GitHub REST API"],
      executionTime: 0,
    };
  }
}
