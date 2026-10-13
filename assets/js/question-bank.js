(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  let sb = null;
  let bulkRows = [];
  const escapeHtml = v => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
  const normalize = v => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();

  function msg(id, text, type = "ok") {
    const el = $(id);
    if (el) el.innerHTML = `<div class="qb-msg ${type}">${escapeHtml(text)}</div>`;
  }
  function authMsg(text, type = "err") {
    const el = $("authMessage");
    if (!el) return;
    el.style.display = "block";
    el.className = `qb-msg ${type}`;
    el.textContent = text;
  }
  async function updateAuthUI() {
    if (!sb) return false;
    const { data, error } = await sb.auth.getSession();
    const session = data && data.session;
    $("adminAuthStatus").textContent = session ? `लॉगिन: ${session.user.email}` : "लॉगिन नहीं है";
    $("adminLoginBtn").hidden = !!session;
    $("adminLogoutBtn").hidden = !session;
    $("adminEmail").disabled = !!session;
    $("adminPassword").disabled = !!session;
    const forms = ["singleForm", "downloadTemplateBtn", "previewBulkBtn", "uploadBulkBtn", "refreshQuestions"];
    for (const id of forms) {
      const el = $(id);
      if (el && id !== "downloadTemplateBtn") el.disabled = !session;
    }
    if (error) authMsg(error.message || "Session जाँच नहीं हो सकी।");
    return !!session;
  }
  async function requireAdminLogin() {
    if (!sb) { authMsg("Supabase connection उपलब्ध नहीं है।"); return false; }
    const { data, error } = await sb.auth.getSession();
    if (error || !data.session) {
      authMsg("पहले Admin Email और Password से Login करें।");
      return false;
    }
    return true;
  }
  async function loginAdmin(event) {
    event.preventDefault();
    if (!sb) { authMsg("Supabase connection उपलब्ध नहीं है।"); return; }
    const btn = $("adminLoginBtn"); btn.disabled = true; btn.textContent = "Login हो रहा है…";
    try {
      const { error } = await sb.auth.signInWithPassword({
        email: $("adminEmail").value.trim(),
        password: $("adminPassword").value
      });
      if (error) throw error;
      $("adminPassword").value = "";
      authMsg("Login सफल। अब RLS अनुमति के अनुसार प्रश्न लोड होंगे।", "ok");
      await updateAuthUI();
      await loadQuestions();
    } catch (e) { authMsg("Login नहीं हुआ: " + (e.message || e)); }
    finally { btn.textContent = "Login"; btn.disabled = false; }
  }
  async function logoutAdmin() {
    if (!sb) return;
    const { error } = await sb.auth.signOut();
    if (error) authMsg("Logout error: " + error.message);
    else authMsg("Logout हो गया।", "ok");
    await updateAuthUI();
    $("questionList").innerHTML = "";
    $("questionCount").textContent = "लॉगिन करें";
  }
  function maxCh(c) { return Number(c) === 9 ? 12 : 14; }
  function fillChapters() {
    const classEl = $("classLevel"), sel = $("chapterNumber");
    if (!classEl || !sel) return;
    const c = Number(classEl.value), old = Number(sel.value) || 1;
    sel.innerHTML = "";
    for (let i = 1; i <= maxCh(c); i++) {
      const o = document.createElement("option");
      o.value = i; o.textContent = `अध्याय ${i}`; sel.appendChild(o);
    }
    sel.value = String(Math.min(old, maxCh(c)));
  }
  function newId() {
    return "Q" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();
  }
  function payloadFrom(row) {
    return {
      id: String(row.id || newId()).trim(),
      class_level: Number(row.class_level),
      chapter_number: Number(row.chapter_number),
      chapter_name: String(row.chapter_name || `अध्याय ${row.chapter_number}`).trim(),
      question_text: String(row.question_text || "").trim(),
      option_a: String(row.option_a || "").trim(),
      option_b: String(row.option_b || "").trim(),
      option_c: String(row.option_c || "").trim(),
      option_d: String(row.option_d || "").trim(),
      correct_option: String(row.correct_option || "").trim().toUpperCase(),
      hint: String(row.hint || "").trim() || null,
      explanation: String(row.explanation || "").trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }
  function validate(row) {
    const p = payloadFrom(row);
    if (![9,10].includes(p.class_level)) return "class_level 9 या 10 होना चाहिए";
    if (!Number.isInteger(p.chapter_number) || p.chapter_number < 1 || p.chapter_number > maxCh(p.class_level)) return "chapter_number गलत है";
    if (!p.question_text) return "question_text खाली है";
    if (![p.option_a,p.option_b,p.option_c,p.option_d].every(Boolean)) return "चारों options जरूरी हैं";
    if (!["A","B","C","D"].includes(p.correct_option)) return "correct_option A/B/C/D होना चाहिए";
    if (!p.id) return "Question ID खाली है";
    return null;
  }
  function csvEscape(v) {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
  }
  function downloadTemplate() {
    const headers = ["id","class_level","chapter_number","chapter_name","question_text","option_a","option_b","option_c","option_d","correct_option","hint","explanation"];
    const sample = ["Q900","9","1","संख्या पद्धति","उदाहरण प्रश्न?","विकल्प A","विकल्प B","विकल्प C","विकल्प D","A","संकेत","व्याख्या"];
    const csv = "\ufeff" + headers.map(csvEscape).join(",") + "\r\n" + sample.map(csvEscape).join(",");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "Ganit_Setu_Questions_Template.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    msg("bulkMessage", "CSV Template डाउनलोड शुरू हो गया।");
  }
  function parseCSV(text) {
    const rows = []; let row = [], cell = "", quoted = false;
    for (let i=0; i<text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i+1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === "," && !quoted) { row.push(cell.trim()); cell = ""; }
      else if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && text[i+1] === "\n") i++;
        row.push(cell.trim()); cell = "";
        if (row.some(v => v !== "")) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell.trim()); if (row.some(v => v !== "")) rows.push(row);
    if (!rows.length) return [];
    const headers = rows[0].map(h => h.replace(/^\ufeff/,"").trim().toLowerCase());
    return rows.slice(1).map((values,i) => {
      const obj = {_row:i+2}; headers.forEach((h,j) => obj[h] = values[j] ?? ""); return obj;
    });
  }
  async function loadQuestions() {
    const list = $("questionList"), count = $("questionCount");
    if (!sb) {
      if (list) list.innerHTML = '<tr><td colspan="5">Supabase client उपलब्ध नहीं है। पेज refresh करें; फिर भी समस्या रहे तो CDN/config की जाँच करें।</td></tr>';
      if (count) count.textContent = "Questions load नहीं हुए";
      return;
    }
    if (list) list.innerHTML = '<tr><td colspan="5">लोड हो रहा है...</td></tr>';
    try {
      const {data,error} = await sb.from("questions").select("id,class_level,chapter_number,question_text,correct_option").order("id").limit(200);
      if (error) throw error;
      const rows = data || [];
      if (count) count.textContent = `कुल ${rows.length} प्रश्न (अधिकतम 200 दिखाए गए)`;
      if (list) list.innerHTML = rows.length ? rows.map(q =>
        `<tr><td>${escapeHtml(q.id)}</td><td>${escapeHtml(q.class_level)}</td><td>${escapeHtml(q.chapter_number)}</td><td>${escapeHtml(q.question_text)}</td><td>${escapeHtml(q.correct_option)}</td></tr>`
      ).join("") : '<tr><td colspan="5">अभी कोई प्रश्न नहीं है।</td></tr>';
    } catch (e) {
      if (list) list.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(e.message || e)}</td></tr>`;
      if (count) count.textContent = "Questions load नहीं हुए";
    }
  }
  async function saveSingle(e) {
    e.preventDefault();
    if (!sb) { msg("singleMessage","Supabase client नहीं मिला। पेज refresh करें और फिर कोशिश करें।","err"); return; }
    const row = {
      id:$("questionId").value.trim(), class_level:$("classLevel").value,
      chapter_number:$("chapterNumber").value, chapter_name:$("chapterName").value,
      question_text:$("questionText").value, option_a:$("optionA").value,
      option_b:$("optionB").value, option_c:$("optionC").value, option_d:$("optionD").value,
      correct_option:$("correctOption").value, hint:$("hint").value, explanation:$("explanation").value
    };
    const err = validate(row); if (err) { msg("singleMessage",err,"err"); return; }
    const p = payloadFrom(row), btn = $("saveSingleBtn");
    btn.disabled = true;
    try {
      const {error} = await sb.from("questions").insert(p);
      if (error) throw error;
      msg("singleMessage",`प्रश्न ${p.id} सफलतापूर्वक सेव हुआ।`);
      $("singleForm").reset(); $("classLevel").value = String(p.class_level); fillChapters();
      await loadQuestions();
    } catch (e2) { msg("singleMessage",`Save नहीं हुआ: ${e2.message || e2}`,"err"); }
    finally { btn.disabled = false; }
  }
  async function preview() {
    if (!(await requireAdminLogin())) return;
    const f = $("bulkFile").files[0];
    if (!f) { msg("bulkMessage","पहले CSV file चुनें।","err"); return; }
    let parsed;
    try { parsed = parseCSV(await f.text()); }
    catch(e) { msg("bulkMessage","CSV पढ़ने में समस्या: "+e.message,"err"); return; }
    if (!parsed.length) { msg("bulkMessage","CSV में कोई प्रश्न नहीं मिला।","err"); return; }
    const seen = new Set();
    bulkRows = parsed.map(r => {
      if (!String(r.id || "").trim()) r.id = newId();
      const err = validate(r), p = payloadFrom(r), key = `${p.class_level}|${p.chapter_number}|${normalize(p.question_text)}`;
      if (err) return {...r,_status:"error",_reason:err};
      if (seen.has(key)) return {...r,_status:"skip",_reason:"CSV में duplicate प्रश्न"};
      seen.add(key);
      return {...r,_status:"checking",_reason:"Database duplicate check"};
    });
    if (!sb) {
      bulkRows.forEach(r => { if (r._status === "checking") { r._status = "error"; r._reason = "Supabase client नहीं मिला; upload संभव नहीं"; } });
      renderPreview();
      msg("bulkMessage","CSV पढ़ लिया गया, लेकिन Supabase client उपलब्ध नहीं है।","err");
      $("uploadBulkBtn").disabled = true;
      return;
    }
    const groups = {};
    bulkRows.filter(r => r._status === "checking").forEach(r => {
      const p = payloadFrom(r), k = `${p.class_level}|${p.chapter_number}`;
      (groups[k] ||= []).push(r);
    });
    for (const [k,items] of Object.entries(groups)) {
      const [cl,ch] = k.split("|").map(Number);
      try {
        const {data,error} = await sb.from("questions").select("id,question_text").eq("class_level",cl).eq("chapter_number",ch);
        if (error) throw error;
        const existing = new Set((data||[]).map(q=>normalize(q.question_text)));
        const ids = new Set((data||[]).map(q=>String(q.id)));
        for (const r of items) {
          const p = payloadFrom(r);
          if (existing.has(normalize(p.question_text))) { r._status="skip"; r._reason="पहले से database में मौजूद"; }
          else if (ids.has(p.id)) { r._status="skip"; r._reason="यह Question ID पहले से मौजूद है"; }
          else { r._status="ready"; r._reason="Upload के लिए तैयार"; }
        }
      } catch (e) {
        items.forEach(r=>{r._status="error";r._reason="Database check error: "+(e.message||e);});
      }
    }
    renderPreview();
    $("uploadBulkBtn").disabled = !bulkRows.some(r=>r._status==="ready");
    msg("bulkMessage","Preview पूरा हुआ। Upload से पहले rows और status जाँच लें।");
  }
  function renderPreview() {
    const counts = {ready:0,skip:0,error:0,added:0,checking:0};
    bulkRows.forEach(r=>counts[r._status]=(counts[r._status]||0)+1);
    $("bulkSummary").innerHTML = `कुल <b>${bulkRows.length}</b> | Upload Ready <b>${counts.ready||0}</b> | Duplicate Skip <b>${counts.skip||0}</b> | Invalid/Error <b>${counts.error||0}</b> | Added <b>${counts.added||0}</b>`;
    $("bulkPreviewList").innerHTML = bulkRows.map(r=>{
      const p=payloadFrom(r), cls=["ready","added"].includes(r._status)?"qb-ok":r._status==="skip"?"qb-skip":"qb-error";
      return `<tr><td>${r._row}</td><td>${escapeHtml(p.id)}</td><td>${escapeHtml(p.class_level)}</td><td>${escapeHtml(p.chapter_number)}</td><td>${escapeHtml(p.question_text)}</td><td class="${cls}">${escapeHtml(r._reason||r._status)}</td></tr>`;
    }).join("");
  }
  async function uploadBulk() {
    if (!(await requireAdminLogin())) return;
    if (!sb) { msg("bulkMessage","Supabase client नहीं मिला; upload नहीं किया जा सकता।","err"); return; }
    const ready=bulkRows.filter(r=>r._status==="ready");
    if (!ready.length) { msg("bulkMessage","Upload के लिए कोई valid नया प्रश्न नहीं है।","err"); return; }
    if (!confirm(`${ready.length} नए प्रश्न upload करें?`)) return;
    const btn=$("uploadBulkBtn"); btn.disabled=true; btn.textContent="Upload हो रहा है…";
    let added=0,failed=0;
    for (const r of ready) {
      const p=payloadFrom(r);
      try {
        const {data:existing,error:checkErr}=await sb.from("questions").select("id,question_text").eq("class_level",p.class_level).eq("chapter_number",p.chapter_number);
        if (checkErr) throw checkErr;
        if ((existing||[]).some(q=>normalize(q.question_text)===normalize(p.question_text)) || (existing||[]).some(q=>String(q.id)===p.id)) {
          r._status="skip"; r._reason="Upload से पहले duplicate मिला"; continue;
        }
        const {error}=await sb.from("questions").insert(p);
        if (error) throw error;
        r._status="added"; r._reason="Successfully Added"; added++;
      } catch (e) { r._status="error"; r._reason="Upload error: "+(e.message||e); failed++; }
    }
    renderPreview(); btn.textContent="🚀 Upload Valid Questions"; btn.disabled=true;
    const skipped=bulkRows.filter(r=>r._status==="skip").length;
    msg("bulkMessage",`Bulk Upload पूरा: Added ${added}, Duplicate Skip ${skipped}, Errors ${failed}${failed?" — Error rows नीचे देखें।":""}`,failed?"err":"ok");
    await loadQuestions();
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("adminLoginForm").addEventListener("submit", loginAdmin);
    $("adminLogoutBtn").addEventListener("click", logoutAdmin);
    // Bind every local button even if the Supabase CDN or client fails.
    $("downloadTemplateBtn").addEventListener("click", downloadTemplate);
    $("previewBulkBtn").addEventListener("click", () => preview().catch(e=>msg("bulkMessage","Preview error: "+(e.message||e),"err")));
    $("uploadBulkBtn").addEventListener("click", () => uploadBulk().catch(e=>msg("bulkMessage","Upload error: "+(e.message||e),"err")));
    $("refreshQuestions").addEventListener("click", loadQuestions);
    $("singleForm").addEventListener("submit", saveSingle);
    $("classLevel").addEventListener("change", fillChapters);
    fillChapters();

    try {
      const cfg=window.GS_SUPABASE_CONFIG;
      if (window.supabase && typeof window.supabase.createClient === "function" && cfg && cfg.url && cfg.publishableKey) {
        sb = window.supabaseClient || window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
        window.supabaseClient = window.supabaseClient || sb;
      }
    } catch (e) { msg("singleMessage","Supabase initialization error: "+(e.message||e),"err"); }
    if (sb) {
      sb.auth.onAuthStateChange(() => { setTimeout(async () => { await updateAuthUI(); }, 0); });
      updateAuthUI().then(() => loadQuestions()).catch(e => authMsg(e.message || e));
    }
    if (!sb) {
      msg("singleMessage","फॉर्म तैयार है, लेकिन Supabase client उपलब्ध नहीं है। CSV Template डाउनलोड कर सकते हैं; Save/Upload के लिए connection जरूरी है।","err");
      msg("bulkMessage","CSV Template डाउनलोड उपलब्ध है। Preview/Upload के लिए Supabase connection जरूरी है।","err");
    }
    if (!sb) loadQuestions();
  });
})();