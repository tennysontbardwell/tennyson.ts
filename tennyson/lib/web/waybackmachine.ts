import * as net_util from "tennyson/lib/core/net-util";
import * as common from "tennyson/lib/core/common";
import * as cli from "tennyson/lib/core/cli";
import * as scraper from "tennyson/lib/web/scraper";
import * as pipe from "tennyson/lib/core/pipe";

interface CacheResult {
  modifiedUrl: string;
  time: string;
  url: string;
  type: string;
  status: string;
  hash: string;
  len: string;
}

export async function getWaybackCaches(url: string) {
  const baseUrl = "http://web.archive.org/cdx/search/cdx";

  const results: CacheResult[] = [];

  function parse(text: string) {
    const parsed = text.split("\n").map((line) => {
      const [modifiedUrl, time, url, type, status, hash, len] = line.split(" ");
      return { modifiedUrl, time, url, type, status, hash, len };
    });
    results.push(...parsed);
  }

  async function query(resumeKey?: string) {
    const query = net_util.queryOfUrlAndParams(baseUrl, {
      url,
      limit: "1000",
      showResumeKey: "true",
      resumeKey,
    });
    common.log.info(query);
    const response = await fetch(query);
    await net_util.checkResponseExn(response);
    const text = await response.text();
    const sections = text.split("\n\n");
    return sections;
  }

  var resumeKey;
  while (true) {
    const sections = await query(resumeKey);
    switch (sections.length) {
      case 0:
        return results;
      case 1:
        parse(sections[0].trim());
        return results;
      case 2:
        parse(sections[0].trim());
        resumeKey = sections[1].trim();
        break;
      default:
        common.log.error({
          msg: "Unexpected result from wayback machine",
          sections,
        });
        throw Error("Unexpected result from wayback machine");
    }
  }
}

function urlOfCacheResult(cacheResult: CacheResult) {
  const base = "http://web.archive.org/web";
  return `${base}/${cacheResult.time}/${cacheResult.url}`;
}

class WaybackResults extends scraper.Node<{ url: string }, CacheResult[]> {
  name = "wayback-results";

  async getUncached(params: { url: string }) {
    return await getWaybackCaches(params.url);
  }
}

async function getScrapableUrls(url: string, dbCache: scraper.DBCache) {
  const wbNode = new WaybackResults(dbCache);
  const cacheResults = await wbNode.get({ url });
  return cacheResults
    .filter((x) => x.status === "200")
    .map(urlOfCacheResult)
    .map((url) => {
      return { url };
    });
}

async function scrape(
  url: string,
  db: string,
  maxConcurrent = 1,
  fleetSize = 0,
) {
  const dbCache = new scraper.DBCache(db);
  const getNode = new scraper.Get(dbCache);
  const urls = await getScrapableUrls(url, dbCache);
  getNode.maxConcurrent = maxConcurrent;
  if (fleetSize == 0) await getNode.cacheall(urls);
  else {
    const fleetlib = await import("tennyson/lib/fleet");
    await fleetlib.Fleet.withFleet(fleetSize, async (fleet) => {
      getNode.customFetcher = fleet.mkFetcher({
        single_retry_delay_ms: 900_000,
      });
      await getNode.cacheall(urls);
    });
    await getNode.cacheall(urls);
  }
}

export async function scrapeAndGet(url: string, db: string) {
  const dbCache = new scraper.DBCache(db);
  const getNode = new scraper.Get(dbCache);
  const urls = await getScrapableUrls(url, dbCache);
  return pipe.Pipe.ofArray(urls).batch(1000).map(getNode.getall);
}

export const cmds: cli.Command[] = [
  cli.flagsCommand(
    "cache",
    {
      db: {
        type: "string",
        required: true,
      },
      url: {
        type: "string",
        required: true,
      },
      maxConcurrent: {
        alias: "n",
        type: "number",
        default: 1,
      },
      fleetSize: {
        type: "number",
        default: 0,
      },
    },
    async (args) => {
      scrape(args.url, args.db, args.maxConcurrent, args.fleetSize);
    },
  ),
];
