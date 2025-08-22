import * as common from "tennyson/lib/core/common";
import * as cNode from "tennyson/lib/core/common-node";
import * as openai from "tennyson/lib/ai/openai";
import { Schema } from 'effect'
import { Type } from '@sinclair/typebox'
import { openAIConfig } from "./const";
import type { Attachment, Tool } from './tools';

export interface Tool2<A,B> {
  name: string;
  inputSchema: Schema.Schema<A>;
  outSchema: Schema.Schema<B>;
  description: string;
  callback: (request: A) => Promise<Attachment>;
}

interface Query {
  userText: string,
  tools?: Tool[],
  maxToolCalls?: number,
  attachments?: Attachment[],
  outputSchema?: string,
  model?: string,
}

interface ToolCall {
  name: string;
  input: any;
}

async function parseToolCalls(response: string): Promise<ToolCall[] | null> {
  const lines = response.split('\n');
  const toolCallIndex = lines.findIndex(line => line.trim() === 'TOOL_CALL');

  if (toolCallIndex === -1) {
    return null;
  }

  // Get the JSON array after TOOL_CALL
  const jsonStart = toolCallIndex + 1;
  if (jsonStart >= lines.length) {
    return null;
  }

  try {
    const jsonStr = lines.slice(jsonStart).join('\n');
    const toolCalls = JSON.parse(jsonStr);
    return Array.isArray(toolCalls) ? toolCalls : null;
  } catch (error) {
    return null;
  }
}

