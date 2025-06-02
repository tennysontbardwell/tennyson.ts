import * as host from "src/lib/infra/host";
import { ExecLike } from "src/lib/core/exec";

export async function setup(exec: ExecLike) {
  await (new host.Apt(exec)).install(['snapd']);
  await exec('snap', ['install', 'core']);
  await exec('snap', ['refresh', 'core']);
  await exec('snap', ['install', '--classic', 'certbot']);
  await exec('ln', ['-s', '/snap/bin/certbot', '/usr/bin/certbot']);
  await exec('certbot', ['--nginx']);
}
