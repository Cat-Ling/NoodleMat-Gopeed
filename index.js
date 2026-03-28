const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";

gopeed.events.onResolve(async (ctx) => {
  const url = ctx.req.url;
  let targetUrl = url;
  if (url.includes("noodlemagazine.com")) {
    targetUrl = url.replace("noodlemagazine.com", "mat6tube.com");
  }

  gopeed.logger.info(`Resolving NoodleMat URL: ${targetUrl}`);

  const fetchOptions = {
    headers: {
      "User-Agent": DEFAULT_UA,
      "Referer": "https://mat6tube.com/"
    }
  };

  try {
    const response = await fetch(targetUrl, fetchOptions);
    if (!response.ok) {
      throw new Error(`Fetch failed with status: ${response.status}`);
    }
    const html = await response.text();

    async function resolve(currentUrl, currentHtml, depth = 0) {
      if (depth > 2) return null;

      // 1. Extract Title
      let title = "";
      const ogTitleMatch = currentHtml.match(/property="og:title"\s+content="([^"]+)"/i);
      const schemaNameMatch = currentHtml.match(/"@type":\s*"VideoObject",\s*"name":\s*"([^"]+)"/i);
      const tagTitleMatch = currentHtml.match(/<title>(.+?)<\/title>/i);

      if (ogTitleMatch) title = ogTitleMatch[1];
      else if (schemaNameMatch) title = schemaNameMatch[1];
      else if (tagTitleMatch) title = tagTitleMatch[1];
      else title = "NoodleVideo";

      title = title.replace(/ - BEST XXX TUBE/i, "")
                   .replace(/ - NoodleMagazine/i, "")
                   .replace(/ - Mat6Tube/i, "")
                   .replace(/&#039;/g, "'")
                   .replace(/&amp;/g, "&")
                   .replace(/[\\/:"*?<>|]/g, "_")
                   .replace(/\s+/g, " ")
                   .trim();

      // 2. Extract Video URL from window.playlist
      let videoUrl = "";
      const playlistMatch = currentHtml.match(/window\.playlist\s*=\s*({[\s\S]*?});/);
      if (playlistMatch) {
        try {
          const playlist = JSON.parse(playlistMatch[1]);
          const sources = playlist.sources || [];
          sources.sort((a, b) => (parseInt(b.label) || 0) - (parseInt(a.label) || 0));
          if (sources.length > 0) {
            videoUrl = sources[0].file;
          }
        } catch (e) {
          gopeed.logger.error("JSON parse error: " + e.message);
        }
      }

      // 3. Fallback: Player Page
      if (!videoUrl) {
        const ogVideoMatch = currentHtml.match(/property="og:video"\s+content="([^"]+)"/i);
        if (ogVideoMatch && ogVideoMatch[1].includes("nmcorp.video")) {
          const playerUrl = ogVideoMatch[1];
          gopeed.logger.info("Fetching player: " + playerUrl);
          const pResponse = await fetch(playerUrl, { headers: { "User-Agent": DEFAULT_UA, "Referer": currentUrl } });
          if (pResponse.ok) {
            const pHtml = await pResponse.text();
            const pPlaylistMatch = pHtml.match(/window\.playlist\s*=\s*({[\s\S]*?});/);
            if (pPlaylistMatch) {
              try {
                const pPlaylist = JSON.parse(pPlaylistMatch[1]);
                const pSources = pPlaylist.sources || [];
                pSources.sort((a, b) => (parseInt(b.label) || 0) - (parseInt(a.label) || 0));
                if (pSources.length > 0) videoUrl = pSources[0].file;
              } catch (e) {}
            }
          }
        }
      }

      // 4. Fallback: Download Page link
      if (!videoUrl) {
        const downloadPageMatch = currentHtml.match(/window\.downloadUrl\s*=\s*"([^"]+)"/) || currentHtml.match(/downloadUrl\s*=\s*"([^"]+)"/);
        if (downloadPageMatch) {
          const downloadPageUrl = "https://mat6tube.com" + downloadPageMatch[1];
          gopeed.logger.info("Following download page: " + downloadPageUrl);
          const dpResponse = await fetch(downloadPageUrl, { headers: { "User-Agent": DEFAULT_UA, "Referer": currentUrl } });
          if (dpResponse.ok) {
            const dpHtml = await dpResponse.text();
            return await resolve(downloadPageUrl, dpHtml, depth + 1);
          }
        }
      }

      if (videoUrl && videoUrl.indexOf("/videofile/") === -1) {
        return {
          name: title,
          files: [
            {
              name: `${title}.mp4`,
              req: {
                url: videoUrl,
                extra: {
                  header: {
                    "Referer": currentUrl,
                    "User-Agent": DEFAULT_UA,
                    "Accept": "*/*"
                  }
                }
              }
            }
          ]
        };
      }
      return null;
    }

    const result = await resolve(targetUrl, html);
    if (result) {
      ctx.res = result;
      gopeed.logger.info(`Successfully resolved: ${result.name}`);
    } else {
      gopeed.logger.error("Failed to resolve video source.");
    }
  } catch (err) {
    gopeed.logger.error("NoodleMat Extension Error: " + err.message);
  }
});
