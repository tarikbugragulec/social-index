/* ==========================================================================
   SOCIAL INDEX — Local Account, Stories, Highlights, Reels & Posts Server
   Configured with:
   1. Meta for Developers (developers.facebook.com) Official Graph APIs:
      - Instagram Graph API v22.0 (`business_discovery`, `/stories`, `/media`, `instagram_oembed`)
      - Threads Official Graph API v1.0 (`graph.threads.net/v1.0/profile_lookup`, `/threads`)
   2. Google YouTube Data API v3 (`googleapis.com/youtube/v3/channels`, `playlistItems`)
   3. X (Twitter) Official API v2 (`api.x.com/2/users/by/username`, `/tweets` + `syndication.twitter.com`)
   4. TikTok Official Research & Display API v2 (`open.tiktokapis.com/v2/research/user/info`, `video/query` + TikWM)
   5. GitHub Official REST API v3 (`api.github.com/users`, `/repos`, `/events/public`)
   6. Bluesky Official AT Protocol XRPC API (`public.api.bsky.app/xrpc/app.bsky.actor.getProfile`, `getAuthorFeed`)
   7. AnonyIG & StoriesIG MCP / REST Fallback Layer (Zero-Key Out-of-the-Box Support)
   ========================================================================== */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, "api-config.json");
const ENV_FILE = path.join(__dirname, ".env");

const BOT_UA = "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";
const FB_BOT_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/* --------------------------------------------------------------------------
   Load local .env file if present (Zero-dependency dotenv loader)
   -------------------------------------------------------------------------- */
function loadDotEnv() {
  try {
    if (!fs.existsSync(ENV_FILE)) return;
    const lines = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch (_) {}
}

loadDotEnv();

/* --------------------------------------------------------------------------
   Official Developer API Configuration Store (api-config.json + Environment)
   -------------------------------------------------------------------------- */
let apiConfig = {
  metaAccessToken: process.env.META_ACCESS_TOKEN || "",
  igBusinessUserId: process.env.IG_BUSINESS_USER_ID || "",
  threadsAccessToken: process.env.THREADS_ACCESS_TOKEN || "",
  metaAppToken: process.env.META_APP_TOKEN || "",
  youtubeApiKey: process.env.YOUTUBE_API_KEY || "",
  xBearerToken: process.env.X_BEARER_TOKEN || "",
  tiktokAccessToken: process.env.TIKTOK_ACCESS_TOKEN || "",
  githubToken: process.env.GITHUB_TOKEN || ""
};

function loadApiConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      apiConfig = { ...apiConfig, ...raw };
    }
  } catch (_) {}
}

function saveApiConfig(newConfig) {
  apiConfig = { ...apiConfig, ...newConfig };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(apiConfig, null, 2), "utf8");
  } catch (_) {}
}

loadApiConfig();

/* --------------------------------------------------------------------------
   Official Meta for Developers (developers.facebook.com) Graph API Client
   - Instagram Graph API v22.0:
     GET https://graph.facebook.com/v22.0/{ig-user-id}?fields=business_discovery.username({username}){...}
     GET https://graph.facebook.com/v22.0/{ig-user-id}/stories?fields=id,media_type,media_url,thumbnail_url,timestamp,permalink
     GET https://graph.facebook.com/v22.0/instagram_oembed?url=...
   - Threads Graph API v1.0:
     GET https://graph.threads.net/v1.0/profile_lookup?username={username}&fields=...
     GET https://graph.threads.net/v1.0/me/threads?fields=...
   -------------------------------------------------------------------------- */
async function fetchMetaInstagramGraphApi(username) {
  const token = apiConfig.metaAccessToken;
  const igUserId = apiConfig.igBusinessUserId;
  if (!token) return null;

  try {
    // 1. If igBusinessUserId is provided, use Meta's official business_discovery endpoint
    // which can query ANY public Business or Creator Instagram account by username!
    if (igUserId) {
      const fields = `business_discovery.username(${username}){id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count,media.limit(16){id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{media_url,media_type,thumbnail_url}}}`;
      const bdUrl = `https://graph.facebook.com/v22.0/${encodeURIComponent(igUserId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;

      const [bdRes, storiesRes] = await Promise.all([
        fetch(bdUrl).catch(() => null),
        fetch(
          `https://graph.facebook.com/v22.0/${encodeURIComponent(igUserId)}/stories?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&access_token=${encodeURIComponent(token)}`
        ).catch(() => null)
      ]);

      if (bdRes && bdRes.ok) {
        const bdJson = await bdRes.json();
        const bd = bdJson?.business_discovery;
        if (bd) {
          const mediaItems = bd.media?.data || [];
          const postsList = mediaItems.map(m => {
            const childMedia = m.children?.data?.[0];
            const isVideo =
              m.media_type === "VIDEO" ||
              m.media_product_type === "REELS" ||
              childMedia?.media_type === "VIDEO";
            const videoUrl = isVideo ? m.media_url || childMedia?.media_url || "" : "";
            const imageUrl =
              m.thumbnail_url ||
              m.media_url ||
              childMedia?.thumbnail_url ||
              childMedia?.media_url ||
              "";

            return {
              id: String(m.id),
              type: isVideo ? "reel" : "post",
              isVideo,
              videoUrl,
              title:
                m.media_product_type === "REELS"
                  ? "Instagram Reel (Graph API)"
                  : isVideo
                  ? "Video (Graph API)"
                  : "Gönderi (Graph API)",
              text: m.caption || `@${bd.username} Instagram paylaşımı`,
              image: imageUrl,
              date: formatDate(m.timestamp),
              url: m.permalink || `https://www.instagram.com/${encodeURIComponent(username)}/`,
              stats: [
                { label: "Beğeni", value: formatCompact(m.like_count) },
                { label: "Yorum", value: formatCompact(m.comments_count) }
              ]
            };
          });

          let storiesList = [];
          if (storiesRes && storiesRes.ok) {
            const stJson = await storiesRes.json().catch(() => null);
            const stData = stJson?.data || [];
            storiesList = stData.map(s => ({
              id: String(s.id),
              type: "story",
              isVideo: s.media_type === "VIDEO",
              videoUrl: s.media_type === "VIDEO" ? s.media_url || "" : "",
              title: "Instagram Story (Graph API)",
              text: s.caption || `@${username} hikayesi`,
              image: s.thumbnail_url || s.media_url || bd.profile_picture_url || "",
              date: formatDate(s.timestamp),
              url: s.permalink || `https://www.instagram.com/stories/${encodeURIComponent(username)}/`,
              stats: [{ label: "Kaynak", value: "Meta Graph v22.0" }]
            }));
          }

          return {
            apiSource: "Meta Graph API v22.0",
            found: true,
            isPrivate: false,
            name: bd.name || bd.username || username,
            avatar: bd.profile_picture_url || "",
            bio: bd.biography || "",
            followers: formatCompact(bd.followers_count),
            following: formatCompact(bd.follows_count),
            postsCount: formatCompact(bd.media_count),
            postsList,
            storiesList
          };
        }
      }
    }

    // 2. Fallback to Instagram Graph API /me endpoint if token is an Instagram User Token
    const meUrl = `https://graph.instagram.com/v22.0/me?fields=id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count,media.limit(16){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count}&access_token=${encodeURIComponent(token)}`;
    const meRes = await fetch(meUrl).catch(() => null);
    if (meRes && meRes.ok) {
      const me = await meRes.json();
      if (me && me.username && me.username.toLowerCase() === username.toLowerCase()) {
        const postsList = (me.media?.data || []).map(m => ({
          id: String(m.id),
          type: m.media_type === "VIDEO" ? "reel" : "post",
          isVideo: m.media_type === "VIDEO",
          videoUrl: m.media_type === "VIDEO" ? m.media_url || "" : "",
          title: m.media_type === "VIDEO" ? "Reel / Video" : "Instagram Gönderisi",
          text: m.caption || "",
          image: m.thumbnail_url || m.media_url || "",
          date: formatDate(m.timestamp),
          url: m.permalink || `https://www.instagram.com/${encodeURIComponent(username)}/`,
          stats: [
            { label: "Beğeni", value: formatCompact(m.like_count) },
            { label: "Yorum", value: formatCompact(m.comments_count) }
          ]
        }));
        return {
          apiSource: "Instagram Graph API v22.0",
          found: true,
          isPrivate: false,
          name: me.name || me.username,
          avatar: me.profile_picture_url || "",
          bio: me.biography || "",
          followers: formatCompact(me.followers_count),
          following: formatCompact(me.follows_count),
          postsCount: formatCompact(me.media_count),
          postsList,
          storiesList: []
        };
      }
    }
  } catch (_) {}
  return null;
}

async function fetchMetaThreadsGraphApi(username) {
  const token = apiConfig.threadsAccessToken || apiConfig.metaAccessToken;
  if (!token) return null;

  try {
    // 1. Official Threads Public Profile Discovery Endpoint (graph.threads.net/v1.0/profile_lookup)
    const lookupUrl = `https://graph.threads.net/v1.0/profile_lookup?username=${encodeURIComponent(
      username
    )}&fields=username,name,threads_profile_picture_url,threads_biography,is_verified,follower_count&access_token=${encodeURIComponent(
      token
    )}`;

    const lookupRes = await fetch(lookupUrl).catch(() => null);
    if (lookupRes && lookupRes.ok) {
      const prof = await lookupRes.json();
      if (prof && prof.username) {
        return {
          apiSource: "Threads Graph API v1.0",
          found: true,
          name: prof.name || prof.username,
          avatar: prof.threads_profile_picture_url || "",
          bio: prof.threads_biography || "",
          followers: formatCompact(prof.follower_count),
          postsList: []
        };
      }
    }

    // 2. Authenticated Threads User Media (/v1.0/me/threads)
    const meUrl = `https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url,threads_biography,threads.limit(16){id,media_product_type,media_type,media_url,permalink,text,timestamp,shortcode,thumbnail_url}&access_token=${encodeURIComponent(
      token
    )}`;
    const meRes = await fetch(meUrl).catch(() => null);
    if (meRes && meRes.ok) {
      const me = await meRes.json();
      if (me && me.username && me.username.toLowerCase() === username.toLowerCase()) {
        const postsList = (me.threads?.data || []).map(t => ({
          id: String(t.id || t.shortcode),
          type: t.media_type === "VIDEO" ? "reel" : "post",
          isVideo: t.media_type === "VIDEO",
          videoUrl: t.media_type === "VIDEO" ? t.media_url || "" : "",
          title: `@${me.username}`,
          text: t.text || "Threads paylaşımı",
          image: t.thumbnail_url || t.media_url || "",
          date: formatDate(t.timestamp),
          url: t.permalink || `https://www.threads.net/@${encodeURIComponent(username)}`,
          stats: [{ label: "API", value: "Threads Graph v1.0" }]
        }));
        return {
          apiSource: "Threads Graph API v1.0",
          found: true,
          name: me.name || me.username,
          avatar: me.threads_profile_picture_url || "",
          bio: me.threads_biography || "",
          followers: "—",
          postsList
        };
      }
    }
  } catch (_) {}
  return null;
}

function decodeEntities(str) {
  if (!str) return "";
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMeta(html, key) {
  const r1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`,
    "i"
  );
  const m1 = html.match(r1);
  if (m1) return decodeEntities(m1[1]);

  const r2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`,
    "i"
  );
  const m2 = html.match(r2);
  return m2 ? decodeEntities(m2[1]) : "";
}

