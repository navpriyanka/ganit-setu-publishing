(() => {
  const $ = (id) => document.getElementById(id);
  const text = $("postText");
  const preview = $("previewCard");
  const content = $("previewContent");
  const targetsOut = $("previewTargets");
  const timeOut = $("previewTime");
  const status = $("previewStatus");
  const historyList = $("postHistoryList");
  const HISTORY_KEY = "gs_social_posts";
  const publishPanel = $("publishPanel");
  const scheduleFields = $("scheduleFields");
  const scheduleDate = $("scheduleDate");
  const scheduleTime = $("scheduleTime");
  const publishNowBtn = $("publishNowBtn");
  const cancelPublishBtn = $("cancelPublishBtn");
  let approvedPostId = null;
  let publishMode = "now";

  function selectedTargetValues() {
    return [...document.querySelectorAll('.checks input:checked')].map(x => x.value);
  }
  function selectedTargets() {
    return [...document.querySelectorAll('.checks input:checked')].map(x => x.parentElement.textContent.trim());
  }
  function currentImage() {
    const img = $("mediaPreview");
    return img && !$("mediaPreviewWrap").hidden && img.src ? img.src : "";
  }
  function renderPreview(state = "Draft") {
    const value = text.value.trim();
    const img = currentImage();
    content.innerHTML = "";
    if (img) {
      const image = document.createElement("img");
      image.src = img; image.className = "preview-image"; image.alt = "Post image";
      content.appendChild(image);
    }
    const caption = document.createElement("div");
    caption.className = "preview-caption";
    caption.textContent = value || "यहाँ आपकी पोस्ट का preview दिखाई देगा।";
    content.appendChild(caption);
    targetsOut.textContent = selectedTargets().join("  •  ") || "कोई platform selected नहीं";
    timeOut.textContent = new Date().toLocaleString("hi-IN");
    status.textContent = state;
    preview.hidden = false;
  }

  function getPosts() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch (_) { return []; }
  }
  function savePosts(posts) { localStorage.setItem(HISTORY_KEY, JSON.stringify(posts)); }
  function escapeHtml(v) {
    return String(v || "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  }
  function renderHistory() {
    if (!historyList) return;
    const posts = getPosts();
    if (!posts.length) {
      historyList.innerHTML = '<div class="empty-history">अभी कोई saved post नहीं है। Preview या Save Draft के बाद यहाँ पोस्ट दिखाई देगी।</div>';
      return;
    }
    historyList.innerHTML = posts.map(p => `
      <article class="history-item">
        ${p.image ? `<img src="${p.image}" alt="Post image">` : '<div class="history-no-image">📝</div>'}
        <div class="history-main">
          <div class="history-top"><span class="history-status ${p.status.toLowerCase().replace(/\s+/g,'-')}">${escapeHtml(p.status)}</span><small>${escapeHtml(new Date(p.updatedAt).toLocaleString('hi-IN'))}</small></div>
          <div class="history-text">${escapeHtml(p.text || 'बिना caption')}</div>
          <div class="history-targets">${escapeHtml(p.targets.join(' • ') || 'No platform')}</div>
          <div class="history-actions">
            <button type="button" data-action="edit" data-id="${p.id}">✏️ Edit</button>
            <button type="button" data-action="duplicate" data-id="${p.id}">📋 Duplicate</button>
            <button type="button" class="delete-btn" data-action="delete" data-id="${p.id}">🗑️ Delete</button>
          </div>
        </div>
      </article>`).join("");
  }
  function addHistory(statusText) {
    const post = { id: Date.now().toString(), text: text.value.trim(), targets: selectedTargetValues(), image: currentImage(), status: statusText, updatedAt: new Date().toISOString() };
    const posts = getPosts();
    posts.unshift(post); savePosts(posts.slice(0, 50)); renderHistory(); return post;
  }
  function loadPost(p) {
    text.value = p.text || "";
    document.querySelectorAll('.checks input').forEach(x => x.checked = p.targets.includes(x.value));
    if (p.image) { $("mediaPreview").src = p.image; $("mediaPreviewWrap").hidden = false; }
    renderPreview("Editing"); window.scrollTo({top:0, behavior:'smooth'});
  }

  $("previewBtn").addEventListener("click", () => renderPreview("Preview"));
  $("saveDraftBtn").addEventListener("click", () => {
    localStorage.setItem("gs_social_draft", JSON.stringify({text:text.value,targets:selectedTargetValues(),image:currentImage(),savedAt:new Date().toISOString()}));
    addHistory("Draft"); renderPreview("Saved Draft"); alert("Draft सुरक्षित कर दिया गया है और Post History में जोड़ दिया गया है।");
  });
  $("approveBtn").addEventListener("click", () => {
    if (!text.value.trim() && !currentImage()) { alert("पहले Post text या image तैयार कीजिए।"); text.focus(); return; }
    const post = addHistory("Approved");
    approvedPostId = post.id;
    renderPreview("Approved");
    if (publishPanel) {
      publishPanel.hidden = false;
      publishPanel.scrollIntoView({behavior:"smooth", block:"start"});
    }
  });

  document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    publishMode = btn.dataset.mode;
    scheduleFields.hidden = publishMode !== 'schedule';
    if (publishMode === 'now') publishNowBtn.textContent = '🚀 Publish Now';
    else publishNowBtn.textContent = '🗓️ Schedule Post';
  }));

  cancelPublishBtn?.addEventListener('click', () => {
    publishPanel.hidden = true;
    approvedPostId = null;
  });

  publishNowBtn?.addEventListener('click', () => {
    if (!approvedPostId) { alert('पहले किसी post को Approve कीजिए।'); return; }
    if (publishMode === 'schedule') {
      if (!scheduleDate.value || !scheduleTime.value) {
        alert('Schedule के लिए Date और Time दोनों चुनिए।');
        return;
      }
      const when = new Date(`${scheduleDate.value}T${scheduleTime.value}`);
      if (Number.isNaN(when.getTime()) || when <= new Date()) {
        alert('Future Date और Time चुनिए।');
        return;
      }
      updatePostStatus(approvedPostId, 'Scheduled', {scheduledAt: when.toISOString()});
      renderPreview('Scheduled');
      publishPanel.hidden = true;
      alert(`Post ${when.toLocaleString('hi-IN')} के लिए schedule हो गई है।\n\nActual social-platform publishing API connection के बाद यह अपने-आप publish होगी।`);
      return;
    }
    alert('Social platform API अभी connected नहीं है।\n\nपहले YouTube / Facebook / Instagram / WhatsApp की official API + OAuth connection जोड़नी होगी। Post को Published नहीं दिखाया गया है।');
  });

  function updatePostStatus(id, statusText, extra = {}) {
    const posts = getPosts();
    const i = posts.findIndex(x => x.id === id);
    if (i < 0) return;
    posts[i] = {...posts[i], ...extra, status: statusText, updatedAt: new Date().toISOString()};
    savePosts(posts);
    renderHistory();
  }
  historyList?.addEventListener("click", e => {
    const btn=e.target.closest("button[data-action]"); if(!btn)return;
    const id=btn.dataset.id, action=btn.dataset.action;
    const posts=getPosts(), post=posts.find(x=>x.id===id); if(!post)return;
    if(action==='delete'){
      if(!confirm('क्या आप इस पोस्ट को Delete करना चाहते हैं?\n\nयह action इस Post History से पोस्ट हटा देगा।')) return;
      savePosts(posts.filter(x=>x.id!==id)); renderHistory(); return;
    }
    if(action==='edit'){ loadPost(post); return; }
    if(action==='duplicate'){
      const copy={...post,id:Date.now().toString(),status:'Draft',updatedAt:new Date().toISOString()};
      savePosts([copy,...posts].slice(0,50)); renderHistory(); alert('Post duplicate होकर Draft के रूप में जोड़ दी गई है।');
    }
  });

  try {
    const d=JSON.parse(localStorage.getItem("gs_social_draft")||"null");
    if(d){ text.value=d.text||""; document.querySelectorAll('.checks input').forEach(x=>x.checked=d.targets?.includes(x.value)??true); if(d.image){$("mediaPreview").src=d.image;$("mediaPreviewWrap").hidden=false;} }
  } catch (_) {}
  renderHistory();

  /* Content Studio */
  const buttons=document.querySelectorAll('.format-card');
  const uploadBox=$("mediaUploadBox"), bannerTools=$("bannerTools"), videoTools=$("videoTools");
  const fileInput=$("mediaFile"), mediaImg=$("mediaPreview"), previewWrap=$("mediaPreviewWrap"), remove=$("removeMedia");
  const canvas=$("bannerCanvas"), generated=$("generatedBanner"); let bannerData='';
  function setFormat(f){
    buttons.forEach(b=>b.classList.toggle('active',b.dataset.format===f));
    uploadBox.hidden=!['image','banner'].includes(f); bannerTools.hidden=f!=='banner'; videoTools.hidden=f!=='video';
    if(f==='image'){$("mediaUploadTitle").textContent='Image Post';$("mediaUploadHint").textContent='JPG, PNG या WebP image चुनें।';}
    else if(f==='banner'){$("mediaUploadTitle").textContent='Banner Post';$("mediaUploadHint").textContent='अपना banner upload करें या नीचे branded banner बनाएं।';}
  }
  buttons.forEach(b=>b.addEventListener('click',()=>setFormat(b.dataset.format)));
  fileInput?.addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>6*1024*1024){alert('Image 6 MB से छोटी रखें।');e.target.value='';return;}const r=new FileReader();r.onload=ev=>{mediaImg.src=ev.target.result;previewWrap.hidden=false;renderPreview('Preview');};r.readAsDataURL(f);});
  remove?.addEventListener('click',()=>{mediaImg.src='';previewWrap.hidden=true;fileInput.value='';renderPreview('Draft');});
  document.querySelectorAll('.template-btn').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.template-btn').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
    const p={question:['आज का गणित प्रश्न','Class 9th & 10th • Practice','यहाँ आज का सवाल लिखें'],trick:['Maths Trick of the Day','सीखें • समझें • याद रखें','यहाँ Maths Trick लिखें'],test:['Ganit Setu Test Announcement','Class 9th & 10th','आज का Test जरूर दें!'],app:['Ganit Setu App Update','Learn • Practice • Progress','नई सुविधा / महत्वपूर्ण जानकारी']}[btn.dataset.template];
    $("bannerTitle").value=p[0];$("bannerSubtitle").value=p[1];$("bannerBody").value=p[2];
  }));
  $("buildBanner")?.addEventListener('click',()=>{
    const ctx=canvas.getContext('2d'),title=$("bannerTitle").value.trim()||'आज का गणित प्रश्न',sub=$("bannerSubtitle").value.trim()||'Class 9th & 10th • Ganit Setu',body=$("bannerBody").value.trim()||'गणित सीखें, अभ्यास करें और आगे बढ़ें।';
    const g=ctx.createLinearGradient(0,0,1200,630);g.addColorStop(0,'#0b3d91');g.addColorStop(.55,'#087f5b');g.addColorStop(1,'#f59f00');ctx.fillStyle=g;ctx.fillRect(0,0,1200,630);
    ctx.fillStyle='rgba(255,255,255,.10)';for(let x=-80;x<1400;x+=180){ctx.beginPath();ctx.arc(x,90,85,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#fff';ctx.font='bold 52px Arial';ctx.fillText('GANIT SETU',70,82);ctx.font='bold 52px Arial';wrap(ctx,title,70,190,1060,64);ctx.font='28px Arial';ctx.fillStyle='#fff7d6';wrap(ctx,sub,70,350,1060,40);ctx.font='34px Arial';ctx.fillStyle='#fff';wrap(ctx,body,70,445,1060,46);ctx.font='bold 22px Arial';ctx.fillStyle='#fff7d6';ctx.fillText('Practice • Learn • Progress • Succeed',70,575);bannerData=canvas.toDataURL('image/png');generated.hidden=false;
  });
  function wrap(ctx,t,x,y,max,line){let row='';for(const word of t.split(/\s+/)){const test=row?row+' '+word:word;if(ctx.measureText(test).width>max&&row){ctx.fillText(row,x,y);row=word;y+=line;}else row=test;}if(row)ctx.fillText(row,x,y);}
  $("useBanner")?.addEventListener('click',()=>{if(!bannerData)return;mediaImg.src=bannerData;previewWrap.hidden=false;$("mediaUploadHint").textContent='Banner Preview तैयार है।';renderPreview('Preview');});
})();

