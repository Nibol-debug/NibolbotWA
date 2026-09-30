export interface YouTubeResult {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  channel: string;
}

export async function searchYouTube(query: string, limit = 5): Promise<YouTubeResult[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "id-ID,id;q=0.9,en;q=0.8"
    }
  });

  const html = await res.text();

  // ytInitialData contains all search results as JSON
  const match = html.match(/var ytInitialData\s*=\s*({.+?});\s*<\/script>/);
  if (!match) return [];

  try {
    const data = JSON.parse(match[1]);
    const contents = data
      ?.contents
      ?.twoColumnSearchResultsRenderer
      ?.primaryContents
      ?.sectionListRenderer
      ?.contents?.[0]
      ?.itemSectionRenderer
      ?.contents || [];

    const results: YouTubeResult[] = [];
    for (const item of contents) {
      if (results.length >= limit) break;
      const v = item?.videoRenderer;
      if (!v?.videoId) continue;

      results.push({
        id: v.videoId,
        title: v.title?.runs?.[0]?.text || "",
        duration: parseDuration(v.lengthText?.simpleText || "0:00"),
        thumbnail: v.thumbnail?.thumbnails?.pop()?.url || "",
        channel: v.ownerText?.runs?.[0]?.text || ""
      });
    }
    return results;
  } catch {
    return [];
  }
}

export async function getVideoInfo(urlOrId: string): Promise<YouTubeResult | null> {
  const videoId = extractVideoId(urlOrId);
  if (!videoId) return null;

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  const html = await res.text();

  const match = html.match(/var ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:var|<\/script>)/);
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]);
    const details = data?.videoDetails;
    if (!details) return null;

    return {
      id: videoId,
      title: details.title || "Unknown",
      duration: Number(details.lengthSeconds) || 0,
      thumbnail: details.thumbnail?.thumbnails?.pop()?.url || "",
      channel: details.author || ""
    };
  } catch {
    return null;
  }
}

export function extractVideoId(input: string): string | null {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  const m = input.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

function parseDuration(text: string): number {
  const parts = text.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function isYouTubeUrl(text: string): boolean {
  return /(?:youtube\.com|youtu\.be)\//i.test(text);
}
