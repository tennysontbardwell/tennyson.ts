import * as host from "tennyson/lib/infra/host";
import * as execlib from "tennyson/lib/core/exec";
import { sambaPassword } from "tennyson/secrets/secrets";

export async function makeSamba(exec: execlib.ExecLike) {
  // await execlib.ExecHelpers.putFile(
  //   exec,
  //   "/etc/apt/sources.list.d/contrib.list",
  //   "deb http://deb.debian.org/debian bullseye main contrib\n"
  // );
  const apt = new host.Apt(exec);
  await apt.upgrade();
  await apt.install(["samba"]);
  // await host_.apt().install([ "zfsutils-linux"]);
  await exec("useradd", ["samba"]);
  await exec("smbpasswd", ["-a", "samba"], {
    stdin: sambaPassword + "\n" + sambaPassword + "\n",
  });
  await execlib.ExecHelpers.putFile(
    exec,
    "/etc/samba/smb.conf",
    `\
[global]
        workgroup = WORKGROUP
        server role = standalone server
        security = user
        passdb backend = tdbsam
        load printers = no

[files]
        path = /srv/samba
        valid users = samba
        writable = yes
`
  );
  await exec("mkdir", ["/srv/samba"]);
  await exec("chown", ["samba:samba", "/srv/samba"]);
}

export async function tankClient(exec: execlib.ExecLike) {
  await new host.Apt(exec).install(["cifs-utils"]);
  await execlib.ExecHelpers.putFile(
    exec,
    "/etc/samba/tank-credential",
    "username=samba\npassword=" + sambaPassword
  );
  await execlib.ExecHelpers.appendFile(
    exec,
    "/etc/fstab",
    "\n//nyc1-samba-a01.node.nyc1.consul.tennysontbardwell.com/files /t/tank  cifs credentials=/etc/samba/tank-credential,uid=1000,gid=1000 0 2\n"
  );
  await exec("mkdir", ["-p", "/t/tank/"]);
  await exec("mount", ["-av"]);
}