async function executeToolsInParallel(toolCalls: ToolCall[], availableTools: Tool[]): Promise<Attachment[]> {
  const toolMap = new Map(availableTools.map(tool => [tool.name, tool]));

  const toolPromises = toolCalls.map(async (call): Promise<Attachment> => {
    const tool = toolMap.get(call.name);
    if (!tool) {
      return {
        title: `Tool Error: ${call.name}`,
        contents: `Tool "${call.name}" not found`
      };
    }

    try {
      const result = await tool.callback(JSON.stringify(call.input));
      return result;
    } catch (error) {
      return {
        title: `Tool Error: ${call.name}`,
        contents: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  });

  return Promise.all(toolPromises);
}

async function generatePrompt(query_: {
  userText: string;
  tools: Tool[];
  maxToolCalls: number;
  attachments: Attachment[];
  outputSchema?: string;
  model?: string
}): Promise<string> {
  let prompt = "";
  const model = query_.model ?? "gpt-4.1-mini";
  const sep = '==================================';

  function addSection(title: string, contents: string) {
    prompt += sep;
    prompt += " ";
    prompt += title;
    prompt += "\n";
    prompt += contents;
  }

  const toolCallsRemaining = Math.max(0, query_.maxToolCalls);
  // addSection("frontmatter", `This prompt will involve instructions from a user, ${query_.tools.length} tools, ${query_.attachments.length} attachments. You may either attempt to complete the task, you may call one or more of the tools. If you choose to call tools, then output the text TOOL_CALL followed by a newline, and a json array of the tool calls that you wish to invoke in the format { name: <name>, input: <input data> }. The <name> field must match the \"name\" key in the list of tools that follow. If the information gained by calling the tools would improve the ability of a future agent to answer the user's prompt, then that is the best choice. You have ${toolCallsRemaining} tool calls remaining.`);
  addSection("frontmatter", `This prompt will involve instructions from a user, ${query_.tools.length} tools, ${query_.attachments.length} attachments. You may either attempt to complete the task, you may call one of the tools that will provide more information to complete the task. If you choose to call a tool, then output the text TOOL_CALL followed by a newline, and the tool call input json wrapped in a json array, as such: [{ name: <name>, input: <input data> }]. The <name> field must match the \"name\" key in the list of tools that follow. If you call a tool, output only the tool call and NO other information. If the information gained by calling the tools would improve the ability of a future agent to answer the user's prompt, then that is the best choice. You have ${toolCallsRemaining} tool calls remaining.`);

  addSection("Instructions From User", query_.userText);

  query_.attachments.forEach((attachment: Attachment, i: number) => {
    addSection(`Attachment ${i + 1} of ${query_.attachments.length}; Title: ${attachment.title}`, attachment.contents);
  });

  query_.tools.forEach((tool: Tool, i: number) => {
    addSection(
      `Tool Number ${i + 1} of ${query_.tools.length}; Tool Name: \"${tool.name}\"`,
      JSON.stringify({
        name: tool.name,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outSchema,
      })
    );
  });

  return await openai.openai.generateWithModel(model, openAIConfig, prompt);
}

interface TraceEntry {
  type: 'query' | 'response' | 'tool_calls' | 'tool_results';
  timestamp: string;
  data: any;
}

export async function query(queryInput: Query, traceFile?: string): Promise<string> {
  const query_ = {
    tools: [],
    attachments: [],
    maxToolCalls: 5,
    ...queryInput
  }

  // Initialize trace array if traceFile is provided
  const trace: TraceEntry[] = [];

  const result = await queryWithTrace(query_, trace);

  // Write trace file after completion
  if (traceFile && trace.length > 0) {
    await cNode.writeBigJson(traceFile, trace)
    // await writeTraceFile(traceFile, trace);
  }

  return result;
}

async function queryWithTrace(query_: {
  userText: string;
  tools: Tool[];
  maxToolCalls: number;
  attachments: Attachment[];
  outputSchema?: string;
}, trace: TraceEntry[]): Promise<string> {

  // Add query to trace
  trace.push({
    type: 'query',
    timestamp: new Date().toISOString(),
    data: {
      userText: query_.userText,
      toolsCount: query_.tools.length,
      maxToolCalls: query_.maxToolCalls,
      attachmentsCount: query_.attachments.length,
      outputSchema: query_.outputSchema,
      attachments: query_.attachments.map(a => ({ title: a.title, contentLength: a.contents.length }))
    }
  });

  // Base case: no more tool calls allowed
  if (query_.maxToolCalls <= 0) {
    const response = await generatePrompt(query_);

    trace.push({
      type: 'response',
      timestamp: new Date().toISOString(),
      data: {
        response: response,
        reason: 'max_tool_calls_reached'
      }
    });

    return response;
  }

  const response = await generatePrompt(query_);

  // Check if tools were called
  const toolCalls = await parseToolCalls(response);
  if (!toolCalls || toolCalls.length === 0) {
    trace.push({
      type: 'response',
      timestamp: new Date().toISOString(),
      data: {
        response: response,
        reason: 'no_tool_calls'
      }
    });

    return response;
  }

  // Log tool calls
  trace.push({
    type: 'tool_calls',
    timestamp: new Date().toISOString(),
    data: {
      rawResponse: response,
      toolCalls: toolCalls,
      toolCallsCount: toolCalls.length
    }
  });

  // Execute tools in parallel
  const toolResults = await executeToolsInParallel(toolCalls, query_.tools);

  // Log tool results
  trace.push({
    type: 'tool_results',
    timestamp: new Date().toISOString(),
    data: {
      results: toolResults.map(result => ({
        title: result.title,
        contentLength: result.contents.length,
        contentPreview:
          result.contents.substring(0, 200)
          + (result.contents.length > 200 ? '...' : '')
      }))
    }
  });

  // Add tool results as attachments and recurse
  const updatedQuery = {
    ...query_,
    attachments: [...query_.attachments, ...toolResults],
    maxToolCalls: query_.maxToolCalls - toolCalls.length
  };

  return await queryWithTrace(updatedQuery, trace);
}

async function makeWebpageAttachment(
  url: string,
  process: (text: string) => string
) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`);

  const html = await response.text();

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : url;

  const text = process(html);

  const MAX_CHARS = 400_000;
  if (text.length > MAX_CHARS)
    throw new Error(
      `text length exceeds MAX_CHARS of ${MAX_CHARS}, is ${text.length}`);

  return { title, contents: text };
}

export async function webpageRaw(url: string): Promise<Attachment> {
  const process = (html: string) => html;
  return await makeWebpageAttachment(url, process);
}

export async function webpageRawish(url: string): Promise<Attachment> {
  const process = (html: string) => html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  return await makeWebpageAttachment(url, process);
}

export async function webpage(url: string): Promise<Attachment> {
  const process = (html: string) => html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return await makeWebpageAttachment(url, process);
}

export async function file(path: string, fullPathInTitle = false)
  : Promise<Attachment> {
  const fs = await import('fs/promises');
  const pathModule = await import('path');

  const contents = await fs.readFile(path, 'utf-8');
  const title = fullPathInTitle ? path : pathModule.basename(path);

  return {
    title,
    contents
  };
}

export const urlFetchTool: Tool = {
  name: "tool/network/fetch-webpage",
  inputSchema: Type.Object({
    url: Type.String({ format: "uri" })
  }),
  outSchema: Type.Object({
    title: Type.String(),
    contents: Type.String()
  }),
  description: "Fetches a webpage and returns its title and text content",
  callback: async (request: string) => {
    const input = JSON.parse(request);
    const result = await webpageRawish(input.url);
    return {
      title: request,
      contents: JSON.stringify(result),
    };
  }
};

/**
 * Securely resolves a path within bounds, preventing directory traversal attacks.
 * Returns null if path attempts to escape the starting directory.
 */
function secureResolvePath(startingPath: string, relativePath: string): string | null {
  const pathModule = require('path');
  const resolvedPath = pathModule.resolve(startingPath, relativePath);
  const normalizedStarting = pathModule.resolve(startingPath);

  // Ensure the resolved path is within the starting directory
  if (!resolvedPath.startsWith(normalizedStarting + pathModule.sep) && resolvedPath !== normalizedStarting) {
    return null;
  }

  return resolvedPath;
}

/**
 * Validates path contains no symlinks, blocking symlink traversal attacks.
 * Throws error if symlinks detected, returns void if safe.
 */
async function ensureNoSymlinks(resolvedPath: string, checkParent = false): Promise<void> {
  const fs = await import('fs/promises');
  const pathModule = await import('path');

  try {
    const stats = await fs.lstat(resolvedPath);
    if (stats.isSymbolicLink()) {
      throw new Error("Symbolic links not allowed");
    }
  } catch (error) {
    if ((error as any)?.code !== 'ENOENT') {
      throw error;
    }
    // File doesn't exist yet, that's okay
  }

  if (checkParent) {
    try {
      const parentDir = pathModule.dirname(resolvedPath);
      const parentStats = await fs.lstat(parentDir);
      if (parentStats.isSymbolicLink()) {
        throw new Error("Parent directory contains symbolic links");
      }
    } catch (error) {
      if ((error as any)?.code !== 'ENOENT') {
        throw error;
      }
      // Parent directory might not exist, that's okay
    }
  }
}

/**
 * Securely validates and resolves path with full symlink protection.
 * Combines path traversal and symlink attack prevention in single call.
 */
async function secureValidatePath(startingPath: string, relativePath: string, checkParentSymlinks = false): Promise<string> {
  const resolvedPath = secureResolvePath(startingPath, relativePath);
  if (!resolvedPath) {
    throw new Error("Path traversal outside starting directory not allowed");
  }

  await ensureNoSymlinks(resolvedPath, checkParentSymlinks);
  return resolvedPath;
}

export const readFilesTool = (startingPath: string): Tool => ({
  name: "readFiles",
  inputSchema: Type.Object({
    paths: Type.Array(Type.String())
  }),
  outSchema: Type.Object({
    files: Type.Array(Type.Object({
      path: Type.String(),
      title: Type.String(),
      contents: Type.String(),
      error: Type.Optional(Type.String())
    }))
  }),
  description: "Reads the contents of one or more files relative to the starting path",
  callback: async (request: string) => {
    const input = JSON.parse(request);
    const fs = await import('fs/promises');
    const pathModule = await import('path');

    const results = [];

    for (const relativePath of input.paths) {
      try {
        const resolvedPath = await secureValidatePath(startingPath, relativePath);
        const contents = await fs.readFile(resolvedPath, 'utf-8');

        results.push({
          path: relativePath,
          title: pathModule.basename(relativePath),
          contents: contents
        });
      } catch (error) {
        results.push({
          path: relativePath,
          title: relativePath,
          contents: "",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      title: "File Read Results",
      contents: JSON.stringify({ files: results })
    };
  }
});

export const modifyFileTool = (startingPath: string, proposeChangesOnly = true): Tool => ({
  name: "modifyFile",
  inputSchema: Type.Object({
    path: Type.String(),
    contents: Type.String()
  }),
  outSchema: Type.Object({
    success: Type.Boolean(),
    actualPath: Type.String(),
    message: Type.String()
  }),
  description: `Writes or modifies a file relative to the starting path${proposeChangesOnly ? ' (creates .proposed files for review)' : ''}`,
  callback: async (request: string) => {
    const input = JSON.parse(request);
    const fs = await import('fs/promises');
    const pathModule = await import('path');

    try {
      let resolvedPath = await secureValidatePath(startingPath, input.path, true);

      // Add .proposed extension if needed
      if (proposeChangesOnly) {
        resolvedPath += '.proposed';
      }

      // Ensure parent directory exists
      await fs.mkdir(pathModule.dirname(resolvedPath), { recursive: true });

      // Write the file
      await fs.writeFile(resolvedPath, input.contents, 'utf-8');

      const finalPath = proposeChangesOnly ? input.path + '.proposed' : input.path;
      const message = proposeChangesOnly
        ? `File proposed changes written to ${finalPath}. Review and rename to apply changes.`
        : `File successfully written to ${finalPath}`;

      return {
        title: "File Write Success",
        contents: JSON.stringify({
          success: true,
          actualPath: finalPath,
          message: message
        })
      };
    } catch (error) {
      return {
        title: "File Write Error",
        contents: JSON.stringify({
          success: false,
          actualPath: input.path,
          message: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`
        })
      };
    }
  }
});

/**
 * Reads all files in a directory (recursively) and returns them as attachments.
 * @param dirPath - the root directory to start searching files from
 * @returns Promise<Attachment[]>
 */
export async function readDirectoryAsAttachments(dirPath: string): Promise<Attachment[]> {
  const fs = await import('fs/promises');
  const pathModule = await import('path');

  async function walk(currentPath: string): Promise<Attachment[]> {
    let entries: any[] = [];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (e) {
      return [];
    }
    const results: Attachment[] = [];
    for (const entry of entries) {
      const fullPath = pathModule.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await walk(fullPath)));
      } else if (entry.isFile()) {
        try {
          const contents = await fs.readFile(fullPath, 'utf-8');
          results.push({ title: entry.name, contents });
        } catch (error) {
          results.push({ title: entry.name, contents: `ERROR: ${error instanceof Error ? error.message : String(error)}` });
        }
      }
    }
    return results;
  }

  return walk(dirPath);
}
