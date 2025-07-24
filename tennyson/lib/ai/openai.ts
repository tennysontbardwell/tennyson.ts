import * as common from "tennyson/lib/core/common";
import * as net_util from "tennyson/lib/core/net-util";
import type { OpenAIConfig } from "./const"
import { openAIConfig } from "./const";

// openai-api.ts
// https://kagi.com/assistant/f87f6e6e-167d-4a0a-a054-72fd4832f2e5

/**
 * TypeScript module for OpenAI GPT-4.1 API inference
 */

// Types and Interfaces
export interface Message {
  role: 'developer' | 'user' | 'assistant';
  content: string;
}

export interface TextContent {
  type: 'output_text';
  text: string;
  annotations: any[];
}

export interface ReasoningMessage {
  id: string;
  type: 'reasoning';
  status: string;
}

export interface ResponseMessage {
  id: string;
  type: 'message';
  role: 'assistant';
  content: TextContent[];
}

export interface OpenAIRequestOptions {
  model?: string;
  input: string | Message[];
  instructions?: string;
}

export interface OpenAIResponse {
  output: Array<ReasoningMessage | ResponseMessage>;
}

// Main API client class
export class OpenAIClient {
  private model: string;
  private config: OpenAIConfig;

  constructor(model: string, config: OpenAIConfig) {
    this.model = model;
    this.config = config;
  }

  /**
   * Generate text from a simple prompt
   */
  async generateText(prompt: string, instructions?: string): Promise<string> {
    const options: OpenAIRequestOptions = {
      model: this.model,
      input: prompt,
      ...(instructions && { instructions })
    };

    const response = await this.makeRequest(options);
    return this.extractText(response);
  }

  /**
   * Generate text using message-based prompts with roles
   */
  async generateWithMessages(messages: Message[], instructions?: string): Promise<string> {
    const options: OpenAIRequestOptions = {
      model: this.model,
      input: messages,
      ...(instructions && { instructions })
    };

    const response = await this.makeRequest(options);
    return this.extractText(response);
  }

  /**
   * Generate text with developer and user messages
   */
  async generateWithContext(
    developerInstructions: string,
    userPrompt: string
  ): Promise<string> {
    const messages: Message[] = [
      { role: 'developer', content: developerInstructions },
      { role: 'user', content: userPrompt }
    ];

    return this.generateWithMessages(messages);
  }

  /**
   * Get the full response object for advanced use cases
   */
  async generateRaw(options: OpenAIRequestOptions): Promise<OpenAIResponse> {
    return this.makeRequest({ model: this.model, ...options });
  }

  /**
   * Make the API request
   */
  private async makeRequest(options: OpenAIRequestOptions): Promise<OpenAIResponse> {
    try {
      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(options)
      });

      const data = await net_util.responseJsonExn(response);
      return data as OpenAIResponse;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenAI API error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Extract text from the response
   */
  private extractText(response: OpenAIResponse): string {
    const textOutputs: string[] = [];

    for (const message of response.output) {
      if (message.type !== "message")
        continue
      for (const content of message.content) {
        if (content.type === 'output_text') {
          textOutputs.push(content.text);
        }
      }
    }

    return textOutputs.join('\n');
  }
}

// Utility functions for common use cases
export const openai = {
  /**
   * Quick text generation with default model
   */
  async generate(
    prompt: string,
    instructions?: string,
  ): Promise<string> {
    const client = new OpenAIClient('gpt-4.1-mini', openAIConfig);
    return client.generateText(prompt, instructions);
  },

  /**
   * Generate with specific model
   */
  async generateWithModel(
    model: string,
    config: OpenAIConfig,
    prompt: string,
    instructions?: string
  ): Promise<string> {
    const client = new OpenAIClient(model, config);
    return client.generateText(prompt, instructions);
  },

  /**
   * Create a configured client instance
   */
  createClient(
    model: string = 'gpt-4.1-mini',
    config: OpenAIConfig = openAIConfig,
  ): OpenAIClient {
    return new OpenAIClient(model, config);
  }
};
