import { request } from "http";
import * as common from "tennyson/lib/core/common";
import * as util from "tennyson/lib/infra/util";

import axios from "axios";

const urls = [
  "https://ttp.cbp.dhs.gov/schedulerapi/slots?orderBy=soonest&limit=10&locationId=6480&minimum=",
];

async function watchOne(url: string) {
  var prev = "INIT";
  while (true) {
    const res: any = await axios.request({ method: "get", url: url });
    const curr = res.data;
    const s = JSON.stringify;
    if (s(curr) != s(prev)) {
      common.log.info(curr);
      if (curr[0].startTimestamp < "2022-07-01") {
        await util.emailAlert(
          "webwatcher",
          JSON.stringify(
            { msg: "url updated", url: url, curr: curr, prev: prev },
            null,
            2,
          ),
        );
      }
    }
    prev = curr;
    await common.sleep(1000 * 60);
  }
}

export async function watch() {
  return Promise.all(urls.map(watchOne));
}
