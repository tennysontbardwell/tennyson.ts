import * as sqlite from "sqlite3"
import stableStringify from "json-stable-stringify"

import * as common from "tennyson/lib/core/common";
import { tqdm } from "../core/tqdm";

export interface Cache {
  get(version: number, params: string, name: string): Promise<string | undefined>;
  put(version: number, params: string, name: string, results: string): Promise<void>;
  check(version: number, name: string, params: string[]):
    Promise<{ params: string, cached: Boolean }[]>
  getall(version: number, name: string, params: string[]):
    Promise<{params: string, results: string | undefined}[]>
}

export class CacheLess implements Cache {
  async get(version: number, params: string, name: string) { return undefined; }
  async put(version: number, params: string, name: string, results: string) {}
  async check(version: number, name: string, params: string[]) {
    return params.map(params => { return { params, cached: false}});
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
          common.log.error({sql, params, err});
          reject(err)
        }
        else resolve()
      });
    });
  }

  private dbget<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row: T) => {
        if (err) {
          common.log.error({sql, params, err});
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

  private dball<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows: T[]) => {
        if (err) {
          common.log.error({ sql, params, err });
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
  }

  async getall(version: number, name: string, params: string[]):
    Promise<{ params: string, results: string | undefined }[]> {
    await this.init();

    if (params.length === 0) return [];

    const placeholders = params.map(() => '?').join(',');
    const cachedParams = await this.dball<{ params: string, results: string }>(`
      SELECT DISTINCT params, results FROM cacheline
      WHERE name = ?
        AND version = ?
        AND params IN (${placeholders})`,
      [name, version, ...params]
    );

    const cachedMap = new Map(cachedParams.map(row => [row.params, row.results]));

    return params.map(params => ({
      params,
      results: cachedMap.get(params)
    }));
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
  serializeParams(params: P): string {return stableStringify(params)!; }
  deserializeParams(params: string): P {return JSON.parse(params);}
  serializeResult(results: R): string { return stableStringify(results)!; }
  deserializeResult(results: string): R { return JSON.parse(results); }

  async get(params: P): Promise<R> {
    let params_ = this.serializeParams(params);
    let cachedResults = await this.cache.get(this.version, params_, this.name);
    if (cachedResults === undefined) {
      // let results = await this.semaphore.with(() => this.getUncached(params));
      let results = await this.getUncached(params);
      this.cache.put(
        this.version, params_, this.name, this.serializeResult(results));
      return results;
    } else {
      return this.deserializeResult(cachedResults);
    }
  }

  async cacheall(params: P[]): Promise<void> {
    let serializedParams = params.map(this.serializeParams);
    let checkResults =
      await this.cache.check(this.version, this.name, serializedParams);
    let uncached: P[] = checkResults
      .filter(x => !x.cached)
      .map(x => this.deserializeParams(x.params));
    common.log.info(
      `Node ${this.name} has cached` +
      `${checkResults.length - uncached.length}/${checkResults.length}`);
    for await (const params of tqdm(uncached)) {
      await this.get(params);
    }
  }

  async getall(params: P[]): Promise<{ params: P, results: R }[]> {
    let serializedParams = params.map(this.serializeParams);
    let cachedResults =
      await this.cache.getall(this.version, this.name, serializedParams);
    let res: { params: P, results: R }[] = [];
    let tofetch: P[] = [];
    for (const elm of cachedResults) {
      let { params, results } = elm;
      if (results === undefined)
        tofetch.push(this.deserializeParams(elm.params));
      else
        res.push({
          results: this.deserializeResult(results),
          params: this.deserializeParams(params)
        });
    }
    common.log.info(
      `Node ${this.name} has cached ${res.length}/${params.length}`);
    await common.mapInLimitedConcurrency(
      (x: P) => this.get(x).then(results => res.push({ params: x, results })),
      tofetch,
      this.maxConcurrent
    )
    return res;
  }
}

export async function checkResponseExn(response: Response) {
  if (!response.ok) {
    let text = await response.text();
    try {
      common.log.error(JSON.parse(text));
    } catch {
      common.log.error(text.substring(0,10_000));
    }
    throw new Error(`HTTP error! status: ${response.status} | url: ${response.url}`);
  }
  return response;
}

export async function responseJsonExn<T>(response: Response) {
  await checkResponseExn(response);
  return <T>response.json();
}

export class Get extends Node<{ url: string }, { content: string, status: number }> {
  name = "get";

  async getUncached(params: { url: string; }) {
    let response = await fetch(params.url);
    if (![404].includes(response.status)) {
      await checkResponseExn(response);
    }
    let content = await response.text();
    return { content, status: response.status };
  }
}

// class GetJson extends Node<{ url: string }, any> {
//   name = "get-json";

//   async getUncached(params: { url: string; }) {
//     let response = await fetch(params.url);
//     return responseJsonExn(response);
//   }
// }
