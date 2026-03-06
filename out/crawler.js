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
// sitemap.xml fallback -> tries to grab all URLs from the site's sitemap before crawling
async function tryGetSitemapUrls(startUrl) {
    try {
        const origin = new URL(startUrl).origin;
        const sitemapUrl = `${origin}/sitemap.xml`;
        const response = await fetch(sitemapUrl);
        if (!response.ok) {
            return null;
        }
        const xml = await response.text();
        const $ = cheerio.load(xml, { xmlMode: true });
        const urls = $('loc').map((_, el) => $(el).text()).get();
        if (urls.length === 0) {
            return null;
        }
        console.log(`Found sitemap with ${urls.length} URLs`);
        return urls;
    }
    catch {
        return null;
    }
}
// fetch a single page and extract title + content
async function fetchPage(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);
        $('footer, nav, header, script, style').remove();
        const title = $('h1').first().text() || $('title').text();
        const content = $('main').text() || $('article').text() || $('body').text();
        return { url, title, content };
    }
    catch (err) {
        console.warn(`Failed to fetch ${url}:`, err);
        return null;
    }
}
async function crawlDocs(startUrl, config) {
    const visited = new Set();
    const result = [];
    // try sitemap first
    const sitemapUrls = await tryGetSitemapUrls(startUrl);
    if (sitemapUrls && sitemapUrls.length > 0) {
        // filter out versioned/deprecated docs and match path prefix
        const basePath = new URL(startUrl).pathname.split('/').slice(0, 2).join('/');
        const filtered = sitemapUrls
            .filter(u => !/\/\d+\.\d+\.x\/|\/\d+\.x\/|\/v\d+\//.test(u))
            .filter(u => new URL(u).pathname.startsWith(basePath))
            .slice(0, config.maxPages);
        console.log(`Sitemap: ${filtered.length} URLs match path "${basePath}"`);
        if (filtered.length > 0) {
            for (const url of filtered) {
                console.log(`[${result.length + 1}/${filtered.length}] ${url}`);
                const page = await fetchPage(url);
                if (page) {
                    result.push(page);
                }
            }
            return result;
        }
    }
    // fallback: recursive link crawling
    console.log('No sitemap found (or 0 matches), falling back to link crawling...');
    async function crawlPage(url, depth) {
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
        console.log(`[${result.length + 1}] Crawling: ${url} (depth: ${depth})`);
        const page = await fetchPage(url);
        if (!page) {
            return;
        }
        result.push(page);
        // find and follow internal links
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);
        const links = $('a').map((_, el) => $(el).attr('href')).get();
        const baseHostname = new URL(startUrl).hostname;
        for (const link of links) {
            try {
                const resolved = new URL(link, url).href;
                const resolvedUrl = new URL(resolved);
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