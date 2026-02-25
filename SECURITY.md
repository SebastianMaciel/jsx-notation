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

- **File system access**: `read_jsxn` and `write_jsxn` tools validate file extensions and resolve symlinks before reading/writing
- **Input size limits**: 10 MB maximum per file/input
- **Path traversal**: symlinks are resolved and validated against allowed extensions
- **No network access**: JSXN does not make any network requests
