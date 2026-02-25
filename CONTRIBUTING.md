# Contributing to JSXN

Thanks for your interest in contributing!

## Getting Started

1. Fork the repo and clone it locally
2. Install dependencies: `npm install`
3. Run tests: `npm test`

## Development

- Source code is in `src/`
- Tests are in `test/`
- All code uses ES modules
- Run `npm test` before submitting a PR

## Project Structure

- `src/parser.js` — Babel-based JSX/TSX parser
- `src/analyzer.js` — Frequency analysis for aliases
- `src/alias.js` — Alias generation (@C, @P, @S)
- `src/emitter.js` — JSXN output for snippets
- `src/file-encoder.js` — Full file encoding (imports, hooks, logic)
- `src/decoder.js` — JSXN to JSX decoder
- `src/file-decoder.js` — Full file decoding
- `src/html-parser.js` — HTML/SVG parser
- `src/html-emitter.js` — HTML/SVG JSXN output
- `mcp/index.js` — MCP server

## Submitting Changes

1. Create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Ensure all tests pass (`npm test`)
4. Open a pull request with a description of what changed and why

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Input code that triggers the bug (if applicable)

## Feature Requests

Open an issue describing the use case and proposed behavior.
