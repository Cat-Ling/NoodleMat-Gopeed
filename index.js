const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";

gopeed.events.onResolve(async (ctx) => {
  let url = ctx.req.url;
  // Normalize domain to mat6tube as NoodleMat-DL does
  if (url.includes("noodlemagazine.com")) {
    url = url.replace("noodlemagazine.com", "mat6tube.com");
  }

  // Initial fetch with proper headers
  const response = await fetch(url, {
    headers: {
      "User-Agent": DEFAULT_UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://mat6tube.com/"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed with status: ${response.status}. Site might be blocking us or requires Cloudflare bypass.`);
  }
  const html = await response.text();

  // Function to extract and resolve from HTML
  async function resolve(currentUrl, currentHtml, depth = 0) {
    if (depth > 2) return null;

    // 1. Extract Title from <title> tag or <h1>
    let title = "NoodleVideo";
    const titleMatch = currentHtml.match(/<title>(.+?)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1];
    } else {
      const h1Match = currentHtml.match(/<h1>(.+?)<\/h1>/i);
      if (h1Match) title = h1Match[1];
    }

    // 2. Clean Title
    title = title.replace(/ - BEST XXX TUBE/i, "")
                 .replace(/ - NoodleMagazine/i, "")
                 .replace(/ - Mat6Tube/i, "")
                 .replace(/[\\/:"*?<>|]/g, "_")
                 .replace(/\s+/g, " ")
                 .trim();

    // 3. Extract Playlist JSON (window.playlist = {...})
    const playlistMatch = currentHtml.match(/window\.playlist\s*=\s*({.*?});/);
    if (playlistMatch) {
      try {
        const jsonStr = playlistMatch[1];
        const playlist = JSON.parse(jsonStr);
        const sources = playlist.sources || [];
        // Sort by label (resolution) descending
        sources.sort((a, b) => (parseInt(b.label) || 0) - (parseInt(a.label) || 0));
        
        if (sources.length > 0) {
          const bestSource = sources[0];
          return {
            name: title,
            files: [
              {
                name: `${title}.mp4`,
                req: {
                  url: bestSource.file,
                  headers: {
                    "Referer": currentUrl,
                    "User-Agent": DEFAULT_UA
                  }
                }
              }
            ]
          };
        }
      } catch (e) {
        // JSON parse failed, continue to fallback
      }
    }

    // 4. Fallback: Download Page link (downloadUrl="...")
    const downloadPageMatch = currentHtml.match(/downloadUrl\s*=\s*"([^"]+)"/);
    if (downloadPageMatch) {
      const downloadPageUrl = "https://mat6tube.com" + downloadPageMatch[1];
      const dpResponse = await fetch(downloadPageUrl, {
        headers: { 
          "User-Agent": DEFAULT_UA,
          "Referer": currentUrl
        }
      });
      if (dpResponse.ok) {
        const dpHtml = await dpResponse.text();
        return await resolve(downloadPageUrl, dpHtml, depth + 1);
      }
    }

    // 5. Fallback: search for direct mp4 links in HTML
    const mp4Match = currentHtml.match(/https?:\/\/[^"']+\.mp4[^"']*/);
    if (mp4Match) {
      return {
        name: title,
        files: [
          {
            name: `${title}.mp4`,
            req: {
              url: mp4Match[0],
              headers: {
                "Referer": currentUrl,
                "User-Agent": DEFAULT_UA
              }
            }
          }
        ]
      };
    }
    return null;
  }

  const result = await resolve(url, html);
  if (result) {
    ctx.res = result;
  } else {
    // Check if the HTML contains any common error indicators
    if (html.includes("cf-browser-verification") || html.includes("Cloudflare")) {
      throw new Error("Cloudflare challenge detected. Extension cannot bypass JS-based challenges automatically.");
    }
    throw new Error("Video source not found. Site structure might have changed or protection is active.");
  }
});
