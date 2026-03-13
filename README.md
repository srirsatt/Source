# Source

Source is a VS Code extension that bridges the gap between AI coding agents and documentation. It crawls and indexes documentation sites, then serves them to coding agents via MCP (Model Context Protocol) so they reference real docs instead of hallucinating.

![Source demo](media/sourcedemo.gif)

## How It Works

1. Paste a documentation URL into the sidebar input.
2. Source crawls the site (using sitemaps when available, falling back to link crawling).
3. The crawled pages are indexed with BM25 and stored locally in a `.source` directory.
4. A `search_docs` MCP tool is registered so agents like Gemini CLI and Claude Code can query the indexed docs by keyword.
5. Agent rule files are written automatically so the agents know to call `search_docs` before relying on training data.

## Supported Agents

- Gemini CLI / Antigravity -- writes rules to `.agent/rules/` and configures `~/.gemini/antigravity/mcp_config.json`
- Claude Code -- writes a `CLAUDE.md` file and configures `.mcp.json` in the workspace root

## Project Structure

```
src/
  extension.ts    -- VS Code extension entry point and webview UI
  crawler.ts      -- Sitemap parser and recursive link crawler
  mcpServer.ts    -- MCP server with search_docs tool and BM25 index
  ruleWriter.ts   -- Generates agent-specific rule and config files
media/
  main.js         -- Webview client-side logic
```

## Dependencies

- @modelcontextprotocol/sdk -- MCP server implementation
- cheerio -- HTML parsing and crawling
- minisearch -- BM25 full-text search index
- node-fetch -- HTTP requests for crawling
- zod -- Schema validation for MCP tool inputs

## Development

```
npm install
npm run compile
```

Press F5 in VS Code to launch the Extension Development Host.

## Usage

1. Open a project in VS Code.
2. Click the Source icon in the activity bar.
3. Enter a documentation URL (e.g. `https://docs.example.com/getting-started`).
4. Wait for crawling to finish. The indexed source will appear in the sidebar.
5. Your coding agent will now use the `search_docs` MCP tool to query the indexed docs.

To remove a source, click the remove button next to it in the sidebar.

## License

MIT


[def]: media/sourcedemo.gif