/* Ganit Setu Content Planning — FINAL STABLE BUILD
   Self-contained Supabase client + plan generation + image master prompt.
   Does not require app.js / window.supabaseClient.
*/
(function () {
'use strict';

const GS_SUPABASE_URL = "https://cbgojvnbkosdehvwerth.supabase.co";
const GS_SUPABASE_ANON_KEY = "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";

// Content Planning uses the SAME Supabase client/session as the existing Admin Panel.
// Do not create a second Auth project/client here.
let authClient = window.supabaseClient || null;
let supabase = window.supabaseClient || null;

function loadSupabaseLibrary() {
  return new Promise((resolve, reject) => {
    if (window.supabase && typeof window.supabase.createClient === "function") { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Supabase library load नहीं हुई।"));
    document.head.appendChild(script);
  });
}

async function ensureSupabaseClient() {
  await loadSupabaseLibrary();
  authClient = window.supabaseClient || authClient;
  if (!authClient) {
    authClient = window.supabase.createClient(GS_SUPABASE_URL, GS_SUPABASE_ANON_KEY);
    window.supabaseClient = authClient;
  }
  supabase = authClient;
  return supabase;
}

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[c]));

let currentPlan = [];
let currentPlanId = null;
let importedDirectVideos = new Map();
let generatedVideoPromptText = '';
let selectedQuestionIds = new Set();
let questionSelectionRows = [];
let questionSelectionLoaded = false;
const PLATFORM_CONTENT_TYPES = {
  facebook: [
    ['text_post','Text Post'],['image_post','Image Post'],['carousel','Carousel'],['reel','Reel / Video'],['story','Story'],['poll','Poll']
  ],
  instagram: [
    ['feed_image','Feed Image'],['carousel','Carousel'],['reel','Reel'],['story','Story'],['text_graphic','Text Graphic']
  ],
  youtube: [
    ['video','Video'],['short','Short'],['thumbnail','Thumbnail'],['community_image','Community Image'],['community_text','Community Text'],['community_poll','Community Poll'],['community_quiz','Community Quiz']
  ],
  whatsapp: [
    ['text_update','Text Update'],['image','Image'],['video','Video'],['poll','Poll'],['link_cta','Link / CTA']
  ],
  advertisement: [
    ['image_ad','Image Ad'],['video_ad','Video Ad'],['text_ad','Text Ad'],['story_ad','Story Ad']
  ]
};


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

async function init() {
  try {
    await ensureSupabaseClient();
  } catch (e) {
    console.error('Ganit Setu Supabase init error:', e);
    alert(e.message || 'Supabase client उपलब्ध नहीं है।');
    return;
  }

  const { data: { session }, error: sessionError } = await authClient.auth.getSession();
  if (sessionError) {
    console.error('Session error:', sessionError);
    alert('Admin session पढ़ी नहीं जा सकी।');
    return;
  }
  if (!session) {
    location.href = 'index.html';
    return;
  }

  const start = $('#startDate');
  if (start && !start.value) {
    const d = new Date();
    start.value = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  }

  await loadSettings();
  await loadPoolStatus();
  populateDayFilter();
  bindEvents();
  bindRequirementControls();
  bindQuestionSelection();
  await loadQuestionSelection();
  renderPreviousPlans();
}

function populateDayFilter() {
  const f = $('#dayFilter');
  const n = Number($('#days')?.value || 1);
  if (!f) return;
  f.innerHTML = '<option value="all">सभी Days</option>' +
    Array.from({length:n}, (_,i) => `<option value="${i+1}">Day ${i+1}</option>`).join('');
}


function getContentRequirements() {
  const result = {};
  document.querySelectorAll('.content-count').forEach(sel => {
    const cls = String(sel.dataset.class);
    const type = String(sel.dataset.type);
    const count = Math.max(0, Math.min(5, Number(sel.value || 0)));
    (result[cls] ||= {})[type] = count;
  });
  return result;
}

function renderRequirementSummary() {
  const box = $('#requirementSummary');
  if (!box) return;
  const req = getContentRequirements();
  const lines = [];
  [9,10].forEach(cls => {
    const x = req[String(cls)] || {};
    const parts = [
      x.post ? `📱 Post ${x.post}` : '',
      x.image ? `🖼️ Image ${x.image}` : '',
      x.video ? `🎬 Reel/Video ${x.video}` : '',
      x.thumbnail ? `🖼️ Thumbnail ${x.thumbnail}` : ''
    ].filter(Boolean);
    lines.push(`<div><b>Class ${cls}:</b> ${parts.length ? parts.join(' • ') : 'आज कोई content नहीं चुना'}</div>`);
  });
  box.innerHTML = lines.join('');
}

function bindRequirementControls() {
  document.querySelectorAll('.content-count').forEach(sel => {
    sel.addEventListener('change', renderRequirementSummary);
  });
  document.querySelectorAll('.select-all-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = btn.dataset.class;
      document.querySelectorAll(`.content-count[data-class="${cls}"]`).forEach(sel => sel.value = '0');
      renderRequirementSummary();
    });
  });
  renderRequirementSummary();
}

function bindQuestionSelection() {
  $('#qsClass')?.addEventListener('change', async () => {
    selectedQuestionIds.clear();
    await loadQuestionSelection();
  });
  $('#qsChapter')?.addEventListener('change', renderQuestionSelection);
  $('#qsSearch')?.addEventListener('input', renderQuestionSelection);
  $('#qsRefreshBtn')?.addEventListener('click', loadQuestionSelection);
  $('#qsClearBtn')?.addEventListener('click', () => {
    selectedQuestionIds.clear();
    updateQuestionSelectionUI();
    renderQuestionSelection();
    setQuestionSelectionStatus('Selection clear कर दी गई।', 'success');
  });
  $('#qsSaveBtn')?.addEventListener('click', saveQuestionSelection);
  $('#qsContinueBtn')?.addEventListener('click', () => {
    if (!selectedQuestionIds.size) {
      setQuestionSelectionStatus('पहले कम से कम 1 Question select करें।', 'error');
      return;
    }
    saveQuestionSelection(false);
    $('#questionSelectionPanel')?.scrollIntoView({behavior:'smooth', block:'start'});
    document.querySelector('.requirement-panel')?.scrollIntoView({behavior:'smooth', block:'start'});
  });
}

async function loadQuestionSelection() {
  const box = $('#qsAvailableQuestions');
  if (!box) return;
  box.innerHTML = '<div class="loading-box">Questions लोड हो रहे हैं...</div>';
  try {
    const cls = Number($('#qsClass')?.value || 9);
    const { data, error } = await supabase
      .from('questions')
      .select('id,class_level,chapter_number,chapter_name,question_text,option_a,option_b,option_c,option_d')
      .eq('class_level', cls)
      .order('chapter_number', {ascending:true})
      .order('id', {ascending:true})
      .limit(2000);
    if (error) throw error;
    questionSelectionRows = data || [];
    questionSelectionLoaded = true;
    const saved = localStorage.getItem('ganitSetuSelectedQuestions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Number(parsed.class_level) === cls && Array.isArray(parsed.question_ids)) {
          const validIds = new Set(questionSelectionRows.map(q => Number(q.id)));
          selectedQuestionIds = new Set(parsed.question_ids.map(Number).filter(id => validIds.has(id)).slice(0,5));
        }
      } catch (_) {}
    }
    populateQuestionChapterFilter();
    renderQuestionSelection();
  } catch (e) {
    questionSelectionRows = [];
    questionSelectionLoaded = false;
    box.innerHTML = `<div class="error-box">Questions लोड नहीं हो सके: ${esc(e.message)}</div>`;
    updateQuestionSelectionUI();
  }
}

function populateQuestionChapterFilter() {
  const select = $('#qsChapter');
  if (!select) return;
  const current = select.value || 'all';
  const chapters = [...new Map(questionSelectionRows.map(q => [String(q.chapter_number ?? ''), q])).entries()]
    .filter(([n]) => n !== '')
    .sort((a,b) => Number(a[0]) - Number(b[0]));
  select.innerHTML = '<option value="all">सभी Chapters</option>' + chapters.map(([n,q]) =>
    `<option value="${esc(n)}">Chapter ${esc(n)}${q.chapter_name ? ` — ${esc(q.chapter_name)}` : ''}</option>`
  ).join('');
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

function getFilteredQuestionSelectionRows() {
  const chapter = String($('#qsChapter')?.value || 'all');
  const search = String($('#qsSearch')?.value || '').trim().toLowerCase();
  return questionSelectionRows.filter(q => {
    const chapterOk = chapter === 'all' || String(q.chapter_number ?? '') === chapter;
    if (!chapterOk) return false;
    if (!search) return true;
    const hay = [q.id, q.question_text, q.chapter_number, q.chapter_name].join(' ').toLowerCase();
    return hay.includes(search);
  });
}

function renderQuestionSelection() {
  const box = $('#qsAvailableQuestions');
  if (!box) return;
  const rows = getFilteredQuestionSelectionRows();
  const count = $('#qsResultCount');
  if (count) count.textContent = `${rows.length} Questions उपलब्ध`;
  if (!rows.length) {
    box.innerHTML = '<div class="empty-box">इस filter में कोई Question नहीं मिला।</div>';
    updateQuestionSelectionUI();
    return;
  }
  box.innerHTML = rows.map(q => {
    const id = Number(q.id);
    const selected = selectedQuestionIds.has(id);
    const safeText = esc(q.question_text || '');
    return `<div class="qs-question-row ${selected ? 'is-selected' : ''}" data-qrow="${id}">
      <input class="qs-check" type="checkbox" data-qselect="${id}" ${selected ? 'checked' : ''} aria-label="Select Q${id}">
      <div class="qs-question-main">
        <div class="qs-question-meta">
          <span class="qs-meta-pill">Q${id}</span>
          <span class="qs-meta-pill">Class ${esc(q.class_level)}</span>
          <span class="qs-meta-pill">Chapter ${esc(q.chapter_number ?? '—')}${q.chapter_name ? ` — ${esc(q.chapter_name)}` : ''}</span>
        </div>
        <div class="qs-question-text">${safeText || 'Question text उपलब्ध नहीं है।'}</div>
      </div>
      <button type="button" class="qs-select-btn ${selected ? 'selected' : ''}" data-qbutton="${id}">${selected ? '✓ Selected' : 'Select'}</button>
    </div>`;
  }).join('');

  box.querySelectorAll('[data-qselect]').forEach(el => el.addEventListener('change', () => toggleQuestionSelection(Number(el.dataset.qselect))));
  box.querySelectorAll('[data-qbutton]').forEach(el => el.addEventListener('click', () => toggleQuestionSelection(Number(el.dataset.qbutton))));
  updateQuestionSelectionUI();
}

function toggleQuestionSelection(id) {
  if (selectedQuestionIds.has(id)) {
    selectedQuestionIds.delete(id);
  } else {
    if (selectedQuestionIds.size >= 5) {
      setQuestionSelectionStatus('अधिकतम 5 Questions चुन सकते हैं।', 'error');
      return;
    }
    selectedQuestionIds.add(id);
  }
  renderQuestionSelection();
  setQuestionSelectionStatus('', '');
}

function updateQuestionSelectionUI() {
  const n = selectedQuestionIds.size;
  const badge = $('#qsSelectedBadge');
  const count = $('#qsSelectedCount');
  const list = $('#qsSelectedList');
  if (badge) badge.textContent = `Selected: ${n} / 5`;
  if (count) count.textContent = `Selected Questions: ${n}`;
  if (list) {
    if (!n) list.textContent = 'अभी कोई Question select नहीं है।';
    else list.innerHTML = [...selectedQuestionIds].map(id => `<span class="qs-selected-chip">Q${esc(id)}</span>`).join('');
  }
}

function saveQuestionSelection(showMessage = true) {
  const payload = {
    version: 1,
    saved_at: new Date().toISOString(),
    class_level: Number($('#qsClass')?.value || 9),
    chapter: String($('#qsChapter')?.value || 'all'),
    question_ids: [...selectedQuestionIds].map(Number)
  };
  localStorage.setItem('ganitSetuSelectedQuestions', JSON.stringify(payload));
  if (showMessage) setQuestionSelectionStatus(`${payload.question_ids.length} Questions की selection save हो गई।`, 'success');
}

function setQuestionSelectionStatus(message, type) {
  const el = $('#qsStatus');
  if (!el) return;
  el.textContent = message || '';
  el.className = `qs-status ${type || ''}`.trim();
}

function bindEvents() {
  $('#generateBtn')?.addEventListener('click', () => generatePlan());
  $('#copyPlanIdBtn')?.addEventListener('click', copyPlanId);
  $('#days')?.addEventListener('change', () => { populateDayFilter(); renderPlan(); });
  $('#startDate')?.addEventListener('change', loadPoolStatus);
  ['dayFilter','classFilter','typeFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderPlan);
  });
  $('#selectAllQuestionsBtn')?.addEventListener('click', () => {
    [...new Set(currentPlan.map(x => Number(x.question_id)))].forEach(id => selectedQuestionIds.add(id));
  });
  $('#clearSelectedQuestionsBtn')?.addEventListener('click', () => {
  });
  $('#clearMappingsBtn')?.addEventListener('click', () => {
  });
  $('#mappingPlatformSelect')?.addEventListener('change', populateMappingTypeSelect);
  $('#contentZip')?.addEventListener('change', handleContentZipUpload);
  $('#videoFiles')?.addEventListener('change', handleDirectVideoUpload);
  $('#loadAssetPlanBtn')?.addEventListener('click', loadOptionalAssetPlan);
  $('#refreshPreviousPlansBtn')?.addEventListener('click', renderPreviousPlans);
  $('#publishMode')?.addEventListener('change', togglePublishSchedule);
  $('#reviewPublishBtn')?.addEventListener('click', buildPublishReview);
}

