(function(){
  const SUPABASE_URL='https://ucovgluwsiejrhjweuls.supabase.co';
  const ANON='sb_publishable_1XHxsjb_vNK8BYHHGiIYeQ__ouET5_Q';
  const AI_URL=SUPABASE_URL+'/functions/v1/gemini-generate-post';
  const IMAGE_FUNCTION_URL=SUPABASE_URL+'/functions/v1/cloudflare-generate-image';
  const FACEBOOK_URL=SUPABASE_URL+'/functions/v1/facebook-oauth';
  const INSTAGRAM_URL=SUPABASE_URL+'/functions/v1/instagram-publish';
  const YOUTUBE_URL=SUPABASE_URL+'/functions/v1/youtube-publish';
  const sb=window.supabaseClient||window.supabase.createClient(SUPABASE_URL,ANON);
  let currentQuestion=null,currentPlatform='facebook',currentType='post',generatedDraft='',generatedImageData='',generatedImageUrl='',videoUrl='',generatedPackage=null;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const read=(k,d=[])=>{try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(d))}catch{return d}};
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const questionsByType=read('gsContentQuestionsByType',{});
  const typeOutput={post:{draft:'',pkg:null},image:{imageData:'',imageUrl:'',pkg:null},reel:{videoUrl:'',pkg:null},short:{videoUrl:'',pkg:null}};
  const typeSelectors={post:{cls:'9',chapter:'all'},image:{cls:'9',chapter:'all'},reel:{cls:'9',chapter:'all'},short:{cls:'9',chapter:'all'}};
  function saveActiveTypeState(){questionsByType[currentType]=currentQuestion;write('gsContentQuestionsByType',questionsByType);const out=typeOutput[currentType];if(!out)return;if(currentType==='post'){out.draft=generatedDraft;out.pkg=generatedPackage}else if(currentType==='image'){out.imageData=generatedImageData;out.imageUrl=generatedImageUrl;out.pkg=generatedPackage}else{out.videoUrl=videoUrl;out.pkg=generatedPackage}}
  function restoreTypeState(type){currentQuestion=questionsByType[type]||null;const out=typeOutput[type]||{};generatedDraft=out.draft||'';generatedImageData=out.imageData||'';generatedImageUrl=out.imageUrl||'';videoUrl=out.videoUrl||'';generatedPackage=out.pkg||null;const sel=typeSelectors[type]||{cls:'9',chapter:'all'};if($('ccClass'))$('ccClass').value=sel.cls;if($('ccChapter'))$('ccChapter').value=sel.chapter;renderQuestion(currentQuestion);if($('imagePreview'))$('imagePreview').src=generatedImageData||'';if($('imageStatus'))$('imageStatus').textContent=generatedImageData?'IMAGE READY • इस Image Post का अलग Question':'पहले इस Image Post के लिए Question generate करें।';if($('postOutput')&&type==='post')$('postOutput').value=generatedDraft;updatePublishAvailability();}
  function switchContentType(nextType){if(nextType===currentType)return;saveActiveTypeState();currentType=nextType;restoreTypeState(currentType);updateState();}
  function msg(t,kind='info'){const e=$('ccNotice');if(e){e.textContent=t;e.className='notice '+kind;e.hidden=false;setTimeout(()=>e.hidden=true,5000)}}
  async function session(){const {data,error}=await sb.auth.getSession();if(error)throw error;if(!data?.session?.access_token)throw new Error('Admin session उपलब्ध नहीं है। कृपया Admin Panel में login करें।');return data.session.access_token}
  // Temporary-media cleanup is requested only after a publishing API confirms success.
  // The cleanup Edge Function must independently authorize this authenticated request.
  function storagePathFromPublicUrl(value){
    if(!value)return '';
    try{
      const u=new URL(value,window.location.href);
      const marker='/storage/v1/object/public/content-media/';
      const at=u.pathname.indexOf(marker);
      if(at<0)return '';
      return decodeURIComponent(u.pathname.slice(at+marker.length)).replace(/^\/+/, '');
    }catch(e){return '';}
  }
  function approvedTemporaryMediaPath(path){
    if(!path)return false;
    if(path.startsWith('content-packages/images/'))return true;
    if(path.startsWith('content-packages/youtube/'))return true;
    return /^video-scenes\/questions\/[^/]+\/final\/question-[^/]+-final\.mp4$/.test(path);
  }
  async function requestTemporaryMediaCleanup(path){
    if(!approvedTemporaryMediaPath(path))return {ok:false,skipped:true,reason:'Not an approved temporary media path'};
    const token=await session();
    const response=await fetch(SUPABASE_URL+'/functions/v1/cleanup-temporary-media',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'apikey':ANON},
      body:JSON.stringify({action:'delete_after_publish',storage_path:path,publish_confirmed:true})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok!==true)throw new Error(data.error||('Cleanup request failed ('+response.status+')'));
    return data;
  }
  const cleanupSuccessKey='gsTemporaryMediaPublishSuccess_v1';
  function recordMediaPublishSuccess(path,platform,contentType){
    if(!approvedTemporaryMediaPath(path))return null;
    let state={};try{state=JSON.parse(localStorage.getItem(cleanupSuccessKey)||'{}')}catch(e){state={}}
    const key=path;
    const entry=state[key]||{platforms:[],contentType:contentType||''};
    if(!entry.platforms.includes(platform))entry.platforms.push(platform);
    entry.contentType=contentType||entry.contentType;
    state[key]=entry;
    try{localStorage.setItem(cleanupSuccessKey,JSON.stringify(state))}catch(e){}
    // Keep shared media until each AUTOMATIC destination applicable to this content
    // type and enabled in the current workflow has reported API success. Manual-only
    // destinations (WhatsApp Channel / YouTube Community text posts) never count.
    const configured=Array.isArray(allowedPlatforms())?allowedPlatforms():['facebook'];
    const supported=entry.contentType==='image'
      ? ['facebook','instagram']
      : (entry.contentType==='reel'||entry.contentType==='short'
          ? ['facebook','instagram','youtube']
          : ['facebook']);
    const required=supported.filter(p=>configured.includes(p));
    if(!required.length)required.push(platform);
    if(!required.every(p=>entry.platforms.includes(p)))return {pending:true,required,completed:entry.platforms};
    return {ready:true,key};
  }
  async function cleanupAfterPublishSuccess(pkg,result,platform){
    if(result?.manual)return;
    // YouTube uploads a separate temporary copy; clean that copy only after API success.
    const uniqueYouTubePath=result?.cleanup_storage_path||'';
    if(platform==='youtube'&&uniqueYouTubePath&&approvedTemporaryMediaPath(uniqueYouTubePath)){
      try{await requestTemporaryMediaCleanup(uniqueYouTubePath)}catch(e){console.warn('[Ganit Setu] YouTube temporary copy cleanup was not completed:',e.message||e)}
      return;
    }
    const path=storagePathFromPublicUrl(pkg?.media_url||pkg?.video_url||'');
    if(!approvedTemporaryMediaPath(path))return;
    const state=recordMediaPublishSuccess(path,platform,pkg?.content_type);
    if(!state?.ready)return;
    try{
      const cleanup=await requestTemporaryMediaCleanup(path);
      if(cleanup.deleted){
        const saved=JSON.parse(localStorage.getItem(cleanupSuccessKey)||'{}');delete saved[path];localStorage.setItem(cleanupSuccessKey,JSON.stringify(saved));
        console.info('[Ganit Setu] Temporary media deleted after confirmed publish:',path);
      }else{
        console.info('[Ganit Setu] Temporary media retained:',cleanup.reason||cleanup.message||'cleanup did not delete');
      }
    }catch(e){console.warn('[Ganit Setu] Temporary media cleanup request failed; media retained:',e.message||e)}
  }
  function qCaption(q){return ['📘 GANIT SETU',`कक्षा ${q.class_level} | अध्याय ${q.chapter_number} — ${q.chapter_name||''}`,'','🧮 आज का गणित प्रश्न:',q.question_text,'',`A) ${q.option_a}`,`B) ${q.option_b}`,`C) ${q.option_c}`,`D) ${q.option_d}`,'','🤔 आपका उत्तर क्या है? Comment करके बताइए!','','#GanitSetu #MPBoard #Mathematics #MathsQuestion #Class'+q.class_level].join('\n')}
  // Image Post captions are anchored to the exact question used to render the image.
  // Keep hashtags ASCII-only to avoid broken Devanagari hashtags on social platforms.
  function imageQuestionCaption(q, platform='facebook', variant={}, base={}){
    // Image already contains the question and options. Keep its social caption short;
    // never repeat the full question in the caption. Image Post only.
    return [
      '🧠 अगर जीनियस हो, तो सही जवाब बताओ! 🔥',
      '',
      '👇 अपना जवाब कमेंट में लिखो!',
      '',
      '📚 रोज़ नए Maths Challenges के लिए Ganit Setu से जुड़ें।',
      '',
      '#GanitSetu #MathsChallenge #BrainTest #MPBoard #Class9Maths'
    ].join('\n');
  }
  // Keep hashtags as a properly spaced caption line; do not send a second hashtag field.
  function captionWithHashtags(value, tags){
    const body=String(value||'').replace(/(^|\s)#[\p{L}\p{N}_]+/gu,' ').replace(/[ \t]+/g,' ').split('\n').map(line=>line.trim()).filter(Boolean).join('\n').trim();
    const raw=Array.isArray(tags)?tags.join(' '):String(tags||'');
    const normalized=[...raw.matchAll(/[\p{L}\p{N}_]+/gu)].map(m=>'#'+m[0]).filter((tag,i,all)=>all.indexOf(tag)===i);
    return [body,normalized.join(' ')].filter(Boolean).join('\n\n');
  }
  function qMeta(q,pkg=null){
    const p=pkg||{};
    return {title:p.title||`आज का गणित प्रश्न | कक्षा ${q.class_level} | अध्याय ${q.chapter_number}`,
      caption:p.caption||qCaption(q),description:p.description||`${q.question_text}

Hint: ${q.hint||'Comment करके उत्तर बताइए।'}

Ganit Setu — MP Board Mathematics Learning`,
      hashtags:p.hashtags||`#GanitSetu #MPBoard #Mathematics #MathsQuestion #Class${q.class_level}`,
      answerComment:p.answer_comment||`✅ सही उत्तर: ${q.correct_option||''}
💡 Hint: ${q.hint||''}
📖 Explanation: ${q.explanation||''}`,
      hook:p.hook||'',cta:p.cta||'',keywords:p.keywords||''};
  }
  function parseGeneratedPackage(text){
    const clean=String(text||'').trim();
    let candidate=clean;
    const fenced=clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if(fenced) candidate=fenced[1].trim();
    const first=candidate.indexOf('{'), last=candidate.lastIndexOf('}');
    if(first>=0&&last>first) candidate=candidate.slice(first,last+1);
    try{
      const o=JSON.parse(candidate);
      return {title:o.title||'',hook:o.hook||'',post:o.post||o.main_post||o.content||'',caption:o.caption||'',description:o.description||'',cta:o.cta||'',hashtags:Array.isArray(o.hashtags)?o.hashtags.join(' '):(o.hashtags||''),keywords:Array.isArray(o.keywords)?o.keywords.join(', '):(o.keywords||o.tags||''),answer_comment:o.answer_comment||o.answerComment||'',hint:o.hint||currentQuestion?.hint||'',explanation:o.explanation||currentQuestion?.explanation||'',platform_packages:o.platform_packages&&typeof o.platform_packages==='object'?o.platform_packages:null};
    }catch(e){return null;}
  }
  const DEFAULT_MASTER_PROMPTS={
    question:'For a selected Class 9/10 maths question, create a plain-text Hindi post in this exact structure: 📘 GANIT SETU; Class and Chapter; 🧮 आज का गणित प्रश्न; exact question; options A) B) C) D); 🤔 आपका उत्तर क्या है? Comment करके बताइए!; hashtags #GanitSetu #MPBoard #Mathematics #MathsQuestion #ClassN. Preserve question/options exactly. NEVER reveal correct answer, hint, or explanation in public post; put these only in answer_comment metadata.',
    trick:'Create a useful, mathematically correct maths trick for Class 9/10 students. Use a fresh question or example and explain the trick simply.',
    motivation:'Create an encouraging Hindi post motivating Class 9/10 students to practise mathematics. No question is required. Do not invent app features.',
    test:'Create a concise Hindi reminder encouraging students to take the test. Use only test details supplied in the topic/instruction; do not invent dates or times.',
    app:'Create a clear announcement about the Ganit Setu app update using only the feature/update details supplied by the user. Do not invent features.'
  };
  const promptKey='gs_content_master_prompts_v1';
  function getMasterPrompts(){try{return {...DEFAULT_MASTER_PROMPTS,...JSON.parse(localStorage.getItem(promptKey)||'{}')}}catch(e){return {...DEFAULT_MASTER_PROMPTS}}}
  function persistMasterPrompts(all){try{const serialized=JSON.stringify(all);localStorage.setItem(promptKey,serialized);const saved=localStorage.getItem(promptKey);if(saved!==serialized)throw new Error('सेव की पुष्टि नहीं हो सकी');const check=JSON.parse(saved);if(!check||typeof check!=='object')throw new Error('Storage verification failed');return true}catch(e){throw new Error('Master Prompt इस ब्राउज़र में सेव नहीं हो पाया। Browser site data/storage अनुमति जाँचें। '+(e.message||''))}}
  function selectedMasterPrompt(){const all=getMasterPrompts();return all[$('postType')?.value||'question']||all.question}
  function initMasterPromptUI(){
    const type=$('masterPromptType'),area=$('masterPromptText'),status=$('masterPromptStatus');if(!type||!area)return;
    const fill=()=>{area.value=getMasterPrompts()[type.value]||DEFAULT_MASTER_PROMPTS[type.value]||'';if(status)status.textContent='';};
    type.addEventListener('change',fill);fill();
    // Keep the visible editor aligned with the selected Post Type; saved values remain per type.
    const postType=$('postType');if(postType){postType.addEventListener('change',()=>{type.value=postType.value;fill()});}
    const save=$('saveMasterPrompt'); if(save){save.type='button';save.addEventListener('click',(ev)=>{ev.preventDefault();try{const all=getMasterPrompts();all[type.value]=area.value.trim()||DEFAULT_MASTER_PROMPTS[type.value];persistMasterPrompts(all);if(status)status.textContent='सेव हो गया ✓';msg('Master Prompt सेव हो गया। पेज refresh करके भी सुरक्षित रहना चाहिए।','success')}catch(err){if(status)status.textContent=err.message;msg(err.message,'error')}})}
  }
  function packagePrompt(){
    const q=currentQuestion;
    const instruction=$('postInstruction').value.trim();
    const master=selectedMasterPrompt();
    const type=$('postType').value;
    const questionBased=(type==='question'||type==='trick');
    return [
      `MASTER PROMPT: ${master}`,
      `Question-based content: ${questionBased?'Yes. Use the selected fresh question or a relevant new maths example for a trick.':'No. Do not require or force a mathematics question; use the supplied topic/instruction.'}`,
      'Create a COMPLETE SOCIAL MEDIA CONTENT PACKAGE for THIS EXACT mathematics question only.',
      'Return ONLY valid JSON. No markdown, no ``` fences, no extra text.',
      'JSON keys: title, hook, post, caption, description, cta, hashtags, keywords, answer_comment, hint, explanation, platform_packages.',
      'platform_packages must include facebook, instagram, youtube, whatsapp; each contains title, hook, post, caption, description, cta, hashtags, keywords, answer_comment.',
      'hashtags must be an array of 8-15 relevant hashtags including Ganit Setu and MP Board.',
      'keywords must be an array of 8-15 search tags/keywords.',
      'Keep mathematics accurate. Do not change the question, options, answer, hint or explanation.',
      'Write audience-friendly Hindi unless the selected language requires Hinglish or English.',
      questionBased?`Question ID: Q${q?.id||''}`:'',
      questionBased?`Class: ${q?.class_level||$('ccClass')?.value||''}`:'',
      questionBased?`Chapter: ${q?.chapter_number||''} - ${q?.chapter_name||''}`:'',
      questionBased?`Question: ${q?.question_text||''}`:'',
      questionBased?`Options: A) ${q?.option_a||''}; B) ${q?.option_b||''}; C) ${q?.option_c||''}; D) ${q?.option_d||''}`:'',
      questionBased?`Correct option: ${q?.correct_option||''}`:'',
      questionBased?`Hint: ${q?.hint||''}`:'',
      questionBased?`Explanation: ${q?.explanation||''}`:'',
      'PLATFORM SELECTION RULE: Do not ask the user to select a platform. Generate platform-specific versions for ALL FOUR targets in one response: facebook, instagram, youtube, whatsapp.',
      'Return one JSON object with a top-level platform_packages object whose keys are facebook, instagram, youtube, whatsapp. Each platform value must contain title, hook, post, caption, description, cta, hashtags, keywords, answer_comment. Adapt length and style to the platform while preserving mathematical facts exactly.',
      'Facebook: engaging feed copy; Instagram: concise caption and relevant hashtags; YouTube: video title, searchable description and tags; WhatsApp: short channel-friendly message. Do not claim a video has been created.',
      `Content type requested: ${currentType}`,
      instruction?`Additional instruction: ${instruction}`:''
    ].filter(Boolean).join('\n');
  }

  const TYPE_PLATFORMS={post:['facebook','youtube','whatsapp'],image:['facebook','instagram','youtube','whatsapp'],reel:['facebook','instagram','youtube','whatsapp'],short:['facebook','instagram','youtube','whatsapp']};
  const PLATFORM_LABELS={facebook:'Facebook',instagram:'Instagram',youtube:'YouTube',whatsapp:'WhatsApp Channel'};
  function allowedPlatforms(){return TYPE_PLATFORMS[currentType]||TYPE_PLATFORMS.post}
  function renderPlatformChoices(){
    const allowed=allowedPlatforms();
    document.querySelectorAll('.platform[data-platform]').forEach(card=>{card.hidden=!allowed.includes(card.dataset.platform);card.classList.toggle('active',allowed.includes(card.dataset.platform));});
    if($('currentPlatform'))$('currentPlatform').textContent=allowed.map(p=>PLATFORM_LABELS[p]).join(' • ');
    renderPlatformPreviews();
  }
  function renderPlatformPreviews(){
    const box=$('allPlatformPreviews');if(!box)return;
    if(!generatedPackage&&!(currentType==='image'&&generatedImageData)){box.innerHTML='<div class="empty">पहले Content Generate करें या Image सेक्शन में Master Template पर Question लिखें।</div>';return;}
    const base=readPackageFields(), variants=base.platform_packages||{};
    box.innerHTML=allowedPlatforms().map(platform=>{
      const v=variants[platform]&&typeof variants[platform]==='object'?variants[platform]:base;
      // For a question-based Text Post, every platform must use the exact same selected question.
      // AI-generated per-platform variants may vary the question, so do not trust them for this case.
      const isQuestionTextPost=currentType==='post'&&(($('postType')?.value||'question')==='question')&&!!currentQuestion;
      const isImageQuestion=currentType==='image'&&!!currentQuestion;
      const caption=isQuestionTextPost?qCaption(currentQuestion):isImageQuestion?imageQuestionCaption(currentQuestion,platform,v,base):(v.caption||v.post||base.caption||base.post||'');
      const isYouTubeTextPost=platform==='youtube'&&currentType==='post';
      const note=isYouTubeTextPost?'टेक्स्ट कॉपी होगा और YouTube Community खुलेगा। अंतिम Post बटन वहाँ दबाना होगा।':platform==='whatsapp'?'पूरा पोस्ट कॉपी होगा और मौजूदा Ganit Setu WhatsApp Channel खुलेगा। वहाँ मैन्युअल रूप से शेयर करें।':platform==='instagram'&&currentType==='post'?'Text-only Instagram publish उपलब्ध नहीं।':'';
      const canPublish=platform==='facebook' || platform==='whatsapp' || (platform==='instagram'&&currentType!=='post'&&!!(generatedImageUrl||generatedImageData||videoUrl)) || (platform==='youtube'&&(isYouTubeTextPost||((currentType==='image'||currentType==='reel'||currentType==='short')&&!!(generatedImageUrl||generatedImageData||videoUrl))));
      const publishLabel=platform==='whatsapp'?'↗ Copy + Open WhatsApp Channel':(platform==='youtube'&&(isYouTubeTextPost||currentType==='image'))?'↗ Open Community + Copy':canPublish?'🚀 Publish':'Publish unavailable';
      const pill=((platform==='youtube'&&(isYouTubeTextPost||currentType==='image'))||platform==='whatsapp')?'Copy + Open':canPublish?'Publish available':'Preview only';
      const imagePreview=currentType==='image'&&generatedImageData?`<img src="${generatedImageData}" alt="${PLATFORM_LABELS[platform]} image preview" style="display:block;width:100%;max-width:320px;max-height:520px;height:auto;object-fit:contain;object-position:center;margin:10px auto;border-radius:10px">`:'';return `<article class="preview-platform-card" data-preview-platform="${platform}"><div class="preview-card-head"><h3>${PLATFORM_LABELS[platform]}</h3><span class="platform-pill">${pill}</span></div>${note?`<p class="preview-note">${esc(note)}</p>`:''}${imagePreview}<pre>${esc(caption)}</pre><div class="preview-card-actions"><button type="button" class="btn ghost copy-platform" data-copy-platform="${platform}">📋 Copy Preview</button><button type="button" class="btn purple platform-publish" data-publish-platform="${platform}" ${canPublish?'':'disabled'}>${publishLabel}</button></div></article>`;
    }).join('');
    box.querySelectorAll('[data-copy-platform]').forEach(btn=>btn.addEventListener('click',async()=>{
      const platform=btn.dataset.copyPlatform;
      const v=(base.platform_packages||{})[platform]||base;
      const isQuestionTextPost=currentType==='post'&&(($('postType')?.value||'question')==='question')&&!!currentQuestion;
      const isImageQuestion=currentType==='image'&&!!currentQuestion;
      // Copy exact question/options for image mode so caption can never describe a different question.
      const parts=(isQuestionTextPost||isImageQuestion)
        ? [isQuestionTextPost?qCaption(currentQuestion):imageQuestionCaption(currentQuestion,platform,v,base)]
        : [v.title||base.title, v.hook||base.hook, v.caption||v.post||base.caption||base.post, v.cta||base.cta, Array.isArray(v.hashtags)?v.hashtags.join(' '):(v.hashtags||base.hashtags)]
            .map(x=>String(x||'').trim()).filter(Boolean);
      const text=parts.join('\n\n').trim();
      if(!text)return msg('कॉपी करने के लिए पोस्ट का टेक्स्ट खाली है।','error');
      try{
        if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);msg(PLATFORM_LABELS[platform]+' का पूरा पोस्ट कॉपी हो गया। YouTube में Ctrl+V करें।','success');}
        else{
          const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);const ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('copy command failed');msg(PLATFORM_LABELS[platform]+' का पूरा पोस्ट कॉपी हो गया। YouTube में Ctrl+V करें।','success');
        }
      }catch(e){msg('ऑटो-कॉपी नहीं हो पाया। Preview के टेक्स्ट पर क्लिक करके Ctrl+A, Ctrl+C करें।','error');}
    }));
    box.querySelectorAll('[data-publish-platform]').forEach(btn=>btn.addEventListener('click',()=>publishOnePlatform(btn.dataset.publishPlatform)));
  }
  async function makeCurrentPlatformPackage(platform){
    if(!currentQuestion)throw new Error('पहले Question generate करें।');
    const base=readPackageFields(), variants=base.platform_packages||{};
    const v=variants[platform]&&typeof variants[platform]==='object'?variants[platform]:base;
    const content={...base,...v,platform_packages:undefined};
    // Publish/save the same verified selected question shown in the Text Post preview.
    if(currentType==='post'&&(($('postType')?.value||'question')==='question')&&currentQuestion){
      content.caption=qCaption(currentQuestion);
      content.post=content.caption;
      content.title=`कक्षा ${currentQuestion.class_level} गणित | अध्याय ${currentQuestion.chapter_number} — ${currentQuestion.chapter_name||''}`;
    } else if(currentType==='image'&&currentQuestion){
      // Critical consistency guard: the published caption is rebuilt from the same Question
      // currently used by the image canvas, never from a stale AI draft.
      content.caption=imageQuestionCaption(currentQuestion,platform,v,base);
      content.post=content.caption;
      content.title=`कक्षा ${currentQuestion.class_level} गणित | अध्याय ${currentQuestion.chapter_number} — ${currentQuestion.chapter_name||''}`;
      content.hashtags=(content.caption.match(/#[A-Za-z0-9_]+/g)||[]).join(' ');
    }
    content.hashtags=Array.isArray(content.hashtags)?content.hashtags.join(' '):(content.hashtags||'');
    content.keywords=Array.isArray(content.keywords)?content.keywords.join(', '):(content.keywords||'');
    let mediaUrl=generatedImageUrl;
    if(generatedImageData&&!mediaUrl){const up=await uploadFile(dataUrlToFile(generatedImageData,`Q${currentQuestion.id}_GANIT_SETU.jpg`),'images',currentQuestion.id);mediaUrl=generatedImageUrl=up.url;}
    return {id:crypto.randomUUID(),question_id:(currentType==='post'? (platform==='facebook'?currentQuestion.id:Number(currentQuestion.id)) : currentQuestion.id),class_level:Number(currentQuestion.class_level),chapter_number:Number(currentQuestion.chapter_number),chapter_name:currentQuestion.chapter_name||'',platform,content_type:currentType,content,draft:content.post||content.caption||'',media_url:mediaUrl||'',video_url:videoUrl||'',created_at:new Date().toISOString(),status:'saved'};
  }
  async function publishOnePlatform(platform){
    const btn=document.querySelector(`[data-publish-platform="${platform}"]`);
    const originalLabel=btn?.textContent||'🚀 Publish';
    if(btn){btn.disabled=true;btn.textContent='⏳ Facebook/Platform पर भेज रहे हैं…';}
    if(platform==='facebook') msg('Facebook को पोस्ट भेजी जा रही है। कृपया परिणाम आने तक पेज बंद न करें।','info');
    try{
      if(platform==='whatsapp'){
        // Start clipboard work directly inside the click gesture (before awaits), so browsers allow it.
        // Preserve the existing caption/content and open the existing Ganit Setu Channel.
        const baseNow=readPackageFields(), variantsNow=baseNow.platform_packages||{};
        const vNow=variantsNow.whatsapp&&typeof variantsNow.whatsapp==='object'?variantsNow.whatsapp:baseNow;
        const isQuestionPost=currentType==='post'&&(($('postType')?.value||'question')==='question')&&!!currentQuestion;
        const isImageQuestion=currentType==='image'&&!!currentQuestion;
        const postText=(isQuestionPost?qCaption(currentQuestion):isImageQuestion?imageQuestionCaption(currentQuestion,'whatsapp',vNow,baseNow):[vNow.title||baseNow.title,vNow.hook||baseNow.hook,vNow.caption||vNow.post||baseNow.caption||baseNow.post,vNow.cta||baseNow.cta,Array.isArray(vNow.hashtags)?vNow.hashtags.join(' '):(vNow.hashtags||baseNow.hashtags)].filter(Boolean).join('\n\n')).trim();
        let copyPromise;
        try{
          if(!postText)throw new Error('empty caption');
          if(navigator.clipboard&&window.isSecureContext)copyPromise=navigator.clipboard.writeText(postText);
          else {const ta=document.createElement('textarea');ta.value=postText;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);const ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('copy failed');copyPromise=Promise.resolve();}
        }catch(e){copyPromise=Promise.reject(e);}
        // Open synchronously on the user click so popup blockers are less likely to stop it.
        window.open('https://whatsapp.com/channel/0029VbDLOBHICVfrePXZ363D','_blank','noopener');
        if(currentType==='image'&&(generatedImageData||generatedImageUrl)){
          const a=document.createElement('a');a.href=generatedImageData||generatedImageUrl;a.download=`GANIT_SETU_Q${currentQuestion?.id||'image'}.png`;a.target='_blank';document.body.appendChild(a);a.click();a.remove();
        }
        try{
          await copyPromise;
          msg('कैप्शन कॉपी हो गया, Ganit Setu WhatsApp Channel खुल गया। इमेज डाउनलोड हुई/शुरू हुई; वहाँ इमेज जोड़कर Ctrl+V करें और मैन्युअल शेयर करें।','success');
        }catch(e){msg('WhatsApp Channel खुल गया और इमेज डाउनलोड हुई/शुरू हुई, लेकिन ऑटो-कॉपी ब्राउज़र ने रोकी। Preview से Copy Preview दबाएँ या Ctrl+C करें।','error');}
        return;
      }
      if(platform==='youtube'&&(currentType==='post'||currentType==='image')){
        // YouTube Community has no supported direct publish endpoint here; open it and prepare text/image for manual posting.
        window.open('https://www.youtube.com/@GanitSetuOfficial/community','_blank','noopener');
        const pkg=await makeCurrentPlatformPackage(platform);
        const postText=[pkg.content.title,pkg.content.hook,pkg.content.caption||pkg.content.post,pkg.content.cta,pkg.content.hashtags].filter(Boolean).join('\n\n').trim();
        if(currentType==='image'&&(generatedImageData||generatedImageUrl)){
          const a=document.createElement('a');a.href=generatedImageData||generatedImageUrl;a.download=`GANIT_SETU_Q${currentQuestion?.id||'image'}.png`;a.target='_blank';document.body.appendChild(a);a.click();a.remove();
        }
        try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(postText);else {const ta=document.createElement('textarea');ta.value=postText;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);document.execCommand('copy');ta.remove();}msg('YouTube Community खुल गया और मौजूदा पोस्ट टेक्स्ट कॉपी हो गया। इमेज पोस्ट के लिए डाउनलोड हुई इमेज जोड़ें; फिर मैन्युअल Post करें।','info');}
        catch(e){msg('YouTube Community खुल गया। Preview से टेक्स्ट कॉपी करें और इमेज अलग से जोड़ें।','info');}
        return;
      }
      if(platform==='youtube'&&currentType==='post'){
        // Open the official Community page from this Content Creation action.
        // YouTube Data API does not provide a documented Community text-post create endpoint.
        window.open('https://www.youtube.com/@GanitSetuOfficial/community','_blank','noopener');
        const pkg=await makeCurrentPlatformPackage(platform);
        const postText=[pkg.content.title,pkg.content.hook,pkg.content.caption||pkg.content.post,pkg.content.cta,pkg.content.hashtags].filter(Boolean).join('\n\n').trim();
        try{await navigator.clipboard.writeText(postText);msg('YouTube Community खुल गया और पोस्ट टेक्स्ट कॉपी हो गया। वहाँ Post बॉक्स में Ctrl+V करें और Post दबाएँ। अभी पोस्ट प्रकाशित नहीं हुआ है।','info');}
        catch(e){msg('YouTube Community खुल गया। Preview से टेक्स्ट कॉपी करें, वहाँ Ctrl+V करें और Post दबाएँ। अभी पोस्ट प्रकाशित नहीं हुआ है।','info');}
        return;
      }
      const pkg=await makeCurrentPlatformPackage(platform);
      const result=await publishPackage(pkg);
      if(result?.manual){msg(result.message||'मैन्युअल शेयर आवश्यक है।','info');return;}
      await cleanupAfterPublishSuccess(pkg,result,platform);
      const postId=result?.external_post_id||result?.post_id||result?.id||'';
      if(btn){btn.textContent='✅ Publish API Success';}
      msg(PLATFORM_LABELS[platform]+' की API ने सफलता लौटाई।'+(postId?' Post ID: '+postId:'')+(result?.external_url?' • '+result.external_url:''),'success');
      if(platform==='facebook') console.info('[Ganit Setu] Facebook publish result', {success:result?.success,ok:result?.ok,external_post_id:postId,external_url:result?.external_url||null});
    }catch(e){
      console.error('[Ganit Setu] '+PLATFORM_LABELS[platform]+' publish failed',e);
      if(btn)btn.textContent='❌ Publish Failed';
      msg(PLATFORM_LABELS[platform]+' publish नहीं हुआ: '+(e.message||e)+'। अगर संदेश अस्पष्ट हो तो Browser Console और Supabase facebook-oauth logs जाँचें।','error');
    }
    finally{if(btn){btn.disabled=false;setTimeout(()=>{if(btn.isConnected)btn.textContent=originalLabel;},4500);}}
  }
  async function publishAllCurrent(){
    if(!currentQuestion)return msg('पहले Question generate करें।','error');
    if(currentType!=='post')return publishCurrent();
    // Open manual destinations synchronously from the click so browser pop-up blockers are less likely to block them.
    const ytWin=window.open('https://www.youtube.com/@GanitSetuOfficial/community','_blank','noopener');
    const waWin=window.open('https://whatsapp.com/channel/0029VbDLOBHICVfrePXZ363D','_blank','noopener');
    const base=readPackageFields();
    const isQuestionPost=(($('postType')?.value||'question')==='question')&&!!currentQuestion;
    const fullText=(isQuestionPost?qCaption(currentQuestion):[base.title,base.hook,base.caption||base.post,base.cta,base.hashtags].filter(Boolean).join('\n\n')).trim();
    try{
      if(navigator.clipboard&&window.isSecureContext) await navigator.clipboard.writeText(fullText);
      else {const ta=document.createElement('textarea');ta.value=fullText;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);const ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('copy failed');}
    }catch(e){msg('YouTube Community और WhatsApp Channel खोलने की कोशिश की गई, लेकिन टेक्स्ट auto-copy नहीं हुआ। Preview से कॉपी करें।','error');}
    const platforms=allowedPlatforms();
    const results=[];
    for(const platform of platforms){
      if(platform==='youtube'){results.push('YouTube: Community खुला; कॉपी किया टेक्स्ट पेस्ट करके Post दबाएँ');continue;}
      if(platform==='whatsapp'){results.push('WhatsApp: Channel खुला; कॉपी किया टेक्स्ट पेस्ट करके शेयर करें');continue;}
      if(platform==='instagram'&&currentType==='post'){results.push('Instagram: text-only post समर्थित नहीं; publish नहीं हुआ');continue;}
      try{
        const pkg=await makeCurrentPlatformPackage(platform);
        const result=await publishPackage(pkg);
        // Only an API-confirmed success can trigger cleanup. This is intentionally
        // harmless for text-only packages without an approved temporary media path.
        await cleanupAfterPublishSuccess(pkg,result,platform);
        results.push(platform+': API ने सफलता लौटाई'+(result?.external_url?' — '+result.external_url:''));
      }catch(e){results.push(platform+': असफल — '+(e.message||e));}
    }
    msg('Publish All का परिणाम: '+results.join(' | ')+'. YouTube/WhatsApp की पोस्ट तब तक प्रकाशित नहीं मानी जाएगी जब तक आप वहाँ Post/Send नहीं दबाते।',results.some(x=>x.includes('असफल'))?'error':'info');
  }
  function schedulePlatforms(platforms){
    if(!currentQuestion)return msg('पहले Question generate करें।','error');
    const at=$('publishScheduleAt')?.value;
    if(!at)return msg('पहले भविष्य की तारीख और समय चुनें।','error');
    const when=new Date(at);
    if(Number.isNaN(when.getTime())||when.getTime()<=Date.now())return msg('Schedule के लिए भविष्य की तारीख और समय चुनें।','error');
    const manual=platforms.filter(p=>p==='youtube'||p==='whatsapp');
    const automatic=platforms.filter(p=>p==='facebook'||p==='instagram');
    msg('Schedule अभी वास्तविक रूप से सक्रिय नहीं है। Facebook/Instagram के लिए server-side scheduler और YouTube/WhatsApp के लिए manual posting workflow चाहिए। अभी कोई पोस्ट schedule नहीं की गई।','info');
  }
  function renderPackageFields(pkg){
    // Normalize the actual Image Post package fields as well as preview/copy/publish.
    // This branch is deliberately limited to Image Post; Text Post remains unchanged.
    if(pkg && currentType==='image'){
      const shortCaption=imageQuestionCaption(currentQuestion);
      const shortDescription='📚 रोज़ नए Maths Challenges के लिए Ganit Setu से जुड़ें।';
      const shortHashtags='#GanitSetu #MathsChallenge #BrainTest #MPBoard #Class9Maths';
      const variants=pkg.platform_packages&&typeof pkg.platform_packages==='object'?pkg.platform_packages:{};
      const platform_packages={...variants};
      for(const platform of ['facebook','instagram','youtube','whatsapp']){
        const v=platform_packages[platform]&&typeof platform_packages[platform]==='object'?platform_packages[platform]:{};
        platform_packages[platform]={...v,caption:shortCaption,post:shortCaption,description:shortDescription,hashtags:shortHashtags};
      }
      pkg={...pkg,post:shortCaption,caption:shortCaption,description:shortDescription,cta:'👇 अपना जवाब कमेंट में लिखो!',hashtags:shortHashtags,platform_packages};
    }
    generatedPackage=pkg||null;
    generatedDraft=pkg?.post||'';
    if($('pkgTitle')) $('pkgTitle').value=pkg?.title||'';
    if($('pkgHook')) $('pkgHook').value=pkg?.hook||'';
    if($('postOutput')) $('postOutput').value=pkg?.post||'';
    if($('pkgCaption')) $('pkgCaption').value=pkg?.caption||'';
    if($('pkgDescription')) $('pkgDescription').value=pkg?.description||'';
    if($('pkgCta')) $('pkgCta').value=pkg?.cta||'';
    if($('pkgHashtags')) $('pkgHashtags').value=pkg?.hashtags||'';
    if($('pkgKeywords')) $('pkgKeywords').value=pkg?.keywords||'';
    if($('pkgAnswer')) $('pkgAnswer').value=pkg?.answer_comment||'';
    if($('pkgHint')) $('pkgHint').value=pkg?.hint||'';
    if($('pkgExplanation')) $('pkgExplanation').value=pkg?.explanation||'';
    renderPlatformPreviews();
  }
  function readPackageFields(){
    const base=generatedPackage||{};
    return {...base,
      title:$('pkgTitle')?.value.trim()||base.title||'', hook:$('pkgHook')?.value.trim()||base.hook||'',
      post:$('postOutput')?.value.trim()||base.post||'', caption:$('pkgCaption')?.value.trim()||base.caption||'',
      description:$('pkgDescription')?.value.trim()||base.description||'', cta:$('pkgCta')?.value.trim()||base.cta||'',
      hashtags:$('pkgHashtags')?.value.trim()||base.hashtags||'', keywords:$('pkgKeywords')?.value.trim()||base.keywords||'',
      answer_comment:$('pkgAnswer')?.value.trim()||base.answer_comment||'', hint:$('pkgHint')?.value.trim()||base.hint||'',
      explanation:$('pkgExplanation')?.value.trim()||base.explanation||''
    };
  }
  // Image-specific parser: keep Text Post's original parser/workflow untouched.
  function parseImagePackageSafely(text){
    let candidate=String(text||'').trim();
    const fenced=candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if(fenced)candidate=fenced[1].trim();
    const first=candidate.indexOf('{'),last=candidate.lastIndexOf('}');
    if(first<0||last<=first)return null;
    candidate=candidate.slice(first,last+1);
    let repaired='',inString=false,escaped=false;
    for(let i=0;i<candidate.length;i++){
      const ch=candidate[i];
      if(inString){
        if(escaped){repaired+=ch;escaped=false;}
        else if(ch==='\\'){repaired+=ch;escaped=true;}
        else if(ch==='"'){repaired+=ch;inString=false;}
        else if(ch==='\n')repaired+='\\n';
        else if(ch==='\r')repaired+='\\r';
        else if(ch==='\t')repaired+='\\t';
        else repaired+=ch;
      }else{repaired+=ch;if(ch==='"')inString=true;}
    }
    try{
      const o=JSON.parse(repaired);
      if(!o||typeof o!=='object'||Array.isArray(o))return null;
      const variants=o.platform_packages&&typeof o.platform_packages==='object'?{...o.platform_packages}:{};
      const pkg={
        title:o.title||'',hook:o.hook||'',post:o.post||o.main_post||o.content||'',
        caption:o.caption||'',description:o.description||'',cta:o.cta||'',
        hashtags:Array.isArray(o.hashtags)?o.hashtags.join(' '):(o.hashtags||''),
        keywords:Array.isArray(o.keywords)?o.keywords.join(', '):(o.keywords||o.tags||''),
        answer_comment:o.answer_comment||o.answerComment||'',
        hint:o.hint||currentQuestion?.hint||'',
        explanation:o.explanation||currentQuestion?.explanation||'',
        platform_packages:variants
      };
      const platforms=['facebook','instagram','youtube','whatsapp'];
      for(const platform of platforms){
        const v=variants[platform]&&typeof variants[platform]==='object'?variants[platform]:{};
        variants[platform]={
          title:v.title||pkg.title,hook:v.hook||pkg.hook,
          post:v.post||v.main_post||v.content||pkg.post,
          caption:v.caption||pkg.caption||pkg.post,
          description:v.description||pkg.description,cta:v.cta||pkg.cta,
          hashtags:Array.isArray(v.hashtags)?v.hashtags.join(' '):(v.hashtags||pkg.hashtags),
          keywords:Array.isArray(v.keywords)?v.keywords.join(', '):(v.keywords||pkg.keywords),
          answer_comment:v.answer_comment||v.answerComment||pkg.answer_comment
        };
      }
      pkg.platform_packages=variants;
      // Use a meaningful platform draft if the top-level post is omitted.
      if(!pkg.post){const fallback=variants.facebook||variants.instagram||variants.whatsapp||variants.youtube;pkg.post=fallback?.post||fallback?.caption||'';}
      if(!pkg.caption)pkg.caption=variants.facebook?.caption||pkg.post;
      return pkg;
    }catch(e){console.error('[Ganit Setu] Image package JSON parse error:',e);return null;}
  }

  async function generateImageContentPackage(){
    const btn=$('generateImageContent');if(!btn)return;
    const oldLabel=btn.textContent;
    btn.disabled=true;btn.textContent='⏳ पूरा Image Content Package बन रहा है...';
    try{
      if(!currentQuestion)throw new Error('पहले Image Post के लिए Generate New Question दबाएँ।');
      const token=await session();
      const type=$('postType')?.value||'question';
      const language=$('postLanguage')?.value||'hi';
      const topic=packagePrompt();
      const master=selectedMasterPrompt();
      if(!master||!master.trim())throw new Error('Master Prompt खाली है। Master Prompts खोलकर सेव करें।');
      const payload={type,classLevel:String(currentQuestion.class_level||$('ccClass')?.value||9),language,topic,prompt:topic,masterPrompt:master,question:currentQuestion,platforms:['facebook','instagram','youtube','whatsapp']};
      const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'apikey':ANON},body:JSON.stringify(payload)});
      const raw=await r.text();let d;try{d=JSON.parse(raw)}catch{d={error:raw};}
      if(!r.ok){const detail=typeof d.error==='string'?d.error:(d.error?.message||d.message||raw||`HTTP ${r.status}`);throw new Error(`Gemini request failed (${r.status}): ${detail}`);}
      let responseText=d.text??d.content??d.result?.text??d.data?.text??d.output_text??'';
      if(responseText&&typeof responseText==='object')responseText=JSON.stringify(responseText);
      if(!responseText)throw new Error('Gemini response में text/content नहीं मिला: '+JSON.stringify(d).slice(0,500));
      const pkg=parseImagePackageSafely(responseText);
      if(!pkg)throw new Error('Gemini का Image Content JSON पढ़ा नहीं जा सका। शुरुआती उत्तर: '+String(responseText).slice(0,450));
      renderPackageFields(pkg);
      if($('postStatus'))$('postStatus').textContent='GEMINI • IMAGE CONTENT PREVIEWS READY';
      if($('saveDraft'))$('saveDraft').disabled=false;
      renderPlatformPreviews();
      saveActiveTypeState();
      msg('Image Content Package तैयार है। चारों Preview जाँचकर Save All करें।','success');
    }catch(e){
      if($('postStatus'))$('postStatus').textContent='ERROR';
      msg(e.message||'Image Content Generate नहीं हो पाया।','error');
      console.error('[Ganit Setu] Image package generation failed:',e);
    }finally{btn.disabled=false;btn.textContent=oldLabel||'✨ पूरा Content Package Generate करें';}
  }

  async function generatePost(){
    const selectedType=$('postType')?.value||'question';
    if(!currentQuestion&&(selectedType==='question'||selectedType==='trick'))return msg('इस Post Type के लिए पहले नया Question generate करें।','error');
    const btn=$('generatePost');if(!btn)return;
    btn.disabled=true;btn.textContent='⏳ पूरा Content Package बन रहा है...';
    try{
      const token=await session();
      const type=selectedType,language=$('postLanguage')?.value||'hi';
      const topic=packagePrompt();
      const master=selectedMasterPrompt();
      if(!master||!master.trim())throw new Error('इस Post Type का Master Prompt खाली है। Master Prompts खोलकर Prompt लिखें और सेव करें।');
      const payload={type,classLevel:String(currentQuestion?.class_level||$('ccClass')?.value||9),language,topic,prompt:topic,masterPrompt:master,question:currentQuestion||null,platforms:['facebook','instagram','youtube','whatsapp']};
      let r;
      try{r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'apikey':ANON},body:JSON.stringify(payload)});}catch(netErr){throw new Error('Gemini Edge Function तक request नहीं पहुँची। इंटरनेट/Function URL जाँचें: '+(netErr.message||netErr));}
      const raw=await r.text();let d={};try{d=JSON.parse(raw)}catch{d={error:raw}}
      if(!r.ok){const detail=typeof d.error==='string'?d.error:(d.error?.message||d.message||raw||`HTTP ${r.status}`);throw new Error(`Gemini request failed (${r.status}): ${detail}`)}
      const responseText=d.text||d.content||d.result?.text||d.data?.text||d.output_text||'';
      if(!responseText){throw new Error('Gemini Function ने success response दिया, लेकिन text/content नहीं मिला। Response: '+JSON.stringify(d).slice(0,700));}
      const pkg=parseGeneratedPackage(responseText);
      if(!pkg)throw new Error('Gemini से उत्तर आया, लेकिन वह अपेक्षित JSON format में नहीं है। कृपया Edge Function का response देखें। शुरुआती अंश: '+String(responseText).slice(0,250));
      const requiredPlatforms=['facebook','instagram','youtube','whatsapp'];
      if(!pkg.platform_packages||requiredPlatforms.some(p=>!pkg.platform_packages[p]||typeof pkg.platform_packages[p]!=='object'))throw new Error('Gemini ने चारों platform_packages नहीं लौटाए। कृपया दोबारा Generate करें; इस बार सभी चार platform versions अनिवार्य हैं।');
      renderPackageFields(pkg);
      $('postStatus').textContent='GEMINI • '+allowedPlatforms().length+' PLATFORM PREVIEWS READY';
      if($('saveDraft')) $('saveDraft').disabled=false;
      renderPlatformPreviews();msg('चुने गए Content Type के लिए Preview तैयार हैं। जाँचकर Save All करें।','success');
    }catch(e){
      if($('postStatus'))$('postStatus').textContent='ERROR';
      msg(e.message||'Content Generate नहीं हो पाया।','error');
      console.error('[Ganit Setu] Content generation failed:',e);
    }finally{btn.disabled=false;btn.textContent='✨ Complete Content Generate करें'}
  }
  function roundedRect(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
  function wrapText(ctx,text,maxWidth){const out=[];for(const para of String(text||'').split(/\n/)){let line='';for(const word of para.trim().split(/\s+/)){const test=line?line+' '+word:word;if(ctx.measureText(test).width<=maxWidth||!line)line=test;else{out.push(line);line=word}}if(line)out.push(line);else out.push('')}return out}
  async function loadImg(src){const im=new Image();if(!src.startsWith('data:'))im.crossOrigin='anonymous';await new Promise((res,rej)=>{im.onload=res;im.onerror=()=>rej(new Error('Image load नहीं हुई।'));im.src=src});return im}
  // IMAGE MODE: fixed blank template + programmatic text only.
  // Keep the uploaded master template unchanged. All layout coordinates below are
  // authored on the approved 1100x1375 reference and scaled to the loaded image.
  const IMAGE_TEMPLATE_URL=new URL('assets/images/content-post-template.png',document.baseURI).href;
  const IMAGE_TEMPLATE_CONFIG={width:1229,height:1536};

  function fitLines(ctx,text,maxWidth,maxLines,fontSize,minFontSize=20){
    let size=fontSize, lines=[];
    const split=()=>{
      const out=[];
      for(const para of String(text||'').split(/\n/)){
        let line='';
        for(const word of para.trim().split(/\s+/)){
          const test=line?line+' '+word:word;
          if(ctx.measureText(test).width<=maxWidth||!line) line=test;
          else {out.push(line);line=word;}
        }
        if(line)out.push(line);
      }
      return out;
    };
    while(size>minFontSize){ctx.font=`700 ${size}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;lines=split();if(lines.length<=maxLines)break;size-=2;}
    ctx.font=`700 ${size}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;
    lines=split();
    if(lines.length>maxLines){lines=lines.slice(0,maxLines);let last=lines[maxLines-1];while(last.length&&ctx.measureText(last+'…').width>maxWidth)last=last.slice(0,-1);lines[maxLines-1]=last+'…';}
    return {lines,size};
  }

  async function generateImage(){
    if(!currentQuestion)return msg('पहले Image Post के लिए Question generate करें।','error');
    const btn=$('generateImage');btn.disabled=true;btn.textContent='⏳ सुंदर Question Image बनाई जा रही है...';
    try{
      const template=await loadImg(IMAGE_TEMPLATE_URL);
      const W=template.naturalWidth||IMAGE_TEMPLATE_CONFIG.width;
      const H=template.naturalHeight||IMAGE_TEMPLATE_CONFIG.height;
      const sx=W/1100, sy=H/1375, S=n=>n*Math.min(sx,sy), X=n=>n*sx, Y=n=>n*sy, DX=n=>n*sx, DY=n=>n*sy;
      const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');
      ctx.drawImage(template,0,0,W,H);

      // Reference-matched layout. Positions and dimensions use separate helpers;
      // never use X/Y (absolute positions) to calculate width or height.
      // Chapter strip: centered horizontally, with breathing room from the top of the board.
      // Keep all other question/option/comment coordinates unchanged.
      const chapterW=764, chapterH=55, chapterX=(1200-chapterW)/2, chapterY=194;
      ctx.save();ctx.shadowColor='rgba(13,48,91,.14)';ctx.shadowBlur=S(5);ctx.shadowOffsetY=DY(2);
      roundedRect(ctx,X(chapterX),Y(chapterY),DX(chapterW),DY(chapterH),S(18));ctx.fillStyle='#123b85';ctx.fill();ctx.restore();
      ctx.fillStyle='#ffdf32';ctx.textAlign='center';ctx.textBaseline='middle';
      const chapterLine=`कक्षा ${currentQuestion.class_level}  •  अध्याय ${currentQuestion.chapter_number} — ${currentQuestion.chapter_name||''}`;
      const chapterFit=fitLines(ctx,chapterLine,DX(700),1,S(29),S(19));
      ctx.font=`800 ${chapterFit.size}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;
      ctx.fillText(chapterLine,X(chapterX+chapterW/2),Y(chapterY+chapterH/2),DX(710));

      // Question card and yellow section label
      const qx=230,qy=270,qw=740,qh=193;
      ctx.save();ctx.shadowColor='rgba(15,44,80,.10)';ctx.shadowBlur=S(5);ctx.shadowOffsetY=DY(2);
      roundedRect(ctx,X(qx),Y(qy),DX(qw),DY(qh),S(24));ctx.fillStyle='#fffdf7';ctx.fill();ctx.restore();
      ctx.lineWidth=S(4);ctx.strokeStyle='#f5a623';roundedRect(ctx,X(qx),Y(qy),DX(qw),DY(qh),S(24));ctx.stroke();
      ctx.save();ctx.shadowColor='rgba(245,166,35,.18)';ctx.shadowBlur=S(5);ctx.shadowOffsetY=DY(2);
      roundedRect(ctx,X(242),Y(240),DX(350),DY(59),S(20));ctx.fillStyle='#ffdf32';ctx.fill();ctx.restore();
      ctx.lineWidth=S(2.5);ctx.strokeStyle='#f5a623';roundedRect(ctx,X(242),Y(240),DX(350),DY(59),S(20));ctx.stroke();
      ctx.beginPath();ctx.arc(X(277),Y(269),S(19),0,Math.PI*2);ctx.fillStyle='#123b85';ctx.fill();
      ctx.fillStyle='#ffdf32';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${S(25)}px Arial,sans-serif`;ctx.fillText('?',X(277),Y(269));
      ctx.fillStyle='#102b65';ctx.textAlign='left';ctx.textBaseline='middle';ctx.font=`900 ${S(25)}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;
      ctx.fillText('आज का गणित प्रश्न',X(307),Y(269),DX(270));
      const question=fitLines(ctx,currentQuestion.question_text,DX(qw-70),3,S(39),S(26));
      ctx.font=`800 ${question.size}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;
      ctx.fillStyle='#101d52';ctx.textAlign='center';ctx.textBaseline='middle';
      const qGap=S(5), qTotal=question.lines.length*(question.size+qGap)-qGap;
      const qCenter=Y(qy+111);
      question.lines.forEach((line,i)=>ctx.fillText(line,X(qx+qw/2),qCenter+(i-(question.lines.length-1)/2)*(question.size+qGap),DX(qw-76)));

      // Two-column answer cards match the reference image's spacing.
      const options=[
        {label:'A',text:currentQuestion.option_a,x:238,y:482,color:'#0878ed',bg:'#e8f4ff'},
        {label:'B',text:currentQuestion.option_b,x:622,y:482,color:'#ed1680',bg:'#fff0f7'},
        {label:'C',text:currentQuestion.option_c,x:238,y:580,color:'#0b9b78',bg:'#e8fbf3'},
        {label:'D',text:currentQuestion.option_d,x:622,y:580,color:'#f26b13',bg:'#fff4e7'}
      ];
      for(const o of options){
        const ox=o.x,oy=o.y,ow=360,oh=82;
        ctx.save();ctx.shadowColor='rgba(13,48,91,.10)';ctx.shadowBlur=S(4);ctx.shadowOffsetY=DY(2);
        roundedRect(ctx,X(ox),Y(oy),DX(ow),DY(oh),S(19));ctx.fillStyle=o.bg;ctx.fill();ctx.restore();
        ctx.lineWidth=S(2.5);ctx.strokeStyle=o.color;roundedRect(ctx,X(ox),Y(oy),DX(ow),DY(oh),S(19));ctx.stroke();
        ctx.beginPath();ctx.arc(X(ox+42),Y(oy+oh/2),S(27),0,Math.PI*2);ctx.fillStyle=o.color;ctx.fill();
        ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`800 ${S(34)}px Arial,sans-serif`;ctx.fillText(o.label,X(ox+42),Y(oy+oh/2+1));
        const val=fitLines(ctx,String(o.text||''),DX(ow-90),2,S(38),S(25));
        ctx.textAlign='left';ctx.textBaseline='middle';ctx.font=`800 ${val.size}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;ctx.fillStyle='#101d52';
        val.lines.forEach((line,i)=>ctx.fillText(line,X(ox+86),Y(oy+oh/2)+(i-(val.lines.length-1)/2)*(val.size+S(2)),DX(ow-100)));
      }

      // Comment callout in the lower-right board area, clear of the teacher's face.
      const cx=547,cy=688,cw=415,ch=119;
      ctx.save();ctx.shadowColor='rgba(13,48,91,.16)';ctx.shadowBlur=S(6);ctx.shadowOffsetY=DY(2);
      roundedRect(ctx,X(cx),Y(cy),DX(cw),DY(ch),S(23));ctx.fillStyle='#123b85';ctx.fill();ctx.restore();
      ctx.lineWidth=S(3.5);ctx.strokeStyle='#ffcf28';roundedRect(ctx,X(cx),Y(cy),DX(cw),DY(ch),S(23));ctx.stroke();
      ctx.beginPath();ctx.arc(X(cx+48),Y(cy+ch/2),S(30),0,Math.PI*2);ctx.fillStyle='#ffdf32';ctx.fill();
      ctx.fillStyle='#123b85';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${S(24)}px Arial,sans-serif`;ctx.fillText('•••',X(cx+48),Y(cy+ch/2));
      ctx.fillStyle='#fff';ctx.font=`900 ${S(29)}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;ctx.fillText('अपना उत्तर',X(cx+246),Y(cy+43),DX(cw-105));
      ctx.fillStyle='#ffdf32';ctx.font=`900 ${S(29)}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;ctx.fillText('कमेंट में लिखें',X(cx+246),Y(cy+78),DX(cw-105));

      generatedImageData=c.toDataURL('image/png');
      $('imagePreview').src=generatedImageData;$('imagePreviewWrap').hidden=false;$('imageStatus').textContent='FIXED TEMPLATE • DESIGNED QUESTION INSERTED';
      updatePublishAvailability();renderPlatformPreviews();msg('Question को मास्टर टेम्पलेट पर रेफरेंस लेआउट के अनुसार रखा गया।','success');
    }catch(e){console.error('[Ganit Setu] Image layout error',e);msg(`Question Image नहीं बन पाई: ${e.message||'कृपया template और question data जाँचें।'}`,'error');}
    finally{btn.disabled=false;btn.textContent='🖼️ Template में Question डालें'}
  }

  const VIDEO_SCENE_FILES = [1,2,3,4,5].map(i=>`assets/video-templates/scene-${i}.mp4`);
  let generatedSceneOverlays=[];
  let finalVideoObjectUrl='';
  let imageConvertedVideoUrl='', imageConvertedVideoBlob=null, imageVideoRecording=false;
  function sceneTextLines(ctx,text,maxWidth,maxLines,fontSize,minFontSize){
    const result=fitLines(ctx,String(text||''),maxWidth,maxLines,fontSize,minFontSize);
    return result;
  }
  function drawScenePanel(ctx,lines,sceneNo,W,H){
    // Keep the overlay strictly in the blank upper area; existing template art remains untouched.
    const scale=W/1080, x=68*scale, y=55*scale, w=944*scale, h=sceneNo===2?510*scale:460*scale;
    // Transparent canvas: only the question panel is drawn; never bake the source template/video into PNG.
    ctx.save();ctx.shadowColor='rgba(0,0,0,.22)';ctx.shadowBlur=18*scale;ctx.shadowOffsetY=5*scale;
    roundedRect(ctx,x,y,w,h,28*scale);ctx.fillStyle='rgba(5,25,68,.86)';ctx.fill();ctx.restore();
    ctx.lineWidth=4*scale;ctx.strokeStyle='#ffcf28';roundedRect(ctx,x,y,w,h,28*scale);ctx.stroke();
    const pad=36*scale, maxW=w-pad*2;let fontSize=(sceneNo===1?44:sceneNo===2?36:sceneNo===4?39:40)*scale;
    const all=[];
    lines.forEach((item,index)=>{
      const f=sceneTextLines(ctx,item.text,maxW,item.maxLines||2,fontSize,item.minFontSize?item.minFontSize*scale:22*scale);
      all.push({label:item.label||'',lines:f.lines,size:f.size,color:item.color||'#ffffff',gap:(item.gap||12)*scale,emphasis:!!item.emphasis});
    });
    const total=all.reduce((sum,a)=>sum+(a.label?30*scale:0)+a.lines.length*(a.size+a.gap)+18*scale,0);
    let cy=y+(h-total)/2;
    all.forEach(a=>{
      if(a.label){ctx.textAlign='left';ctx.textBaseline='middle';ctx.font=`800 ${22*scale}px Arial,"Noto Sans Devanagari","Nirmala UI",sans-serif`;ctx.fillStyle='#ffdf32';ctx.fillText(a.label,x+pad,cy);cy+=30*scale;}
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${a.emphasis?'900':'700'} ${a.size}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;ctx.fillStyle=a.color;
      a.lines.forEach(line=>{ctx.fillText(line,x+w/2,cy,maxW);cy+=a.size+a.gap;});cy+=18*scale;
    });
    ctx.restore();
  }
  async function makeFiveSceneImages(){
    const btn=$('generateFiveSceneImages'),status=$('fiveSceneImageStatus'),results=$('fiveSceneImageResults');
    if(!currentQuestion){msg('पहले Reel / Video के लिए प्रश्न चुनें।','error');return;}
    if(!btn||!results)return;
    btn.disabled=true;btn.textContent='⏳ पाँचों PNG बन रही हैं...';status.textContent='टेम्पलेट लोड और PNG render हो रही हैं…';results.innerHTML='';
    try{
      const q=currentQuestion;
      const answerKey=String(q.correct_option||q.correct_answer_option||'').trim().toUpperCase().replace(/^OPTION[_ -]?/,'').replace(/[()]/g,'');
      const answerMap={A:q.option_a,B:q.option_b,C:q.option_c,D:q.option_d};
      const answerText=answerMap[answerKey]||q.correct_answer||q.answer||'सही उत्तर देखें';
      const scenes=[
        {title:'Scene 1 — Question Intro',lines:[{label:`कक्षा ${q.class_level} • अध्याय ${q.chapter_number}`,text:q.question_text,maxLines:5,emphasis:true}]},
        {title:'Scene 2 — Options',lines:[{label:'विकल्प चुनिए',text:`A) ${q.option_a}\nB) ${q.option_b}\nC) ${q.option_c}\nD) ${q.option_d}`,maxLines:8}]},
        {title:'Scene 3 — Hint',lines:[{label:'💡 छोटा सा Hint',text:q.hint||'प्रश्न को ध्यान से पढ़ें और विकल्पों की तुलना करें।',maxLines:5}]},
        {title:'Scene 4 — Answer Reveal',lines:[{label:'✅ सही उत्तर',text:`${answerKey?answerKey+') ':''}${answerText}`,maxLines:3,emphasis:true},{label:'कारण / व्याख्या',text:q.explanation||'अपने उत्तर को प्रश्न और विकल्पों से मिलाकर समझें।',maxLines:3}]},
        {title:'Scene 5 — Follow / Subscribe',lines:[{label:'GANIT SETU',text:'ऐसे ही सवालों और आसान गणित की तैयारी के लिए जुड़े रहिए।',maxLines:4,emphasis:true},{text:`कक्षा ${q.class_level} • MP Board`,maxLines:2,color:'#ffdf32'}]}
      ];
      const generated=[];
      for(let i=0;i<5;i++){
        const video=$(`ccTplPreview${i+1}`);
        if(!video)throw new Error(`Scene ${i+1} का video element नहीं मिला।`);
        const W=video.videoWidth||1080,H=video.videoHeight||1920;
        const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');
        // IMPORTANT: transparent PNG contains only question/text panel; no template image is drawn into it.
        drawScenePanel(ctx,scenes[i].lines,W,H,i+1);
        const data=c.toDataURL('image/png');generated.push({title:scenes[i].title,data,name:`GANIT_SETU_Q${q.id}_scene-${i+1}.png`});
      }
      generatedSceneOverlays=generated;
      results.innerHTML='';
      generated.forEach((item,index)=>{
        const overlay=$(`ccSceneOverlay${index+1}`);
        if(overlay){overlay.src=item.data;overlay.hidden=false;overlay.dataset.ready='true';}
        const card=document.createElement('article');card.className='cc-generated-scene-card';
        const title=document.createElement('b');title.textContent=item.title;
        const preview=document.createElement('img');preview.src=item.data;preview.alt=item.title+' transparent overlay';
        const download=document.createElement('button');download.type='button';download.className='btn ghost';download.textContent='⬇️ Transparent PNG डाउनलोड';
        download.addEventListener('click',()=>{const a=document.createElement('a');a.href=item.data;a.download=item.name;document.body.appendChild(a);a.click();a.remove();});
        card.append(title,preview,download);results.appendChild(card);
      });
      status.textContent=`✅ Q${q.id} की पाँच transparent overlays तैयार हैं और वीडियो के ऊपर लगाई गई हैं।`;
      msg('पाँचों Scene Images इसी पेज पर बन गई हैं।','success');
    }catch(e){console.error('[Ganit Setu] Five-scene image generation failed',e);status.textContent='इमेज नहीं बन पाईं: '+(e.message||'टेम्पलेट फाइल जाँचें।');msg('Scene Images नहीं बन पाईं: '+(e.message||e),'error');}
    finally{btn.disabled=false;btn.textContent='✨ पाँचों Scene Images बनाएं';}
  }

  function dataUrlToFile(dataUrl,name='ganit-setu-question.jpg'){const [meta,b64]=dataUrl.split(',');const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new File([arr],name,{type:(meta.match(/data:(.*?);/)||[])[1]||'image/jpeg'})}
  async function uploadFile(file,folder,qid){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`content-packages/${folder}/${Date.now()}-Q${qid}-${safe}`;const {error}=await sb.storage.from('content-media').upload(path,file,{upsert:false,contentType:file.type||undefined,cacheControl:'3600'});if(error)throw new Error(`Asset upload failed: ${error.message}`);return {path,url:sb.storage.from('content-media').getPublicUrl(path).data.publicUrl}}
  // Image Post -> short motion video. Kept separate from the existing 5-scene Reel workflow.
  async function convertGeneratedImageToVideo(){
    const btn=$('convertImageToVideo'),status=$('imageVideoStatus'),wrap=$('imageVideoPreviewWrap'),preview=$('imageVideoPreview');
    // The visible preview is the source of truth as well: image state may be held in the
    // preview while the tab/state selector has not yet persisted generatedImageData.
    let imageSource=generatedImageData||'';
    if(!imageSource){
      const visiblePreview=$('imagePreview');
      const candidate=visiblePreview?.currentSrc||visiblePreview?.src||'';
      if(candidate && !candidate.endsWith('/')) imageSource=candidate;
    }
    if(!imageSource)return msg('इमेज का preview नहीं मिला। पहले Image टैब में इमेज तैयार होने दें, फिर वीडियो बनाएं।','error');
    if(imageVideoRecording)return;
    if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)return msg('इस browser में video recording उपलब्ध नहीं है। नया Chrome/Edge इस्तेमाल करें।','error');
    btn.disabled=true;imageVideoRecording=true;btn.textContent='⏳ वीडियो बनाया जा रहा है…';
    let audioCtx=null,recorder=null,raf=0,oscillators=[],gainNodes=[];
    try{
      const image=new Image();image.crossOrigin='anonymous';image.src=imageSource;
      await new Promise((resolve,reject)=>{if(image.complete&&image.naturalWidth)return resolve();image.onload=resolve;image.onerror=()=>reject(new Error('Generated image load नहीं हुई।'))});
      if(!generatedImageData&&imageSource.startsWith('data:'))generatedImageData=imageSource;
      const W=720,H=Math.round(720*image.naturalHeight/image.naturalWidth),duration=10;
      const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');
      const videoStream=canvas.captureStream(30);let audioStream=null;
      // Soft, low-volume synthesized ambient tones; no external audio file or service required.
      try{
        audioCtx=new (window.AudioContext||window.webkitAudioContext)();const dest=audioCtx.createMediaStreamDestination();
        const master=audioCtx.createGain();master.gain.value=0.78;master.connect(dest);
        // Brighter, faster upbeat synthesized instrumental pattern; no external audio file required.
        const notes=[659.25,783.99,987.77,783.99,698.46,880.00,1046.5,880.00,659.25,783.99,987.77,1174.66,1046.5,987.77,783.99,698.46,880.00,1046.5,1318.51,1046.5,987.77,1174.66,1396.91,1174.66,783.99,987.77,1174.66,1567.98,1396.91,1174.66,987.77,880.00];
        const t0=audioCtx.currentTime+0.08,beat=0.23;
        notes.forEach((hz,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='triangle';o.frequency.setValueAtTime(hz,t0+i*beat);g.gain.setValueAtTime(0.0001,t0+i*beat);g.gain.linearRampToValueAtTime(0.34,t0+i*beat+0.018);g.gain.exponentialRampToValueAtTime(0.0001,t0+i*beat+0.205);o.connect(g);g.connect(master);o.start(t0+i*beat);o.stop(t0+i*beat+0.22);oscillators.push(o);gainNodes.push(g)});
        // Upbeat low rhythmic pulse underneath the melody.
        [130.81,164.81,196.00,164.81,146.83,174.61,220.00,174.61].forEach((hz,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();const at=t0+i*0.92;o.type='sawtooth';o.frequency.setValueAtTime(hz,at);g.gain.setValueAtTime(0.0001,at);g.gain.linearRampToValueAtTime(0.12,at+0.025);g.gain.exponentialRampToValueAtTime(0.0001,at+0.72);o.connect(g);g.connect(master);o.start(at);o.stop(at+0.74);oscillators.push(o);gainNodes.push(g)});
        await audioCtx.resume();audioStream=dest.stream;
      }catch(e){console.warn('[Ganit Setu] Soft audio track unavailable:',e)}
      const stream=new MediaStream([...videoStream.getVideoTracks(),...(audioStream?audioStream.getAudioTracks():[])]);
      const candidates=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
      const mimeType=candidates.find(t=>MediaRecorder.isTypeSupported(t))||'';
      recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);const chunks=[];
      recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
      const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('Video recording failed'))});
      const start=performance.now();
      const emojis=['🤔','💡','🧠','✍️','✨'];
      const draw=now=>{
        const t=Math.min(1,(now-start)/(duration*1000));ctx.clearRect(0,0,W,H);
        // Keep the complete image locked to the frame so no question/options are cropped.
        // Glitch styling is decorative only: thin scan lines and short RGB streaks stay in margins.
        ctx.fillStyle='#07152d';ctx.fillRect(0,0,W,H);
        ctx.drawImage(image,0,0,W,H);
        // Very subtle scanline texture, low opacity so text remains fully legible.
        ctx.save();ctx.globalAlpha=0.07;ctx.fillStyle='#06152b';
        for(let y=0;y<H;y+=6)ctx.fillRect(0,y,W,1);
        ctx.restore();
        // Edge-only glitch streaks; never shift or slice the image itself.
        const edgeBand=Math.max(8,Math.round(W*.035));
        for(let i=0;i<4;i++){
          const yy=(Math.floor((t*7+i*.237)%1*H));
          const len=W*(.06+((i*7)%5)*.018);
          const left=(i%2===0);
          ctx.save();ctx.globalAlpha=.22;ctx.fillStyle=i%3===0?'#25e7ff':i%3===1?'#ff2f87':'#ffdf32';
          ctx.fillRect(left?0:W-len,yy,len,Math.max(2,H*.0025));
          ctx.restore();
        }
        // Brief RGB edge flashes at intervals; all motion stays outside the question area.
        if((t*5)%1<0.045){ctx.save();ctx.globalAlpha=.16;ctx.fillStyle='#25e7ff';ctx.fillRect(0,0,edgeBand,H);ctx.fillStyle='#ff2f87';ctx.fillRect(W-edgeBand,0,edgeBand,H);ctx.restore();}
        // Soft fade at the start/end without obscuring the question for the main duration.
        const alpha=Math.min(1,t*5,(1-t)*5);ctx.fillStyle=`rgba(3,12,32,${Math.max(0,1-alpha)*.48})`;ctx.fillRect(0,0,W,H);
        // Small, semi-transparent thinking emojis travel only along the side margins.
        emojis.forEach((em,i)=>{const phase=(t*1.7+i*.21)%1,y=H*(.12+phase*.76),left=i%2===0,x=left?W*.055+Math.sin(t*12+i)*7:W*.945+Math.sin(t*12+i)*7;ctx.save();ctx.globalAlpha=.42+.18*Math.sin(t*12+i);ctx.font=`${Math.round(W*.047)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(em,x,y);ctx.restore()});
        // Branded end card in the final 3 seconds; keep it in a bottom strip so the question stays readable.
        if(t>0.70){const k=Math.min(1,(t-.70)/.10);ctx.save();ctx.globalAlpha=k;const bh=H*.105,by=H-bh;ctx.fillStyle='rgba(6,24,65,.88)';ctx.fillRect(0,by,W,bh);ctx.strokeStyle='#ffcf28';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,by);ctx.lineTo(W,by);ctx.stroke();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffdf32';ctx.font=`900 ${Math.round(W*.040)}px Arial,sans-serif`;ctx.fillText('GANIT SETU  •  गणित सेतु',W/2,by+bh*.36);ctx.fillStyle='#ffffff';ctx.font=`800 ${Math.round(W*.031)}px Arial,sans-serif`;ctx.fillText('👍 Like  •  ↗ Share  •  🔔 Subscribe  •  Follow for more videos',W/2,by+bh*.73);ctx.restore();}
        if(t<1)raf=requestAnimationFrame(draw);else {drawFinalFrame();setTimeout(()=>{if(recorder&&recorder.state==='recording')recorder.stop()},80)}
      };
      function drawFinalFrame(){ /* preserve the final branded frame for the recorded video */ }
      recorder.start(200);raf=requestAnimationFrame(draw);
      await stopped;cancelAnimationFrame(raf);stream.getTracks().forEach(t=>t.stop());
      oscillators.forEach(o=>{try{o.stop()}catch(e){}});if(audioCtx)await audioCtx.close().catch(()=>{});
      const actualType=recorder.mimeType||mimeType||(chunks[0]&&chunks[0].type)||'video/webm';
      imageConvertedVideoBlob=new Blob(chunks,{type:actualType});if(!imageConvertedVideoBlob.size)throw new Error('वीडियो खाली बना। दोबारा कोशिश करें।');
      if(imageConvertedVideoUrl)URL.revokeObjectURL(imageConvertedVideoUrl);imageConvertedVideoUrl=URL.createObjectURL(imageConvertedVideoBlob);
      preview.src=imageConvertedVideoUrl;preview.load();wrap.hidden=false;
      const ext=actualType.includes('mp4')?'mp4':'webm';
      const dl=$('imageVideoDownload');if(dl){dl.href=imageConvertedVideoUrl;dl.download=`GANIT_SETU_Q${currentQuestion?.id||'image'}_animated.${ext}`;dl.hidden=false;}
      // Upload is best-effort only; image generation/publishing is not blocked if storage is unavailable.
      try{const file=new File([imageConvertedVideoBlob],`Q${currentQuestion?.id||'image'}_GANIT_SETU.${ext}`,{type:actualType});const hosted=await uploadFile(file,'youtube',currentQuestion?.id||'image');imageConvertedVideoUrl=hosted.url;videoUrl=hosted.url;preview.src=hosted.url;}
      catch(uploadError){videoUrl=imageConvertedVideoUrl;console.warn('[Ganit Setu] Animated video is available locally; upload failed:',uploadError)}
      status.textContent=`✅ वीडियो तैयार • ${ext.toUpperCase()} • 10 सेकंड${actualType.includes('mp4')?'':' (इस browser ने MP4 recording support नहीं की, इसलिए WebM बना है)'}${videoUrl!==imageConvertedVideoUrl?'':' • लोकल preview उपलब्ध'}`;
      const pub=$('imageVideoPublishButtons');if(pub)pub.hidden=false;
      msg('इमेज का animated video तैयार है। पहले preview देखकर publish करें।','success');
    }catch(e){console.error('[Ganit Setu] Image-to-video failed:',e);status.textContent='वीडियो नहीं बन पाया: '+(e.message||e);msg('Image-to-video में समस्या: '+(e.message||e),'error')}
    finally{if(audioCtx)await audioCtx.close().catch(()=>{});btn.disabled=false;btn.textContent='🎬 Convert Image to Video';imageVideoRecording=false;}
  }
  async function publishConvertedImageVideo(platform){
    if(!imageConvertedVideoBlob&&!videoUrl)return msg('पहले वीडियो generate करें।','error');
    // Reuse the established platform publishing path in video mode; restore the user's image mode afterwards.
    const previousType=currentType,previousUrl=videoUrl;
    try{
      if(imageConvertedVideoBlob&&(!videoUrl||videoUrl.startsWith('blob:'))){
        const type=imageConvertedVideoBlob.type||'video/webm';const ext=type.includes('mp4')?'mp4':'webm';
        const file=new File([imageConvertedVideoBlob],`Q${currentQuestion?.id||'image'}_GANIT_SETU.${ext}`,{type});
        const uploaded=await uploadFile(file,'youtube',currentQuestion?.id||'image');videoUrl=uploaded.url;
      }
      currentType='reel';
      await publishOnePlatform(platform);
    }catch(e){msg('Video publish शुरू नहीं हो पाया: '+(e.message||e),'error')}
    finally{currentType=previousType;videoUrl=videoUrl||previousUrl;updateState();}
  }

  async function createFinalVideo(){
    const btn=$('createVideo'),status=$('videoStatus');
    if(!currentQuestion)return msg('पहले Reel / Video के लिए Question चुनें।','error');
    if(generatedSceneOverlays.length!==5)return msg('पहले पाँचों Scene Images बनाएं; फिर वीडियो Combine करें।','error');
    if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)return msg('इस ब्राउज़र में video recording उपलब्ध नहीं है। Chrome या Edge का नया version इस्तेमाल करें।','error');
    const videos=VIDEO_SCENE_FILES.map((_,i)=>$(`ccTplPreview${i+1}`));
    if(videos.some(v=>!v||!v.currentSrc||v.readyState<2)){
      status.textContent='वीडियो फाइलें लोड हो रही हैं…';
      try{await Promise.all(videos.map(v=>new Promise((resolve,reject)=>{if(!v) return reject(new Error('Scene video element नहीं मिला।'));if(v.readyState>=2)return resolve();const timer=setTimeout(()=>reject(new Error('Video load timeout: '+v.currentSrc)),15000);v.addEventListener('loadeddata',()=>{clearTimeout(timer);resolve()},{once:true});v.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Video file load नहीं हुई: '+v.currentSrc))},{once:true});v.load()})))}catch(e){status.textContent='Final Video नहीं बना: '+e.message;return msg(e.message,'error')}
    }
    const overlays=videos.map((_,i)=>$(`ccSceneOverlay${i+1}`));
    if(overlays.some((im,i)=>!im||im.hidden||!im.complete||!im.naturalWidth))return msg('पाँचों transparent overlay का Preview पहले तैयार करें।','error');
    btn.disabled=true;btn.textContent='⏳ पाँचों Scenes Combine हो रहे हैं…';status.textContent='वीडियो रिकॉर्ड हो रहा है; पेज खुला रखें…';
    let audioCtx=null,recorder=null,raf=0;
    try{
      const W=videos[0].videoWidth||1080,H=videos[0].videoHeight||1920;
      const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');
      const videoStream=canvas.captureStream(30);
      let audioStream=null;
      try{
        audioCtx=new (window.AudioContext||window.webkitAudioContext)();
        const destination=audioCtx.createMediaStreamDestination();
        videos.forEach(v=>{
          if(!v._gsAudioNode){v._gsAudioNode=audioCtx.createMediaElementSource(v);}
          v._gsAudioNode.connect(destination);
        });
        await audioCtx.resume();audioStream=destination.stream;
      }catch(audioError){console.warn('[Ganit Setu] Audio mixing unavailable; rendering video without mixed audio track.',audioError);}
      const stream=new MediaStream([...videoStream.getVideoTracks(),...(audioStream?audioStream.getAudioTracks():[])]);
      const mimeCandidates=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
      const mimeType=mimeCandidates.find(t=>MediaRecorder.isTypeSupported(t))||'';
      recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);
      const chunks=[];recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
      const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('Video recording failed'))});
      const draw=()=>{ctx.clearRect(0,0,W,H);const active=videos.find(v=>!v.paused&&!v.ended&&v.readyState>=2);if(active){ctx.drawImage(active,0,0,W,H);const idx=videos.indexOf(active);ctx.drawImage(overlays[idx],0,0,W,H);}raf=requestAnimationFrame(draw)};
      recorder.start(250);draw();
      for(let i=0;i<videos.length;i++){
        const v=videos[i];videos.forEach((other,j)=>{if(j!==i){other.pause();other.currentTime=0}});
        v.muted=false;v.currentTime=0;
        await new Promise((resolve,reject)=>{
          let settled=false;const finish=()=>{if(settled)return;settled=true;v.removeEventListener('ended',finish);v.removeEventListener('error',fail);resolve()};const fail=()=>{if(settled)return;settled=true;reject(new Error(`Scene ${i+1} video play नहीं हो पाया।`))};
          v.addEventListener('ended',finish,{once:true});v.addEventListener('error',fail,{once:true});
          const playPromise=v.play();if(playPromise&&playPromise.catch)playPromise.catch(fail);
        });
      }
      cancelAnimationFrame(raf);recorder.stop();await stopped;
      videos.forEach(v=>{v.pause();v.currentTime=0});
      if(audioCtx)await audioCtx.close().catch(()=>{});
      const blob=new Blob(chunks,{type:recorder.mimeType||'video/webm'});
      if(!blob.size)throw new Error('रिकॉर्डिंग खाली बनी। वीडियो फाइलें और browser permissions जाँचें।');
      if(finalVideoObjectUrl)URL.revokeObjectURL(finalVideoObjectUrl);
      finalVideoObjectUrl=URL.createObjectURL(blob);
      const preview=$('finalVideoPreview');if(preview)preview.src=finalVideoObjectUrl;
      let hostedVideoUrl='';
      try{const videoFile=new File([blob],`Q${currentQuestion.id}_GANIT_SETU_Final.webm`,{type:blob.type||'video/webm'});const uploaded=await uploadFile(videoFile,'youtube',currentQuestion.id);hostedVideoUrl=uploaded.url;}catch(uploadError){console.warn('[Ganit Setu] Final video was rendered locally but storage upload failed:',uploadError);}
      videoUrl=hostedVideoUrl||finalVideoObjectUrl;
      if($('finalVideoPreviewWrap'))$('finalVideoPreviewWrap').hidden=false;
      const link=$('videoLink');if(link){link.href=finalVideoObjectUrl;link.download=`GANIT_SETU_Q${currentQuestion.id}_Final.webm`;link.textContent='⬇️ Final Video डाउनलोड करें';link.hidden=false;}
      status.textContent=`✅ Final Video तैयार (${(blob.size/1024/1024).toFixed(1)} MB) — WebM format${hostedVideoUrl?' · Supabase में सेव':' · केवल इस ब्राउज़र में सेव'}`;
      msg(hostedVideoUrl?'पाँचों वीडियो सही क्रम में combine होकर Supabase Storage में सेव हो गए। Final file WebM है; MP4 नहीं।':'वीडियो बन गया, लेकिन Supabase upload सफल नहीं हुआ। डाउनलोड करके रखें; auto-publishing के लिए public HTTPS URL चाहिए।','success');
    }catch(e){if(raf)cancelAnimationFrame(raf);try{if(recorder&&recorder.state!=='inactive')recorder.stop()}catch{};if(audioCtx)await audioCtx.close().catch(()=>{});console.error('[Ganit Setu] Video combine failed',e);status.textContent='Final Video नहीं बना: '+(e.message||e);msg('Video combine नहीं हुआ: '+(e.message||e),'error')}
    finally{btn.disabled=false;btn.textContent='🎬 पाँचों Scenes Combine करके Video बनाएं'}
  }
  function updatePublishAvailability(){const ready=!!currentQuestion;document.querySelectorAll('[data-publish-platform]').forEach(b=>b.disabled=!ready);}
  async function savePackage(){
    if(!currentQuestion)return msg('पहले Question generate करें।','error');
    try{
      const base=readPackageFields(); generatedDraft=base.post||generatedDraft;
      let mediaUrl=(currentType==='reel'||currentType==='short')?(videoUrl||''):generatedImageUrl;
      if(currentType==='image'&&generatedImageData&&!mediaUrl){const up=await uploadFile(dataUrlToFile(generatedImageData,`Q${currentQuestion.id}_GANIT_SETU.jpg`),'images',currentQuestion.id);mediaUrl=generatedImageUrl=up.url}
      const variants=base.platform_packages||{};
      const platforms=allowedPlatforms();
      const all=read('gsContentPackages',[]);
      const created=[];
      for(const platform of platforms){
        const v=variants[platform]&&typeof variants[platform]==='object'?variants[platform]:base;
        const content={...base,...v,platform_packages:undefined};
        content.hashtags=Array.isArray(content.hashtags)?content.hashtags.join(' '):(content.hashtags||base.hashtags||'');
        content.keywords=Array.isArray(content.keywords)?content.keywords.join(', '):(content.keywords||base.keywords||'');
        const pkg={id:crypto.randomUUID(),question_id:(currentType==='post'?Number(currentQuestion.id):currentQuestion.id),class_level:Number(currentQuestion.class_level),chapter_number:Number(currentQuestion.chapter_number),chapter_name:currentQuestion.chapter_name||'',platform,content_type:currentType,content,draft:content.post||content.caption||'',media_url:mediaUrl||'',video_url:videoUrl||'',created_at:new Date().toISOString(),status:'saved'};
        all.unshift(pkg);created.push(platform);
      }
      write('gsContentPackages',all.slice(0,100));
      msg('Save All पूरा: '+created.map(p=>PLATFORM_LABELS[p]).join(', ')+'. यह local browser में सेव हुआ है; live publish अलग से सत्यापित होगा।','success')
    }catch(e){msg(e.message,'error')}
  }
  async function publishPackage(pkg){
    const isFacebookTextPost=pkg.platform==='facebook'&&pkg.content_type==='post';
    // Text-post question IDs may be text IDs such as Q750; never coerce those IDs to Number.
    const sameId=(a,b)=>String(a??'').trim()===String(b??'').trim();
    const q=currentQuestion&&sameId(currentQuestion.id,pkg.question_id)?currentQuestion:null;
    let question=q;
    if(!question){
      const questionId=(isFacebookTextPost?String(pkg.question_id??'').trim():pkg.question_id);
      if(questionId!==''&&questionId!=null){
        const lookup=await sb.from('questions').select('id,class_level,chapter_number,chapter_name,question_text,option_a,option_b,option_c,option_d,correct_option,hint,explanation').eq('id',questionId).maybeSingle();
        if(lookup.error)throw new Error('Question lookup failed ('+lookup.error.code+'): '+lookup.error.message);
        question=lookup.data;
      }
    }
    if(!question)throw new Error('Question data नहीं मिला। Question ID: '+String(pkg.question_id??'खाली')+'. कृपया Text Post में प्रश्न फिर से चुनकर Publish करें।');
    const content=pkg.content||{post:pkg.draft||''};
    const meta=qMeta(question,content); const token=await session();
    if(pkg.platform==='facebook'){
      const payload={action:'publish',question_id:pkg.question_id,plan_id:null,class_level:Number(question.class_level),platform:'facebook',content_type:pkg.content_type,media_url:pkg.media_url||null,title:meta.title,caption:captionWithHashtags(meta.caption||meta.post,meta.hashtags),description:meta.description,hashtags:'',answer_comment:meta.answerComment,publish_mode:'now'};
      let r;
      try{r=await fetch(FACEBOOK_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'apikey':ANON},body:JSON.stringify(payload)});}
      catch(netErr){throw new Error('Facebook Edge Function तक request नहीं पहुँची: '+(netErr.message||netErr));}
      const raw=await r.text();let d={};try{d=JSON.parse(raw)}catch{d={raw_response:raw};}
      const apiSuccess=d.success===true||d.ok===true||d.status==='published';
      if(!r.ok||!apiSuccess){const detail=typeof d.error==='string'?d.error:(d.error?.message||d.meta_error_message||d.message||d.raw_response||'Facebook publish failed');throw new Error(`Facebook API (${r.status}) ने सफलता की पुष्टि नहीं की: ${detail}`);}
      return d;
    }
    if(pkg.platform==='instagram'){
      if(pkg.content_type==='post')throw new Error('Instagram पर text-only post publish नहीं होता। Image/Video content बनाएं।');
      if(!pkg.media_url)throw new Error('Instagram के लिए Image/Video media जरूरी है।');
      const r=await fetch(INSTAGRAM_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'x-user-access-token':token,'apikey':ANON},body:JSON.stringify({access_token:token,media_url:pkg.media_url,caption:meta.caption||meta.post,question_id:pkg.question_id,plan_id:null,class_level:Number(question.class_level),content_type:pkg.content_type})});
      const d=await r.json().catch(()=>({}));if(!r.ok||!d.success)throw new Error(d.error||'Instagram publish failed');return d;
    }
    if(pkg.platform==='youtube'){
      if(pkg.content_type==='post')throw new Error('Text-only YouTube Community publishing इस function से supported/verified नहीं है।');
      if(!pkg.video_url&&!pkg.media_url)throw new Error('YouTube के लिए final video जरूरी है।');
      const sourceUrl=pkg.video_url||pkg.media_url;const res=await fetch(sourceUrl);if(!res.ok)throw new Error('Final video load नहीं हुआ।');const blob=await res.blob();const file=new File([blob],`Q${question.id}.mp4`,{type:blob.type||'video/mp4'});const up=await uploadFile(file,'youtube',question.id);
      const tags=String(meta.keywords||'GanitSetu,MPBoard,Maths,Class'+question.class_level).split(/[,\s]+/).map(x=>x.trim()).filter(Boolean).slice(0,30);
      const r=await fetch(YOUTUBE_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'apikey':ANON},body:JSON.stringify({storage_bucket:'content-media',storage_path:up.path,title:meta.title,description:meta.description,tags,privacy_status:'private',question_id:pkg.question_id,plan_id:null,class_level:Number(question.class_level),publish_mode:'now'})});
      const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||'YouTube publish failed');return {...d,cleanup_storage_path:up.path};
    }
    if(pkg.platform==='whatsapp'){
      const text=[meta.title,meta.hook,meta.caption||meta.post,meta.cta,meta.hashtags].filter(Boolean).join('\n\n');
      try{await navigator.clipboard?.writeText(text)}catch(e){}
      return {manual:true, message:'WhatsApp Channel पर मैन्युअल शेयर आवश्यक है; कोई ऑटो-ओपन या API publish नहीं किया गया।'};
    }
  }
  async function publishCurrent(){
    if(!currentQuestion)return msg('पहले Question generate करें।','error');
    const base=readPackageFields();
    const variants=base.platform_packages||{};
    let mediaUrl=generatedImageUrl;
    try{
      if(generatedImageData&&!mediaUrl){const up=await uploadFile(dataUrlToFile(generatedImageData,`Q${currentQuestion.id}_GANIT_SETU.jpg`),'images',currentQuestion.id);mediaUrl=generatedImageUrl=up.url}
    }catch(e){return msg('Image upload नहीं हुई: '+e.message,'error')}
    const platforms=allowedPlatforms();
    const results=[];
    for(const platform of platforms){
      const v=variants[platform]&&typeof variants[platform]==='object'?variants[platform]:base;
      const content={...base,...v,platform_packages:undefined};
      content.hashtags=Array.isArray(content.hashtags)?content.hashtags.join(' '):(content.hashtags||'');
      content.keywords=Array.isArray(content.keywords)?content.keywords.join(', '):(content.keywords||'');
      const pkg={question_id:(currentType==='post'?Number(currentQuestion.id):currentQuestion.id),platform,content_type:currentType,content,draft:content.post||content.caption||'',media_url:mediaUrl||'',video_url:videoUrl||''};
      if(platform==='youtube'&&(currentType==='post'||!pkg.video_url)){results.push('YouTube: इस content type के लिए API publish उपलब्ध/तैयार नहीं; Preview only');continue}
      if(platform==='instagram'&&!pkg.media_url&&!pkg.video_url){results.push('Instagram: Image/Video नहीं है, इसलिए publish नहीं किया');continue}
      if(platform==='whatsapp'){try{await navigator.clipboard?.writeText([content.title,content.hook,content.caption||content.post,content.cta,content.hashtags].filter(Boolean).join('\n\n'))}catch(e){}results.push('WhatsApp: कॉपी/मैन्युअल शेयर आवश्यक; publish नहीं माना गया');continue}
      try{const result=await publishPackage(pkg);await cleanupAfterPublishSuccess(pkg,result,platform);results.push(platform+': सफल'+(result?.external_url?' — '+result.external_url:''))}
      catch(e){results.push(platform+': असफल — '+(e.message||e))}
    }
    msg(results.join(' | '),results.some(x=>x.includes('असफल')||x.includes('नहीं बना')||x.includes('नहीं है'))?'error':'success');
  }
  function setConnectionStatus(platform, text, connected=false){
    const el=document.querySelector(`[data-status="${platform}"]`);
    if(el){el.textContent='स्थिति: '+text;el.classList.toggle('connected',connected);el.classList.toggle('disconnected',!connected)}
    const btn=document.querySelector(`[data-connect="${platform}"]`);
    if(btn && platform!=='whatsapp')btn.textContent=connected?'🔄 Refresh Status':'🔗 Connect / Refresh';
  }
  async function refreshConnectionStatuses(){
    for(const p of ['facebook','instagram','youtube'])setConnectionStatus(p,'जाँच जारी…',false);
    try{
      const {data:sessionData,error:sessionError}=await sb.auth.getSession();
      if(sessionError)throw sessionError;
      const userId=sessionData?.session?.user?.id;
      if(!userId){for(const p of ['facebook','instagram','youtube'])setConnectionStatus(p,'Admin login आवश्यक',false);return;}
      const {data:social,error:socialError}=await sb.from('social_accounts').select('platform,account_id,account_name,status,metadata,updated_at').in('platform',['facebook','instagram']).eq('status','connected').order('updated_at',{ascending:false});
      if(socialError)throw socialError;
      for(const p of ['facebook','instagram']){
        const row=(social||[]).find(x=>x.platform===p);
        const meta=row?.metadata||{};
        const name=p==='facebook'?(meta.page_name||row?.account_name||'Facebook Page'):(meta.username||row?.account_name||'Instagram');
        setConnectionStatus(p,row?`✅ Connected • ${name}`:'Connected record नहीं मिला',!!row);
      }
      const {data:yt,error:ytError}=await sb.from('youtube_accounts').select('channel_id,channel_name,status,updated_at').eq('user_id',userId).eq('status','connected').order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if(ytError)throw ytError;
      setConnectionStatus('youtube',yt?`✅ Connected • ${yt.channel_name||'YouTube Channel'}`:'Connected record नहीं मिला',!!yt);
    }catch(e){console.warn('[Ganit Setu Content Creation] connection status',e);for(const p of ['facebook','instagram','youtube'])setConnectionStatus(p,'स्थिति पढ़ने में समस्या',false);}
    setConnectionStatus('whatsapp','मौजूदा Ganit Setu Channel • Manual Share',true);
  }
  async function connectPlatform(p){
    if(p==='whatsapp'){msg('WhatsApp Channel तैयार है। चैनल केवल नीचे WhatsApp के Copy + Open बटन दबाने पर खुलेगा।','info');return;}
    await refreshConnectionStatuses();
    const el=document.querySelector(`[data-status="${p}"]`);
    if(el?.textContent.includes('✅ Connected')){msg(PLATFORM_LABELS[p]+' पहले से connected है।','success');return;}
    try{
      if(p==='facebook'&&window.GanitSetuFacebookConnector)return await window.GanitSetuFacebookConnector.startOAuth();
      if(p==='instagram'&&window.GanitSetuInstagramConnector)return await window.GanitSetuInstagramConnector.connectInstagram();
      if(p==='youtube'&&window.GanitSetuYouTubeConnector)return await window.GanitSetuYouTubeConnector.connect();
      msg('इस platform का connector अभी load नहीं हुआ।','error');
    }catch(e){msg(e.message||'Connection शुरू नहीं हो पाया।','error')}
  }
  function renderQuestion(q){
    currentQuestion=q||null;
    if(typeof questionsByType!=='undefined'){questionsByType[currentType]=currentQuestion;write('gsContentQuestionsByType',questionsByType)}
    const box=$('currentQuestion');
    if(!box)return;
    if(!q){box.innerHTML=`<div class="empty">${currentType==='image'?'Image Post के लिए अभी अलग Question नहीं चुना गया है। ऊपर Class/Chapter चुनकर Generate New Question दबाएँ।':currentType==='post'?'Text Post के लिए अभी Question नहीं चुना गया है। ऊपर से Question Generate करें।':'इस Content Type के लिए अभी अलग Question नहीं चुना गया है। ऊपर से Question Generate करें।'}</div>`;if($('workspaceQuestion'))$('workspaceQuestion').textContent='—';updatePublishAvailability();return}
    box.innerHTML=`<div class="question-card"><b>Q${esc(q.id)} · Class ${esc(q.class_level)} · Chapter ${esc(q.chapter_number)} — ${esc(q.chapter_name||'')}</b><p>${esc(q.question_text||'')}</p><div>A) ${esc(q.option_a||'')}<br>B) ${esc(q.option_b||'')}<br>C) ${esc(q.option_c||'')}<br>D) ${esc(q.option_d||'')}</div><small>सही उत्तर और व्याख्या प्रकाशित करने से पहले जाँचें।</small></div>`;
    write('gsCurrentContentQuestion',q);
    if($('workspaceQuestion'))$('workspaceQuestion').textContent=`Q${q.id} · Class ${q.class_level} · Chapter ${q.chapter_number}`;
    updatePublishAvailability();
  }
  async function loadChapters(){
    const select=$('ccChapter'); if(!select)return;
    const cls=Number($('ccClass')?.value||9);
    try{
      const {data,error}=await sb.from('questions').select('chapter_number,chapter_name').eq('class_level',cls).order('chapter_number',{ascending:true}).limit(1000);
      if(error)throw error;
      const map=new Map();(data||[]).forEach(r=>{if(r.chapter_number!=null&&!map.has(String(r.chapter_number)))map.set(String(r.chapter_number),r.chapter_name||'')});
      const old=select.value;select.innerHTML='<option value="all">All Chapters</option>'+[...map.entries()].map(([n,name])=>`<option value="${esc(n)}">Chapter ${esc(n)}${name?' — '+esc(name):''}</option>`).join('');
      if([...select.options].some(o=>o.value===old))select.value=old;
    }catch(e){msg('Chapter list लोड नहीं हुई: '+(e.message||e),'error')}
  }
  async function generateQuestion(){
    typeSelectors[currentType]={cls:$('ccClass')?.value||'9',chapter:$('ccChapter')?.value||'all'};
    const btn=$('generateQuestion'); if(btn){btn.disabled=true;btn.textContent='⏳ प्रश्न खोज रहे हैं...'}
    try{
      const cls=Number($('ccClass')?.value||9),chapter=$('ccChapter')?.value||'all';
      let query=sb.from('questions').select('id,class_level,chapter_number,chapter_name,question_text,option_a,option_b,option_c,option_d,correct_option,hint,explanation').eq('class_level',cls);
      if(chapter!=='all')query=query.eq('chapter_number',Number(chapter));
      const {data,error}=await query.limit(500);
      if(error)throw error;
      const rows=(data||[]).filter(q=>q.question_text&&q.option_a!=null&&q.option_b!=null&&q.option_c!=null&&q.option_d!=null);
      if(!rows.length)throw new Error(`Class ${cls}${chapter!=='all'?' Chapter '+chapter:''} के लिए उपलब्ध विकल्पों सहित प्रश्न नहीं मिला।`);
      const prior=read('gsRecentQuestionIds',[]);let candidates=rows.filter(q=>!prior.includes(String(q.id)));if(!candidates.length)candidates=rows;
      const q=candidates[Math.floor(Math.random()*candidates.length)];
      if(currentType==='image'){
        generatedImageData='';generatedImageUrl='';generatedPackage=null;generatedDraft='';
        if($('imagePreview'))$('imagePreview').src='';
        if($('imagePreviewWrap'))$('imagePreviewWrap').hidden=true;
        if($('saveDraft'))$('saveDraft').disabled=true;
      }
      write('gsRecentQuestionIds',[String(q.id),...prior.filter(id=>String(id)!==String(q.id))].slice(0,Math.min(100,Math.max(1,rows.length-1))));
      renderQuestion(q);msg(`नया प्रश्न लोड हो गया: Q${q.id}`,'success');
    }catch(e){msg('Question load नहीं हुआ: '+(e.message||e),'error')}
    finally{if(btn){btn.disabled=false;btn.textContent='✨ Generate New Question'}const next=$('newQuestion');if(next)next.disabled=false}
  }
  function updateState(){
    if($('postStudio'))$('postStudio').hidden=currentType!=='post';
    if($('imageStudio'))$('imageStudio').hidden=currentType!=='image';
    if($('videoStudio'))$('videoStudio').hidden=!(currentType==='reel'||currentType==='short');
    if($('youtubeMeta'))$('youtubeMeta').hidden=!(currentType==='reel'||currentType==='short');
    document.querySelectorAll('[data-type]').forEach(el=>el.classList.toggle('active',el.dataset.type===currentType));
    document.querySelectorAll('.legacy-type-state [data-type]').forEach(el=>el.classList.toggle('active',el.dataset.type===currentType));
    document.querySelectorAll('.content-type-picker [data-type]').forEach(el=>el.classList.toggle('active',el.dataset.type===currentType));
    renderPlatformChoices();
    if($('currentType'))$('currentType').textContent=currentType;
    if($('questionPanelTitle'))$('questionPanelTitle').textContent='Question Select / Generate — '+({post:'Text Post',image:'Image Post',reel:'Reel / Video',short:'Short / Story'}[currentType]||currentType);
    if($('questionPanelHint'))$('questionPanelHint').textContent=({post:'यह Question केवल Text Post के लिए है। Image/Reel में अलग Question चुनें।',image:'यहाँ Generate किया गया Question केवल Image Post में रहेगा; Text Post/Reel से अलग।',reel:'यह Question केवल Reel / Video के लिए है; Text Post/Image से अलग।',short:'यह Question केवल Short / Story के लिए है; अन्य Content Type से अलग।'}[currentType]||'हर Content Type का Question अलग है।');
    updatePublishAvailability();
  }
  function bind(){
    initMasterPromptUI();
    $('postType')?.addEventListener('change',()=>{const mt=$('masterPromptType');if(mt){mt.value=$('postType').value;mt.dispatchEvent(new Event('change'))}});
    $('generateQuestion').onclick=generateQuestion;$('newQuestion').onclick=generateQuestion;$('ccClass').onchange=()=>{typeSelectors[currentType]={cls:$('ccClass').value,chapter:'all'};loadChapters()};$('ccChapter').onchange=()=>{typeSelectors[currentType]={cls:$('ccClass').value,chapter:$('ccChapter').value}};
    document.querySelectorAll('[data-platform]').forEach(b=>b.onclick=e=>{if(e.target.closest('.platform-connect'))return;msg('Platform चुनने की जरूरत नहीं है—कंटेंट चारों प्लेटफॉर्म के लिए एक साथ तैयार होगा।','info')});
    document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>switchContentType(b.dataset.type));
    document.querySelectorAll('.platform-connect').forEach(b=>b.onclick=e=>{e.stopPropagation();connectPlatform(b.dataset.connect)});
    $('generateFiveSceneImages')?.addEventListener('click',makeFiveSceneImages);$('createVideo')?.addEventListener('click',createFinalVideo);$('generatePost').onclick=generatePost;if($('generateImageContent'))$('generateImageContent').onclick=generateImageContentPackage;$('generateImage').onclick=generateImage;$('convertImageToVideo')?.addEventListener('click',convertGeneratedImageToVideo);document.querySelectorAll('[data-image-video-publish]').forEach(b=>b.addEventListener('click',()=>publishConvertedImageVideo(b.dataset.imageVideoPublish)));$('savePackage').onclick=savePackage;
    $('markAsPublishedTemporary')?.addEventListener('click',()=>{msg('Mark as Published बटन अभी अस्थायी है। अभी यह केवल UI/टेस्ट के लिए है—Supabase से कोई इमेज या वीडियो डिलीट नहीं होगा। अगली स्टेज में इसे वास्तविक cleanup से जोड़ा जाएगा।','info')});
    $('previewPackage').onclick=()=>{const p=readPackageFields();$('previewQuestion').textContent=currentQuestion?`Q${currentQuestion.id}`:'—';$('previewText').textContent=JSON.stringify(p,null,2);$('previewImage').src=generatedImageData||generatedImageUrl||'';$('previewModal').hidden=false};$('closePreview').onclick=()=>$('previewModal').hidden=true;
    window.addEventListener('message',e=>{if(e.data?.type==='GS_VIDEO_READY'&&currentQuestion&&String(e.data.question_id)===String(currentQuestion.id)){videoUrl=e.data.video_url||'';$('videoStatus').textContent='✅ Final Video Ready';$('videoLink').href=videoUrl;$('videoLink').hidden=!videoUrl;msg('Final video तैयार है। अब Save करके platform publish कर सकते हैं।','success')}})
  }
  document.addEventListener('DOMContentLoaded',async()=>{bind();await refreshConnectionStatuses();await loadChapters();const legacy=read('gsCurrentContentQuestion',null);if(!questionsByType.post&&legacy)questionsByType.post=legacy;restoreTypeState('post');updateState();const master=$('masterTemplatePreview');if(master){master.onload=()=>{const st=$('imageStatus');if(st&&!generatedImageData)st.textContent=`Master template loaded (${master.naturalWidth}×${master.naturalHeight}). Image Post का अलग Question चुनें।`;};master.onerror=()=>{const st=$('imageStatus');if(st)st.textContent='Master template नहीं मिली। assets/images/content-post-template.png को GitHub में सही path पर commit करें।';};if(master.complete&&master.naturalWidth){const st=$('imageStatus');if(st&&!generatedImageData)st.textContent=`Master template loaded (${master.naturalWidth}×${master.naturalHeight}). Image Post का अलग Question चुनें।`;}}});
})();
