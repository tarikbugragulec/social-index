/* ==========================================================================
   SOCIAL INDEX — AnonyIG Style Account, Stories, Highlights, Reels & Posts UI
   ========================================================================== */

const RECENT_STORAGE_KEY = "social_index_recent_v4";
const DEFAULT_HANDLES = ["torvalds", "yyx990803", "gaearon", "sindresorhus", "shadcn"];

let recentHandles = [];
let currentUsername = "";
let currentAccounts = [];
let activeModalAccount = null;
let activeModalTab = "posts";

document.addEventListener("DOMContentLoaded", () => {
  loadRecentHandles();
  bindEvents();

  const initial = recentHandles[0] || "torvalds";
  document.getElementById("usernameInput").value = initial;
  lookupAccounts(initial);
});

function loadRecentHandles() {
  try {
    const saved = localStorage.getItem(RECENT_STORAGE_KEY);
    recentHandles = saved ? JSON.parse(saved) : [...DEFAULT_HANDLES];
  } catch (e) {
    recentHandles = [...DEFAULT_HANDLES];
  }
  renderRecentChips();
}

function saveRecentHandle(handle) {
  const clean = handle.trim().replace(/^@/, "").toLowerCase();
  if (!clean) return;
  recentHandles = recentHandles.filter(h => h.toLowerCase() !== clean);
  recentHandles.unshift(clean);
  recentHandles = recentHandles.slice(0, 6);
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentHandles));
  } catch (e) {}
  renderRecentChips();
}

function renderRecentChips() {
  const container = document.getElementById("recentChips");
  if (!container) return;

  container.innerHTML = recentHandles
    .map(
      h => `
      <button type="button" class="recent-chip ${h === currentUsername ? "is-active" : ""}" data-handle="${escapeHtml(h)}">
        @${escapeHtml(h)}
      </button>
    `
    )
    .join("");

  container.querySelectorAll("[data-handle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const h = btn.getAttribute("data-handle");
      document.getElementById("usernameInput").value = h;
      lookupAccounts(h);
    });
  });
}

function bindEvents() {
  const form = document.getElementById("lookupForm");
  form.addEventListener("submit", e => {
    e.preventDefault();
    const raw = document.getElementById("usernameInput").value.trim();
    if (!raw) return;
    lookupAccounts(raw);
  });

    // Modal close & tab switching listeners
  const modal = document.getElementById("accountModal");
  if (modal) {
    modal.addEventListener("click", e => {
      if (e.target === modal || e.target.closest("[data-close-modal]")) {
        closeAccountModal();
        return;
      }

      const tabBtn = e.target.closest("[data-modal-tab]");
      if (tabBtn && activeModalAccount) {
        activeModalTab = tabBtn.getAttribute("data-modal-tab");
        renderModalBody(activeModalAccount);
      }
    });
  }

  // Official API Configuration Modal listeners
  const openApiBtn = document.getElementById("openApiConfigBtn");
  const closeApiBtn = document.getElementById("closeApiConfigBtn");
  const apiModal = document.getElementById("apiConfigModal");
  const apiForm = document.getElementById("apiConfigForm");

  if (openApiBtn && apiModal) {
    openApiBtn.addEventListener("click", () => openApiConfigModal());
  }
  if (closeApiBtn && apiModal) {
    closeApiBtn.addEventListener("click", () => closeApiConfigModal());
  }
  if (apiModal) {
    apiModal.addEventListener("click", e => {
      if (e.target === apiModal) closeApiConfigModal();
    });
  }
  if (apiForm) {
    apiForm.addEventListener("submit", async e => {
      e.preventDefault();
      await saveApiConfigForm();
    });
  }

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeAccountModal();
      closeApiConfigModal();
    }
  });
}

