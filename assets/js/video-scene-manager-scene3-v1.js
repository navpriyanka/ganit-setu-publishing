(function(){
'use strict';

const SUPABASE_URL='https://cbgojvnbkosdehvwerth.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_';
const BUCKET='content-media';

const scenes=[
 {n:1,name:'Question Intro',desc:'सवाल को ध्यान से पढ़ने के लिए curiosity'},
 {n:2,name:'Options',desc:'विकल्पों को ध्यान से देखने के लिए prompt'},
 {n:3,name:'Hint',desc:'Hint देखने के लिए guidance'},
 {n:4,name:'Answer Reveal',desc:'उत्तर check करने की curiosity'},
 {n:5,name:'CTA',desc:'गणित सेतु Follow / Subscribe CTA'}
];

let sb=null;
let questions=[];
let selectedQuestion=null;
let finalBlob=null;
let finalObjectUrl=null;
let videoRowsByScene={};
let imageRowsByScene={};
let layerRowsByScene={};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const safeId=v=>String(v).replace(/[^a-zA-Z0-9_-]/g,'_');
const questionId=q=>String(q.question_id ?? q.id ?? q.question_number ?? '');
const questionText=q=>String(q.question_text ?? q.question ?? q.text ?? q.title ?? 'Question data उपलब्ध');
const questionClass=q=>String(q.class_level ?? q.class ?? q.class_name ?? '');
const fileNameFor=file=>`${Date.now()}-${String(file.name).replace(/[^a-zA-Z0-9._-]/g,'_')}`;
const storagePath=(qid,sn,fn)=>`video-scenes/questions/${encodeURIComponent(String(qid))}/scene-${sn}/${fn}`;
const publicUrl=path=>`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}?v=${Date.now()}`;
const imageStoragePath=(qid,sn)=>`video-scenes/questions/${encodeURIComponent(String(qid))}/images/scene-${sn}.png`;
const imagePublicUrl=path=>`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}?v=${Date.now()}`;
const pickField=(q, keys, fallback='')=>{for(const k of keys){if(q && q[k]!==undefined && q[k]!==null && String(q[k]).trim()!=='')return String(q[k]);}return fallback;};
const optionText=(q,n)=>pickField(q,[`option_${n}`,`option${n}`,`option_${String.fromCharCode(96+n)}`,`option${String.fromCharCode(96+n)}`,`choice_${n}`,`choice${n}`,`answer_option_${n}`],'');
const answerText=q=>pickField(q,['correct_answer','correctAnswer','answer','correct_option','correct_option_text','right_answer'],'');
const hintText=q=>pickField(q,['hint','question_hint','explanation_hint'],'Hint उपलब्ध नहीं है।');
const explanationText=q=>pickField(q,['explanation','solution','answer_explanation'],'');
const chapterText=q=>pickField(q,['chapter_name','chapter','chapter_title'],'');
const sceneImageText=(q,sn)=>{
  const qt=questionText(q);
  const a=answerText(q);
  if(sn===1)return {title:'सवाल ध्यान से पढ़िए',body:qt};
  if(sn===2){const opts=[1,2,3,4].map((n,i)=>optionText(q,n)).filter(Boolean);return {title:'विकल्प ध्यान से देखिए',body:opts.length?opts.map((v,i)=>`${String.fromCharCode(65+i)}) ${v}`).join('\n'):'विकल्प उपलब्ध हैं।'};}
  if(sn===3)return {title:'Hint',body:hintText(q)};
  if(sn===4)return {title:'सही उत्तर',body:a+(explanationText(q)?`\n\n${explanationText(q)}`:'')};
  return {title:'गणित सेतु',body:'ऐसे ही मज़ेदार गणित के सवालों के लिए\nगणित सेतु को फॉलो और सब्सक्राइब करें।'};
};

function wrapCanvasText(ctx,text,maxWidth,lineHeight,maxLines=8){
  const lines=[];
  String(text||'').split(/\n/).forEach(par=>{
    const words=par.split(/\s+/).filter(Boolean); if(!words.length){lines.push('');return;}
    let line='';
    for(const word of words){
      const test=line?`${line} ${word}`:word;
      if(ctx.measureText(test).width<=maxWidth) line=test;
      else {if(line)lines.push(line); line=word;}
    }
    if(line)lines.push(line);
  });
  return lines.slice(0,maxLines);
}

function drawQuestionImage(q,sn){
  const W=1080,H=1920;
  const c=document.createElement('canvas'); c.width=W;c.height=H;
  const ctx=c.getContext('2d');
  ctx.clearRect(0,0,W,H);

  // Scene 3 is a Hint-only overlay. Keep the upper safe area clear of the girl.
  // The video template is 720x1280; this canvas is 1080x1920 (same 9:16 ratio).
  const hint=hintText(q);

  if(sn===3){
    const x=70, y=90, w=W-140, h=650, r=34;
    ctx.save();

    // Soft white translucent panel; no background, girl or logo is included in PNG.
    ctx.fillStyle='rgba(255,255,255,0.96)';
    ctx.beginPath();
    ctx.roundRect(x,y,w,h,r);
    ctx.fill();

    // Hint heading.
    ctx.fillStyle='#1d4ed8';
    ctx.font='700 58px "Noto Sans Devanagari", "Mangal", sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText('💡 Hint',W/2,y+78);

    // Auto-fit the hint inside the fixed safe area.
    const maxWidth=w-120;
    const maxHeight=h-165;
    let fontSize=58;
    let lineHeight=fontSize*1.48;
    let lines=[];
    while(fontSize>=30){
      ctx.font=`600 ${fontSize}px "Noto Sans Devanagari", "Mangal", sans-serif`;
      lineHeight=fontSize*1.48;
      lines=wrapCanvasText(ctx,hint,maxWidth,lineHeight,8);
      if(lines.length*lineHeight<=maxHeight)break;
      fontSize-=2;
    }

    ctx.fillStyle='#0f172a';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    const total=lines.length*lineHeight;
    let yy=y+135+(maxHeight-total)/2;
    for(const line of lines){
      ctx.fillText(line,W/2,yy);
      yy+=lineHeight;
    }

    ctx.restore();
    return c;
  }

  // Keep the existing Scene 1/2/4/5 rendering unchanged.
  const {title,body}=sceneImageText(q,sn);
  ctx.save();
  ctx.fillStyle='rgba(255,255,255,0.94)';
  ctx.strokeStyle='rgba(37,99,235,0.22)';
  ctx.lineWidth=3;
  const x=70,y=90,w=W-140,h=760,r=34;
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();ctx.stroke();
  ctx.fillStyle='#1d4ed8';ctx.font='700 46px "Noto Sans Devanagari", "Mangal", sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(title,W/2,y+70);
  ctx.fillStyle='#0f172a';
  let fontSize=sn===5?40:(sn===2?44:48);
  ctx.font=`600 ${fontSize}px "Noto Sans Devanagari", "Mangal", sans-serif`;
  const lines=wrapCanvasText(ctx,body,w-120,fontSize*1.45,sn===2?8:10);
  const total=lines.length*fontSize*1.45;
  let yy=y+120+(h-150-total)/2;
  for(const line of lines){ctx.fillText(line,W/2,yy);yy+=fontSize*1.45;}
  if(chapterText(q)){
    ctx.fillStyle='#475569';ctx.font='500 28px "Noto Sans Devanagari", "Mangal", sans-serif';ctx.fillText(chapterText(q),W/2,y+h-45);
  }
  ctx.restore();
  return c;
}
function canvasToBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG generate नहीं हुआ।')),'image/png'));}


async function init(){
  if(!window.supabase){alert('Supabase library load नहीं हुई।');return;}
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  const {data:{session}}=await sb.auth.getSession();
  if(!session){location.href='index.html';return;}

  document.getElementById('batchGenerateBtn').addEventListener('click',loadQuestions);
  document.getElementById('finalPreviewBtn').addEventListener('click',buildFinalPreview);
  document.getElementById('downloadFinalBtn').addEventListener('click',downloadFinal);
  document.getElementById('publishFinalBtn').addEventListener('click',publishFinal);
}

async function loadQuestions(){
  const count=Math.min(5,Math.max(1,Number(document.getElementById('batchCount').value||1)));
  const result=document.getElementById('batchResult');
  const status=document.getElementById('batchResultStatus');
  const picker=document.getElementById('questionPicker');
  const btn=document.getElementById('batchGenerateBtn');

  btn.disabled=true;
  btn.textContent='⏳ Questions पढ़ रहा है…';
  result.style.display='block';
  status.textContent='Loading…';
  picker.innerHTML='<span class="qtm-empty">Supabase से questions पढ़े जा रहे हैं…</span>';

  try{
    // पहले questions table को सामान्य तरीके से पढ़ें।
    // किसी specific column (जैसे question_id) पर निर्भर नहीं रहेंगे,
    // क्योंकि अलग database versions में ID column अलग हो सकता है।
    const {data,error}=await sb.from('questions').select('*').limit(500);
    if(error)throw error;
    const rows=Array.isArray(data)?data:[];
    if(!rows.length)throw new Error('questions table में कोई question नहीं मिला।');

    let savedIds=[];
    try{ savedIds=JSON.parse(localStorage.getItem('vsm_selected_question_ids')||'[]'); }catch(_){ savedIds=[]; }
    if(!Array.isArray(savedIds))savedIds=[];

    // F5 के बाद पहले से selected questions को उन्हीं rows में खोजें।
    const byId=new Map(rows.map(q=>[questionId(q),q]));
    const restored=savedIds.map(id=>byId.get(String(id))).filter(Boolean);

    if(restored.length){
      questions=restored.slice(0,count);
      // अगर saved selection में कम questions मिले तो नए questions से भरें।
      if(questions.length<count){
        const used=new Set(questions.map(questionId));
        const extras=rows.filter(q=>!used.has(questionId(q))).sort(()=>Math.random()-0.5);
        questions=questions.concat(extras.slice(0,count-questions.length));
      }
    }else{
      questions=[...rows].sort(()=>Math.random()-0.5).slice(0,count);
    }

    localStorage.setItem('vsm_selected_question_ids',JSON.stringify(questions.map(questionId)));

    picker.innerHTML=questions.map((q,i)=>
      `<button type="button" class="vsm-btn vsm-secondary" data-qidx="${i}">Question ${i+1} — ${esc(questionId(q))}</button>`
    ).join('');

    picker.querySelectorAll('button').forEach(b=>{
      b.addEventListener('click',()=>openQuestion(Number(b.dataset.qidx)));
    });

    status.textContent=`✅ ${questions.length} question(s) loaded`;
    openQuestion(0);
  }catch(e){
    console.error('Questions load failed:',e);
    status.textContent='❌ Questions load failed';
    picker.innerHTML=`<span class="qtm-empty">Error: ${esc(e.message||String(e))}</span>`;
  }finally{
    btn.disabled=false;
    btn.textContent='🎬 Questions Load करें';
  }
}
async function openQuestion(index){
  selectedQuestion=questions[index];
  finalBlob=null;
  if(finalObjectUrl){URL.revokeObjectURL(finalObjectUrl);finalObjectUrl=null;}

  document.getElementById('questionWorkspace').style.display='block';
  document.getElementById('workspaceTitle').textContent=`Question ${index+1} — ${questionId(selectedQuestion)}`;
  document.getElementById('workspaceText').textContent=questionText(selectedQuestion);
  const cls=document.getElementById('workspaceClass');
  cls.textContent=questionClass(selectedQuestion)?`Class ${questionClass(selectedQuestion)}`:'';

  document.querySelectorAll('#questionPicker button').forEach((b,i)=>b.classList.toggle('active',i===index));

  renderScenes();
  resetFinalUI();
  await loadQuestionScenes();
}

function renderScenes(){
  const qid=questionId(selectedQuestion);
  const sid=safeId(qid);
  document.getElementById('sceneGrid').innerHTML=scenes.map(s=>`
    <div class="qtm-scene" id="qscene-${sid}-${s.n}">
      <h4>Scene ${s.n} — ${esc(s.name)}</h4>
      <div class="qtm-scene-body">
        <div class="qtm-media-box">
          <div class="qtm-media-label">🎬 VIDEO PREVIEW</div>
          <div id="qpreview-${sid}-${s.n}"><div class="qtm-empty">अभी video save नहीं है</div></div>
          <input class="qtm-file" id="file-${sid}-${s.n}" type="file" accept="video/mp4,video/*">
          <div class="qtm-upload"><button class="vsm-btn vsm-primary" type="button" onclick="document.getElementById('file-${sid}-${s.n}').click()">⬆️ Upload Scene ${s.n}</button></div>
        </div>
        <div class="qtm-media-box">
          <div class="qtm-media-label">🖼️ SCENE IMAGE</div>
          <div class="qtm-image-wrap" id="qimage-${sid}-${s.n}"><div class="qtm-image-empty">अभी image generate नहीं हुई</div></div>
          <div class="qtm-image-actions">
            <button class="vsm-mini" type="button" onclick="generateSceneImage(${s.n})">✨ Generate Image</button>
            <button class="vsm-mini" type="button" onclick="generateSceneImage(${s.n})">🔄 Regenerate</button>
          </div>
          <div class="qtm-image-status" id="qimagestatus-${sid}-${s.n}">Image अभी save नहीं है</div>
        </div>
      </div>
      <div class="qtm-status" id="qstatus-${sid}-${s.n}">Checking…</div>
    </div>`).join('');

  scenes.forEach(s=>{
    document.getElementById(`file-${sid}-${s.n}`).addEventListener('change',e=>{
      const f=e.target.files?.[0];
      if(f)saveQuestionScene(qid,s.n,f);
      e.target.value='';
    });
  });
}

async function loadQuestionScenes(){
  const qid=questionId(selectedQuestion);
  try{
    const {data,error}=await sb.from('video_question_scene_templates')
      .select('id,question_id,scene_number,file_name,storage_path,is_active')
      .eq('question_id',qid)
      .order('scene_number',{ascending:true});
    if(error)throw error;

    videoRowsByScene={};
    scenes.forEach(s=>{
      const row=(data||[]).find(r=>Number(r.scene_number)===s.n)||null;
      videoRowsByScene[s.n]=row;
      renderScene(qid,s.n,row);
    });
    await loadQuestionImages();
    setTimeout(updateFinalAvailability,50);
  }catch(e){
    console.error(e);
    scenes.forEach(s=>{
      const st=document.getElementById(`qstatus-${safeId(qid)}-${s.n}`);
      if(st)st.textContent='⚠️ Template load नहीं हो सका';
    });
  }
}

function renderScene(qid,sn,row){
  const sid=safeId(qid);
  const preview=document.getElementById(`qpreview-${sid}-${sn}`);
  const status=document.getElementById(`qstatus-${sid}-${sn}`);
  if(!preview||!status)return;

  if(!row){
    preview.innerHTML='<div class="qtm-empty">अभी video save नहीं है</div>';
    status.textContent='⚪ Upload करें';
    return;
  }

  const url=publicUrl(row.storage_path);
  preview.innerHTML=`
    <video controls preload="metadata" src="${url}"></video>
    <div class="qtm-actions">
      <button class="vsm-mini" type="button" onclick="window.open('${url}','_blank')">▶ Preview</button>
      <button class="vsm-mini" type="button" onclick="document.getElementById('file-${sid}-${sn}').click()">🔄 Replace</button>
    </div>`;
  status.innerHTML='<span class="qtm-badge qtm-saved">✅ Permanently Saved</span>';
}

async function loadQuestionImages(){
  const qid=questionId(selectedQuestion), sid=safeId(qid);
  try{
    const {data,error}=await sb.from('video_question_scene_images')
      .select('id,question_id,scene_number,file_name,storage_path,is_active')
      .eq('question_id',qid).order('scene_number',{ascending:true});
    if(error)throw error;
    imageRowsByScene={};
    const imageRows=data||[];
    scenes.forEach(s=>{
      const row=imageRows.find(r=>Number(r.scene_number)===s.n)||null;
      imageRowsByScene[s.n]=row;
      renderSceneImage(qid,s.n,row);
    });
    try{
      const {data:layers,error:layerErr}=await sb.from('video_question_scene_layers').select('*').eq('question_id',qid).order('scene_number',{ascending:true});
      if(layerErr)throw layerErr;
      layerRowsByScene={};
      const savedLayers=layers||[];
      const scene1Defaults=savedLayers.find(r=>Number(r.scene_number)===1)||null;
      scenes.forEach(s=>{
        const own=savedLayers.find(r=>Number(r.scene_number)===s.n)||null;
        // Scene 1 is the editable master/default. Scenes 2-5 inherit it until they
        // get their own saved override. The inherited values are NOT written to DB.
        const inherited=(s.n>1 && !own && scene1Defaults)
          ? {...scene1Defaults,scene_number:s.n,__inherited:true}
          : own;
        layerRowsByScene[s.n]=inherited;
        renderLayerEditor(qid,s.n,imageRowsByScene[s.n],videoRowsByScene[s.n],inherited);
      });
    }catch(layerErr){
      console.warn('Layer settings load skipped:',layerErr);
      scenes.forEach(s=>renderLayerEditor(qid,s.n,imageRowsByScene[s.n],videoRowsByScene[s.n],null));
    }
  }catch(e){
    console.error('Image load failed:',e);
    scenes.forEach(s=>{const el=document.getElementById(`qimagestatus-${sid}-${s.n}`);if(el)el.textContent='⚠️ Image table/record load नहीं हुआ';});
  }
}

function renderSceneImage(qid,sn,row){
  const sid=safeId(qid), box=document.getElementById(`qimage-${sid}-${sn}`), st=document.getElementById(`qimagestatus-${sid}-${sn}`);
  if(!box||!st)return;
  if(!row){box.innerHTML='<div class="qtm-image-empty">अभी image generate नहीं हुई</div>';st.textContent='Image अभी save नहीं है';return;}
  const url=imagePublicUrl(row.storage_path);
  box.innerHTML=`<img src="${url}" alt="Scene ${sn} image" loading="lazy"><div class="qtm-image-actions"><button class="vsm-mini" type="button" onclick="window.open('${url}','_blank')">▶ Preview</button></div>`;
  st.innerHTML='<span class="qtm-badge qtm-saved">✅ Image Permanently Saved</span>';
  renderLayerEditor(qid,sn,row,videoRowsByScene[sn],layerRowsByScene[sn]);
}

function renderLayerEditor(qid,sn,imageRow,videoRow,layerRow){
  const sid=safeId(qid);
  const host=document.getElementById(`qscene-${sid}-${sn}`);
  if(!host)return;
  let editor=host.querySelector('.qtm-layer-editor');
  if(!imageRow){ if(editor)editor.remove(); return; }
  if(!editor){ editor=document.createElement('div'); editor.className='qtm-layer-editor'; host.appendChild(editor); }
  const defaults={x:0,y:0,width:1080,height:1920};
  const layer={...defaults,...(layerRow||{})};
  const inherited=Boolean(layerRow?.__inherited);
  const videoUrl=videoRow?.storage_path?publicUrl(videoRow.storage_path):'';
  const imageUrl=imagePublicUrl(imageRow.storage_path);
  editor.innerHTML=`
    <div class="qtm-media-label">🎛️ IMAGE LAYER — Scene ${sn}</div>
    <div class="qtm-layer-stage" id="layerstage-${sid}-${sn}">
      ${videoUrl?`<video muted playsinline preload="metadata" src="${videoUrl}"></video>`:'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:12px">Video पहले upload करें</div>'}
      <img id="layerimg-${sid}-${sn}" src="${imageUrl}" draggable="false" alt="Scene ${sn} layer">
    </div>
    <div class="qtm-layer-controls">
      <label>X <input id="layerx-${sid}-${sn}" type="number" step="1" value="${Number(layer.x)||0}"></label>
      <label>Y <input id="layery-${sid}-${sn}" type="number" step="1" value="${Number(layer.y)||0}"></label>
      <label>Width <input id="layerw-${sid}-${sn}" type="number" min="100" max="1080" step="1" value="${Number(layer.width)||1080}"></label>
      <label>Height <input id="layerh-${sid}-${sn}" type="number" min="100" max="1920" step="1" value="${Number(layer.height)||1920}"></label>
    </div>
    <div class="qtm-layer-actions">
      <button class="vsm-mini" type="button" id="layerSave-${sid}-${sn}">💾 Position Save</button>
      <button class="vsm-mini" type="button" id="layerReset-${sid}-${sn}">↩️ Reset</button>
    </div>
    <div class="qtm-layer-help">🖱️ Image को सीधे drag करके जगह बदलें। X/Y और Size से exact adjustment करें।</div>
    <div class="qtm-layer-default-note" style="margin-top:6px;font-size:11px;color:#475569;">${inherited?'⭐ Scene 1 की position अभी default के रूप में लगी है। इस Scene को Save करने पर इसकी अपनी अलग position बन जाएगी।':sn===1?'⭐ Scene 1 की saved position आगे के scenes के लिए default रहेगी।':'🔧 इस Scene की अपनी saved position है। इसे अलग से बदला जा सकता है।'}</div>`;

  const stage=editor.querySelector(`#layerstage-${sid}-${sn}`), img=editor.querySelector(`#layerimg-${sid}-${sn}`);
  const xIn=editor.querySelector(`#layerx-${sid}-${sn}`), yIn=editor.querySelector(`#layery-${sid}-${sn}`), wIn=editor.querySelector(`#layerw-${sid}-${sn}`), hIn=editor.querySelector(`#layerh-${sid}-${sn}`);
  const apply=()=>{ img.style.left=`${(Number(xIn.value)||0)/1080*100}%`; img.style.top=`${(Number(yIn.value)||0)/1920*100}%`; img.style.width=`${(Number(wIn.value)||1080)/1080*100}%`; img.style.height=`${(Number(hIn.value)||1920)/1920*100}%`; };
  [xIn,yIn,wIn,hIn].forEach(el=>el.addEventListener('input',apply));
  apply();

  let dragging=false,startX=0,startY=0,baseX=0,baseY=0;
  const pointerStart=e=>{dragging=true; img.setPointerCapture?.(e.pointerId); startX=e.clientX; startY=e.clientY; baseX=Number(xIn.value)||0;baseY=Number(yIn.value)||0;e.preventDefault();};
  const pointerMove=e=>{if(!dragging)return; const dx=(e.clientX-startX)/stage.clientWidth*1080; const dy=(e.clientY-startY)/stage.clientHeight*1920; xIn.value=Math.round(Math.max(0,Math.min(1080-(Number(wIn.value)||1080),baseX+dx))); yIn.value=Math.round(Math.max(0,Math.min(1920-(Number(hIn.value)||1920),baseY+dy))); apply();};
  const pointerEnd=()=>{dragging=false;};
  img.addEventListener('pointerdown',pointerStart); img.addEventListener('pointermove',pointerMove); img.addEventListener('pointerup',pointerEnd); img.addEventListener('pointercancel',pointerEnd);

  const bgVideo=stage.querySelector('video');
  if(bgVideo){
    // IMPORTANT: the template is already intended to be 9:16. Do not let the
    // browser create letterbox/black areas around it. The editor canvas itself
    // is the 1080x1920 frame, so the video is stretched only to that same
    // frame. This keeps the editor coordinates identical to the final render.
    bgVideo.style.objectFit='fill';
    bgVideo.style.objectPosition='center center';
    bgVideo.style.background='transparent';
    bgVideo.addEventListener('loadedmetadata',()=>{
      const sw=Number(bgVideo.videoWidth)||0, sh=Number(bgVideo.videoHeight)||0;
      const badge=document.createElement('div');
      badge.className='qtm-video-size-note';
      badge.textContent=sw&&sh?`Template: ${sw} × ${sh} (${(sw/sh).toFixed(3)})`:'Template size पढ़ा जा रहा है…';
      editor.insertBefore(badge, editor.querySelector('.qtm-layer-controls'));
    },{once:true});
  }

  editor.querySelector(`#layerSave-${sid}-${sn}`).onclick=async()=>{
    const btn=editor.querySelector(`#layerSave-${sid}-${sn}`);
    btn.disabled=true; btn.textContent='⏳ Saving...';
    try{
      await saveLayerSettings(qid,sn,{x:Number(xIn.value)||0,y:Number(yIn.value)||0,width:Number(wIn.value)||1080,height:Number(hIn.value)||1920});
      btn.textContent='✅ Saved';
      setTimeout(()=>{btn.disabled=false;btn.textContent='💾 Position Save';},1200);
    }catch(_){
      btn.disabled=false;btn.textContent='💾 Position Save';
    }
  };
  editor.querySelector(`#layerReset-${sid}-${sn}`).onclick=()=>{
    if(sn>1 && layerRowsByScene[1]){
      const d=layerRowsByScene[1]; xIn.value=Number(d.x)||0; yIn.value=Number(d.y)||0; wIn.value=Number(d.width)||1080; hIn.value=Number(d.height)||1920;
    }else{xIn.value=0;yIn.value=0;wIn.value=1080;hIn.value=1920;}
    apply();
  };
}

async function saveLayerSettings(qid,sn,vals){
  const st=document.getElementById(`qimagestatus-${safeId(qid)}-${sn}`);
  try{
    const payload={question_id:qid,scene_number:sn,x:vals.x,y:vals.y,width:vals.width,height:vals.height,z_index:10,is_active:true,updated_at:new Date().toISOString()};
    // Do not request a returned row here. This avoids failures caused by a
    // SELECT/RETURNING restriction even when INSERT/UPDATE policies are valid.
    const {error}=await sb.from('video_question_scene_layers')
      .upsert(payload,{onConflict:'question_id,scene_number',ignoreDuplicates:false});
    if(error)throw error;
    layerRowsByScene[sn]={...payload};
    if(st)st.textContent=`✅ Scene ${sn} image position saved`;
    return payload;
  }catch(e){
    console.error('Layer save failed:',e);
    const msg=e?.message||String(e);
    if(st)st.textContent=`⚠️ Layer save failed: ${msg}`;
    alert(`Scene ${sn} Position Save failed:\n${msg}`);
    throw e;
  }
}

async function generateSceneImage(sn){
  if(!selectedQuestion)return;
  const qid=questionId(selectedQuestion), sid=safeId(qid);
  const st=document.getElementById(`qimagestatus-${sid}-${sn}`), box=document.getElementById(`qimage-${sid}-${sn}`);
  st.textContent='⏳ Image generate और save हो रही है…';
  try{
    const canvas=drawQuestionImage(selectedQuestion,sn);
    const blob=await canvasToBlob(canvas);
    const fn=`scene-${sn}.png`;
    const path=imageStoragePath(qid,sn);
    const {data:oldRows,error:oldErr}=await sb.from('video_question_scene_images')
      .select('id,storage_path').eq('question_id',qid).eq('scene_number',sn).limit(1);
    if(oldErr)throw oldErr;
    const old=oldRows?.[0]||null;
    const {error:uploadErr}=await sb.storage.from(BUCKET).upload(path,blob,{contentType:'image/png',upsert:true,cacheControl:'31536000'});
    if(uploadErr)throw uploadErr;
    const payload={question_id:qid,scene_number:sn,file_name:fn,storage_path:path,image_width:1080,image_height:1920,is_active:true,updated_at:new Date().toISOString()};
    // Always UPSERT by the Question + Scene unique key. This prevents duplicate-key
    // errors even if an old record already exists or Generate/Regenerate is clicked quickly.
    const {data:savedRow,error:dbErr}=await sb.from('video_question_scene_images')
      .upsert({...payload,created_at:old?.created_at||new Date().toISOString()},{onConflict:'question_id,scene_number'})
      .select('id,question_id,scene_number,file_name,storage_path,is_active,image_width,image_height,created_at,updated_at')
      .single();
    if(dbErr)throw dbErr;
    renderSceneImage(qid,sn,savedRow||payload);
    document.getElementById('finalStatus').textContent=`✅ Scene ${sn} image saved. अब यही image बाद में video layer में लगाई जा सकती है।`;
  }catch(e){
    console.error('Image generate failed:',e);st.textContent='❌ Image generate failed';alert(`Scene ${sn} image generate failed: ${e.message||e}`);
  }
}

// Inline HTML buttons need a window-level handler because this file uses an IIFE.
window.generateSceneImage = generateSceneImage;

async function saveQuestionScene(qid,sn,file){
  if(!file.type.startsWith('video/')){alert('केवल video file चुनें।');return;}
  const sid=safeId(qid);
  const status=document.getElementById(`qstatus-${sid}-${sn}`);
  status.textContent='⏳ Video save हो रहा है…';

  try{
    const {data:oldRows,error:oldErr}=await sb.from('video_question_scene_templates')
      .select('id,storage_path')
      .eq('question_id',qid).eq('scene_number',sn).limit(1);
    if(oldErr)throw oldErr;

    const old=oldRows?.[0]||null;
    const fn=fileNameFor(file);
    const path=storagePath(qid,sn,fn);

    const {error:uploadErr}=await sb.storage.from(BUCKET).upload(path,file,{
      contentType:file.type||'video/mp4',upsert:false,cacheControl:'31536000'
    });
    if(uploadErr)throw uploadErr;

    const payload={question_id:qid,scene_number:sn,file_name:fn,storage_path:path,is_active:true,updated_at:new Date().toISOString()};
    let dbErr=null;

    if(old){
      const {error}=await sb.from('video_question_scene_templates').update(payload).eq('id',old.id);
      dbErr=error;
    }else{
      const {error}=await sb.from('video_question_scene_templates').insert({...payload,created_at:new Date().toISOString()});
      dbErr=error;
    }

    if(dbErr){
      await sb.storage.from(BUCKET).remove([path]);
      throw dbErr;
    }

    if(old?.storage_path)await sb.storage.from(BUCKET).remove([old.storage_path]);
    renderScene(qid,sn,{...payload});
    updateFinalAvailability();
    document.getElementById('finalStatus').textContent=`✅ Scene ${sn} permanently saved.`;
  }catch(e){
    console.error(e);
    status.textContent='❌ Save failed';
    alert(`Scene ${sn} upload failed: ${e.message||e}`);
  }
}

async function getRows(){
  const qid=questionId(selectedQuestion);
  const {data,error}=await sb.from('video_question_scene_templates')
    .select('scene_number,file_name,storage_path,is_active')
    .eq('question_id',qid)
    .order('scene_number',{ascending:true});
  if(error)throw error;
  return data||[];
}

function updateFinalAvailability(){
  document.getElementById('finalPreviewBtn').disabled=!selectedQuestion;
}

function resetFinalUI(){
  document.getElementById('finalPreview').innerHTML='<div class="qtm-empty">Final Preview अभी नहीं बना है।</div>';
  document.getElementById('downloadFinalBtn').disabled=true;
  document.getElementById('publishFinalBtn').disabled=true;
  document.getElementById('finalStatus').textContent='जितने Scene upload होंगे, Final Preview में उतने ही क्रम से जुड़ेंगे।';
}

async function buildFinalPreview(){
  const status=document.getElementById('finalStatus');
  const preview=document.getElementById('finalPreview');
  const btn=document.getElementById('finalPreviewBtn');
  btn.disabled=true;
  status.textContent='⏳ Saved scenes और image layers पढ़े जा रहे हैं…';

  try{
    const rows=await getRows();
    const available=scenes.map(s=>rows.find(r=>Number(r.scene_number)===s.n)).filter(Boolean);
    if(!available.length)throw new Error('कम-से-कम 1 Scene video upload करें।');
    if(!window.FFmpegWASM || !window.FFmpegUtil)throw new Error('Video compiler library load नहीं हुई। कृपया Ctrl+F5 करके फिर प्रयास करें।');

    const {FFmpeg}=window.FFmpegWASM;
    const {fetchFile,toBlobURL}=window.FFmpegUtil;
    const ffmpeg=new FFmpeg();
    ffmpeg.on('log', ({message}) => { console.log('[FFmpeg]', message); });
    ffmpeg.on('progress', ({progress, time}) => {
      const pct=Math.max(0,Math.min(100,Math.round((Number(progress)||0)*100)));
      if(pct>0) status.textContent=`⏳ Scene render चल रहा है… ${pct}%`;
    });
    const base='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
    const classWorkerURL=new URL('assets/js/ffmpeg-class-worker.js?v=20260929-23',window.location.href).href;
    status.textContent='⏳ Video compiler load हो रहा है… (पहली बार 20–40 सेकंड लग सकते हैं)';
    const withTimeout=(promise,ms,label)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label)),ms))]);
    const coreURL=`${base}/ffmpeg-core.js`;
    const wasmURL=`${base}/ffmpeg-core.wasm`;
    status.textContent='⏳ Video compiler worker start हो रहा है…';
    await withTimeout(ffmpeg.load({ coreURL, wasmURL, classWorkerURL }),60000,'FFmpeg worker 60 सेकंड में start नहीं हुआ।');
    status.textContent='✅ Video compiler ready — अब scenes render होंगे…';

    const rendered=[];
    const execWithTimeout=async(args,ms,label)=>withTimeout(ffmpeg.exec(args),ms,label);
    const qid=questionId(selectedQuestion);

    // Every uploaded scene is rendered independently with its saved image layer.
    // Scene 1 is the default layer for later scenes until they get their own override.
    for(let i=0;i<available.length;i++){
      const row=available[i];
      const sn=Number(row.scene_number);
      const imageRow=imageRowsByScene[sn]||null;
      const layerOwn=layerRowsByScene[sn]||null;
      const layer=(layerOwn && layerOwn.x!==undefined)
        ? layerOwn
        : (sn>1 ? layerRowsByScene[1] : null);

      const vName=`source_${sn}.mp4`;
      const outName=`rendered_${sn}.mp4`;
      status.textContent=`⏳ Scene ${sn} — video + image layer render हो रहा है…`;
      await ffmpeg.writeFile(vName,await fetchFile(publicUrl(row.storage_path)));

      if(imageRow){
        const iName=`image_${sn}.png`;
        await ffmpeg.writeFile(iName,await fetchFile(imagePublicUrl(imageRow.storage_path)));
        const x=Math.max(0,Math.round(Number(layer?.x)||0));
        const y=Math.max(0,Math.round(Number(layer?.y)||0));
        const w=Math.max(1,Math.min(1080,Math.round(Number(layer?.width)||1080)));
        const h=Math.max(1,Math.min(1920,Math.round(Number(layer?.height)||1920)));

        // The template is designed as a 9:16 video. Normalize it directly to
        // the same 1080x1920 canvas so the editor and FFmpeg use exactly the
        // same coordinate system. Do not add a black letterbox/crop canvas.
        const filter=`[0:v]scale=1080:1920,setsar=1[base];[1:v]scale=${w}:${h},setsar=1[img];[base][img]overlay=${x}:${y}:format=auto[v]`;
        await execWithTimeout([
          '-i',vName,
          '-loop','1','-i',iName,
          '-filter_complex',filter,
          '-map','[v]','-map','0:a?','-c:v','libx264','-preset','ultrafast','-crf','23',
          '-c:a','aac','-shortest','-movflags','+faststart',outName
        ],180000,`Scene ${sn} render 180 सेकंड में पूरा नहीं हुआ।`);
      }else{
        // No image yet: keep the original video for this scene.
        await execWithTimeout(['-i',vName,'-c','copy',outName],120000,`Scene ${sn} copy 120 सेकंड में पूरा नहीं हुआ।`);
      }
      rendered.push(outName);
    }

    // Re-encode the rendered scenes into one consistent final MP4.
    const names=rendered;
    const concatList=names.map(n=>`file '${n}'`).join('\n');
    await ffmpeg.writeFile('concat.txt',new TextEncoder().encode(concatList));
    status.textContent='⏳ Final MP4 compile हो रहा है…';
    await execWithTimeout([
      '-f','concat','-safe','0','-i','concat.txt',
      '-c:v','libx264','-preset','ultrafast','-crf','23','-c:a','aac',
      '-movflags','+faststart','final.mp4'
    ],180000,'Final MP4 compile 180 सेकंड में पूरा नहीं हुआ।');

    const data=await ffmpeg.readFile('final.mp4');
    finalBlob=new Blob([data.buffer],{type:'video/mp4'});
    if(finalObjectUrl)URL.revokeObjectURL(finalObjectUrl);
    finalObjectUrl=URL.createObjectURL(finalBlob);
    preview.innerHTML=`<video controls autoplay src="${finalObjectUrl}"></video>`;
    document.getElementById('downloadFinalBtn').disabled=false;
    document.getElementById('downloadFinalBtn').dataset.single='0';
    document.getElementById('publishFinalBtn').disabled=false;
    document.getElementById('publishFinalBtn').classList.remove('qtm-publish-disabled');
    status.textContent=`✅ ${available.length} Scene(s) में saved image layers लगाकर Final Preview तैयार है।`;
  }catch(e){
    console.error('Final render failed:',e);
    status.textContent=`❌ Final Preview failed: ${e.message||e}`;
    console.error('Ganit Setu FFmpeg load/render error. If this is a load timeout, open DevTools Console for the exact network/worker error.', e);
  }finally{
    try{ if(typeof ffmpeg!=='undefined' && ffmpeg) ffmpeg.terminate(); }catch(_){}
    btn.disabled=false;
  }
}

async function downloadFinal(){
  const btn=document.getElementById('downloadFinalBtn');
  if(btn.dataset.single==='1'){
    const a=document.createElement('a');
    a.href=btn.dataset.url;
    a.download=`question-${questionId(selectedQuestion)}-final.mp4`;
    a.target='_blank';
    a.click();
    return;
  }
  if(!finalObjectUrl)return;
  const a=document.createElement('a');
  a.href=finalObjectUrl;
  a.download=`question-${questionId(selectedQuestion)}-final.mp4`;
  a.click();
}

function publishFinal(){
  alert('Final video तैयार है। Publishing button रखा गया है; Facebook / YouTube / WhatsApp Channel publishing को अगले चरण में मौजूदा publishing workflow से जोड़ा जाएगा।');
}

window.addEventListener('DOMContentLoaded',init);
})();