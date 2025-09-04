import * as secrets from "tennyson/secrets/secrets";
import * as common from "tennyson/lib/core/common";

const c = common


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

const priceRatio =
  (input: number, cached_input_ratio: number, output_ratio: number) => c.id({
    input,
    cached_input: input * cached_input_ratio,
    output: input * output_ratio
  })

export const openAIModels = {
  "gpt-4.1": { price: priceRatio(2.0, 0.25, 4) },
  "gpt-4.1-mini": { price: priceRatio(0.4, 0.25, 4) },
  "gpt-4.1-nano": { price: priceRatio(0.1, 0.25, 4) },
  "o3": { price: priceRatio(2.0, 0.25, 4) },
  "o3-mini": { price: priceRatio(1.1, 0.5, 4) },
  "o4-mini": { price: priceRatio(1.1, 0.25, 4) },
} as const;

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
    ...mapToConfigs(Object.keys(openAIModels), openAIConfig),
    // ...mapToConfigs(togetherAIModels, togetherAIConfig),
  }
})()
