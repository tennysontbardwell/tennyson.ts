import * as host from "tennyson/lib/infra/host";
import * as execlib from "tennyson/lib/core/exec";
import * as fs from "fs";

export async function mkVpn(
  exec: execlib.ExecLike,
  hostname: string,
  configFileOutputPath: string,
) {
  // make sure aws has correct security group added
  const apt = new host.Apt(exec);
  await apt.fullUpgrade();
  await apt.install(["openvpn", "iptables-persistent"]);
  await exec("wget", [
    "https://github.com/OpenVPN/easy-rsa/releases/download/v3.0.6/EasyRSA-unix-v3.0.6.tgz",
  ]);
  await exec("tar", ["xvf", "EasyRSA-unix-v3.0.6.tgz"]);
  await execlib.ExecHelpers.putFile(
    exec,
    "/root/vars",
    `\
set_var EASYRSA_REQ_COUNTRY     "US"
set_var EASYRSA_REQ_PROVINCE    "California"
set_var EASYRSA_REQ_CITY        "San Francisco"
set_var EASYRSA_REQ_ORG "Copyleft Certificate Co"
set_var EASYRSA_REQ_EMAIL       "me@example.net"
set_var EASYRSA_REQ_OU          "My Organizational Unit"

set_var EASYRSA_ALGO ec
set_var EASYRSA_CURVE secp521r1
se
t_var EASYRSA_DIGEST "sha512"
set_var EASYRSA_NS_SUPPORT "yes"
`,
  );
  const easyrsa = "/root/EasyRSA-v3.0.6/easyrsa";
  await exec(easyrsa, ["init-pki"]);
  await exec(easyrsa, ["build-ca", "nopass"], { stdin: "server\n" });
  await exec(easyrsa, ["build-server-full", "server", "nopass"]);
  await exec(easyrsa, ["build-client-full", "client", "nopass"]);
  await exec("cp", [
    "/root/pki/private/server.key",
    "/root/pki/ca.crt",
    "/root/pki/issued/server.crt",
    "/etc/openvpn/server",
  ]);
  await execlib.ExecHelpers.putFile(
    exec,
    "/etc/openvpn/server/server.conf",
    `\
port 1194
proto udp
dev tun
ca ca.crt
cert server.crt
key server.key
dh none
topology subnet
server 10.8.0.0 255.255.255.0
ifconfig-pool-persist /var/log/openvpn/ipp.txt
push "redirect-gateway def1 bypass-dhcp"
push "dhcp-option DNS 208.67.222.222"
push "dhcp-option DNS 208.67.220.220"
keepalive 10 120
cipher AES-256-CBC
persist-key
persist-tun
status /var/log/openvpn/openvpn-status.log
verb 3
explicit-exit-notify 1
`,
  );
  await exec("systemctl", ["enable", "--now", "openvpn-server@server"]);
  await exec("sysctl", ["enable", "--now", "openvpn-server@server"]);
  await execlib.ExecHelpers.putFile(
    exec,
    "/etc/sysctl.d/10-custom.conf",
    "net.ipv4.ip_forward = 1\n",
  );
  await exec("sysctl", ["--system"]);
  await exec("iptables", [
    "-t",
    "nat",
    "-I",
    "POSTROUTING",
    "-o",
    "ens5",
    "-s",
    "10.8.0.0/24",
    "-j",
    "MASQUERADE",
  ]);
  await exec("iptables-save", ["-f", "/etc/iptables/rules.v4"]);
  await exec("cat", ["", "/etc/iptables/rules.v4"]);
  async function read(file: string) {
    const res = await exec("cat", [file]);
    return res.stdout;
  }
  const ca = await read("/root/pki/ca.crt");
  const cert = await read("/root/pki/issued/client.crt");
  const key = await read("/root/pki/private/client.key");
  const clientConf = `\
client
dev tun
proto udp
remote ${hostname} 1194
resolv-retry infinite
nobind
persist-key
persist-tun

<ca>
${ca}
</ca>

<cert>
${cert}
</cert>

<key>
${key}
</key>

remote-cert-tls server
; tls-auth ta.key 1
cipher AES-256-CBC
verb 3
`;
  await new Promise((resolve) =>
    fs.writeFile(configFileOutputPath, clientConf, resolve),
  );
}

export async function makeDcVpn(exec: execlib.ExecLike) {
  const apt = new host.Apt(exec);
  await apt.fullUpgrade();
  await apt.install(["openvpn"]);
}
