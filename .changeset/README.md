# Changesets

Run `npm run changeset` to describe a change and pick its semver bump
(patch / minor / major). The generated markdown file is committed with your PR.

`npm run version-packages` consumes all pending changesets, bumps the version in
`package.json` and writes `CHANGELOG.md`. `npm run release` publishes to npm.

See https://github.com/changesets/changesets for details.