async function loadSettings() {
  // The current UI uses exact per-class/per-content quantities selected by the admin.
  // The legacy content_automation_settings table is intentionally not used here.
  const box = $('#settingsBox');
  if (box) box.innerHTML = '<div class="muted">आज की quantity नीचे Class 9 / Class 10 से चुनी जाती है।</div>';
}

async function loadPoolStatus() {
  const box = $('#poolStatus');
  if (!box) return;
  try {
    const startDate = $('#startDate')?.value || new Date().toISOString().slice(0,10);
    const { data, error } = await supabase.rpc('get_content_question_pool_status', { p_date: startDate });
    if (error) throw error;

    const rows = data || [];
    box.innerHTML = rows.map(r => `
      <div class="pool-card">
        <div class="pool-title">📘 कक्षा ${r.class_level}</div>
        <div class="pool-grid">
          <div><small>कुल Eligible</small><strong>${r.total_eligible}</strong></div>
          <div><small>Cycle में Used</small><strong>${r.used_in_cycle}</strong></div>
          <div><small>शेष</small><strong>${r.remaining_in_cycle}</strong></div>
          <div><small>Current Cycle</small><strong>${r.current_cycle}</strong></div>
        </div>
        <div class="pool-chapter">इस महीने: Chapter ${r.chapter_from}–${r.chapter_to}</div>
      </div>
    `).join('') || '<div class="muted">Pool status उपलब्ध नहीं है।</div>';
  } catch (e) {
    box.innerHTML = `<div class="error-box">Pool status नहीं पढ़ा जा सका: ${esc(e.message)}</div>`;
  }
}

async function generatePlan() {
  const startDate = $('#startDate')?.value;
  const days = Number($('#days')?.value || 1);
  if (!startDate) {
    alert('Start Date चुनिए।');
    return;
  }

  const btn = $('#generateBtn');
  if (btn) {
    btn.disabled = true;
    btn.dataset.oldText = btn.textContent;
    btn.textContent = '⏳ Plan बनाया जा रहा है...';
  }

  try {
    const req = getContentRequirements();
    const totalRequested = Object.values(req).reduce((sum, c) =>
      sum + Object.values(c || {}).reduce((a, n) => a + Number(n || 0), 0), 0);

    if (!totalRequested) {
      throw new Error('कम से कम एक Content Type की quantity चुनिए।');
    }

    const reuseQuestions = false; // Ganit Setu rule: NEVER reuse a question on the same day.

    const { data, error } = await supabase.rpc('generate_content_plan_v4', {
      p_start_date: startDate,
      p_days: days,
      p_requirements: req,
      p_reuse_questions: reuseQuestions
    });
    if (error) throw error;

    currentPlan = data || [];
    currentPlanId = currentPlan[0]?.plan_id || null;
    archiveCurrentPlan();

    // Video Scene Manager must use the EXACT questions selected by Content Day Planning.
    // Store only the generated plan context; Video Scene Manager will filter video rows
    // and load the same Question IDs instead of generating a second/random selection.
    try {
      const videoRows = currentPlan
        .filter(r => String(r.content_type || '').toLowerCase() === 'video')
        .map(r => ({
          plan_id: r.plan_id || currentPlanId || null,
          plan_day: Number(r.plan_day || 1),
          content_date: r.content_date || startDate || null,
          question_id: Number(r.question_id),
          class_level: Number(r.class_level),
          chapter_number: r.chapter_number != null ? Number(r.chapter_number) : null,
          selection_order: Number(r.selection_order || 0),
          content_type: 'video'
        }))
        .filter(r => Number.isFinite(r.question_id));

      localStorage.setItem('ganitSetuVideoScenePlan', JSON.stringify({
        version: 1,
        generated_at: new Date().toISOString(),
        plan_id: currentPlanId || null,
        start_date: startDate,
        days,
        rows: videoRows
      }));
    } catch (handoffErr) {
      console.warn('Video Scene Manager handoff save failed:', handoffErr);
    }

    showNotice('success', 'Content Plan successfully generate हो गया। Video Scene Manager के लिए यही selected Video Questions भेज दिए गए हैं।');
    updatePlanSummary();
    renderPlan();
    await loadPoolStatus();
  } catch (e) {
    showNotice('error', e.message || 'Plan generate नहीं हो सका।');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.dataset.oldText || '🚀 Generate Content Plan';
    }
  }
}

function updatePlanSummary() {
  const summary = $('#planSummary');
  if (!summary) return;

  const classes = [...new Set(currentPlan.map(x => x.class_level))];
  const days = [...new Set(currentPlan.map(x => x.plan_day))].length;
  summary.innerHTML = `
    <div><b>Plan तैयार है</b></div>
    <div>${days} Day • ${classes.map(c => `Class ${c}`).join(' • ')}</div>
    <div>${currentPlan.length} total content-question entries</div>
    ${currentPlanId ? `<div class="plan-id">Plan ID: <code>${esc(currentPlanId)}</code>
      <button id="copyPlanIdBtn2" type="button">Copy</button></div>` : ''}
    <div class="verify-all-wrap" style="margin-top:12px;">
      <button id="verifyAllPlatformsBtn" type="button" class="primary-btn">
        🔍 Verify All Platforms
      </button>
      <div id="verifyAllPlatformsResult" class="verify-all-result" style="margin-top:10px;"></div>
    </div>
  `;
  $('#copyPlanIdBtn2')?.addEventListener('click', copyPlanId);
}

function filteredRows() {
  const day = $('#dayFilter')?.value || 'all';
  const cls = $('#classFilter')?.value || 'all';
  const type = $('#typeFilter')?.value || 'all';
  return currentPlan.filter(x =>
    (day === 'all' || String(x.plan_day) === day) &&
    (cls === 'all' || String(x.class_level) === cls) &&
    (type === 'all' || x.content_type === type)
  );
}

async function fetchQuestions(ids) {
  if (!ids.length) return {};
  const unique = [...new Set(ids.map(Number))];
  const { data, error } = await supabase
    .from('questions')
    .select('id,class_level,chapter_number,chapter_name,question_text,option_a,option_b,option_c,option_d,correct_option,explanation,hint')
    .in('id', unique);
  if (error) throw error;
  return Object.fromEntries((data || []).map(q => [Number(q.id), q]));
}

async function renderPlan() {
  const container = $('#planResults');
  if (!container) return;

  if (!currentPlan.length) {
    container.innerHTML = `<div class="empty-box">अभी कोई Plan generate नहीं हुआ है।</div>`;
    return;
  }

  const rows = filteredRows();
  if (!rows.length) {
    container.innerHTML = `<div class="empty-box">इस filter में कोई question नहीं है।</div>`;
    return;
  }

  container.innerHTML = `<div class="loading-box">Questions लोड हो रहे हैं...</div>`;
  try {
    const qmap = await fetchQuestions(rows.map(x => x.question_id));
    const grouped = {};
    for (const r of rows) {
      const key = `${r.plan_day}`;
      (grouped[key] ||= []).push(r);
    }

    container.innerHTML = Object.entries(grouped).sort((a,b)=>Number(a[0])-Number(b[0])).map(([day, items]) => {
      const byClass = {};
      items.forEach(r => (byClass[r.class_level] ||= []).push(r));
      return `<section class="day-section">
        <div class="day-heading">
          <h2>Day ${esc(day)}</h2>
          <span>${esc(items[0]?.content_date || '')}</span>
        </div>
        ${Object.entries(byClass).sort((a,b)=>Number(a[0])-Number(b[0])).map(([cls, rs]) => `
          <div class="class-section">
            <h3>📘 कक्षा ${esc(cls)} <span>${rs.length} Questions</span></h3>
            <div class="question-grid">
              ${rs.sort((a,b)=>a.selection_order-b.selection_order).map((r,idx) => {
                const q = qmap[Number(r.question_id)];
                return questionCard(r,q,idx+1);
              }).join('')}
            </div>
          </div>
        `).join('')}
      </section>`;
    }).join('');
    container.querySelectorAll('.question-select-checkbox').forEach(cb => cb.addEventListener('change', e => {
      const id = Number(e.target.dataset.questionId);
    }));
  } catch (e) {
    container.innerHTML = `<div class="error-box">
      <b>Question लोड नहीं हो पाए।</b><br>${esc(e.message)}
    </div>`;
  }
}


/* =========================================================
   FACEBOOK PUBLISHING
   Uses the existing social_publish_queue / social_publish_logs
   through the secure facebook-oauth Edge Function.
   Page tokens never enter the browser.
   ========================================================= */

const FACEBOOK_PUBLISH_FUNCTION = `${GS_SUPABASE_URL}/functions/v1/facebook-oauth`;

function buildFacebookContent(r, q) {
  if (!q) return { title: `Ganit Setu Q${r.question_id}`, caption: '', description: '', hashtags: '#GanitSetu #Maths #MPBoard' };
  const title = `आज का गणित प्रश्न | कक्षा ${q.class_level} | अध्याय ${q.chapter_number}`;
  const caption = [
    `📘 GANIT SETU`,
    `कक्षा ${q.class_level} | अध्याय ${q.chapter_number} — ${q.chapter_name || ''}`,
    `\n🧮 आज का गणित प्रश्न:`,
    q.question_text,
    `\nA) ${q.option_a}`,
    `B) ${q.option_b}`,
    `C) ${q.option_c}`,
    `D) ${q.option_d}`,
    `\n🤔 आपका उत्तर क्या है? Comment करके बताइए!`
  ].join('\n');
  const description = `${q.question_text}\n\nHint: ${q.hint || 'Comment करके उत्तर बताइए।'}\n\nGanit Setu — MP Board Mathematics Learning`;
  const hashtags = '#GanitSetu #MPBoard #Mathematics #MathsQuestion #Class' + q.class_level;
  const answerComment = `✅ सही उत्तर: ${q.correct_option || ''}\n💡 Hint: ${q.hint || ''}\n📖 Explanation: ${q.explanation || ''}`;
  return { title, caption, description, hashtags, answerComment };
}