function formatDate(dateInput) {
  if (!dateInput) return "";
  try {
    const d =
      typeof dateInput === "number"
        ? new Date(dateInput > 1e12 ? dateInput : dateInput * 1000)
        : new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch (e) {
    return "";
  }
}

function formatCompact(n) {
  if (n === null || n === undefined || n === "" || isNaN(n)) return "—";
  const num = Number(n);
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 10000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return num.toLocaleString("en-US");
}

/* --------------------------------------------------------------------------
   AnonyIG & StoriesIG MCP Streamable HTTP Client
   Connects directly to https://api-wh.anonyig.com/instagram/mcp
   and https://api-wh.storiesig.info/instagram/mcp
   -------------------------------------------------------------------------- */
const MCP_ENDPOINTS = [
  "https://api-wh.anonyig.com/instagram/mcp",
  "https://api-wh.storiesig.info/instagram/mcp"
];

async function parseMcpResponse(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    // Parse SSE (text/event-stream) data lines
    const lines = text.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith("data:")) {
        const dataStr = line.slice(5).trim();
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed && (parsed.result || parsed.error)) return parsed;
        } catch (_) {}
      }
    }
  }
  return null;
}

async function callInstagramMcpTools(username) {
  for (const endpoint of MCP_ENDPOINTS) {
    try {
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "User-Agent": BROWSER_UA
      };

      // 1. Initialize MCP session if required
      const initRes = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "social-index", version: "1.0.0" }
          }
        })
      });

      const sessionId =
        initRes.headers.get("mcp-session-id") ||
        initRes.headers.get("x-session-id") ||
        "";
      if (sessionId) {
        headers["mcp-session-id"] = sessionId;
      }

      const callTool = async (name, args, id) => {
        try {
          const r = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
              jsonrpc: "2.0",
              id,
              method: "tools/call",
              params: { name, arguments: args }
            })
          });
          if (!r.ok) return null;
          const rpc = await parseMcpResponse(r);
          return extractMcpToolPayload(rpc);
        } catch (_) {
          return null;
        }
      };

      const [profileData, postsData, storiesData, highlightsData] = await Promise.all([
        callTool("get_instagram_profile", { username }, 2),
        callTool("list_instagram_posts", { username }, 3),
        callTool("list_instagram_stories", { username }, 4),
        callTool("list_instagram_highlights", { username }, 5)
      ]);

      if (profileData || postsData || storiesData || highlightsData) {
        return {
          profileData,
          postsData,
          storiesData,
          highlightsData
        };
      }
    } catch (_) {}
  }
  return null;
}

function extractMcpToolPayload(rpc) {
  if (!rpc || !rpc.result) return null;
  if (rpc.result.structuredContent) return rpc.result.structuredContent;
  const contentArr = rpc.result.content;
  if (Array.isArray(contentArr)) {
    for (const c of contentArr) {
      if (c && typeof c.text === "string") {
        try {
          return JSON.parse(c.text);
        } catch (_) {
          return c.text;
        }
      }
    }
  }
  return rpc.result;
}

/* --------------------------------------------------------------------------
   AnonyIG / StoriesIG Direct REST API Client
   -------------------------------------------------------------------------- */
async function callStoriesIgRestApi(username) {
  const baseHosts = [
    { api: "https://api-ig.storiesig.info", origin: "https://storiesig.info" },
    { api: "https://storiesig.info", origin: "https://storiesig.info" },
    { api: "https://anonyig.com", origin: "https://anonyig.com" }
  ];

  for (const host of baseHosts) {
    try {
      const headers = {
        "User-Agent": BROWSER_UA,
        Accept: "application/json, text/plain, */*",
        Origin: host.origin,
        Referer: `${host.origin}/`
      };

      const [userRes, storyRes, highRes, postsRes] = await Promise.all([
        fetch(`${host.api}/api/userInfoByUsername/${encodeURIComponent(username)}`, { headers }).catch(() => null),
        fetch(`${host.api}/api/story?url=${encodeURIComponent(`https://www.instagram.com/stories/${username}/`)}`, { headers }).catch(() => null),
        fetch(`${host.api}/api/highlights/${encodeURIComponent(username)}`, { headers }).catch(() => null),
        fetch(`${host.api}/api/postsV2?username=${encodeURIComponent(username)}`, { headers }).catch(() => null)
      ]);

      const userJson = userRes && userRes.ok ? await userRes.json().catch(() => null) : null;
      const storyJson = storyRes && storyRes.ok ? await storyRes.json().catch(() => null) : null;
      const highJson = highRes && highRes.ok ? await highRes.json().catch(() => null) : null;
      const postsJson = postsRes && postsRes.ok ? await postsRes.json().catch(() => null) : null;

      if (userJson || storyJson || highJson || postsJson) {
        return { userJson, storyJson, highJson, postsJson };
      }
    } catch (_) {}
  }
  return null;
}

/* --------------------------------------------------------------------------
   1. Instagram Fetcher (Meta Graph API v22.0 + AnonyIG MCP/REST + Embed)
   -------------------------------------------------------------------------- */
async function fetchInstagram(username) {
  const url = `https://www.instagram.com/${encodeURIComponent(username)}/`;
  try {
    const [metaGraphResult, mcpResult, restResult, webApiResult, embedResult, botRes] = await Promise.all([
      fetchMetaInstagramGraphApi(username),
      callInstagramMcpTools(username),
      callStoriesIgRestApi(username),
      fetchInstagramWebProfileApi(username, url),
      fetchInstagramEmbedData(username, url),
      fetch(url, {
        headers: {
          "User-Agent": BOT_UA,
          Accept: "text/html,application/xhtml+xml"
        }
      }).catch(() => null)
    ]);

    // Normalize Posts, Reels, Stories, Highlights across all layers
    let postsList = [];
    let reelsList = [];
    let storiesList = [];
    let highlightsList = [];
    let apiSource = "Instagram Graph / Web API";

    // Layer 0: Official Meta Graph API v22.0 (developers.facebook.com)
    if (metaGraphResult && metaGraphResult.found) {
      apiSource = metaGraphResult.apiSource || "Meta Graph API v22.0";
      if (metaGraphResult.postsList?.length > 0) postsList = metaGraphResult.postsList;
      if (metaGraphResult.storiesList?.length > 0) storiesList = metaGraphResult.storiesList;
    }

    // Layer 1: Extract from AnonyIG / StoriesIG MCP if available
    if (mcpResult) {
      const mcpPosts = normalizeAnyMediaArray(mcpResult.postsData, username, "post");
      if (postsList.length === 0 && mcpPosts.length > 0) {
        postsList = mcpPosts;
        apiSource = "AnonyIG MCP API";
      }

      const mcpStories = normalizeAnyMediaArray(mcpResult.storiesData, username, "story");
      if (storiesList.length === 0 && mcpStories.length > 0) storiesList = mcpStories;

      const mcpHighlights = normalizeHighlightsArray(mcpResult.highlightsData, username);
      if (highlightsList.length === 0 && mcpHighlights.length > 0) highlightsList = mcpHighlights;
    }

    // Layer 2: Extract from StoriesIG / AnonyIG REST API if available
    if (restResult) {
      if (postsList.length === 0 && restResult.postsJson) {
        postsList = normalizeAnyMediaArray(restResult.postsJson, username, "post");
      }
      if (storiesList.length === 0 && restResult.storyJson) {
        storiesList = normalizeAnyMediaArray(restResult.storyJson, username, "story");
      }
      if (highlightsList.length === 0 && restResult.highJson) {
        highlightsList = normalizeHighlightsArray(restResult.highJson, username);
      }
    }

    // Layer 3: Extract from Instagram Web Profile Info API
    if (postsList.length === 0 && webApiResult?.postsList?.length > 0) {
      postsList = webApiResult.postsList;
    }

    // Layer 4: Extract from Instagram /embed/ contextJSON & DOM
    if (postsList.length === 0 && embedResult?.postsList?.length > 0) {
      postsList = embedResult.postsList;
    }

    // Separate Reels from Posts (or include video posts in Reels tab like AnonyIG)
    reelsList = postsList.filter(
      p => p.isVideo || /reel|video/i.test(p.title || "") || (p.videoUrl && p.videoUrl.length > 0)
    );

    // Resolve Profile Header Details
    let found = false;
    let isPrivate = false;
    let displayName = username;
    let avatar = "";
    let bio = "";
    let followers = "—";
    let following = "—";
    let postsCount = "—";

    if (metaGraphResult && metaGraphResult.found) {
      found = true;
      isPrivate = Boolean(metaGraphResult.isPrivate);
      displayName = metaGraphResult.name || displayName;
      avatar = metaGraphResult.avatar || avatar;
      bio = metaGraphResult.bio || bio;
      followers = metaGraphResult.followers || followers;
      following = metaGraphResult.following || following;
      postsCount = metaGraphResult.postsCount || postsCount;
    }

    if (!found && webApiResult && webApiResult.found) {
      found = true;
      isPrivate = webApiResult.visibility === "Private Account";
      displayName = webApiResult.name;
      avatar = webApiResult.avatar;
      bio = webApiResult.bio;
      followers = webApiResult.metrics[0]?.value || "—";
      following = webApiResult.metrics[1]?.value || "—";
      postsCount = webApiResult.metrics[2]?.value || "—";
    }

    if (!found && mcpResult?.profileData && typeof mcpResult.profileData === "object") {
      const p = mcpResult.profileData.user || mcpResult.profileData.result || mcpResult.profileData;
      if (p && (p.username || p.full_name || p.followers || p.follower_count)) {
        found = true;
        isPrivate = Boolean(p.is_private);
        displayName = p.full_name || p.name || username;
        avatar = p.profile_pic_url_hd || p.profile_pic_url || p.avatar || "";
        bio = p.biography || p.bio || "";
        followers = formatCompact(p.follower_count ?? p.followers ?? p.edge_followed_by?.count);
        following = formatCompact(p.following_count ?? p.following ?? p.edge_follow?.count);
        postsCount = formatCompact(p.media_count ?? p.posts ?? p.edge_owner_to_timeline_media?.count);
      }
    }

    if (!found && restResult?.userJson) {
      const u = restResult.userJson?.result?.user || restResult.userJson?.user || restResult.userJson;
      if (u && (u.username || u.pk || u.id)) {
        found = true;
        isPrivate = Boolean(u.is_private);
        displayName = u.full_name || username;
        avatar = u.hd_profile_pic_url_info?.url || u.profile_pic_url || "";
        bio = u.biography || "";
        followers = formatCompact(u.follower_count);
        following = formatCompact(u.following_count);
        postsCount = formatCompact(u.media_count);
      }
    }

    if (botRes && botRes.ok) {
      const html = await botRes.text();
      const ogTitle = extractMeta(html, "og:title");
      const ogDesc = extractMeta(html, "og:description");
      const metaDesc = extractMeta(html, "description") || ogDesc;
      const ogImage = extractMeta(html, "og:image");

      if (ogTitle && ogTitle.toLowerCase() !== "instagram") {
        found = true;
        const titleMatch = ogTitle.match(/^(.*?)\s*\(@/);
        if (titleMatch && titleMatch[1].trim()) {
          displayName = titleMatch[1].trim();
        }
        if (!avatar && ogImage) avatar = ogImage;

        const statsMatch = metaDesc.match(
          /([0-9.,KMBkmb]+)\s+Followers?,\s*([0-9.,KMBkmb]+)\s+Following,\s*([0-9.,KMBkmb]+)\s+Posts?/i
        );
        if (statsMatch) {
          if (followers === "—") followers = statsMatch[1];
          if (following === "—") following = statsMatch[2];
          if (postsCount === "—") postsCount = statsMatch[3];
        }

        const bioMatch = metaDesc.match(/on Instagram:\s*["“]([\s\S]*?)["”]\s*$/i);
        if (!bio) {
          if (bioMatch && bioMatch[1].trim()) {
            bio = bioMatch[1].trim();
          } else if (ogDesc) {
            bio = ogDesc;
          }
        }

        if (/this account is private/i.test(html) || /"is_private":true/i.test(html)) {
          isPrivate = true;
        }
      }
    }

    if (!found && embedResult && embedResult.found) {
      found = true;
      isPrivate = Boolean(embedResult.isPrivate);
      displayName = embedResult.fullName || displayName;
      avatar = embedResult.avatar || avatar;
      bio = embedResult.bio || bio;
      if (followers === "—" && embedResult.followers) followers = embedResult.followers;
      if (postsCount === "—" && embedResult.postsCount) postsCount = embedResult.postsCount;
    }

    if (!found && postsList.length === 0 && storiesList.length === 0) {
      return notFoundResult("Instagram", username, url);
    }

    return {
      platform: "Instagram",
      apiSource,
      found: true,
      visibility: isPrivate ? "Private Account" : "Public Account",
      name: displayName || username,
      handle: `@${username}`,
      avatar,
      bio: bio || `Instagram profili (@${username})`,
      url,
      metrics: [
        { label: "Followers", value: followers },
        { label: "Following", value: following },
        { label: "Posts", value: postsCount }
      ],
      postsList,
      reelsList,
      storiesList,
      highlightsList
    };
  } catch (err) {
    return notFoundResult("Instagram", username, url);
  }
}

function normalizeAnyMediaArray(raw, username, kind = "post") {
  if (!raw) return [];
  const items = [];
  const candidates = Array.isArray(raw)
    ? raw
    : raw.result ||
      raw.items ||
      raw.posts ||
      raw.stories ||
      raw.edges ||
      raw.data?.items ||
      raw.data?.posts ||
      raw.data?.stories ||
      [];

  if (!Array.isArray(candidates)) return [];

  for (const entry of candidates) {
    if (items.length >= 18) break;
    const node = entry?.node || entry?.post || entry;
    if (!node || typeof node !== "object") continue;

    const code = node.shortcode || node.code || node.pk || node.id || "";
    const isVideo = Boolean(
      node.is_video ||
        node.media_type === 2 ||
        node.video_url ||
        (Array.isArray(node.video_versions) && node.video_versions.length > 0)
    );
    const videoUrl =
      node.video_url ||
      node.video_versions?.[0]?.url ||
      node.media_url ||
      "";
    const imageUrl =
      node.display_url ||
      node.thumbnail_src ||
      node.image_versions2?.candidates?.[0]?.url ||
      node.thumbnail_url ||
      node.cover_url ||
      node.url ||
      "";

    if (!imageUrl && !videoUrl && !code) continue;

    const caption =
      node.edge_media_to_caption?.edges?.[0]?.node?.text ||
      node.caption?.text ||
      (typeof node.caption === "string" ? node.caption : "") ||
      node.text ||
      "";

    const likes =
      node.edge_liked_by?.count ??
      node.edge_media_preview_like?.count ??
      node.like_count ??
      node.likes;
    const comments =
      node.edge_media_to_comment?.count ??
      node.edge_media_preview_comment?.count ??
      node.comment_count ??
      node.comments;

    const dateVal = node.taken_at_timestamp || node.taken_at || node.created_at || node.timestamp;

    items.push({
      id: String(code || items.length + 1),
      type: kind === "story" ? "story" : isVideo ? "reel" : "post",
      isVideo,
      videoUrl,
      title:
        kind === "story"
          ? "Hikaye (Story)"
          : isVideo
          ? "Reel / Video"
          : "Gönderi",
      text:
        caption ||
        (kind === "story"
          ? `@${username} hikayesi`
          : `@${username} Instagram gönderisi`),
      image: imageUrl,
      date: formatDate(dateVal),
      url:
        kind === "story"
          ? `https://www.instagram.com/stories/${encodeURIComponent(username)}/`
          : code && String(code).length < 15
          ? `https://www.instagram.com/p/${code}/`
          : `https://www.instagram.com/${encodeURIComponent(username)}/`,
      stats: [
        ...(likes !== undefined ? [{ label: "Beğeni", value: formatCompact(likes) }] : []),
        ...(comments !== undefined ? [{ label: "Yorum", value: formatCompact(comments) }] : [])
      ]
    });
  }
  return items;
}

function normalizeHighlightsArray(raw, username) {
  if (!raw) return [];
  const list = Array.isArray(raw)
    ? raw
    : raw.result || raw.highlights || raw.tray || raw.items || raw.data || [];
  if (!Array.isArray(list)) return [];

  const out = [];
  for (const h of list) {
    if (out.length >= 16) break;
    const node = h?.node || h;
    if (!node || typeof node !== "object") continue;
    const id = String(node.id || node.pk || "").replace(/^highlight:/, "");
    const title = node.title || "Öne Çıkanlar";
    const cover =
      node.cover_media?.cropped_image_version?.url ||
      node.cover_media_cropped_thumbnail?.url ||
      node.cover_url ||
      node.cover ||
      node.thumbnail ||
      "";

    out.push({
      id: id || String(out.length + 1),
      title,
      image: cover,
      url: id
        ? `https://www.instagram.com/stories/highlights/${id}/`
        : `https://www.instagram.com/${encodeURIComponent(username)}/`
    });
  }
  return out;
}

async function fetchInstagramWebProfileApi(username, url) {
  try {
    const apiRes = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          "X-IG-App-ID": "936619743392459",
          "X-ASBD-ID": "129477",
          "X-IG-WWW-Claim": "0",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "*/*",
          Referer: url
        }
      }
    );
    if (!apiRes.ok) return null;
    const json = await apiRes.json();
    const u = json?.data?.user;
    if (!u) return null;

    const edges = u.edge_owner_to_timeline_media?.edges || [];
    const felonyVideoEdges = u.edge_felix_video_timeline?.edges || [];
    const combinedEdges = [...edges, ...felonyVideoEdges];
    const seen = new Set();
    const postsList = [];

    for (const { node } of combinedEdges) {
      if (!node || postsList.length >= 16) continue;
      const code = node.shortcode || node.id;
      if (seen.has(code)) continue;
      seen.add(code);

      const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text || "";
      const isVideo = Boolean(node.is_video);
      postsList.push({
        id: code,
        type: isVideo ? "reel" : "post",
        isVideo,
        videoUrl: node.video_url || "",
        title: isVideo ? "Reel / Video" : "Instagram Gönderisi",
        text: caption || "Açıklama bulunmuyor.",
        image: node.display_url || node.thumbnail_src || "",
        date: formatDate(node.taken_at_timestamp),
        url: node.shortcode ? `https://www.instagram.com/p/${node.shortcode}/` : url,
        stats: [
          {
            label: "Beğeni",
            value: formatCompact(node.edge_liked_by?.count ?? node.edge_media_preview_like?.count)
          },
          { label: "Yorum", value: formatCompact(node.edge_media_to_comment?.count) }
        ]
      });
    }

    return {
      platform: "Instagram",
      found: true,
      visibility: u.is_private ? "Private Account" : "Public Account",
      name: u.full_name || username,
      handle: `@${u.username || username}`,
      avatar: u.profile_pic_url_hd || u.profile_pic_url || "",
      bio: u.biography || "Instagram profil bilgisi.",
      url,
      metrics: [
        { label: "Followers", value: formatCompact(u.edge_followed_by?.count) },
        { label: "Following", value: formatCompact(u.edge_follow?.count) },
        { label: "Posts", value: formatCompact(u.edge_owner_to_timeline_media?.count) }
      ],
      postsList
    };
  } catch (_) {
    return null;
  }
}