async function openApiConfigModal() {
  const modal = document.getElementById("apiConfigModal");
  if (!modal) return;
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const cfg = await res.json();
      const fields = [
        "metaAccessToken",
        "igBusinessUserId",
        "threadsAccessToken",
        "metaAppToken",
        "youtubeApiKey",
        "xBearerToken",
        "tiktokAccessToken",
        "githubToken"
      ];
      fields.forEach(k => {
        const el = document.getElementById(`cfg_${k}`);
        if (el && cfg[k] !== undefined) {
          el.value = cfg[k];
        }
      });
    }
  } catch (_) {}
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeApiConfigModal() {
  const modal = document.getElementById("apiConfigModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

async function saveApiConfigForm() {
  const statusEl = document.getElementById("apiConfigStatus");
  const payload = {
    metaAccessToken: document.getElementById("cfg_metaAccessToken")?.value.trim() || "",
    igBusinessUserId: document.getElementById("cfg_igBusinessUserId")?.value.trim() || "",
    threadsAccessToken: document.getElementById("cfg_threadsAccessToken")?.value.trim() || "",
    metaAppToken: document.getElementById("cfg_metaAppToken")?.value.trim() || "",
    youtubeApiKey: document.getElementById("cfg_youtubeApiKey")?.value.trim() || "",
    xBearerToken: document.getElementById("cfg_xBearerToken")?.value.trim() || "",
    tiktokAccessToken: document.getElementById("cfg_tiktokAccessToken")?.value.trim() || "",
    githubToken: document.getElementById("cfg_githubToken")?.value.trim() || ""
  };

  try {
    if (statusEl) statusEl.textContent = "API yapılandırması kaydediliyor...";
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      if (statusEl) {
        statusEl.textContent = "✓ Resmi API anahtarları kaydedildi! Sorgu yenileniyor...";
      }
      setTimeout(() => {
        closeApiConfigModal();
        if (currentUsername) lookupAccounts(currentUsername);
      }, 500);
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = "Kaydedilirken hata oluştu.";
  }
}

async function lookupAccounts(rawInput) {
  const clean = rawInput.trim().replace(/^@/, "");
  if (!clean) return;

  currentUsername = clean.toLowerCase();
  saveRecentHandle(clean);

  const submitBtn = document.getElementById("submitBtn");
  const statusText = document.getElementById("statusText");
  const grid = document.getElementById("accountsGrid");

  submitBtn.disabled = true;
  submitBtn.textContent = "Yükleniyor...";
  statusText.textContent = `@${clean} için tüm hesaplar, gönderiler, hikayeler (stories) ve öne çıkanlar getiriliyor...`;

  grid.innerHTML = ["GitHub", "Instagram", "Threads", "X (Twitter)", "TikTok", "YouTube", "Bluesky"]
    .map(
      plat => `
      <article class="account-card">
        <div class="card-top">
          <span class="platform-badge">${plat}</span>
          <span class="status-pill missing">Yükleniyor...</span>
        </div>
        <p style="font-size:0.88rem; color:var(--text-muted);">${plat} üzerinde @${escapeHtml(clean)} aranıyor...</p>
      </article>
    `
    )
    .join("");

  try {
    const res = await fetch(`/api/lookup?username=${encodeURIComponent(clean)}`);
    if (!res.ok) throw new Error("Server lookup failed");
    const data = await res.json();

    currentAccounts = data.accounts || [];
    const foundCount = currentAccounts.filter(a => a.found).length;
    statusText.textContent = `@${clean} için ${currentAccounts.length} platformdan ${foundCount} hesap bulundu. Gönderileri, Hikayeleri (Stories) ve Reels videolarını görmek için karta tıklayın.`;

    grid.innerHTML = currentAccounts
      .map((acc, idx) => renderAccountCard(acc, idx))
      .join("");

    // Bind click events on cards and inline toggle buttons
    grid.querySelectorAll(".account-card[data-index]").forEach(card => {
      card.addEventListener("click", e => {
        if (e.target.closest(".external-link")) return;

        const idx = Number(card.getAttribute("data-index"));
        const acc = currentAccounts[idx];
        if (!acc) return;

        // Quick tab button on card (Stories / Posts / Highlights / Reels)
        const quickTabBtn = e.target.closest("[data-open-tab]");
        if (quickTabBtn) {
          e.stopPropagation();
          const targetTab = quickTabBtn.getAttribute("data-open-tab");
          openAccountModal(acc, targetTab);
          return;
        }

        // Inline preview toggle button
        if (e.target.closest("[data-toggle-inline]")) {
          e.stopPropagation();
          const drawer = card.querySelector(".inline-posts-drawer");
          const btn = card.querySelector("[data-toggle-inline]");
          if (drawer) {
            const isOpen = drawer.classList.toggle("is-open");
            if (btn) {
              btn.textContent = isOpen
                ? "Önizlemeyi Gizle ▲"
                : `Kartta Önizle ▼`;
            }
          }
          return;
        }

        openAccountModal(acc);
      });
    });
  } catch (err) {
    statusText.textContent = `Yerel sunucuya bağlanılamadı. http://localhost:3000 adresinin açık olduğundan emin olun.`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Hesapları Getir";
  }
}

function getProxiedImage(url) {
  if (!url) return "";
  return `/api/avatar?url=${encodeURIComponent(url)}`;
}

function getDownloadUrl(url) {
  if (!url) return "#";
  return `/api/media?url=${encodeURIComponent(url)}&dl=1`;
}

function renderAccountCard(acc, idx) {
  const initials = (acc.name || acc.handle || "?")
    .replace(/^@/, "")
    .slice(0, 2)
    .toUpperCase();

  const proxiedAvatar = getProxiedImage(acc.avatar);

  const avatarHtml = proxiedAvatar
    ? `<img src="${proxiedAvatar}" alt="${escapeHtml(acc.name)}" class="avatar" onerror="this.outerHTML='<div class=\\'avatar\\'>${initials}</div>'" />`
    : `<div class="avatar">${initials}</div>`;

  const metricsHtml = (acc.metrics || [])
    .map(
      m => `
      <div class="metric-item">
        <span class="metric-label">${escapeHtml(m.label)}</span>
        <span class="metric-value num">${escapeHtml(String(m.value))}</span>
      </div>
    `
    )
    .join("");

  const posts = acc.postsList || [];
  const stories = acc.storiesList || [];
  const highlights = acc.highlightsList || [];
  const reels = acc.reelsList || [];
  const totalMediaCount = posts.length + stories.length + highlights.length;

  const isGitHub = acc.platform === "GitHub";
  const postsLabel = isGitHub ? "📦 Depolar (Repos)" : "📷 Gönderiler";
  const storiesLabel = isGitHub ? "⚡ Aktiviteler (Events)" : "⭕ Hikayeler";
  const highlightsLabel = isGitHub ? "⭐ En Çok Yıldız" : "✨ Öne Çıkanlar";
  const reelsLabel = isGitHub ? "📝 Yıldızlanan & Gists" : "🎬 Reels / Video";

  // AnonyIG-style Quick Category Pills on EVERY found card across all platforms
  const quickPillsHtml = acc.found
    ? `
      <div class="anony-quick-pills">
        <button type="button" class="anony-pill" data-open-tab="posts">
          ${postsLabel} ${posts.length ? `(${posts.length})` : ""}
        </button>
        <button type="button" class="anony-pill" data-open-tab="stories">
          ${storiesLabel} ${stories.length ? `(${stories.length})` : ""}
        </button>
        <button type="button" class="anony-pill" data-open-tab="highlights">
          ${highlightsLabel} ${highlights.length ? `(${highlights.length})` : ""}
        </button>
        <button type="button" class="anony-pill" data-open-tab="reels">
          ${reelsLabel} ${reels.length ? `(${reels.length})` : ""}
        </button>
      </div>
    `
    : "";

  // Inline thumbnail strip directly visible on the card if posts or stories exist
  const previewItems = [...stories.slice(0, 2), ...posts.slice(0, 4)].slice(0, 4);
  const inlineStripHtml =
    previewItems.length > 0
      ? `
      <div class="card-media-strip">
        ${previewItems
          .map(item => {
            const thumb = item.image ? getProxiedImage(item.image) : "";
            return `
              <div class="strip-thumb-item" title="${escapeHtml(item.text || item.title)}">
                ${
                  thumb
                    ? `<img src="${thumb}" alt="" loading="lazy" onerror="this.parentElement.classList.add('no-img')" />`
                    : `<span class="strip-text-fallback">${escapeHtml((item.title || item.text || "Post").slice(0, 24))}</span>`
                }
                ${item.type === "story" ? `<span class="strip-badge">STORY</span>` : ""}
                ${item.isVideo ? `<span class="strip-badge">▶</span>` : ""}
              </div>
            `;
          })
          .join("")}
      </div>
    `
      : "";

  const inlinePostsHtml =
    posts.length > 0
      ? `
      <div class="inline-posts-drawer">
        <div class="inline-posts-list">
          ${posts
            .slice(0, 4)
            .map(p => renderCompactPostItem(p))
            .join("")}
        </div>
        <button type="button" class="btn-view-all-modal">
          AnonyIG Görünümünde Tümünü Aç (${totalMediaCount}) →
        </button>
      </div>
    `
      : "";

  return `
    <article class="account-card ${acc.found ? "is-clickable" : "is-not-found"}" data-index="${idx}" title="Gönderileri, hikayeleri ve öne çıkanları görmek için tıklayın">
      <div>
        <div class="card-top">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span class="platform-badge">${escapeHtml(acc.platform)}</span>
            ${
              acc.apiSource
                ? `<span class="api-source-badge" title="Veri Kaynağı API">${escapeHtml(acc.apiSource)}</span>`
                : ""
            }
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            ${
              stories.length > 0
                ? `<span class="posts-count-badge story-active-badge">${stories.length} Aktif Hikaye</span>`
                : ""
            }
            ${
              posts.length > 0
                ? `<span class="posts-count-badge">${posts.length} İçerik</span>`
                : ""
            }
            <span class="status-pill ${acc.found ? "found" : "missing"}">
              ${escapeHtml(acc.visibility || (acc.found ? "Found" : "Not Found"))}
            </span>
          </div>
        </div>

        <div class="identity-row" style="margin-top: 14px;">
          ${avatarHtml}
          <div class="identity-text">
            <h2 class="account-name">${escapeHtml(acc.name)}</h2>
            <div class="account-handle">${escapeHtml(acc.handle)}</div>
          </div>
        </div>

        <p class="account-bio" style="margin-top: 12px;">
          ${escapeHtml(acc.bio)}
        </p>
      </div>

      <div>
        <div class="metrics-strip">
          ${metricsHtml}
        </div>

        ${quickPillsHtml}
        ${inlineStripHtml}
        ${inlinePostsHtml}

        <div class="card-footer" style="margin-top: 14px;">
          <div class="card-actions-left">
            <span class="click-hint-btn">
              ${
                acc.found
                  ? "Gönderiler • Hikayeler • Reels Aç"
                  : "Profili İncele"
              }
            </span>
            ${
              posts.length > 0
                ? `<button type="button" class="inline-toggle-btn" data-toggle-inline="1">Kartta Önizle ▼</button>`
                : ""
            }
          </div>
          <a href="${escapeHtml(acc.url)}" target="_blank" rel="noopener noreferrer" class="external-link">
            Profile Git ↗
          </a>
        </div>
      </div>
    </article>
  `;
}

function renderCompactPostItem(post) {
  const thumb = post.image ? getProxiedImage(post.image) : "";
  return `
    <div class="compact-post-item">
      ${
        thumb
          ? `<img src="${thumb}" alt="" class="compact-post-thumb" loading="lazy" onerror="this.style.display='none'" />`
          : ""
      }
      <div class="compact-post-content">
        <div class="compact-post-title">${escapeHtml(post.title || "Gönderi")}</div>
        <div class="compact-post-text">${escapeHtml(post.text || "")}</div>
        ${
          post.date
            ? `<div class="compact-post-meta">${escapeHtml(post.date)}</div>`
            : ""
        }
      </div>
    </div>
  `;
}

function getLiveEmbedConfig(acc) {
  const cleanHandle = (acc.handle || currentUsername || "").replace(/^@/, "");
  if (!acc.found || !cleanHandle) return null;

  const isPrivate = /private/i.test(acc.visibility || "");
  if (isPrivate) return null;

  if (acc.platform === "Instagram" || acc.platform === "Threads") {
    return {
      title: "Instagram Canlı Profil & Gönderi Izgarası",
      src: `https://www.instagram.com/${encodeURIComponent(cleanHandle)}/embed/`
    };
  }
  if (acc.platform === "X (Twitter)") {
    return {
      title: "X (Twitter) Canlı Zaman Akışı",
      src: `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(cleanHandle)}`
    };
  }
  if (acc.platform === "TikTok") {
    return {
      title: "TikTok Canlı Oluşturucu Gönderileri",
      src: `https://www.tiktok.com/embed/@${encodeURIComponent(cleanHandle)}`
    };
  }
  return null;
}

function openAccountModal(acc, initialTab = null) {
  const modal = document.getElementById("accountModal");
  const header = document.getElementById("modalHeader");
  const body = document.getElementById("modalBody");
  if (!modal || !header || !body) return;

  activeModalAccount = acc;

  const posts = acc.postsList || [];
  const stories = acc.storiesList || [];
  const highlights = acc.highlightsList || [];
  const reels = acc.reelsList || [];
  const embedConfig = getLiveEmbedConfig(acc);

  if (initialTab) {
    activeModalTab = initialTab;
  } else if (posts.length > 0) {
    activeModalTab = "posts";
  } else if (stories.length > 0) {
    activeModalTab = "stories";
  } else if (reels.length > 0) {
    activeModalTab = "reels";
  } else if (highlights.length > 0) {
    activeModalTab = "highlights";
  } else if (embedConfig) {
    activeModalTab = "live";
  } else {
    activeModalTab = "posts";
  }

  const initials = (acc.name || acc.handle || "?")
    .replace(/^@/, "")
    .slice(0, 2)
    .toUpperCase();
  const proxiedAvatar = getProxiedImage(acc.avatar);
  const avatarHtml = proxiedAvatar
    ? `<img src="${proxiedAvatar}" alt="${escapeHtml(acc.name)}" class="avatar avatar-lg" onerror="this.outerHTML='<div class=\\'avatar avatar-lg\\'>${initials}</div>'" />`
    : `<div class="avatar avatar-lg">${initials}</div>`;

  header.innerHTML = `
    <div class="modal-identity">
      ${avatarHtml}
      <div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span class="platform-badge">${escapeHtml(acc.platform)}</span>
          <span class="status-pill ${acc.found ? "found" : "missing"}">
            ${escapeHtml(acc.visibility || (acc.found ? "Found" : "Not Found"))}
          </span>
        </div>
        <h2 id="modalTitle" class="modal-title">${escapeHtml(acc.name)}</h2>
        <div class="account-handle">${escapeHtml(acc.handle)}</div>
      </div>
    </div>
    <div class="modal-header-actions">
      <a href="${escapeHtml(acc.url)}" target="_blank" rel="noopener noreferrer" class="btn-primary btn-sm">
        ${escapeHtml(acc.platform)} Profilini Aç ↗
      </a>
      <button type="button" class="modal-close-btn" data-close-modal="1" aria-label="Kapat">✕</button>
    </div>
  `;

  renderModalBody(acc);

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function renderModalBody(acc) {
  const body = document.getElementById("modalBody");
  if (!body) return;

  const metricsHtml = (acc.metrics || [])
    .map(
      m => `
      <div class="metric-item">
        <span class="metric-label">${escapeHtml(m.label)}</span>
        <span class="metric-value num">${escapeHtml(String(m.value))}</span>
      </div>
    `
    )
    .join("");

  const posts = acc.postsList || [];
  const stories = acc.storiesList || [];
  const highlights = acc.highlightsList || [];
  const reels = acc.reelsList || [];
  const embedConfig = getLiveEmbedConfig(acc);

  const isGitHub = acc.platform === "GitHub";
  // AnonyIG & GitHub-tailored Navigation Tabs
  const tabs = [
    {
      id: "posts",
      label: isGitHub ? "📦 Depolar (Repositories)" : "📷 Gönderiler (Posts)",
      count: posts.length
    },
    {
      id: "stories",
      label: isGitHub ? "⚡ Son Aktiviteler (Commits & Events)" : "⭕ Hikayeler (Stories)",
      count: stories.length
    },
    {
      id: "highlights",
      label: isGitHub ? "⭐ En Çok Yıldız Alanlar (Top Repos)" : "✨ Öne Çıkanlar (Highlights)",
      count: highlights.length
    },
    {
      id: "reels",
      label: isGitHub ? "📝 Yıldızlananlar & Gists" : "🎬 Reels & Videolar",
      count: reels.length
    },
    ...(embedConfig ? [{ id: "live", label: "🌐 Canlı Profil Akışı", count: null }] : [])
  ];

  const tabsNavHtml = `
    <div class="anony-tabs-bar" role="tablist">
      ${tabs
        .map(
          t => `
        <button
          type="button"
          class="anony-tab-btn ${activeModalTab === t.id ? "is-active" : ""}"
          data-modal-tab="${t.id}"
          role="tab"
          aria-selected="${activeModalTab === t.id}"
        >
          <span>${t.label}</span>
          ${t.count !== null ? `<span class="tab-count-pill">${t.count}</span>` : ""}
        </button>
      `
        )
        .join("")}
    </div>
  `;

  // Highlights Circle Tray (Always visible at top of modal if highlights exist, just like AnonyIG)
  const highlightsTrayHtml =
    highlights.length > 0
      ? `
      <div class="highlights-tray">
        ${highlights
          .map(h => {
            const cover = h.image ? getProxiedImage(h.image) : "";
            return `
              <a href="${escapeHtml(h.url)}" target="_blank" rel="noopener noreferrer" class="highlight-circle-item" title="${escapeHtml(h.title)}">
                <div class="highlight-ring">
                  ${
                    cover
                      ? `<img src="${cover}" alt="${escapeHtml(h.title)}" loading="lazy" />`
                      : `<span>✨</span>`
                  }
                </div>
                <span class="highlight-label">${escapeHtml(h.title)}</span>
              </a>
            `;
          })
          .join("")}
      </div>
    `
      : "";

  let tabContentHtml = "";

  if (activeModalTab === "posts") {
    if (posts.length > 0) {
      tabContentHtml = `
        <div class="modal-posts-grid">
          ${posts.map(renderModalPostCard).join("")}
        </div>
      `;
    } else if (embedConfig) {
      tabContentHtml = renderLiveEmbedSection(embedConfig, "Gönderiler doğrudan canlı profil ızgarasından gösteriliyor:");
    } else {
      tabContentHtml = renderEmptyState(acc, "Bu hesapta görüntülenecek herkese açık gönderi bulunamadı.");
    }
  } else if (activeModalTab === "stories") {
    if (stories.length > 0) {
      tabContentHtml = `
        <div class="modal-posts-grid stories-grid">
          ${stories.map(renderModalPostCard).join("")}
        </div>
      `;
    } else {
      tabContentHtml = renderEmptyState(
        acc,
        "Şu anda aktif (son 24 saat içinde paylaşılmış) herkese açık hikaye bulunmuyor veya hesap gizli."
      );
    }
  } else if (activeModalTab === "highlights") {
    if (highlights.length > 0) {
      tabContentHtml = `
        <div class="highlights-grid-cards">
          ${highlights
            .map(h => {
              const cover = h.image ? getProxiedImage(h.image) : "";
              return `
                <a href="${escapeHtml(h.url)}" target="_blank" rel="noopener noreferrer" class="modal-post-card">
                  ${
                    cover
                      ? `<div class="modal-post-media">
                           <img src="${cover}" alt="${escapeHtml(h.title)}" loading="lazy" />
                         </div>`
                      : ""
                  }
                  <div class="modal-post-body">
                    <div class="modal-post-top">
                      <span class="modal-post-title">✨ ${escapeHtml(h.title)}</span>
                    </div>
                    <p class="modal-post-text">Öne çıkan hikaye koleksiyonunu görüntülemek için tıklayın.</p>
                    <div class="modal-post-footer">
                      <span class="post-stat-pill">Koleksiyon ID: ${escapeHtml(h.id)}</span>
                      <span class="post-open-link">Hikayeleri Aç ↗</span>
                    </div>
                  </div>
                </a>
              `;
            })
            .join("")}
        </div>
      `;
    } else {
      tabContentHtml = renderEmptyState(acc, "Bu profilde herkese açık Öne Çıkanlar (Highlights) albümü bulunamadı.");
    }
  } else if (activeModalTab === "reels") {
    if (reels.length > 0) {
      tabContentHtml = `
        <div class="modal-posts-grid">
          ${reels.map(renderModalPostCard).join("")}
        </div>
      `;
    } else if (embedConfig) {
      tabContentHtml = renderLiveEmbedSection(embedConfig, "Reels ve videolar canlı profil akışından gösteriliyor:");
    } else {
      tabContentHtml = renderEmptyState(acc, "Bu profil için herkese açık Reels / video bulunamadı.");
    }
  } else if (activeModalTab === "live" && embedConfig) {
    tabContentHtml = renderLiveEmbedSection(embedConfig, embedConfig.title);
  }

  body.innerHTML = `
    <div class="modal-bio-box">
      <div class="metric-label" style="margin-bottom:4px;">Biyografi / Açıklama</div>
      <p>${escapeHtml(acc.bio)}</p>
    </div>
    <div class="metrics-strip" style="margin-bottom: 16px;">
      ${metricsHtml}
    </div>
    ${highlightsTrayHtml}
    ${tabsNavHtml}
    <div class="anony-tab-panel">
      ${tabContentHtml}
    </div>
  `;
}

function renderLiveEmbedSection(embedConfig, subtitle) {
  return `
    <div class="modal-section-title" style="margin-top: 6px;">
      <span>${escapeHtml(subtitle)}</span>
      <span class="mono" style="font-size:0.75rem; color:var(--text-muted);">Canlı Görünüm</span>
    </div>
    <div class="live-embed-wrap">
      <iframe
        src="${escapeHtml(embedConfig.src)}"
        class="live-embed-iframe"
        frameborder="0"
        scrolling="yes"
        allowtransparency="true"
        loading="lazy"
      ></iframe>
    </div>
  `;
}

function renderEmptyState(acc, message) {
  const isPrivate = /private/i.test(acc.visibility || "");
  return `
    <div class="empty-posts-box">
      <p class="empty-posts-title">
        ${
          !acc.found
            ? "Bu platformda hesap bulunamadı."
            : isPrivate
            ? "Bu hesap gizli (Private Account) olduğu için içerikler dışarıya kapalıdır."
            : escapeHtml(message)
        }
      </p>
      <p class="empty-posts-sub">
        İçerikleri doğrudan ${escapeHtml(acc.platform)} üzerinde açmak için aşağıdaki butonu kullanabilirsiniz.
      </p>
      <a href="${escapeHtml(acc.url)}" target="_blank" rel="noopener noreferrer" class="btn-primary btn-sm" style="display:inline-flex; margin-top:12px;">
        ${escapeHtml(acc.platform)} Üzerinde Görüntüle ↗
      </a>
    </div>
  `;
}

function renderModalPostCard(post) {
  const thumb = post.image ? getProxiedImage(post.image) : "";
  const videoSrc = post.videoUrl ? getProxiedImage(post.videoUrl) : "";
  const downloadHref = post.videoUrl
    ? getDownloadUrl(post.videoUrl)
    : post.image
    ? getDownloadUrl(post.image)
    : "";

  const statsHtml = (post.stats || [])
    .filter(s => s.value && s.value !== "—")
    .map(
      s => `
      <span class="post-stat-pill">
        <strong>${escapeHtml(String(s.value))}</strong> ${escapeHtml(s.label)}
      </span>
    `
    )
    .join("");

  let mediaHtml = "";
  if (post.embedYoutubeId) {
    mediaHtml = `
      <div class="modal-post-media">
        <iframe
          src="https://www.youtube.com/embed/${escapeHtml(post.embedYoutubeId)}"
          style="width:100%; height:100%; border:0;"
          allowfullscreen
          loading="lazy"
        ></iframe>
      </div>
    `;
  } else if (videoSrc) {
    mediaHtml = `
      <div class="modal-post-media">
        <video controls preload="metadata" poster="${thumb}" style="width:100%; height:100%; object-fit:cover;">
          <source src="${videoSrc}" type="video/mp4" />
        </video>
      </div>
    `;
  } else if (thumb) {
    mediaHtml = `
      <div class="modal-post-media">
        <img src="${thumb}" alt="${escapeHtml(post.title || "Post")}" loading="lazy" onerror="this.parentElement.style.display='none'" />
      </div>
    `;
  }

  return `
    <div class="modal-post-card">
      ${mediaHtml}
      <div class="modal-post-body">
        <div class="modal-post-top">
          <span class="modal-post-title">${escapeHtml(post.title || "Gönderi")}</span>
          ${post.date ? `<span class="modal-post-date">${escapeHtml(post.date)}</span>` : ""}
        </div>
        <p class="modal-post-text">${escapeHtml(post.text || "")}</p>
        <div class="modal-post-footer">
          <div class="post-stats-row">${statsHtml}</div>
          <div class="post-action-links">
            ${
              downloadHref
                ? `<a href="${downloadHref}" class="btn-download-media" download>⬇ İndir</a>`
                : ""
            }
            <a href="${escapeHtml(post.url || "#")}" target="_blank" rel="noopener noreferrer" class="post-open-link">
              Aç ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
}

function closeAccountModal() {
  const modal = document.getElementById("accountModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
