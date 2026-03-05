// mcp server -> links into agent and uses BM25 to index what links are most useful

import { McpServer } from '@modelcontextprotocol/sdk/server/stdio.js';
import MiniSearch from 'minisearch';
import { CrawledPage } from './crawler';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';


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
