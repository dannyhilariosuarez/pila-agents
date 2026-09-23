/** GitHub Repo Agent — specialist agent for repository structure operations. */

import Anthropic from "@anthropic-ai/sdk";
import { Octokit } from "@octokit/rest";
import { PilaBaseAgent } from "@pila/protocol";
import type {
  AgentConfig,
  PilaAgentManifest,
  PilaInputSchema,
  PilaOutputSchema,
} from "@pila/protocol";
import { githubRepoManifest } from "./manifest.js";

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
  filePath?: string;
  fileContent?: string;
  repoPrivate?: boolean;
  description?: string;
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
- "user_repos": list/count the authenticated user's repositories
- "repo_info": general repo info (stars, forks, language, description)
- "create_repo": create a new repository
- "create_branch": create a new branch
- "create_or_update_file": create or update a file in the repo
- "recent_activity": recent commits, merged PRs, open issues
- "top_contributors": top contributors by commit count
- "latest_releases": recent releases/tags

Rules:
- Extract owner and repo from the query. If user says "my repo X", set owner to "" and repo to "X".
- If no repo is mentioned and intent requires one, set owner and repo to "" — do NOT guess.
- "limit": number of results. Default 10.
- For "create_repo": extract name into "repo", set "repoPrivate" based on user preference (default false), extract "description".
- For "create_or_update_file": extract "filePath", "fileContent", "branch" (default "main").
- If intent is unclear, default to "recent_activity".