async function getExistingFacebookQueue(r) {
  try {
    let query = supabase
      .from('social_publish_queue')
      .select('id,media_url,thumbnail_url,title,caption,description,hashtags,answer_comment,publish_mode,scheduled_at,status,external_post_id,external_url,error_message,updated_at')
      .eq('plan_id', r.plan_id)
      .eq('question_id', r.question_id)
      .eq('platform', 'facebook')
      .eq('content_type', r.content_type)
      .order('updated_at', { ascending: false })
      .limit(1);
    const { data, error } = await query.maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

async function publishQuestionToFacebook(r, q, button) {
  if (!q) {
    showNotice('error', 'Question data उपलब्ध नहीं है।');
    return;
  }

  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = '⏳ Facebook पर publish हो रहा है...';

  try {
    const existing = await getExistingFacebookQueue(r);
    let mediaUrl = existing?.media_url || '';

    if (r.content_type === 'image' || r.content_type === 'video') {
      if (!mediaUrl) {
        mediaUrl = window.prompt(
          r.content_type === 'image'
            ? 'Facebook पर publish करने वाली IMAGE की public HTTPS URL डालें:'
            : 'Facebook पर publish करने वाली VIDEO की public HTTPS URL डालें:',
          ''
        )?.trim() || '';
      }
      if (!mediaUrl) {
        throw new Error('Media URL नहीं दिया गया।');
      }
      if (!/^https:\/\//i.test(mediaUrl)) {
        throw new Error('Media URL public HTTPS URL होना चाहिए।');
      }
    }

    const meta = buildFacebookContent(r, q);
    const payload = {
      action: 'publish',
      queue_id: existing?.id || null,
      question_id: Number(r.question_id),
      plan_id: r.plan_id || currentPlanId || null,
      class_level: Number(r.class_level),
      platform: 'facebook',
      content_type: r.content_type,
      media_url: mediaUrl || null,
      thumbnail_url: null,
      title: meta.title,
      caption: meta.caption,
      description: meta.description,
      hashtags: meta.hashtags,
      answer_comment: meta.answerComment,
      publish_mode: 'now'
    };

    const { data: { session } } = await authClient.auth.getSession();
    if (!session?.access_token) throw new Error('Admin session उपलब्ध नहीं है।');

    const response = await fetch(FACEBOOK_PUBLISH_FUNCTION, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': GS_SUPABASE_ANON_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success) {
      throw new Error(data?.error || data?.meta_error_message || 'Facebook publishing failed.');
    }

    button.textContent = '✅ Facebook Published';
    button.classList.add('published');
    if (data.external_url) {
      button.title = data.external_url;
    }
    showNotice('success', `Facebook पर सफलतापूर्वक publish हो गया।${data.external_post_id ? ` Post ID: ${data.external_post_id}` : ''}`);

    const card = button.closest('.question-card');
    if (card && data.external_url) {
      let link = card.querySelector('.facebook-published-link');
      if (!link) {
        link = document.createElement('a');
        link.className = 'facebook-published-link';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        card.querySelector('.q-actions')?.appendChild(link);
      }
      link.href = data.external_url;
      link.textContent = '🔗 View Facebook Post';
    }
  } catch (e) {
    button.disabled = false;
    button.textContent = oldText;
    showNotice('error', e.message || 'Facebook publish नहीं हो सका।');
  }
}


/* =========================================================
   INSTAGRAM IMAGE UPLOAD + REAL PUBLISH
   Admin selects an image locally. The browser uploads it
   automatically to the existing public Storage bucket,
   obtains the HTTPS URL internally, and sends it to the
   deployed instagram-publish Edge Function.
   ========================================================= */

const INSTAGRAM_PUBLISH_FUNCTION =
  `${GS_SUPABASE_URL}/functions/v1/instagram-publish`;

const YOUTUBE_PUBLISH_FUNCTION =
  `${GS_SUPABASE_URL}/functions/v1/youtube-publish`;

const VERIFY_PLATFORM_FUNCTION =
  `${GS_SUPABASE_URL}/functions/v1/verify-platform-publish`;

const YOUTUBE_UPLOAD_BUCKET = 'home-banners';

// Temporary test storage bucket. The admin never sees or enters this URL.
const INSTAGRAM_TEST_BUCKET = 'home-banners';

function buildInstagramCaption(q) {
  if (!q) return 'Ganit Setu';
  return [
    '📘 GANIT SETU',
    `कक्षा ${q.class_level} | अध्याय ${q.chapter_number} — ${q.chapter_name || ''}`,
    '',
    '🧮 आज का गणित प्रश्न:',
    q.question_text,
    '',
    `A) ${q.option_a}`,
    `B) ${q.option_b}`,
    `C) ${q.option_c}`,
    `D) ${q.option_d}`,
    '',
    '🤔 आपका उत्तर क्या है?',
    '',
    '#GanitSetu #Maths #MPBoard #Class' + q.class_level
  ].join('\n');
}

async function publishQuestionToInstagram(r, q, button) {
  if (!q) {
    showNotice('error', 'Question data उपलब्ध नहीं है।');
    return;
  }

  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = '⏳ Image चुनें...';

  try {
    // One-click file picker. No URL is requested from the admin.
    const file = await new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';

      input.addEventListener('change', () => {
        const selected = input.files?.[0] || null;
        document.body.removeChild(input);
        resolve(selected);
      }, { once: true });

      document.body.appendChild(input);
      input.click();
    });

    if (!file) {
      throw new Error('Image select नहीं की गई।');
    }

    if (!file.type.startsWith('image/')) {
      throw new Error('कृपया केवल image file चुनें।');
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Image 10 MB से छोटी रखें।');
    }

    if (!supabase || !authClient) {
      await ensureSupabaseClient();
    }

    const { data: sessionData, error: sessionError } =
      await authClient.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      throw new Error('Admin session उपलब्ध नहीं है।');
    }

    button.textContent = '⏳ Image upload हो रही है...';

    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.+/g, '.');

    const path =
      `instagram-test/${Date.now()}-Q${Number(r.question_id)}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(INSTAGRAM_TEST_BUCKET)
      .upload(path, file, {
        upsert: false,
        contentType: file.type,
        cacheControl: '3600'
      });

    if (uploadError) {
      throw new Error(
        `Image upload failed: ${uploadError.message}`
      );
    }

    const { data: publicData } = supabase.storage
      .from(INSTAGRAM_TEST_BUCKET)
      .getPublicUrl(path);

    const mediaUrl = publicData?.publicUrl || '';

    if (!/^https:\/\//i.test(mediaUrl)) {
      throw new Error('Uploaded image का public HTTPS URL नहीं मिला।');
    }

    button.textContent = '⏳ Instagram पर publish हो रहा है...';

    const payload = {
      access_token: sessionData.session.access_token,
      media_url: mediaUrl,
      caption: buildInstagramCaption(q),
      question_id: Number(r.question_id),
      plan_id: r.plan_id || currentPlanId || null,
      class_level: Number(r.class_level)
    };

    const response = await fetch(INSTAGRAM_PUBLISH_FUNCTION, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionData.session.access_token}`,
        'x-user-access-token': sessionData.session.access_token,
        'apikey': GS_SUPABASE_ANON_KEY
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result?.success) {
      throw new Error(
        result?.error || 'Instagram publishing failed.'
      );
    }

    button.textContent = '✅ Instagram Published';
    button.classList.add('published');
    button.disabled = true;

    showNotice(
      'success',
      `Instagram पर image सफलतापूर्वक publish हो गई। Media ID: ${result.media_id || 'available'}`
    );

  } catch (e) {
    const message = e?.message || String(e) || 'Instagram publish नहीं हो सका।';
    console.error('Instagram Publish Error:', e);

    button.disabled = false;
    button.textContent = oldText;

    showNotice(
      'error',
      `❌ Instagram पर पोस्ट नहीं हो सकी।<br><br><b>Error:</b> ${esc(message)}`
    );
  }
}


/* =========================================================
   YOUTUBE PUBLISHING
   Admin selects the actual VIDEO file locally.
   The browser uploads it to Supabase Storage internally.
   Admin never enters a URL.
   ========================================================= */

function buildYouTubeContent(q) {
  if (!q) {
    return {
      title: 'Ganit Setu',
      description: 'Ganit Setu — MP Board Mathematics Learning',
      tags: ['GanitSetu', 'MPBoard', 'Mathematics']
    };
  }

  const title =
    `कक्षा ${q.class_level} गणित | अध्याय ${q.chapter_number} — ${q.chapter_name || ''}`;

  const description = [
    '📘 GANIT SETU',
    `कक्षा ${q.class_level} | अध्याय ${q.chapter_number} — ${q.chapter_name || ''}`,
    '',
    '🧮 आज का गणित प्रश्न:',
    q.question_text,
    '',
    `A) ${q.option_a}`,
    `B) ${q.option_b}`,
    `C) ${q.option_c}`,
    `D) ${q.option_d}`,
    '',
    `💡 Hint: ${q.hint || ''}`,
    '',
    'Ganit Setu — MP Board Mathematics Learning',
    '#GanitSetu #MPBoard #Mathematics'
  ].join('\n');

  return {
    title,
    description,
    tags: [
      'GanitSetu',
      'MPBoard',
      'Mathematics',
      'Maths',
      `Class${q.class_level}`,
      `Chapter${q.chapter_number}`
    ]
  };
}

