# Research: what a good PR description is

Read on 2026-11-15. Only what the pages say; where a page gave no rule, this file says so.

## What the guides agree on

| Source | Rule that matters here |
|---|---|
| [Google eng-practices, Writing good CL descriptions](https://google.github.io/eng-practices/review/developer/cl-descriptions.html) | The first line is a short summary that "should stand alone". It says what is done, in the imperative. The body says why: source code shows what the software does, "it may not reveal why it exists". Name shortcomings of the approach. "Fix bug" is an inadequate description. No length limit given. |
| [GitHub Docs, Helping others review your changes](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/getting-started/helping-others-review-your-changes) | Good context "often explains why the change is needed, what changed, and where reviewers should pay special attention". Small, focused PRs. Read your own diff first. A generated summary needs your own context added. No length limit given. |
| [GitHub Docs, Creating a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request) | Says only "Type a title and description". No writing rules. |
| [Kubernetes PR template](https://raw.githubusercontent.com/kubernetes/kubernetes/master/.github/PULL_REQUEST_TEMPLATE.md) | Six prompts: kind, "What this PR does / why we need it", related issues, "Special notes for your reviewer", user-facing change (release note, or NONE), AI usage. Two are about the reader: why, and notes for the reviewer. No length advice. |
| [GitLab, Merge request workflow](https://docs.gitlab.com/development/contributing/merge_request_workflow/) | "Clear title and description explaining the relevancy of the contribution". Include setup steps a reviewer needs (feature flags). "Communicating the intent behind your changes can also help expedite merge request reviews." Keep the change as small as possible. |
| [Sentry, Code review](https://develop.sentry.dev/engineering-practices/code-review/) | "Describe what your PR does in a few sentences". Say why, and why other approaches were rejected. Link tickets. Ask 1 to 3 reviewers. |

Four of six say "why" outright. Two say "where the reviewer should look" (GitHub, Kubernetes). None sets a word limit, and none asks for a file list. Sentry is the only one that puts a size on it: "a few sentences".

## What reviewers need first

- Bacchelli and Bird, [Expectations, Outcomes, and Challenges of Modern Code Review](https://www.microsoft.com/en-us/research/publication/expectations-outcomes-and-challenges-of-modern-code-review/) (Microsoft, ICSE 2013): "code and change understanding is the key aspect of code reviewing", and current tools meet few of those needs. Only the abstract was read. So the top of the description has one job: let the reviewer understand the change before opening the diff.
- Liu et al., [Automatic Generation of Pull Request Descriptions](https://arxiv.org/abs/1909.06987) (ASE 2019): over 34% of 333K sampled PRs had an empty description. The paper claims a description helps reviewers "gain a quick understanding" without the details. That is a motivating claim, not a measured result.
- SmartBear, [Best practices for code review](https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/) (a vendor page citing a Cisco study): review no more than 200 to 400 lines at a time; defect finding drops beyond that and after about 60 minutes. Its advice to "annotate source code before the review" so the reviewer knows "which files to look at first" is the same idea as a review focus list.
- Not found: a study that measures how far reviewers read into a description or how description length changes review time. Treat "reviewers read the first lines" as a working assumption that fits the sources above, not as a measured fact.

## What this means for the `pr` skill

1. Put the two answers a reviewer needs before anything else: the benefit (why this is worth merging) and the review focus (where to look and what could break). GitHub and Kubernetes ask for the second one directly.
2. Cap the length. The guides give no number; Sentry says "a few sentences". The skill sets about 120 words before the optional sections, so it can be checked.
3. Keep the title as the standalone what (Google), in Conventional Commits form.
4. No file-by-file list. The diff already has one, and no guide asks for it.
5. State the non-code steps a reviewer needs (setup, flags, approvals), as GitLab does.
6. Rewrite the description when the branch changes (Google: re-check it before submitting).