async function fetchInstagramEmbedData(username, profileUrl) {
  const endpoints = [
    `https://www.instagram.com/${encodeURIComponent(username)}/embed/`,
    `https://www.instagram.com/${encodeURIComponent(username)}/embed/captioned/`
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });
      if (!res.ok) continue;
      const html = await res.text();

      const parsed = parseInstagramEmbedHtml(html, username, profileUrl);
      if (parsed && (parsed.postsList.length > 0 || parsed.found)) {
        return parsed;
      }
    } catch (_) {}
  }
  return null;
}

function parseInstagramEmbedHtml(html, username, profileUrl) {
  const postsList = [];
  let found = false;
  let fullName = "";
  let avatar = "";
  let followers = "";
  let postsCount = "";
  let bio = "";
  let isPrivate = false;

  // 1. Parse contextJSON string literal inside ServerJS
  const ctxMatch = html.match(/"contextJSON"\s*:\s*("(?:\\.|[^"\\])*")/);
  if (ctxMatch) {
    try {
      const innerStr = JSON.parse(ctxMatch[1]);
      const ctx = JSON.parse(innerStr);
      const user =
        ctx?.context?.user ||
        ctx?.gql_data?.user ||
        ctx?.user ||
        findObjectWithKey(ctx, "edge_owner_to_timeline_media");

      if (user) {
        found = true;
        fullName = user.full_name || fullName;
        avatar = user.profile_pic_url_hd || user.profile_pic_url || avatar;
        bio = user.biography || bio;
        isPrivate = Boolean(user.is_private);
        if (user.edge_followed_by?.count !== undefined) {
          followers = formatCompact(user.edge_followed_by.count);
        }
        if (user.edge_owner_to_timeline_media?.count !== undefined) {
          postsCount = formatCompact(user.edge_owner_to_timeline_media.count);
        }

        const edges =
          user.edge_owner_to_timeline_media?.edges ||
          ctx?.context?.graphql_media ||
          [];
        for (const item of edges) {
          const node = item?.node || item?.shortcode_media || item;
          if (!node || typeof node !== "object") continue;
          const shortcode = node.shortcode || node.code;
          const img =
            node.display_url ||
            node.thumbnail_src ||
            node.display_resources?.[0]?.src ||
            "";
          if (!shortcode && !img) continue;

          const caption =
            node.edge_media_to_caption?.edges?.[0]?.node?.text ||
            node.caption?.text ||
            (typeof node.caption === "string" ? node.caption : "") ||
            node.accessibility_caption ||
            "";
          const likes =
            node.edge_liked_by?.count ??
            node.edge_media_preview_like?.count ??
            node.like_count;
          const comments =
            node.edge_media_to_comment?.count ??
            node.edge_media_preview_comment?.count ??
            node.comment_count;
          const isVideo = Boolean(node.is_video || node.video_url);

          postsList.push({
            id: shortcode || String(postsList.length + 1),
            type: isVideo ? "reel" : "post",
            isVideo,
            videoUrl: node.video_url || "",
            title: isVideo ? "Reel / Video" : "Instagram Gönderisi",
            text: caption || `@${username} tarafından paylaşılan gönderi.`,
            image: img,
            date: formatDate(node.taken_at_timestamp || node.taken_at),
            url: shortcode ? `https://www.instagram.com/p/${shortcode}/` : profileUrl,
            stats: [
              ...(likes !== undefined ? [{ label: "Beğeni", value: formatCompact(likes) }] : []),
              ...(comments !== undefined ? [{ label: "Yorum", value: formatCompact(comments) }] : [])
            ]
          });
        }
      }
    } catch (_) {}
  }

  // 2. Scan inline JSON objects for shortcode/display_url nodes
  if (postsList.length === 0) {
    const nodeRegex =
      /"shortcode"\s*:\s*"([A-Za-z0-9_-]{5,})"[\s\S]{0,1200}?"(?:display_url|thumbnail_src)"\s*:\s*"([^"]+)"/g;
    let nm;
    const seenCodes = new Set();
    while ((nm = nodeRegex.exec(html)) !== null && postsList.length < 12) {
      const code = nm[1];
      if (seenCodes.has(code)) continue;
      seenCodes.add(code);
      let rawUrl = nm[2];
      try {
        rawUrl = JSON.parse(`"${rawUrl}"`);
      } catch (_) {
        rawUrl = rawUrl.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
      }
      postsList.push({
        id: code,
        type: "post",
        isVideo: false,
        title: "Instagram Gönderisi",
        text: `@${username} Instagram paylaşımı (${code})`,
        image: decodeEntities(rawUrl),
        date: "",
        url: `https://www.instagram.com/p/${code}/`,
        stats: [{ label: "Kod", value: code }]
      });
    }
  }

  // 3. Parse rendered DOM inside /embed/ page
  if (postsList.length === 0) {
    const anchorParts = html.split(/<a\s+/i);
    const seen = new Set();
    for (const part of anchorParts) {
      if (postsList.length >= 12) break;
      const codeMatch = part.match(/instagram\.com\/(?:[^/"']+\/)?(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
      const imgMatch = part.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (codeMatch && imgMatch) {
        const code = codeMatch[1];
        if (seen.has(code)) continue;
        seen.add(code);
        const altMatch = part.match(/alt=["']([^"']*)["']/i);
        const captionText = altMatch ? decodeEntities(altMatch[1]).trim() : "";
        postsList.push({
          id: code,
          type: "post",
          isVideo: false,
          title: "Instagram Gönderisi",
          text: captionText || `@${username} tarafından paylaşılan Instagram gönderisi.`,
          image: decodeEntities(imgMatch[1]),
          date: "",
          url: `https://www.instagram.com/p/${code}/`,
          stats: [{ label: "Gönderi", value: code }]
        });
      }
    }
  }

  if (postsList.length > 0) found = true;

  return {
    found,
    fullName,
    avatar,
    followers,
    postsCount,
    bio,
    isPrivate,
    postsList
  };
}

function findObjectWithKey(obj, targetKey, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 7) return null;
  if (Object.prototype.hasOwnProperty.call(obj, targetKey)) return obj;
  for (const k of Object.keys(obj)) {
    const res = findObjectWithKey(obj[k], targetKey, depth + 1);
    if (res) return res;
  }
  return null;
}

/* --------------------------------------------------------------------------
   2. Threads Fetcher (Meta Threads Graph API v1.0 + GraphQL + data-sjs + IG Sync)
   -------------------------------------------------------------------------- */
async function fetchThreads(username, igPromise) {
  const url = `https://www.threads.net/@${encodeURIComponent(username)}`;
  try {
    const [threadsGraphResult, botRes, browserRes] = await Promise.all([
      fetchMetaThreadsGraphApi(username),
      fetch(`https://www.threads.com/@${encodeURIComponent(username)}`, {
        headers: {
          "User-Agent": FB_BOT_UA,
          Accept: "text/html,application/xhtml+xml"
        },
        redirect: "follow"
      }).catch(() => null),
      fetch(`https://www.threads.net/@${encodeURIComponent(username)}`, {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml"
        },
        redirect: "follow"
      }).catch(() => null)
    ]);

    let postsList = [];
    let apiSource = "Threads GraphQL / SJS";

    if (threadsGraphResult && threadsGraphResult.postsList?.length > 0) {
      postsList = threadsGraphResult.postsList;
      apiSource = threadsGraphResult.apiSource;
    }

    if (postsList.length === 0 && browserRes && browserRes.ok) {
      const bHtml = await browserRes.text();
      postsList = extractThreadsPostsFromHtml(bHtml, username, url);
      if (postsList.length === 0) {
        postsList = await fetchThreadsGraphqlPosts(bHtml, username, url);
      }
    }

    if (threadsGraphResult && threadsGraphResult.found) {
      const igData = igPromise ? await igPromise : null;
      if (postsList.length === 0 && igData?.postsList?.length) {
        postsList = igData.postsList;
      }
      const reelsList = postsList.filter(p => p.isVideo || p.videoUrl);
      return {
        platform: "Threads",
        apiSource: threadsGraphResult.apiSource || "Threads Graph API v1.0",
        found: true,
        visibility: "Public Profile",
        name: threadsGraphResult.name || username,
        handle: `@${username}`,
        avatar: threadsGraphResult.avatar || igData?.avatar || "",
        bio: threadsGraphResult.bio || igData?.bio || "Threads profile.",
        url,
        metrics: [
          { label: "Followers", value: threadsGraphResult.followers || igData?.metrics?.[0]?.value || "—" },
          { label: "Network", value: "graph.threads.net/v1.0" },
          { label: "Handle", value: `@${username}` }
        ],
        postsList,
        reelsList: reelsList.length > 0 ? reelsList : igData?.reelsList || [],
        storiesList: igData?.storiesList || [],
        highlightsList: igData?.highlightsList || []
      };
    }

    if (botRes && botRes.ok) {
      const html = await botRes.text();
      if (postsList.length === 0) {
        postsList = extractThreadsPostsFromHtml(html, username, url);
      }
      if (postsList.length === 0) {
        postsList = await fetchThreadsGraphqlPosts(html, username, url);
      }

      const ogTitle = extractMeta(html, "og:title");
      const ogDesc = extractMeta(html, "og:description");
      const ogImage = extractMeta(html, "og:image");

      if (
        ogTitle &&
        !ogTitle.toLowerCase().includes("log in") &&
        ogTitle.toLowerCase() !== "threads"
      ) {
        let displayName = username;
        const nameMatch = ogTitle.match(/^(.*?)\s*\(@/);
        if (nameMatch && nameMatch[1].trim()) {
          displayName = nameMatch[1].trim();
        }

        let followers = "—";
        const folMatch = ogDesc.match(/([0-9.,KMBkmb]+)\s+Followers?/i);
        if (folMatch) {
          followers = folMatch[1];
        }

        const cleanBio = ogDesc
          .replace(/[0-9.,KMBkmb]+\s+Followers?\s*[•·-]*\s*/i, "")
          .replace(/See the latest conversations with.*$/i, "")
          .trim();

        const igData = igPromise ? await igPromise : null;
        if (postsList.length === 0 && igData?.postsList?.length) {
          postsList = igData.postsList;
        }

        const reelsList = postsList.filter(p => p.isVideo || p.videoUrl);

        return {
          platform: "Threads",
          apiSource,
          found: true,
          visibility: "Public / Private Header",
          name: displayName,
          handle: `@${username}`,
          avatar: ogImage,
          bio: cleanBio || ogDesc || "Threads profile.",
          url,
          metrics: [
            { label: "Followers", value: followers },
            { label: "Network", value: "Meta Threads" },
            { label: "Handle", value: `@${username}` }
          ],
          postsList,
          reelsList: reelsList.length > 0 ? reelsList : igData?.reelsList || [],
          storiesList: igData?.storiesList || [],
          highlightsList: igData?.highlightsList || []
        };
      }
    }

    const igData = igPromise ? await igPromise : null;
    if (igData && igData.found) {
      return {
        platform: "Threads",
        apiSource: "Meta IG-Threads Graph",
        found: true,
        visibility:
          igData.visibility === "Private Account" ? "Private Account" : "Linked Meta Profile",
        name: igData.name,
        handle: `@${username}`,
        avatar: igData.avatar,
        bio: igData.bio,
        url,
        metrics: [
          { label: "IG / Threads Audience", value: igData.metrics[0]?.value || "—" },
          { label: "Following", value: igData.metrics[1]?.value || "—" },
          { label: "Linked Handle", value: `@${username}` }
        ],
        postsList: postsList.length > 0 ? postsList : igData.postsList || [],
        reelsList: igData.reelsList || [],
        storiesList: igData.storiesList || [],
        highlightsList: igData.highlightsList || []
      };
    }

    return notFoundResult("Threads", username, url);
  } catch (err) {
    return notFoundResult("Threads", username, url);
  }
}

function extractThreadsPostsFromHtml(html, username, profileUrl) {
  const posts = [];
  if (!html || !html.includes("thread_items")) return posts;

  try {
    const scriptRegex =
      /<script[^>]*type=["']application\/json["'][^>]*data-sjs[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    const seenCodes = new Set();

    while ((m = scriptRegex.exec(html)) !== null) {
      if (!m[1].includes("thread_items")) continue;
      try {
        const parsed = JSON.parse(m[1]);
        const threadItemsArrays = [];
        collectArraysByKey(parsed, "thread_items", threadItemsArrays);

        for (const arr of threadItemsArrays) {
          for (const item of arr) {
            const post = item?.post;
            if (!post || posts.length >= 12) continue;
            const code = post.code || post.pk || post.id;
            if (code && seenCodes.has(code)) continue;
            if (code) seenCodes.add(code);

            const text = post.caption?.text || "";
            const img =
              post.image_versions2?.candidates?.[0]?.url ||
              post.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ||
              "";
            const videoUrl = post.video_versions?.[0]?.url || "";
            if (!text && !img && !videoUrl) continue;

            posts.push({
              id: String(code || posts.length + 1),
              type: videoUrl ? "reel" : "post",
              isVideo: Boolean(videoUrl),
              videoUrl,
              title: `@${post.user?.username || username}`,
              text: text || "Threads medya paylaşımı",
              image: img,
              date: formatDate(post.taken_at),
              url: code
                ? `https://www.threads.net/@${encodeURIComponent(username)}/post/${code}`
                : profileUrl,
              stats: [
                { label: "Beğeni", value: formatCompact(post.like_count) },
                {
                  label: "Yanıt",
                  value: formatCompact(post.text_post_app_info?.direct_reply_count)
                },
                {
                  label: "Repost",
                  value: formatCompact(post.text_post_app_info?.repost_count)
                }
              ]
            });
          }
        }
      } catch (_) {}
    }
  } catch (_) {}

  return posts;
}

function collectArraysByKey(obj, key, out, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 12) return;
  if (Array.isArray(obj[key])) {
    out.push(obj[key]);
  }
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === "object" && obj[k] !== null) {
      collectArraysByKey(obj[k], key, out, depth + 1);
    }
  }
}

