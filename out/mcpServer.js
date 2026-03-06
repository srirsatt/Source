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
exports.setupDocs = setupDocs;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const minisearch_1 = __importDefault(require("minisearch"));
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// for our server, define a BM25 scraper
function buildIndex(pages) {
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
    index.addAll(pages);
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
function createMCPServer(pages) {
    // mcp server to be linked into agent of use
    const index = buildIndex(pages);
    const server = new mcp_js_1.McpServer({
        name: 'source-docs',
        version: '1.0.0',
    });
    // lets register our search tool
    server.tool('search_docs', 
    // instruction
    'Search from the indexed documentation pages by keyword or topic.', {
        query: zod_1.z.string().describe('Search query for documentation')
    }, async ({ query }) => {
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
    return server;
}
function setupDocs(pages, workspacePath) {
    writeContextFile(pages, workspacePath);
    writePagesJson(pages, workspacePath);
}
if (require.main === module) {
    const pagesPath = process.argv[2] || '.source/pages.json';
    const pages = JSON.parse(fs.readFileSync(pagesPath, 'utf-8'));
    const server = createMCPServer(pages);
    const transport = new stdio_js_1.StdioServerTransport();
    server.connect(transport);
    console.error(`MCP started, ${pages.length} pages`);
}
//# sourceMappingURL=mcpServer.js.map