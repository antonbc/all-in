# Convention

Work on this repo is one ticket, one branch, one conventional commit, and one pull request.

Tickets live as one file each under `.scratch/<feature>/issues/<NN>-<slug>.md`. The spec for that feature is `.scratch/<feature>/spec.md`. A ticket is ready to build when its `Status` is `ready-for-agent` and every ticket in `Blocked by` is done.

## Branches

```
<type>/<NN>-<slug>
```

`<NN>` and `<slug>` match the ticket file. `<type>` is the same type the commit will use.

```
feat/03-merge-pdfs
fix/14-locked-pdf-message
test/08-pdf-to-png-zip
docs/01-local-only-jobs
```

Branch from the current integration branch for that feature. One ticket occupies one branch. Do not land a second ticket on it.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <imperative summary>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `build`, `ci`.

`<scope>` is the tool or the shared surface the ticket changes: `merge`, `split`, `rotate`, `pdf-to-word`, `word-to-pdf`, `pdf-to-png`, `pdf-to-jpeg`, `png-to-pdf`, `jpeg-to-pdf`, `images-to-pdf`, `background-remover`, `home`, `preview`, `download`.

The subject is imperative, lowercase, and has no trailing period. The body says why, when the subject is not enough. The footer names the ticket file.

```
feat(merge): concatenate PDFs in visitor order

A visitor with two PDFs gets one PDF whose pages follow the list.

Ticket: .scratch/free-tools/issues/03-merge-pdfs.md
```

One ticket produces one conventional commit. If a hook rewrites files, amend only that commit while it is still unpushed and was created on this branch. Do not mix a second ticket into the commit.

Do not add a `Co-authored-by` trailer for Cursor, Grok, or any other AI assistant. No `Co-authored-by: Cursor`. No `Co-authored-by: Grok`. No similar trailer.

Commitlint checks `type(scope): subject`. The type is one of the types above. A scope is required and is not limited to a fixed list, so a new tool scope stays valid. Prefer the scopes listed above. The subject has no trailing period. `.githooks/commit-msg` runs commitlint and rejects a `Co-authored-by` line that names Cursor or Grok.

Enable the hook once in each clone:

```
git config core.hooksPath .githooks
```

## Pull requests

One pull request per ticket. The PR title is the commit subject, including the type and scope. The body links the ticket, lists how it was verified, and names the base branch. Start from `.github/pull_request_template.md`: summary, linked issue (`Closes #`), test plan, and the checklist.

Do not batch tickets into one PR. Do not open a PR that contains more than one ticket's behavior. Merge only that PR when its ticket's acceptance criteria pass and `.github/workflows/ci.yml` is green.

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests and on pushes to `main`. It installs from the lockfile with `npm ci`, then runs lint, tests, and the TypeScript check. The workflow permission is `contents: read`. A failing step fails the check.