async function publishQuestionToYouTube(r, q, button) {
  if (!q) {
    showNotice('error', 'Question data उपलब्ध नहीं है।');
    return;
  }

  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = '⏳ Video चुनें...';

  try {
    const file = await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*';
      input.style.display = 'none';

      input.addEventListener('change', () => {
        const selected = input.files?.[0] || null;
        input.remove();
        resolve(selected);
      }, { once: true });

      document.body.appendChild(input);
      input.click();
    });

    if (!file) {
      throw new Error('Video select नहीं किया गया।');
    }

    if (!file.type.startsWith('video/')) {
      throw new Error('कृपया केवल video file चुनें।');
    }

    if (!supabase || !authClient) {
      await ensureSupabaseClient();
    }

    const { data: sessionData, error: sessionError } =
      await authClient.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      throw new Error('Admin session उपलब्ध नहीं है।');
    }

    button.textContent = '⏳ Video Storage में upload हो रहा है...';

    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.+/g, '.');

    const path =
      `youtube-content/${Date.now()}-Q${Number(r.question_id)}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(YOUTUBE_UPLOAD_BUCKET)
      .upload(path, file, {
        upsert: false,
        contentType: file.type,
        cacheControl: '3600'
      });

    if (uploadError) {
      throw new Error(
        `Video upload failed: ${uploadError.message}`
      );
    }

    button.textContent = '⏳ YouTube पर publish हो रहा है...';

    const meta = buildYouTubeContent(q);

    /*
     * IMPORTANT:
     * Admin को कोई URL नहीं देना है.
     * केवल internal Supabase Storage path भेजा जा रहा है.
     */
    const payload = {
      storage_bucket: YOUTUBE_UPLOAD_BUCKET,
      storage_path: path,
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      privacy_status: 'private',
      question_id: Number(r.question_id),
      plan_id: r.plan_id || currentPlanId || null,
      class_level: Number(r.class_level)
    };

    const response = await fetch(
      YOUTUBE_PUBLISH_FUNCTION,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization':
            `Bearer ${sessionData.session.access_token}`,
          'apikey':
            GS_SUPABASE_ANON_KEY
        },
        body: JSON.stringify(payload)
      }
    );

    const result =
      await response.json().catch(() => ({}));

    if (!response.ok || !result?.ok) {
      throw new Error(
        result?.error ||
        'YouTube publishing failed.'
      );
    }

    button.textContent = '✅ YouTube Published';
    button.classList.add('published');
    button.disabled = true;

    showNotice(
      'success',
      `YouTube पर video सफलतापूर्वक publish हो गया। Video ID: ${result.video_id || 'available'}`
    );

    const card = button.closest('.question-card');

    if (card && result.video_id) {
      card.dataset.youtubeVideoId = result.video_id;
    }

    if (card && result.video_url) {
      let link =
        card.querySelector('.youtube-published-link');

      if (!link) {
        link = document.createElement('a');
        link.className = 'youtube-published-link';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        card.querySelector('.q-actions')?.appendChild(link);
      }

      link.href = result.video_url;
      link.textContent = '🔗 View YouTube Video';
    }

  } catch (e) {
    console.error(
      'YouTube Publish Error:',
      e
    );

    button.disabled = false;
    button.textContent = oldText;

    showNotice(
      'error',
      `❌ YouTube पर video publish नहीं हो सका।<br><br><b>Error:</b> ${esc(e?.message || String(e))}`
    );
  }
}

function questionCard(r,q,number) {
  const text = q?.question_text;
  const opts = q ? [
    ['A',q.option_a],['B',q.option_b],['C',q.option_c],['D',q.option_d]
  ] : [];

  const full = q ? [
    `Question ID: Q${q.id}`,
    `Class ${q.class_level} | Chapter ${q.chapter_number} — ${q.chapter_name}`,
    ``,
    q.question_text,
    `A) ${q.option_a}`,
    `B) ${q.option_b}`,
    `C) ${q.option_c}`,
    `D) ${q.option_d}`,
    `Correct Answer: ${q.correct_option}`,
    `Hint: ${q.hint || ''}`,
    `Explanation: ${q.explanation || ''}`
  ].join('\n') : `Question ID: Q${r.question_id}\nChapter ${r.chapter_number} — ${r.chapter_name}`;

  return `<article class="question-card">
    <div class="q-top">
      <span class="q-number">${number}</span>
      <span class="type-badge">${r.content_type === 'image' ? '🖼️ Image Question' : r.content_type === 'video' ? '🎬 Video Question' : r.content_type === 'thumbnail' ? '🖼️ Thumbnail Question' : `${typeLabel(r.content_type)} Question`}</span>
      <span class="chapter-badge">Chapter ${esc(r.chapter_number)}</span>
      <span class="cycle-badge">Cycle ${esc(r.cycle_number)}</span>
    </div>
    <div class="q-title">Question ID: <b>Q${esc(r.question_id)}</b> <span>• ${esc(r.chapter_name)}</span></div>
    ${q ? `
      <div class="question-text">${esc(text)}</div>
      <div class="options">
        ${opts.map(([l,v]) => `<div class="option"><b>${l})</b> ${esc(v)}</div>`).join('')}
      </div>
      <div class="answer-box">
        <div>✅ <b>सही उत्तर:</b> ${esc(q.correct_option || 'उपलब्ध नहीं')}</div>
        <div>💡 <b>Hint:</b> ${esc(q.hint || 'Hint उपलब्ध नहीं है।')}</div>
        <div>📖 <b>Explanation:</b> ${esc(q.explanation || 'Explanation उपलब्ध नहीं है।')}</div>
      </div>
    ` : `<div class="missing-question">Question data नहीं मिला। Question ID: Q${esc(r.question_id)}</div>`}
    <div class="prompt-actions centralized-prompt-actions">
      ${r.content_type === 'image' ? `<button type="button" class="prompt-btn image" data-prompt-kind="image" data-question-id="${esc(r.question_id)}">🖼️ Copy Image Prompt</button>` : ''}
      ${r.content_type === 'video' ? `<button type="button" class="prompt-btn video" data-prompt-kind="video" data-question-id="${esc(r.question_id)}">🎬 Copy Video Prompt</button>` : ''}
      ${r.content_type === 'thumbnail' ? `<button type="button" class="prompt-btn thumb" data-prompt-kind="thumbnail" data-question-id="${esc(r.question_id)}">🖼️ Copy Thumbnail Prompt</button>` : ''}
    </div>
  </article>`;
}


function buildIndividualPrompt(kind, q) {
  if (!q) return '';
  const base = [
    `Question ID: Q${q.id}`,
    `Class: ${q.class_level}`,
    `Chapter: ${q.chapter_number} — ${q.chapter_name || ''}`,
    `Question: ${q.question_text}`,
    `Options: A) ${q.option_a} | B) ${q.option_b} | C) ${q.option_c} | D) ${q.option_d}`,
    `Correct Answer: ${q.correct_option}`,
    `Hint: ${q.hint || ''}`,
    `Explanation: ${q.explanation || ''}`
  ].join('\\n');

  if (kind === 'image') {
    return `Create a clean, accurate educational mathematics image for Ganit Setu, MP Board Class ${q.class_level}. Use this exact question as the educational content. Do not change mathematical symbols, numbers, options, or answer. Make the design mobile-friendly, readable and professional.\\n\\n${base}`;
  }
  if (kind === 'video') {
    return `Create one short educational Reel/Video concept for Ganit Setu using only this mathematics question. Include a strong opening hook, clear on-screen question, simple explanation, answer reveal, and a concise Hindi voice-over script. Keep all mathematics exact.\\n\\n${base}`;
  }
  if (kind === 'thumbnail') {
    return `Create one YouTube/Video thumbnail concept for Ganit Setu based on this exact mathematics question. Make it highly readable on mobile, educational and uncluttered. Do not alter mathematical notation or answer.\\n\\n${base}`;
  }
  return `Generate the complete social-media content package for this one Ganit Setu mathematics question. Return separate fields for: Title, SEO Title, Caption, Description, SEO Keywords, Hashtags, CTA, and Answer/Explanation. Keep the question and mathematics exact, use natural Hindi suitable for MP Board Class ${q.class_level}, and do not create content for any other question.\\n\\n${base}`;
}

async function copyQuestionPrompt(kind, questionId, button) {
  try {
    const q = (await fetchQuestions([questionId]))[Number(questionId)];
    if (!q) throw new Error('Question data नहीं मिला।');
    await navigator.clipboard.writeText(buildIndividualPrompt(kind, q));
    const old = button.textContent;
    button.textContent = '✅ Copied';
    setTimeout(() => button.textContent = old, 1200);
  } catch (e) {
    showNotice('error', e.message || 'Prompt copy नहीं हुआ।');
  }
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.prompt-btn');
  if (!btn) return;
  copyQuestionPrompt(btn.dataset.promptKind, btn.dataset.questionId, btn);
});

/* =========================================================
   COMPLETE IMAGE MASTER PROMPT
   Class 9 / Class 10 are intentionally separate.
   One click copies ALL unique selected questions for a class.
   ========================================================= */

function buildCompleteImagePrompt(classLevel, classRows, qmap) {
  const seen = new Set();
  const questions = [];

  [...classRows]
    .sort((a,b) =>
      Number(a.plan_day || 0) - Number(b.plan_day || 0) ||
      Number(a.selection_order || 0) - Number(b.selection_order || 0)
    )
    .forEach(r => {
      const id = Number(r.question_id);
      if (seen.has(id)) return;
      seen.add(id);

      const q = qmap[id];
      if (q) questions.push({
        id,
        classLevel: Number(q.class_level),
        chapterNumber: Number(q.chapter_number),
        chapterName: q.chapter_name || '',
        question: q.question_text || '',
        A: q.option_a || '',
        B: q.option_b || '',
        C: q.option_c || '',
        D: q.option_d || '',
        answer: q.correct_option || '',
        hint: q.hint || '',
        explanation: q.explanation || ''
      });
    });

  if (!questions.length) {
    return `GANIT SETU COMPLETE IMAGE PROMPT\n\nClass ${classLevel}\n\nNo question data is currently loaded.`;
  }

  const questionData = questions.map((q, i) => `
QUESTION ${String(i + 1).padStart(2,'0')}
Question ID: Q${q.id}
Class: ${q.classLevel}
Chapter: ${q.chapterNumber} — ${q.chapterName}

Question:
${q.question}

Options:
A) ${q.A}
B) ${q.B}
C) ${q.C}
D) ${q.D}

INTERNAL ANSWER DATA (DO NOT SHOW ON QUIZ IMAGE):
Correct Answer: ${q.answer}
Hint: ${q.hint}
Explanation: ${q.explanation}
`).join('\n------------------------------\n');

  const fileNames = questions.map((q,i) => {
    const n = String(i + 1).padStart(2,'0');
    return [
      `Q${n}_FACEBOOK_INSTAGRAM_FEED.png`,
      `Q${n}_WHATSAPP_CHANNEL.png`,
      `Q${n}_INSTAGRAM_WHATSAPP_STATUS.png`,
      `Q${n}_CONTENT.txt`
    ].join('\n');
  }).join('\n');

  return `GANIT SETU — COMPLETE IMAGE BATCH MASTER PROMPT
MASTER VERSION: GS-IMAGE-01

ROLE
You are the official visual content designer for GANIT SETU, a Hindi Mathematics
learning platform for MP Board students.

BATCH
Create the complete image-content batch for Class ${classLevel}.
There are ${questions.length} unique selected questions in this batch.

VERY IMPORTANT
Process EVERY supplied question.
Do not skip, merge, invent, reorder, paraphrase, or duplicate questions.

OFFICIAL LOGO — MANDATORY REFERENCE
An official GANIT SETU logo image will be attached with this prompt.

Use that attached logo as the exact and permanent GANIT SETU brand reference.

DO NOT:
- redesign or recreate the logo
- replace the logo
- alter its colors, typography, proportions or Hindi text
- add an outer circle
- add or remove symbols
- stretch, rotate, crop or distort it

LOGO PLACEMENT
- Top-center.
- Slightly small and elegant.
- Give it a dedicated protected area.
- If needed, place it on a subtle clean white background/panel.
- The logo must NOT touch any banner, border, text, student, decoration
  or other object.
- Maintain visible breathing space on every side.
- Never overlap or be overlapped.
- Keep approximately the same visual scale and placement across the whole batch.

MASTER VISUAL STYLE
Every image must look like part of the same official GANIT SETU daily-question series.

Use the approved visual direction:
- premium educational classroom style
- green chalkboard
- warm classroom lighting
- wooden frame/desk elements
- books and tasteful stationery
- subtle plants and maths decorations
- attractive school-going student
- student has a curious/thinking expression
- optional subtle thought bubble/question mark
- clean, colorful, modern and professional
- attractive for Class 9 students
- readable for mobile screens
- no unnecessary clutter

CONSISTENCY RULE
For every question:
KEEP CONSISTENT:
- official logo
- logo size/placement
- classroom/chalkboard visual language
- typography character
- option-card treatment
- student-character concept
- visual hierarchy
- CTA treatment
- overall color/lighting character
- premium educational appearance

CHANGE ONLY:
- question-specific text
- class
- chapter
- options
- question-specific mathematical illustration

CLASS AND CHAPTER
Use ONLY the supplied database values.
Never guess or invent the class/chapter.

Display:
कक्षा ${classLevel}
अध्याय [SUPPLIED CHAPTER NUMBER AND NAME]

MAIN IMAGE CONTENT
For every question show:
GANIT SETU
कक्षा [Class]
अध्याय [Chapter Number — Chapter Name]
आज का गणित प्रश्न
[EXACT QUESTION]
A) [EXACT OPTION A]
B) [EXACT OPTION B]
C) [EXACT OPTION C]
D) [EXACT OPTION D]

ANSWER RULE
The supplied Correct Answer, Hint and Explanation are INTERNAL DATA.

DO NOT display the correct answer on the quiz image.
DO NOT highlight the correct option.
DO NOT put a check mark on the correct option.
DO NOT use color coding that reveals the answer.

STUDENT ENGAGEMENT
Use:
“आपका उत्तर क्या है? 🤔”
“Comment करके बताइए!”

Do not reveal the answer in the quiz image.

QUESTION-SPECIFIC VISUAL
Where useful, create a mathematically accurate supporting diagram,
graph, coordinate plane, geometric figure, number line, formula visual,
or other relevant maths illustration.
Never create a visual that contradicts the supplied question.
If no diagram is useful, use tasteful maths decoration instead.

THREE PLATFORM-SPECIFIC IMAGES FOR EVERY QUESTION

1) FACEBOOK + INSTAGRAM FEED
- Square 1:1.
- Purpose-built composition.
- Mobile-readable.
- Keep important content inside safe margins.

2) WHATSAPP CHANNEL
- Vertical mobile-friendly format.
- Purpose-built for a WhatsApp Channel post.
- Large readable question and options.

3) INSTAGRAM / WHATSAPP STATUS
- Vertical 9:16.
- Mobile-first.
- Large readable text.
- Keep important content in safe zones.

Do NOT simply resize one image into the other formats.
Each format must be composed separately while preserving the same master style.

CONTENT PACKAGE
For EACH question, also prepare accompanying text metadata:
- Title
- Short caption
- Description
- Answer Comment
- Hint
- Explanation
- CTA
- Relevant hashtags
- Relevant keywords

IMPORTANT:
The quiz images must hide the answer.
The Answer Comment must contain the correct answer and may contain the explanation.
The title/caption/description/hashtags must correspond to the SAME Question ID.

ANSWER COMMENT FORMAT
For each question create a ready-to-post comment such as:
“✅ सही उत्तर: [Correct Option + option text]
💡 Hint: [Hint]
📖 Explanation: [Explanation]”

Do not reveal an answer anywhere in the quiz image itself.

FILE NAMES
Use exactly these filenames:

${fileNames}

BATCH / ZIP
Generate all requested images and content for ALL questions in this batch.
Package the completed files into ONE ZIP for Class ${classLevel}.

The ZIP should contain:
- all 3 platform images for every question
- the corresponding content/metadata file for every question

Do not create one separate ZIP per question.

QUALITY CONTROL — BEFORE DELIVERY
Check every question:
1. Correct Question ID.
2. Correct Class.
3. Correct Chapter Number.
4. Correct Chapter Name.
5. Exact question text.
6. Exact A-D options.
7. Correct answer remains hidden from quiz images.
8. Hint remains hidden from quiz images.
9. Explanation remains hidden from quiz images.
10. Official supplied logo is unchanged.
11. Logo has clear empty space around it.
12. Logo does not touch or overlap anything.
13. Student does not cover important content.
14. No text overlap.
15. No cropped important content.
16. Hindi spelling is correct.
17. Mathematical notation is correct.
18. All three platform versions are actually different compositions.
19. Every question has all three image files.
20. Every question has its matching content metadata.
21. Filenames are unique and exact.
22. Nothing is missing from the final ZIP.

SOURCE QUESTIONS — CLASS ${classLevel}
${questionData}

