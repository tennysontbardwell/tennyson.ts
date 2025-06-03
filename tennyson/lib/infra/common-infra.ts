import { Host } from "tennyson/lib/infra/host";

export const proxmoxInstances = {
  1: Host.ofLocalName("nyc1-prox-1"),
  2: Host.ofLocalName("nyc1-prox-2"),
  3: Host.ofLocalName("nyc1-prox-a03"),
};

export const pem = "";