async function fetchThreadsGraphqlPosts(html, username, profileUrl) {
  try {
    if (!html) return [];
    const userIdMatch =
      html.match(/"user_id"\s*:\s*"(\d+)"/) ||
      html.match(/"pk"\s*:\s*"(\d+)"/) ||
      html.match(/instagram:\/\/user\?id=(\d+)/);
    const lsdMatch =
      html.match(/\["LSD",\s*\[\],\s*\{"token"\s*:\s*"([^"]+)"\}/) ||
      html.match(/"lsd"\s*:\s*"([^"]+)"/);

    if (!userIdMatch) return [];
    const userId = userIdMatch[1];
    const lsd = lsdMatch ? lsdMatch[1] : "AVq5_2_8";

    const body = new URLSearchParams({
      lsd,
      variables: JSON.stringify({ userID: userId }),
      doc_id: "6232751443445612"
    }).toString();

    const gqlRes = await fetch("https://www.threads.net/api/graphql", {
      method: "POST",
      headers: {
        "User-Agent": BROWSER_UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-IG-App-ID": "238260118697367",
        "X-FB-LSD": lsd,
        Origin: "https://www.threads.net",
        Referer: profileUrl
      },
      body
    });

    if (!gqlRes.ok) return [];
    const gqlText = await gqlRes.text();
    const fakeHtml = `<script type="application/json" data-sjs>${gqlText}</script>`;
    return extractThreadsPostsFromHtml(fakeHtml, username, profileUrl);
  } catch (_) {
    return [];
  }
}

/* --------------------------------------------------------------------------
   3. TikTok Fetcher (Official TikTok v2 API + TikWM + SSR Rehydration)
   -------------------------------------------------------------------------- */
