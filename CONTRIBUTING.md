# Contributing

One ticket, one branch, one conventional commit, and one pull request. `convention.md` is the source of truth.

## Branch

Branch from `main`. Name it `<type>/<issue-number>-<slug>`, for example `feat/03-merge-pdfs`. The type is the same type as the commit (`feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `build`, or `ci`). One ticket occupies one branch.

## Commit

```
<type>(<scope>): <imperative summary>
```

A scope is required. It is not a frozen list. Scopes in use: `merge`, `split`, `rotate`, `pdf-to-word`, `word-to-pdf`, `pdf-to-png`, `pdf-to-jpeg`, `png-to-pdf`, `jpeg-to-pdf`, `images-to-pdf`, `background-remover`, `home`, `preview`, `download`.

The subject is imperative, lowercase, and has no trailing period.

Do not add a `Co-authored-by` trailer for Cursor, Grok, or any other AI assistant. No `Co-authored-by: Cursor`. No `Co-authored-by: Grok`. No similar trailer.

Enable the commit hook once per clone. This sets config for that clone only:

```
git config core.hooksPath .githooks
```

The hook runs commitlint and rejects a `Co-authored-by` line that names Cursor or Grok.

## Pull request

Open one pull request that closes the issue (`Closes #<issue-number>`). Use `.github/pull_request_template.md`. CI in `.github/workflows/ci.yml` must be green. The pull request contains one conventional commit.

Do not force-push to `main`.

## Files that stay local

Do not commit `.env` or any other secret. Do not commit visitor files: uploads, results, or anything a visitor brought to a tool.
