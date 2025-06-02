import * as sqlite from "sqlite3"
import stableStringify from "json-stable-stringify"

import * as common from "tennyson/lib/core/common";

export interface Cache {
  get(version: number, params: string, name: string): Promise<string | undefined>;
  put(version: number, params: string, name: string, results: string): Promise<void>;
}

export class CacheLess implements Cache {
  async get(version: number, params: string, name: string) { return undefined; }
  async put(version: number, params: string, name: string, results: string) {}
}

export class DBCache implements Cache {
  db: sqlite.Database;
  initResults: Promise<void> | undefined;

  constructor(path: string) {
    this.db = new sqlite.Database(path);
  }

  init() {
    if (this.initResults === undefined) {
      this.initResults = this.run(`
        CREATE TABLE IF NOT EXISTS cacheline (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            version INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            params TEXT NOT NULL,
            results TEXT NOT NULL
        );`
      );
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
}

export abstract class Node<P, R> {
  version = 0;
  abstract name: string;
  cache: Cache;

  constructor(cache: Cache = new CacheLess()) {
    this.cache = cache;
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
      let results = await this.getUncached(params);
      this.cache.put(
        this.version, params_, this.name, this.serializeResult(results));
      return results;
    } else {
      return this.deserializeResult(cachedResults);
    }
  }
}

export async function checkResponseExn(response: Response) {
  if (!response.ok) {
    try {
      let d = await response.json();
      common.log.error(d)
    } catch {
      let text = await response.text();
      common.log.error(text)
    }
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response;
}

export async function responseJsonExn<T>(response: Response) {
  await checkResponseExn(response);
  return <T>response.json();
}

export class Get extends Node<{ url: string }, { content: string }> {
  name = "get";

  async getUncached(params: { url: string; }) {
    let response = await fetch(params.url);
    checkResponseExn(response);
    let content = await response.text();
    return { content };
  }
}

// class GetJson extends Node<{ url: string }, any> {
//   name = "get-json";

//   async getUncached(params: { url: string; }) {
//     let response = await fetch(params.url);
//     return responseJsonExn(response);
//   }
// }
