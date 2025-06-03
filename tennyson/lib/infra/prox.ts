import { Host, Apt } from "tennyson/lib/infra/host";
import * as memory from "tennyson/lib/core/memory";
import * as consul from "tennyson/lib/infra/consul";
import * as common from "tennyson/lib/core/common";
import { ExecHelpers, ExecLike } from "tennyson/lib/core/exec";
import * as secrets from "tennyson/secrets/secrets";
import * as yaml from "yaml";

import Path from "path";
import { proxmoxInstances } from "tennyson/lib/infra/common-infra";

export class Prox {
  readonly host: Host;

  constructor(host: Host) {
    this.host = host;
  }

  static ofHostname(host: string) {
    return new Prox(Host.ofLocalName(host));
  }

  async nextId() {
    const makeResults = await this.host.execNoStderr("pvesh", [
      "get",
      "/cluster/nextid",
    ]);
    const id = Number.parseInt(makeResults.stdout);
    if (isNaN(id)) {
      throw { message: "get next id failed", results: makeResults };
    }
    return id;
  }

  async listCTID() {
    const res = await this.host.execNoStderr("pct", ["list"]);
    const lines = res.stdout.split("\n").slice(1, -1);
    return lines.map((line: string) => {
      const components = line.trim().split(/\s+/);
      return {
        id: parseInt(components[0]),
        status: components[1],
        name: components[components.length - 1],
      };
    });
  }
  async findCTID(name: string) {
    const cts = await this.listCTID();
    return cts.find((ct, _) => ct.name == name);
  }

  async listHosts() {
    const cts = await this.listCTID();
    const vms = await this.listVMID();
    return cts.concat(vms);
  }

  async del(id: number, type: "vm" | "ct") {
    const cmd = { vm: "qm", ct: "pct" }[type];
    common.log.info("deleting vm", { prox: this.host.sshTarget(), id });
    await this.host.exec(cmd, ["stop", id.toString()], {
      acceptExitCode: (_code) => true,
    });
    await this.host.exec(cmd, ["destroy", id.toString()]);
  }

  async listVMID() {
    const res = await this.host.execNoStderr("qm", ["list"]);
    const lines = res.stdout.split("\n").slice(1, -1);
    return lines.map((line: string) => {
      const components = line.split(/\s+/);
      return {
        id: parseInt(components[1]),
        status: components[3],
        name: components[2],
      };
    });
  }

  async findVMID(name: string) {
    const vms = await this.listVMID();
    return vms.find((vm) => vm.name == name);
  }

  async delIfExists(name: string) {
    const host_ = Host.ofLocalName(name);
    const first = async (arr: Promise<any>[]) => {
      const arr_ = await Promise.allSettled(arr);
      const res_ = arr_.map((res: PromiseSettledResult<any>) =>
        res.status == "fulfilled" ? res?.value : null
      );
      return res_.find((el) => el !== undefined);
    };
    const ct = await first([
      this.findCTID(host_.fqdn()),
      this.findCTID(host_.hostname()),
    ]);
    const vm = await first([
      this.findVMID(host_.fqdn()),
      this.findVMID(host_.hostname()),
    ]);
    const exec = this.host.exec.bind(this.host);
    async function leave() {
      await exec("consul", ["force-leave", host_.hostname()], {
        acceptExitCode: (_) => true,
      });
    }
    if (ct) {
      await this.del(ct.id, "ct");
      await leave();
    }
    if (vm) {
      await this.del(vm.id, "vm");
      await leave();
    }
  }
}

export async function fixProxEnterpriseRepos(exec: ExecLike) {
  await ExecHelpers.sh(exec, "rm /etc/apt/sources.list.d/pve-enterprise.list");
  await ExecHelpers.putFile(
    exec,
    "/etc/apt/sources.list.d/pve-no-subscription.list",
    `
deb http://ftp.debian.org/debian bullseye main contrib
deb http://ftp.debian.org/debian bullseye-updates main contrib

# PVE pve-no-subscription repository provided by proxmox.com,
# NOT recommended for production use
deb http://download.proxmox.com/debian/pve bullseye pve-no-subscription

# security updates
deb http://security.debian.org/debian-security bullseye-security main contrib
`
  );
}

export const instances = {
  // 1: Prox.ofHostname("nyc1-prox-1"),
  2: Prox.ofHostname("nyc1-prox-2"),
  3: Prox.ofHostname("nyc1-prox-a03"),
  4: Prox.ofHostname("nyc1-prox-a04"),
};

