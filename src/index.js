const PLAYERS = /VLC|ExoPlayer|AppleCoreMedia|Lavf|Lavc|libmpv|mpv|Kodi|stagefright|Dalvik/i;

const PAGE = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<body style="font-family:sans-serif;max-width:480px;margin:15vh auto;padding:16px">
<h2>Open in a video player</h2>
<p>This link can't be played in a browser.</p>
<p>Copy the URL, then in <b>VLC</b> go to <b>Media → Open Network Stream</b> and paste it.</p>
</body>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // TEMPORARY: debug route (remove after testing)
    if (path === "/debug") {
      const r = await fetch(
        `https://raw.githubusercontent.com/${env.GH_USER}/${env.GH_REPO}/${env.GH_BRANCH}/tt/master.m3u8`,
        { headers: { Authorization: `token ${env.GH_TOKEN}`, "User-Agent": "cf-worker-proxy" } }
      );
      return new Response(
        `github status: ${r.status}\nuser: ${env.GH_USER}\nrepo: ${env.GH_REPO}\nbranch: ${env.GH_BRANCH}\ntoken set: ${!!env.GH_TOKEN}`,
        { headers: { "Content-Type": "text/plain" } }
      );
    }

    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Method not allowed", { status: 405 });
    }

    const ua = request.headers.get("User-Agent") || "";
    const isBrowser =
      request.headers.get("Sec-Fetch-Mode") === "navigate" ||
      request.headers.get("Sec-Fetch-Dest") === "document" ||
      (request.headers.get("Accept") || "").includes("text/html") ||
      (/Mozilla\//.test(ua) && !PLAYERS.test(ua));

    if (isBrowser) {
      return new Response(PAGE, {
        status: 403,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (path === "/" || path.includes("..")) {
      return new Response("Not found", { status: 404 });
    }

    const raw = `https://raw.githubusercontent.com/${env.GH_USER}/${env.GH_REPO}/${env.GH_BRANCH}${path}`;

    const gh = await fetch(raw, {
      headers: { Authorization: `token ${env.GH_TOKEN}`, "User-Agent": "cf-worker-proxy" },
      cf: {
        cacheEverything: true,
        cacheTtlByStatus: { "200-299": 86400, "404": 0, "500-599": 0 },
      },
    });

    if (!gh.ok) return new Response(`Upstream error ${gh.status}`, { status: gh.status });

    const type = path.endsWith(".m3u8") ? "application/vnd.apple.mpegurl"
      : path.endsWith(".ts") ? "video/mp2t"
      : "application/octet-stream";

    const res = new Response(gh.body, gh);
    res.headers.set("Content-Type", type);
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("Cache-Control", path.endsWith(".m3u8") ? "public, max-age=60" : "public, max-age=86400");
    res.headers.delete("Set-Cookie");
    return res;
  },
};
