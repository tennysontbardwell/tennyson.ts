import * as commonInfra from "tennyson/lib/infra/common-infra";
import * as prox from "tennyson/lib/infra/prox";
import * as nginx from "tennyson/lib/infra/nginx";
import * as host from "tennyson/lib/infra/host";
import * as execlib from "tennyson/lib/core/exec";
import * as common from "tennyson/lib/core/common";
import * as secrets from "tennyson/secrets/secrets";
import axios from "axios";

export async function addConsulService(
  exec: execlib.ExecLike,
  serviceName: string
) {
  await execlib.ExecHelpers.putJson(exec, "/etc/consul.d/service.json", {
    service: { name: serviceName, port: 443 },
  });
  await exec("consul", ["reload"]);
}

export async function listMembers() {
  const res = await axios.get("http://127.0.0.1:8500/v1/catalog/nodes", {
    //headers: { "X-Consul-Token": secrets.consulBootstrap },
  });
  const members: host.Host[] = res.data.map((x: any) =>
    host.Host.ofLocalName(x.Node, x.Meta?.ssh_user)
  );
  return members;
}

export async function registerConsulPolicy(hostname: string) {
  const policy = hostname + "-policy";
  await axios.put("http://127.0.0.1:8500/v1/acl/policy", {
    headers: { "X-Consul-Token": secrets.consulBootstrap },
    data: {
      Name: policy,
      Description: "policy for host " + hostname,
      Rules: {
        node_prefix: {
          "": { policy: "read" },
        },
        node: {
          [hostname]: { policy: "write" },
        },
      },
      Datacenters: ["dc1"],
    },
  });
  await execlib.exec("vault", [
    "write",
    "consul/roles/" + hostname + "-role",
    "policies=" + policy,
  ]);
  const res = await execlib.exec("vault", [
    "read",
    "format=json",
    "consul/creds/" + hostname + "-role",
  ]);
  common.log.info(res);
}

export async function installConsul(exec: execlib.ExecLike) {
  await new host.Apt(exec).upgrade();
  await new host.Apt(exec).install([
    "lsb-release",
    "software-properties-common",
  ]);
  await execlib.ExecHelpers.sh(
    exec,
    "curl -fsSL https://apt.releases.hashicorp.com/gpg | apt-key add -"
  );
  await execlib.ExecHelpers.sh(
    exec,
    'apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"'
  );
  await new host.Apt(exec).upgrade();
  await new host.Apt(exec).install(["consul"]);
  // await execlib.ExecHelpers.putFile(
  //   exec,
  //   "/etc/consul.d/consul.hcl",
  //   "# intentionally empty\n"
  // );
}

export async function enableConsul(exec: execlib.ExecLike) {
  return execlib.ExecHelpers.sh(exec, "systemctl enable --now consul");
}

export async function setupClient(exec: execlib.ExecLike) {
  await installConsul(exec);
  await execlib.ExecHelpers.sh(exec, "mkdir -p /var/local/consul/logs");
  await execlib.ExecHelpers.sh(
    exec,
    "chown consul:consul -R /etc/consul.d /var/local/consul"
  );
  await execlib.ExecHelpers.putJson(
    exec,
    "/etc/consul.d/host.json",

    {
      data_dir: "/var/local/consul",
      log_file: "/var/local/consul/logs/consul.log",
      retry_join: [
        "10.10.0.3",
        "10.10.0.20",
        "10.10.0.21",
        "10.10.0.22",
        "10.10.0.23",
      ],
      encrypt: secrets.consul_encrypt_key,
      datacenter: "nyc1",
    }
  );
  await enableConsul(exec);
}

export async function setupAgent(exec: execlib.ExecLike) {
  await installConsul(exec);
  await execlib.ExecHelpers.putJson(
    exec,
    "/etc/consul.d/agent.json",

    {
      datacenter: "nyc1",
      data_dir: "/var/local/consul",
      encrypt: secrets.consul_encrypt_key,
      server: true,
      retry_join: [
        "10.10.0.3",
        "10.10.0.20",
        "10.10.0.21",
        "10.10.0.22",
        "10.10.0.23",
      ],
      domain: "consul.tennysontbardwell.com",
      log_file: "/var/local/consul/logs/consul.log",
      recursors: ["1.1.1.1"],
    }
  );
  await execlib.ExecHelpers.putJson(exec, "/etc/consul.d/service.json", {
    service: { name: "consul", port: 443 },
  });
  await execlib.ExecHelpers.sh(exec, "systemctl disable --now systemd-resolved");
  await nginx.setupProxy(exec, [{ listen: 53, deliver: 8600 }], true);
  await execlib.ExecHelpers.sh(exec, "mkdir -p /var/local/consul/logs");
  await execlib.ExecHelpers.sh(
    exec,
    "chown consul:consul -R /etc/consul.d /var/local/consul"
  );

  await enableConsul(exec);
}
