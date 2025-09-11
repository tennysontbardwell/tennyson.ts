import * as host from "tennyson/lib/infra/host";
import * as execlib from "tennyson/lib/core/exec";

const proxyConfigHeader = `\
load_module /usr/lib/nginx/modules/ngx_stream_module.so;

events {}

stream {

`;

const proxyConfigBody = `\
    server {
        listen     SRC;
        proxy_pass 127.0.0.1:DEST;
    }

    server {
        listen     SRC udp;
        proxy_pass 127.0.0.1:DEST;
    }

`;

const proxyConfigBodyShortTimeout = `\
    server {
        listen     SRC;
        proxy_pass 127.0.0.1:DEST;
        proxy_timeout 3s;
    }

    server {
        listen     SRC udp;
        proxy_pass 127.0.0.1:DEST;
        proxy_timeout 3s;
    }

`;

const proxyConfigFooter = `\
}
`;

export async function setupProxy(
  exec: execlib.ExecLike,
  ports: {
    listen: Number;
    deliver: Number;
  }[],
  shortTimeout = false,
) {
  await new host.Apt(exec).install(["nginx"]);
  await exec("systemctl", ["stop", "nginx"]);
  await exec("rm", ["-rf", "/etc/nginx"]);
  await exec("mkdir", ["/etc/nginx"]);
  const template = shortTimeout ? proxyConfigBodyShortTimeout : proxyConfigBody;
  const configBody = ports.map((port) =>
    template
      .replace(/SRC/g, port.listen.toString())
      .replace(/DEST/g, port.deliver.toString()),
  );
  const config = proxyConfigHeader + configBody + proxyConfigFooter;
  await execlib.ExecHelpers.putFile(exec, "/etc/nginx/nginx.conf", config);
  await exec("systemctl", ["enable", "--now", "nginx"]);
}
