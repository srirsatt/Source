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

export interface SourceEntry {
    hostname: string;
    sourceUrl: string;
    pagesFile: string;
    ruleFile: string;
    pageCount: number;
    indexedAt: string; // ISO timestamp
}

export interface SourceManifest {
    sources: SourceEntry[];
}

// parse a single sitemap (or sitemap index) URL into page URLs
async function parseSitemap(sitemapUrl: string): Promise<string[] | null> {
    try {
        const res = await fetch(sitemapUrl);
        if (!res.ok) return null;

        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        // check if this is a sitemap index (contains nested sitemaps)
        const nestedSitemaps = $('sitemap loc').map((_, el) => $(el).text()).get();
        if (nestedSitemaps.length > 0) {
            let allUrls: string[] = [];
            for (const nested of nestedSitemaps) {
                const urls = await parseSitemap(nested);
                if (urls) allUrls = allUrls.concat(urls);
            }
            return allUrls.length > 0 ? allUrls : null;
        }

        // regular sitemap — extract URLs
        const urls = $('loc').map((_, el) => $(el).text()).get();
        return urls.length > 0 ? urls : null;
    } catch {
        return null;
    }
}

// sitemap discovery -> checks robots.txt first, then common paths
async function tryGetSitemapUrls(startUrl: string): Promise<string[] | null> {
    const origin = new URL(startUrl).origin;
    const pathParts = new URL(startUrl).pathname.split('/').filter(Boolean);

    // 1. check nearest-path sitemaps first (walk up from the URL path)
    // e.g. for /docs/ref/js/intro -> try /docs/ref/js/sitemap.xml, /docs/ref/sitemap.xml, /docs/sitemap.xml
    for (let i = pathParts.length - 1; i >= 1; i--) {
        const pathPrefix = '/' + pathParts.slice(0, i).join('/');
        const candidate = `${origin}${pathPrefix}/sitemap.xml`;
        const urls = await parseSitemap(candidate);
        if (urls && urls.length > 0) {
            console.log(`Found nearest-path sitemap: ${candidate} (${urls.length} URLs)`);
            return urls;
        }
    }

    // 2. check robots.txt — standard way to declare sitemaps
    try {
        const robotsRes = await fetch(`${origin}/robots.txt`);
        if (robotsRes.ok) {
            const robotsTxt = await robotsRes.text();
            const sitemapLines = robotsTxt
                .split('\n')
                .filter((line: string) => /^sitemap:/i.test(line.trim()))
                .map((line: string) => line.split(':').slice(1).join(':').trim());

            for (const sitemapUrl of sitemapLines) {
                const urls = await parseSitemap(sitemapUrl);
                if (urls && urls.length > 0) {
                    console.log(`Found sitemap via robots.txt: ${sitemapUrl} (${urls.length} URLs)`);
                    return urls;
                }
            }
        }
    } catch { }

    // 3. try common root sitemap paths as final fallback
    const candidates = [
        `${origin}/sitemap.xml`,
        `${origin}/sitemap_index.xml`,
    ];

    for (const candidate of candidates) {
        const urls = await parseSitemap(candidate);
        if (urls && urls.length > 0) {
            console.log(`Found sitemap at ${candidate} (${urls.length} URLs)`);
            return urls;
        }
    }

    return null;
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
        const pathParts = new URL(startUrl).pathname.split('/').filter(Boolean);
        const basePath = '/' + pathParts.slice(0, -1).join('/');
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