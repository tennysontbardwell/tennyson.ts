import * as infraBuilder from "tennyson/lib/infra/infra-builder";
import * as host from "tennyson/lib/infra/host";
import * as prox from "tennyson/lib/infra/prox";
import * as common from "tennyson/lib/core/common";
import * as execlib from "tennyson/lib/core/exec";
import * as vault from "tennyson/lib/infra/vault";
import * as commonInfra from "tennyson/lib/infra/common-infra";
import * as secrets from "tennyson/secrets/secrets";
import axios from "axios";
import https from "https";

function nameOfNum(num: Number) {
  return "nyc1-workstation-a" + String(num).padStart(3, "0");
}

export async function build(host_: host.Host, privileged: Boolean) {
  const rootExec = host_.exec.bind(host_);
  const exec = execlib.ExecHelpers.su(rootExec, "admin", true);
  const apt = host_.apt();
  const sh = (cmd: string) => execlib.ExecHelpers.sh(exec, cmd);

  async function vault_() {
    await apt.install(["vault"]);
    const token = await execlib.exec("vault", [
      "token",
      "create",
      "-field=token",
    ]);
    await vault.setupCaFile(rootExec);
    const addr = await vault.addr();
    await execlib.ExecHelpers.su(rootExec, "admin", true)(
      "vault",
      ["login", "-address=" + addr, "-"],
      { stdin: token.stdout.trim() }
    );
  }
  if (privileged) {
    await vault_();
  }

  async function docker() {
    await apt.install(["ca-certificates", "curl", "gnupg", "lsb-release"]);
    await sh(
      "curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg"
    );
    await sh(
      'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null'
    );
    await apt.upgrade();
    await apt.install([
      "docker-ce",
      "docker-ce-cli",
      "containerd.io",
      "docker-compose-plugin",
    ]);
    await sh("sudo usermod -aG docker admin");
  }
  await docker();

  async function packages() {
    await apt.install([
      "autojump",
      "awscli",
      "base",
      "build-essential",
      "bzip2",
      "curl",
      "dnsutils",
      "emacs",
      "fzf",
      "git",
      "htop",
      "iftop",
      "jq",
      "lsof",
      "make",
      "mosh",
      "ncdu",
      "neovim",
      "nodejs",
      "npm",
      "perl",
      "python3-pip",
      "python3-venv",
      "ranger",
      "ripgrep",
      "rsync",
      "stow",
      "strace",
      "tmux",
      "zip",
      "zplug",
      "zsh",
      "nfs-common",
      "cifs-utils",
      "smbclient",
    ]);
    await rootExec("npm", [
      "install",
      "-g",
      "pure-prompt",
      "prettier",
      "tslint",
      "typescript",
      "typescript-formatter",
      "yarn",
      "vscode-json-languageserver",
    ]);
    await rootExec("pip3", [
      "install",
      "-q",
      "tqdm",
      "lxml",
      "numpy",
      "pandas",
      "python-sat",
      "sympy",
    ]);
  }
  await packages();

  async function git() {
    const httpsAgent = new https.Agent({ ca: commonInfra.pem });
    async function getRepos() {
      const res = await axios.request({
        url:
          "https://gitlab.service.nyc1.consul.tennysontbardwell.com/api/v4/projects/?private_token=" +
          secrets.gitlabToken,
        method: "get",
        httpsAgent: httpsAgent,
      });
      const data: { name: string }[] = res.data;
      return data.map((d) => d.name);
    }
    const repos = await getRepos();
    await execlib.ExecHelpers.putFile(
      exec,
      "/home/admin/.git-credentials",
      secrets.gitlabGitCredentials + "\n"
    );
    await execlib.ExecHelpers.putFile(
      exec,
      "/home/admin/.gitconfig",
      "[credential]\n    helper = store\n"
    );
    await sh("mkdir .git-credentals");
    await sh("mkdir projects");
    for (const repo of repos) {
      await sh(
        "cd projects; git clone https://gitlab.service.consul.tennysontbardwell.com/root/" +
          repo +
          ".git"
      );
    }
    await sh("rm /home/admin/.gitconfig");
    await exec("stow", [
      "-d",
      "projects/dotfiles",
      "-t",
      ".",
      "bash",
      "emacs",
      "git",
      "misc",
      "public",
      "scripts",
      "tmux",
      "vim",
      "zsh",
    ]);
  }
  if (privileged) {
    await git();
  }

  async function vim() {
    await sh(
      "curl -fLo ~/.local/share/nvim/site/autoload/plug.vim --create-dirs https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim"
    );
    await sh("nvim +PlugInstall +qall");
  }
  if (privileged) {
    await vim();
  }

  async function spacemacs() {
    await sh("git clone https://github.com/syl20bnr/spacemacs ~/.emacs.d");
  }
  await spacemacs();

  async function misc() {
    await sh("curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -");
    await apt.upgrade();
    await apt.install(["nodejs"]);
    await rootExec("chsh", ["-s", "/usr/bin/zsh", "admin"]);
  }
  await misc();

  async function miscPrivileged() {
    const addr = ""; // todo fix this
    await execlib.ExecHelpers.su(
      rootExec,
      "admin",
      true
    )("bash", [
      "-c",
      "vault kv get -field=tar-data -address=" + addr + " kv/hosts-keys/nyc1-arch-misc1 | tar -C $HOME -x",
    ]);
  }
  if (privileged) {
    await miscPrivileged();
  }

  return host_;
}

export async function buildNext(privileged: Boolean = true) {
  const hosts = await prox.All.listHostnames();
  const hostnames = hosts.map((host_) =>
    host.Host.ofLocalName(host_).hostname()
  );
  for (var i = 1; i < 1000; i++) {
    if (hostnames.find((host_) => host_ === nameOfNum(i)) === undefined) {
      const name = nameOfNum(i);
      const host_ = await infraBuilder.mkVM(name);
      return build(host_, privileged);
    }
  }
  throw "unable to find a free name, bug?";
}
