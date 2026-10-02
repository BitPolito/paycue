# Making Paycue public: owner's checklist

For the owner only. Agents prepare this list; the squash, the signature, the
visibility flip and the npm publish are yours (see TEAM.md, Decisions).
Not for today unless you decide otherwise.

Repo: `github.com/BitPolito/paycue` (private) · branch to release: `master`
after `demo/showcase` is merged · packages: `@paycue/core`, `sqlite`, `lnd`,
`lnurl`, `kaleidoswap`, `github`, `server`, all v0.2.0, MIT.

## 1. Decide what ships

- [ ] Decide whether `demo/infra/` and `docs/QUESTIONS.md`, `docs/PLAN.md`,
      `docs/DEMO.md`, `docs/LIVE-TEST-RESULTS.md`, `docs/talk/TEAM.md` go public. They describe the office
      VPN, VM, MAC address, hostnames (konputer, penguin, satoshi, finney) and
      node pubkeys. Simplest: drop them or move them to a private repo, keep
      `docs/talk/SLIDES.md` and `ARTICLE.md`.
- [ ] `demo/tmp.txt` is untracked; make sure it stays out (`git status`).
- [ ] No database, macaroon, TLS cert, `.env` or wallet file is tracked:
      ```sh
      git ls-files | grep -i -E '\.(sqlite|db|macaroon|cert|pem|key|env)$|secret|wallet'
      ```

## 2. Scan the files (working tree)

Each command should print nothing, or only placeholders you have read.

```sh
# Tokens and keys
git grep -n -I -E 'ghp_|gho_|ghs_|github_pat_|npm_[A-Za-z0-9]{20,}|xox[bp]-|AKIA[0-9A-Z]{16}'
git grep -n -I -E 'BEGIN [A-Z ]*PRIVATE KEY|xprv|tprv|[xt]pub[1-9A-HJ-NP-Za-km-z]{100,}'
# LND macaroons (hex starts 0201036c6e64, base64 starts AgEDbG5k)
git grep -n -I -E '0201036c6e64|AgEDbG5k'
# Seeds and secrets by name: read every hit
git grep -n -I -i -E 'mnemonic|aezeed|cipher seed|seed phrase|webhook_?secret|api_?key|password|token'
# Long hex or base64 blobs (32+ bytes) that aren't test vectors
git grep -n -I -E '\b[0-9a-f]{64,}\b|[A-Za-z0-9+/]{60,}={0,2}'
# Addresses: tailnet (100.64/10), LAN, other private ranges, the VM's MAC
git grep -n -I -E '\b100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9]+\.[0-9]+\b|\b192\.168\.[0-9]+\.[0-9]+\b|\b10\.[0-9]+\.[0-9]+\.[0-9]+\b|\b172\.(1[6-9]|2[0-9]|3[01])\.[0-9]+\.[0-9]+\b'
git grep -n -I -i -E 'bc:24:11|konputer|penguin|satoshi|finney|voidops|tailnet|tailscale'
# Personal data
git grep -n -I -E '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}' -- ':!package-lock.json'
```

A trial run on 3 October found addresses in `demo/infra/README.md`,
`docs/QUESTIONS.md` and `docs/talk/TEAM.md`, and seed-related words in
`demo/infra/`, `demo/player-wallet/src/server.ts`; no tokens or keys.
Re-run after the final changes.

## 3. Scan the history, then squash

The squash removes history from the public repo, but scan it anyway: if a
secret was ever committed, rotate it, because the private repo, forks and
local clones still have it.

```sh
git log --all -p | grep -n -E 'ghp_|gho_|github_pat_|npm_[A-Za-z0-9]{20,}|BEGIN [A-Z ]*PRIVATE KEY|0201036c6e64|AgEDbG5k'
git log --all -p | grep -n -i -E 'mnemonic|aezeed|webhook_?secret'
# Optional, thorough: gitleaks detect --source . --log-opts="--all"
```

- [ ] Rotate anything found (GitHub webhook secret of `paycue-bounty-demo`,
      console token, macaroons), even if it only ever lived in history.
- [ ] Squash to one signed commit on a fresh branch:
      ```sh
      git checkout --orphan public master
      git commit -S -m "Paycue v0.2.0"
      git log --show-signature -1   # check the signature
      ```
- [ ] Re-run section 2 on the `public` branch.
- [ ] Push it as the new default branch of the public repo (a fresh repo, or
      force-replace `master` on `BitPolito/paycue`; old branches and tags
      must not come along).

## 4. Flip visibility

- [ ] Settings → General → Danger zone → Change visibility → Public.
- [ ] Check open issues, PRs, Actions logs and releases for anything private
      before flipping; they become public too.
- [ ] Turn on secret scanning and push protection (Settings → Code security).

## 5. Publish to npm

- [ ] The npm scope `@paycue` exists and you own it (`npm org ls paycue`).
- [ ] Each `packages/*/package.json` has `"repository"` pointing at the public
      repo (it does today) and `"license": "MIT"`.
- [ ] Build, test and dry-run:
      ```sh
      npm install && npm test
      for p in core sqlite lnd lnurl kaleidoswap github server; do npm publish --dry-run --access public -w packages/$p; done
      ```
      (The root workspaces also include `examples/*`; do not publish those.)
      Read the file list for each package: only `dist/`, `README.md`,
      `LICENSE`, `package.json`.
- [ ] Publish `@paycue/core` first (the others peer-depend on it), then the
      rest: `npm publish --access public -w packages/core`, then the other
      six. Add `--provenance` if publishing from CI.
- [ ] `npm view @paycue/core version` shows 0.2.0.

## 6. Turn on the links

- [ ] The QR code on slide 18 and the article point at
      `https://github.com/BitPolito/paycue`; open both on a phone once the
      repo is public.
- [ ] Article: fill every `[YOU: …]`, remove `draft: true`, publish.
- [ ] Bounty repo `moakilodash/paycue-bounty-demo` README links to the
      public Paycue repo.