Return format:
{ "owner": "", "repo": "", "intent": "user_repos", "limit": 10, "title": null, "branch": null, "base": null, "filePath": null, "fileContent": null, "repoPrivate": false, "description": null }`,
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

/** Repository specialist — creating repos, branches, files, viewing activity, contributors, releases. */
export class GitHubRepoAgent extends PilaBaseAgent {
  manifest: PilaAgentManifest = githubRepoManifest;

  constructor(config?: AgentConfig) {
    super(config);
    PilaBaseAgent.loadEnv(import.meta.url);
  }

  async run(input: PilaInputSchema): Promise<PilaOutputSchema> {
    this.log("Parsing GitHub Repo query...");
    const query = await parseQueryWithClaude(input.task, input.subTask);
    this.log(`Target: ${query.owner}/${query.repo}, intent: ${query.intent}`);

    const token = this.getApiKey("GITHUB_TOKEN");
    const octokit = new Octokit({ auth: token });
    const limit = Math.min(query.limit ?? 10, 100);

    // Handle intents that don't require a specific repo

    if (query.intent === "user_repos") {
      try {
        const repos = await octokit.paginate(
          octokit.repos.listForAuthenticatedUser,
          { per_page: 100, sort: "updated" },
        );
        const publicCount = repos.filter((r) => !r.private).length;
        const privateCount = repos.filter((r) => r.private).length;
        const topRepos = repos.slice(0, 10).map((r) => ({
          name: r.full_name,
          description: r.description,
          stars: r.stargazers_count,
          language: r.language,
          private: r.private,
          updated_at: r.updated_at,
        }));
        return {
          success: true,
          data: {
            query,
            total_count: repos.length,
            public_count: publicCount,
            private_count: privateCount,
            top_repos: topRepos,
          },
          summary: `You have ${repos.length} repositories on GitHub (${publicCount} public, ${privateCount} private). Most recently updated: ${topRepos
            .slice(0, 3)
            .map((r) => r.name)
            .join(", ")}.`,
          confidence: 0.95,
          sources: ["GitHub REST API"],
          executionTime: 0,
        };
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status === 401)
          return {
            success: false,
            data: { query },
            summary: "GitHub authentication failed. Check GITHUB_TOKEN.",
            confidence: 0,
            sources: ["GitHub REST API"],
            executionTime: 0,
            error: "GitHub authentication failed. Check GITHUB_TOKEN.",
          };
        throw err;
      }
    }

    if (query.intent === "create_repo") {
      const repoName = query.repo || "new-repo";
      const { data: newRepo } = await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description: query.description ?? undefined,
        private: query.repoPrivate ?? false,
        auto_init: true,
      });
      return {
        success: true,
        data: {
          repository: {
            full_name: newRepo.full_name,
            url: newRepo.html_url,
            private: newRepo.private,
          },
        },
        summary: `Created ${newRepo.private ? "private" : "public"} repository ${newRepo.full_name}. URL: ${newRepo.html_url}`,
        confidence: 0.95,
        sources: ["GitHub REST API"],
        executionTime: 0,
      };
    }

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

    // Guard — remaining intents require a repo
    if (!query.owner || !query.repo) {
      return {
        success: false,
        data: { query },
        summary:
          'I need a specific repository to do that. Try something like "show activity on owner/repo".',
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
        case "repo_info": {
          results = {
            full_name: repoData.full_name,
            description: repoData.description,
            stars: repoData.stargazers_count,
            forks: repoData.forks_count,
            open_issues: repoData.open_issues_count,
            language: repoData.language,
            created_at: repoData.created_at,
            updated_at: repoData.updated_at,
            default_branch: repoData.default_branch,
            license: repoData.license?.name ?? null,
            visibility: repoData.private ? "private" : "public",
          };
          summary = `${repoData.full_name}: ${repoData.description ?? "No description"}. ${repoData.stargazers_count.toLocaleString()} stars, ${repoData.forks_count.toLocaleString()} forks, ${repoData.open_issues_count} open issues. Primary language: ${repoData.language ?? "N/A"}.`;
          break;
        }
        case "recent_activity": {
          const [commitsRes, prsRes, issuesRes] = await Promise.all([
            octokit.repos.listCommits({
              owner: query.owner,
              repo: query.repo,
              per_page: limit,
            }),
            octokit.pulls.list({
              owner: query.owner,
              repo: query.repo,
              state: "closed",
              per_page: limit,
            }),
            octokit.issues.listForRepo({
              owner: query.owner,
              repo: query.repo,
              per_page: limit,
              state: "open",
            }),
          ]);
          const mergedPrs = prsRes.data.filter((pr) => pr.merged_at);
          results = {
            recent_commits: commitsRes.data.map((c) => ({
              sha: c.sha.slice(0, 7),
              message: c.commit.message.split("\n")[0],
              author: c.author?.login ?? c.commit.author?.name,
              date: c.commit.author?.date,
            })),
            merged_prs: mergedPrs.map((pr) => ({
              number: pr.number,
              title: pr.title,
              merged_at: pr.merged_at,
            })),
            open_issues: issuesRes.data
              .filter((i) => !i.pull_request)
              .map((i) => ({
                number: i.number,
                title: i.title,
                created_at: i.created_at,
              })),
          };
          const activity = results as {
            recent_commits: unknown[];
            merged_prs: unknown[];
            open_issues: unknown[];
          };
          summary = `Recent activity in ${repoData.full_name}: ${activity.recent_commits.length} recent commits, ${activity.merged_prs.length} PRs merged, ${activity.open_issues.length} open issues.`;
          break;
        }
        case "top_contributors": {
          const { data: contributors } = await octokit.repos.listContributors({
            owner: query.owner,
            repo: query.repo,
            per_page: limit,
          });
          results = contributors.map((c, i) => ({
            rank: i + 1,
            login: c.login,
            contributions: c.contributions,
            avatar_url: c.avatar_url,
          }));
          const contribList = results as Array<{
            rank: number;
            login: string;
            contributions: number;
          }>;
          const top = contribList
            .slice(0, 5)
            .map(
              (c) =>
                `${c.rank}. ${c.login} (${c.contributions.toLocaleString()} commits)`,
            )
            .join(", ");
          summary = `Top contributors to ${repoData.full_name}: ${top}.`;
          break;
        }
        case "latest_releases": {
          const { data: releases } = await octokit.repos.listReleases({
            owner: query.owner,
            repo: query.repo,
            per_page: limit,
          });
          results = releases.map((r) => ({
            tag: r.tag_name,
            name: r.name,
            published_at: r.published_at,
            prerelease: r.prerelease,
            author: r.author?.login,
          }));
          const releaseList = results as Array<{
            tag: string;
            name: string | null;
            published_at: string | null;
          }>;
          if (releaseList.length === 0) {
            summary = `No releases found for ${repoData.full_name}.`;
          } else {
            const latest = releaseList[0] as (typeof releaseList)[0];
            summary = `Found ${releaseList.length} release${releaseList.length > 1 ? "s" : ""} for ${repoData.full_name}. Latest: ${latest.tag}${latest.name ? ` "${latest.name}"` : ""}${latest.published_at ? ` (${timeAgo(latest.published_at)})` : ""}.`;
          }
          break;
        }
        case "create_branch": {
          const branchName = query.branch ?? "new-branch";
          const baseBranch = query.base ?? repoData.default_branch;
          const { data: ref } = await octokit.git.getRef({
            owner: query.owner,
            repo: query.repo,
            ref: `heads/${baseBranch}`,
          });
          await octokit.git.createRef({
            owner: query.owner,
            repo: query.repo,
            ref: `refs/heads/${branchName}`,
            sha: ref.object.sha,
          });
          results = {
            branch: branchName,
            base: baseBranch,
            sha: ref.object.sha,
          };
          summary = `Created branch "${branchName}" from ${baseBranch} in ${repoData.full_name}.`;
          break;
        }
        case "create_or_update_file": {
          const path = query.filePath ?? "README.md";
          const content = Buffer.from(query.fileContent ?? "").toString(
            "base64",
          );
          const branch = query.branch ?? repoData.default_branch;
          let existingSha: string | undefined;
          try {
            const { data: existing } = await octokit.repos.getContent({
              owner: query.owner,
              repo: query.repo,
              path,
              ref: branch,
            });
            if (!Array.isArray(existing) && existing.type === "file")
              existingSha = existing.sha;
          } catch {
            /* file doesn't exist */
          }
          const { data: file } = await octokit.repos.createOrUpdateFileContents(
            {
              owner: query.owner,
              repo: query.repo,
              path,
              message:
                query.title ?? `${existingSha ? "Update" : "Create"} ${path}`,
              content,
              branch,
              sha: existingSha,
            },
          );
          results = {
            path,
            branch,
            sha: file.content?.sha,
            action: existingSha ? "updated" : "created",
          };
          summary = `${existingSha ? "Updated" : "Created"} ${path} on branch ${branch} in ${repoData.full_name}.`;
          break;
        }
        default: {
          results = {};
          summary = `Unsupported repo operation. Try listing repos, getting repo info, creating branches, or managing files.`;
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
