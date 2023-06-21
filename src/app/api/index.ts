import * as express from "express";
import * as path from "path";
import * as common from "src/lib/core/common";
import axios from "axios";

function home(body: string) {
  return (
    `\
<html>
  <header/>
  <body>` +
    body +
    `</body>
</html> `
  );
}

async function fetchServices(): Promise<string[]> {
  const res = await axios.get("http://127.0.0.1:8500/v1/catalog/services", {timeout: 2000});
  return Object.keys(res.data);
}

export async function run() {
  const app = express.default();

  app.use(function(err: any, req: any, res: any, next: any) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });

  app.get("/url", async (_req, res, _next) => {
    const services = await fetchServices();
    const serviceURLs = services.map(
      (service) =>
        "https://" + service + ".service.consul.tennysontbardwell.com"
    );

    const urls = [
      "http://nyc1-arch-misc1.node.consul.tennysontbardwell.com:3000/url",
    ].concat(serviceURLs);

    const body = urls
      .map((url) => '<a href="' + url + '">' + url + "</a><br/>")
      .join("");
    res.send(home(body));
  });
  app.listen(3000, () => {
    console.log("Server running on port 3000");
  });
}