/* AI Content Studio — Gemini secure backend connection */
(() => {
  const $ = (id) => document.getElementById(id);

  const btn = $("generateAiBtn");
  const out = $("aiGeneratedText");
  const status = $("aiStatus");
  const useBtn = $("useAiDraftBtn");
  const clearBtn = $("clearAiBtn");

  const AI_FUNCTION_URL =
    "https://cbgojvnbkosdehvwerth.supabase.co/functions/v1/gemini-generate-post";

  const SUPABASE_URL =
    "https://cbgojvnbkosdehvwerth.supabase.co";

  const SUPABASE_ANON_KEY =
    "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";

  function setStatus(label, type = "") {
    if (!status) return;

    status.textContent = label;
    status.className =
      "ai-status" + (type ? " " + type : "");
  }

  function showError(message) {
    setStatus("ERROR", "error");

    if (out) {
      out.value =
        "Gemini AI connection में समस्या आई है।\n\n" +
        (message || "Unknown error");
    }

    if (useBtn) {
      useBtn.disabled = true;
    }
  }

  async function getAdminSession() {

    let sb = window.gsSupabaseClient;

    /*
     * अगर Social Media Manager page ने shared
     * Supabase client नहीं बनाया है तो यहाँ
     * सुरक्षित तरीके से client बनाया जाएगा।
     */
    if (!sb) {

      if (
        !window.supabase ||
        typeof window.supabase.createClient !== "function"
      ) {
        throw new Error(
          "Supabase client उपलब्ध नहीं है। कृपया Admin Panel को दोबारा खोलें।"
        );
      }

      sb = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );

      window.gsSupabaseClient = sb;
    }

    /*
     * Current logged-in Admin session पढ़ें।
     */
    let result = await sb.auth.getSession();

    if (result.error) {
      throw new Error(
        "Admin Auth session पढ़ने में समस्या: " +
        result.error.message
      );
    }

    let session = result.data?.session;

    /*
     * अगर session नहीं मिली तो एक बार refresh करें।
     */
    if (!session?.access_token) {

      const refreshed =
        await sb.auth.refreshSession();

      if (refreshed.error) {
        throw new Error(
          "Secure Admin session उपलब्ध नहीं है। " +
          "कृपया Admin Panel में logout करके फिर login करें।"
        );
      }

      session =
        refreshed.data?.session;
    }

    if (!session?.access_token) {
      throw new Error(
        "Secure Admin session उपलब्ध नहीं है। " +
        "कृपया Admin Panel में logout करके फिर login करें।"
      );
    }

    return {
      client: sb,
      accessToken: session.access_token
    };
  }

  btn?.addEventListener("click", async () => {

    const type =
      $("aiPostType")?.value || "question";

    const classLevel =
      $("aiClass")?.value || "both";

    const language =
      $("aiLanguage")?.value || "hi";

    const topic =
      $("aiTopic")?.value.trim() || "";

    if (!out || !status) {
      return;
    }

    btn.disabled = true;

    setStatus("CONNECTING");

    out.value = "";

    if (useBtn) {
      useBtn.disabled = true;
    }

    try {

      /*
       * Secure Admin login session प्राप्त करें।
       */
      const { accessToken } =
        await getAdminSession();

      /*
       * Gemini Supabase Edge Function को request।
       */
      const response = await fetch(
        AI_FUNCTION_URL,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",

            "Authorization":
              `Bearer ${accessToken}`,

            "apikey":
              SUPABASE_ANON_KEY
          },

          body: JSON.stringify({
            type: type,
            classLevel: classLevel,
            language: language,
            topic: topic
          })
        }
      );

      /*
       * पहले raw response पढ़ें ताकि
       * वास्तविक error भी दिखाई दे सके।
       */
      const raw =
        await response.text();

      let data = {};

      try {
        data =
          raw ? JSON.parse(raw) : {};
      } catch (_) {
        data = {
          error: raw
        };
      }

      if (!response.ok) {

        throw new Error(
          data?.error ||
          data?.message ||
          `Gemini service error (${response.status})`
        );
      }

      /*
       * Gemini से text मिलना जरूरी है।
       */
      if (
        !data?.text ||
        !String(data.text).trim()
      ) {

        throw new Error(
          "Gemini ने खाली draft लौटाया।"
        );
      }

      /*
       * Generated AI content दिखाएँ।
       */
      out.value =
        String(data.text).trim();

      if (useBtn) {
        useBtn.disabled = false;
      }

      const modelText =
        data.model
          ? ` • ${data.model}`
          : "";

      setStatus(
        `GEMINI • CONNECTED • READY${modelText}`,
        "ready"
      );

      console.log(
        "Ganit Setu Gemini AI:",
        {
          provider:
            data.provider || "Gemini",

          model:
            data.model || "unknown",

          approvalRequired:
            data.approvalRequired !== false
        }
      );

    } catch (error) {

      console.error(
        "Gemini AI generation error:",
        error
      );

      showError(
        error?.message ||
        "Unknown Gemini error"
      );

    } finally {

      btn.disabled = false;
    }
  });

  /*
   * AI Draft को main Post composer में डालें।
   */
  useBtn?.addEventListener(
    "click",
    () => {

      if (!out?.value.trim()) {
        return;
      }

      const post =
        $("postText");

      if (post) {

        post.value =
          out.value.trim();

        post.dispatchEvent(
          new Event(
            "input",
            {
              bubbles: true
            }
          )
        );

        document
          .querySelector(".composer")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
      }
    }
  );

  /*
   * AI Draft clear करें।
   */
  clearBtn?.addEventListener(
    "click",
    () => {

      if (out) {
        out.value = "";
      }

      if (useBtn) {
        useBtn.disabled = true;
      }

      setStatus(
        "READY",
        "ready"
      );
    }
  );

})();