async function fetchOfficialTikTokApi(username) {
  const token = apiConfig.tiktokAccessToken;
  if (!token) return null;

  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    };

    // 1. Official TikTok Research API v2 User Info & Video Query
    const [userRes, videoRes] = await Promise.all([
      fetch(
        "https://open.tiktokapis.com/v2/research/user/info/?fields=display_name,bio_description,avatar_url,is_verified,follower_count,following_count,likes_count,video_count",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ username })
        }
      ).catch(() => null),
      fetch(
        "https://open.tiktokapis.com/v2/research/video/query/?fields=id,video_description,create_time,like_count,comment_count,share_count,view_count",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: {
              and: [{ operation: "EQ", field_name: "username", field_values: [username] }]
            },
            max_count: 12
          })
        }
      ).catch(() => null)
    ]);

    if (userRes && userRes.ok) {
      const uJson = await userRes.json();
      const u = uJson?.data;
      if (u && (u.display_name || u.follower_count !== undefined)) {
        const vJson = videoRes && videoRes.ok ? await videoRes.json().catch(() => null) : null;
        const rawVideos = vJson?.data?.videos || [];
        const postsList = rawVideos.map(v => ({
          id: String(v.id),
          type: "reel",
          isVideo: true,
          videoUrl: "",
          title: "TikTok Video (Research API v2)",
          text: v.video_description || `@${username} TikTok videosu`,
          image: u.avatar_url || "",
          date: formatDate(v.create_time),
          url: `https://www.tiktok.com/@${encodeURIComponent(username)}/video/${v.id}`,
          stats: [
            { label: "İzlenme", value: formatCompact(v.view_count) },
            { label: "Beğeni", value: formatCompact(v.like_count) },
            { label: "Yorum", value: formatCompact(v.comment_count) }
          ]
        }));

        return {
          apiSource: "TikTok Research API v2",
          found: true,
          name: u.display_name || username,
          handle: username,
          avatar: u.avatar_url || "",
          bio: u.bio_description || "",
          metrics: [
            { label: "Followers", value: formatCompact(u.follower_count) },
            { label: "Following", value: formatCompact(u.following_count) },
            { label: "Likes", value: formatCompact(u.likes_count) }
          ],
          postsList
        };
      }
    }
  } catch (_) {}
  return null;
}

async function fetchTikTok(username) {
  const url = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
  try {
    const [officialTikTok, res, tikwmData] = await Promise.all([
      fetchOfficialTikTokApi(username),
      fetch(url, {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml"
        }
      }).catch(() => null),
      fetchTikTokVideosAndUser(username, url)
    ]);

    if (officialTikTok && officialTikTok.found) {
      const videos =
        officialTikTok.postsList?.length > 0
          ? officialTikTok.postsList
          : tikwmData?.postsList || [];
      return {
        platform: "TikTok",
        apiSource: officialTikTok.apiSource,
        found: true,
        visibility: "Public Account",
        name: officialTikTok.name,
        handle: `@${officialTikTok.handle}`,
        avatar: officialTikTok.avatar || tikwmData?.avatar || "",
        bio: officialTikTok.bio || tikwmData?.bio || "TikTok profile.",
        url,
        metrics: officialTikTok.metrics,
        postsList: videos,
        reelsList: videos,
        storiesList: tikwmData?.storiesList || [],
        highlightsList: tikwmData?.highlightsList || []
      };
    }

    if (res && res.ok) {
      const html = await res.text();
      const scriptMatch = html.match(
        /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i
      );

      if (scriptMatch) {
        const json = JSON.parse(scriptMatch[1]);
        const userDetail = json?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;

        if (userDetail && userDetail.user) {
          const u = userDetail.user;
          const s = userDetail.stats || {};
          const videos = tikwmData?.postsList || [];
          return {
            platform: "TikTok",
            apiSource: "TikTok SSR + TikWM API",
            found: true,
            visibility: u.privateAccount ? "Private Account" : "Public Account",
            name: u.nickname || u.uniqueId || username,
            handle: `@${u.uniqueId || username}`,
            avatar: u.avatarLarger || u.avatarMedium || tikwmData?.avatar || "",
            bio: u.signature || "No bio set on TikTok.",
            url,
            metrics: [
              { label: "Followers", value: formatCompact(s.followerCount) },
              { label: "Following", value: formatCompact(s.followingCount) },
              { label: "Likes", value: formatCompact(s.heartCount || s.heart) }
            ],
            postsList: videos,
            reelsList: videos,
            storiesList: tikwmData?.storiesList || [],
            highlightsList: tikwmData?.highlightsList || []
          };
        }
      }
    }

    if (tikwmData && tikwmData.found) {
      return {
        platform: "TikTok",
        apiSource: "TikWM Video & Story API",
        found: true,
        visibility: "Public Account",
        name: tikwmData.name || username,
        handle: `@${tikwmData.handle || username}`,
        avatar: tikwmData.avatar || "",
        bio: tikwmData.bio || `TikTok profile (@${username})`,
        url,
        metrics: tikwmData.metrics || [
          { label: "Followers", value: "—" },
          { label: "Following", value: "—" },
          { label: "Likes", value: "—" }
        ],
        postsList: tikwmData.postsList || [],
        reelsList: tikwmData.postsList || [],
        storiesList: tikwmData.storiesList || [],
        highlightsList: tikwmData.highlightsList || []
      };
    }

    return notFoundResult("TikTok", username, url);
  } catch (err) {
    return notFoundResult("TikTok", username, url);
  }
}

async function fetchTikTokVideosAndUser(username, profileUrl) {
  try {
    const headers = {
      "User-Agent": BROWSER_UA,
      Accept: "application/json"
    };

    const [postsRes, storyRes, infoRes] = await Promise.all([
      fetch(`https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(username)}&count=12`, { headers }).catch(() => null),
      fetch(`https://www.tikwm.com/api/user/story?unique_id=${encodeURIComponent(username)}`, { headers }).catch(() => null),
      fetch(`https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(username)}`, { headers }).catch(() => null)
    ]);

    const postsJson = postsRes && postsRes.ok ? await postsRes.json().catch(() => null) : null;
    const storyJson = storyRes && storyRes.ok ? await storyRes.json().catch(() => null) : null;
    const infoJson = infoRes && infoRes.ok ? await infoRes.json().catch(() => null) : null;

    const videos = postsJson?.data?.videos || [];
    const storyVideos = storyJson?.data?.videos || storyJson?.data || [];
    const userInfo = infoJson?.data?.user || videos[0]?.author || null;
    const userStats = infoJson?.data?.stats || null;

    if (!userInfo && videos.length === 0) return null;

    const mapTikTokVideo = (v, isStory = false) => ({
      id: String(v.video_id || v.id || Math.random()),
      type: isStory ? "story" : "reel",
      isVideo: true,
      videoUrl: v.play || v.wmplay || "",
      title: isStory ? "TikTok Hikayesi (Story)" : "TikTok Videosu",
      text: v.title || (isStory ? `@${username} TikTok hikayesi` : "Açıklamasız TikTok videosu"),
      image: v.cover || v.origin_cover || "",
      date: formatDate(v.create_time),
      url: `https://www.tiktok.com/@${encodeURIComponent(username)}/video/${v.video_id || v.id || ""}`,
      stats: [
        { label: "İzlenme", value: formatCompact(v.play_count) },
        { label: "Beğeni", value: formatCompact(v.digg_count) },
        { label: "Yorum", value: formatCompact(v.comment_count) }
      ]
    });

    const postsList = videos.slice(0, 12).map(v => mapTikTokVideo(v, false));
    const storiesList = Array.isArray(storyVideos)
      ? storyVideos.slice(0, 10).map(v => mapTikTokVideo(v, true))
      : [];

    // Pinned / Top viral videos as Highlights
    const topSorted = [...videos]
      .sort((a, b) => (b.play_count || 0) - (a.play_count || 0))
      .slice(0, 6);
    const highlightsList = topSorted.map(v => ({
      id: String(v.video_id || ""),
      title: `${formatCompact(v.play_count)} İzlenme`,
      image: v.cover || v.origin_cover || "",
      url: `https://www.tiktok.com/@${encodeURIComponent(username)}/video/${v.video_id}`
    }));

    return {
      found: true,
      name: userInfo?.nickname || username,
      handle: userInfo?.uniqueId || userInfo?.unique_id || username,
      avatar: userInfo?.avatarLarger || userInfo?.avatar || "",
      bio: userInfo?.signature || "",
      metrics: userStats
        ? [
            { label: "Followers", value: formatCompact(userStats.followerCount) },
            { label: "Following", value: formatCompact(userStats.followingCount) },
            { label: "Likes", value: formatCompact(userStats.heartCount) }
          ]
        : null,
      postsList,
      storiesList,
      highlightsList
    };
  } catch (_) {
    return null;
  }
}

/* --------------------------------------------------------------------------
   4. YouTube Fetcher (Official Google YouTube Data API v3 + ytInitialData + RSS)
   -------------------------------------------------------------------------- */
async function fetchOfficialYouTubeApi(username) {
  const apiKey = apiConfig.youtubeApiKey;
  if (!apiKey) return null;

  try {
    const cleanHandle = username.startsWith("@") ? username : `@${username}`;
    const chUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent(
      cleanHandle
    )}&key=${encodeURIComponent(apiKey)}`;

    const chRes = await fetch(chUrl);
    if (!chRes.ok) return null;
    const chJson = await chRes.json();
    const ch = chJson?.items?.[0];
    if (!ch) return null;

    const uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads;
    let postsList = [];

    if (uploadsPlaylistId) {
      const plUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(
        uploadsPlaylistId
      )}&maxResults=12&key=${encodeURIComponent(apiKey)}`;
      const plRes = await fetch(plUrl).catch(() => null);
      if (plRes && plRes.ok) {
        const plJson = await plRes.json();
        const items = plJson?.items || [];
        postsList = items.map(item => {
          const sn = item.snippet || {};
          const vidId = item.contentDetails?.videoId || sn.resourceId?.videoId || "";
          const thumb =
            sn.thumbnails?.high?.url ||
            sn.thumbnails?.medium?.url ||
            (vidId ? `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg` : "");
          return {
            id: vidId,
            type: "reel",
            isVideo: true,
            embedYoutubeId: vidId,
            title: sn.title || "YouTube Video",
            text: sn.description || sn.title || "",
            image: thumb,
            date: formatDate(sn.publishedAt),
            url: `https://www.youtube.com/watch?v=${vidId}`,
            stats: [{ label: "API", value: "YouTube Data v3" }]
          };
        });
      }
    }

    return {
      apiSource: "YouTube Data API v3",
      found: true,
      name: ch.snippet?.title || username,
      handle: ch.snippet?.customUrl || `@${username}`,
      avatar: ch.snippet?.thumbnails?.high?.url || ch.snippet?.thumbnails?.default?.url || "",
      bio: ch.snippet?.description || "YouTube channel.",
      subscribers: formatCompact(ch.statistics?.subscriberCount),
      videoCount: formatCompact(ch.statistics?.videoCount),
      viewCount: formatCompact(ch.statistics?.viewCount),
      postsList
    };
  } catch (_) {
    return null;
  }
}

