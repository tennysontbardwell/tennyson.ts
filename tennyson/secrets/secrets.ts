import * as process from "process";

export const arch_misc = process.env["ARCH_MISC_PUBLIC_KEY"];
export const consulBootstrap = process.env['CONSUL_BOOTSTRAP'];
export const consul_encrypt_key = process.env['CONSUL_ENCRYPT_KEY'];
export const gitlabGitCredentials = process.env['GITLAB_GIT_CREDENTIALS'];
export const gitlabPass = process.env['GITLAB_PASS'];
export const gitlabToken = process.env['GITLAB_TOKEN'];
export const hashedJupyterPass = process.env["HASHED_JUPYTER_PASS"];
export const openAIKey = process.env['OPENAI_API_KEY'];
export const togetherAIKey = process.env['TOGETHER_AI_API_KEY'];
export const sambaPassword = process.env['SAMBA_PASSWORD'];
