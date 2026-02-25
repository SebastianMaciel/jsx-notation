# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue.

Instead, report it privately via [GitHub Security Advisories](https://github.com/SebastianMaciel/jsx-notation/security/advisories/new) or contact the maintainer directly.

You should receive a response within 48 hours. If confirmed, a fix will be prioritized and a new version released as soon as possible.

## Scope

JSXN runs as a local tool (CLI, MCP server) and processes source code files. Security considerations include:

- **Directory sandbox**: `read_jsxn` and `write_jsxn` restrict file access to the server's working directory (or the path set via `JSXN_ROOT` environment variable). Paths that escape this root are rejected.
- **File extension allowlist**: only `.jsx`, `.tsx`, `.js`, `.ts`, `.html`, and `.svg` files are accepted
- **Symlink protection**: symlinks are resolved via `realpath()` and the real target's extension is validated. `write_jsxn` refuses to write through symlinks.
- **Input size limits**: 10 MB maximum per file/input
- **No network access**: JSXN does not make any network requests
- **Error sanitization**: error messages are generic and do not leak internal paths or stack traces
