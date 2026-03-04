"use strict";
// simple cheerio crawler -> should parse all websites of their HTML to send to MCP
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.crawlDocs = crawlDocs;
const cheerio = __importStar(require("cheerio"));
const fetch = require('node-fetch');
async function crawlDocs(startUrl, config) {
    // logic: use a set to track visited urls (no repeats), have a total result array, recursively crawl 'a' tags
    // scrape url
    const visited = new Set();
    const result = [];
    async function crawlPage(url, depth) {
        // internal recursive func
        if (visited.has(url)) {
            return;
        }
        if (depth > config.maxDepth) {
            return;
        }
        if (result.length >= config.maxPages) {
            return;
        }
        visited.add(url);
        console.log(url);
        // scrape page
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);
        $('footer, nav, header, script, style').remove();
        const title = $('h1').first().text() || $('title').text();
        const content = $('main').text() || $('article').text() || $('body').text();
        result.push({
            url,
            title,
            content: content
        });
        // crawl links
        const links = $('a').map((_, el) => $(el).attr('href')).get();
        const baseHostname = new URL(url).hostname;
        for (const link of links) {
            try {
                const resolved = new URL(link, url).href; // curr page urls
                const resolvedUrl = new URL(resolved);
                // strip hash frags
                resolvedUrl.hash = '';
                const clean = resolvedUrl.href.replace(/\/$/, '');
                if (resolvedUrl.hostname === baseHostname) {
                    await crawlPage(clean, depth + 1);
                }
            }
            catch {
                continue;
            }
        }
    }
    await crawlPage(startUrl, 0);
    return result;
}
//# sourceMappingURL=crawler.js.map