FINAL INSTRUCTION
Complete the entire Class ${classLevel} batch in one operation.
Do not ask me to provide the questions again.
Use the supplied question data as the only source of truth.
Use the attached official GANIT SETU logo as the only logo reference.
`;
}

function ensureImagePromptSection() {
  let section = $('#completeImagePromptSection');
  if (section) return section;

  const results = $('#planResults');
  if (!results || !results.parentElement) return null;

  section = document.createElement('section');
  section.id = 'completeImagePromptSection';
  section.className = 'panel complete-image-prompt-panel';
  section.innerHTML = `
    <div class="complete-image-prompt-head">
      <h2>🖼️ Complete Image Prompt</h2>
      <p>Class 9 और Class 10 अलग-अलग। एक click में उस class के सभी selected questions का पूरा Image Master Prompt copy करें।</p>
    </div>
    <div id="completeImagePromptButtons" class="complete-image-prompt-buttons"></div>
  `;

  results.parentElement.insertBefore(section, results);
  return section;
}

function renderCompleteImagePromptButtons(rows, qmap) {
  const section = ensureImagePromptSection();
  if (!section) return;

  const box = $('#completeImagePromptButtons');
  if (!box) return;

  const classes = [...new Set(rows.map(r => Number(r.class_level)))].sort();
  if (!classes.length) {
    box.innerHTML = '<div class="muted">इस filter में selected questions उपलब्ध नहीं हैं।</div>';
    return;
  }

  box.innerHTML = classes.map(cls => {
    const uniqueCount = new Set(
      rows.filter(r => Number(r.class_level) === cls).map(r => Number(r.question_id))
    ).size;

    return `
      <div class="complete-image-prompt-class">
        <div>
          <b>📘 Class ${cls}</b>
          <span>${uniqueCount} unique question${uniqueCount > 1 ? 's' : ''}</span>
        </div>
        <button type="button"
          class="primary-btn complete-image-prompt-copy"
          data-image-class="${cls}">
          📋 Copy Class ${cls} Complete Image Prompt
        </button>
      </div>
    `;
  }).join('');

  box.querySelectorAll('.complete-image-prompt-copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cls = Number(btn.dataset.imageClass);
      const classRows = rows.filter(r => Number(r.class_level) === cls);
      const prompt = buildCompleteImagePrompt(cls, classRows, qmap);

      try {
        await navigator.clipboard.writeText(prompt);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = prompt;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }

      const old = btn.textContent;
      btn.textContent = '✅ Complete Prompt Copied';
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = old;
        btn.disabled = false;
      }, 1800);
    });
  });
}

const _originalRenderPlanForImagePrompt = renderPlan;
renderPlan = async function() {
  await _originalRenderPlanForImagePrompt();

  if (!currentPlan.length) {
    $('#completeImagePromptSection')?.remove();
    return;
  }

  const rows = filteredRows();
  if (!rows.length) {
    const section = ensureImagePromptSection();
    if (section) $('#completeImagePromptButtons').innerHTML =
      '<div class="muted">इस filter में selected questions उपलब्ध नहीं हैं।</div>';
    return;
  }

  try {
    const qmap = await fetchQuestions(rows.map(x => x.question_id));
    renderCompleteImagePromptButtons(rows, qmap);
  } catch (e) {
    console.error(e);
  }
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(decodeURIComponent(btn.dataset.copy));
    const old = btn.textContent;
    btn.textContent = '✅ Copied';
    setTimeout(()=>btn.textContent=old,1200);
  } catch {
    alert('Copy नहीं हो पाया।');
  }
});



document.addEventListener('click', async e => {
  const btn = e.target.closest('.publish-instagram');
  if (!btn) return;

  const questionId = Number(btn.dataset.questionId);
  const contentType = btn.dataset.contentType;
  const row = currentPlan.find(
    x => Number(x.question_id) === questionId &&
         x.content_type === contentType
  );

  if (!row) {
    showNotice('error', 'इस question का Instagram planning record नहीं मिला।');
    return;
  }

  try {
    const qmap = await fetchQuestions([questionId]);
    await publishQuestionToInstagram(row, qmap[questionId], btn);
  } catch (err) {
    showNotice('error', err.message || 'Instagram image data load नहीं हो सका।');
  }
});


document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.publish-youtube');
  if (!btn) return;

  const questionId = Number(btn.dataset.questionId);
  const contentType = btn.dataset.contentType;

  const row = currentPlan.find(
    x => Number(x.question_id) === questionId &&
         x.content_type === contentType
  );

  if (!row) {
    showNotice(
      'error',
      'इस question का YouTube planning record नहीं मिला।'
    );
    return;
  }

  try {
    const qmap = await fetchQuestions([questionId]);

    await publishQuestionToYouTube(
      row,
      qmap[questionId],
      btn
    );
  } catch (err) {
    showNotice(
      'error',
      err.message ||
      'Question data load नहीं हो सका।'
    );
  }
});


document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.verify-youtube');
  if (!btn) return;

  const questionId = Number(btn.dataset.questionId);
  const contentType = btn.dataset.contentType;

  const row = currentPlan.find(
    x =>
      Number(x.question_id) === questionId &&
      x.content_type === contentType
  );

  if (!row) {
    showNotice(
      'error',
      'इस question का YouTube planning record नहीं मिला।'
    );
    return;
  }

  const card = btn.closest('.question-card');
  let videoId = card?.dataset.youtubeVideoId || '';

  // If the page was refreshed after publishing, use a manual ID once.
  if (!videoId) {
    videoId = window.prompt(
      'YouTube Video ID डालें:',
      ''
    )?.trim() || '';
  }

  if (!videoId) {
    showNotice(
      'error',
      'YouTube Video ID उपलब्ध नहीं है।'
    );
    return;
  }

  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ YouTube verify हो रहा है...';

  try {
    const {
      data: { session }
    } = await authClient.auth.getSession();

    if (!session?.access_token) {
      throw new Error(
        'Admin session उपलब्ध नहीं है।'
      );
    }

    const response = await fetch(
      VERIFY_PLATFORM_FUNCTION,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization':
            `Bearer ${session.access_token}`,
          'apikey':
            GS_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          platform: 'youtube',
          video_id: videoId,
          question_id: questionId,
          plan_id:
            row.plan_id ||
            currentPlanId ||
            null
        })
      }
    );

    const data = await response.json()
      .catch(() => ({}));

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
        'YouTube verification failed.'
      );
    }

    card.dataset.youtubeVideoId = videoId;

    let statusBox =
      card.querySelector('.youtube-verify-status');

    if (!statusBox) {
      statusBox = document.createElement('div');
      statusBox.className = 'youtube-verify-status';
      card.querySelector('.prompt-actions')
        ?.appendChild(statusBox);
    }

    if (data.status === 'published') {
      btn.textContent = '🟢 YouTube Published';
      btn.classList.add('published');

      statusBox.innerHTML =
        `🟢 <b>YouTube पर Successfully Published</b><br>` +
        `Video ID: ${esc(data.video_id)}<br>` +
        `Processing: ${esc(data.processing_status || 'succeeded')}<br>` +
        `Privacy: ${esc(data.privacy_status || 'unknown')}<br>` +
        (data.video_url
          ? `<a href="${esc(data.video_url)}" target="_blank" rel="noopener noreferrer">🔗 YouTube Video खोलें</a>`
          : '');

      showNotice(
        'success',
        '🟢 YouTube पर video successfully published है।'
      );

    } else if (data.status === 'processing') {
      btn.textContent = '🟡 YouTube Processing';

      statusBox.innerHTML =
        `🟡 <b>YouTube पर Processing</b><br>` +
        `Video ID: ${esc(data.video_id)}<br>` +
        `Processing Status: ${esc(data.processing_status || 'processing')}`;

      showNotice(
        'success',
        '🟡 YouTube video अभी processing में है।'
      );

    } else if (data.status === 'failed') {
      btn.textContent = '🔴 YouTube Failed';

      statusBox.innerHTML =
        `🔴 <b>YouTube Processing Failed</b><br>` +
        `Reason: ${esc(data.failure_reason || 'Unknown')}`;

      showNotice(
        'error',
        '🔴 YouTube video processing failed.'
      );

    } else if (data.status === 'not_found') {
      btn.textContent = '⚪ YouTube Not Found';

      statusBox.innerHTML =
        `⚪ <b>YouTube पर video अभी नहीं मिला</b><br>` +
        `Video ID: ${esc(videoId)}`;

      showNotice(
        'error',
        'YouTube ने अभी इस Video ID को नहीं पाया।'
      );
    } else {
      btn.textContent = '🔍 Verify YouTube';

      statusBox.innerHTML =
        `ℹ️ <b>YouTube Status</b><br>` +
        `${esc(data.status || 'unknown')}`;
    }

  } catch (err) {
    console.error(
      'YouTube Verify Error:',
      err
    );

    btn.textContent = oldText;

    showNotice(
      'error',
      `❌ YouTube verification नहीं हो सकी।<br><br><b>Error:</b> ${esc(err?.message || String(err))}`
    );
  } finally {
    btn.disabled = false;
  }
});


/* =========================================================
   VERIFY ALL PLATFORMS
   - YouTube: real processing/published/failed verification
     through verify-platform-publish.
   - Facebook: reads the existing social_publish_queue record.
   - Instagram: reports published only when the existing
     planning record contains a real published status/media id;
     otherwise explicitly says verification is not available.
   - WhatsApp Channel: configuration status only. This workflow
     does not use a direct WhatsApp Channel publishing API.
   ========================================================= */

async function verifyAllPlatforms() {
  const resultBox = $('#verifyAllPlatformsResult');
  const button = $('#verifyAllPlatformsBtn');

  if (!currentPlan.length) {
    showNotice('error', 'पहले Content Plan generate कीजिए।');
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = '⏳ सभी platforms verify हो रहे हैं...';
  }

  if (resultBox) {
    resultBox.innerHTML = '<div class="muted">Status check किया जा रहा है...</div>';
  }

  const rows = currentPlan;
  const uniqueRows = [];
  const seen = new Set();

  rows.forEach(r => {
    const key = `${r.plan_id || ''}|${r.question_id}|${r.content_type}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRows.push(r);
    }
  });

  const summary = {
    youtube: { checked: 0, published: 0, processing: 0, failed: 0, notFound: 0, unavailable: 0, details: [] },
    facebook: { checked: 0, published: 0, failed: 0, unavailable: 0, details: [] },
    instagram: { checked: 0, published: 0, unavailable: 0, details: [] },
    whatsapp: { configured: true, details: [] }
  };

  try {
    // ---------- YouTube ----------
    const youtubeRows = uniqueRows.filter(r => r.content_type === 'video');

    for (const r of youtubeRows) {
      const card = [...document.querySelectorAll('.question-card')].find(card => {
        const b = card.querySelector('.verify-youtube');
        return b &&
          Number(b.dataset.questionId) === Number(r.question_id);
      });

      const videoId = card?.dataset.youtubeVideoId || '';

      if (!videoId) {
        summary.youtube.unavailable++;
        summary.youtube.details.push(
          `Q${r.question_id}: Video ID इस page session में उपलब्ध नहीं है`
        );
        continue;
      }

      summary.youtube.checked++;

      try {
        const { data: { session } } = await authClient.auth.getSession();
        if (!session?.access_token) throw new Error('Admin session उपलब्ध नहीं है।');

        const response = await fetch(VERIFY_PLATFORM_FUNCTION, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': GS_SUPABASE_ANON_KEY
          },
          body: JSON.stringify({
            platform: 'youtube',
            video_id: videoId,
            question_id: Number(r.question_id),
            plan_id: r.plan_id || currentPlanId || null
          })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'YouTube verification failed.');
        }

        if (data.status === 'published') {
          summary.youtube.published++;
          summary.youtube.details.push(
            `Q${r.question_id}: 🟢 Published`
          );
        } else if (data.status === 'processing') {
          summary.youtube.processing++;
          summary.youtube.details.push(
            `Q${r.question_id}: 🟡 Processing`
          );
        } else if (data.status === 'failed') {
          summary.youtube.failed++;
          summary.youtube.details.push(
            `Q${r.question_id}: 🔴 Failed${data.failure_reason ? ` — ${data.failure_reason}` : ''}`
          );
        } else if (data.status === 'not_found') {
          summary.youtube.notFound++;
          summary.youtube.details.push(
            `Q${r.question_id}: ⚪ Not Found`
          );
        } else {
          summary.youtube.unavailable++;
          summary.youtube.details.push(
            `Q${r.question_id}: ℹ️ ${data.status || 'Unknown'}`
          );
        }
      } catch (err) {
        summary.youtube.failed++;
        summary.youtube.details.push(
          `Q${r.question_id}: 🔴 Verify error — ${err.message || String(err)}`
        );
      }
    }

    // ---------- Facebook ----------
    const facebookRows = uniqueRows.filter(r =>
      r.content_type === 'image' ||
      r.content_type === 'post' ||
      r.content_type === 'video'
    );

    for (const r of facebookRows) {
      summary.facebook.checked++;

      try {
        const { data, error } = await supabase
          .from('social_publish_queue')
          .select('status,external_post_id,external_url,error_message,updated_at')
          .eq('plan_id', r.plan_id || currentPlanId)
          .eq('question_id', r.question_id)
          .eq('platform', 'facebook')
          .eq('content_type', r.content_type)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          summary.facebook.unavailable++;
          summary.facebook.details.push(
            `Q${r.question_id}: ⚪ No Facebook publish record`
          );
        } else if (String(data.status || '').toLowerCase() === 'published') {
          summary.facebook.published++;
          summary.facebook.details.push(
            `Q${r.question_id}: 🟢 Published`
          );
        } else if (['failed', 'error'].includes(String(data.status || '').toLowerCase())) {
          summary.facebook.failed++;
          summary.facebook.details.push(
            `Q${r.question_id}: 🔴 Failed${data.error_message ? ` — ${data.error_message}` : ''}`
          );
        } else {
          summary.facebook.unavailable++;
          summary.facebook.details.push(
            `Q${r.question_id}: 🟡 ${data.status || 'Pending'}`
          );
        }
      } catch (err) {
        summary.facebook.unavailable++;
        summary.facebook.details.push(
          `Q${r.question_id}: ⚪ Verification unavailable`
        );
      }
    }

    // ---------- Instagram ----------
    // The current instagram-publish workflow returns a media_id to the
    // browser, but this planning page does not persist that result in a
    // verification table. Do not claim Published without a persisted record.
    const instagramRows = uniqueRows.filter(r => r.content_type === 'image');

    for (const r of instagramRows) {
      summary.instagram.checked++;
      summary.instagram.unavailable++;
      summary.instagram.details.push(
        `Q${r.question_id}: ⚪ Instagram publish status का persistent verification record उपलब्ध नहीं है`
      );
    }

    // ---------- WhatsApp ----------
    summary.whatsapp.details.push(
      '🟢 Channel configured — इस workflow में direct WhatsApp auto-publish verification/API नहीं है'
    );

    if (resultBox) {
      const youtubeTotal =
        summary.youtube.published +
        summary.youtube.processing +
        summary.youtube.failed +
        summary.youtube.notFound +
        summary.youtube.unavailable;

      const facebookTotal =
        summary.facebook.published +
        summary.facebook.failed +
        summary.facebook.unavailable;

      const instagramTotal =
        summary.instagram.published +
        summary.instagram.unavailable;

      resultBox.innerHTML = `
        <div class="verify-platform-card">
          <div><b>🔍 Platform Verification Result</b></div>

          <div style="margin-top:8px;">
            <b>▶️ YouTube</b> —
            🟢 ${summary.youtube.published} Published,
            🟡 ${summary.youtube.processing} Processing,
            🔴 ${summary.youtube.failed} Failed,
            ⚪ ${summary.youtube.notFound} Not Found
            ${youtubeTotal ? `, ℹ️ ${summary.youtube.unavailable} Unavailable` : ''}
          </div>
          ${summary.youtube.details.length
            ? `<div style="margin-left:18px;">${summary.youtube.details.map(esc).join('<br>')}</div>`
            : ''}

          <div style="margin-top:8px;">
            <b>📘 Facebook</b> —
            🟢 ${summary.facebook.published} Published,
            🔴 ${summary.facebook.failed} Failed,
            ⚪ ${summary.facebook.unavailable} Unavailable/Pending
          </div>
          ${summary.facebook.details.length
            ? `<div style="margin-left:18px;">${summary.facebook.details.map(esc).join('<br>')}</div>`
            : ''}

          <div style="margin-top:8px;">
            <b>📸 Instagram</b> —
            ${instagramTotal
              ? `⚪ ${summary.instagram.unavailable} Verification unavailable`
              : '⚪ Verification unavailable'}
          </div>
          ${summary.instagram.details.length
            ? `<div style="margin-left:18px;">${summary.instagram.details.map(esc).join('<br>')}</div>`
            : ''}

          <div style="margin-top:8px;">
            <b>📢 WhatsApp Channel</b> —
            🟢 Configured
          </div>
          <div style="margin-left:18px;">${summary.whatsapp.details.map(esc).join('<br>')}</div>

          <div style="margin-top:10px;font-size:12px;">
            Note: जहाँ backend persistent publish status उपलब्ध नहीं है, वहाँ system “Published” का दावा नहीं करेगा।
          </div>
        </div>
      `;
    }

    showNotice('success', '🔍 सभी उपलब्ध platform statuses verify कर दिए गए हैं।');

  } catch (err) {
    console.error('Verify All Platforms Error:', err);

    if (resultBox) {
      resultBox.innerHTML =
        `<div class="error-box">❌ Verification नहीं हो सकी: ${esc(err.message || String(err))}</div>`;
    }

    showNotice(
      'error',
      `❌ All Platforms verification नहीं हो सकी: ${err.message || String(err)}`
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = '🔍 Verify All Platforms';
    }
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('#verifyAllPlatformsBtn');
  if (!btn) return;
  verifyAllPlatforms();
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.publish-facebook');
  if (!btn) return;
  const questionId = Number(btn.dataset.questionId);
  const contentType = btn.dataset.contentType;
  const row = currentPlan.find(x => Number(x.question_id) === questionId && x.content_type === contentType);
  if (!row) {
    showNotice('error', 'इस question का planning record नहीं मिला।');
    return;
  }
  try {
    const qmap = await fetchQuestions([questionId]);
    await publishQuestionToFacebook(row, qmap[questionId], btn);
  } catch (err) {
    showNotice('error', err.message || 'Question data load नहीं हो सका।');
  }
});


