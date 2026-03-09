// specific place to write rules for different agent types

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CrawledPage } from './crawler';

// antigravity rule writing

const MAX_CHUNK_CHARS = 10000; // slightly under 12k max


// HUGE change -> docs as foundation to work with mcp rather than both coexisting as standalone solutions


function buildFoundationalSummary(pages: CrawledPage[], sourceUrl: string): string {
    const hostname = new URL(sourceUrl).hostname;

    let summary = `# Source: ${hostname}\n\n`;
    summary += `Indexed ${pages.length} pages from ${sourceUrl}\n`;
    summary += `Generated: ${new Date().toISOString()}\n\n`;

    // MCP instruction
    summary += `## Search Tool\n`;
    summary += `Use the \`search_docs\` MCP tool from \`source-docs\` for specific API questions.\n`;
    summary += `**Always search \`source-docs\` FIRST** before looking through project files or guessing.\n`;
    summary += `If \`search_docs\` returns no results, then fall back to reading project source code.\n\n`;

    // table of contents -> extremely high level overview on how to use
    summary += `## Available Topics\n`;
    summary += `The following documentation sections are indexed and searchable:\n\n`;

    for (const page of pages) {
        const line = `-[${page.title}](${page.url})\n`;
        if (summary.length + line.length > MAX_CHUNK_CHARS) {
            summary += `- ... and ${pages.length - pages.indexOf(page)} more pages (use \`search_docs\` to find them)\n`;
            break;
        }
        summary += line;
    }

    summary += `\n`;


    // quick reference - key content from first few pages
    summary += `## Quick Reference\n`;
    const introPage = pages.find(p =>
        /intro|getting.started|overview|quickstart/i.test(p.title)
    ) || pages[0];
    if (introPage) {
        // Take just the first ~1000 chars of the intro
        const snippet = introPage.content.trim().slice(0, 1000);
        summary += `From: ${introPage.title}\n\n`;
        summary += `${snippet}\n`;
        if (introPage.content.length > 1000) {
            summary += `\n... (use \`search_docs\` for full content)\n`;
        }
    }

    return summary;
}

// lean rule file writing, <workspaceDir>/.agent/rules

function writeRuleFile(pages: CrawledPage[], workspacePath: string, sourceUrl: string) {
    const rulesDir = path.join(workspacePath, '.agent', 'rules');
    if (!fs.existsSync(rulesDir)) {
        fs.mkdirSync(rulesDir, { recursive: true });
    }

    const summary = buildFoundationalSummary(pages, sourceUrl);

    const safeName = new URL(sourceUrl).hostname.replace(/[^a-z0-9]/gi, '-');
    const filePath = path.join(rulesDir, `source-${safeName}.md`);
    fs.writeFileSync(filePath, summary, 'utf-8');

    console.log(`Rule file written: ${filePath} (@ ${summary.length} chars)`);


}

function writeAntigravityMcpConfig(workspacePath: string) {
    const configPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json');
    const configDir = path.join(os.homedir(), '.gemini', 'antigravity');

    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    let config: any = {
        mcpServers: {}
    };

    if (fs.existsSync(configPath)) {
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (!config.mcpServers) {
                config.mcpServers = {};
            }
        } catch {
            // nothing
        }
    }

    // add source-docs
    config.mcpServers['source-docs'] = {
        command: 'node',
        args: [
            // for now, hardcoded path -> we'll change later
            '/Users/srirams/Developer/Source/source/out/mcpServer.js',
            path.join(workspacePath, '.source', 'pages.json')
        ]
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`MCP config updated @ ${configPath}`);
}

export function writeAgentRules(pages: CrawledPage[], workspacePath: string, sourceUrl: string) {
    writeRuleFile(pages, workspacePath, sourceUrl);

    // need a checker here for antigrav vs claude vs cursor, etc.
    writeAntigravityMcpConfig(workspacePath);
}


// our MCP config file


/*

// chunks our grand file into chunk files
function chunkPages(pages: CrawledPage[], workspacePath: string): string[] {
    const docsDir = path.join(workspacePath, '.agent', 'docs'); // for all the docs chunks

    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
    }

    const chunkPaths: string[] = [];
    let currentChunk = '';
    let chunkIndex = 1;

    for (const page of pages) {
        const pageBlock = `## ${page.title}\nURL:${page.url}\n\n${page.content.trim()}\n\n--\n\n`;

        // check limit push
        if (currentChunk.length + pageBlock.length > MAX_CHUNK_CHARS && currentChunk.length > 0) {
            const filename = `docs-${String(chunkIndex).padStart(3, '0')}.md`;
            const filePath = path.join(docsDir, filename);

            fs.writeFileSync(filePath, currentChunk, 'utf-8');

            chunkPaths.push(`.agent/docs/${filename}`);

            chunkIndex++;
            currentChunk = '';
        }

        currentChunk += pageBlock;
    }

    if (currentChunk.length > 0) {
        const filename = `docs-${String(chunkIndex).padStart(3, '0')}.md`;
        const filePath = path.join(docsDir, filename);
        fs.writeFileSync(filePath, currentChunk, 'utf-8');
        chunkPaths.push(`.agent/docs/${filename}`);
    }

    return chunkPaths;
}

// rule file, to reference chunked files with Antigravity Mentions
function writeRuleFile(pages: CrawledPage[], chunkPaths: string[], workspacePath: string, sourceUrl: string) {
    const rulesDir = path.join(workspacePath, '.agent', 'rules');
    if (!fs.existsSync(rulesDir)) {
        fs.mkdirSync(rulesDir, { recursive: true });
    }

    // keep rules file lean
    let rule = `# Source Documentation: ${new URL(sourceUrl).hostname}\n\n`;
    rule += `This project has indexed documentation from ${sourceUrl}.\n`;
    rule += `Total pages indexed: ${pages.length}\n`;
    rule += `Generated: ${new Date().toISOString()}\n\n`;
    rule += `## How to use\n`;
    rule += `You have a \`search_docs\` MCP tool available from the \`source-docs\` server.\n`;
    rule += `Use \`search_docs\` to search the indexed documentation by keyword when you need specific information.\n`;
    rule += `The documentation chunks below provide broader context for reference.\n\n`;
    rule += `Refer to the documentation chunks below when answering questions about this library/framework.\n\n`;
    rule += `## Documentation\n\n`;

    for (const chunkPath of chunkPaths) {
        rule += `@${chunkPath}\n`;
    }

    // give rules url filename proper
    const safeName = new URL(sourceUrl).hostname.replace(/[^a-z0-9]/gi, '-');
    const filePath = path.join(rulesDir, `source-${safeName}.md`);
    fs.writeFileSync(filePath, rule, 'utf-8');

    console.log(`Rule file written: ${filePath}`);

    console.log(`${chunkPaths.length} doc chunks written into .agent/docs`);
}

// to set up MCP server config

export function writeAgentRules(pages: CrawledPage[], workspacePath: string, sourceUrl: string) {
    const chunkPaths = chunkPages(pages, workspacePath);
    writeRuleFile(pages, chunkPaths, workspacePath, sourceUrl);
    writeAntigravityMcpConfig(workspacePath);
}



*/

