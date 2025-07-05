import * as host from "tennyson/lib/infra/host";
import * as common from "tennyson/lib/core/common";
import { _InstanceType } from "@aws-sdk/client-ec2";

const debAMIs = {
  "af-south-1": { "arm": "ami-0fea3cc61b6ae02cf", "amd": "ami-07ebb5edaf5a8f2e9" },
  "ap-east-1": { "arm": "ami-02ced3f2807d02a1a", "amd": "ami-01ea24138e0bed489" },
  "ap-northeast-1": { "arm": "ami-0c8d182fa5128de8b", "amd": "ami-0944e03d5665fd60d" },
  "ap-northeast-2": { "arm": "ami-0781712dc68b750fb", "amd": "ami-0548636fa1c2b8677" },
  "ap-northeast-3": { "arm": "ami-0382b715629118313", "amd": "ami-0696d50e5f400e1c4" },
  "ap-south-1": { "arm": "ami-0cb8f9bf08fbf3b29", "amd": "ami-0aa17f8733afd3f20" },
  "ap-south-2": { "arm": "ami-0ad04684a8fe3c751", "amd": "ami-0433a9aea2bfe190e" },
  "ap-southeast-1": { "arm": "ami-030cd3d2d244949b1", "amd": "ami-0193f684d5be7b642" },
  "ap-southeast-2": { "arm": "ami-09e3850be81fe9cc5", "amd": "ami-0c17275d10089f0d2" },
  "ap-southeast-3": { "arm": "ami-07e375a07e3b5e5cd", "amd": "ami-0554560a4b6346769" },
  "ap-southeast-4": { "arm": "ami-06b2321617b9a3cf7", "amd": "ami-00b6abd6d4cec53d4" },
  "ap-southeast-5": { "arm": "ami-08adcd65063e88958", "amd": "ami-05419fe902981d94d" },
  "ap-southeast-7": { "arm": "ami-093f522c50cd6d5d4", "amd": "ami-0dcfcf6bb64db2a7e" },
  "ca-central-1": { "arm": "ami-090e84750640e57a5", "amd": "ami-0d5b7ed2156225d60" },
  "ca-west-1": { "arm": "ami-0af5eb48a171386bf", "amd": "ami-093fb5647d0b16be1" },
  "eu-central-1": { "arm": "ami-091ce57938e5a70bb", "amd": "ami-05402d6aa168d6c36" },
  "eu-central-2": { "arm": "ami-04c507537651dec50", "amd": "ami-0b8425a9cac51aaad" },
  "eu-north-1": { "arm": "ami-07123b85d7c525ca9", "amd": "ami-00447e5f20f4f9b4d" },
  "eu-south-1": { "arm": "ami-0e8f5ed0eb7bcad26", "amd": "ami-0305e10463103a019" },
  "eu-south-2": { "arm": "ami-0070ba84d7f4362cb", "amd": "ami-0c42c881ff04e08dd" },
  "eu-west-1": { "arm": "ami-0883772c0f05b3dca", "amd": "ami-061bf8078d9dc989c" },
  "eu-west-2": { "arm": "ami-0ddc604f0ad502663", "amd": "ami-040032c28148cb2bc" },
  "eu-west-3": { "arm": "ami-08667fa703e9a8168", "amd": "ami-0c6017a5931e336d5" },
  "il-central-1": { "arm": "ami-04695beb2b8672910", "amd": "ami-0f685d120d71595b4" },
  "me-central-1": { "arm": "ami-0cc4a2a16a7167c2c", "amd": "ami-089cb2b8dc3f0cdd7" },
  "me-south-1": { "arm": "ami-03a3cfcfae8cec211", "amd": "ami-05c9011e13bd1a74a" },
  "mx-central-1": { "arm": "ami-0f08e599569bbf0a1", "amd": "ami-0e855e6ca0a2cdc10" },
  "sa-east-1": { "arm": "ami-0368755a5fc7cddde", "amd": "ami-01aa7886678885355" },
  "us-east-1": { "arm": "ami-0193c3fbc126920ad", "amd": "ami-0e284c57019a85fd7" },
  "us-east-2": { "arm": "ami-06de46c558a2b6eaa", "amd": "ami-0b84f809240644f43" },
  "us-west-1": { "arm": "ami-077cecfae89a1a21e", "amd": "ami-07046ea6179c16e4d" },
  "us-west-2": { "arm": "ami-02628897b788fb465", "amd": "ami-0f0c4448a1445ea3d " },
};

export type Region = keyof typeof debAMIs;

export const sizes = {
  small: _InstanceType.t4g_small,
  big: _InstanceType.t4g_2xlarge,
  gpu_medium: _InstanceType.g5g_4xlarge,
  // small: "t4g.small",
  // big: "t4g.2xlarge",
};

type Params = {
  onExisting: "ignore" | "purge" | "fail";
  diskSizeGb: number;
  instance: _InstanceType;
  region: Region;
  additionalSecurityGroups: string[],
  terminateOnShutdown: Boolean,
};

const defaultParams: Params = {
  onExisting: "fail",
  diskSizeGb: 8,
  instance: "t4g.small",
  // instance: _InstanceType.t4g_small , ///"t4g.small",
  region: "us-east-1",
  additionalSecurityGroups: [],
  terminateOnShutdown: false,
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

async function createNewFromParams(name: string, params: Params) {
  const client_ec2 = await import("@aws-sdk/client-ec2");
  const ec2 = new client_ec2.EC2Client({ region: params.region });
  const InstanceInitiatedShutdownBehavior = (function() {
    if (params.terminateOnShutdown)
      return "terminate"
    else
      "stop"
      })()
  const cmd = new client_ec2.RunInstancesCommand({
    ImageId: debAMIs[params.region]["arm"],
    InstanceType: params.instance,
    KeyName: "tennyson@onyx",
    SecurityGroups: ["public-ssh", "web-ingress"].concat(params.additionalSecurityGroups),
    TagSpecifications: [
      {
        Tags: [
          { Key: "source", Value: "tennyson.ts/v0" },
          { Key: "Name", Value: name },
        ],
        ResourceType: "volume",
      },
      {
        Tags: [
          { Key: "source", Value: "tennyson.ts/v0" },
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
    InstanceInitiatedShutdownBehavior,
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

export async function createNew(name: string, params: Partial<Params> = {}) {
  return createNewFromParams(name, {
    ...defaultParams,
    ...params,
  });
}

export async function createNewBig(name: string, params: Partial<Params> = {}) {
  return createNew(name, {instance: sizes.big});
}

export async function createNewSmall(name: string, params: Partial<Params> = {}
) {
  return createNew(name, {instance: sizes.small});
}
