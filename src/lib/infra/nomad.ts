import * as commonInfra from "src/lib/infra/common-infra";
import * as common from "src/lib/core/common";
import * as execlib from "src/lib/core/exec";
import * as prox from "src/lib/infra/prox";
import * as host from "src/lib/infra/host";

export async function setupServer(exec: execlib.ExecLike) {
  await new host.Apt(exec).install(["nomad"]);
  await execlib.ExecHelpers.putJson(exec, "/etc/nomad.d/server.json", {
    acl: { enabled: true },
    server: {
      enabled: true,
      bootstrap_expect: 1,
    },
    tls: {
      http: true,
      rpc: true,
      cert_file: "/etc/ssl/node.crt",
      key_file: "etc/ssl/node.key",
    },
  });
  await execlib.ExecHelpers.sh(exec, "systemctl enable --now nomad");
}
