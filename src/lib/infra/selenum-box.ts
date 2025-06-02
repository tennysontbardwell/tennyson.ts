import * as host from "src/lib/infra/host";
import * as jupyter from "src/lib/infra/jupyter";
import * as prox from "src/lib/infra/prox";
import * as infraBuilder from "src/lib/infra/infra-builder";

export async function makeSelenium(host_: host.Host) {
  await jupyter.setup(host_.exec.bind(host_));
  await host_.apt().install(["selenium"]);
}

export async function buildDefaultVm() {
  const host_ = await infraBuilder.mkVM("nyc1-selenium-a01");
  await makeSelenium(host_);
}
