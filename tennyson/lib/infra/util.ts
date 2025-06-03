import * as client_ses from "@aws-sdk/client-ses";
import * as process from "process";

import * as host from "tennyson/lib/infra/host";
import * as execlib from "tennyson/lib/core/exec";

export async function emailAlert(subject: string, contents: string) {
  const ses = new client_ses.SESClient({ region: "us-east-1" });
  const sh = async (cmd: any) => {
    const res = await execlib.exec("bash", ["-c", cmd]);
    return res.stdout.trim();
  };
  const user = await sh("whoami");
  const fqdn = await sh("hostname --fqdn");
  const me = process.env["EMAIL"];
  if (me === undefined) {
    throw "$EMAIL undefined"
  }
  await ses.send(
    new client_ses.SendEmailCommand({
      Destination: {
        ToAddresses: [me],
      },
      Message: {
        Body: {
          Text: {
            Charset: "UTF-8",
            Data: `${user}@${fqdn}\n=========\n${contents}`,
          },
        },
        Subject: {
          Charset: "UTF-8",
          Data: subject,
        },
      },
      Source: me,
    })
  );
}
