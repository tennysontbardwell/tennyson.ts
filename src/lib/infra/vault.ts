import * as host from "tennyson/lib/infra/host";
import * as consul from "tennyson/lib/infra/consul";
import * as common from "tennyson/lib/core/common";
import * as execlib from "tennyson/lib/core/exec";
import * as commonInfra from "tennyson/lib/infra/common-infra";
import axios from "axios";
import https from "https";

export async function get_root_cert(): Promise<string> {
  return commonInfra.pem;
}

export async function token() {
  const res = await execlib.exec("vault", [
    "token",
    "create",
    "-field=token",
    "-ttl=5m",
  ]);
  return res.stdout;
}

export async function addr(){
  const addr = process.env["VAULT_ADDR"];
  if (addr == undefined) {
    throw "VAULT_ADDR undefined";
  }
  return addr;
}

export async function setupHostCaFiles(
  host_: host.Host,
  services: string[] = []
) {
  const token_ = await token();
  const addr_ = await addr();
  const alt_names = [host_.fqdnNoDc()]
    .concat(
      services
        .map((service) => {
          const serviceHost = host.Host.ofLocalName(service);
          return [serviceHost.fqdn(), serviceHost.fqdnNoDc()];
        })
        .flat()
    )
    .join(",");
  const httpsAgent = new https.Agent({ ca: commonInfra.pem });
  const res = await axios.request({
    url: addr_ + "/v1/pki/issue/root",
    headers: {
      "X-Vault-Token": token_,
    },
    method: "post",
    data: {
      common_name: host_.fqdn(),
      alt_names: alt_names,
      ttl: "72h",
      format: "pem_bundle",
    },
    httpsAgent: httpsAgent,
  });
  const data: any = res.data;
  const crt: string = data.data.issuing_ca;
  const key: string = data.data.private_key;
  const exec = execlib.ExecHelpers.su(host_.exec.bind(host_), 'root', true);
  await execlib.ExecHelpers.putFile(exec, "/etc/ssl/node.crt", crt);
  await execlib.ExecHelpers.putFile(exec, "/etc/ssl/node.key", key);
}

export async function setupCaFile(exec: execlib.ExecLike) {
  await execlib.ExecHelpers.putFile(
    exec,
    "/usr/local/share/ca-certificates/tennysontbardwell.com.crt",
    commonInfra.pem
  );
  await exec("update-ca-certificates", []);
}

export async function setupVault(exec: execlib.ExecLike) {
  await new host.Apt(exec).install(["vault"]);
  await execlib.ExecHelpers.putJson(exec, "/etc/vault.d/vault.json", {
    ui: true,
    disable_mlock: true,
    storage: {
      consul: {
        address: "127.0.0.1:8500",
        path: "vault",
      },
    },
    listener: {
      tcp: {
        address: "0.0.0.0:8200",
        tls_cert_file: "/opt/vault/tls/tls.crt",
        tls_key_file: "/opt/vault/tls/tls.key",
      },
    },
  });
  await consul.addConsulService(exec, "vault");
}