export class All {
  static async listHostnames() {
    const hosts = await Promise.all(
      Object.values(instances).map(async (prox) => {
        const hosts = await prox.listHosts();
        return hosts.map((host) => host.name);
      })
    );
    return hosts.flat();
  }
}

export class BabyVm {
  readonly prox: Prox;
  readonly vmHost: Host;
  readonly id: number;

  constructor(prox: Prox, vmHost: Host, id: number) {
    this.prox = prox;
    this.vmHost = vmHost;
    this.id = id;
  }

  execOnContainer(command: string, args: string[], options?: any) {
    return this.prox.host.exec(
      "pct",
      ["exec", this.id.toString(), "--", "/usr/bin/env", command].concat(args),
      options
    );
  }

  async putFile(path: string, contents: string) {
    await this.execOnContainer("mkdir", ["-p", Path.dirname(path)]);
    await this.execOnContainer("dd", ["of=" + path, "status=none"], {
      stdin: contents,
    });
  }

  async appendFile(path: string, contents: string) {
    await this.execOnContainer("mkdir", ["-p", Path.dirname(path)]);
    await this.execOnContainer("touch", [path]);
    await this.execOnContainer("tee", ["-a", path], { stdin: contents });
  }
}
const defaultParams = {
  diskSize: memory.Memory.parse("8 GiB"),
  cores: 1,
  memory: memory.Memory.parse("1 GiB"),
  swap: memory.Memory.parse("512 MiB"),
  onboot: true,
  password: "123456",
  ip: null,
  nameserver: null,
  // iso: "/t/tank/projects-data/iso/external/debian-10-standard_10.7-1_amd64.tar.gz",
  iso: "/t/tank/projects-data/iso/external/debian-11-standard_11.3-1_amd64.tar.zst",
  mountPoints: [
    // "/t/tank/media",
  ],
};

export type Params = common.Modify<
  typeof defaultParams,
  {
    ip: null | string;
    nameserver: null | string;
  }
>;

