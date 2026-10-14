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
  function msg(t,kind='info'){const e=$('ccNotice');if(e){e.textContent=t;e.className='notice '+kind;e.hidden=false;setTimeout(()=>e.hidden=true,5000)}}
  async function session(){const {data,error}=await sb.auth.getSession();if(error)throw error;if(!data?.session?.access_token)throw new Error('Admin session उपलब्ध नहीं है। कृपया Admin Panel में login करें।');return data.session.access_token}
  function qCaption(q){return ['📘 GANIT SETU',`कक्षा ${q.class_level} | अध्याय ${q.chapter_number} — ${q.chapter_name||''}`,'','🧮 आज का गणित प्रश्न:',q.question_text,'',`A) ${q.option_a}`,`B) ${q.option_b}`,`C) ${q.option_c}`,`D) ${q.option_d}`,'','🤔 आपका उत्तर क्या है? Comment करके बताइए!','','#GanitSetu #MPBoard #Mathematics #MathsQuestion #Class'+q.class_level].join('\n')}
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
      return {title:o.title||'',hook:o.hook||'',post:o.post||o.main_post||o.content||'',caption:o.caption||'',description:o.description||'',cta:o.cta||'',hashtags:Array.isArray(o.hashtags)?o.hashtags.join(' '):(o.hashtags||''),keywords:Array.isArray(o.keywords)?o.keywords.join(', '):(o.keywords||o.tags||''),answer_comment:o.answer_comment||o.answerComment||'',hint:o.hint||currentQuestion?.hint||'',explanation:o.explanation||currentQuestion?.explanation||''};
    }catch(e){return null;}
  }
  const DEFAULT_MASTER_PROMPTS={
    question:'Create a clear, engaging Hindi social post around the exact selected mathematics question. Preserve the question, options and correct answer exactly. Invite students to answer.',
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
      'JSON keys exactly: title, hook, post, caption, description, cta, hashtags, keywords, answer_comment, hint, explanation.',
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
      `Platform: ${currentPlatform}`,
      `Content type: ${currentType}`,
      instruction?`Additional instruction: ${instruction}`:''
    ].filter(Boolean).join('\n');
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
      renderPackageFields(pkg);
      $('postStatus').textContent='GEMINI • COMPLETE PACKAGE READY';
      $('saveDraft').disabled=false;
      msg('पूरा Content Package तैयार है। उत्तर वाले कमेंट को जाँचकर Save करें।','success');
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
  const IMAGE_TEMPLATE_URL='assets/images/content-post-template.png';
  const IMAGE_TEMPLATE_CONFIG={
    width:1080,height:1350,
    // These coordinates are the only values to adjust when the final blank template is locked.
    headerX:80, headerY:210, headerWidth:920,
    questionX:90, questionY:400, questionWidth:900,
    optionX:110, optionStartY:760, optionGap:100,
    footerX:540, footerY:1265
  };

  function drawWrappedText(ctx,text,x,y,maxWidth,lineHeight){
    const words=String(text||'').split(/\s+/); let line='';
    for(const word of words){
      const test=line?line+' '+word:word;
      if(ctx.measureText(test).width>maxWidth && line){ctx.fillText(line,x,y);y+=lineHeight;line=word}else line=test;
    }
    if(line){ctx.fillText(line,x,y);y+=lineHeight;}
    return y;
  }

  async function generateImage(){
    if(!currentQuestion)return msg('पहले Question generate करें।','error');
    const btn=$('generateImage');btn.disabled=true;btn.textContent='⏳ Template में Question लगाया जा रहा है...';
    try{
      const template=await loadImg(IMAGE_TEMPLATE_URL);
      const W=template.naturalWidth||IMAGE_TEMPLATE_CONFIG.width;
      const H=template.naturalHeight||IMAGE_TEMPLATE_CONFIG.height;
      const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');
      ctx.drawImage(template,0,0,W,H);
      ctx.textBaseline='top';ctx.fillStyle='#172033';ctx.textAlign='left';

      const cfg=IMAGE_TEMPLATE_CONFIG;
      // The blank template owns all branding/background/decorative elements.
      // JavaScript adds only the database question data.
      ctx.font='700 30px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif';
      drawWrappedText(ctx,`कक्षा ${currentQuestion.class_level}  |  अध्याय ${currentQuestion.chapter_number} — ${currentQuestion.chapter_name||''}`,cfg.headerX,cfg.headerY,cfg.headerWidth,42);

      ctx.font='800 40px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif';
      let y=cfg.questionY;
      y=drawWrappedText(ctx,currentQuestion.question_text,cfg.questionX,y,cfg.questionWidth,58);
      y+=25;
      ctx.font='700 32px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif';
      const options=[`A) ${currentQuestion.option_a}`,`B) ${currentQuestion.option_b}`,`C) ${currentQuestion.option_c}`,`D) ${currentQuestion.option_d}`];
      let oy=cfg.optionStartY;
      for(const opt of options){oy=drawWrappedText(ctx,opt,cfg.optionX,oy,cfg.questionWidth,46);oy+=cfg.optionGap-46;}
      ctx.textAlign='center';ctx.font='700 28px "Noto Sans Devanagari","Nirmala UI",Arial,sans-serif';
      ctx.fillText('🤔 आपका उत्तर क्या है? Comment करके बताइए!',cfg.footerX,cfg.footerY);

      generatedImageData=c.toDataURL('image/png');
      $('imagePreview').src=generatedImageData;$('imagePreviewWrap').hidden=false;$('imageStatus').textContent='FIXED TEMPLATE • QUESTION INSERTED';
      updatePublishAvailability();msg('Fixed template में Question सफलतापूर्वक लगाया गया।','success');
    }catch(e){
      msg(`Blank template नहीं मिला। ${IMAGE_TEMPLATE_URL} पर आपका approved template रखें।`,'error');
    }finally{btn.disabled=false;btn.textContent='🖼️ Template में Question डालें'}
  }

  function dataUrlToFile(dataUrl,name='ganit-setu-question.jpg'){const [meta,b64]=dataUrl.split(',');const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new File([arr],name,{type:(meta.match(/data:(.*?);/)||[])[1]||'image/jpeg'})}
  async function uploadFile(file,folder,qid){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`content-packages/${folder}/${Date.now()}-Q${qid}-${safe}`;const {error}=await sb.storage.from('content-media').upload(path,file,{upsert:false,contentType:file.type||undefined,cacheControl:'3600'});if(error)throw new Error(`Asset upload failed: ${error.message}`);return {path,url:sb.storage.from('content-media').getPublicUrl(path).data.publicUrl}}
  function videoModal(){if(!currentQuestion)return msg('पहले Question generate करें।','error');$('videoFrame').src=`video-scene-manager.html?question_id=${encodeURIComponent(currentQuestion.id)}`;$('videoModal').hidden=false}
  function updatePublishAvailability(){const ready=!!currentQuestion;document.querySelectorAll('[data-publish-platform]').forEach(b=>b.disabled=!ready);}
  async function savePackage(){
    if(!currentQuestion)return msg('पहले Question generate करें।','error');
    try{
      const content=readPackageFields(); generatedDraft=content.post||generatedDraft;
      let mediaUrl=generatedImageUrl;
      if(generatedImageData&&!mediaUrl){const up=await uploadFile(dataUrlToFile(generatedImageData,`Q${currentQuestion.id}_GANIT_SETU.jpg`),'images',currentQuestion.id);mediaUrl=generatedImageUrl=up.url}
      const pkg={id:crypto.randomUUID(),question_id:Number(currentQuestion.id),class_level:Number(currentQuestion.class_level),chapter_number:Number(currentQuestion.chapter_number),chapter_name:currentQuestion.chapter_name||'',platform:currentPlatform,content_type:currentType,content,
        draft:content.post||'',media_url:mediaUrl||videoUrl||'',video_url:videoUrl||'',created_at:new Date().toISOString(),status:'saved'};
      const all=read('gsContentPackages',[]);all.unshift(pkg);write('gsContentPackages',all.slice(0,100));msg('पूरा Content Package Save हो गया।','success');renderReport()
    }catch(e){msg(e.message,'error')}
  }
  async function publishPackage(pkg){
    const q=currentQuestion&&Number(currentQuestion.id)===Number(pkg.question_id)?currentQuestion:null;
    const question=q||(await sb.from('questions').select('id,class_level,chapter_number,chapter_name,question_text,option_a,option_b,option_c,option_d,correct_option,hint,explanation').eq('id',Number(pkg.question_id)).maybeSingle()).data;
    if(!question)throw new Error('Question data नहीं मिला।');
    const content=pkg.content||{post:pkg.draft||''};
    const meta=qMeta(question,content); const token=await session();
    if(pkg.platform==='facebook'){
      const payload={action:'publish',question_id:Number(pkg.question_id),plan_id:null,class_level:Number(question.class_level),platform:'facebook',content_type:pkg.content_type,media_url:pkg.media_url||null,title:meta.title,caption:meta.caption||meta.post,description:meta.description,hashtags:meta.hashtags,answer_comment:meta.answerComment,publish_mode:'now'};
      const r=await fetch(FACEBOOK_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'apikey':ANON},body:JSON.stringify(payload)});const d=await r.json().catch(()=>({}));if(!r.ok||!d.success)throw new Error(d.error||d.meta_error_message||'Facebook publish failed');return d;
    }
    if(pkg.platform==='instagram'){
      if(!pkg.media_url)throw new Error('Instagram के लिए Image/Video media जरूरी है।');
      const r=await fetch(INSTAGRAM_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'x-user-access-token':token,'apikey':ANON},body:JSON.stringify({access_token:token,media_url:pkg.media_url,caption:meta.caption||meta.post,question_id:Number(pkg.question_id),plan_id:null,class_level:Number(question.class_level),content_type:pkg.content_type})});
      const d=await r.json().catch(()=>({}));if(!r.ok||!d.success)throw new Error(d.error||'Instagram publish failed');return d;
    }
    if(pkg.platform==='youtube'){
      if(!pkg.video_url&&!pkg.media_url)throw new Error('YouTube के लिए final video जरूरी है।');
      const sourceUrl=pkg.video_url||pkg.media_url;const res=await fetch(sourceUrl);if(!res.ok)throw new Error('Final video load नहीं हुआ।');const blob=await res.blob();const file=new File([blob],`Q${question.id}.mp4`,{type:blob.type||'video/mp4'});const up=await uploadFile(file,'youtube',question.id);
      const tags=String(meta.keywords||'GanitSetu,MPBoard,Maths,Class'+question.class_level).split(/[,\s]+/).map(x=>x.trim()).filter(Boolean).slice(0,30);
      const r=await fetch(YOUTUBE_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'apikey':ANON},body:JSON.stringify({storage_bucket:'content-media',storage_path:up.path,title:meta.title,description:meta.description,tags,privacy_status:'private',question_id:Number(pkg.question_id),plan_id:null,class_level:Number(question.class_level),publish_mode:'now'})});
      const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||'YouTube publish failed');return d;
    }
    if(pkg.platform==='whatsapp'){
      const text=[meta.title,meta.hook,meta.caption||meta.post,meta.cta,meta.hashtags].filter(Boolean).join('\n\n');
      await navigator.clipboard?.writeText(text); if(window.GanitSetuWhatsAppConnector?.openChannel) window.GanitSetuWhatsAppConnector.openChannel(); else window.open('https://whatsapp.com/channel/0029VbDLOBHICVfrePXZ363D','_blank');
      return {manual:true};
    }
  }
  async function publishCurrent(){
    if(!currentQuestion)return msg('पहले Question generate करें।','error');
    const content=readPackageFields(); const pkg={question_id:currentQuestion.id,platform:currentPlatform,content_type:currentType,content,draft:content.post||'',media_url:generatedImageUrl,video_url:videoUrl};
    try{
      if(currentPlatform==='instagram'&&!pkg.media_url&&generatedImageData){const up=await uploadFile(dataUrlToFile(generatedImageData,`Q${currentQuestion.id}.jpg`),'instagram',currentQuestion.id);generatedImageUrl=up.url;pkg.media_url=up.url}
      await publishPackage(pkg);msg(currentPlatform==='whatsapp'?'WhatsApp Channel के लिए content copy हो गया और Channel खुल गया।':`✅ ${currentPlatform} publish सफल हुआ।`,'success');
    }catch(e){msg(e.message,'error')}
  }
  function renderReport(){const all=read('gsContentPackages',[]);$('savedCount').textContent=all.length;$('publishedCount').textContent=all.filter(x=>x.status==='published').length;$('pendingCount').textContent=all.filter(x=>x.status!=='published').length;const box=$('savedList');if(!box)return;box.innerHTML=all.slice(0,30).map(p=>`<label class="saved-row"><input type="checkbox" value="${esc(p.id)}"><span><b>Q${esc(p.question_id)}</b> · ${esc(p.platform)} · ${esc(p.content_type)}</span><span class="status-pill">${esc(p.status)}</span></label>`).join('')||'<div class="empty">अभी कोई saved package नहीं है।</div>'}
  async function publishSelected(){const ids=[...document.querySelectorAll('.saved-row input:checked')].map(x=>x.value);const all=read('gsContentPackages',[]);const selected=all.filter(p=>ids.includes(p.id));if(!selected.length)return msg('पहले saved packages select करें।','error');for(const p of selected){try{await publishPackage(p);p.status='published';p.published_at=new Date().toISOString()}catch(e){p.status='failed';p.error=e.message}}write('gsContentPackages',all);renderReport();msg('Selected packages की publishing प्रक्रिया पूरी हुई।','success')}
  function connectPlatform(p){try{if(p==='facebook'&&window.GanitSetuFacebookConnector)return window.GanitSetuFacebookConnector.startOAuth();if(p==='instagram'&&window.GanitSetuInstagramConnector)return window.GanitSetuInstagramConnector.connectInstagram();if(p==='youtube'&&window.GanitSetuYouTubeConnector)return window.GanitSetuYouTubeConnector.connect();if(p==='whatsapp'&&window.GanitSetuWhatsAppConnector)return window.GanitSetuWhatsAppConnector.openChannel();msg('इस platform का connector अभी load नहीं हुआ।','error')}catch(e){msg(e.message,'error')}}
  function renderQuestion(q){
    currentQuestion=q||null;
    const box=$('currentQuestion');
    if(!box)return;
    if(!q){box.innerHTML='<div class="empty">कोई प्रश्न नहीं मिला। Class/Chapter बदलकर फिर कोशिश करें।</div>';return}
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
      write('gsRecentQuestionIds',[String(q.id),...prior.filter(id=>String(id)!==String(q.id))].slice(0,Math.min(100,Math.max(1,rows.length-1))));
      renderQuestion(q);msg(`नया प्रश्न लोड हो गया: Q${q.id}`,'success');
    }catch(e){msg('Question load नहीं हुआ: '+(e.message||e),'error')}
    finally{if(btn){btn.disabled=false;btn.textContent='✨ Generate New Question'}const next=$('newQuestion');if(next)next.disabled=false}
  }
  function updateState(){
    document.querySelectorAll('[data-platform]').forEach(el=>el.classList.toggle('active',el.dataset.platform===currentPlatform));
    document.querySelectorAll('[data-type]').forEach(el=>el.classList.toggle('active',el.dataset.type===currentType));
    if($('currentPlatform'))$('currentPlatform').textContent='सभी प्लेटफॉर्म के लिए कंटेंट';
    if($('currentType'))$('currentType').textContent=currentType;
    updatePublishAvailability();
  }
  function bind(){
    initMasterPromptUI();
    $('postType')?.addEventListener('change',()=>{const mt=$('masterPromptType');if(mt){mt.value=$('postType').value;mt.dispatchEvent(new Event('change'))}});
    $('generateQuestion').onclick=generateQuestion;$('newQuestion').onclick=generateQuestion;$('ccClass').onchange=loadChapters;
    document.querySelectorAll('[data-platform]').forEach(b=>b.onclick=e=>{if(e.target.closest('.platform-connect'))return;currentPlatform=b.dataset.platform;updateState()});
    document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{currentType=b.dataset.type;updateState()});
    document.querySelectorAll('.platform-connect').forEach(b=>b.onclick=e=>{e.stopPropagation();connectPlatform(b.dataset.connect)});
    $('generatePost').onclick=generatePost;$('generateImage').onclick=generateImage;$('createVideo').onclick=videoModal;$('savePackage').onclick=savePackage;$('saveDraft').onclick=savePackage;$('publishCurrent').onclick=publishCurrent;$('publishSelected').onclick=publishSelected;
    $('previewPackage').onclick=()=>{const p=readPackageFields();$('previewQuestion').textContent=currentQuestion?`Q${currentQuestion.id}`:'—';$('previewText').textContent=JSON.stringify(p,null,2);$('previewImage').src=generatedImageData||generatedImageUrl||'';$('previewModal').hidden=false};$('closePreview').onclick=()=>$('previewModal').hidden=true;$('closeVideo').onclick=()=>{$('videoModal').hidden=true;$('videoFrame').src=''};
    window.addEventListener('message',e=>{if(e.data?.type==='GS_VIDEO_READY'&&currentQuestion&&String(e.data.question_id)===String(currentQuestion.id)){videoUrl=e.data.video_url||'';$('videoStatus').textContent='✅ Final Video Ready';$('videoLink').href=videoUrl;$('videoLink').hidden=!videoUrl;msg('Final video तैयार है। अब Save करके platform publish कर सकते हैं।','success')}})
  }
  document.addEventListener('DOMContentLoaded',async()=>{bind();renderReport();await loadChapters();const old=read('gsCurrentContentQuestion',null);if(old){currentQuestion=old;renderQuestion(old)}updateState()});
})();
