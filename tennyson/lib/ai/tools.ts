import type { Static, TSchema } from '@sinclair/typebox'

export interface Attachment {
  title: string,
  contents: string,
}

export interface Tool {
  name: string;
  inputSchema: TSchema;
  outSchema: TSchema;
  description: string;
  callback: (request: string) => Promise<Attachment>;
}
