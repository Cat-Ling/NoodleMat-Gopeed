var DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";

gopeed.events.onResolve(function (ctx) {
  var url = ctx.req.url;
  var targetUrl = url;
  if (url.indexOf("noodlemagazine.com") !== -1) {
    targetUrl = url.replace("noodlemagazine.com", "mat6tube.com");
  }

  return fetch(targetUrl, {
    headers: {
      "User-Agent": DEFAULT_UA,
      "Referer": "https://mat6tube.com/"
    }
  }).then(function (response) {
    if (!response.ok) throw new Error("Fetch failed: " + response.status);
    return response.text();
  }).then(function (html) {
    
    function resolve(currentUrl, currentHtml, depth) {
      if (depth === undefined) depth = 0;
      if (depth > 2) return Promise.resolve(null);

      // 1. Extract Title
      var title = "NoodleVideo";
      var ogTitle = currentHtml.match(/property="og:title"\s+content="([^"]+)"/i);
      var schemaName = currentHtml.match(/"@type":\s*"VideoObject",\s*"name":\s*"([^"]+)"/i);
      var tagTitle = currentHtml.match(/<title>(.+?)<\/title>/i);

      if (ogTitle) title = ogTitle[1];
      else if (schemaName) title = schemaName[1];
      else if (tagTitle) title = tagTitle[1];

      title = title.replace(/ - BEST XXX TUBE/i, "")
                   .replace(/ - NoodleMagazine/i, "")
                   .replace(/ - Mat6Tube/i, "")
                   .replace(/&#039;/g, "'")
                   .replace(/&amp;/g, "&")
                   .replace(/[\\/:"*?<>|]/g, "_")
                   .replace(/\s+/g, " ")
                   .trim();

      // 2. Extract Video URL
      var videoUrl = "";
      var playlistMatch = currentHtml.match(/window\.playlist\s*=\s*({[\s\S]*?});/);
      if (playlistMatch) {
        try {
          var playlist = JSON.parse(playlistMatch[1]);
          var sources = playlist.sources || [];
          sources.sort(function(a, b) { return (parseInt(b.label) || 0) - (parseInt(a.label) || 0); });
          if (sources.length > 0) videoUrl = sources[0].file;
        } catch (e) {}
      }

      // 3. Player Fallback
      if (!videoUrl) {
        var ogVideo = currentHtml.match(/property="og:video"\s+content="([^"]+)"/i);
        if (ogVideo && ogVideo[1].indexOf("nmcorp.video") !== -1) {
          return fetch(ogVideo[1], { headers: { "User-Agent": DEFAULT_UA, "Referer": currentUrl } })
            .then(function(r) { return r.text(); })
            .then(function(ph) { return resolve(ogVideo[1], ph, depth + 1); });
        }
      }

      if (videoUrl && videoUrl.indexOf("/videofile/") === -1) {
        return Promise.resolve({
          name: title,
          files: [{
            name: title + ".mp4",
            path: "../NoodleMagazine/",
            req: {
              url: videoUrl,
              extra: { header: { "Referer": currentUrl, "User-Agent": DEFAULT_UA, "Accept": "*/*" } }
            }
          }]
        });
      }
      return Promise.resolve(null);
    }

    return resolve(targetUrl, html);
  }).then(function (result) {
    if (result) {
      ctx.res = result;
    } else {
      throw new Error("Could not resolve video source.");
    }
  }).catch(function (err) {
    if (typeof gopeed !== 'undefined' && gopeed.logger) {
      gopeed.logger.error("NoodleMat Error: " + err.message);
    }
  });
});
