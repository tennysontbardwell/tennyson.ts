import * as common from "tennyson/lib/core/common";
import * as net from 'net';

export function getRandomFreePort(min: number = 3000, max: number = 65535)
  : Promise<number> {
  return new Promise((resolve, reject) => {
    const port = Math.floor(Math.random() * (max - min + 1) + min);
    const server = net.createServer();

    server.listen(port, () => {
      server.close(() => resolve(port));
    });

    server.on('error', () => {
      resolve(getRandomFreePort(min, max));
    });
  });
}

export async function checkResponseExn(response: Response) {
  if (!response.ok) {
    const text = await response.text();
    try {
      common.log.error(JSON.parse(text));
    } catch {
      common.log.error(text.substring(0, 10_000));
    }
    throw new Error(
      `HTTP error! status: ${response.status} | url: ${response.url}`);
  }
  return response;
}

export async function responseJsonExn<T>(response: Response) {
  await checkResponseExn(response);
  return <T>response.json();
}

export function queryOfUrlAndParams(
  url: string,
  params: Record<string, string | number | boolean | undefined>
): string {
  let params_ = Object.fromEntries(
    Object.entries(params)
      .filter(([_, value]) =>
      value !== undefined && value !== null)
      .map(([key, value]) => [key, value!.toString()])
  );

  const queryStr = new URLSearchParams(params_).toString();
  const res = (queryStr.length == 0) ? url : `${url}?${queryStr}`;
  return res;
}
