export function isSpotifyUrl(text: string): boolean {
  return /open\.spotify\.com\/track\/[a-zA-Z0-9]+/i.test(text);
}

export async function resolveSpotifyTrack(url: string): Promise<{ title: string; artist: string; searchQuery: string } | null> {
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembedUrl);
    if (!res.ok) return null;
    const data = await res.json() as { title?: string; author_name?: string };
    if (!data.title) return null;
    const title = data.title;
    const artist = data.author_name || "";
    return {
      title,
      artist,
      searchQuery: `${title} ${artist}`.trim()
    };
  } catch {
    return null;
  }
}
