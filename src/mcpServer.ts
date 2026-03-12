// mcp server -> links into agent and uses BM25 to index what links are most useful

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import MiniSearch from 'minisearch';
import { CrawledPage, SourceManifest, SourceEntry } from './crawler';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { writeAgentRules } from './ruleWriter';


// for our server, define a BM25 scraper

function buildIndex(pages: CrawledPage[]) {
    // deduplicate by URL and filter out bad entries
    const seen = new Set<string>();
    const cleanPages = pages.filter(p => {
        if (!p.url || p.url.includes('undefined') || seen.has(p.url)) return false;
        seen.add(p.url);
        return true;
    });

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

    index.addAll(cleanPages);
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
        'REQUIRED: You MUST call this tool BEFORE answering ANY question about the libraries/frameworks used in this project. Do NOT rely on training data — it is likely outdated. Call this tool first, then use the results to answer. If you skip this tool, your answer is probably wrong. Search indexed documentation by keyword or topic.',
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

    // deduplicate for resource registration
    const seenUris = new Set<string>();
    for (const page of pages) {
        if (!page.url || page.url.includes('undefined')) continue;
        const uri = `doc://source-docs/${new URL(page.url).pathname}`;
        if (seenUris.has(uri)) continue;
        seenUris.add(uri);

        server.resource(
            page.title,
            uri,
            async () => ({
                contents: [{
                    uri,
                    text: `# ${page.title}\nURL: ${page.url}\n\n${page.content}`,
                    mimeType: 'text/markdown'
                }]
            })
        );
    }

    return server;
}

export function getIndexedPages(sourceUrl: string, workspacePath: string): CrawledPage[] | null {
    const sourceDir = path.join(workspacePath, '.source');
    const manifestPath = path.join(sourceDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    try {
        const manifest: SourceManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const hostname = new URL(sourceUrl).hostname;
        const entry = manifest.sources.find(s => s.hostname === hostname);
        if (!entry) return null;
        const pagesPath = path.join(sourceDir, entry.pagesFile);
        if (!fs.existsSync(pagesPath)) return null;
        return JSON.parse(fs.readFileSync(pagesPath, 'utf-8'));
    } catch {
        return null;
    }
}

export function getManifestSources(workspacePath: string) {
    const manifestPath = path.join(workspacePath, '.source', 'manifest.json');
    if (!fs.existsSync(manifestPath)) return [];
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        return manifest.sources || [];
    } catch {
        return [];
    }
}

export function isSourceIndexed(sourceUrl: string, workspacePath: string): boolean {
    const manifestPath = path.join(workspacePath, '.source', 'manifest.json');
    if (!fs.existsSync(manifestPath)) return false;
    try {
        const manifest: SourceManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const hostname = new URL(sourceUrl).hostname;
        return manifest.sources.some(s => s.hostname === hostname);
    } catch {
        return false;
    }
}

export function setupDocs(pages: CrawledPage[], workspacePath: string, sourceUrl: string, extensionPath: string) {
    //writeContextFile(pages, workspacePath); not necessary with doc chunks

    const sourceDir = path.join(workspacePath, '.source');
    if (!fs.existsSync(sourceDir)) {
        fs.mkdirSync(sourceDir, { recursive: true });
    }

    const safeName = new URL(sourceUrl).hostname.replace(/[^a-z0-9]/gi, '-');

    const pagesFile = `pages-${safeName}.json`;
    fs.writeFileSync(path.join(sourceDir, pagesFile), JSON.stringify(pages), 'utf-8');

    const manifestPath = path.join(sourceDir, 'manifest.json');
    let manifest: SourceManifest = { sources: [] };

    // fill out manifest
    if (fs.existsSync(manifestPath)) {
        try {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

        } catch {
            // nothing
        }

        // update / add source entries
    }

    const existing = manifest.sources.findIndex(s => s.hostname === new URL(sourceUrl).hostname);
    const entry: SourceEntry = {
        hostname: new URL(sourceUrl).hostname,
        sourceUrl,
        pagesFile,
        ruleFile: `source-${safeName}.md`,
        pageCount: pages.length,
        indexedAt: new Date().toISOString()
    };

    if (existing >= 0) {
        manifest.sources[existing] = entry;
    } else {
        manifest.sources.push(entry);
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');



    //writePagesJson(pages, workspacePath);
    writeAgentRules(pages, workspacePath, sourceUrl, extensionPath); // 
}

export function removeSource(hostname: string, workspacePath: string) {
    const sourceDir = path.join(workspacePath, '.source');
    const manifestPath = path.join(sourceDir, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
        return; // nothing to do
    }

    const manifest: SourceManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    const entry = manifest.sources.find(s => s.hostname === hostname);
    if (!entry) return;

    // remove the source
    const pagesPath = path.join(sourceDir, entry.pagesFile);
    if (fs.existsSync(pagesPath)) {
        fs.unlinkSync(pagesPath);
    }

    const rulePath = path.join(workspacePath, '.agent', 'rules', entry.ruleFile);
    if (fs.existsSync(rulePath)) {
        fs.unlinkSync(rulePath);
    }

    // remove Claude Code rule file
    const safeName = hostname.replace(/[^a-z0-9]/gi, '-');
    const claudeRulePath = path.join(sourceDir, `claude-${safeName}.md`);
    if (fs.existsSync(claudeRulePath)) {
        fs.unlinkSync(claudeRulePath);
    }

    // remove this source from the manifest
    manifest.sources = manifest.sources.filter(s => s.hostname !== hostname);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    // rebuild CLAUDE.md index
    if (manifest.sources.length > 0) {
        let content = '# Source Documentation\n\n';
        for (const s of manifest.sources) {
            const safe = s.hostname.replace(/[^a-z0-9]/gi, '-');
            content += `@claude-${safe}.md\n`;
        }
        fs.writeFileSync(path.join(workspacePath, 'CLAUDE.md'), content, 'utf-8');
    } else {
        const claudeMdPath = path.join(workspacePath, 'CLAUDE.md');
        if (fs.existsSync(claudeMdPath)) {
            fs.unlinkSync(claudeMdPath);
        }
    }

    console.log(`Removed source!: ${hostname}`);
}

if (require.main === module) {

    const sourceDir = process.argv[2] || '.source';
    const manifestPath = path.join(sourceDir, 'manifest.json');

    // create empty manifest if it doesn't exist
    if (!fs.existsSync(manifestPath)) {
        if (!fs.existsSync(sourceDir)) {
            fs.mkdirSync(sourceDir, { recursive: true });
        }
        fs.writeFileSync(manifestPath, JSON.stringify({ sources: [] }, null, 2), 'utf-8');
        // console.error('No manifest found, created empty one');
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    let allPages: CrawledPage[] = [];
    for (const source of manifest.sources) {
        const pagesPath = path.join(sourceDir, source.pagesFile);
        if (!fs.existsSync(pagesPath)) {
            //   console.error(`Skipping missing pages file: ${source.pagesFile}`);
            continue;
        }
        const pages = JSON.parse(fs.readFileSync(pagesPath, 'utf-8'));
        allPages = allPages.concat(pages);
    }

    const server = createMCPServer(allPages);
    const transport = new StdioServerTransport();

    server.connect(transport);
    // console.error(`MCP started, ${allPages.length} pages from ${manifest.sources.length} sources`);
}