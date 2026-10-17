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
  function qCaption(q){return ['📘 GANIT SETU',`कक्षा ${q.class_level} | अध्याय ${q.chapter_number} — ${q.chapter_name||''}`,'','🧮 आज का गणित प्रश्न:',q.question_text,'',`A) ${q.option_a}`,`B) ${q.option_b}`,`C) ${q.option_c}`,`D) ${q.option_d}`,'','🤔 आपका उत्तर क्या है? Comment करके बताइए!','','#GanitSetu #MPBoard #Mathematics #MathsQuestion #Class'+q.class_level].join('\n')}
  // Image Post captions are anchored to the exact question used to render the image.
  // Keep hashtags ASCII-only to avoid broken Devanagari hashtags on social platforms.
  function imageQuestionCaption(q, platform='facebook', variant={}, base={}){
    if(!q)return '';
    const platformCta={
      facebook:'संख्या पद्धति का यह प्रश्न हल करें और अपनी तैयारी जाँचें।',
      instagram:'प्रश्न हल करें और अपना उत्तर कमेंट में लिखें! 📐',
      youtube:'MP Board Class '+q.class_level+' Maths | Chapter '+q.chapter_number+' Practice Question',
      whatsapp:'आज का गणित प्रश्न — अपना उत्तर बताइए।'
    };
    const rawTags=[variant.hashtags,base.hashtags].flat().map(x=>Array.isArray(x)?x.join(' '):String(x||'')).join(' ');
    const safeTags=[...rawTags.matchAll(/#[A-Za-z0-9_]+/g)].map(m=>m[0]);
    const defaults=['#GanitSetu','#MPBoard','#Mathematics','#MathsQuestion','#Class'+q.class_level];
    const tags=[...new Set([...safeTags,...defaults])].slice(0,15).join(' ');
    return [
      '📘 GANIT SETU',
      `कक्षा ${q.class_level} | अध्याय ${q.chapter_number} — ${q.chapter_name||''}`,
      '', '🧮 आज का गणित प्रश्न:', q.question_text||'',
      '', `A) ${q.option_a}`, `B) ${q.option_b}`, `C) ${q.option_c}`, `D) ${q.option_d}`,
      '', platformCta[platform]||platformCta.facebook, '', tags
    ].filter((line,index,arr)=>line!==''|| (index>0&&arr[index-1]!=='' )).join('\n').trim();
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
      const canPublish=platform==='facebook' || platform==='whatsapp' || (platform==='instagram'&&currentType!=='post'&&!!(generatedImageUrl||generatedImageData||videoUrl)) || (platform==='youtube'&&(isYouTubeTextPost||!!videoUrl&&currentType!=='post'));
      const publishLabel=platform==='whatsapp'?'↗ Copy + Open WhatsApp Channel':isYouTubeTextPost?'↗ Open Community + Copy':canPublish?'🚀 Publish':'Publish unavailable';
      const pill=(isYouTubeTextPost||platform==='whatsapp')?'Copy + Open':canPublish?'Publish available':'Preview only';
      const imagePreview=currentType==='image'&&generatedImageData?`<img src="${generatedImageData}" alt="${PLATFORM_LABELS[platform]} image preview" style="display:block;width:100%;max-width:320px;max-height:520px;object-fit:contain;margin:10px auto;border-radius:10px">`:'';return `<article class="preview-platform-card" data-preview-platform="${platform}"><div class="preview-card-head"><h3>${PLATFORM_LABELS[platform]}</h3><span class="platform-pill">${pill}</span></div>${note?`<p class="preview-note">${esc(note)}</p>`:''}${imagePreview}<pre>${esc(caption)}</pre><div class="preview-card-actions"><button type="button" class="btn ghost copy-platform" data-copy-platform="${platform}">📋 Copy Preview</button><button type="button" class="btn purple platform-publish" data-publish-platform="${platform}" ${canPublish?'':'disabled'}>${publishLabel}</button></div></article>`;
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
        // Open the user's existing Ganit Setu WhatsApp Channel; publishing remains manual.
        window.open('https://whatsapp.com/channel/0029VbDLOBHICVfrePXZ363D','_blank','noopener');
        const pkg=await makeCurrentPlatformPackage(platform);
        const isQuestionPost=currentType==='post'&&(($('postType')?.value||'question')==='question')&&!!currentQuestion;
        const postText=(isQuestionPost?qCaption(currentQuestion):[pkg.content.title,pkg.content.hook,pkg.content.caption||pkg.content.post,pkg.content.cta,pkg.content.hashtags].filter(Boolean).join('\n\n')).trim();
        try{
          if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(postText);
          else {const ta=document.createElement('textarea');ta.value=postText;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);const ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('copy failed');}
          msg('पूरा पोस्ट कॉपी हो गया और Ganit Setu WhatsApp Channel खुल गया। वहाँ पोस्ट बॉक्स में Ctrl+V करें और मैन्युअल रूप से शेयर करें। अभी स्वतः प्रकाशित नहीं हुआ।','info');
        }catch(e){msg('WhatsApp Channel खुल गया, लेकिन ऑटो-कॉपी नहीं हो पाया। Preview से टेक्स्ट चुनकर Ctrl+C करें। पोस्ट मैन्युअल रूप से शेयर होगा।','error');}
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
  // No AI image generation is used here. Put the approved blank template at:
  // assets/images/content-post-template.png
  const IMAGE_TEMPLATE_URL=new URL('assets/images/content-post-template.png',document.baseURI).href;
  const IMAGE_TEMPLATE_CONFIG={width:941,height:1672};

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
      const sx=W/941, sy=H/1672;
      const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');
      ctx.drawImage(template,0,0,W,H);
      const X=n=>n*sx, Y=n=>n*sy, S=n=>n*Math.min(sx,sy);
      // All question content stays inside the blank whiteboard; the template art remains untouched.
      // Class/chapter pill: blue + yellow, kept within the top of the blank board.
      ctx.save();ctx.shadowColor='rgba(13,48,91,.16)';ctx.shadowBlur=S(8);ctx.shadowOffsetY=Y(3);
      roundedRect(ctx,X(100),Y(155),X(740),Y(62),S(18));
      ctx.fillStyle='#123b85';ctx.fill();ctx.restore();
      ctx.fillStyle='#ffdf32';ctx.textAlign='center';ctx.textBaseline='middle';
      const chapterLine=`कक्षा ${currentQuestion.class_level}  •  अध्याय ${currentQuestion.chapter_number} — ${currentQuestion.chapter_name||''}`;
      const chapterFit=fitLines(ctx,chapterLine,X(690),1,S(31),S(22));
      ctx.font=`800 ${chapterFit.size}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;
      ctx.fillText(chapterLine,X(470),Y(186),X(700));

      // Large readable question card.
      const qx=92,qy=242,qw=756,qh=245;
      ctx.save();ctx.shadowColor='rgba(15,44,80,.15)';ctx.shadowBlur=S(12);ctx.shadowOffsetY=Y(4);
      roundedRect(ctx,X(qx),Y(qy),X(qw),Y(qh),S(25));ctx.fillStyle='#fffdf7';ctx.fill();ctx.restore();
      ctx.lineWidth=S(5);ctx.strokeStyle='#f5a623';roundedRect(ctx,X(qx),Y(qy),X(qw),Y(qh),S(25));ctx.stroke();
      // Bold, high-contrast title label for the question section.
      ctx.save();ctx.shadowColor='rgba(245,166,35,.22)';ctx.shadowBlur=S(7);ctx.shadowOffsetY=Y(2);
      roundedRect(ctx,X(qx+14),Y(qy-25),X(360),Y(60),S(22));ctx.fillStyle='#ffdf32';ctx.fill();ctx.restore();
      ctx.lineWidth=S(3);ctx.strokeStyle='#f5a623';roundedRect(ctx,X(qx+14),Y(qy-25),X(360),Y(60),S(22));ctx.stroke();
      ctx.beginPath();ctx.arc(X(qx+47),Y(qy+5),S(20),0,Math.PI*2);ctx.fillStyle='#123b85';ctx.fill();
      ctx.fillStyle='#ffdf32';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${S(27)}px Arial,sans-serif`;ctx.fillText('?',X(qx+47),Y(qy+5));
      ctx.fillStyle='#102b65';ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.font=`900 ${S(29)}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;
      ctx.fillText('आज का गणित प्रश्न',X(qx+78),Y(qy+5),X(285));
      const question=fitLines(ctx,currentQuestion.question_text,X(qw-60),3,S(43),S(30));
      ctx.font=`800 ${question.size}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;
      ctx.fillStyle='#101d52';ctx.textAlign='center';ctx.textBaseline='middle';
      const lineGap=S(8), qTotal=question.lines.length*(question.size+lineGap)-lineGap;
      const qStart=qy+78+(qh-90-qTotal/Math.min(sx,sy))/2;
      question.lines.forEach((line,i)=>ctx.fillText(line,X(qx+qw/2),Y(qStart)+i*(question.size+lineGap),X(qw-52)));

      // Colorful two-column answer cards; positioned well above the teacher's head.
      const options=[
        {label:'A',text:currentQuestion.option_a,x:92,y:525,color:'#0878ed',bg:'#e8f4ff'},
        {label:'B',text:currentQuestion.option_b,x:490,y:525,color:'#ed1680',bg:'#fff0f7'},
        {label:'C',text:currentQuestion.option_c,x:92,y:635,color:'#0b9b78',bg:'#e8fbf3'},
        {label:'D',text:currentQuestion.option_d,x:490,y:635,color:'#f26b13',bg:'#fff4e7'}
      ];
      for(const o of options){
        const ox=o.x,oy=o.y,ow=359,oh=91;
        ctx.save();ctx.shadowColor='rgba(13,48,91,.12)';ctx.shadowBlur=S(7);ctx.shadowOffsetY=Y(3);
        roundedRect(ctx,X(ox),Y(oy),X(ow),Y(oh),S(22));ctx.fillStyle=o.bg;ctx.fill();ctx.restore();
        ctx.lineWidth=S(3);ctx.strokeStyle=o.color;roundedRect(ctx,X(ox),Y(oy),X(ow),Y(oh),S(22));ctx.stroke();
        ctx.beginPath();ctx.arc(X(ox+47),Y(oy+oh/2),S(31),0,Math.PI*2);ctx.fillStyle=o.color;ctx.fill();
        ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`800 ${S(40)}px Arial,sans-serif`;ctx.fillText(o.label,X(ox+47),Y(oy+oh/2+1));
        const val=fitLines(ctx,String(o.text||''),X(ow-100),2,S(44),S(30));
        ctx.textAlign='left';ctx.textBaseline='middle';ctx.font=`800 ${val.size}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;ctx.fillStyle='#101d52';
        const vGap=S(3);
        // Keep every option value vertically centered in its own card, including wrapped labels.
        val.lines.forEach((line,i)=>{
          const lineOffset=(i-(val.lines.length-1)/2)*(val.size+vGap);
          ctx.fillText(line,X(ox+92),Y(oy+oh/2)+lineOffset,X(ow-105));
        });
      }

      // Larger, lower engagement callout; keep it in the right-side clear area above the teacher's finger.
      const cx=390,cy=815,cw=465,ch=132;
      ctx.save();ctx.shadowColor='rgba(13,48,91,.22)';ctx.shadowBlur=S(11);ctx.shadowOffsetY=Y(4);
      roundedRect(ctx,X(cx),Y(cy),X(cw),Y(ch),S(24));ctx.fillStyle='#123b85';ctx.fill();ctx.restore();
      ctx.lineWidth=S(4);ctx.strokeStyle='#ffcf28';roundedRect(ctx,X(cx),Y(cy),X(cw),Y(ch),S(24));ctx.stroke();
      ctx.beginPath();ctx.arc(X(cx+49),Y(cy+ch/2),S(34),0,Math.PI*2);ctx.fillStyle='#ffdf32';ctx.fill();
      ctx.fillStyle='#123b85';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${S(26)}px Arial,sans-serif`;ctx.fillText('•••',X(cx+49),Y(cy+ch/2));
      ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font=`900 ${S(33)}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;
      ctx.fillText('अपना उत्तर',X(cx+282),Y(cy+48),X(cw-130));
      ctx.fillStyle='#ffdf32';ctx.font=`900 ${S(33)}px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif`;
      ctx.fillText('कमेंट में लिखें',X(cx+282),Y(cy+91),X(cw-130));
      generatedImageData=c.toDataURL('image/png');
      $('imagePreview').src=generatedImageData;$('imagePreviewWrap').hidden=false;$('imageStatus').textContent='FIXED TEMPLATE • DESIGNED QUESTION INSERTED';
      updatePublishAvailability();renderPlatformPreviews();msg('Question को खाली बोर्ड में डिज़ाइन के साथ फिट कर दिया गया।','success');
    }catch(e){console.error('[Ganit Setu] Image layout error',e);msg(`Question Image नहीं बन पाई: ${e.message||'कृपया template और question data जाँचें।'}`,'error');}
    finally{btn.disabled=false;btn.textContent='🖼️ Template में Question डालें'}
  }

  function dataUrlToFile(dataUrl,name='ganit-setu-question.jpg'){const [meta,b64]=dataUrl.split(',');const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new File([arr],name,{type:(meta.match(/data:(.*?);/)||[])[1]||'image/jpeg'})}
  async function uploadFile(file,folder,qid){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`content-packages/${folder}/${Date.now()}-Q${qid}-${safe}`;const {error}=await sb.storage.from('content-media').upload(path,file,{upsert:false,contentType:file.type||undefined,cacheControl:'3600'});if(error)throw new Error(`Asset upload failed: ${error.message}`);return {path,url:sb.storage.from('content-media').getPublicUrl(path).data.publicUrl}}
  function videoModal(){if(!currentQuestion)return msg('पहले Question generate करें।','error');$('videoFrame').src=`video-scene-manager.html?question_id=${encodeURIComponent(currentQuestion.id)}`;$('videoModal').hidden=false}
  function updatePublishAvailability(){const ready=!!currentQuestion;document.querySelectorAll('[data-publish-platform]').forEach(b=>b.disabled=!ready);}
  async function savePackage(){
    if(!currentQuestion)return msg('पहले Question generate करें।','error');
    try{
      const base=readPackageFields(); generatedDraft=base.post||generatedDraft;
      let mediaUrl=generatedImageUrl;
      if(generatedImageData&&!mediaUrl){const up=await uploadFile(dataUrlToFile(generatedImageData,`Q${currentQuestion.id}_GANIT_SETU.jpg`),'images',currentQuestion.id);mediaUrl=generatedImageUrl=up.url}
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
      const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||'YouTube publish failed');return d;
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
      try{const result=await publishPackage(pkg);results.push(platform+': सफल'+(result?.external_url?' — '+result.external_url:''))}
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
    $('generatePost').onclick=generatePost;if($('generateImageContent'))$('generateImageContent').onclick=generateImageContentPackage;$('generateImage').onclick=generateImage;$('createVideo').onclick=videoModal;$('savePackage').onclick=savePackage;
    $('previewPackage').onclick=()=>{const p=readPackageFields();$('previewQuestion').textContent=currentQuestion?`Q${currentQuestion.id}`:'—';$('previewText').textContent=JSON.stringify(p,null,2);$('previewImage').src=generatedImageData||generatedImageUrl||'';$('previewModal').hidden=false};$('closePreview').onclick=()=>$('previewModal').hidden=true;$('closeVideo').onclick=()=>{$('videoModal').hidden=true;$('videoFrame').src=''};
    window.addEventListener('message',e=>{if(e.data?.type==='GS_VIDEO_READY'&&currentQuestion&&String(e.data.question_id)===String(currentQuestion.id)){videoUrl=e.data.video_url||'';$('videoStatus').textContent='✅ Final Video Ready';$('videoLink').href=videoUrl;$('videoLink').hidden=!videoUrl;msg('Final video तैयार है। अब Save करके platform publish कर सकते हैं।','success')}})
  }
  document.addEventListener('DOMContentLoaded',async()=>{bind();await refreshConnectionStatuses();await loadChapters();const legacy=read('gsCurrentContentQuestion',null);if(!questionsByType.post&&legacy)questionsByType.post=legacy;restoreTypeState('post');updateState();const master=$('masterTemplatePreview');if(master){master.onload=()=>{const st=$('imageStatus');if(st&&!generatedImageData)st.textContent=`Master template loaded (${master.naturalWidth}×${master.naturalHeight}). Image Post का अलग Question चुनें।`;};master.onerror=()=>{const st=$('imageStatus');if(st)st.textContent='Master template नहीं मिली। assets/images/content-post-template.png को GitHub में सही path पर commit करें।';};if(master.complete&&master.naturalWidth){const st=$('imageStatus');if(st&&!generatedImageData)st.textContent=`Master template loaded (${master.naturalWidth}×${master.naturalHeight}). Image Post का अलग Question चुनें।`;}}});
})();