/* =========================================================
   CENTRAL REVIEW & PUBLISH
   - ZIP is imported and validated; it never auto-publishes.
   - Missing assets are isolated per platform/content item.
   - WhatsApp Channel remains manual.
   ========================================================= */
let importedZipAssets = new Map();
let importedZipTexts = new Map();

function archiveCurrentPlan(){
  if(!currentPlanId || !currentPlan.length) return;
  try{
    localStorage.setItem(`gs_content_plan_${currentPlanId}`, JSON.stringify(currentPlan));
    const ids=JSON.parse(localStorage.getItem('gs_content_plan_ids')||'[]');
    const next=[currentPlanId, ...ids.filter(x=>x!==currentPlanId)].slice(0,20);
    localStorage.setItem('gs_content_plan_ids', JSON.stringify(next));
    localStorage.setItem('gs_content_plan_last', currentPlanId);
    renderPreviousPlans();
  }catch(e){ console.warn('Plan archive failed',e); }
}

function renderPreviousPlans(){
  const box=$('#previousPlansList');
  if(!box) return;
  try{
    const ids=JSON.parse(localStorage.getItem('gs_content_plan_ids')||'[]');
    if(!ids.length){ box.innerHTML='<div class="muted">अभी कोई पुराना Plan saved नहीं है। नया Plan generate करने के बाद वह यहाँ दिखाई देगा।</div>'; return; }
    const rows=[];
    ids.forEach(id=>{
      try{
        const raw=localStorage.getItem(`gs_content_plan_${id}`);
        const plan=raw?JSON.parse(raw):[];
        if(!Array.isArray(plan)||!plan.length) return;
        const classes=[...new Set(plan.map(x=>x.class_level).filter(Boolean))].map(x=>`Class ${x}`).join(' • ')||'—';
        const days=[...new Set(plan.map(x=>x.plan_day).filter(Boolean))].length||1;
        const date=plan.map(x=>x.start_date||x.plan_date||x.test_date).find(Boolean)||'—';
        const types=[...new Set(plan.map(x=>x.content_type).filter(Boolean))].join(', ')||'—';
        rows.push({id,classes,days,date,types,count:plan.length});
      }catch(_){}
    });
    if(!rows.length){ box.innerHTML='<div class="muted">Saved Plan data उपलब्ध नहीं है।</div>'; return; }
    box.innerHTML=rows.map(r=>`
      <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;margin-bottom:8px;">
        <div style="min-width:260px;flex:1;">
          <div><b>📅 ${esc(r.date)}</b> • ${esc(r.classes)} • ${r.days} Day</div>
          <div class="muted" style="margin-top:4px;">${r.count} entries • ${esc(r.types)}</div>
          <code style="font-size:12px;">${esc(r.id)}</code>
        </div>
        <button type="button" class="secondary-btn previous-plan-open" data-plan-id="${esc(r.id)}">📂 Open Plan</button>
      </div>`).join('');
    box.querySelectorAll('.previous-plan-open').forEach(btn=>btn.addEventListener('click',()=>{
      try{ restorePlanById(btn.dataset.planId); window.scrollTo({top:0,behavior:'smooth'}); }
      catch(e){ showNotice('error',e.message); }
    }));
  }catch(e){ box.innerHTML=`<div class="error-box">Previous Plans नहीं पढ़े जा सके: ${esc(e.message)}</div>`; }
}

function restorePlanById(planId){
  const id=String(planId||'').trim();
  if(!id) throw new Error('Plan ID डालिए।');
  const raw=localStorage.getItem(`gs_content_plan_${id}`);
  if(!raw) throw new Error('यह Plan ID इस browser में saved नहीं मिला।');
  const rows=JSON.parse(raw);
  if(!Array.isArray(rows)||!rows.length) throw new Error('इस Plan ID का plan data उपलब्ध नहीं है।');
  currentPlan=rows; currentPlanId=id;
  updatePlanSummary(); populateDayFilter(); renderPlan(); renderFlexibleMapping(); buildPublishReview();
  showNotice('success',`पुराना Plan load हो गया: ${id}`);
}

function restoreLastArchivedPlan(){
  const last=localStorage.getItem('gs_content_plan_last');
  if(!last || currentPlan.length) return;
  try{ restorePlanById(last); }catch(e){ console.warn('Last plan restore skipped',e.message); }
}

function loadOptionalAssetPlan(){
  const id=$('#assetPlanId')?.value?.trim();
  if(!id){
    if(currentPlanId){ showNotice('success',`Current Plan इस्तेमाल होगा: ${currentPlanId}`); return; }
    showNotice('error','पहले Content Plan generate करें या पुराना Plan ID डालें।'); return;
  }
  try{ restorePlanById(id); }catch(e){ showNotice('error',e.message); }
}

function handleDirectVideoUpload(e){
  importedDirectVideos.clear();
  const files=[...(e.target.files||[])];
  const status=$('#videoUploadStatus'), summary=$('#videoAssetSummary');
  if(!files.length){ if(status) status.textContent='अभी कोई video select नहीं किया गया है।'; if(summary) summary.innerHTML=''; return; }
  let ok=0,bad=0,duplicate=0;
  for(const file of files){
    const qid=detectQuestionId(file.name);
    if(!qid){ bad++; continue; }
    if(currentPlanId && !currentPlan.some(r=>Number(r.question_id)===Number(qid))){ bad++; continue; }
    const key=String(qid);
    if(importedDirectVideos.has(key)){ duplicate++; continue; }
    importedDirectVideos.set(key,{name:file.name,qid,kind:'video',file,source:'direct'}); ok++;
  }
  if(status) status.innerHTML=`✅ ${ok} video selected • ${bad} unmatched/invalid • ${duplicate} duplicate`;
  if(summary){
    const names=[...importedDirectVideos.values()].map(x=>`<li>Q${x.qid} • 🎬 Video • ${esc(x.name)}</li>`);
    summary.innerHTML=`<b>Detected videos:</b><ul class="zip-file-list">${names.join('')||'<li>कोई matched video नहीं मिला।</li>'}</ul>`;
  }
  buildPublishReview();
}


function togglePublishSchedule(){
  const mode = $('#publishMode')?.value || 'now';
  const wrap = $('#publishDateTimeWrap');
  if (wrap) wrap.hidden = mode !== 'scheduled';
  const input = $('#publishDateTime');
  if (mode === 'scheduled' && input && !input.value) {
    const d = new Date(Date.now() + 30*60000);
    d.setSeconds(0,0);
    input.value = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }
}

async function ensureJSZip(){
  if (window.JSZip) return window.JSZip;
  await new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    s.onload=resolve; s.onerror=()=>reject(new Error('ZIP reader load नहीं हुआ।'));
    document.head.appendChild(s);
  });
  if (!window.JSZip) throw new Error('ZIP reader उपलब्ध नहीं है।');
  return window.JSZip;
}

function normalizeZipName(name){
  return String(name||'').replace(/\\/g,'/').replace(/^\/+/, '').trim();
}

function detectQuestionId(name){
  const m=String(name||'').match(/(?:^|[_\-/])Q(\d+)(?:[_\-.]|$)/i);
  return m ? Number(m[1]) : null;
}

