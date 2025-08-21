import * as sqlite from "sqlite3"
import stableStringify from "json-stable-stringify"

import * as net_util from "tennyson/lib/core/net-util";
import * as common from "tennyson/lib/core/common";
import { tqdm } from "../core/tqdm";
import * as pipe from "tennyson/lib/core/pipe";
import * as cheerio from 'cheerio';

export interface Cache {
  get(version: number, params: string, name: string): Promise<string | undefined>;
  put(version: number, params: string, name: string, results: string): Promise<void>;
  check(version: number, name: string, params: string[]):
    Promise<{ params: string, cached: Boolean }[]>
  getall(version: number, name: string, params: string[]):
    Promise<{ params: string, results: string | undefined }[]>
}

export class CacheLess implements Cache {
  async get(version: number, params: string, name: string) { return undefined; }
  async put(version: number, params: string, name: string, results: string) {}
  async check(version: number, name: string, params: string[]) {
    return params.map(params => { return { params, cached: false } });
  }
  async getall(version: number, name: string, params: string[]) {
    return params.map(params => { return { params, results: undefined } });
  }
}

export class DBCache implements Cache {
  db: sqlite.Database;
  initResults: Promise<void> | undefined;

  constructor(path: string) {
    this.db = new sqlite.Database(path);
  }

  private async initPotent() {
    await this.run(`
        CREATE TABLE IF NOT EXISTS cacheline (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            version INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            params TEXT NOT NULL,
            results TEXT NOT NULL
        );`
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS cacheline_index ON cacheline (name, version, params);'
    );
    await this.run("PRAGMA journal_mode=WAL;");
  }

  private init() {
    if (this.initResults === undefined) {
      this.initResults = this.initPotent();
    }
    return this.initResults;
  }

  private run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          common.log.error({ sql, params, err });
          reject(err)
        }
        else resolve()
      });
    });
  }

  private dbget<T>(sql: string, sqlParams: any[] = [])
    : Promise<T> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, sqlParams, (err, row: T) => {
        if (err) {
          common.log.error({ sql, sqlParams, err });
          reject(err)
        }
        else resolve(row)
      });
    });
  }

  async get(version: number, params: string, name: string) {
    await this.init();
    let res = await this.dbget<{ results: string }>(`
      SELECT results FROM cacheline
        WHERE name = ?
          AND version = ?
          AND params = ?
        ORDER BY timestamp DESC;`,
      [name, version, params]
    );
    return res?.results;

  }

  async put(version: number, params: string, name: string, results: string) {
    await this.init();
    let timestamp = new Date().toISOString();
    return this.run(
      `INSERT INTO cacheline (name, version, timestamp, params, results)
        VALUES (?, ?, ?, ?, ?)`,
      [name, version, timestamp, params, results]
    );
  }

  private dball<T>(sql: string, sqlParams: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, sqlParams, (err, rows: T[]) => {
        if (err) {
          common.log.error({ sql, sqlParams, err });
          reject(err)
        }
        else resolve(rows || [])
      });
    });
  }

  async check(version: number, name: string, params: string[]):
    Promise<{ params: string, cached: boolean }[]> {
    await this.init();

    if (params.length === 0) return [];

    return await pipe.Pipe.ofArray(params)
      .batch(10_000)
      .map(async params => {
        const placeholders = params.map(() => '?').join(',');
        const cachedParams = await this.dball<{ params: string }>(`
          SELECT DISTINCT params FROM cacheline
          WHERE name = ?
            AND version = ?
            AND params IN (${placeholders})`,
          [name, version, ...params]
        );

        const cachedSet = new Set(cachedParams.map(row => row.params));

        return params.map(params => ({
          params: params,
          cached: cachedSet.has(params)
        }));
      })
      .flat()
      .gather();
  }

  async getall(version: number, name: string, params: string[])
    : Promise<{ params: string, results: string | undefined }[]> {
    await this.init();

    if (params.length === 0) return [];

    return await pipe.Pipe.ofArray(params)
      .batch(10_000)
      .map(async params => {
        const placeholders = params.map(() => '?').join(',');
        const cachedParams =
          await this.dball<{ params: string, results: string }>(`
            SELECT DISTINCT params, results FROM cacheline
            WHERE name = ?
              AND version = ?
              AND params IN (${placeholders})`,
            [name, version, ...params]
          );

        const cachedMap =
          new Map(cachedParams.map(row => [row.params, row.results]));

        return params.map(params => ({
          params,
          results: cachedMap.get(params)
        }));
      })
      .flat()
      .gather();
  }
}

