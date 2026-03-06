import os
import json
import re
import time
import requests
from github import Github, Auth

gh_token = os.environ.get("GITHUB_TOKEN")
gemini_key = os.environ.get("GEMINI_API_KEY")
repo_name = os.environ.get("REPOSITORY")
event_name = os.environ.get("EVENT_NAME")
allowed_user = os.environ.get("ALLOWED_USER", "").strip().lower()

auth = Auth.Token(gh_token)
gh = Github(auth=auth)
repo = gh.get_repo(repo_name)

diff_text = ""
event_context = ""
author_login = ""
trigger_labels = []
pr_ref = None

if event_name == "push":
    commit_sha = os.environ.get("COMMIT_SHA")
    commit = repo.get_commit(commit_sha)

    if len(commit.parents) > 1:
        print("Merge commit detected, skipping.")
        exit(0)
    if not commit.author:
        print("No commit author, skipping.")
        exit(0)

    author_login = commit.author.login.strip().lower()
    if author_login != allowed_user:
        print(f"Author '{author_login}' not allowed, skipping.")
        exit(0)

    event_context = f"Commit Message: {commit.commit.message}"
    trigger_labels = [m.lower() for m in re.findall(r'\[(.*?)\]', commit.commit.message)]
    print(f"Labels detected: {trigger_labels}")

    for file in commit.files:
        diff_text += f"File: {file.filename}\nPatch:\n{file.patch}\n\n"
        if len(diff_text) > 100000:
            diff_text += "\n[Diff too large, truncated...]"
            break

elif event_name == "pull_request":
    pr_number = int(os.environ.get("PR_NUMBER"))
    pr = repo.get_pull(pr_number)
    author_login = pr.user.login.strip().lower()
    if author_login != allowed_user:
        print(f"Author '{author_login}' not allowed, skipping.")
        exit(0)

    pr_ref = pr
    event_context = f"PR Title: {pr.title}\nPR Body: {pr.body}"
    trigger_labels = [label.name.lower() for label in pr.labels]
    print(f"Labels detected: {trigger_labels}")

    for file in pr.get_files():
        diff_text += f"File: {file.filename}\nPatch:\n{file.patch}\n\n"
        if len(diff_text) > 100000:
            diff_text += "\n[Diff too large, truncated...]"
            break
else:
    exit(0)

if len(diff_text.strip()) < 50:
    print("Diff too small to analyze. Skipping.")
    exit(0)

base_instructions = """
Return only a raw JSON object with no markdown formatting. The JSON must have these exact keys:

"issue_title": string — include severity prefix like [CRITICAL], [HIGH], [MEDIUM], or [LOW] at the start,
"severity": string — one of: critical, high, medium, low,
"issue_body": string — MUST be under 3500 characters total. Be concise. Must include these sections:
  ## Problem
  (2-3 sentences max, with exact file path and line number)

  ## Code Reference
  (only the most relevant snippet, 5-10 lines max)

  ## Suggested Fix
  (concrete and brief, 3-5 lines max)

"labels": list of strings — choose from: bug, documentation, enhancement, security, good first issue, help wanted, question,
"affected_file": string — the most relevant filename from the diff (or "" if unknown),
"affected_line": integer — approximate line number of the issue (or 1 if unknown),
"summary": string — 2-3 sentence plain-English summary for the PR comment

The issue_title, issue_body and summary MUST be written entirely in English.
"""

if any(l in trigger_labels for l in ["sec", "security", "audit"]):
    prompt = f"Act as a Strict Security Auditor. Perform a deep security audit (OWASP Top 10). Find real vulnerabilities with exact file/line references.\nContext: {event_context}\nChanges: {diff_text}\n{base_instructions}"
elif any(l in trigger_labels for l in ["review", "refactor", "code-review"]):
    prompt = f"Act as a Strict Code Reviewer. Analyze code quality (SOLID/DRY). Point to exact lines that violate principles.\nContext: {event_context}\nChanges: {diff_text}\n{base_instructions}"
elif any(l in trigger_labels for l in ["qa", "test", "testing"]):
    prompt = f"Act as a QA Engineer. Identify edge cases and missing test coverage. Reference exact functions/lines.\nContext: {event_context}\nChanges: {diff_text}\n{base_instructions}"
elif any(l in trigger_labels for l in ["perf", "performance", "optimize"]):
    prompt = f"Act as a Performance Expert. Analyze bottlenecks and O(n) complexity issues with exact line references.\nContext: {event_context}\nChanges: {diff_text}\n{base_instructions}"
