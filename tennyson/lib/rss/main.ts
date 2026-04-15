import * as c from "tennyson/lib/core/common";
import * as cn from "tennyson/lib/core/common-node";

import {
  fetchChannelVideos,
  resolveChannelId,
  VideoId,
  type Video,
} from "./youtube";

export interface ChannelConfig {
  name: string;
  channelId?: string;
}

export interface StateFile {
  lastRun: string;
  knownChannelIds?: Record<string, string>;
  videos: Record<VideoId, Video>;
}

const DEFAULT_STATE: StateFile = {
  lastRun: "",
  videos: {},
};

export async function addToState(
  statefile: string,
  channels: ChannelConfig[],
): Promise<StateFile> {
  return await cn.withFileState(statefile, DEFAULT_STATE, async (state) => {
    // ── Resolve channels ──────────────────────────────────────────
    const resolved: { label: string; channelId: string }[] = [];

    for (const ch of channels) {
      try {
        const fetchId = async () => {
          const id = await resolveChannelId(ch.name);
          c.info(`  ✓ ${ch.name} → ${id}`);
          return id;
        };
        const id =
          ch.channelId ??
          (state.knownChannelIds ?? {})[ch.name] ??
          (await fetchId());
        resolved.push({ label: ch.name, channelId: id });
      } catch (err) {
        c.error(
          `  ✗ ${ch.name}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // ── Fetch feeds ───────────────────────────────────────────────
    const allVideos: Video[] = [];

    for (const { label, channelId } of resolved) {
      try {
        const videos = await fetchChannelVideos(channelId, label);
        c.info(`  ✓ ${label}: ${videos.length} videos`);
        allVideos.push(...videos);
      } catch (err) {
        c.error(
          `  ✗ ${label}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    const merged = {
      ...state.videos,
      ...Object.fromEntries(allVideos.map((v) => [v.videoId, v])),
    };

    return {
      lastRun: new Date().toISOString(),
      knownChannelIds: Object.fromEntries(
        resolved.map(({ label, channelId }) => [label, channelId]),
      ),
      videos: merged,
    };
  });
}
