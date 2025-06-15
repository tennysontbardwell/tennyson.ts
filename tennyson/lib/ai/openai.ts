import * as common from "tennyson/lib/core/common";

// openai-api.ts

/**
 * TypeScript module for OpenAI GPT-4.1 API inference
 */

// https://kagi.com/assistant/f87f6e6e-167d-4a0a-a054-72fd4832f2e5
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
  output: ResponseMessage[];
}

// Configuration
export class OpenAIConfig {
  private static apiKey: string;
  private static baseUrl: string = 'https://api.openai.com/v1/responses';

  static setApiKey(key: string): void {
    this.apiKey = key;
  }

  static getApiKey(): string {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not set. Call OpenAIConfig.setApiKey() first.');
    }
    return this.apiKey;
  }

  static getBaseUrl(): string {
    return this.baseUrl;
  }
}

// Main API client class
export class OpenAIClient {
  private model: string;

  constructor(model: string = 'gpt-4.1') {
    this.model = model;
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
    const apiKey = OpenAIConfig.getApiKey();
    const url = OpenAIConfig.getBaseUrl();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(options)
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
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
  async generate(prompt: string, instructions?: string): Promise<string> {
    const client = new OpenAIClient();
    return client.generateText(prompt, instructions);
  },

  /**
   * Generate with specific model
   */
  async generateWithModel(
    model: string,
    prompt: string,
    instructions?: string
  ): Promise<string> {
    const client = new OpenAIClient(model);
    return client.generateText(prompt, instructions);
  },

  /**
   * Create a configured client instance
   */
  createClient(model: string = 'gpt-4.1'): OpenAIClient {
    return new OpenAIClient(model);
  }
};

// Example usage helper
export function createPromptWithExamples(
  identity: string,
  instructions: string[],
  examples: Array<{ input: string; output: string }>,
  context?: string
): string {
  let prompt = `# Identity\n\n${identity}\n\n`;

  prompt += `# Instructions\n\n`;
  instructions.forEach(instruction => {
    prompt += `* ${instruction}\n`;
  });

  if (examples.length > 0) {
    prompt += `\n# Examples\n\n`;
    examples.forEach((example, index) => {
      prompt += `<user_query id="example-${index + 1}">\n${example.input}\n</user_query>\n\n`;
      prompt += `<assistant_response id="example-${index + 1}">\n${example.output}\n</assistant_response>\n\n`;
    });
  }

  if (context) {
    prompt += `# Context\n\n${context}\n`;
  }

  return prompt.trim();
}
