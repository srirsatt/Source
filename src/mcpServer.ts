// mcp server -> links into agent and uses BM25 to index what links are most useful

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import MiniSearch from 'minisearch';
import { CrawledPage } from './crawler';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { writeAgentRules } from './ruleWriter';


// for our server, define a BM25 scraper

function buildIndex(pages: CrawledPage[]) {
    const index = new MiniSearch({
        fields: ['title', 'content'],
        idField: 'url',
        storeFields: ['title', 'url', 'content'],
        searchOptions: {
            boost: { title: 2 },
            fuzzy: 0.2,
            prefix: true,
        }
    });

    index.addAll(pages);
    return index;
}

// static context file -> to be injected for 
function writeContextFile(pages: CrawledPage[], workspacePath: string) {
    const sourceDir = path.join(workspacePath, '.source');
    if (!fs.existsSync(sourceDir)) {
        fs.mkdirSync(sourceDir, { recursive: true });
    }
    // basically, get the current directory of where the context file should be

    let markdown = `# Source Documentation Index\n`;
    markdown += `Pages Indexed: ${pages.length}\n`;
    markdown += `Generated: ${new Date().toISOString()}\n\n`;
    markdown += `> Use the \`search_docs\` MCP tool to search these docs by keyword.\n\n`;
    markdown += `---\n\n`;

    for (const page of pages) {
        markdown += `## ${page.title}\n`;
        markdown += `URL: ${page.url}\n\n`;
        markdown += `${page.content.slice(0, 500).trim()}\n\n`;
        markdown += `---\n\n`;
    }

    const filePath = path.join(sourceDir, 'CONTEXT.md');
    fs.writeFileSync(filePath, markdown, 'utf-8');
    console.log(`Context file done!: located @ ${filePath}`)
}

// save the raw pages as a JSON file -> standalone MCP server can load these
function writePagesJson(pages: CrawledPage[], workspacePath: string) {
    const sourceDir = path.join(workspacePath, '.source');
    if (!fs.existsSync(sourceDir)) {
        fs.mkdirSync(sourceDir, { recursive: true });
    }
    const filePath = path.join(sourceDir, 'pages.json');
    fs.writeFileSync(filePath, JSON.stringify(pages), 'utf-8');
    console.log(`Pages JSON done!: located @ ${filePath}`)
}

function createMCPServer(pages: CrawledPage[]) {
    // mcp server to be linked into agent of use

    const index = buildIndex(pages);

    const server = new McpServer({
        name: 'source-docs',
        version: '1.0.0',
    });

    // lets register our search tool
    server.tool(
        'search_docs',
        // instruction
        'Search from the indexed documentation pages by keyword or topic.',
        {
            query:
                z.string().describe('Search query for documentation')
        },
        async ({ query }) => {
            const results = index.search(query).slice(0, 5); // best 5 links
            if (results.length === 0) {
                return {
                    content: [{ type: 'text' as const, text: 'No results found.' }]
                };
            }

            const text = results.map((r: any) =>
                `## ${r.title}\nURL: ${r.url}\nScore: ${r.score.toFixed(2)}\n\n${r.content.slice(0, 500)}`
            ).join('\n\n---\n\n');

            return {
                content: [{ type: 'text' as const, text }]
            };
        }
    );

    return server;
}

export function setupDocs(pages: CrawledPage[], workspacePath: string, sourceUrl: string) {
    //writeContextFile(pages, workspacePath); not necessary with doc chunks
    writePagesJson(pages, workspacePath);
    writeAgentRules(pages, workspacePath, sourceUrl); // 
}

if (require.main === module) {
    const pagesPath = process.argv[2] || '.source/pages.json';
    const pages = JSON.parse(fs.readFileSync(pagesPath, 'utf-8'));
    const server = createMCPServer(pages);
    const transport = new StdioServerTransport();

    server.connect(transport);
    console.error(`MCP started, ${pages.length} pages`)
}