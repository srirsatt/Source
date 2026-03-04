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

export async function crawlDocs(startUrl: string, config: CrawlConfig): Promise<CrawledPage[]> {
    // logic: use a set to track visited urls (no repeats), have a total result array, recursively crawl 'a' tags

    // scrape url
    const visited = new Set<string>();
    const result: CrawledPage[] = [];


    async function crawlPage(url: string, depth: number) {
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
            } catch {
                continue;
            }
        }

    }


    await crawlPage(startUrl, 0);
    return result;
}