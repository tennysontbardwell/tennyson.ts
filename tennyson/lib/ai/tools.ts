import { Type } from '@sinclair/typebox'
import type { Attachment, Tool, Tool2 } from './aichat';
import { query } from './aichat';
import { Schema, Effect, Either } from 'effect'
import * as c from "tennyson/lib/core/common";


const regex = {
  title: / <title[^>]*> ([^ <] *) <\/title>/i,
  script: /<script[^>]*>[\s\S]*?<\/script>/gi,
  style: /<style[^>]*>[\s\S]*?<\/style>/gi,
  comment: /<!--[\s\S]*?-->/g,
  tag: /<[^>]+>/g,
  whiteSpace: /\s+/g,
}

async function makeWebpageAttachment(
  url: string,
  process: (text: string) => string,
) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`);

  const html = await response.text();

  const titleMatch = html.match(regex.title);
  const title = titleMatch ? titleMatch[1].trim() : url;

  const text = process(html);

  const MAX_CHARS = 400_000;
  if (text.length > MAX_CHARS)
    throw new Error(
      `text length exceeds MAX_CHARS of ${MAX_CHARS}, is ${text.length}`);

  return { title, contents: text };
}

export async function fetchWebpage(
  url: string,
  cleanup: 'raw' | 'contentTags' | 'text',
  cssSelector?: string,
  llmProcess?: (arg: Attachment) => Promise<Attachment>,
) {
  const cheerio = await import('cheerio')
  const process = (() => {
    const raw = [] as RegExp[]
    const contentTags =
      [regex.script, regex.style, regex.comment, regex.whiteSpace]
    const text = contentTags.concat(regex.tag)

    const toRm = { raw, contentTags, text }[cleanup]

    const cssSelect =
      (cssSelector === undefined)
        ? c.id
        : (text: string) => {
          const doc = cheerio.load(text)
          const res = doc.extract({
            results: [{
              selector: cssSelector,
              value: "outerHTML"
            }]
          })
          // console.log('HERE')
          // console.log(res)
          return res.results.join('\n\n')
        }

    return (html: string) => {
      const cleaned = toRm.reduce((accum, regex) =>
        accum.replace(regex, ''), html)

      return cssSelect(cleaned)
    }
  })();

  const attachment = await makeWebpageAttachment(url, process);

  if (llmProcess)
    return await llmProcess(attachment)
  else
    return attachment
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

const urlFetchInput = Schema.Struct({
  url: Schema.URL,
  processessing: Schema.Union(
    Schema.Literal('rawHTML').annotations({
      description:
        "Performs no processessing on the content returned by the fetch. This should only be used if defaultCleanup fails, or if there is a reason to believe that style and/or script tags will be useful"
    }),
    Schema.Literal('defaultCleanup').annotations({
      description:
        "Removes style and script tags only, reducing unnecessary context"
    }),
    Schema.Literal('onlyTextContent').annotations({
      description:
        "Aggressive cleanup, remove all html tags and leaving only their text content"
    }),
  ).pipe(Schema.optionalWith({ default: () => 'defaultCleanup' })),
  cssSelector: Schema.String
    .annotations({ description: "css selector to filter results by" })
    .pipe(Schema.optional),
  llmProcessing: Schema.optional(Schema.Union(
    Schema.TaggedStruct("Query", {
      prompt: Schema.String.annotations({
        description: "The prompt to give to the subagent, an LLM, which will precede the contents of the fetched request. The response from the LLM will be returned by this tool. This normally should not be used with a cssSelector"
      })
    })
  )),
})

const urlFetchOutput = Schema.Struct({
  title: Schema.String,
  contents: Schema.String,
})

export const urlFetchTool2: Tool2<Schema.Schema.Type<typeof urlFetchInput>, any> = {
  name: "tool/network/fetch-webpage",
  tag: "type2",
  inputSchema: urlFetchInput,
  outSchema: urlFetchOutput,
  description: "Fetches a webpage and returns its title and text content",
  callback: async (input: Schema.Schema.Type<typeof urlFetchInput>) => {
    return await fetchWebpage(
      input.url.toString(),
      input.processessing === 'rawHTML'
        ? 'raw'
        : input.processessing === 'defaultCleanup'
          ? 'contentTags'
          : input.processessing === 'onlyTextContent'
            ? 'text'
            : c.unreachable(input.processessing),
      input.cssSelector,
      input.llmProcessing === undefined
        ? async (attachment: Attachment) => attachment
        : async (attachment: Attachment) => {
          const response = await Effect.runPromise(query({
            userText: input.llmProcessing!.prompt,
            attachments: [attachment],
            model: 'gpt-4.1-nano',
            tools: [],
            maxToolCalls: 0,
            responseSchema: Schema.String,
          }))
          const contents = [
            '## Query',
            input.llmProcessing!.prompt,
            '## Response',
            response
          ].join('\n\n')
          return { ...attachment, contents }
        }
    ).then(Either.right);
  }
};

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
    const result = await fetchWebpage(input.url, 'contentTags');
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
