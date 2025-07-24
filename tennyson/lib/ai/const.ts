import * as secrets from "tennyson/secrets/secrets";
import * as common from "tennyson/lib/core/common";

export interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
}

export const openAIConfig = {
  apiKey: secrets.openAIKey!,
  baseUrl: 'https://api.openai.com/v1/responses',
} as const;

// export const togetherAIConfig = {
//   apiKey: secrets.togetherAIKey!,
//   baseUrl: 'https://api.together.xyz/v1/chat/completions',
// } as const;

const openAIModels = [
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "o3",
  "o3-nano",
  "o4-mini",
] as const;

// const togetherAIModels = [
//   "deepseek-ai/DeepSeek-V3",
//   "claude-sonnet",
//   "claude-sonnet-reasoning",
// ] as const;

export const models = (() => {
  function mapToConfigs<T extends string>(
    lst: readonly T[], config: OpenAIConfig
  ) {
    return common.objOfKeys(
      lst,
      model => { return { model, config }; },
      model => model);
  }
  return {
    ...mapToConfigs(openAIModels, openAIConfig),
    // ...mapToConfigs(togetherAIModels, togetherAIConfig),
  }
})()
