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
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    throw new Error(`YouTube search returned HTTP ${res.status}: ${res.statusText}`);
  }

  const html = await res.text();

  // Extract ytInitialData from HTML
  let jsonStr: string | null = null;
  const match = html.match(/(?:var\s+ytInitialData|window\["ytInitialData"\]|ytInitialData)\s*=\s*({.+?});\s*(?:var\s|<\/script>)/s)
    || html.match(/var ytInitialData\s*=\s*({.+?});/s);

  if (match) {
    jsonStr = match[1];
  } else {
    const idx = html.indexOf("ytInitialData = ");
    if (idx !== -1) {
      const start = html.indexOf("{", idx);
      const end = html.indexOf(";</script>", start);
      if (start !== -1 && end !== -1) {
        jsonStr = html.substring(start, end);
      }
    }
  }

  if (!jsonStr) {
    throw new Error("ytInitialData tidak ditemukan dalam response YouTube");
  }

  try {
    const data = JSON.parse(jsonStr);
    const sections = data
      ?.contents
      ?.twoColumnSearchResultsRenderer
      ?.primaryContents
      ?.sectionListRenderer
      ?.contents || [];

    const results: YouTubeResult[] = [];
    for (const section of sections) {
      const contents = section?.itemSectionRenderer?.contents || [];
      for (const item of contents) {
        if (results.length >= limit) break;
        const v = item?.videoRenderer || item?.compactVideoRenderer;
        if (!v?.videoId) continue;

        const thumbList = v.thumbnail?.thumbnails || [];
        const thumbnail = thumbList.length > 0 ? thumbList[thumbList.length - 1].url : "";
        const title = v.title?.runs?.[0]?.text || v.title?.simpleText || "";
        const channel = v.ownerText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || "";
        const duration = parseDuration(v.lengthText?.simpleText || "");

        results.push({
          id: v.videoId,
          title,
          duration,
          thumbnail,
          channel
        });
      }
      if (results.length >= limit) break;
    }
    return results;
  } catch (err: any) {
    throw new Error(`Gagal mem-parsing data pencarian YouTube: ${err?.message || err}`);
  }
}

export async function getVideoInfo(urlOrId: string): Promise<YouTubeResult | null> {
  const videoId = extractVideoId(urlOrId);
  if (!videoId) return null;

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    throw new Error(`YouTube video HTTP ${res.status}: ${res.statusText}`);
  }

  const html = await res.text();

  const match = html.match(/var ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:var|<\/script>)/s)
    || html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]);
    const details = data?.videoDetails;
    if (!details) return null;

    const thumbList = details.thumbnail?.thumbnails || [];
    return {
      id: videoId,
      title: details.title || "Unknown",
      duration: Number(details.lengthSeconds) || 0,
      thumbnail: thumbList.length > 0 ? thumbList[thumbList.length - 1].url : "",
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
  if (!text) return 0;
  const parts = text.split(/[:.]/).map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

export function formatDuration(sec: number): string {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function isYouTubeUrl(text: string): boolean {
  return /(?:youtube\.com|youtu\.be)\//i.test(text);
}
