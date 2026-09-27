# @paycue/github

GitHub webhook trigger for Paycue: verifies `X-Hub-Signature-256` and turns a
merged pull request into a reward proposal.

```ts
import { GitHubWebhookAdapter, githubPullRequestMergedRewardHook } from "@paycue/github";
```
