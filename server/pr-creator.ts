import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CreatePROptions {
  repo: string; // path to the git repo
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
}

export interface PRResult {
  url: string;
  id: number;
  status: string;
}

/**
 * Derive the Azure DevOps organization, project, and repository
 * from the git remote URL configured in the local repo.
 */
async function parseRemoteUrl(repoPath: string): Promise<{
  org: string;
  project: string;
  repoName: string;
} | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["remote", "get-url", "origin"],
      { cwd: repoPath, encoding: "utf-8", timeout: 5000 },
    );
    const remoteUrl = stdout.trim();

    // SSH format: git@ssh.dev.azure.com:v3/enpal/Energy-Business-Automation/energy-business-automation-biz-ops
    const sshMatch = remoteUrl.match(
      /git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/(.+)/,
    );
    if (sshMatch && sshMatch[1] && sshMatch[2] && sshMatch[3]) {
      return {
        org: sshMatch[1],
        project: sshMatch[2],
        repoName: sshMatch[3],
      };
    }

    // HTTPS format: https://dev.azure.com/enpal/Energy-Business-Automation/_git/energy-business-automation-biz-ops
    const httpsMatch = remoteUrl.match(
      /dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/(.+)/,
    );
    if (httpsMatch && httpsMatch[1] && httpsMatch[2] && httpsMatch[3]) {
      return {
        org: httpsMatch[1],
        project: httpsMatch[2],
        repoName: httpsMatch[3],
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get Azure DevOps PAT from git credential helper or environment.
 * Tries AZURE_DEVOPS_PAT env var first, then git credential helper.
 */
async function getAzureToken(): Promise<string | null> {
  // 1. Check env var
  const envToken = process.env["AZURE_DEVOPS_PAT"];
  if (envToken) return envToken;

  // 2. Try git credential helper
  try {
    const { stdout } = await execFileAsync(
      "bash",
      [
        "-c",
        'printf "protocol=https\\nhost=dev.azure.com\\n\\n" | git credential fill',
      ],
      { encoding: "utf-8", timeout: 5000 },
    );
    const result = stdout.trim();

    const passwordLine = result
      .split("\n")
      .find((line) => line.startsWith("password="));
    if (passwordLine) {
      return passwordLine.replace("password=", "");
    }
  } catch {
    // Credential helper not configured or failed
  }

  return null;
}

export async function createPR(opts: CreatePROptions): Promise<PRResult> {
  const remote = await parseRemoteUrl(opts.repo);
  if (!remote) {
    throw new Error(
      `Could not parse Azure DevOps remote URL from repo at ${opts.repo}`,
    );
  }

  const token = await getAzureToken();
  if (!token) {
    throw new Error(
      "No Azure DevOps PAT found. Set AZURE_DEVOPS_PAT env var or configure git credential helper.",
    );
  }

  const apiUrl = `https://dev.azure.com/${remote.org}/${remote.project}/_apis/git/repositories/${remote.repoName}/pullrequests?api-version=7.1`;

  // Azure DevOps wants full ref paths
  const sourceRef = opts.sourceBranch.startsWith("refs/")
    ? opts.sourceBranch
    : `refs/heads/${opts.sourceBranch}`;
  const targetRef = opts.targetBranch.startsWith("refs/")
    ? opts.targetBranch
    : `refs/heads/${opts.targetBranch}`;

  const body = {
    sourceRefName: sourceRef,
    targetRefName: targetRef,
    title: opts.title,
    description: opts.description,
  };

  const authHeader = `Basic ${Buffer.from(`:${token}`).toString("base64")}`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Azure DevOps API error (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    pullRequestId: number;
    status: string;
    url: string;
    repository?: { webUrl?: string };
  };

  // Build the web URL for the PR
  const webUrl =
    data.repository?.webUrl ??
    `https://dev.azure.com/${remote.org}/${remote.project}/_git/${remote.repoName}`;
  const prWebUrl = `${webUrl}/pullrequest/${data.pullRequestId}`;

  return {
    url: prWebUrl,
    id: data.pullRequestId,
    status: data.status,
  };
}

/**
 * Get list of branches from a repo (used for target branch dropdown).
 */
export async function getRepoBranches(repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["branch", "-a", "--format=%(refname:short)"],
      { cwd: repoPath, encoding: "utf-8", timeout: 5000 },
    );
    const output = stdout.trim();

    if (!output) return [];

    const branches = output
      .split("\n")
      .map((b) => b.trim().replace(/^'|'$/g, ""))
      .filter((b) => b.length > 0)
      // Remove remote tracking duplicates, keep the clean name
      .map((b) => b.replace(/^origin\//, ""))
      // Deduplicate
      .filter((b, i, arr) => arr.indexOf(b) === i)
      // Sort: main/master first
      .sort((a, b) => {
        if (a === "main" || a === "master") return -1;
        if (b === "main" || b === "master") return 1;
        return a.localeCompare(b);
      });

    return branches;
  } catch {
    return [];
  }
}