async function fetchYouTube(username) {
  const baseUrl = `https://www.youtube.com/@${encodeURIComponent(username)}`;
  const videosUrl = `${baseUrl}/videos`;
  const shortsUrl = `${baseUrl}/shorts`;
  const headers = {
    "User-Agent": BROWSER_UA,
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+417"
  };

  try {
    const [officialYt, res, shortsRes] = await Promise.all([
      fetchOfficialYouTubeApi(username),
      fetch(videosUrl, { headers }).catch(() => null),
      fetch(shortsUrl, { headers }).catch(() => null)
    ]);

    let shortsList = [];
    if (shortsRes && shortsRes.ok) {
      const shortsHtml = await shortsRes.text();
      shortsList = extractYouTubeShorts(shortsHtml);
    }

    if (officialYt && officialYt.found) {
      const postsList = officialYt.postsList || [];
      const highlightsList = postsList.slice(0, 6).map(v => ({
        id: v.id,
        title: v.title,
        image: v.image,
        url: v.url
      }));
      return {
        platform: "YouTube",
        apiSource: officialYt.apiSource,
        found: true,
        visibility: "Public Channel",
        name: officialYt.name,
        handle: officialYt.handle.startsWith("@") ? officialYt.handle : `@${officialYt.handle}`,
        avatar: officialYt.avatar,
        bio: officialYt.bio,
        url: baseUrl,
        metrics: [
          { label: "Subscribers", value: officialYt.subscribers },
          { label: "Videos", value: officialYt.videoCount },
          { label: "Total Views", value: officialYt.viewCount }
        ],
        postsList,
        reelsList: shortsList.length > 0 ? shortsList : postsList,
        storiesList: shortsList,
        highlightsList
      };
    }

    if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : 500));
    const html = await res.text();

    const ogTitle = extractMeta(html, "og:title");
    const ogDesc = extractMeta(html, "og:description");
    const ogImage = extractMeta(html, "og:image");

    if (!ogTitle || ogTitle === "YouTube") {
      return notFoundResult("YouTube", username, baseUrl);
    }

    const subMatch = html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"\}/);
    const vidMatch = html.match(/"videosCountText":\{"runs":\[\{"text":"([^"]+)"\}/);

    const subscribers = subMatch
      ? subMatch[1].replace(/\s*subscribers?/i, "")
      : "—";
    const videos = vidMatch ? vidMatch[1] : "—";

    let postsList = extractYouTubeVideos(html);

    if (postsList.length === 0) {
      const channelIdMatch =
        html.match(/"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{20,})"/) ||
        html.match(/channel_id=(UC[A-Za-z0-9_-]{20,})/);
      if (channelIdMatch) {
        postsList = await fetchYouTubeRssVideos(channelIdMatch[1]);
      }
    }

    const highlightsList = postsList.slice(0, 6).map(v => ({
      id: v.id,
      title: v.title,
      image: v.image,
      url: v.url
    }));

    return {
      platform: "YouTube",
      apiSource: "YouTube InnerTube + XML Feed",
      found: true,
      visibility: "Public Channel",
      name: ogTitle.replace(/\s*-\s*YouTube$/i, ""),
      handle: `@${username}`,
      avatar: ogImage,
      bio: ogDesc || "YouTube channel.",
      url: baseUrl,
      metrics: [
        { label: "Subscribers", value: subscribers },
        { label: "Videos", value: videos },
        { label: "Handle", value: `@${username}` }
      ],
      postsList,
      reelsList: shortsList.length > 0 ? shortsList : postsList,
      storiesList: shortsList,
      highlightsList
    };
  } catch (err) {
    return notFoundResult("YouTube", username, baseUrl);
  }
}

function extractYouTubeShorts(html) {
  const shorts = [];
  try {
    const match = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});<\/script>/);
    if (!match) return shorts;
    const data = JSON.parse(match[1]);

    const items = [];
    function walk(obj) {
      if (!obj || typeof obj !== "object" || items.length >= 12) return;
      if (obj.reelItemRenderer && obj.reelItemRenderer.videoId) {
        items.push({ kind: "reelItem", node: obj.reelItemRenderer });
        return;
      }
      if (obj.shortsLockupViewModel && obj.shortsLockupViewModel.entityId) {
        items.push({ kind: "lockup", node: obj.shortsLockupViewModel });
        return;
      }
      for (const k of Object.keys(obj)) {
        walk(obj[k]);
        if (items.length >= 12) break;
      }
    }
    walk(data.contents);

    for (const item of items) {
      if (item.kind === "reelItem") {
        const r = item.node;
        const vid = r.videoId;
        const title = r.headline?.simpleText || "YouTube Short";
        const views = r.viewCountText?.simpleText || "—";
        shorts.push({
          id: vid,
          type: "story",
          isVideo: true,
          embedYoutubeId: vid,
          title: "YouTube Short",
          text: title,
          image: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
          date: "",
          url: `https://www.youtube.com/shorts/${vid}`,
          stats: [{ label: "İzlenme", value: views.replace(/\s*views?/i, "") }]
        });
      } else if (item.kind === "lockup") {
        const l = item.node;
        const vidMatch = (l.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId) ||
          (l.entityId || "").replace(/^shorts-shelf-item-/, "");
        if (!vidMatch) continue;
        const title = l.overlayMetadata?.primaryText?.content || "YouTube Short";
        const views = l.overlayMetadata?.secondaryText?.content || "—";
        shorts.push({
          id: vidMatch,
          type: "story",
          isVideo: true,
          embedYoutubeId: vidMatch,
          title: "YouTube Short",
          text: title,
          image: `https://i.ytimg.com/vi/${vidMatch}/hqdefault.jpg`,
          date: "",
          url: `https://www.youtube.com/shorts/${vidMatch}`,
          stats: [{ label: "İzlenme", value: views.replace(/\s*views?/i, "") }]
        });
      }
    }
  } catch (_) {}
  return shorts;
}

function extractYouTubeVideos(html) {
  const posts = [];
  try {
    const match = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});<\/script>/);
    if (!match) return posts;
    const data = JSON.parse(match[1]);

    const renderers = [];
    function walk(obj) {
      if (!obj || typeof obj !== "object" || renderers.length >= 12) return;
      if (obj.videoRenderer && obj.videoRenderer.videoId) {
        renderers.push(obj.videoRenderer);
        return;
      }
      for (const k of Object.keys(obj)) {
        walk(obj[k]);
        if (renderers.length >= 12) break;
      }
    }
    walk(data.contents);

    for (const vr of renderers) {
      const videoId = vr.videoId;
      const title =
        vr.title?.runs?.[0]?.text || vr.title?.simpleText || "YouTube Video";
      const desc =
        vr.descriptionSnippet?.runs?.map(r => r.text).join("") || "";
      const published = vr.publishedTimeText?.simpleText || "";
      const viewCount =
        vr.viewCountText?.simpleText || vr.shortViewCountText?.simpleText || "—";
      const lengthText = vr.lengthText?.simpleText || "";
      const thumbs = vr.thumbnail?.thumbnails || [];
      const thumb = thumbs.length
        ? thumbs[thumbs.length - 1].url
        : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      posts.push({
        id: videoId,
        type: "reel",
        isVideo: true,
        embedYoutubeId: videoId,
        title,
        text: desc || title,
        image: thumb,
        date: published,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        stats: [
          { label: "Görüntülenme", value: viewCount.replace(/\s*views?/i, "") },
          ...(lengthText ? [{ label: "Süre", value: lengthText }] : [])
        ]
      });
    }
  } catch (_) {}
  return posts;
}

async function fetchYouTubeRssVideos(channelId) {
  const posts = [];
  try {
    const rssRes = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
      { headers: { "User-Agent": BROWSER_UA } }
    );
    if (!rssRes.ok) return posts;
    const xml = await rssRes.text();
    const entries = xml.split(/<entry>/i).slice(1, 13);
    for (const entry of entries) {
      const vidMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i);
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/i);
      const pubMatch = entry.match(/<published>([^<]+)<\/published>/i);
      const descMatch = entry.match(/<media:description>([\s\S]*?)<\/media:description>/i);
      const viewsMatch = entry.match(/views=["'](\d+)["']/i);
      const likesMatch = entry.match(/count=["'](\d+)["']/i);

      if (!vidMatch) continue;
      const videoId = vidMatch[1].trim();
      const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : "YouTube Video";
      const desc = descMatch ? decodeEntities(descMatch[1].trim()) : title;

      posts.push({
        id: videoId,
        type: "reel",
        isVideo: true,
        embedYoutubeId: videoId,
        title,
        text: desc || title,
        image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        date: pubMatch ? formatDate(pubMatch[1]) : "",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        stats: [
          ...(viewsMatch ? [{ label: "Görüntülenme", value: formatCompact(viewsMatch[1]) }] : []),
          ...(likesMatch ? [{ label: "Beğeni", value: formatCompact(likesMatch[1]) }] : [])
        ]
      });
    }
  } catch (_) {}
  return posts;
}

/* --------------------------------------------------------------------------
   5. X (Twitter) Fetcher (Official X API v2 + FxTwitter + Syndication API)
   -------------------------------------------------------------------------- */
async function fetchOfficialXApiV2(username) {
  const bearer = apiConfig.xBearerToken;
  if (!bearer) return null;

  try {
    const headers = {
      Authorization: `Bearer ${bearer}`,
      "User-Agent": "SocialIndex/2.0"
    };

    const userRes = await fetch(
      `https://api.x.com/2/users/by/username/${encodeURIComponent(
        username
      )}?user.fields=description,profile_image_url,public_metrics,protected,verified`,
      { headers }
    );
    if (!userRes.ok) return null;
    const userJson = await userRes.json();
    const u = userJson?.data;
    if (!u || !u.id) return null;

    const tweetsRes = await fetch(
      `https://api.x.com/2/users/${encodeURIComponent(
        u.id
      )}/tweets?max_results=16&tweet.fields=created_at,public_metrics,attachments&expansions=attachments.media_keys&media.fields=url,preview_image_url,type,variants`,
      { headers }
    ).catch(() => null);

    const tweetsList = [];
    if (tweetsRes && tweetsRes.ok) {
      const tJson = await tweetsRes.json();
      const mediaMap = new Map();
      for (const m of tJson?.includes?.media || []) {
        if (m.media_key) mediaMap.set(m.media_key, m);
      }

      for (const t of tJson?.data || []) {
        const firstMediaKey = t.attachments?.media_keys?.[0];
        const mediaObj = firstMediaKey ? mediaMap.get(firstMediaKey) : null;
        const variants = mediaObj?.variants || [];
        const mp4 = variants.find(v => v.content_type === "video/mp4");
        const isVideo = Boolean(mp4 || mediaObj?.type === "video" || mediaObj?.type === "animated_gif");
        const pm = t.public_metrics || {};

        tweetsList.push({
          id: String(t.id),
          type: isVideo ? "reel" : "post",
          isVideo,
          videoUrl: mp4?.url || "",
          rawLikes: Number(pm.like_count || 0),
          title: `@${u.username}`,
          text: t.text || "",
          image: mediaObj?.url || mediaObj?.preview_image_url || "",
          date: formatDate(t.created_at),
          url: `https://x.com/${u.username}/status/${t.id}`,
          stats: [
            { label: "Beğeni", value: formatCompact(pm.like_count) },
            { label: "Retweet", value: formatCompact(pm.retweet_count) },
            { label: "Yanıt", value: formatCompact(pm.reply_count) }
          ]
        });
      }
    }

    const um = u.public_metrics || {};
    return {
      apiSource: "X Official API v2",
      found: true,
      protected: Boolean(u.protected),
      name: u.name || u.username,
      handle: u.username,
      avatar: (u.profile_image_url || "").replace("_normal", "_400x400"),
      bio: u.description || "",
      followers: formatCompact(um.followers_count),
      following: formatCompact(um.following_count),
      tweetsCount: formatCompact(um.tweet_count),
      tweetsList
    };
  } catch (_) {
    return null;
  }
}

async function fetchX(username) {
  const url = `https://x.com/${encodeURIComponent(username)}`;
  try {
    const [officialX, fxRes, syndicationTweets] = await Promise.all([
      fetchOfficialXApiV2(username),
      fetch(`https://api.fxtwitter.com/${encodeURIComponent(username)}`, {
        headers: { "User-Agent": "SocialIndex/1.0" }
      }).catch(() => null),
      fetchXTweets(username)
    ]);

    const tweetsList =
      officialX?.tweetsList?.length > 0 ? officialX.tweetsList : syndicationTweets;
    const mediaTweets = tweetsList.filter(t => t.image || t.isVideo);
    const videoTweets = tweetsList.filter(t => t.isVideo);
    const highlightsList = [...tweetsList]
      .sort((a, b) => (b.rawLikes || 0) - (a.rawLikes || 0))
      .slice(0, 6)
      .map(t => ({
        id: t.id,
        title: t.text ? t.text.slice(0, 18) + "..." : "Popüler Tweet",
        image: t.image || "",
        url: t.url
      }));

    if (officialX && officialX.found) {
      return {
        platform: "X (Twitter)",
        apiSource: officialX.apiSource,
        found: true,
        visibility: officialX.protected ? "Private Account" : "Public Account",
        name: officialX.name,
        handle: `@${officialX.handle}`,
        avatar: officialX.avatar,
        bio: officialX.bio || "No bio set on X.",
        url,
        metrics: [
          { label: "Followers", value: officialX.followers },
          { label: "Following", value: officialX.following },
          { label: "Posts", value: officialX.tweetsCount }
        ],
        postsList: tweetsList,
        reelsList: videoTweets.length > 0 ? videoTweets : mediaTweets,
        storiesList: mediaTweets,
        highlightsList
      };
    }

    if (fxRes && fxRes.ok) {
      const fxData = await fxRes.json();
      if (fxData && fxData.user) {
        const u = fxData.user;
        return {
          platform: "X (Twitter)",
          apiSource: "X Syndication + FxTwitter API",
          found: true,
          visibility: u.protected ? "Private Account" : "Public Account",
          name: u.name || username,
          handle: `@${u.screen_name || username}`,
          avatar: u.avatar_url || "",
          bio: u.description || "No bio set on X.",
          url,
          metrics: [
            { label: "Followers", value: formatCompact(u.followers) },
            { label: "Following", value: formatCompact(u.following) },
            { label: "Posts", value: formatCompact(u.tweets) }
          ],
          postsList: tweetsList,
          reelsList: videoTweets.length > 0 ? videoTweets : mediaTweets,
          storiesList: mediaTweets,
          highlightsList
        };
      }
    }

    const synUrl = `https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${encodeURIComponent(
      username
    )}`;
    const res = await fetch(synUrl, {
      headers: { "User-Agent": BROWSER_UA }
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const u = data[0];
        return {
          platform: "X (Twitter)",
          apiSource: "X Syndication API",
          found: true,
          visibility: u.protected ? "Private Account" : "Public Account",
          name: u.name || username,
          handle: `@${u.screen_name || username}`,
          avatar: `https://unavatar.io/x/${encodeURIComponent(username)}`,
          bio: `X account (@${u.screen_name}) — ${u.formatted_followers_count || "Active profile"}.`,
          url,
          metrics: [
            {
              label: "Followers",
              value: (u.formatted_followers_count || "—").replace(/\s*followers/i, "")
            },
            { label: "Status", value: u.protected ? "Protected" : "Public" },
            { label: "ID", value: u.id || "—" }
          ],
          postsList: tweetsList,
          reelsList: videoTweets.length > 0 ? videoTweets : mediaTweets,
          storiesList: mediaTweets,
          highlightsList
        };
      }
    }

    return notFoundResult("X (Twitter)", username, url);
  } catch (err) {
    return notFoundResult("X (Twitter)", username, url);
  }
}

async function fetchXTweets(username) {
  try {
    const tlUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(username)}`;
    const res = await fetch(tlUrl, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml"
      }
    });
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );
    if (!match) return [];

    const json = JSON.parse(match[1]);
    const entries = json?.props?.pageProps?.timeline?.entries || [];
    const tweets = [];

    for (const entry of entries) {
      const t = entry?.content?.tweet;
      if (!t || tweets.length >= 16) continue;
      const media = t.extended_entities?.media?.[0] || t.entities?.media?.[0];
      const videoVariants = media?.video_info?.variants || [];
      const mp4Variant = videoVariants.find(v => v.content_type === "video/mp4");
      const tweetId = t.id_str || "";
      const screenName = t.user?.screen_name || username;

      tweets.push({
        id: tweetId,
        type: mp4Variant ? "reel" : "post",
        isVideo: Boolean(mp4Variant),
        videoUrl: mp4Variant?.url || "",
        rawLikes: Number(t.favorite_count || 0),
        title: `@${screenName}`,
        text: t.full_text || t.text || "",
        image: media?.media_url_https || "",
        date: formatDate(t.created_at),
        url: tweetId
          ? `https://x.com/${screenName}/status/${tweetId}`
          : `https://x.com/${screenName}`,
        stats: [
          { label: "Beğeni", value: formatCompact(t.favorite_count) },
          { label: "Retweet", value: formatCompact(t.retweet_count) },
          { label: "Yanıt", value: formatCompact(t.reply_count) }
        ]
      });
    }
    return tweets;
  } catch (_) {
    return [];
  }
}

