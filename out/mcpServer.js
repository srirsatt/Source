"use strict";
// mcp server -> links into agent and uses BM25 to index what links are most useful
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIndexedPages = getIndexedPages;
exports.getManifestSources = getManifestSources;
exports.isSourceIndexed = isSourceIndexed;
exports.setupDocs = setupDocs;
exports.removeSource = removeSource;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const minisearch_1 = __importDefault(require("minisearch"));
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ruleWriter_1 = require("./ruleWriter");
// for our server, define a BM25 scraper
function buildIndex(pages) {
    // deduplicate by URL and filter out bad entries
    const seen = new Set();
    const cleanPages = pages.filter(p => {
        if (!p.url || p.url.includes('undefined') || seen.has(p.url))
            return false;
        seen.add(p.url);
        return true;
    });
    const index = new minisearch_1.default({
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
function writeContextFile(pages, workspacePath) {
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
    console.log(`Context file done!: located @ ${filePath}`);
}
// save the raw pages as a JSON file -> standalone MCP server can load these
function writePagesJson(pages, workspacePath) {
    const sourceDir = path.join(workspacePath, '.source');
    if (!fs.existsSync(sourceDir)) {
        fs.mkdirSync(sourceDir, { recursive: true });
    }
    const filePath = path.join(sourceDir, 'pages.json');
    fs.writeFileSync(filePath, JSON.stringify(pages), 'utf-8');
    console.log(`Pages JSON done!: located @ ${filePath}`);
}
function loadAllPages(sourceDir) {
    const manifestPath = path.join(sourceDir, 'manifest.json');
    if (!fs.existsSync(manifestPath))
        return [];
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    let allPages = [];
    for (const source of manifest.sources) {
        const pagesPath = path.join(sourceDir, source.pagesFile);
        if (!fs.existsSync(pagesPath))
            continue;
        const pages = JSON.parse(fs.readFileSync(pagesPath, 'utf-8'));
        allPages = allPages.concat(pages);
    }
    return allPages;
}
function createMCPServer(sourceDir) {
    const server = new mcp_js_1.McpServer({
        name: 'source-docs',
        version: '1.0.0',
    });
    // rebuild index from disk on every call — always fresh after add/remove
    server.tool('search_docs', 'REQUIRED: You MUST call this tool BEFORE answering ANY question about the libraries/frameworks used in this project. Do NOT rely on training data — it is likely outdated. Call this tool first, then use the results to answer. If you skip this tool, your answer is probably wrong. Search indexed documentation by keyword or topic.', {
        query: zod_1.z.string().describe('Search query for documentation')
    }, async ({ query }) => {
        const index = buildIndex(loadAllPages(sourceDir));
        const results = index.search(query).slice(0, 5); // best 5 links
        if (results.length === 0) {
            return {
                content: [{ type: 'text', text: 'No results found.' }]
            };
        }
        const text = results.map((r) => `## ${r.title}\nURL: ${r.url}\nScore: ${r.score.toFixed(2)}\n\n${r.content.slice(0, 500)}`).join('\n\n---\n\n');
        return {
            content: [{ type: 'text', text }]
        };
    });
    // register resources from initial pages
    const pages = loadAllPages(sourceDir);
    const seenUris = new Set();
    for (const page of pages) {
        if (!page.url || page.url.includes('undefined'))
            continue;
        const uri = `doc://source-docs/${new URL(page.url).pathname}`;
        if (seenUris.has(uri))
            continue;
        seenUris.add(uri);
        server.resource(page.title, uri, async () => ({
            contents: [{
                    uri,
                    text: `# ${page.title}\nURL: ${page.url}\n\n${page.content}`,
                    mimeType: 'text/markdown'
                }]
        }));
    }
    return server;
}
function getIndexedPages(sourceUrl, workspacePath) {
    const sourceDir = path.join(workspacePath, '.source');
    const manifestPath = path.join(sourceDir, 'manifest.json');
    if (!fs.existsSync(manifestPath))
        return null;
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const hostname = new URL(sourceUrl).hostname;
        const entry = manifest.sources.find(s => s.hostname === hostname);
        if (!entry)
            return null;
        const pagesPath = path.join(sourceDir, entry.pagesFile);
        if (!fs.existsSync(pagesPath))
            return null;
        return JSON.parse(fs.readFileSync(pagesPath, 'utf-8'));
    }
    catch {
        return null;
    }
}
function getManifestSources(workspacePath) {
    const manifestPath = path.join(workspacePath, '.source', 'manifest.json');
    if (!fs.existsSync(manifestPath))
        return [];
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        return manifest.sources || [];
    }
    catch {
        return [];
    }
}
function isSourceIndexed(sourceUrl, workspacePath) {
    const manifestPath = path.join(workspacePath, '.source', 'manifest.json');
    if (!fs.existsSync(manifestPath))
        return false;
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const hostname = new URL(sourceUrl).hostname;
        return manifest.sources.some(s => s.hostname === hostname);
    }
    catch {
        return false;
    }
}
function setupDocs(pages, workspacePath, sourceUrl, extensionPath) {
    //writeContextFile(pages, workspacePath); not necessary with doc chunks
    const sourceDir = path.join(workspacePath, '.source');
    if (!fs.existsSync(sourceDir)) {
        fs.mkdirSync(sourceDir, { recursive: true });
    }
    const safeName = new URL(sourceUrl).hostname.replace(/[^a-z0-9]/gi, '-');
    const pagesFile = `pages-${safeName}.json`;
    fs.writeFileSync(path.join(sourceDir, pagesFile), JSON.stringify(pages), 'utf-8');
    const manifestPath = path.join(sourceDir, 'manifest.json');
    let manifest = { sources: [] };
    // fill out manifest
    if (fs.existsSync(manifestPath)) {
        try {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        }
        catch {
            // nothing
        }
        // update / add source entries
    }
    const existing = manifest.sources.findIndex(s => s.hostname === new URL(sourceUrl).hostname);
    const entry = {
        hostname: new URL(sourceUrl).hostname,
        sourceUrl,
        pagesFile,
        ruleFile: `source-${safeName}.md`,
        pageCount: pages.length,
        indexedAt: new Date().toISOString()
    };
    if (existing >= 0) {
        manifest.sources[existing] = entry;
    }
    else {
        manifest.sources.push(entry);
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    //writePagesJson(pages, workspacePath);
    (0, ruleWriter_1.writeAgentRules)(pages, workspacePath, sourceUrl, extensionPath); // 
}
function removeSource(hostname, workspacePath) {
    const sourceDir = path.join(workspacePath, '.source');
    const manifestPath = path.join(sourceDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        return; // nothing to do
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const entry = manifest.sources.find(s => s.hostname === hostname);
    if (!entry)
        return;
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
    }
    else {
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
    }
    const server = createMCPServer(sourceDir);
    const transport = new stdio_js_1.StdioServerTransport();
    server.connect(transport);
}
//# sourceMappingURL=mcpServer.js.map