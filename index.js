gopeed.events.onResolve(async (ctx) => {
  let url = ctx.req.url;
  // Normalize domain to mat6tube as NoodleMat-DL does
  if (url.includes("noodlemagazine.com")) {
    url = url.replace("noodlemagazine.com", "mat6tube.com");
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed with status: ${response.status}`);
  }
  const html = await response.text();

  // Function to extract and resolve from HTML
  async function resolve(url, html, depth = 0) {
    if (depth > 2) return null; // Avoid infinite recursion

    // Extract Title
    const titleMatch = html.match(/<title>(.+?)<\/title>/i);
    let title = titleMatch ? titleMatch[1] : "NoodleVideo";
    // Sanitization
    title = title.replace(/ - BEST XXX TUBE/i, "")
                 .replace(/[\\/:"*?<>|]/g, "_")
                 .replace(/\s+/g, " ")
                 .trim();

    // Extract Playlist JSON
    const playlistMatch = html.match(/window\.playlist\s*=\s*({.*?});/);
    if (playlistMatch) {
      try {
        const playlist = JSON.parse(playlistMatch[1]);
        const sources = playlist.sources || [];
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
                    "Referer": url,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                  }
                }
              }
            ]
          };
        }
      } catch (e) {}
    }

    // Fallback: Download Page link
    const downloadPageMatch = html.match(/downloadUrl\s*=\s*"([^"]+)"/);
    if (downloadPageMatch) {
      const downloadPageUrl = "https://mat6tube.com" + downloadPageMatch[1];
      const dpResponse = await fetch(downloadPageUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" }
      });
      if (dpResponse.ok) {
        const dpHtml = await dpResponse.text();
        return await resolve(downloadPageUrl, dpHtml, depth + 1); // Recursive call for the download page
      }
    }

    // Fallback: search for direct mp4 links in HTML
    const mp4Match = html.match(/https?:\/\/[^"']+\.mp4[^"']*/);
    if (mp4Match) {
      return {
        name: title,
        files: [
          {
            name: `${title}.mp4`,
            req: {
              url: mp4Match[0],
              headers: {
                "Referer": url,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
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
    throw new Error("Video source not found. The site structure might have changed.");
  }
});
