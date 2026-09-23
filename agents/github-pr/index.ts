/** GitHub PR Agent — specialist agent for pull request operations. */

import Anthropic from "@anthropic-ai/sdk";
import { Octokit } from "@octokit/rest";
import { PilaBaseAgent } from "@pila/protocol";
import type {
  AgentConfig,
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "@pila/protocol";
import { githubPrManifest } from "./manifest.js";

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
  branch?: string;
  base?: string;
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
- "list_prs": list pull requests (respects state filter)
- "review_pr": review a specific PR's diff and add comments
- "create_pr": create a pull request (needs branch and base)
- "merge_pr": merge a pull request
- "add_comment": comment on a PR

Rules:
- Extract owner and repo from the query. If user says "my repo X", set owner to "" and repo to "X".
- If no repo is mentioned and intent requires one, set owner and repo to "" — do NOT guess.
- "state": "open", "closed", or "all". Default "open" if not specified.
- "limit": number of results. Default 10.
- For "create_pr": extract "title", "body", "branch" (head), "base" (default "main").
- If intent is unclear, default to "list_prs".

Return format:
{ "owner": "", "repo": "", "intent": "list_prs", "state": "open", "limit": 10, "title": null, "body": null, "branch": null, "base": null, "prNumber": null }`,
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

/** Format a relative time string from a date. */
function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Pull request specialist — listing, reviewing, creating, merging, and commenting on PRs. */
export class GitHubPrAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest = githubPrManifest;

  constructor(config?: AgentConfig) {
    super(config);
    PilaBaseAgent.loadEnv(import.meta.url);
  }

  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    this.log("Parsing GitHub PR query...");
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
          'I need a specific repository to do that. Try something like "show PRs on owner/repo".',
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
        case "list_prs": {
          const { data: prs } = await octokit.pulls.list({
            owner: query.owner,
            repo: query.repo,
            state: state as "open" | "closed" | "all",
            per_page: limit,
          });
          results = prs.map((pr) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user?.login,
            created_at: pr.created_at,
            updated_at: pr.updated_at,
            labels: pr.labels.map((l) => (typeof l === "string" ? l : l.name)),
          }));
          const prList = results as Array<{
            number: number;
            title: string;
            author: string;
            created_at: string;
          }>;
          if (prList.length === 0) {
            summary = `No ${state} pull requests in ${repoData.full_name}.`;
          } else {
            const newest = prList[0] as (typeof prList)[0];
            summary = `Found ${prList.length} ${state} PR${prList.length > 1 ? "s" : ""} in ${repoData.full_name}. Most recent: "#${newest.number} ${newest.title}" by ${newest.author} (${timeAgo(newest.created_at)}).`;
          }
          break;
        }
        case "review_pr": {
          const prNum = query.prNumber ?? 1;
          const { data: pr } = await octokit.pulls.get({
            owner: query.owner,
            repo: query.repo,
            pull_number: prNum,
          });
          const { data: files } = await octokit.pulls.listFiles({
            owner: query.owner,
            repo: query.repo,
            pull_number: prNum,
            per_page: limit,
          });
          const diffSummary = files
            .map(
              (f) =>
                `### ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})\n\`\`\`diff\n${(f.patch ?? "").slice(0, 1500)}\n\`\`\``,
            )
            .join("\n\n");
          const reviewResponse = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 1024,
            system: `You are a senior code reviewer. Review the PR diff and provide:\n1. A 1-2 sentence overall assessment\n2. Key issues or concerns (bugs, security, performance)\n3. Suggestions for improvement\nBe concise and actionable. If the code looks good, say so briefly.`,
            messages: [
              {
                role: "user",
                content: `PR #${pr.number}: "${pr.title}" by ${pr.user?.login}\n\nDescription: ${pr.body ?? "None"}\n\nChanges:\n${diffSummary}`,
              },
            ],
          });
          const reviewText = (() => {
            const b = reviewResponse.content[0];
            return b && b.type === "text"
              ? b.text
              : "Could not generate review.";
          })();
          results = {
            number: pr.number,
            title: pr.title,
            state: pr.state,
            author: pr.user?.login,
            body: pr.body,
            additions: pr.additions,
            deletions: pr.deletions,
            changed_files: pr.changed_files,
            files: files.map((f) => ({
              filename: f.filename,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
            })),
            review: reviewText,
          };
          summary = `Code review for PR #${pr.number} "${pr.title}" (+${pr.additions}/-${pr.deletions}, ${pr.changed_files} files):\n\n${reviewText}`;
          break;
        }
        case "create_pr": {
          const { data: pr } = await octokit.pulls.create({
            owner: query.owner,
            repo: query.repo,
            title: query.title ?? "New Pull Request",
            body: query.body ?? undefined,
            head: query.branch ?? "feature",
            base: query.base ?? repoData.default_branch,
          });
          results = { number: pr.number, url: pr.html_url, title: pr.title };
          summary = `Opened PR #${pr.number} "${pr.title}" (${query.branch} → ${query.base ?? repoData.default_branch}) in ${repoData.full_name}. ${pr.html_url}`;
          break;
        }
        case "merge_pr": {
          const prNum = query.prNumber ?? 1;
          const { data: merge } = await octokit.pulls.merge({
            owner: query.owner,
            repo: query.repo,
            pull_number: prNum,
          });
          results = {
            sha: merge.sha,
            merged: merge.merged,
            message: merge.message,
          };
          summary = merge.merged
            ? `Merged PR #${prNum} in ${repoData.full_name}.`
            : `Failed to merge PR #${prNum}: ${merge.message}`;
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
          summary = `Unsupported PR operation. Try listing PRs, reviewing a PR, creating, merging, or commenting.`;
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
