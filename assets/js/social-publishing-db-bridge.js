/* Ganit Setu — Social Publishing DB Bridge
   Additive integration for the existing Social Media Manager.
   It does NOT replace social-media-manager.js.
*/
(() => {
  "use strict";

  const SUPABASE_URL = "https://cbgojvnbkosdehvwerth.supabase.co";
  const SUPABASE_KEY = "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";
  let sb = window.gsSupabaseClient || null;

  async function getClient() {
    if (sb) return sb;
    if (!window.supabase?.createClient) throw new Error("Supabase library उपलब्ध नहीं है।");
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.gsSupabaseClient = sb;
    return sb;
  }

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  }

  function platformType(p) {
    if (p === "youtube") return "video";
    return "image_post";
  }

  async function syncApprovedPost() {
    try {
      const posts = JSON.parse(localStorage.getItem("gs_social_posts") || "[]");
      const post = posts.find(x => x.status === "Approved");
      if (!post) return;

      const targets = Array.isArray(post.targets) ? post.targets : [];
      if (!targets.length) return;

      const map = {
        facebook: "facebook",
        instagram: "instagram",
        youtube: "youtube",
        whatsapp: "whatsapp_channel"
      };

      const rows = targets
        .map(t => map[t])
        .filter(Boolean)
        .map(platform => ({
          platform,
          content_type: platformType(platform),
          title: (post.text || "Ganit Setu Post").slice(0, 120),
          caption: post.text || "",
          status: "ready",
          publish_mode: "manual"
        }));

      if (!rows.length) return;

      const client = await getClient();

      // Avoid duplicate queue entries for the same post by using a local
      // marker. Actual question-linked queue entries can be added later
      // from Content Planning.
      const marker = `gs_social_queued_${post.id}`;
      if (localStorage.getItem(marker) === "1") return;

      const { error } = await client.from("social_publish_queue").insert(rows);
      if (error) throw error;

      localStorage.setItem(marker, "1");
      renderQueueStatus();
    } catch (e) {
      console.error("Ganit Setu social queue sync:", e);
    }
  }

  async function renderQueueStatus() {
    const box = document.getElementById("gsDbQueueStatus");
    if (!box) return;
    try {
      const client = await getClient();
      const { data, error } = await client
        .from("social_publish_queue")
        .select("platform,content_type,status,created_at")
        .order("created_at", { ascending:false })
        .limit(12);
      if (error) throw error;

      if (!data?.length) {
        box.innerHTML = '<div class="gs-db-empty">अभी Supabase publishing queue खाली है।</div>';
        return;
      }

      box.innerHTML = data.map(x => `
        <div class="gs-db-row">
          <span>${esc(x.platform)}</span>
          <b>${esc(x.status)}</b>
          <small>${esc(x.content_type)}</small>
        </div>
      `).join("");
    } catch (e) {
      box.innerHTML = `<div class="gs-db-empty">Queue status: ${esc(e.message)}</div>`;
    }
  }

  function addPanel() {
    if (document.getElementById("gsDbSocialPanel")) return;

    const target = document.querySelector(".publish-panel") ||
                   document.querySelector(".post-history");
    if (!target || !target.parentElement) return;

    const panel = document.createElement("section");
    panel.id = "gsDbSocialPanel";
    panel.className = "publish-panel";
    panel.innerHTML = `
      <div class="section-title">
        <h2>🗄️ Supabase Publishing Queue</h2>
        <span class="draft-badge">CONNECTED TO DB</span>
      </div>
      <p class="history-help">
        Approved posts अब Supabase queue में सुरक्षित रखे जाते हैं।
        वास्तविक direct publishing official OAuth/API connection के बाद होगा।
      </p>
      <div id="gsDbQueueStatus" class="gs-db-queue"></div>
    `;
    target.parentElement.insertBefore(panel, target);
    renderQueueStatus();
  }

  function init() {
    addPanel();

    document.getElementById("approveBtn")?.addEventListener("click", () => {
      setTimeout(syncApprovedPost, 150);
    });

    // Refresh queue when page becomes active again.
    window.addEventListener("focus", renderQueueStatus);
    setInterval(() => {
      if (document.visibilityState === "visible") renderQueueStatus();
    }, 15000);

    let tries = 0;
    const timer = setInterval(() => {
      addPanel();
      if (++tries > 20) clearInterval(timer);
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once:true});
  } else {
    init();
  }
})();