elif any(l in trigger_labels for l in ["pm", "release", "product"]):
    prompt = f"Act as a Product Manager. Generate user-facing Release Notes with clear impact descriptions.\nContext: {event_context}\nChanges: {diff_text}\n{base_instructions}"
elif any(l in trigger_labels for l in ["deps", "dependencies"]):
    prompt = f"Act as a Security & Dependency Auditor. Analyze all new or changed dependencies: check for known vulnerabilities (CVEs), license compatibility (MIT/Apache/GPL), package size impact, and whether each dep is actively maintained. Reference exact file and line where dep is added.\nContext: {event_context}\nChanges: {diff_text}\n{base_instructions}"
elif any(l in trigger_labels for l in ["arch", "architecture"]):
    prompt = f"Act as a Software Architect. Review the code changes for architectural issues: violation of separation of concerns, tight coupling, wrong layer dependencies, anti-patterns (God object, spaghetti logic, magic numbers). Reference exact files and lines.\nContext: {event_context}\nChanges: {diff_text}\n{base_instructions}"
else:
    prompt = f"""Analyze the following code changes and create a documentation issue summarizing what was changed and why.
IMPORTANT: Do NOT invent security issues, bugs, or problems that do not exist in the diff.
If the changes are trivial (e.g. adding imports, minor refactoring), set severity to LOW and describe only what actually changed.
Context: {event_context}
Changes: {diff_text}
{base_instructions}"""

def call_gemini(prompt: str) -> dict:
    models_to_try = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
    ]
    headers = {"Content-Type": "application/json"}
    payload = {"contents": [{"parts": [{"text": prompt}]}]}

    for model in models_to_try:
        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={gemini_key}"
        for attempt in range(4):
            try:
                print(f"[{model}] Attempt {attempt + 1}...")
                resp = requests.post(api_url, json=payload, headers=headers, timeout=60)

                if resp.status_code == 429:
                    wait = 15 * (2 ** attempt)
                    print(f"[{model}] Rate limited. Waiting {wait}s...")
                    time.sleep(wait)
                    continue

                resp.raise_for_status()
                data = resp.json()
                response_text = data['candidates'][0]['content']['parts'][0]['text'].strip()

                if response_text.startswith("```json"):
                    response_text = response_text[7:]
                elif response_text.startswith("```"):
                    response_text = response_text[3:]
                if response_text.endswith("```"):
                    response_text = response_text[:-3]

                result = json.loads(response_text.strip())
                print(f"Success with model: {model}")
                return result

            except Exception as e:
                print(f"[{model}] Attempt {attempt + 1} failed: {e}")
                if attempt < 3:
                    time.sleep(10)

        print(f"[{model}] All attempts failed, trying next model...")

    print("All models exhausted. Exiting gracefully.")
    exit(0)

print("Calling Gemini API...")
result = call_gemini(prompt)

affected_file = result.get("affected_file", "")
affected_line = result.get("affected_line", 1)

if affected_file:
    sha = os.environ.get("COMMIT_SHA") or (pr_ref.head.sha if pr_ref else "")
    permalink = f"\n\n**📎 Code Reference:** [View on GitHub](https://github.com/{repo_name}/blob/{sha}/{affected_file}#L{affected_line})"
else:
    permalink = ""

severity = result.get("severity", "medium").lower()
severity_label_map = {
    "critical": "severity: critical",
    "high":     "severity: high",
    "medium":   "severity: medium",
    "low":      "severity: low",
}
severity_label = severity_label_map.get(severity, "severity: medium")
all_labels = list(set(result.get("labels", []) + [severity_label]))

if event_name == "push":
    footer = f"\n\n---\n*Generated automatically from commit {os.environ.get('COMMIT_SHA')[:7]}*"
else:
    footer = f"\n\n---\n*Generated automatically from PR #{os.environ.get('PR_NUMBER')}*"

issue_body = (result['issue_body'] + permalink)[:3800] + footer

print("Creating issue...")
issue = repo.create_issue(
    title=result['issue_title'],
    body=issue_body,
    labels=all_labels
)
print(f"Created issue #{issue.number}: {issue.title}")

if pr_ref:
    summary = result.get("summary", "")
    if summary:
        pr_comment = (
            f"###AI Analysis Summary\n\n"
            f"{summary}\n\n"
            f"**Severity:** `{severity.upper()}`\n\n"
            f"Full details: #{issue.number}"
        )
        pr_ref.create_issue_comment(pr_comment)
        print(f"Posted summary comment to PR #{pr_ref.number}")
