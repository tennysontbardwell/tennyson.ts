import * as prox from "src/lib/infra/prox";
import * as infraBuilder from "src/lib/infra/infra-builder";
import * as host from "src/lib/infra/host";
import * as common from "src/lib/core/common";

import shellEscape from "shell-escape";

const krb5_conf = {
  path: "/etc/krb5.conf",
  contents: `\
[libdefaults]
    default_realm = TENNYSONTBARDWELL.COM

[realms]
    TENNYSONTBARDWELL.COM = {
        admin_server = nyc1-kdc-a01.node.consul.tennysontbardwell.com
        kdc = nyc1-kdc-a01.node.consul.tennysontbardwell.com
        kdc = nyc1-kdc-a02.node.consul.tennysontbardwell.com
        # This breaks krb4 compatibility but increases security
        default_principal_flags = +preauth
    }

[domain_realm]
    tennysontbardwell.com = TENNYSONTBARDWELL.COM
    .tennysontbardwell.com = TENNYSONTBARDWELL.COM

[capaths]

[plugins]

[logging]
    kdc          = SYSLOG:NOTICE
    admin_server = SYSLOG:NOTICE
    default      = SYSLOG:NOTICE
`,
};

export async function makeKDC(prox_: prox.Prox) {
  const masterPassword = process.env["KERBEROS_MASTER_PASSWORD"];
  const host_ = await infraBuilder.mkCT(prox_, "nyc1-kdc-a01");
  function runKerbCommand(command: string, args: string[]) {
    return host_.exec(command, args, {
      stdin: masterPassword + "\n" + masterPassword + "\n",
    });
  }
  await host_.putFile(krb5_conf.path, krb5_conf.contents);

  await host_.putFile(
    "/var/kerberos/krb5kdc/kdc.conf",
    `\
  [relams]
  TENNYSONTBARDWELL.COM = {
    max_renewable_life = 7d
    EXAMPLE.COM = {
      database_name = /var/kerberos / krb5kdc / principal
        acl_file = /var/kerberos / krb5kdc / kadm5.acl
        key_stash_file = /var/kerberos / krb5kdc /.k5.EXAMPLE.COM
        kdc_ports = 750, 88
        max_life = 10h 0m 0s
        max_renewable_life = 7d 0h 0m 0s
    }`
  );

  await host_.putFile(
    "/var/kerberos/krb5kdc/kadm5.acl",
    "tbardwell/admin@TENNYSONTBARDWELL.COM *"
  );

  await host_.apt().install(["krb5-kdc", "krb5-admin-server", "krb5-config"]);

  await runKerbCommand("kdb5_util", [
    "-r",
    "TENNYSONTBARDWELL.COM",
    "create",
    "-s",
  ]);
  await runKerbCommand("kadmin.local", [
    "add_principal",
    "tbardwell/admin@TENNYSONTBARDWELL.COM",
  ]);

  await host_.exec("systemctl", [
    "enable",
    "--now",
    "krb5-admin-server",
    "krb5-kdc",
  ]);
}

export async function registerPrincipal(host_: host.Host) {
  const principals = [
    "host/" + host_.fqdn() + "@TENNYSONTBARDWELL.COM",
    "nfs/" + host_.fqdn() + "@TENNYSONTBARDWELL.COM",
  ];
  await host_.putFile(krb5_conf.path, krb5_conf.contents);
  const kdc = host.Host.ofLocalName("nyc1-kdc-a01");
  const keytab = await kdc.withTempDir(async (tmp) => {
    const keytab = tmp + "/keytab";
    for (let x in principals) {
      const princ = principals[x];
      await kdc.exec("kadmin.local", ["delete_principal", princ], {
        acceptExitCode: (_code) => true,
      });
      await kdc.exec("kadmin.local", ["addprinc", "-randkey", princ]);
      await kdc.exec("kadmin.local", ["ktadd", "-k", keytab, princ]);
    }
    const res = await kdc.exec("bash", ["-c", "cat " + keytab + " | base64"]);
    return res.stdout;
  });
  common.log.debug(keytab);
  const keytabPath = "/etc/krb5.keytab";
  await host_.putFileBase64(keytabPath, keytab);
  await host_.exec("chown", ["root:root", keytabPath]);
  await host_.exec("chmod", ["600", keytabPath]);
  await host_.apt().install(["krb5-user"]);
  function kinitArgs(principal: string) {
    return ["-Rkt", "/etc/krb5.keytab", principal];
  }
  for (const principal of principals) {
    await host_.exec("kinit", kinitArgs(principal));
  }
  await host_.putFile(
    "/etc/cron.d/kerbs",
    principals
      .map(
        (principal: string) =>
          "0 * * * * root kinit " + shellEscape(kinitArgs(principal))
      )
      .join("\n") + "\n"
  );

  await host_.appendFile("/etc/ssh/sshd_config", "GSSAPIAuthentication yes\n");
  await host_.exec("systemctl", ["restart", "sshd"]);
}

export async function allowPrincipals(hosts: Array<host.Host>, on: host.Host) {
  const principals = [on]
    .concat(hosts)
    .map((host_) => "host/" + host_.fqdn() + "@TENNYSONTBARDWELL.COM");
  const content = principals.join("\n") + "\n";
  await on.putFile("/root/.k5login", content);
}
