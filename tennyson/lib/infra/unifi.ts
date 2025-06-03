import * as host from "tennyson/lib/infra/host";
import * as prox from "tennyson/lib/infra/prox";
import * as infraBuilder from "tennyson/lib/infra/infra-builder";

// https://devopstales.github.io/linux/install-unifi-controller/
const script = `
apt install -y apt-transport-https ca-certificates wget dirmngr gnupg gnupg2 software-properties-common multiarch-support
wget -qO - https://www.mongodb.org/static/pgp/server-3.4.asc |  apt-key add -
echo "deb http://repo.mongodb.org/apt/debian jessie/mongodb-org/3.4 main" | tee /etc/apt/sources.list.d/mongodb-org-3.4.list
wget http://security.debian.org/debian-security/pool/updates/main/o/openssl/libssl1.0.0_1.0.1t-1+deb8u12_amd64.deb
dpkg -i libssl1.0.0_1.0.1t-1+deb8u12_amd64.deb
wget -qO - https://adoptopenjdk.jfrog.io/adoptopenjdk/api/gpg/key/public | sudo apt-key add -
sudo add-apt-repository --yes https://adoptopenjdk.jfrog.io/adoptopenjdk/deb/
apt update -y
apt install -y adoptopenjdk-8-hotspot
echo 'export JAVA_HOME="/usr/lib/jvm/adoptopenjdk-8-hotspot-amd64"' >> /etc/profile
source /etc/profile
apt-key adv --keyserver keyserver.ubuntu.com --recv 06E85760C0A52C50
echo 'deb https://www.ui.com/downloads/unifi/debian stable ubiquiti' | tee /etc/apt/sources.list.d/100-ubnt-unifi.list
apt update -y && apt install -y unifi
`

export const defaultHostname = "nyc1-unifi-a01";

export const defaultHost = host.Host.ofLocalName(defaultHostname);

export async function make() {
  const vm = await infraBuilder.mkCT(prox.instances[3], defaultHostname)
  await vm.putFile("/root/install.sh", script);
  await vm.exec("bash", ["/root/install.sh"]);
}

