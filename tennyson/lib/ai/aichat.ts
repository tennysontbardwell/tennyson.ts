import * as common from "tennyson/lib/core/common";
import * as openai from "tennyson/lib/ai/openai";
import { Type, Static, TSchema } from '@sinclair/typebox'

interface Attachment {
  title: string,
  contents: string,
}

interface Tool {
  name: string;
  inputSchema: TSchema;
  outSchema: TSchema;
  description: string;
  callback: (request: string) => Promise<Attachment>;
}

interface Query {
  userText: string,
  tools?: Tool[],
  maxToolCalls?: number,
  attachments?: Attachment[],
  outputSchema?: string,
}

export async function query(query: Query): Promise<string> {
  let query_ = {
    tools: [],
    attachments: [],
    maxToolCalls: 10,
    ...query
  }
  let prompt = "";
  let sep = '==================================';
  function addSection(title: string, contents: string) {
    prompt += sep;
    prompt += " ";
    prompt += title;
    prompt += "\n";
    prompt += contents;
  }
  addSection("frontmatter", `This prompt will involve instructions from a user, ${query_.tools.length} tools, ${query_.attachments.length} attachments. You may either attempt to complete the task, you may call one or more of the tools. If you choose to call tools, then output the text TOOL_CALL followed by a newline, and a json array of the tool calls that you wish to invoke. If the information gained by calling the tools would improve the ability of a future agent to answer the user's prompt, then that is the best choice. You may call up to 5 tools.`);
  addSection("Instructions From User", query_.userText);
  query_.attachments.forEach((attachment: Attachment, i: number) => {
    addSection(`Attachment ${i+1} of ${query_.attachments.length}; Title: ${attachment.title}`, attachment.contents);
  })
  query_.tools.forEach((tool: Tool, i: number) => {
    addSection(
      `Tool ${i+1} of ${query_.attachments.length}; Name: ${tool.name}`,
      `Description: ${tool.description}\nInput Schema: ${JSON.stringify(tool.inputSchema)}\nOutput Schema: ${JSON.stringify(tool.outSchema)}`
    );
  })
  return await openai.openai.generate(prompt);
}

// https://kagi.com/assistant/f6131177-2407-42d0-9b63-3f7e3bf2e48f
export async function webpage(url: string): Promise<Attachment> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Grab <title> if present
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : url;

  // Strip scripts, styles, comments, then tags
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Cap length to keep prompt size manageable
  const MAX_CHARS = 15000;
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS) + ' …';
  }

  return {
    title,
    contents: text,
  };
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
  name: "urlFetch",
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
    const result = await webpage(input.url);
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
