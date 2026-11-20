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

    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Method not allowed", { status: 405 });
    }

    // Real browsers always send "Sec-Fetch-*" headers (or ask for an HTML page); video apps
    // such as VLC, NS Player, ExoPlayer, MX Player never do.
    const h = request.headers;
    const isBrowser =
      Boolean(h.get("Sec-Fetch-Mode") || h.get("Sec-Fetch-Site") || h.get("Sec-Fetch-Dest")) ||
      (h.get("Accept") || "").includes("text/html");

    // Your web player site (on Vercel) can send this secret header.
    const keyOk = Boolean(env.PROXY_KEY) && request.headers.get("X-Proxy-Key") === env.PROXY_KEY;

    if (isBrowser && !keyOk) {
      return new Response(PAGE, {
        status: 403,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Link format: /REPO_NAME/path... (one repo per movie, all under GH_USER)
    const parts = path.split("/").filter(Boolean);
    if (parts.length < 2 || path.includes("..") || !/^[A-Za-z0-9._-]+$/.test(parts[0])) {
      return new Response("Not found", { status: 404 });
    }
    const repo = parts.shift();
    const rest = "/" + parts.join("/");
    const branch = env.GH_BRANCH || "main";

    const raw = `https://raw.githubusercontent.com/${env.GH_USER}/${repo}/${branch}${rest}`;

    const gh = await fetch(raw, {
      headers: { Authorization: `token ${env.GH_TOKEN}`, "User-Agent": "cf-worker-proxy" },
      cf: {
        cacheEverything: true,
        cacheTtlByStatus: { "200-299": 86400, "404": 0, "500-599": 0 },
      },
    });

    if (!gh.ok) return new Response(`Upstream error ${gh.status}`, { status: gh.status });

    const type = rest.endsWith(".m3u8") ? "application/vnd.apple.mpegurl"
      : rest.endsWith(".ts") ? "video/mp2t"
      : "application/octet-stream";

    const res = new Response(gh.body, gh);
    res.headers.set("Content-Type", type);
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("Cache-Control", rest.endsWith(".m3u8") ? "public, max-age=60" : "public, max-age=86400");
    res.headers.delete("Set-Cookie");
    return res;
  },
};