/* AI Image Studio — Fixed Ganit Setu Master Daily Question Poster */
(() => {
  const $ = (id) => document.getElementById(id);

  const generateBtn = $("generateAiImageBtn");
  const useBtn = $("useAiImageBtn");
  const clearBtn = $("clearAiImageBtn");
  const status = $("aiImageStatus");
  const previewBox = $("aiImagePreviewBox");

  const IMAGE_FUNCTION_URL =
    "https://cbgojvnbkosdehvwerth.supabase.co/functions/v1/cloudflare-generate-image";

  const SUPABASE_URL =
    "https://cbgojvnbkosdehvwerth.supabase.co";

  const SUPABASE_ANON_KEY =
    "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";

  const LOGO_URL = "assets/images/Ganit-Setu-Logo-FINAL-Transparent.png";
  let generatedImage = "";

  function setImageStatus(label, type = "") {
    if (!status) return;
    status.textContent = label;
    status.className = "ai-status" + (type ? " " + type : "");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      "'": "&#39;", '"': "&quot;"
    }[c]));
  }

  function showImageError(message) {
    setImageStatus("ERROR", "error");
    if (previewBox) {
      previewBox.innerHTML = `
        <div class="ai-image-error">
          <strong>⚠️ Master Poster नहीं बन सका</strong>
          <span>${escapeHtml(message || "Unknown error")}</span>
        </div>`;
    }
    if (useBtn) useBtn.disabled = true;
  }

  async function getAdminAccessToken() {
    let sb = window.gsSupabaseClient;

    if (!sb) {
      if (!window.supabase || typeof window.supabase.createClient !== "function") {
        throw new Error("Supabase client उपलब्ध नहीं है। Admin Panel को दोबारा खोलें।");
      }
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.gsSupabaseClient = sb;
    }

    let result = await sb.auth.getSession();
    if (result.error) throw new Error("Admin Auth session पढ़ने में समस्या: " + result.error.message);

    let session = result.data?.session;
    if (!session?.access_token) {
      const refreshed = await sb.auth.refreshSession();
      if (refreshed.error) {
        throw new Error("Secure Admin session उपलब्ध नहीं है। कृपया logout करके फिर login करें।");
      }
      session = refreshed.data?.session;
    }

    if (!session?.access_token) {
      throw new Error("Secure Admin session उपलब्ध नहीं है। कृपया Admin Panel में फिर login करें।");
    }
    return session.access_token;
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function wrapText(ctx, text, maxWidth) {
    const lines = [];
    const paragraphs = String(text || "").split(/\r?\n/);

    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) {
        lines.push("");
        continue;
      }

      /* Preserve maths expressions and Hindi words while also breaking very
         long unspaced strings so nothing can run outside the panel. */
      let line = "";
      const words = paragraph.trim().split(/\s+/);

      for (const word of words) {
        if (ctx.measureText(word).width > maxWidth) {
          if (line) {
            lines.push(line);
            line = "";
          }
          let chunk = "";
          for (const ch of word) {
            const test = chunk + ch;
            if (ctx.measureText(test).width <= maxWidth || !chunk) {
              chunk = test;
            } else {
              lines.push(chunk);
              chunk = ch;
            }
          }
          if (chunk) line = chunk;
          continue;
        }

        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width <= maxWidth || !line) {
          line = test;
        } else {
          lines.push(line);
          line = word;
        }
      }

      if (line) lines.push(line);
    }
    return lines;
  }

  function splitContentBlocks(value) {
    return String(value || "")
      .trim()
      .split(/\n\s*\n+/)
      .map(x => x.trim())
      .filter(Boolean);
  }

  function drawTextBlock(ctx, textValue, area, blockCount) {
    const padding = Math.max(30, Math.round(area.w * 0.055));
    const maxWidth = area.w - padding * 2;

    let startSize =
      blockCount === 1 ? 52 :
      blockCount === 2 ? 42 : 36;

    let best = null;

    for (let size = startSize; size >= 22; size -= 2) {
      ctx.font = `700 ${size}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;
      const lines = wrapText(ctx, textValue, maxWidth);
      const lineHeight = Math.round(size * 1.38);
      const totalHeight = lines.length * lineHeight;

      if (totalHeight <= area.h - padding * 2) {
        best = { size, lines, lineHeight, totalHeight };
        break;
      }
    }

    if (!best) {
      throw new Error("Content बहुत लंबा है। कृपया इसे 2 अलग-अलग पोस्ट में बाँटें।");
    }

    ctx.font = `700 ${best.size}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;
    ctx.fillStyle = "#172033";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    let y = area.y + (area.h - best.totalHeight) / 2;

    for (const line of best.lines) {
      if (!line) {
        y += Math.round(best.lineHeight * 0.45);
      } else {
        ctx.fillText(line, area.x + padding, y);
        y += best.lineHeight;
      }
    }
  }

  async function loadImage(src) {
    const img = new Image();
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Background image load नहीं हो सकी।"));
      img.src = src;
    });
    return img;
  }

  async function composeMasterPoster(backgroundUrl, verifiedContent, language) {
    const bg = await loadImage(backgroundUrl);
    const logo = await loadImage(LOGO_URL);

    const width = 1080;
    const height = 1350;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Poster canvas उपलब्ध नहीं है।");

    /* Cloudflare image is ONLY a hidden decorative background layer. */
    const scale = Math.max(width / bg.naturalWidth, height / bg.naturalHeight);
    const bw = bg.naturalWidth * scale;
    const bh = bg.naturalHeight * scale;
    ctx.drawImage(bg, (width - bw) / 2, (height - bh) / 2, bw, bh);

    /* Strong white wash prevents accidental AI pseudo-text from becoming
       readable anywhere outside our fixed content panel. */
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.fillRect(0, 0, width, height);

    /* FIXED TOP LOGO STRIP */
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, 205);

    ctx.fillStyle = "rgba(23,105,232,0.10)";
    ctx.fillRect(0, 201, width, 4);

    const logoMaxW = 520;
    const logoMaxH = 155;
    const logoScale = Math.min(
      logoMaxW / logo.naturalWidth,
      logoMaxH / logo.naturalHeight
    );
    const logoW = logo.naturalWidth * logoScale;
    const logoH = logo.naturalHeight * logoScale;
    ctx.drawImage(
      logo,
      (width - logoW) / 2,
      (205 - logoH) / 2,
      logoW,
      logoH
    );

    /* FIXED TITLE */
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#1769e8";
    ctx.font = '800 42px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif';
    ctx.fillText(
      language === "en" ? "TODAY'S MATHS QUESTION" : "आज का गणित प्रश्न",
      width / 2,
      265
    );

    /* FIXED LARGE WHITE CONTENT AREA */
    const panel = { x: 70, y: 300, w: 940, h: 880 };

    ctx.save();
    ctx.shadowColor = "rgba(15,23,42,0.18)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    roundedRect(ctx, panel.x, panel.y, panel.w, panel.h, 34);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    roundedRect(ctx, panel.x, panel.y, panel.w, panel.h, 34);
    ctx.strokeStyle = "rgba(23,105,232,0.16)";
    ctx.lineWidth = 3;
    ctx.stroke();

    const blocks = splitContentBlocks(verifiedContent);
    if (!blocks.length) {
      throw new Error("Verified Poster Content खाली है। पहले प्रश्न और उसका हल भरें।");
    }
    if (blocks.length > 3) {
      throw new Error("अधिकतम 3 प्रश्न रखें। चौथा प्रश्न अगली पोस्ट में रखें।");
    }

    /* Automatic 1 / 2 / 3 question layout. */
    const inner = {
      x: panel.x + 28,
      y: panel.y + 28,
      w: panel.w - 56,
      h: panel.h - 56
    };
    const gap = 20;
    const blockH = (inner.h - gap * (blocks.length - 1)) / blocks.length;

    blocks.forEach((block, index) => {
      const area = {
        x: inner.x,
        y: inner.y + index * (blockH + gap),
        w: inner.w,
        h: blockH
      };

      if (blocks.length > 1 && index > 0) {
        ctx.strokeStyle = "rgba(23,105,232,0.12)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(area.x + 15, area.y - gap / 2);
        ctx.lineTo(area.x + area.w - 15, area.y - gap / 2);
        ctx.stroke();
      }

      drawTextBlock(ctx, block, area, blocks.length);
    });

    /* Small footer outside the verified content area. */
    ctx.textAlign = "center";
    ctx.fillStyle = "#1769e8";
    ctx.font = '700 26px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif';
    ctx.fillText(
      language === "en"
        ? "Learn • Practice • Progress"
        : "गणित सीखें • अभ्यास करें • आगे बढ़ें",
      width / 2,
      1260
    );

    return canvas.toDataURL("image/jpeg", 0.94);
  }

  function showGeneratedImage(dataUrl) {
    generatedImage = dataUrl;
    if (!previewBox) return;

    previewBox.innerHTML = "";
    const img = document.createElement("img");
    img.id = "aiGeneratedImage";
    img.src = dataUrl;
    img.alt = "Ganit Setu Final Master Daily Question Poster";
    img.loading = "eager";
    previewBox.appendChild(img);

    if (useBtn) useBtn.disabled = false;
  }

  generateBtn?.addEventListener("click", async () => {
    const classLevel = $("aiImageClass")?.value || "both";
    const language = $("aiImageLanguage")?.value || "hi";
    const topic = $("aiImageTopic")?.value.trim() || "";
    const verifiedContent = $("aiImageVerifiedContent")?.value || "";

    if (!previewBox) return;

    const blocks = splitContentBlocks(verifiedContent);
    if (!blocks.length) {
      alert("पहले Verified Poster Content में प्रश्न और उसका हल भरें।");
      return;
    }
    if (blocks.length > 3) {
      alert("अधिकतम 3 प्रश्न रखें। चौथा प्रश्न अगली पोस्ट में रखें।");
      return;
    }
    if (verifiedContent.length > 2200) {
      alert("Content बहुत लंबा है। Readability बनाए रखने के लिए इसे 2 अलग-अलग पोस्ट में बाँटना बेहतर रहेगा।");
      return;
    }

    generateBtn.disabled = true;
    setImageStatus("GENERATING...");
    if (useBtn) useBtn.disabled = true;

    /* IMPORTANT: only the final composite is ever inserted into previewBox. */
    previewBox.innerHTML = `
      <div class="ai-image-loading">
        <div class="ai-spinner"></div>
        <strong>Master Poster तैयार हो रहा है...</strong>
        <span>Background visual + fixed Ganit Setu template + verified content</span>
      </div>`;

    try {
      const accessToken = await getAdminAccessToken();

      const response = await fetch(IMAGE_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "apikey": SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          type: "daily_question",
          classLevel,
          language,
          topic,
          style: "master_daily_background",
          aspectRatio: "4:5"
        })
      });

      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (_) {
        data = { error: raw };
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
          data?.message ||
          `Cloudflare Image service error (${response.status})`
        );
      }

      const imageUrl = data?.image || data?.imageUrl || data?.dataUrl || "";
      if (!imageUrl) {
        throw new Error("Cloudflare ने response दिया लेकिन background image data नहीं मिली।");
      }

      setImageStatus("FINAL TEMPLATE...");
      const finalPoster = await composeMasterPoster(
        imageUrl,
        verifiedContent,
        language
      );

      showGeneratedImage(finalPoster);
      setImageStatus("MASTER POSTER READY", "ready");

    } catch (error) {
      console.error("Master poster generation error:", error);
      showImageError(error?.message || "Unknown Cloudflare image error");
    } finally {
      generateBtn.disabled = false;
    }
  });

  useBtn?.addEventListener("click", () => {
    if (!generatedImage) return;

    const mediaImg = $("mediaPreview");
    const previewWrap = $("mediaPreviewWrap");
    const uploadBox = $("mediaUploadBox");
    const postText = $("postText");
    const caption = $("aiImageCaption")?.value.trim() || "";

    if (!mediaImg || !previewWrap) {
      alert("Post image area नहीं मिला। कृपया page को refresh करके फिर कोशिश करें।");
      return;
    }

    mediaImg.src = generatedImage;
    previewWrap.hidden = false;
    if (uploadBox) uploadBox.hidden = false;

    const hint = $("mediaUploadHint");
    if (hint) hint.textContent = "✨ Final Ganit Setu Master Poster तैयार है।";

    if (caption && postText) {
      postText.value = caption;
      postText.dispatchEvent(new Event("input", { bubbles: true }));
    }

    document.querySelector("#previewBtn")?.click();
    document.querySelector(".composer")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  clearBtn?.addEventListener("click", () => {
    generatedImage = "";
    if (previewBox) {
      previewBox.innerHTML = `
        <div class="ai-image-placeholder">
          <div>🧮</div>
          <span>Generate करने पर केवल Final Ganit Setu Master Poster यहाँ दिखाई देगा।</span>
        </div>`;
    }
    if (useBtn) useBtn.disabled = true;
    setImageStatus("READY", "ready");
  });
})();