export async function createVM(hostname: string, prox: Prox = instances[3]) {
  const next = await prox.nextId();
  const host_ = Host.ofLocalName(hostname);
  const exec = prox.host.execNoStderr.bind(prox.host);
  const sh = async (cmd: string) => prox.host.execNoStderr("bash", ["-c", cmd]);
  await exec("qm", [
    "create",
    next.toString(),
    // "--cdrom",
    // "local:iso/debian-10.11.0-amd64-netinst.iso",
    "--name",
    host_.fqdn(),
    // "--vlan0",
    "--net0",
    "bridge=vmbr0,virtio",
    // "--virtio0",
    // "data2:30,format=raw",
    "--bootdisk",
    "virtio0",
    "--ostype",
    "l26",
    "--memory",
    "4096",
    "--onboot",
    "yes",
    "--sockets",
    "1",
  ]);
  await sh(
    `qm importdisk ${next.toString()} /t/tank/projects-data/iso/external/debian-11-genericcloud-amd64-20220328-962.raw local-lvm`
  );
  await prox.host.execNoStderr("qm", [
    "set",
    next.toString(),
    "--scsihw",
    "virtio-scsi-pci",
    "--scsi0",
    `local-lvm:vm-${next.toString()}-disk-0`,
  ]);
  await sh(`qm resize ${next.toString()} scsi0 30G`);
  await sh(`qm set ${next.toString()} --ide2 local-lvm:cloudinit`);
  await sh(`qm set ${next.toString()} --boot c --bootdisk scsi0`);
  await sh(`qm set ${next.toString()} --serial0 socket --vga serial0`);
  const userInitSnippetName = `tmp-${next.toString()}-user.yml`;
  const firstRunSh = `\
#!/usr/bin/env bash
touch /tmp/a
mkdir /etc/systemd/system-preset/
echo "# intentionally empty" > /etc/consul.d/consul.hcl
mkdir -p /var/local/consul/logs
chown consul:consul -R /etc/consul.d /var/local/consul
cat - <<EOF > /etc/consul.d/host.json
{
  "data_dir": "/var/local/consul",
  "log_file": "/var/local/consul/logs/consul.log",
  "retry_join": ["10.10.0.3", "10.10.0.20", "10.10.0.21", "10.10.0.22", "10.10.0.23"],
  "encrypt": ${secrets.consul_encrypt_key},
  "datacenter": "nyc1",
  "node_meta": {
    "ssh_user": "admin"
  }
}
EOF
systemctl enable --now consul
`;
  const fileYaml = yaml.stringify({
    hostname: host_.hostname(),
    managed_etc_hosts: true,
    fqdn: host_.fqdn(),
    chpasswd: { expire: false },
    users: [
      "default",
      {
        name: "root",
        ssh_authorized_keys: [secrets.arch_misc],
      },
      {
        name: "admin",
        ssh_authorized_keys: [secrets.arch_misc],
        sudo: "ALL=(ALL) NOPASSWD:ALL",
      },
    ],
    package_upgrade: true,
    packages: [
      "ca-certificates",
      "gpg",
      "curl",
      "wget",
      "less",
      "ssh",
      "rsync",
      "sed",
      "ucf",
      "openssh-server",
      "apt-utils",
      "lsb-release",
      "software-properties-common",
      "psmisc",
      "sudo",
      "consul",
    ],
    apt: {
      sources: {
        source1: {
          source:
            "deb [arch=amd64] https://apt.releases.hashicorp.com $RELEASE main",
          key: `\
-----BEGIN PGP PUBLIC KEY BLOCK-----

mQINBF60TuYBEADLS1MP7XrMlRkn1Y54cb2UclUMH8HkIRfBrhk5Leo9kNZc/2QD
LmdQbi3UbZkz0uVkHqbFDgV5lAnukCnxgr9BqnL0GJpO78le7gCCbM5bR4rTJ6Ar
OOtIKf25smGTIpbSwNdj8BOLqiExGFj/9L5X9S5kfq3vtuYt+lmxKkIrEPjSYnFR
TQ2mTL8RM932GJod/5VJ2+6YvrCjtPu5/rW02H1U2ZHiTtX6ZGnIvv/sprKyFRqT
x4Ib+o9XwXof/LuxTMpVwIHSzCYanH5hPc7yRGKzIntBS+dDom+h9smx7FTgpHwt
QRFGLtVoHXqON6nXTLFDkEzxr+fXq/bgB1Kc1TuzvoK601ztQGhhDaEPloKqNWM8
Ho7JU1RpnoWr5jOFTYiPM9uyCtFNsJmD9mt4K8sQQN7T2inR5Us0o510FqePRFeX
wOJUMi1CbeYqVHfKQ5cWYujcK8pv3l1a6dSBmFfcdxtwIoA16JzCrgsCeumTDvKu
hOiTctb28srL/9WwlijUzZy6R2BGBbhP937f2NbMS/rpby7M1WizKeo2tkKVyK+w
SUWSw6EtFJi7kRSkH7rvy/ysU9I2ma88TyvyOgIz1NRRXYsW7+brgwXnuJraOLaB
5aiuhlngKpTPvP9CFib7AW2QOXustMZ7pOUREmxgS4kqxo74CuFws163TwARAQAB
tFFIYXNoaUNvcnAgU2VjdXJpdHkgKEhhc2hpQ29ycCBQYWNrYWdlIFNpZ25pbmcp
IDxzZWN1cml0eStwYWNrYWdpbmdAaGFzaGljb3JwLmNvbT6JAk4EEwEIADgWIQTo
oDLglNjrTqGJ0nDaQYyIoyGfewUCXrRO5gIbAwULCQgHAgYVCgkICwIEFgIDAQIe
AQIXgAAKCRDaQYyIoyGfe6/WD/9dTM/1OSgbvSPpPJOOcn5L1nOKRBJpztr4V0ky
GoCDakIQ/sykbcuHXP79FGLzrM8zQOsbvVp/Z2lsWBnxkT8KWM+8LZxYToRGdZhr
huFPHV9df0vAsZGisu4ejHDneHOTO3KqVotkky34jUSjBL7Q8uwXHY9r+5hb452N
vafN1w0Y1QVhb6JjjwWHR8Rf9qkSIEi6m9o8a1M54yQC2y/Zrs6+4F3zZ4uYfTvz
MyFfj0P5VmAoaowLSRdb2/JTObu0+zpKN+PjZA8BcnOf/pvqmEz83FIfo6zJLScx
TVaAwj5Iz/jS04x7EvBuIP3vpgv1R6r+t0qU/7hpu7Oc0dsxhL+C8BpVY26/2hvX
ozN5eG0ysSwexqwls+bnRgd6KdoHlWFNfbW8RCPKyb/s+tmFqGAY/QmxMkukgnXQ
WvBoa0Gdv2AFVLYup9tEO1zF4zBPh5oQwAXDNudLTHJ4KmyEwWsOQJUjNB4y4a7j
iGgK77T4KKXpo7pVDP8Ur+tmNH/d+/YFjxrfJvWt4ypE5dZmFO/FrUMvIGglOLDt
A+SiQe73IpEebB8PiqNlqJ2NU7artuRxYQVColt+/1puIHwV+h0SnMoUEvYqAtxP
J/N3JaiytWlesPPFWvhU/JGUAld5coEU2gbYtlenV/YmdjilIBu50sMSPGF5/6gv
BAA/DbkCDQRetE7mARAA0OH1pn0vdEfSm1kdqIDP3BXBD0BRHNNgGpyXXRRJFaip
bmpu7jSv3FsvN/NmG3BcLXXLFvwY/eIOr6fxRye+a5FSQEtvBnI1GHNmD5GAVT/H
KiwrT5e3ReR/FQS7hCXWU4OA2bKmSEdkJ952NhyYeyAKbkOBgbnlEhtWOAdMI7ws
peHAlHDqfGVOKXDh+FddCUQj/yZ2rblSzFdcC9gtcJSyHWgOQdVAEesEZ16hcZoj
+6O+6BXOQWOo7EPD7lA9a1qesBkSRcxQn48IVVZ2Qx2P2FtCfF+SFX+HQdqJGl15
qxE5CXTuJCMmCVnWhvcLW405uF/HmMFXdqGobEDiQsFFQrfpPVOi4T90VkW8P81s
uPoAlWht1CppNnmhWlvPQsPK/oSMBBOvOEH1EnWJate8yIkveNbqzrE7Xt3sjF6k
yqXaF+qW8OcDvSH/fgvVd21G10Cm77Z2WaKWvfi221oWj+WrgT8cCYv0AVmaLRMe
dajuYlPRQ8KaZaESza2eXggOMP5LQs/mQgfHfwSRekSbKg/L6ctp+xrZ0DPj4iIl
8+H4DxTILopAFWXA1a+uMVp8mV77gA9PyV3nIkrwgaZQ8MdhoKwvN/+SbvhpdzyF
UekzMP/HOaC6JgAomluwnFCdMDFa3FMCF3QUcIyY556QdoFD7g6033xqV6vL+d8A
EQEAAYkCNgQYAQgAIBYhBOigMuCU2OtOoYnScNpBjIijIZ97BQJetE7mAhsMAAoJ
ENpBjIijIZ97lecP+wTgSqhCz3TlUshR8lVrzECueIg3jh3+lY56am9X4MoZ2DAW
IXKjWKVWO55WPYD15A7+TbDyb4zh55m81LxSpV0CSRN4aPuixosWP4d0l+363D2F
oudz+QyvoK5J2sKFPMfhdTgGsEYVO/Zbhus5oNi0kjUTD9U7jHWPS3ilvk/g2F+k
T68lL9+oooleeT+kcBvbKt487JUOwMrkmHqNZdh8qmvMASAuqBcEcqjz96kVEMJY
bhn2skexKfIncoo/btixzJUbnplpDfibFxUHhvWWdwIv4kl3YnrCKKGSDoJcG1mV
sQegK4jWVGrqY8MnCI48iotP18ZxyqOycsZvs2jNmFlKwD9s1mrlr97HZ1MYbLWr
Hq06owH0AzVRM7tzMK7EuHkFLcoa8qh3oijn8O0B7xNOKpTZ2DjajQ/1w8nqmMi5
Z3Wie6ivKng/7p6c6HDrKjoQYc0/fuh1YnL60JG2Arn1OwdBsLDlzPL+Ro5iNwoJ
hZ+stxoZT48iAIWonBsLU11Y+MSwWdN1Eh411HTTunrEs6SafMEhnPi7vvUIZhny
Es0qOM/IUR1I0VtsurSn8aA6Y2Bp73+HuqFLx13/tPKBIUo6D7n/ywUlDCo7wtCw
aSgXPw6uF+0CyLOQ0haf2j6w1OB8ayEGSkTPER5rImCJf3MGw8IECGrErAd+
=emKC
-----END PGP PUBLIC KEY BLOCK-----
`,
        },
      },
    },
    write_files: [
      {
        encoding: "b64",
        content: Buffer.from(firstRunSh).toString("base64"),
        path: "/root/cloud_init_first_run.sh",
        permissions: "0644",
      },
    ],
    bootcmd: [
      "DEBIAN_FRONTEND=noninteractive apt-get -yq update",
      "DEBIAN_FRONTEND=noninteractive apt-get -yq install gnupg",
    ],
    runcmd: [["bash", "/root/cloud_init_first_run.sh"]],
  });
  const file = `\
#cloud-config
${fileYaml}
`;
  await ExecHelpers.putFile(
    prox.host.exec.bind(prox.host),
    `/var/lib/vz/snippets/${userInitSnippetName}`,
    file
  );
  await sh(
    `qm set ${next.toString()} --cicustom "user=local:snippets/${userInitSnippetName}"`
  );
  await sh(`qm start ${next.toString()}`);
  await host_.waitOnDNS();
  await common.sleep(5);
  await host_.learnHostKey();
  await host_.exec("sed", [
    "-i",
    "s|bullseye/updates|bullseye-security|",
    "/etc/apt/sources.list",
  ]);
  await host_.exec("chsh", ['-s', '/usr/bin/bash', 'admin']);
  return host_;
}

