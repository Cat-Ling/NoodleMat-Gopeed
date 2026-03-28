var DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";

gopeed.events.onResolve(function (ctx) {
  var url = ctx.req.url;
  // Normalize domain
  if (url.indexOf("noodlemagazine.com") !== -1) {
    url = url.replace("noodlemagazine.com", "mat6tube.com");
  }

  fetch(url, {
    headers: {
      "User-Agent": DEFAULT_UA,
      "Referer": "https://mat6tube.com/"
    }
  }).then(function (response) {
    if (!response.ok) {
      throw new Error("Fetch failed with status: " + response.status);
    }
    return response.text();
  }).then(function (html) {
    
    function resolve(currentUrl, currentHtml, depth) {
      if (depth === undefined) depth = 0;
      if (depth > 2) return Promise.resolve(null);

      // 1. Extract Title
      var title = "";
      var ogTitleMatch = currentHtml.match(/property="og:title"\s+content="([^"]+)"/i);
      var schemaNameMatch = currentHtml.match(/"@type":\s*"VideoObject",\s*"name":\s*"([^"]+)"/i);
      var tagTitleMatch = currentHtml.match(/<title>(.+?)<\/title>/i);

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

      if (typeof gopeed !== 'undefined' && gopeed.logger) {
        gopeed.logger.info("Extracted Title: " + title);
      }

      // 2. Extract Video URL
      var videoUrl = "";
      
      // Look for window.playlist
      var playlistMatch = currentHtml.match(/window\.playlist\s*=\s*(\{[\s\S]*?\});/);
      if (playlistMatch) {
        try {
          var playlist = JSON.parse(playlistMatch[1]);
          var sources = playlist.sources || [];
          sources.sort(function(a, b) {
            return (parseInt(b.label) || 0) - (parseInt(a.label) || 0);
          });
          if (sources.length > 0) videoUrl = sources[0].file;
        } catch (e) {
          if (typeof gopeed !== 'undefined' && gopeed.logger) gopeed.logger.error("Failed to parse window.playlist JSON: " + e.message);
        }
      }

      // Fallbacks if no playlist found
      if (!videoUrl) {
        var ogVideoMatch = currentHtml.match(/property="og:video"\s+content="([^"]+)"/i);
        if (ogVideoMatch) videoUrl = ogVideoMatch[1];
      }

      // Ignore fake videofile links
      if (videoUrl && videoUrl.indexOf("/videofile/") !== -1) {
        videoUrl = "";
      }

      if (videoUrl && (videoUrl.indexOf("/player/") !== -1 || videoUrl.indexOf("nmcorp.video") !== -1)) {
        if (typeof gopeed !== 'undefined' && gopeed.logger) {
          gopeed.logger.info("Found player URL, fetching inner source: " + videoUrl);
        }
        return fetch(videoUrl, {
          headers: { "User-Agent": DEFAULT_UA, "Referer": currentUrl }
        }).then(function (pResp) {
          if (pResp.ok) return pResp.text();
          return "";
        }).then(function (pHtml) {
          var pPlaylistMatch = pHtml.match(/window\.playlist\s*=\s*(\{[\s\S]*?\});/);
          if (pPlaylistMatch) {
            try {
              var pPlaylist = JSON.parse(pPlaylistMatch[1]);
              var pSources = pPlaylist.sources || [];
              pSources.sort(function(a, b) {
                return (parseInt(b.label) || 0) - (parseInt(a.label) || 0);
              });
              if (pSources.length > 0) videoUrl = pSources[0].file;
            } catch(e) {
               if (typeof gopeed !== 'undefined' && gopeed.logger) gopeed.logger.error("Failed to parse player window.playlist JSON: " + e.message);
            }
          }
          return finalize(videoUrl, title, currentUrl);
        });
      }

      if (videoUrl) {
        return Promise.resolve(finalize(videoUrl, title, currentUrl));
      }

      // 3. Fallback: Download Page
      var downloadPageMatch = currentHtml.match(/downloadUrl\s*=\s*"([^"]+)"/);
      if (downloadPageMatch) {
        var downloadPageUrl = "https://mat6tube.com" + downloadPageMatch[1];
        if (typeof gopeed !== 'undefined' && gopeed.logger) {
          gopeed.logger.info("Following downloadUrl: " + downloadPageUrl);
        }
        return fetch(downloadPageUrl, {
          headers: { "User-Agent": DEFAULT_UA, "Referer": currentUrl }
        }).then(function (dpResp) {
          if (dpResp.ok) return dpResp.text();
          return "";
        }).then(function (dpHtml) {
          if (dpHtml) return resolve(downloadPageUrl, dpHtml, depth + 1);
          return null;
        });
      }

      // 4. Final Fallback: Direct MP4
      var mp4Match = currentHtml.match(/https?:\/\/[^"']+\.mp4[^"']*/);
      if (mp4Match) {
        var directUrl = mp4Match[0];
        if (directUrl.indexOf("/videofile/") === -1) { // Ignore fake direct urls
           return Promise.resolve(finalize(directUrl, title, currentUrl));
        }
      }

      return Promise.resolve(null);
    }

    function finalize(videoUrl, title, referer) {
      if (!videoUrl) return null;
      if (typeof gopeed !== 'undefined' && gopeed.logger) {
        gopeed.logger.info("Successfully resolved video URL: " + videoUrl);
      }
      return {
        name: title,
        files: [
          {
            name: title + ".mp4",
            req: {
              url: videoUrl,
              extra: {
                header: {
                  "Referer": referer,
                  "User-Agent": DEFAULT_UA,
                  "Accept": "*/*"
                }
              }
            }
          }
        ]
      };
    }

    return resolve(url, html);
  }).then(function (result) {
    if (result) {
      ctx.res = result;
    } else {
      throw new Error("Could not resolve video source. The site structure might have changed or Cloudflare blocked the request.");
    }
  }).catch(function (err) {
    if (typeof gopeed !== 'undefined' && gopeed.logger) {
      gopeed.logger.error("NoodleMat Extension Error: " + err.message);
    }
    throw err;
  });
});
