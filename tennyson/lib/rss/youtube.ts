import { XMLParser } from "fast-xml-parser";
import { Brand } from "effect";

export type VideoId = string & Brand.Brand<"VideoId">;
export const VideoId = Brand.nominal<VideoId>();

export interface Video {
  videoId: VideoId;
  channelName: string;
  channelId: string;
  title: string;
  author: string;
  published: string;
  updated: string;
  link: string;
  thumbnail: string;
}

/**
 * Resolves a YouTube channel handle or custom URL to a channel ID
 * by scraping the channel page for the canonical RSS link or channel ID meta tag.
 */
export async function resolveChannelId(channelName: string): Promise<string> {
  // Normalize: ensure it starts with @ for handles, or try as custom URL
  const urlVariants = buildUrlVariants(channelName);

  for (const url of urlVariants) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });

      if (!response.ok) continue;

      const html = await response.text();

      // Method 1: Look for the RSS link tag
      const rssMatch = html.match(/channel_id=([a-zA-Z0-9_-]{24})/);
      if (rssMatch) return rssMatch[1];

      // Method 2: Look for "externalId" in the page data
      const externalIdMatch = html.match(
        /"externalId"\s*:\s*"([a-zA-Z0-9_-]{24})"/,
      );
      if (externalIdMatch) return externalIdMatch[1];

      // Method 3: Look for browse_id or channelId in JSON blobs
      const browseMatch = html.match(
        /"browseId"\s*:\s*"(UC[a-zA-Z0-9_-]{22})"/,
      );
      if (browseMatch) return browseMatch[1];
    } catch {
      continue;
    }
  }

  throw new Error(
    `Could not resolve channel ID for "${channelName}". ` +
      `Try providing the channel ID directly in the config.`,
  );
}

function buildUrlVariants(channelName: string): string[] {
  const clean = channelName.trim();
  const urls: string[] = [];

  if (clean.startsWith("@")) {
    urls.push(`https://www.youtube.com/${clean}`);
  } else if (clean.startsWith("UC") && clean.length === 24) {
    // It's already a channel ID
    urls.push(`https://www.youtube.com/channel/${clean}`);
  } else {
    // Try as handle first, then as custom URL, then as /c/ path
    urls.push(`https://www.youtube.com/@${clean}`);
    urls.push(`https://www.youtube.com/${clean}`);
    urls.push(`https://www.youtube.com/c/${clean}`);
  }

  return urls;
}

const RSS_BASE = "https://www.youtube.com/feeds/videos.xml?channel_id=";

interface RawFeedEntry {
  "yt:videoId": string;
  title: string;
  author?: { name?: string };
  published: string;
  updated: string;
  link?: { "@_href"?: string } | { "@_href"?: string }[];
  "media:group"?: {
    "media:thumbnail"?: { "@_url"?: string };
    "media:title"?: string;
  };
}

interface RawFeed {
  feed?: {
    title?: string;
    entry?: RawFeedEntry | RawFeedEntry[];
  };
}

export async function fetchChannelVideos(
  channelId: string,
  channelLabel: string,
): Promise<Video[]> {
  const url = `${RSS_BASE}${channelId}`;

  const response = await fetch(url, {
    headers: { "User-Agent": "yt-rss-checker/1.0" },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch RSS for ${channelLabel} (${channelId}): ${response.status}`,
    );
  }

  const xml = await response.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const parsed: RawFeed = parser.parse(xml);
  const feed = parsed.feed;

  if (!feed?.entry) return [];

  const entries: RawFeedEntry[] = Array.isArray(feed.entry)
    ? feed.entry
    : [feed.entry];

  return entries.map((entry): Video => {
    const linkHref = Array.isArray(entry.link)
      ? (entry.link[0]?.["@_href"] ?? "")
      : (entry.link?.["@_href"] ?? "");

    return {
      videoId: VideoId(entry["yt:videoId"]),
      channelName: channelLabel,
      channelId,
      title: entry.title ?? "(untitled)",
      author: entry.author?.name ?? channelLabel,
      published: entry.published,
      updated: entry.updated,
      link:
        linkHref || `https://www.youtube.com/watch?v=${entry["yt:videoId"]}`,
      thumbnail:
        entry["media:group"]?.["media:thumbnail"]?.["@_url"] ??
        `https://i.ytimg.com/vi/${entry["yt:videoId"]}/hqdefault.jpg`,
    };
  });
}