export async function createDebianWithoutConsul(
  prox: Prox,
  hostname: string,
  options?: Partial<Params>
) {
  const params = { ...defaultParams, ...options };
  const next = await prox.nextId();
  const hostnameLong = Host.ofLocalName(hostname).fqdn();

  const ip = params.ip ? `ip=${params.ip}/24,gw=10.10.0.1` : "ip=dhcp";
  function boolToInt(b: boolean) {
    if (b) {
      return 1;
    } else {
      return 0;
    }
  }
  const nameserverArgs =
    params.nameserver == null ? [] : ["--nameserver", params.nameserver];
  await prox.host.execNoStderr(
    "pct",
    [
      "create",
      next.toString(),
      params.iso,
      "--rootfs",
      "local-lvm:" + Math.round(params.diskSize.toGiB()),
      "--cores",
      params.cores.toString(),
      "--memory",
      Math.round(params.memory.toMiB()).toString(),
      "--swap",
      Math.round(params.swap.toMiB()).toString(),
      "--onboot",
      boolToInt(params.onboot).toString(),
      "--hostname",
      hostnameLong,
      "--password",
      params.password,
      "--features",
      "nesting=1",
      "--net0",
      `name=eth1,bridge=vmbr0,${ip},firewall=1`,
    ].concat(nameserverArgs)
  );
  const configPath = "/etc/pve/lxc/" + next.toString() + ".conf";
  await prox.host.appendFile(
    configPath,
    "\n\n# begin tbardwell added\n" +
      params.mountPoints
        .map(
          (path, i) => "mp" + i.toString() + ": " + path + ",mp=" + path + "\n"
        )
        .join("")
  );
  await prox.host.execNoStderr("pct", ["start", next.toString()]);
  const config = await prox.host.exec("pct", ["config", next.toString()]);
  await prox.host.putFile(configPath, config.stdout);

  const vm = new BabyVm(prox, Host.ofLocalName(hostname), next);
  const exec = vm.execOnContainer.bind(vm);
  const apt = new Apt(exec);
  await apt.fullUpgrade();
  await apt.install([
    "ca-certificates",
    "gpg",
    "curl",
    "wget",
    "less",
    "ssh",
    "rsync",
    "sed",
    "ucf",
    "openssh-server",
    "apt-utils",
    "lsb-release",
    "software-properties-common",
    "psmisc",
    "sudo",
  ]);
  const cmd = (str: string) => vm.execOnContainer("bash", ["-c", str]);
  await cmd(
    "curl -fsSL https://apt.releases.hashicorp.com/gpg | apt-key add -"
  );
  await cmd(
    'apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"'
  );
  await apt.fullUpgrade();
  await ExecHelpers.sh(exec, "mkdir /etc/systemd/system-preset/");
  await vm.appendFile("/root/.ssh/authorized_keys", secrets.arch_misc + "\n");

  return vm;
}

export async function createDebian(
  prox: Prox,
  hostname: string,
  options?: Partial<Params>
) {
  const vm = await createDebianWithoutConsul(prox, hostname, options);
  const exec = vm.execOnContainer.bind(vm);
  await consul.setupClient(exec);

  const host = Host.ofLocalName(hostname);
  await host.waitOnDNS();
  await host.learnHostKey();
  return host;
}
