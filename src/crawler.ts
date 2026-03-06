// simple cheerio crawler -> should parse all websites of their HTML to send to MCP

import * as cheerio from 'cheerio';

const fetch = require('node-fetch');


export interface CrawledPage {
    url: string;
    title: string;
    content: string; // cleaned HTML
}

export interface CrawlConfig {
    maxDepth: number; // how deep to traverse (2-3 max)
    maxPages: number; // max total pages (100 max)
}

// sitemap.xml fallback -> tries to grab all URLs from the site's sitemap before crawling
async function tryGetSitemapUrls(startUrl: string): Promise<string[] | null> {
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
    } catch {
        return null;
    }
}

// fetch a single page and extract title + content
async function fetchPage(url: string): Promise<CrawledPage | null> {
    try {
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);
        $('footer, nav, header, script, style').remove();
        const title = $('h1').first().text() || $('title').text();
        const content = $('main').text() || $('article').text() || $('body').text();
        return { url, title, content };
    } catch (err) {
        console.warn(`Failed to fetch ${url}:`, err);
        return null;
    }
}

export async function crawlDocs(startUrl: string, config: CrawlConfig): Promise<CrawledPage[]> {
    const visited = new Set<string>();
    const result: CrawledPage[] = [];

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

    async function crawlPage(url: string, depth: number) {
        if (visited.has(url)) { return; }
        if (depth > config.maxDepth) { return; }
        if (result.length >= config.maxPages) { return; }

        visited.add(url);
        console.log(`[${result.length + 1}] Crawling: ${url} (depth: ${depth})`);

        const page = await fetchPage(url);
        if (!page) { return; }
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
            } catch {
                continue;
            }
        }
    }

    await crawlPage(startUrl, 0);
    return result;
}