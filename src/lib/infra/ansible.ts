import * as host from "src/lib/infra/host";
import * as common from "src/lib/core/common";
import * as execlib from "src/lib/core/exec";

export async function test(hostname: string, user = "root") {
  const fqdn = host.Host.ofLocalName(hostname).fqdn();
  const playbook = `
- hosts: all
  tasks:
    - name: Hello World!
      debug:
        msg: "Hello World!"
`;
  const res = await execlib.ExecHelpers.bashWrapForStdinPipe(execlib.exec)(
    "ansible-playbook",
    ["-i", fqdn + ",", "-u", user, "/dev/stdin"],
    { stdin: playbook }
  );
  common.log.info(res);
}
