# Clean-room provenance

Kasvo is an independent implementation. It is **not** a fork and contains no code,
schema, copy, or assets from any other personal-finance project.

## Inspiration

The product idea (a personal-finance app with a first-party MCP server so AI agents can
record and analyze money) was inspired by the public feature description of
[Finlynq](https://github.com/finlynq/finlynq) (AGPL-3.0).

## What was looked at

On 2026-10-27, before any Kasvo code was written, only the following public material was
read: Finlynq's `README.md`, `COMMERCIAL.md`, `package.json`, and the repository's
directory/file listing. No source file contents were opened. The local clone was deleted
before work on Kasvo began.

## Rules for contributors

- Do not open, copy, or paraphrase source code from other personal-finance apps while
  working on Kasvo.
- Kasvo's data model, MCP tool names and schemas, UI, and text are designed from
  [`SPEC.md`](./SPEC.md), which was written from scratch.
- Ideas, features, and public standards (MCP, OFX, CSV) are fair game; code is not.