export abstract class Node<P, R> {
  version = 0;
  abstract name: string;
  cache: Cache;
  maxConcurrent = 1;

  // semaphore: common.Semaphore;

  constructor(cache: Cache = new CacheLess()) {
    this.cache = cache;
    // this.semaphore = new common.Semaphore(this.maxConcurrent);
  }

  abstract getUncached(params: P): Promise<R>;
  serializeParams(params: P): string { return stableStringify(params)!; }
  deserializeParams(params: string): P { return JSON.parse(params); }
  serializeResult(results: R): string { return stableStringify(results)!; }
  deserializeResult(results: string): R { return JSON.parse(results); }

  async get(params: P): Promise<R> {
    const params_ = this.serializeParams(params);
    const cachedResults = await this.cache.get(this.version, params_, this.name);
    if (cachedResults === undefined) {
      // const results = await this.semaphore.with(() => this.getUncached(params));
      const results = await this.getUncached(params);
      this.cache.put(
        this.version, params_, this.name, this.serializeResult(results));
      return results;
    } else {
      return this.deserializeResult(cachedResults);
    }
  }

  async cacheall(params: P[]): Promise<void> {
    const serializedParams = params.map(this.serializeParams);
    const checkResults =
      await this.cache.check(this.version, this.name, serializedParams);
    const uncached: P[] = checkResults
      .filter(x => !x.cached)
      .map(x => this.deserializeParams(x.params));
    const topNum = checkResults.length - uncached.length;
    const botNum = checkResults.length;
    common.log.info(
      `Node ${this.name} has cached ` +
      `${topNum}/${botNum} (${(100 * topNum / botNum).toFixed(3)}%)`);
    await common.mapInLimitedConcurrency(
      (x: P) => this.get(x).then(results => null),
      uncached,
      this.maxConcurrent
    )
  }

  async getall(params: P[]): Promise<{ params: P, results: R }[]> {
    const serializedParams = params.map(this.serializeParams);
    const cachedResults =
      await this.cache.getall(this.version, this.name, serializedParams);
    const res: { params: P, results: R }[] = [];
    const tofetch: P[] = [];
    for (const elm of cachedResults) {
      const { params, results } = elm;
      if (results === undefined)
        tofetch.push(this.deserializeParams(elm.params));
      else
        res.push({
          results: this.deserializeResult(results),
          params: this.deserializeParams(params)
        });
    }
    common.log.info(
      `Node ${this.name} has cached ${res.length}/${params.length} ` +
      `(${100 * res.length / params.length}%)`);
    await common.mapInLimitedConcurrency(
      (x: P) => this.get(x).then(results => res.push({ params: x, results })),
      tofetch,
      this.maxConcurrent
    )
    return res;
  }
}

export class Get extends Node<
  { url: string },
  { content: string, status: number }
> {
  name = "get";
  customFetcher
    : null | ((url: string) => Promise<{ content: string, status: number }>)
    = null;

  async getUncached(params: { url: string; }) {
    if (this.customFetcher == null) {
      const response = await fetch(params.url);
      if (![404].includes(response.status)) {
        await net_util.checkResponseExn(response);
      }
      const content = await response.text();
      return { content, status: response.status };
    } else {
      return await this.customFetcher(params.url);
    }
  }
}

// export async function domFragmentOfUrl(url: string) {
//   const res = await net_util.checkResponseExn(await fetch(url))
//   cheerio.
//   return JSDOM.fragment(await res.text())
// }

// export async function queryAllUrl(url: string, selectors: string) {
//   const frag = await domFragmentOfUrl(url)
//   return frag.querySelectorAll(selectors)
// }

// export async function xpathOfHTML(html: string, xpath: string) {
//   const dom = new JSDOM(html)
//   return dom.window.document.evaluate(xpath, dom.window.document, null, 2)
// }

// export async function fetchXpath(url: string, xpath: string) {
//   const res = await net_util.checkResponseExn(await fetch(url))
//   return xpathOfHTML(await res.text(), xpath)
// }


// class GetJson extends Node<{ url: string }, any> {
//   name = "get-json";

//   async getUncached(params: { url: string; }) {
//     const response = await fetch(params.url);
//     return responseJsonExn(response);
//   }
// }
