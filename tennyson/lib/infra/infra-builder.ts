import * as host from "tennyson/lib/infra/host";
import * as prox from "tennyson/lib/infra/prox";
import * as kerb from "tennyson/lib/infra/kerb";
import * as jupyter from "tennyson/lib/infra/jupyter";
import * as samba from "tennyson/lib/infra/samba";
import * as common from "tennyson/lib/core/common";
import * as execlib from "tennyson/lib/core/exec";
import * as vault from "tennyson/lib/infra/vault";
import * as nomad from "tennyson/lib/infra/nomad";
import * as consul from "tennyson/lib/infra/consul";
import { proxmoxInstances } from "tennyson/lib/infra/common-infra";
import { Memory } from "tennyson/lib/core/memory";

export async function forceLeave(name: string) {
  await execlib.exec("consul", ["force-leave", name], {
    acceptExitCode: (_code: number | null) => true,
  });
}

export const arch_misc = host.Host.ofLocalName("nyc1-arch-misc1");
export const kdc = host.Host.ofLocalName("nyc1-kdc-a01");

export async function delIfExists(name: string) {
  await Promise.all(
    Object.entries(prox.instances).map(([k, v]) => v.delIfExists(name)),
  );
  await forceLeave(name);
}

export async function mkCT(
  prox_: prox.Prox,
  name: string,
  options?: Partial<prox.Params>,
) {
  const name_ = host.Host.ofLocalName(name).fqdn();
  await delIfExists(name_);
  const host_ = await prox.createDebian(prox_, name_, options);
  await kerb.registerPrincipal(host_);
  await kerb.allowPrincipals([arch_misc], host_);
  await vault.setupCaFile(host_.exec.bind(host_));
  return host_;
}

export async function mkVM(name: string, prox_?: prox.Prox) {
  const name_ = host.Host.ofLocalName(name).fqdn();
  await delIfExists(name_);
  const host_ = await prox.createVM(name_, prox_);
  await kerb.registerPrincipal(host_);
  await kerb.allowPrincipals([arch_misc], host_);
  await vault.setupCaFile(host_.exec.bind(host_));
  return host_;
}

export async function addConsulService(host_: host.Host, serviceName: string) {
  await host_.putFile(
    "/etc/consul.d/service.json",
    JSON.stringify({
      service: { name: serviceName, port: 443 },
    }),
  );
  await host_.exec("consul", ["reload"]);
}

const serviceTemplate = `\
[Unit]
Description=None

[Service]
ExecStart=COMMAND

[Install]
WantedBy=multi-user.target
`;

export async function addService(
  exec: execlib.ExecLike,
  name: string,
  command: string,
) {
  await execlib.ExecHelpers.putFile(
    exec,
    "/etc/systemd/system/" + name + ".service",
    serviceTemplate.replace(/COMMAND/, command),
  );
  await exec("systemctl", ["enable", "--now", name]);
}

export async function mkJupyter(num: Number = 1) {
  const name = "nyc1-jupyter-a" + String(num).padStart(2, "0");
  await delIfExists(name);
  const host_ = await jupyter.make(name);
  await samba.tankClient(host_.exec.bind(host_));
  await addConsulService(host_, "jupyter");
  common.log.info(host_);
}

const consulConfig = {
  1: {
    prox: prox.instances[2],
    ip: "10.10.0.3",
    nameserver: "10.10.0.20",
  },
  2: {
    prox: prox.instances[4],
    ip: "10.10.0.20",
    nameserver: null,
  },
  3: {
    prox: prox.instances[3],
    ip: "10.10.0.21",
    nameserver: null,
  },
};
export type ConsulNum = keyof typeof consulConfig;

export async function mkConsulAgent(num: ConsulNum) {
  const name = "nyc1-consul-a" + String(num).padStart(2, "0");
  await delIfExists(name);
  const config = consulConfig[num];
  const vm = await prox.createDebianWithoutConsul(config.prox, name, {
    ip: config.ip,
    nameserver: config.nameserver,
  });
  await consul.setupAgent(vm.execOnContainer.bind(vm));
  const host_ = host.Host.ofLocalName(name);
  await host_.waitOnDNS();
  await host_.learnHostKey();
  return host;
}

const vaultConfig = {
  1: {
    prox: prox.instances[2],
  },
  2: {
    prox: prox.instances[3],
  },
  3: {
    prox: prox.instances[4],
  },
};
export type VaultNum = keyof typeof vaultConfig;

export async function mkVault(num: VaultNum) {
  const name = "nyc1-vault-a" + String(num).padStart(2, "0");
  await delIfExists(name);
  const config = vaultConfig[num];
  const vm = await mkVM(name, config.prox);
  await vault.setupVault(vm.exec.bind(vm));
  return vm;
}

const nomadConfig = {
  1: {
    prox: prox.instances[3],
  },
  2: {
    prox: prox.instances[4],
  },
  3: {
    prox: prox.instances[2],
  },
};
export type NomadNum = keyof typeof nomadConfig;

export async function mkNomad(num: NomadNum) {
  const name = "nyc1-nomad-a" + String(num).padStart(2, "0");
  await delIfExists(name);
  const config = nomadConfig[num];
  const vm = await mkVM(name, config.prox);
  await nomad.setupServer(vm.exec.bind(vm));
  return vm;
}