/* --------------------------------------------------------------------------
   6. GitHub Fetcher (Official GitHub REST API v3 + Starred + Gists + Events + README Socials)
   -------------------------------------------------------------------------- */
async function fetchGitHubProfileReadmeSocials(login, ghHeaders) {
  try {
    const readmeRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(login)}/${encodeURIComponent(login)}/readme`,
      { headers: ghHeaders }
    );
    if (!readmeRes.ok) return {};
    const readmeJson = await readmeRes.json();
    const content = readmeJson?.content
      ? Buffer.from(readmeJson.content, "base64").toString("utf8")
      : "";
    const socials = {};
    const igMatch = content.match(/instagram\.com\/([A-Za-z0-9_.-]+)/i);
    if (igMatch && !["p", "reel", "stories"].includes(igMatch[1].toLowerCase())) {
      socials.instagram = igMatch[1];
    }
    const xMatch = content.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]+)/i);
    if (xMatch && !["intent", "share", "home"].includes(xMatch[1].toLowerCase())) {
      socials.x = xMatch[1];
    }
    const ytMatch = content.match(/youtube\.com\/@([A-Za-z0-9_.-]+)/i);
    if (ytMatch) socials.youtube = ytMatch[1];
    const ttMatch = content.match(/tiktok\.com\/@([A-Za-z0-9_.-]+)/i);
    if (ttMatch) socials.tiktok = ttMatch[1];
    const thMatch = content.match(/threads\.(?:net|com)\/@([A-Za-z0-9_.-]+)/i);
    if (thMatch) socials.threads = thMatch[1];
    const bskyMatch = content.match(/bsky\.app\/profile\/([A-Za-z0-9_.-]+)/i);
    if (bskyMatch) socials.bluesky = bskyMatch[1];
    return socials;
  } catch (_) {
    return {};
  }
}

async function fetchGitHub(username) {
  const url = `https://github.com/${encodeURIComponent(username)}`;
  const ghHeaders = {
    "User-Agent": "SocialIndex/2.0",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (apiConfig.githubToken) {
    ghHeaders.Authorization = `Bearer ${apiConfig.githubToken}`;
  }

  try {
    let userRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: ghHeaders
    });

    // If direct username lookup fails, search GitHub users API (`GET /search/users?q=`)
    let targetUser = username;
    if (!userRes.ok) {
      const searchRes = await fetch(
        `https://api.github.com/search/users?q=${encodeURIComponent(username)}&per_page=1`,
        { headers: ghHeaders }
      ).catch(() => null);
      if (searchRes && searchRes.ok) {
        const searchJson = await searchRes.json();
        if (searchJson?.items?.[0]?.login) {
          targetUser = searchJson.items[0].login;
          userRes = await fetch(
            `https://api.github.com/users/${encodeURIComponent(targetUser)}`,
            { headers: ghHeaders }
          );
        }
      }
    }

    if (!userRes.ok) throw new Error("Not found");
    const d = await userRes.json();
    const login = d.login || targetUser;

    const [reposRes, eventsRes, starredRes, gistsRes, socialAccountsRes, readmeSocials] =
      await Promise.all([
        fetch(
          `https://api.github.com/users/${encodeURIComponent(login)}/repos?sort=updated&per_page=16`,
          { headers: ghHeaders }
        ).catch(() => null),
        fetch(
          `https://api.github.com/users/${encodeURIComponent(login)}/events/public?per_page=14`,
          { headers: ghHeaders }
        ).catch(() => null),
        fetch(
          `https://api.github.com/users/${encodeURIComponent(login)}/starred?per_page=12`,
          { headers: ghHeaders }
        ).catch(() => null),
        fetch(
          `https://api.github.com/users/${encodeURIComponent(login)}/gists?per_page=10`,
          { headers: ghHeaders }
        ).catch(() => null),
        fetch(
          `https://api.github.com/users/${encodeURIComponent(login)}/social_accounts`,
          { headers: ghHeaders }
        ).catch(() => null),
        fetchGitHubProfileReadmeSocials(login, ghHeaders)
      ]);

    // Extract linked social handles from GitHub API (`/users/{login}/social_accounts`, `twitter_username`, `blog`, and README)
    const discoveredSocials = { ...readmeSocials };
    if (d.twitter_username) {
      discoveredSocials.x = d.twitter_username.replace(/^@/, "");
    }
    if (d.blog) {
      const blogStr = d.blog;
      const igM = blogStr.match(/instagram\.com\/([A-Za-z0-9_.-]+)/i);
      if (igM) discoveredSocials.instagram = igM[1];
      const ytM = blogStr.match(/youtube\.com\/@([A-Za-z0-9_.-]+)/i);
      if (ytM) discoveredSocials.youtube = ytM[1];
    }
    if (socialAccountsRes && socialAccountsRes.ok) {
      const socArr = await socialAccountsRes.json().catch(() => []);
      if (Array.isArray(socArr)) {
        for (const s of socArr) {
          const u = s.url || "";
          const igM = u.match(/instagram\.com\/([A-Za-z0-9_.-]+)/i);
          if (igM) discoveredSocials.instagram = igM[1];
          const xM = u.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]+)/i);
          if (xM) discoveredSocials.x = xM[1];
          const ytM = u.match(/youtube\.com\/@([A-Za-z0-9_.-]+)/i);
          if (ytM) discoveredSocials.youtube = ytM[1];
          const ttM = u.match(/tiktok\.com\/@([A-Za-z0-9_.-]+)/i);
          if (ttM) discoveredSocials.tiktok = ttM[1];
          const thM = u.match(/threads\.(?:net|com)\/@([A-Za-z0-9_.-]+)/i);
          if (thM) discoveredSocials.threads = thM[1];
          const bsM = u.match(/bsky\.app\/profile\/([A-Za-z0-9_.-]+)/i);
          if (bsM) discoveredSocials.bluesky = bsM[1];
        }
      }
    }

    let postsList = [];
    let highlightsList = [];
    let reelsList = [];

    if (reposRes && reposRes.ok) {
      const repos = await reposRes.json();
      if (Array.isArray(repos)) {
        postsList = repos.slice(0, 16).map(r => ({
          id: String(r.id),
          type: "post",
          isVideo: false,
          rawStars: Number(r.stargazers_count || 0),
          title: r.full_name || r.name,
          text:
            (r.description || "Açıklama girilmemiş GitHub deposu.") +
            (Array.isArray(r.topics) && r.topics.length
              ? ` • #${r.topics.slice(0, 4).join(" #")}`
              : ""),
          image: `https://opengraph.githubassets.com/1/${encodeURIComponent(login)}/${encodeURIComponent(r.name)}`,
          date: formatDate(r.updated_at || r.pushed_at),
          url: r.html_url,
          stats: [
            { label: "⭐ Yıldız", value: formatCompact(r.stargazers_count) },
            { label: "🍴 Fork", value: formatCompact(r.forks_count) },
            { label: "💻 Dil", value: r.language || "—" }
          ]
        }));

        highlightsList = [...repos]
          .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
          .slice(0, 8)
          .map(r => ({
            id: String(r.id),
            title: `⭐ ${formatCompact(r.stargazers_count)} ${r.name}`,
            image: `https://opengraph.githubassets.com/1/${encodeURIComponent(login)}/${encodeURIComponent(r.name)}`,
            url: r.html_url
          }));
      }
    }

    // Starred Repositories & Gists for the 4th tab (Reels / Starred & Gists)
    if (starredRes && starredRes.ok) {
      const starred = await starredRes.json().catch(() => []);
      if (Array.isArray(starred)) {
        reelsList.push(
          ...starred.slice(0, 8).map(r => ({
            id: `star-${r.id}`,
            type: "post",
            isVideo: false,
            title: `⭐ Yıldızlanan: ${r.full_name || r.name}`,
            text: r.description || `@${login} tarafından yıldızlanan GitHub projesi.`,
            image: r.owner?.login
              ? `https://opengraph.githubassets.com/1/${encodeURIComponent(r.owner.login)}/${encodeURIComponent(r.name)}`
              : d.avatar_url || "",
            date: formatDate(r.updated_at),
            url: r.html_url,
            stats: [
              { label: "⭐ Yıldız", value: formatCompact(r.stargazers_count) },
              { label: "💻 Dil", value: r.language || "—" }
            ]
          }))
        );
      }
    }

    if (gistsRes && gistsRes.ok) {
      const gists = await gistsRes.json().catch(() => []);
      if (Array.isArray(gists)) {
        reelsList.push(
          ...gists.slice(0, 6).map(g => {
            const firstFile = Object.keys(g.files || {})[0] || "gistfile1.txt";
            return {
              id: `gist-${g.id}`,
              type: "post",
              isVideo: false,
              title: `📝 Gist: ${firstFile}`,
              text: g.description || `@${login} tarafından paylaşılan kod parçacığı (Gist).`,
              image: d.avatar_url || "",
              date: formatDate(g.created_at),
              url: g.html_url,
              stats: [{ label: "Yorum", value: formatCompact(g.comments) }]
            };
          })
        );
      }
    }

    let storiesList = [];
    if (eventsRes && eventsRes.ok) {
      const events = await eventsRes.json();
      if (Array.isArray(events)) {
        storiesList = events.slice(0, 12).map(ev => {
          const repoName = ev.repo?.name || login;
          const commitMsg =
            ev.payload?.commits?.[0]?.message ||
            ev.payload?.release?.name ||
            ev.payload?.issue?.title ||
            ev.payload?.pull_request?.title ||
            "";
          return {
            id: String(ev.id),
            type: "story",
            isVideo: false,
            title: `⚡ ${ev.type.replace(/Event$/, "")} • ${repoName}`,
            text: commitMsg || `@${login} tarafından ${repoName} üzerinde aktivite gerçekleştirildi.`,
            image: `https://opengraph.githubassets.com/1/${repoName}`,
            date: formatDate(ev.created_at),
            url: `https://github.com/${repoName}`,
            stats: [{ label: "Etkinlik", value: ev.type.replace(/Event$/, "") }]
          };
        });
      }
    }

    const extraBioParts = [];
    if (d.bio) extraBioParts.push(d.bio);
    if (d.company) extraBioParts.push(`🏢 ${d.company}`);
    if (d.location) extraBioParts.push(`📍 ${d.location}`);
    if (d.blog) extraBioParts.push(`🔗 ${d.blog}`);

    return {
      platform: "GitHub",
      apiSource: apiConfig.githubToken ? "GitHub REST API v3 (Auth)" : "GitHub REST API v3",
      found: true,
      visibility: d.type === "Organization" ? "GitHub Organization" : "Public Developer Profile",
      name: d.name || login,
      handle: `@${login}`,
      avatar: d.avatar_url || "",
      bio: extraBioParts.join(" • ") || "GitHub geliştirici profili.",
      url: d.html_url || url,
      discoveredSocials,
      metrics: [
        { label: "Followers", value: formatCompact(d.followers) },
        { label: "Following", value: formatCompact(d.following) },
        { label: "Public Repos", value: formatCompact(d.public_repos) }
      ],
      postsList,
      reelsList: reelsList.length > 0 ? reelsList : postsList.slice(0, 6),
      storiesList,
      highlightsList
    };
  } catch (err) {
    return notFoundResult("GitHub", username, url);
  }
}