async function handleContentZipUpload(e){
  const file=e.target.files?.[0];
  const status=$('#zipImportStatus'), summary=$('#zipAssetSummary');
  importedZipAssets.clear(); importedZipTexts.clear();
  if (!file){ if(status) status.textContent='ZIP अभी select नहीं किया गया है।'; return; }
  try{
    const JSZip=await ensureJSZip();
    if(status) status.textContent='⏳ ZIP पढ़ा जा रहा है...';
    const zip=await JSZip.loadAsync(file);
    let images=0,videos=0,texts=0,others=0;
    for(const [rawName,entry] of Object.entries(zip.files)){
      if(entry.dir) continue;
      const name=normalizeZipName(rawName);
      const qid=detectQuestionId(name);
      if(!qid) { others++; continue; }
      const lower=name.toLowerCase();
      if(/\.(png|jpe?g|webp)$/i.test(lower)){
        importedZipAssets.set(name,{name,qid,kind:'image',entry}); images++;
      } else if(/\.(mp4|mov|webm|m4v)$/i.test(lower)){
        importedZipAssets.set(name,{name,qid,kind:'video',entry}); videos++;
      } else if(/\.(txt|md|json)$/i.test(lower)){
        importedZipTexts.set(name,{name,qid,entry}); texts++;
      } else { others++; }
    }
    if(status) status.innerHTML=`✅ ZIP imported — ${images} images • ${videos} videos • ${texts} text/metadata files`;
    if(summary){
      const names=[...importedZipAssets.values()].map(x=>`<li>Q${x.qid} • ${esc(x.kind)} • ${esc(x.name)}</li>`);
      const texts=[...importedZipTexts.values()].map(x=>`<li>Q${x.qid} • 📝 Text/Post • ${esc(x.name)}</li>`);
      const all=names.concat(texts).slice(0,100);
      summary.innerHTML=`<b>Detected assets:</b><ul class="zip-file-list">${all.join('') || '<li>कोई supported asset नहीं मिला।</li>'}</ul>`;
    }
    buildPublishReview();
  }catch(err){
    console.error('ZIP import error',err);
    if(status) status.innerHTML=`❌ ZIP import failed: ${esc(err.message||String(err))}`;
  }
}

function assetsForQuestion(qid){
  const arr=[...importedZipAssets.values()].filter(x=>Number(x.qid)===Number(qid));
  const direct=[...importedDirectVideos.values()].filter(x=>Number(x.qid)===Number(qid));
  const texts=[...importedZipTexts.values()].filter(x=>Number(x.qid)===Number(qid));
  return { images:arr.filter(x=>x.kind==='image'), videos:[...arr.filter(x=>x.kind==='video'),...direct], posts:texts };
}

let publishPreviewObjectUrls = [];
function revokePublishPreviewUrls(){
  publishPreviewObjectUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(_){}});
  publishPreviewObjectUrls=[];
}
async function renderPublishPlatformPreviews(rows){
  const box=$('#publishPlatformPreviews');
  if(!box) return;
  revokePublishPreviewUrls();
  const groups={facebook:[],instagram:[],youtube:[],whatsapp:[]};
  for(const r of rows){
    const a=assetsForQuestion(r.question_id);
    if(r.content_type==='image'){
      groups.facebook.push({r,a,type:'image'}); groups.instagram.push({r,a,type:'image'}); groups.whatsapp.push({r,a,type:'image'});
    }else if(r.content_type==='post'){
      groups.facebook.push({r,a,type:'post'}); groups.instagram.push({r,a,type:'post'}); groups.whatsapp.push({r,a,type:'post'});
    }else if(r.content_type==='video'){
      groups.facebook.push({r,a,type:'video'}); groups.youtube.push({r,a,type:'video'}); groups.whatsapp.push({r,a,type:'video'});
    }else if(r.content_type==='thumbnail'){
      groups.youtube.push({r,a,type:'thumbnail'});
    }
  }
  const labels={facebook:'📘 Facebook',instagram:'📸 Instagram',youtube:'▶️ YouTube',whatsapp:'🟢 WhatsApp Channel'};
  const renderAsset=async item=>{
    const assets=item.type==='video'?item.a.videos:(item.type==='thumbnail'?item.a.images:item.a.images);
    const asset=assets?.[0];
    if(!asset) return `<div class="publish-preview-item"><div class="publish-preview-empty">⚪ Q${esc(item.r.question_id)} — Asset Missing</div></div>`;
    try{
      const blob=await asset.entry.async('blob');
      const url=URL.createObjectURL(blob); publishPreviewObjectUrls.push(url);
      const media=item.type==='video'
        ? `<video class="publish-preview-media publish-preview-video" controls preload="metadata" src="${url}"></video>`
        : `<img class="publish-preview-media" loading="lazy" src="${url}" alt="Q${esc(item.r.question_id)} preview">`;
      return `<div class="publish-preview-item"><div>${media}</div><div class="publish-preview-file">Q${esc(item.r.question_id)} • ${esc(asset.name.split('/').pop()||asset.name)}</div></div>`;
    }catch(e){
      return `<div class="publish-preview-item"><div class="publish-preview-empty">⚠️ Q${esc(item.r.question_id)} — Preview load नहीं हुआ</div></div>`;
    }
  };
  box.innerHTML='<div class="publish-preview-loading">⏳ Platform previews तैयार हो रहे हैं...</div>';
  const parts=[];
  for(const [key,title] of Object.entries(labels)){
    const items=groups[key];
    let body='';
    if(!items.length) body='<div class="publish-preview-empty">इस platform के लिए content नहीं है।</div>';
    else { const htmls=[]; for(const item of items) htmls.push(await renderAsset(item)); body=`<div class="publish-preview-grid">${htmls.join('')}</div>`; }
    const note=key==='whatsapp'?'<div class="muted" style="margin-top:8px;font-size:12px;">Preview केवल review के लिए है; WhatsApp Channel publishing manual रहेगी।</div>':'';
    parts.push(`<section class="publish-preview-card"><h3>${title}</h3>${body}${note}</section>`);
  }
  box.innerHTML=parts.join('');
}

function buildPublishReview(){
  const box=$('#publishReadiness'), summary=$('#publishPlatformSummary'), actions=$('#publishActionArea'), autoArea=$('#centralAutoPublishArea');
  if(!box||!summary||!actions) return;
  if(!currentPlan.length){
    box.innerHTML='<div class="muted">पहले Content Plan generate कीजिए।</div>';
    summary.innerHTML=''; actions.innerHTML=''; if(autoArea) autoArea.innerHTML='';
    const preview=$('#publishPlatformPreviews'); if(preview) preview.innerHTML='';
    revokePublishPreviewUrls(); return;
  }
  const rows=currentPlan;
  const unique=[...new Map(rows.map(r=>[`${r.question_id}|${r.content_type}`,r])).values()];
  const counts={facebook:0,instagram:0,youtube:0,whatsapp:0};
  const ready={facebook:0,instagram:0,youtube:0,whatsapp:0};
  for(const r of unique){
    const a=assetsForQuestion(r.question_id);
    if(r.content_type==='image'){
      if(a.images.length){ ready.facebook++; ready.instagram++; ready.whatsapp++; }
      counts.facebook++; counts.instagram++; counts.whatsapp++;
    }
    if(r.content_type==='post'){
      if(a.posts.length||a.images.length){ ready.facebook++; ready.instagram++; ready.whatsapp++; }
      counts.facebook++; counts.instagram++; counts.whatsapp++;
    }
    if(r.content_type==='video'){
      if(a.videos.length){ ready.facebook++; ready.youtube++; ready.whatsapp++; }
      counts.facebook++; counts.youtube++; counts.whatsapp++;
    }
    if(r.content_type==='thumbnail'){
      if(a.images.length){ ready.youtube++; }
      counts.youtube++;
    }
  }
  box.innerHTML=`<div class="publish-summary-grid">
    <div class="publish-summary-card"><b>📘 Facebook</b><br>${ready.facebook}/${counts.facebook} ready</div>
    <div class="publish-summary-card"><b>📸 Instagram</b><br>${ready.instagram}/${counts.instagram} ready</div>
    <div class="publish-summary-card"><b>▶️ YouTube</b><br>${ready.youtube}/${counts.youtube} ready</div>
    <div class="publish-summary-card"><b>🟢 WhatsApp Channel</b><br>Manual • ${ready.whatsapp}/${counts.whatsapp} assets</div>
  </div>`;
  const mode=$('#publishMode')?.value||'now';
  const when=mode==='scheduled'?$('#publishDateTime')?.value:'';
  const scheduleText=mode==='scheduled' ? `<div class="muted">Schedule requested: ${esc(when||'date/time select करें')}</div>` : '<div class="muted">Publish Now selected.</div>';
  actions.innerHTML=`${scheduleText}
    <button type="button" class="primary-btn" data-central-publish="facebook">📘 Publish Ready Facebook</button>
    <button type="button" class="primary-btn" data-central-publish="instagram">📸 Publish Ready Instagram</button>
    <button type="button" class="primary-btn" data-central-publish="youtube">▶️ Publish Ready YouTube</button>
    <button type="button" class="primary-btn" data-central-publish="whatsapp">🟢 Prepare WhatsApp Channel</button>`;
  if(autoArea){
    const anyReady=Object.values(ready).some(n=>n>0);
    autoArea.innerHTML=anyReady ? `<div class="auto-publish-box"><b>⚡ Automatic Platform Publishing</b><div class="muted" style="margin:6px 0 10px;">ZIP के matched assets को उनके supported platform/content type के अनुसार अपने-आप भेजें। Missing asset किसी दूसरे platform को नहीं रोकेगा। WhatsApp Channel manual रहेगा।</div><button type="button" class="primary-btn" data-central-publish="all">🚀 Publish All Ready Platforms</button></div>` : '';
  }
  renderPublishPlatformPreviews(unique);
}

async function zipAssetToFile(asset){
  const blob=await asset.entry.async('blob');
  return new File([blob], asset.name.split('/').pop() || asset.name, {type: blob.type || ''});
}

async function uploadImportedAsset(asset,folder){
  const file=asset.source==='direct' ? asset.file : await zipAssetToFile(asset);
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const path=`content-packages/${folder}/${Date.now()}-Q${asset.qid}-${safe}`;
  const {error}=await supabase.storage.from('content-media').upload(path,file,{upsert:false,contentType:file.type||undefined,cacheControl:'3600'});
  if(error) throw new Error(`Asset upload failed: ${error.message}`);
  const {data}=supabase.storage.from('content-media').getPublicUrl(path);
  return {path,url:data?.publicUrl||'',file};
}

async function centralPublishFacebook(){
  const rows=currentPlan.filter(r=>['image','video','post'].includes(r.content_type));
  let done=0, skipped=0;
  for(const r of rows){
    const q=(await fetchQuestions([r.question_id]))[Number(r.question_id)];
    const a=assetsForQuestion(r.question_id);
    let mediaUrl=null;
    if(r.content_type==='image'||r.content_type==='video'){
      const asset=(r.content_type==='video'?a.videos[0]:a.images[0]);
      if(!asset){skipped++; continue;}
      mediaUrl=(await uploadImportedAsset(asset,'facebook')).url;
    }
    const meta=buildFacebookContent(r,q);
    const {data:{session}}=await authClient.auth.getSession();
    if(!session?.access_token) throw new Error('Admin session उपलब्ध नहीं है।');
    const response=await fetch(FACEBOOK_PUBLISH_FUNCTION,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':GS_SUPABASE_ANON_KEY},body:JSON.stringify({action:'publish',question_id:Number(r.question_id),plan_id:r.plan_id||currentPlanId,class_level:Number(r.class_level),platform:'facebook',content_type:r.content_type,media_url:mediaUrl,title:meta.title,caption:meta.caption,description:meta.description,hashtags:meta.hashtags,answer_comment:meta.answerComment,publish_mode:$('#publishMode')?.value||'now',scheduled_at:$('#publishDateTime')?.value||null})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.success) throw new Error(data?.error||data?.meta_error_message||'Facebook publishing failed.');
    done++;
  }
  showNotice('success',`Facebook: ${done} published, ${skipped} skipped (missing asset).`);
}

async function centralPublishInstagram(){
  const rows=currentPlan.filter(r=>r.content_type==='image'||r.content_type==='post');
  let done=0,skipped=0;
  for(const r of rows){
    const q=(await fetchQuestions([r.question_id]))[Number(r.question_id)];
    const asset=assetsForQuestion(r.question_id).images[0];
    if(!asset){skipped++;continue;}
    const uploaded=await uploadImportedAsset(asset,'instagram');
    const {data:{session}}=await authClient.auth.getSession();
    if(!session?.access_token) throw new Error('Admin session उपलब्ध नहीं है।');
    const response=await fetch(INSTAGRAM_PUBLISH_FUNCTION,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'x-user-access-token':session.access_token,'apikey':GS_SUPABASE_ANON_KEY},body:JSON.stringify({access_token:session.access_token,media_url:uploaded.url,caption:buildInstagramCaption(q),question_id:Number(r.question_id),plan_id:r.plan_id||currentPlanId,class_level:Number(r.class_level),publish_mode:$('#publishMode')?.value||'now',scheduled_at:$('#publishDateTime')?.value||null})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.success) throw new Error(data?.error||'Instagram publishing failed.');
    done++;
  }
  showNotice('success',`Instagram: ${done} published, ${skipped} skipped (missing image).`);
}

