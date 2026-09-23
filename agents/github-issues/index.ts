/** GitHub Issues Agent — specialist agent for issue tracking operations. */

import Anthropic from "@anthropic-ai/sdk";
import { Octokit } from "@octokit/rest";
import { PilaBaseAgent } from "@pila/protocol";
import type {
  AgentConfig,
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "@pila/protocol";
import { githubIssuesManifest } from "./manifest.js";

/** Structured query extracted from the user's natural-language request. */
interface ParsedQuery {
  owner: string;
  repo: string;
  intent: string;
  label?: string;
  state?: "open" | "closed" | "all";
  limit?: number;
  title?: string;
  body?: string;
  prNumber?: number;
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
- "issues_by_label": list issues, optionally filtered by label
- "create_issue": open a new issue
- "add_comment": comment on an issue

Rules:
- Extract owner and repo from the query. If user says "my repo X", set owner to "" and repo to "X".
- If no repo is mentioned and intent requires one, set owner and repo to "" — do NOT guess.
- "state": "open", "closed", or "all". Default "open" if not specified.
- "limit": number of results. Default 10.
- For "create_issue": extract "title", "body", "label".
- If intent is unclear, default to "issues_by_label".

Return format:
{ "owner": "", "repo": "", "intent": "issues_by_label", "state": "open", "limit": 10, "label": null, "title": null, "body": null, "prNumber": null }`,
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

/** Issue tracking specialist — searching, creating, and commenting on issues. */
export class GitHubIssuesAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest = githubIssuesManifest;

  constructor(config?: AgentConfig) {
    super(config);
    PilaBaseAgent.loadEnv(import.meta.url);
  }

  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    this.log("Parsing GitHub Issues query...");
    const query = await parseQueryWithClaude(input.task, input.subTask);
    this.log(`Target: ${query.owner}/${query.repo}, intent: ${query.intent}`);

    const token = this.getApiKey("GITHUB_TOKEN");
    const octokit = new Octokit({ auth: token });
    const state = query.state ?? "open";
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
          'I need a specific repository to do that. Try something like "create an issue on owner/repo".',
        confidence: 0,
        sources: ["GitHub REST API"],
        executionTime: 0,
        error: "No repository specified",
      };
    }

    const resolved = await this.resolveRepo(octokit, query);

    // resolveRepo returns PilaOutputSchema on error, repo data on success
    if ("success" in resolved && resolved.success === false) {
      return resolved as PilaOutputSchema;
    }
    const repoData = resolved as Awaited<
      ReturnType<typeof octokit.repos.get>
    >["data"];

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
        case "issues_by_label": {
          const { data: issues } = await octokit.issues.listForRepo({
            owner: query.owner,
            repo: query.repo,
            labels: query.label ?? undefined,
            state: state as "open" | "closed" | "all",
            per_page: limit,
          });
          const filtered = issues.filter((i) => !i.pull_request);
          results = filtered.map((i) => ({
            number: i.number,
            title: i.title,
            labels: i.labels.map((l) => (typeof l === "string" ? l : l.name)),
            author: i.user?.login,
            created_at: i.created_at,
          }));
          const issueList = results as Array<{ number: number }>;
          const labelStr = query.label ? ` labeled "${query.label}"` : "";
          summary = `Found ${issueList.length} ${state} issue${issueList.length !== 1 ? "s" : ""}${labelStr} in ${repoData.full_name}.`;
          break;
        }
        case "create_issue": {
          const { data: issue } = await octokit.issues.create({
            owner: query.owner,
            repo: query.repo,
            title: query.title ?? "New Issue",
            body: query.body ?? undefined,
            labels: query.label ? [query.label] : undefined,
          });
          results = {
            number: issue.number,
            url: issue.html_url,
            title: issue.title,
          };
          summary = `Created issue #${issue.number} "${issue.title}" in ${repoData.full_name}. ${issue.html_url}`;
          break;
        }
        case "add_comment": {
          const issueNum = query.prNumber ?? 1;
          const { data: comment } = await octokit.issues.createComment({
            owner: query.owner,
            repo: query.repo,
            issue_number: issueNum,
            body: query.body ?? "",
          });
          results = { id: comment.id, url: comment.html_url };
          summary = `Added comment to #${issueNum} in ${repoData.full_name}. ${comment.html_url}`;
          break;
        }
        default: {
          results = {};
          summary = `Unsupported issue operation. Try searching issues, creating an issue, or commenting.`;
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

  /**
   * Resolve a repository, retrying with the authenticated user's login on 404.
   * Handles the common case where users say "danny/pila" but their GitHub
   * login is actually "dannyhilariosuarez".
   */
  private async resolveRepo(
    octokit: InstanceType<typeof Octokit>,
    query: ParsedQuery,
  ): Promise<
    PilaOutputSchema | Awaited<ReturnType<typeof octokit.repos.get>>["data"]
  > {
    try {
      const { data } = await octokit.repos.get({
        owner: query.owner,
        repo: query.repo,
      });
      return data;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;

      if (status === 404) {
        // Retry with the authenticated user's login
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
            return data;
          }
        } catch {
          /* retry also failed */
        }
        return {
          success: false,
          data: { query },
          summary: `Repository ${query.owner}/${query.repo} not found.`,
          confidence: 0,
          sources: ["GitHub REST API"],
          executionTime: 0,
          error: `Repository ${query.owner}/${query.repo} not found`,
        };
      }

      if (status === 403) {
        return {
          success: false,
          data: { query },
          summary: "GitHub API rate limit exceeded.",
          confidence: 0,
          sources: ["GitHub REST API"],
          executionTime: 0,
          error: "GitHub API rate limit exceeded",
        };
      }

      if (status === 401) {
        return {
          success: false,
          data: { query },
          summary: "GitHub authentication failed. Check GITHUB_TOKEN.",
          confidence: 0,
          sources: ["GitHub REST API"],
          executionTime: 0,
          error: "GitHub authentication failed. Check GITHUB_TOKEN.",
        };
      }

      throw err;
    }
  }
}
