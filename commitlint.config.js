export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "test",
        "refactor",
        "perf",
        "chore",
        "build",
        "ci",
      ],
    ],
    // A scope is required. It is not a frozen list. Known scopes live in convention.md.
    "scope-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
  },
};
