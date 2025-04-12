import * as host from "src/lib/infra/host";
import * as common from "src/lib/core/common";
import { _InstanceType } from "@aws-sdk/client-ec2";

const debAMIs = {
  "af-south-1": "ami-06188182a9c0e4394",
  "ap-east-1": "ami-0b2ebcf00084feb4a",
  "ap-northeast-1": "ami-0bf5e6f01c1739adb",
  "ap-northeast-2": "ami-048c836631dc041af",
  "ap-northeast-3": "ami-05ee39bde3e22002b",
  "ap-south-1": "ami-0a8315ddbd54c23b8",
  "ap-southeast-1": "ami-0c155c5f73536b570",
  "ap-southeast-2": "ami-0efeee315b9a38019",
  "ca-central-1": "ami-0e0004558dcdcc1d9",
  "eu-central-1": "ami-0f19d8906dba10cc7",
  "eu-north-1": "ami-05d511feb7976119b",
  "eu-south-1": "ami-0004d740ef8597a56",
  "eu-west-1": "ami-0707bd43fde786cc9",
  "eu-west-2": "ami-0813cde1c52013f26",
  "eu-west-3": "ami-0b344ea951d565247",
  "me-south-1": "ami-06390976c0579f9f4",
  "sa-east-1": "ami-080db479fe8358d2a",
  "us-east-1": "ami-0a8e31e05e206ead7",
  "us-east-2": "ami-020e3ff77d3faf83c",
  "us-west-1": "ami-0174aac829b619f15",
  "us-west-2": "ami-04fd3989e7bd18209",
};

export type Region = keyof typeof debAMIs;

const sizes = {
  small: _InstanceType.t4g_small,
  big: _InstanceType.t4g_2xlarge,
  // small: "t4g.small",
  // big: "t4g.2xlarge",
};

type Params = {
  onExisting: "ignore" | "purge" | "fail";
  diskSizeGb: number;
  instance: _InstanceType;
  region: Region;
  additionalSecurityGroups: string[],
};

const defaultParams: Params = {
  onExisting: "fail",
  diskSizeGb: 8,
  instance: "t4g.small",
  // instance: _InstanceType.t4g_small , ///"t4g.small",
  region: "us-east-1",
  additionalSecurityGroups: [],
};

export async function lookupByName(name: string, region: Region) {
  const client_ec2 = await import("@aws-sdk/client-ec2");
  const ec2 = new client_ec2.EC2Client({ region: region });
  const res = await ec2.send(
    new client_ec2.DescribeInstancesCommand({
      Filters: [{ Name: "tag:Name", Values: [name] }],
    })
  );
  if (res.NextToken != null) {
    throw { message: "too many matching Tag:Name", response: res };
  }
  const reservations = res.Reservations || [];
  const instances = reservations.map((x) => x.Instances || []).flat();
  return instances.map((x) => x.InstanceId).filter(common.notEmpty);
}

export async function purgeByName(name: string, region: Region = defaultParams.region ) {
  const client_ec2 = await import("@aws-sdk/client-ec2");
  const ec2 = new client_ec2.EC2Client({ region: region });
  const ids = await lookupByName(name, region);
  if (ids.length > 0) {
    const termRes = await ec2.send(
      new client_ec2.TerminateInstancesCommand({
        InstanceIds: ids,
      })
    );
    common.log.debug({
      message: "Terminated ec2 instances",
      region: region,
      ids: ids,
      results: termRes,
    });
  }
}

async function createNew(name: string, params: Params) {
  const client_ec2 = await import("@aws-sdk/client-ec2");
  const ec2 = new client_ec2.EC2Client({ region: params.region });
  const cmd = new client_ec2.RunInstancesCommand({
    ImageId: debAMIs[params.region],
    InstanceType: params.instance,
    KeyName: "tennyson@artemis",
    SecurityGroups: ["public-ssh", "web-ingress"].concat(params.additionalSecurityGroups),
    TagSpecifications: [
      {
        Tags: [
          { Key: "source", Value: "tbardwell.ts/v0" },
          { Key: "Name", Value: name },
        ],
        ResourceType: "volume",
      },
      {
        Tags: [
          { Key: "source", Value: "tbardwell.ts/v0" },
          { Key: "Name", Value: name },
        ],
        ResourceType: "instance",
      },
    ],
    BlockDeviceMappings: [
      {
        DeviceName: "/dev/xvda",
        Ebs: {
          VolumeSize: params.diskSizeGb,
        },
      },
    ],
    MinCount: 1,
    MaxCount: 1,
  });
  const res = await ec2.send(cmd);
  function id() {
    const instances = res.Instances;
    if (instances) {
      return instances[0].InstanceId;
    } else {
      throw {
        mesage: "unable to create EC2 instance, unknown error",
        results: res,
      };
    }
  }
  const newId = id();
  async function getInstance() {
    const instances = await ec2.send(
      new client_ec2.DescribeInstancesCommand({})
    );
    return instances.Reservations?.flatMap((rez) => rez.Instances).find(
      (instance) => instance?.InstanceId == newId
    );
  }

  async function isRunning() {
    const instance = await getInstance();
    return instance?.State?.Name == "running";
  }
  await common.retryExn(3000, 10, isRunning);
  const instance = await getInstance();
  common.log.info(newId);
  if (instance) {
    const name = instance.PublicDnsName;
    common.log.info(name);
    if (name) {
      const host_ = new host.Host(name, "admin");
      await common.retryExn(3000, 10, () =>
        common.didRaise(() => common.ignore(host_.learnHostKey()))
      );
      return host_;
    }
  }
  throw { message: "unable to create aws ec2 host", instance: instance };
}

export async function createNewBig(name: string, params: Partial<Params> = {}) {
  return createNew(name, {
    ...defaultParams,
    ...params,
    instance: sizes.big,
  });
}

export async function createNewSmall(
  name: string,
  params: Partial<Params> = {}
) {
  return createNew(name, {
    ...defaultParams,
    ...params,
    instance: sizes.small,
  });
}
