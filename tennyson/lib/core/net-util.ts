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
