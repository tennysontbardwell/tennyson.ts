import * as ec2 from "tennyson/lib/infra/ec2";

class Member {
  constructor() {
  }

  async create(name: string) {
    ec2.createNewSmall(name, {  })
  }

  async safeSwitch() {
  }
}
// async Fleet {

// }