async function centralPublishYouTube(){
  const rows=currentPlan.filter(r=>r.content_type==='video');
  let done=0,skipped=0;
  for(const r of rows){
    const q=(await fetchQuestions([r.question_id]))[Number(r.question_id)];
    const asset=assetsForQuestion(r.question_id).videos[0];
    if(!asset){skipped++;continue;}
    const uploaded=await uploadImportedAsset(asset,'youtube');
    const meta=buildYouTubeContent(q);
    const {data:{session}}=await authClient.auth.getSession();
    if(!session?.access_token) throw new Error('Admin session उपलब्ध नहीं है।');
    const response=await fetch(YOUTUBE_PUBLISH_FUNCTION,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':GS_SUPABASE_ANON_KEY},body:JSON.stringify({storage_bucket:'content-media',storage_path:uploaded.path,title:meta.title,description:meta.description,tags:meta.tags,privacy_status:'private',question_id:Number(r.question_id),plan_id:r.plan_id||currentPlanId,class_level:Number(r.class_level),publish_mode:$('#publishMode')?.value||'now',scheduled_at:$('#publishDateTime')?.value||null})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.ok) throw new Error(data?.error||'YouTube publishing failed.');
    done++;
  }
  showNotice('success',`YouTube: ${done} uploaded/published, ${skipped} skipped (missing video).`);
}

async function centralPublishAllReady(){
  const mode=$('#publishMode')?.value||'now';
  if(mode==='scheduled' && !$('#publishDateTime')?.value) throw new Error('Schedule के लिए Publish Date & Time चुनिए।');
  const confirmed = window.confirm(`Ready content को ${mode==='scheduled'?'selected schedule पर':'अभी'} Facebook, Instagram और YouTube पर publish करने की प्रक्रिया शुरू करें?`);
  if(!confirmed) return;
  const results=[];
  const run=async(name,fn)=>{
    try{ await fn(); results.push(`✅ ${name}`); }
    catch(err){ results.push(`❌ ${name}: ${err.message||String(err)}`); }
  };
  await run('Facebook',centralPublishFacebook);
  await run('Instagram',centralPublishInstagram);
  await run('YouTube',centralPublishYouTube);
  await run('WhatsApp Channel package',prepareWhatsAppChannel);
  showNotice('success',`Automatic platform workflow complete. ${results.join(' • ')}`);
}

async function prepareWhatsAppChannel(){
  const rows=currentPlan.filter(r=>['image','video','post'].includes(r.content_type));
  let ready=0,missing=0;
  for(const r of rows){
    const a=assetsForQuestion(r.question_id);
    if((r.content_type==='video'&&a.videos.length)||(r.content_type!=='video'&&a.images.length)) ready++; else missing++;
  }
  showNotice('success',`WhatsApp Channel package ready: ${ready} assets available, ${missing} missing. ऊपर ZIP से package तैयार है; अब Ganit Setu Channel पर manual post करें।`);
}

document.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-central-publish]');
  if(!btn) return;
  const platform=btn.dataset.centralPublish;
  btn.disabled=true;
  try{
    if(platform==='facebook') await centralPublishFacebook();
    else if(platform==='instagram') await centralPublishInstagram();
    else if(platform==='youtube') await centralPublishYouTube();
    else if(platform==='all') await centralPublishAllReady();
    else await prepareWhatsAppChannel();
  }catch(err){
    console.error('Central publish error',err);
    showNotice('error',`❌ ${esc(err.message||String(err))}`);
  }finally{btn.disabled=false; buildPublishReview();}
});

/* =========================================================
   SINGLE MASTER PROMPT — AUTO FLEXIBLE GENERATION
   The Admin Panel stores one editable Master Prompt in
   public.content_prompt_configurations. Current plan rows are
   used automatically; no per-question selection is required.
   ========================================================= */
let savedMasterPrompt = '';
let generatedPromptPackText = '';

async function loadSavedMasterPrompt() {
  const { data, error } = await supabase
    .from('content_prompt_configurations')
    .select('id,prompt_name,prompt_text,is_active,updated_at')
    .eq('is_active', true)
    .eq('prompt_name', 'Master Prompt')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.prompt_text) throw new Error('Saved Master Prompt नहीं मिला।');
  savedMasterPrompt = data.prompt_text;
  return data;
}

function buildAutoFlexiblePrompt(master, q, row) {
  const platform = row.platform || 'auto';
  const contentType = row.content_type || 'auto';
  const day = row.plan_day || 1;
  const base = master;
  return `${base}\n\n==================================================\nCURRENT CONTENT CONTEXT — DO NOT IGNORE\n==================================================\n\nCONTENT DAY: ${day}\nCLASS: ${q.class_level}\nCHAPTER NUMBER: ${q.chapter_number}\nCHAPTER NAME: ${q.chapter_name || ''}\nQUESTION ID: Q${q.id}\nQUESTION: ${q.question_text || ''}\nOPTION A: ${q.option_a || ''}\nOPTION B: ${q.option_b || ''}\nOPTION C: ${q.option_c || ''}\nOPTION D: ${q.option_d || ''}\nCORRECT ANSWER: ${q.correct_option || ''}\nHINT: ${q.hint || ''}\nEXPLANATION: ${q.explanation || ''}\nCONTENT TYPE: ${contentType}\nPLATFORM: ${platform}\n\nGenerate the requested content for THIS Question only. Use the Master Prompt rules above and adapt the output to the current content type and platform. Do not combine this Question with any other Question.`;
}

async function generateAllPrompts() {
  const btn = $('#generateAllPromptsBtn');
  const status = $('#promptGenerationStatus');
  try {
    if (!currentPlan.length) throw new Error('पहले Content Plan generate कीजिए।');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }
    if (status) status.textContent = 'Saved Master Prompt और current plan load हो रहा है...';

    await ensureSupabaseClient();
    await loadSavedMasterPrompt();
    const rows = filteredRows();
    if (!rows.length) throw new Error('Current filter में कोई content-question entry नहीं है।');

    const qmap = await fetchQuestions(rows.map(r => r.question_id));
    const blocks = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const q = qmap[Number(r.question_id)];
      if (!q) continue;
      blocks.push(`================ QUESTION ${String(i + 1).padStart(2, '0')} ================\n${buildAutoFlexiblePrompt(savedMasterPrompt, q, r)}`);
    }
    if (!blocks.length) throw new Error('Current Plan के Questions नहीं मिले।');

    generatedPromptPackText = `GANIT SETU — GENERATED MASTER PROMPT PACK\nGenerated: ${new Date().toLocaleString('en-IN')}\nTotal Entries: ${blocks.length}\n\n${blocks.join('\n\n')}`;
    const out = $('#generatedPromptPack');
    if (out) out.value = generatedPromptPackText;
    const downloadBtn = $('#downloadPromptPackBtn');
    if (downloadBtn) downloadBtn.disabled = false;
    if (status) status.textContent = `✅ ${blocks.length} prompt(s) तैयार हैं। हर Question का context अलग है और वही एक Saved Master Prompt इस्तेमाल हुआ है।`;
  } catch (err) {
    console.error('Generate All Prompts error:', err);
    if (status) status.textContent = `❌ ${err.message || String(err)}`;
    showNotice('error', err.message || 'Prompts generate नहीं हुए।');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Generate All Prompts'; }
  }
}

async function generateVideoPrompts(){
  const btn=$('#generateVideoPromptsBtn'), status=$('#videoPromptGenerationStatus'), list=$('#videoPromptList'), download=$('#downloadVideoPromptsBtn');
  try{
    if(!currentPlan.length) throw new Error('पहले Content Plan generate कीजिए।');
    if(btn){btn.disabled=true;btn.textContent='⏳ Video prompts बन रहे हैं...';}
    await ensureSupabaseClient(); await loadSavedMasterPrompt();
    const rows=currentPlan.filter(r=>r.content_type==='video');
    if(!rows.length) throw new Error('Current Plan में कोई Video/Reel Question नहीं है।');
    const qmap=await fetchQuestions([...new Set(rows.map(r=>r.question_id))]);
    const blocks=[]; const cards=[];
    rows.forEach((r,i)=>{
      const q=qmap[Number(r.question_id)]; if(!q) return;
      const filename=`Q${q.id}_Class${q.class_level}_Day${r.plan_day||1}_Video.mp4`;
      const prompt=buildAutoFlexiblePrompt(savedMasterPrompt,q,{...r,content_type:'video',platform:'Facebook Reel + Instagram Reel + YouTube Short'}) + `\n\nVIDEO OUTPUT REQUIREMENTS\n- Create ONE vertical 9:16 MP4 video for reuse on Facebook Reel, Instagram Reel and YouTube Short.\n- Do not create separate platform videos.\n- Keep important text inside safe margins and use Hindi/English exactly as supplied.\n- Suggested output: MP4, H.264, 1080x1920, clear audio, social-media ready.\n- REQUIRED FILE NAME: ${filename}\n- This filename is the identity used by Ganit Setu to match the video to Question Q${q.id}.`;
      blocks.push(`================ VIDEO ${String(i+1).padStart(2,'0')} — Q${q.id} ================\nFILE NAME: ${filename}\n\n${prompt}`);
      cards.push(`<div class="prompt-card" style="margin:8px 0;padding:10px;border:1px solid #ddd;border-radius:10px;"><b>Q${q.id} • Class ${q.class_level} • Day ${r.plan_day||1}</b><div class="muted" style="margin:4px 0 8px;">${esc(filename)}</div><button type="button" class="secondary-btn copy-video-prompt-btn" data-video-prompt-index="${cards.length}">📋 Copy Video Prompt</button></div>`);
    });
    generatedVideoPromptText=`GANIT SETU — VIDEO PROMPT PACK\nGenerated: ${new Date().toLocaleString('en-IN')}\nVideo Count: ${blocks.length}\n\n${blocks.join('\n\n')}`;
    if(status) status.textContent=`✅ ${blocks.length} Video Prompt(s) तैयार हैं। हर Video Question का अलग prompt है।`;
    if(list) list.innerHTML=cards.join('');
    if(download) download.disabled=false;
    window.__gsVideoPromptBlocks=blocks;
  }catch(err){ if(status) status.textContent=`❌ ${err.message||String(err)}`; showNotice('error',err.message||'Video prompts generate नहीं हुए।'); }
  finally{ if(btn){btn.disabled=false;btn.textContent='🎬 Generate Video Prompts';} }
}

function downloadVideoPrompts(){
  if(!generatedVideoPromptText) return;
  const blob=new Blob([generatedVideoPromptText],{type:'text/plain;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`ganit-setu-video-prompts-${new Date().toISOString().slice(0,10)}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function downloadPromptPack() {
  if (!generatedPromptPackText) return;
  const blob = new Blob([generatedPromptPackText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ganit-setu-master-prompt-pack-${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.addEventListener('click', e => {
  if (e.target.closest('#generateAllPromptsBtn')) generateAllPrompts();
  if (e.target.closest('#downloadPromptPackBtn')) downloadPromptPack();
  if (e.target.closest('#generateVideoPromptsBtn')) generateVideoPrompts();
  if (e.target.closest('#downloadVideoPromptsBtn')) downloadVideoPrompts();
  const copyVideo=e.target.closest('.copy-video-prompt-btn');
  if(copyVideo){ const i=Number(copyVideo.dataset.videoPromptIndex); const text=window.__gsVideoPromptBlocks?.[i]||''; if(text) navigator.clipboard.writeText(text).then(()=>showNotice('success','Video Prompt copied.')).catch(()=>showNotice('error','Copy नहीं हुआ।')); }
});

function typeLabel(t) {
  return t === 'image' ? '🖼️ Image' : t === 'post' ? '📱 Post' : '🎬 Video';
}

function copyPlanId() {
  if (!currentPlanId) return;
  navigator.clipboard.writeText(currentPlanId).then(() => showNotice('success','Plan ID copied.'));
}

function showNotice(kind,msg) {
  const box = $('#notice');
  if (!box) return alert(msg);
  box.className = `notice ${kind}`;
  box.textContent = msg;
  box.hidden = false;
}

})();