/* --------------------------------------------------------------------------
   7. Bluesky Fetcher (Official AT Protocol XRPC API: public.api.bsky.app)
   -------------------------------------------------------------------------- */
async function fetchBluesky(username) {
  const clean = username.trim().replace(/^@/, "");
  let actor = clean.includes(".") ? clean : `${clean}.bsky.social`;
  const defaultUrl = `https://bsky.app/profile/${encodeURIComponent(actor)}`;

  try {
    let profileRes = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`
    );

    if (!profileRes.ok && !clean.includes(".")) {
      const searchRes = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=${encodeURIComponent(clean)}&limit=5`
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const best = (searchData.actors || []).find(
          a =>
            a.handle?.split(".")[0]?.toLowerCase() === clean.toLowerCase() ||
            a.displayName?.toLowerCase() === clean.toLowerCase()
        );
        if (best && best.handle) {
          actor = best.handle;
          profileRes = await fetch(
            `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`
          );
        }
      }
    }

    if (!profileRes.ok) throw new Error("Not found");
    const d = await profileRes.json();

    const feedRes = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(d.handle)}&limit=16`
    ).catch(() => null);

    let postsList = [];
    if (feedRes && feedRes.ok) {
      const feedData = await feedRes.json();
      const feedItems = feedData?.feed || [];
      postsList = feedItems.slice(0, 16).map(item => {
        const post = item.post || {};
        const record = post.record || {};
        const embedImages = post.embed?.images || post.embed?.media?.images || [];
        const thumb =
          embedImages[0]?.thumb ||
          embedImages[0]?.fullsize ||
          post.embed?.thumbnail ||
          "";
        const playlist = post.embed?.playlist || "";
        const isVideo = Boolean(playlist || post.embed?.$type?.includes("video"));
        const rkey = (post.uri || "").split("/").pop();
        const postUrl = rkey
          ? `https://bsky.app/profile/${d.handle}/post/${rkey}`
          : `https://bsky.app/profile/${d.handle}`;

        return {
          id: post.cid || rkey,
          type: isVideo ? "reel" : "post",
          isVideo,
          rawLikes: Number(post.likeCount || 0),
          title: `@${d.handle}`,
          text: record.text || "Bluesky gönderisi",
          image: thumb,
          date: formatDate(record.createdAt || post.indexedAt),
          url: postUrl,
          stats: [
            { label: "Beğeni", value: formatCompact(post.likeCount) },
            { label: "Repost", value: formatCompact(post.repostCount) },
            { label: "Yanıt", value: formatCompact(post.replyCount) }
          ]
        };
      });
    }

    const mediaPosts = postsList.filter(p => p.image || p.isVideo);
    const highlightsList = [...postsList]
      .sort((a, b) => (b.rawLikes || 0) - (a.rawLikes || 0))
      .slice(0, 6)
      .map(p => ({
        id: p.id,
        title: `❤️ ${formatCompact(p.rawLikes)}`,
        image: p.image || d.avatar || "",
        url: p.url
      }));

    return {
      platform: "Bluesky",
      apiSource: "ATProto XRPC API",
      found: true,
      visibility: "Public Profile",
      name: d.displayName || d.handle,
      handle: `@${d.handle}`,
      avatar: d.avatar || "",
      bio: d.description || "No bio provided on Bluesky.",
      url: `https://bsky.app/profile/${d.handle}`,
      metrics: [
        { label: "Followers", value: formatCompact(d.followersCount) },
        { label: "Following", value: formatCompact(d.followsCount) },
        { label: "Posts", value: formatCompact(d.postsCount) }
      ],
      postsList,
      reelsList: mediaPosts,
      storiesList: mediaPosts.slice(0, 6),
      highlightsList
    };
  } catch (err) {
    return notFoundResult("Bluesky", username, defaultUrl);
  }
}

function notFoundResult(platform, username, url) {
  return {
    platform,
    found: false,
    visibility: "Not Found",
    name: username,
    handle: `@${username}`,
    avatar: "",
    bio: `No ${platform} account found for @${username}.`,
    url,
    metrics: [
      { label: "Followers", value: "—" },
      { label: "Following", value: "—" },
      { label: "Posts", value: "—" }
    ],
    postsList: [],
    reelsList: [],
    storiesList: [],
    highlightsList: []
  };
}

/* --------------------------------------------------------------------------
   HTTP Server (/api/config, /api/lookup, /api/media, /api/avatar)
   -------------------------------------------------------------------------- */
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

  // Official Developer APIs Config Endpoint (GET & POST /api/config)
  if (parsedUrl.pathname === "/api/config") {
    if (req.method === "GET") {
      const masked = {};
      for (const [k, v] of Object.entries(apiConfig)) {
        if (!v) {
          masked[k] = "";
        } else if (k === "igBusinessUserId") {
          masked[k] = v;
        } else {
          masked[k] = v.length > 8 ? `${v.slice(0, 4)}••••••••${v.slice(-3)}` : "••••••••";
        }
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify(masked));
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", chunk => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const cleanUpdate = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string" && !v.includes("••••")) {
              cleanUpdate[k] = v.trim();
            }
          }
          saveApiConfig(cleanUpdate);
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
      });
      return;
    }
  }

  if (parsedUrl.pathname === "/api/avatar" || parsedUrl.pathname === "/api/media") {
    const mediaUrl = parsedUrl.searchParams.get("url");
    const shouldDownload = parsedUrl.searchParams.get("dl") === "1";
    if (!mediaUrl) {
      res.writeHead(400);
      return res.end();
    }
    try {
      const mediaRes = await fetch(mediaUrl, {
        headers: {
          "User-Agent": BROWSER_UA,
          Referer: "https://www.instagram.com/"
        }
      });
      if (!mediaRes.ok) throw new Error("Media fetch failed");
      const contentType = mediaRes.headers.get("content-type") || "image/jpeg";
      const arrayBuf = await mediaRes.arrayBuffer();
      const headers = {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600"
      };
      if (shouldDownload) {
        const ext = contentType.includes("video") ? "mp4" : "jpg";
        headers["Content-Disposition"] = `attachment; filename="social-index-media.${ext}"`;
      }
      res.writeHead(200, headers);
      return res.end(Buffer.from(arrayBuf));
    } catch (e) {
      res.writeHead(404);
      return res.end();
    }
  }

  if (parsedUrl.pathname === "/api/lookup") {
    const rawUser = (parsedUrl.searchParams.get("username") || "").trim().replace(/^@/, "");
    if (!rawUser) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Username is required" }));
    }

    // 1. Primary Anchor: Fetch GitHub first to discover linked social handles (social_accounts, twitter_username, README)
    const ghAccount = await fetchGitHub(rawUser);
    const linked = ghAccount.discoveredSocials || {};

    const igHandle = linked.instagram || rawUser;
    const thHandle = linked.threads || linked.instagram || rawUser;
    const xHandle = linked.x || rawUser;
    const ttHandle = linked.tiktok || rawUser;
    const ytHandle = linked.youtube || rawUser;
    const bskyHandle = linked.bluesky || rawUser;

    const igPromise = fetchInstagram(igHandle);

    const [igAcc, thAcc, xAcc, ttAcc, ytAcc, bskyAcc] = await Promise.all([
      igPromise,
      fetchThreads(thHandle, igPromise),
      fetchX(xHandle),
      fetchTikTok(ttHandle),
      fetchYouTube(ytHandle),
      fetchBluesky(bskyHandle)
    ]);

    // GitHub-first ordering in response
    const accounts = [ghAccount, igAcc, thAcc, xAcc, ttAcc, ytAcc, bskyAcc];

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    return res.end(JSON.stringify({ username: rawUser, accounts }));
  }

  let filePath = parsedUrl.pathname === "/" ? "/index.html" : parsedUrl.pathname;
  const fullPath = path.join(__dirname, filePath);
  const baseName = path.basename(fullPath).toLowerCase();

  // Never serve local configuration, secret, or git files over HTTP
  if (
    !fullPath.startsWith(__dirname) ||
    baseName === "api-config.json" ||
    baseName.startsWith(".env") ||
    baseName.startsWith(".git")
  ) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "text/plain" });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`SOCIAL INDEX running at http://localhost:${PORT}`);
});
