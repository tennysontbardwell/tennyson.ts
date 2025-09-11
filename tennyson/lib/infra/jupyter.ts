import * as commonInfra from "tennyson/lib/infra/common-infra";
import * as secrets from "tennyson/secrets/secrets";
import * as infraBuilder from "tennyson/lib/infra/infra-builder";
import * as prox from "tennyson/lib/infra/prox";
import * as nginx from "tennyson/lib/infra/nginx";
import * as host from "tennyson/lib/infra/host";
import * as letsencrypt from "tennyson/lib/infra/letsencrypt";
import * as memory from "tennyson/lib/core/memory";
import * as common from "tennyson/lib/core/common";
import * as execlib from "tennyson/lib/core/exec";

export const defaultHostname = "nyc1-jupyter-a01";

export const defaultHost = host.Host.ofLocalName(defaultHostname);

const defaultConfig = JSON.stringify({
  ServerApp: {
    allow_remote_access: true,
    allow_origin: "*",
    keyfile: "/root/cert.key",
    certfile: "/root/cert.pem",
    password: secrets.hashedJupyterPass,
  },
});

export async function setup(exec: execlib.ExecLike, config = defaultConfig) {
  await exec("openssl", [
    "req",
    "-x509",
    "-nodes",
    "-days",
    "365",
    "-newkey",
    "rsa:2048",
    "-keyout",
    "/root/cert.key",
    "-out",
    "/root/cert.pem",
    "-subj",
    "/C=US/ST=New', 'Sweden/L=Stockholm', '/O=.../OU=.../CN=.../emailAddress=...",
  ]);
  await exec("bash", [
    "-c",
    "curl -fsSL https://deb.nodesource.com/setup_17.x | bash -",
  ]);
  await new host.Apt(exec).install([
    "python3",
    "python3-pip",
    // following are needed for building python packages
    "build-essential",
    "libssl-dev",
    "libffi-dev",
    "python-dev",
    "libblas3",
    "liblapack3",
    "liblapack-dev",
    "libblas-dev",
    "gfortran",
    "nodejs",
    "libjpeg-dev",
    "zlib1g-dev",
  ]);
  await execlib.ExecHelpers.putFile(
    exec,
    "/home/admin/.jupyter/jupyter_server_config.json",
    config,
  );
  await nginx.setupProxy(exec, [{ listen: 443, deliver: 8080 }]);
  await exec("pip3", ["install", "jupyterlab"]);
  await infraBuilder.addService(
    exec,
    "jupyterlab",
    "/usr/local/bin/jupyter-lab --port 8080",
  );
}

export async function make(hostname: string = defaultHostname) {
  const host_ = await infraBuilder.mkVM(hostname, prox.instances[3]);
  const exec = execlib.ExecHelpers.su(host_.exec.bind(host_), "root", true);
  await new host.Apt(exec).install(["lib32z1"]);
  await setup(exec);
  return host_;
}
