import * as host from "tennyson/lib/infra/host";
import * as prox from "tennyson/lib/infra/prox";
import * as infraBuilder from "tennyson/lib/infra/infra-builder";

// https://devopstales.github.io/linux/install-unifi-controller/
const rootInstallScript = `
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

cd /root
wget https://www.sqlite.org/2022/sqlite-autoconf-3370200.tar.gz
tar xvfz sqlite-autoconf-3370200.tar.gz
cd sqlite-autoconf-3370200
./configure
make
make install
echo '/usr/local/lib' >> /etc/ld.so.conf
export LD_RUN_PATH=/usr/local/lib
cd /root
wget https://www.python.org/ftp/python/3.9.4/Python-3.9.4.tgz
tar xzf Python-3.9.4.tgz
cd Python-3.9.4
./configure --enable-optimizations --enable-loadable-sqlite-extensions
make altinstall
`;
const userInstallScript = `
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

cd /srv/homeassistant
python3.9 -m venv .
source bin/activate
python3 -m pip install wheel
pip3 install homeassistant
`;

const startupScript = `
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

cd /srv/homeassistant
source bin/activate
hass
`;

const startupScriptPath = "/root/start_hass.sh";

export const defaultHostname = "nyc1-hassio-a01";

export const defaultHost = host.Host.ofLocalName(defaultHostname);

export async function make() {
  const vm = await infraBuilder.mkCT(prox.instances[3], defaultHostname);
  await vm
    .apt()
    .install([
      "python3",
      "python3-dev",
      "python3-venv",
      "python3-pip",
      "libffi-dev",
      "libssl-dev",
      "libjpeg-dev",
      "zlib1g-dev",
      "autoconf",
      "build-essential",
      "libopenjp2-7",
      "libtiff5",
      "libturbojpeg0",
      "tzdata",
      "libsqlite3-dev",
    ]);
  await vm.exec("useradd", ["-rm", "homeassistant"]);
  await vm.exec("mkdir", ["-p", "/srv/homeassistant"]);
  await vm.exec("chown", ["homeassistant:homeassistant", "/srv/homeassistant"]);
  await vm.putFile("/root/root_install.sh", rootInstallScript);
  await vm.putFile("/home/homeassistant/user_install.sh", userInstallScript);
  await vm.exec("chown", [
    "homeassistant:homeassistant",
    "/home/homeassistant/user_install.sh",
  ]);
  await vm.exec("bash", ["/root/root_install.sh"]);
  await vm.exec("sudo", [
    "-u",
    "homeassistant",
    "bash",
    "/home/homeassistant/user_install.sh",
  ]);
  await vm.putFile(startupScriptPath, startupScript);
  await infraBuilder.addService(vm.exec, "hass", "bash " + startupScriptPath);
}
