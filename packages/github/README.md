# @payhook/github

GitHub webhook trigger for Payhook: verifies `X-Hub-Signature-256` and turns a
merged pull request into a reward proposal.

```ts
import { GitHubWebhookAdapter, githubPullRequestMergedRewardHook } from "@payhook/github";
```
