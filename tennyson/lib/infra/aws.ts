// import * as client_ec2 from '@aws-sdk/client-ec2';
import * as client_route_53 from "@aws-sdk/client-route-53";

export async function setARecord(subdomain: string, ip: string) {
  const route53 = new client_route_53.Route53Client({ region: "us-east-1" });
  const cmd = new client_route_53.ChangeResourceRecordSetsCommand({
    HostedZoneId: "/hostedzone/Z3NZNRFV6VRXID",
    ChangeBatch: {
      Changes: [
        {
          Action: "UPSERT",
          ResourceRecordSet: {
            Name: subdomain + ".tennysontbardwell.com",
            Type: "A",
            TTL: 30,
            ResourceRecords: [
              {
                Value: ip,
              },
            ],
          },
        },
      ],
    },
  });
  await route53.send(cmd);
}

// export async function createNewBig() {
//   const ec2 = client_ec2({region: 'us-east-1'})
//   const run = new ec2.RunInstancesCommand();
// }
