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
const imagePublicUrl=path=>`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${String(path).split('/').map(encodeURIComponent).join('/')}?v=${Date.now()}`;
const pickField=(q, keys, fallback='')=>{for(const k of keys){if(q && q[k]!==undefined && q[k]!==null && String(q[k]).trim()!=='')return String(q[k]);}return fallback;};
const optionText=(q,n)=>pickField(q,[`option_${n}`,`option${n}`,`option_${String.fromCharCode(96+n)}`,`option${String.fromCharCode(96+n)}`,`choice_${n}`,`choice${n}`,`answer_option_${n}`],'');
const answerText=q=>pickField(q,['correct_answer','correctAnswer','answer','correct_option','correct_option_text','right_answer'],'');
const correctOptionDisplay=q=>{
  const raw=answerText(q).trim();
  const letters=['A','B','C','D'];
  let idx=-1;
  const m=raw.match(/^(?:OPTION\s*)?([ABCD])(?:[\s\):.-]|$)/i);
  if(m) idx=letters.indexOf(m[1].toUpperCase());
  if(idx<0){
    const low=raw.toLowerCase();
    for(let i=0;i<4;i++){
      const opt=optionText(q,i+1).trim().toLowerCase();
      if(opt && low===opt) {idx=i; break;}
      if(opt && low.includes(opt) && opt.length>2) {idx=i; break;}
    }
  }
  if(idx>=0){
    const opt=optionText(q,idx+1).trim();
    return opt ? `${letters[idx]}) ${opt}` : letters[idx];
  }
  return raw;
};
const hintText=q=>pickField(q,['hint','question_hint','explanation_hint'],'Hint उपलब्ध नहीं है।');
const explanationText=q=>pickField(q,['explanation','solution','answer_explanation'],'');
const chapterText=q=>pickField(q,['chapter_name','chapter','chapter_title'],'');
const sceneImageText=(q,sn)=>{
  const qt=questionText(q);
  const a=answerText(q);
  if(sn===1)return {title:'आज का प्रश्न',body:qt};
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

function chapterNumber(q){
  return pickField(q,['chapter_number','chapter_no','chapter_num','chapterNumber'],'');
}

function formatClassLabel(q){
  const cls=questionClass(q);
  if(!cls)return '';
  const n=String(cls).replace(/[^0-9]/g,'');
  return n ? `कक्षा ${n}वीं` : `कक्षा ${cls}`;
}

function drawQuestionImage(q,sn){
  const W=1080,H=1920;
  const c=document.createElement('canvas'); c.width=W;c.height=H;
  const ctx=c.getContext('2d');
  ctx.clearRect(0,0,W,H);
  const {title,body}=sceneImageText(q,sn);

  // Scenes 1–4: SAME visual grid.
  // The header row, title row and content zone stay at identical positions.
  // Only the text size/wrapping changes when the actual content requires it.
  if(sn>=1 && sn<=4){
    ctx.save();
    ctx.textAlign='center';
    ctx.textBaseline='middle';

    // ---------- 1) COMMON HEADER ----------
    const metaY=185, metaH=76, gap=16;
    const meta=[
      {text:formatClassLabel(q),w:270,fill:'#e8f3ff',stroke:'#5aa7e8',textColor:'#145ea8'},
      {text:chapterNumber(q)?`अध्याय ${chapterNumber(q)}`:'अध्याय',w:220,fill:'#fff2cc',stroke:'#e7b84b',textColor:'#8a5a00'},
      {text:chapterText(q)||'अध्याय का नाम',w:500,fill:'#eaf7e8',stroke:'#75bd72',textColor:'#28702a'}
    ];

    let mx=(W-(meta.reduce((a,b)=>a+b.w,0)+gap*2))/2;
    for(const m of meta){
      ctx.fillStyle=m.fill;
      ctx.strokeStyle=m.stroke;
      ctx.lineWidth=3;
      ctx.beginPath();
      ctx.roundRect(mx,metaY,m.w,metaH,20);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle=m.textColor;
      ctx.font='800 27px "Noto Sans Devanagari", "Mangal", sans-serif';
      const mt=wrapCanvasText(ctx,m.text,m.w-24,34,2);
      let my=metaY+metaH/2-(mt.length-1)*17;
      for(const line of mt){
        ctx.fillText(line,mx+m.w/2,my);
        my+=34;
      }
      mx+=m.w+gap;
    }

    // ---------- 2) COMMON TITLE ----------
    const sceneTitle =
      sn===1 ? 'आज का प्रश्न' :
      sn===2 ? 'विकल्प ध्यान से देखिए' :
      sn===3 ? 'Hint' :
      'सही उत्तर';

    ctx.fillStyle='#1557a6';
    ctx.font='800 44px "Noto Sans Devanagari", "Mangal", sans-serif';
    ctx.fillText(sceneTitle,W/2,320);

    // ---------- 3) COMMON CONTENT ZONE ----------
    // Same card position for all four scenes.
    // This removes the unequal ellipse sizes visible in the current preview.
    const cardX=85;
    const cardY=385;
    const cardW=910;
    const cardH=315;
    const cardR=34;
    const innerW=cardW-90;

    let mainFont=48;
    let lineH=66;
    let lines=[];

    const buildLines=()=>{
      if(sn===1){
        ctx.font=`700 ${mainFont}px "Noto Sans Devanagari", "Mangal", sans-serif`;
        return wrapCanvasText(ctx,body,innerW,lineH,5);
      }

      if(sn===2){
        const opts=[1,2,3,4].map(n=>optionText(q,n)).filter(v=>String(v||'').trim());
        const labels=['A','B','C','D'];
        ctx.font=`700 ${mainFont}px "Noto Sans Devanagari", "Mangal", sans-serif`;
        return opts.slice(0,4).map((value,i)=>`${labels[i]}) ${value}`);
      }

      if(sn===3){
        ctx.font=`700 ${mainFont}px "Noto Sans Devanagari", "Mangal", sans-serif`;
        return wrapCanvasText(ctx,hintText(q),innerW,lineH,5);
      }

      ctx.font=`800 ${mainFont}px "Noto Sans Devanagari", "Mangal", sans-serif`;
      return wrapCanvasText(ctx,correctOptionDisplay(q),innerW,lineH,2);
    };

    lines=buildLines();

    // Fit text inside the SAME card without changing the card itself.
    while(mainFont>34){
      const maxTextH=sn===4 ? 150 : 245;
      const measuredH=lines.filter(Boolean).length*lineH;
      const tooWide=lines.some(t=>ctx.measureText(t).width>innerW);
      if(!tooWide && measuredH<=maxTextH)break;
      mainFont-=2;
      lines=buildLines();
    }

    // Answer explanation remains smaller and stays inside the same card.
    let explanationLines=[];
    if(sn===4 && explanationText(q)){
      ctx.font='500 27px "Noto Sans Devanagari", "Mangal", sans-serif';
      explanationLines=wrapCanvasText(ctx,explanationText(q),innerW,38,3);
    }

    // ---------- 4) COMMON BEAUTIFUL CARD ----------
    const styles={
      1:{fill:'rgba(35,118,210,0.12)',stroke:'#4b9be8',shadow:'rgba(35,118,210,0.28)'},
      2:{fill:'rgba(22,119,232,0.10)',stroke:'#4d9be8',shadow:'rgba(22,119,232,0.28)'},
      3:{fill:'rgba(245,180,0,0.12)',stroke:'#e7b84b',shadow:'rgba(245,180,0,0.28)'},
      4:{fill:'rgba(21,148,71,0.11)',stroke:'#54ad73',shadow:'rgba(21,148,71,0.28)'}
    };
    const st=styles[sn];

    ctx.save();
    ctx.shadowBlur=26;
    ctx.shadowColor=st.shadow;
    ctx.fillStyle=st.fill;
    ctx.strokeStyle=st.stroke;
    ctx.lineWidth=4;
    ctx.beginPath();
    ctx.roundRect(cardX,cardY,cardW,cardH,cardR);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Small inner accent line gives the card a finished border treatment.
    ctx.save();
    ctx.strokeStyle=st.stroke;
    ctx.globalAlpha=0.55;
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(cardX+42,cardY+18);
    ctx.lineTo(cardX+cardW-42,cardY+18);
    ctx.stroke();
    ctx.restore();

    // ---------- 5) CENTER TEXT IN THE SAME CONTENT AREA ----------
    const contentItems=[...lines];
    if(sn===4 && explanationLines.length){
      contentItems.push('');
      contentItems.push(...explanationLines);
    }

    const answerMainCount=lines.filter(Boolean).length;
    const normalLineH=lineH;
    const answerExpLineH=38;
    let totalH=0;

    contentItems.forEach((line,i)=>{
      if(line==='') totalH+=22;
      else totalH += (sn===4 && i>answerMainCount ? answerExpLineH : normalLineH);
    });

    // Keep the complete text visually centered in the same card.
    let yy=cardY+cardH/2-totalH/2;

    contentItems.forEach((line,index)=>{
      if(line===''){
        yy+=22;
        return;
      }

      if(sn===4 && index===0){
        ctx.fillStyle='#159447';
        ctx.font=`900 ${mainFont}px "Noto Sans Devanagari", "Mangal", sans-serif`;
      }else if(sn===4 && index>answerMainCount){
        ctx.fillStyle='#334155';
        ctx.font='500 27px "Noto Sans Devanagari", "Mangal", sans-serif';
      }else{
        ctx.fillStyle =
          sn===2 ? ['#1557a6','#159447','#d97706','#c026d3'][index%4] :
          sn===3 ? '#1557a6' :
          '#123f73';
        ctx.font=`700 ${mainFont}px "Noto Sans Devanagari", "Mangal", sans-serif`;
      }

      ctx.fillText(line,W/2,yy);
      yy += (sn===4 && index>answerMainCount ? answerExpLineH : normalLineH);
    });

    ctx.restore();
    return c;
  }

  // Scene 5 remains unchanged.
  ctx.save();
  ctx.clearRect(0,0,W,H);
  ctx.textAlign='center';
  ctx.textBaseline='middle';

  const centerX=W/2;

  const glow=ctx.createRadialGradient(centerX,590,70,centerX,590,500);
  glow.addColorStop(0,'rgba(16,52,105,0.22)');
  glow.addColorStop(0.55,'rgba(30,83,145,0.12)');
  glow.addColorStop(1,'rgba(30,83,145,0)');
  ctx.fillStyle=glow;
  ctx.beginPath();ctx.ellipse(centerX,590,455,460,0,0,Math.PI*2);ctx.fill();

  const drawDot=(x,y,r,color)=>{
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  };
  drawDot(170,285,13,'#e31e24');
  drawDot(910,300,11,'#f5b400');
  drawDot(135,840,10,'#1677d2');
  drawDot(945,830,13,'#159447');

  ctx.strokeStyle='#f5b400';
  ctx.lineWidth=8;
  ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(centerX-220,300);ctx.lineTo(centerX+220,300);ctx.stroke();

  ctx.font='900 48px "Noto Sans Devanagari", "Mangal", sans-serif';
  const y1=385;
  const parts1=[
    {t:'गणित को ',c:'#173f8f'},
    {t:'समझिए',c:'#e31e24'},
    {t:', सवालों को ',c:'#173f8f'},
    {t:'हल कीजिए',c:'#159447'}
  ];
  let total1=0; parts1.forEach(p=>{total1+=ctx.measureText(p.t).width;});
  let x1=centerX-total1/2;
  parts1.forEach(p=>{ctx.fillStyle=p.c;ctx.fillText(p.t,x1+ctx.measureText(p.t).width/2,y1);x1+=ctx.measureText(p.t).width;});

  ctx.font='700 38px "Noto Sans Devanagari", "Mangal", sans-serif';
  const y2=455;
  const parts2=[
    {t:'और ',c:'#334155'},
    {t:'सफलता',c:'#f08a00'},
    {t:' की ओर बढ़िए',c:'#334155'}
  ];
  let total2=0; parts2.forEach(p=>{total2+=ctx.measureText(p.t).width;});
  let x2=centerX-total2/2;
  parts2.forEach(p=>{ctx.fillStyle=p.c;ctx.fillText(p.t,x2+ctx.measureText(p.t).width/2,y2);x2+=ctx.measureText(p.t).width;});

  ctx.font='800 36px "Noto Sans Devanagari", "Mangal", sans-serif';
  const flowY=585;
  const flowParts=[
    {t:'सोचिए',c:'#e31e24'},{t:'  •  ',c:'#f5b400'},
    {t:'समझिए',c:'#1677d2'},{t:'  •  ',c:'#f5b400'},
    {t:'सीखिए',c:'#159447'}
  ];
  let flowW=0; flowParts.forEach(p=>{flowW+=ctx.measureText(p.t).width;});
  let fx=centerX-flowW/2;
  flowParts.forEach(p=>{ctx.fillStyle=p.c;ctx.fillText(p.t,fx+ctx.measureText(p.t).width/2,flowY);fx+=ctx.measureText(p.t).width;});

  ctx.font='800 42px "Noto Sans Devanagari", "Mangal", sans-serif';
  const ctaY=730;
  ctx.fillStyle='#173f8f';
  ctx.fillText('आज ही जुड़िए!',centerX,ctaY);

  ctx.font='700 30px "Noto Sans Devanagari", "Mangal", sans-serif';
  const actionY=815;
  const actionParts=[
    {t:'फॉलो करें',c:'#1677d2'},
    {t:'  •  ',c:'#f5b400'},
    {t:'सब्सक्राइब करें',c:'#e31e24'}
  ];
  let actionW=0; actionParts.forEach(p=>{actionW+=ctx.measureText(p.t).width;});
  let ax=centerX-actionW/2;
  actionParts.forEach(p=>{ctx.fillStyle=p.c;ctx.fillText(p.t,ax+ctx.measureText(p.t).width/2,actionY);ax+=ctx.measureText(p.t).width;});

  ctx.strokeStyle='rgba(245,180,0,0.85)';
  ctx.lineWidth=5;
  ctx.beginPath();ctx.arc(centerX,885,18,0.2,Math.PI*0.8);ctx.stroke();
  ctx.beginPath();ctx.arc(centerX,915,32,0.15,Math.PI*0.85);ctx.stroke();

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
  installQuickPreviewStyles();
  const finalBtn=document.getElementById('finalPreviewBtn');
  finalBtn.textContent='⚡ Quick Preview देखें';
  finalBtn.onclick=buildQuickPreview;
  const wrap=finalBtn.parentElement;
  let permanent=document.getElementById('permanentMasterBtn');
  if(!permanent){permanent=document.createElement('button');permanent.id='permanentMasterBtn';permanent.type='button';permanent.className='vsm-btn vsm-secondary';permanent.textContent='💾 Permanent MP4 बनाएं';wrap.insertBefore(permanent,document.getElementById('downloadFinalBtn'));}
  [...wrap.querySelectorAll('button')].forEach(b=>{if(b!==permanent && /Permanent MP4/.test(b.textContent||''))b.remove();});
  permanent.onclick=buildFinalPreview;
  document.getElementById('downloadFinalBtn').onclick=downloadFinal;
  document.getElementById('quickDownloadBtn').onclick=downloadQuickPreview;
  document.getElementById('publishFinalBtn').onclick=publishFinal;
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
  picker.innerHTML='<span class="qtm-empty">Supabase से आज का centrally selected question पढ़ा जा रहा है…</span>';

  try{
    // Daily question selection is centrally stored in Supabase.
    // localStorage is intentionally NOT used as the source of truth.
    const {data:selection,error:selectionError}=await sb.rpc(
      'get_or_create_video_daily_questions',
      {p_count:count}
    );
    if(selectionError)throw selectionError;

    const selectedRows=Array.isArray(selection)?selection:[];
    if(!selectedRows.length)throw new Error('आज के लिए कोई centrally selected question नहीं मिला।');

    const ids=selectedRows
      .sort((a,b)=>Number(a.slot_no||0)-Number(b.slot_no||0))
      .map(r=>String(r.question_id));

    const {data:rows,error}=await sb.from('questions').select('*').in('id',ids);
    if(error)throw error;
    const byId=new Map((Array.isArray(rows)?rows:[]).map(q=>[questionId(q),q]));
    questions=ids.map(id=>byId.get(String(id))).filter(Boolean).slice(0,count);

    if(!questions.length)throw new Error('Selected question database में नहीं मिला।');

    picker.innerHTML=questions.map((q,i)=>
      `<button type="button" class="vsm-btn vsm-secondary" data-qidx="${i}">Question ${i+1} — ${esc(questionId(q))}</button>`
    ).join('');

    picker.querySelectorAll('button').forEach(b=>{
      b.addEventListener('click',()=>openQuestion(Number(b.dataset.qidx)));
    });

    status.textContent=`✅ आज के centrally selected ${questions.length} question(s) loaded — सभी devices पर यही selection रहेगा।`;
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
  const qid=questionId(selectedQuestion), sid=safeId(qid);
  document.getElementById('sceneGrid').innerHTML=scenes.map(s=>{const master=s.n===1;return `<div class="qtm-scene" id="qscene-${sid}-${s.n}">
  <h4>Scene ${s.n} — ${esc(s.name)}</h4><div class="qtm-scene-body">
  <div class="qtm-media-box"><div class="qtm-media-label">🎬 ${master?'MASTER VIDEO PREVIEW':'MASTER VIDEO (Scene 1)'}</div>
  <div id="qpreview-${sid}-${s.n}"><div class="qtm-empty">${master?'अभी 45-sec Master Video save नहीं है':'Scene 1 का 45-sec Master Video यहाँ preview होगा।'}</div></div>
  ${master?`<input class="qtm-file" id="file-${sid}-1" type="file" accept="video/mp4,video/*"><div class="qtm-upload"><button class="vsm-btn vsm-primary" type="button" onclick="document.getElementById('file-${sid}-1').click()">⬆️ Upload / Replace 45-sec Master Video</button></div>`:''}</div>
  <div class="qtm-media-box"><div class="qtm-media-label">🖼️ SCENE IMAGE</div><div class="qtm-image-wrap" id="qimage-${sid}-${s.n}"><div class="qtm-image-empty">अभी image generate नहीं हुई</div></div>
  <div class="qtm-image-actions"><button class="vsm-mini" type="button" onclick="generateSceneImage(${s.n})">✨ Generate Image</button><button class="vsm-mini" type="button" onclick="generateSceneImage(${s.n})">🔄 Regenerate</button></div>
  <div class="qtm-image-status" id="qimagestatus-${sid}-${s.n}">Image अभी save नहीं है</div></div></div>
  <div class="qtm-status" id="qstatus-${sid}-${s.n}">Checking…</div></div>`;}).join('');
  const mf=document.getElementById(`file-${sid}-1`); if(mf)mf.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)saveQuestionScene(qid,1,f);e.target.value='';});
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
    await loadSavedFinalVideo();
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
  const sid=safeId(qid), preview=document.getElementById(`qpreview-${sid}-${sn}`), status=document.getElementById(`qstatus-${sid}-${sn}`); if(!preview||!status)return;
  const master=videoRowsByScene[1]||null; if(!master){preview.innerHTML='<div class="qtm-empty">Scene 1 का 45-sec Master Video अभी save नहीं है</div>';status.textContent='⚪ पहले Scene 1 में Master Video upload करें';return;}
  const url=publicUrl(master.storage_path); preview.innerHTML=`<video controls preload="metadata" src="${url}"></video><div class="qtm-actions"><button class="vsm-mini" type="button" onclick="window.open('${url}','_blank')">▶ Preview</button></div>`;
  status.innerHTML=sn===1?'<span class="qtm-badge qtm-saved">✅ 45-sec Master Video Saved</span>':'<span class="qtm-badge qtm-saved">✅ Scene 1 Master — shared preview</span>';
}
async function loadQuestionImages(){
  const qid=questionId(selectedQuestion), sid=safeId(qid);
  imageRowsByScene={};
  layerRowsByScene={};

  // Images are independent of video rows. Never let a layer-table problem
  // prevent the five saved images from loading.
  try{
    const {data,error}=await sb.from('video_question_scene_images')
      .select('id,question_id,scene_number,file_name,storage_path,is_active,image_width,image_height')
      .eq('question_id',qid)
      .order('scene_number',{ascending:true});
    if(error)throw error;
    const imageRows=Array.isArray(data)?data:[];
    scenes.forEach(s=>{
      const row=imageRows.find(r=>Number(r.scene_number)===s.n)||null;
      imageRowsByScene[s.n]=row;
      renderSceneImage(qid,s.n,row);
    });
  }catch(e){
    console.error('Question images load failed:',e);
    scenes.forEach(s=>{
      imageRowsByScene[s.n]=null;
      renderSceneImage(qid,s.n,null);
      const el=document.getElementById(`qimagestatus-${sid}-${s.n}`);
      if(el)el.textContent=`⚠️ Image record load नहीं हुआ: ${e.message||e}`;
    });
  }

  // Layer settings are optional. If unavailable, use Scene 1/default position.
  try{
    const {data:layers,error:layerErr}=await sb.from('video_question_scene_layers')
      .select('*').eq('question_id',qid).order('scene_number',{ascending:true});
    if(layerErr)throw layerErr;
    const savedLayers=Array.isArray(layers)?layers:[];
    const scene1Defaults=savedLayers.find(r=>Number(r.scene_number)===1)||null;
    scenes.forEach(s=>{
      const own=savedLayers.find(r=>Number(r.scene_number)===s.n)||null;
      const inherited=(s.n>1 && !own && scene1Defaults)
        ? {...scene1Defaults,scene_number:s.n,__inherited:true} : own;
      layerRowsByScene[s.n]=inherited;
      renderLayerEditor(qid,s.n,imageRowsByScene[s.n],videoRowsByScene[s.n],inherited);
    });
  }catch(layerErr){
    console.warn('Layer settings unavailable; using defaults:',layerErr);
    scenes.forEach(s=>{
      layerRowsByScene[s.n]=null;
      renderLayerEditor(qid,s.n,imageRowsByScene[s.n],videoRowsByScene[s.n],null);
    });
  }
}

function renderSceneImage(qid,sn,row){
  const sid=safeId(qid), box=document.getElementById(`qimage-${sid}-${sn}`), st=document.getElementById(`qimagestatus-${sid}-${sn}`);
  if(!box||!st)return;
  if(!row){
    box.innerHTML='<div class="qtm-image-empty">अभी image generate नहीं हुई</div>';
    st.textContent='Image अभी save नहीं है';
    return;
  }
  const url=imagePublicUrl(row.storage_path);
  box.innerHTML=`<img id="sceneimg-${sid}-${sn}" src="${url}" alt="Scene ${sn} image" loading="eager" style="max-width:100%;height:auto;display:block"><div class="qtm-image-actions"><button class="vsm-mini" type="button" onclick="window.open('${url}','_blank')">▶ Preview</button></div>`;
  const img=document.getElementById(`sceneimg-${sid}-${sn}`);
  img?.addEventListener('load',()=>{st.innerHTML='<span class="qtm-badge qtm-saved">✅ Image Permanently Saved</span>';});
  img?.addEventListener('error',()=>{st.textContent='❌ Saved image load नहीं हुई — Storage URL check करें'; console.error('Image URL failed:',url);});
  if(img?.complete && img.naturalWidth>0)st.innerHTML='<span class="qtm-badge qtm-saved">✅ Image Permanently Saved</span>';
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
  const masterVideo=videoRowsByScene?.[1]||null;
  const videoUrl=masterVideo?.storage_path?publicUrl(masterVideo.storage_path):'';
  const imageUrl=imagePublicUrl(imageRow.storage_path);
  editor.innerHTML=`
    <div class="qtm-media-label">🎛️ IMAGE LAYER — Scene ${sn}</div>
    <div class="qtm-layer-stage" id="layerstage-${sid}-${sn}">
      ${videoUrl?`<video autoplay loop muted playsinline preload="auto" src="${videoUrl}"></video>`:'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:12px">Video पहले upload करें</div>'}
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
    const {error:dbErr}=await sb.from('video_question_scene_images')
      .upsert({...payload,created_at:old?.created_at||new Date().toISOString()},{onConflict:'question_id,scene_number'});
    if(dbErr)throw dbErr;
    imageRowsByScene[sn]=payload;
    renderSceneImage(qid,sn,payload);
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
      // Never remove an uploaded master file on a database error. The new file
      // is left in Storage so a failed DB write cannot destroy the previously
      // working master. It can be cleaned up manually later if needed.
      throw dbErr;
    }

    // IMPORTANT: Never delete the previously saved master video.
    // The 45-sec master is permanent for this question. If the user deliberately
    // uses Replace later, the new upload gets a new storage path while the old
    // file remains safely stored instead of disappearing.
    // This keeps the same master video available today, tomorrow and later.
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


async function makeVideoPoster(videoUrl){
  return await new Promise((resolve)=>{
    const v=document.createElement('video');
    v.crossOrigin='anonymous';
    v.muted=true;
    v.playsInline=true;
    v.preload='auto';
    let done=false;
    const finish=(value)=>{if(done)return;done=true;try{v.pause();}catch(_){}
      v.removeAttribute('src');v.load();resolve(value);};
    const draw=()=>{
      try{
        const w=v.videoWidth||1080,h=v.videoHeight||1920;
        const c=document.createElement('canvas');
        c.width=w;c.height=h;
        const c2=c.getContext('2d');
        if(!c2) return finish('');
        c2.drawImage(v,0,0,w,h);
        finish(c.toDataURL('image/jpeg',0.88));
      }catch(_){finish('');}
    };
    v.addEventListener('loadeddata',()=>{
      if(v.readyState>=2){
        try{v.currentTime=0;}catch(_){draw();}
      }
    },{once:true});
    v.addEventListener('seeked',draw,{once:true});
    v.addEventListener('error',()=>finish(''),{once:true});
    v.src=videoUrl;
    v.load();
    setTimeout(()=>finish(''),12000);
  });
}

async function loadSavedFinalVideo(){
  const qid=questionId(selectedQuestion);
  const preview=document.getElementById('finalPreview');
  const downloadBtn=document.getElementById('downloadFinalBtn');
  if(!qid||!preview||!downloadBtn)return false;
  const path=`video-scenes/questions/${encodeURIComponent(String(qid))}/final/question-${encodeURIComponent(String(qid))}-final.mp4`;
  const url=publicUrl(path);
  try{
    const res=await fetch(`${url}&check=${Date.now()}`,{method:'HEAD',cache:'no-store'});
    if(!res.ok)return false;
    if(finalObjectUrl)URL.revokeObjectURL(finalObjectUrl);
    finalObjectUrl=url;
    finalBlob=null;
    const savedPreviewUrl=`${url}&v=${Date.now()}`;
    const savedPoster=await makeVideoPoster(savedPreviewUrl);
    preview.innerHTML=`<video controls playsinline preload="auto"${savedPoster?` poster="${savedPoster}"`:''} src="${savedPreviewUrl}"></video>`;
    downloadBtn.disabled=false;
    downloadBtn.dataset.single='1';
    downloadBtn.dataset.url=url;
    document.getElementById('publishFinalBtn').disabled=false;
    document.getElementById('finalStatus').textContent='✅ यह Question का saved 45-sec Final MP4 है — दोबारा conversion की जरूरत नहीं।';
    return true;
  }catch(e){
    console.warn('Saved final MP4 check failed:',e);
    return false;
  }
}

function updateFinalAvailability(){
  document.getElementById('finalPreviewBtn').disabled=!selectedQuestion;
}

function resetFinalUI(){
  document.getElementById('finalPreview').innerHTML='<div class="qtm-empty">Final Preview अभी नहीं बना है।</div>';
  document.getElementById('downloadFinalBtn').disabled=true;
  document.getElementById('publishFinalBtn').disabled=true;
  const qbtn=document.getElementById('quickDownloadBtn'); if(qbtn) qbtn.disabled=true;
  document.getElementById('finalStatus').textContent='जितने Scene upload होंगे, Final Preview में उतने ही क्रम से जुड़ेंगे।';
}

function installQuickPreviewStyles(){if(document.getElementById('gs-quick-preview-style'))return;const st=document.createElement('style');st.id='gs-quick-preview-style';st.textContent=`.gs-quick-stage{position:relative;width:min(100%,540px);aspect-ratio:9/16;margin:0 auto;background:#000;overflow:hidden;border-radius:10px}.gs-quick-stage video{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}.gs-quick-stage img{position:absolute;display:none;max-width:none;pointer-events:none}.gs-quick-note{font-size:12px;color:#64748b;text-align:center;margin-top:7px}`;document.head.appendChild(st);}
// Master video is one complete Canva-made video. The 1-second gaps already contain
// the user's own indicator images inside that master video. We DO NOT add or load
// any separate transition image. Only the five generated Scene images are overlaid
// during their exact 8-second windows. Scene 5 continues to the real end of the master.
const VIDEO_TIMELINE={
  1:[0,8],
  2:[9,17],
  3:[18,26],
  4:[27,35],
  5:[36,null]
};
function timelineWindows(){return [VIDEO_TIMELINE[1],VIDEO_TIMELINE[2],VIDEO_TIMELINE[3],VIDEO_TIMELINE[4],VIDEO_TIMELINE[5]];}
async function buildQuickPreview(){installQuickPreviewStyles();const status=document.getElementById('finalStatus'),preview=document.getElementById('finalPreview'),btn=document.getElementById('finalPreviewBtn');btn.disabled=true;status.textContent='⏳ Master Video और 5 images browser में जोड़ी जा रही हैं…';try{const master=videoRowsByScene[1];if(!master?.storage_path)throw new Error('Scene 1 का 45-sec Master Video upload नहीं है।');const missing=[1,2,3,4,5].filter(n=>!imageRowsByScene[n]?.storage_path);if(missing.length)throw new Error(`Scene ${missing.join(', ')} की image अभी saved नहीं है।`);const quickMasterUrl=publicUrl(master.storage_path);
// IMPORTANT: Quick Preview must appear immediately. Do not generate a poster/frame or run any conversion here.
    // Complete scenes use 0.25-sec Fade In/Fade Out in the preview. The 1-sec indicator gaps remain
    // untouched so the master video's own indicator images stay visible between scenes.
preview.innerHTML=`<div class="gs-quick-stage"><video id="gsQuickVideo" controls playsinline preload="metadata" src="${quickMasterUrl}"></video><div id="gsQuickOverlay"></div></div><div class="gs-quick-note">⚡ Quick Preview: एक ही पूरा Master Video चल रहा है। Canva में रखी आपकी 1-sec indicator images Master Video के अंदर ही रहेंगी; केवल 5 generated Scene images अपने 8-sec हिस्से में दिखाई देंगी।</div>`;const video=document.getElementById('gsQuickVideo'),overlay=document.getElementById('gsQuickOverlay'),stage=video.closest('.gs-quick-stage'),windows=timelineWindows();overlay.innerHTML=[1,2,3,4,5].map(n=>`<img id="gsqimg${n}" src="${imagePublicUrl(imageRowsByScene[n].storage_path)}" alt="Scene ${n}">`).join('');const fadeOpacity=(t,start,end)=>{
  const FADE=0.25;
  if(t<start || (end!==null && t>=end))return 0;
  if(t<start+FADE)return Math.max(0,Math.min(1,(t-start)/FADE));
  if(end!==null && t>end-FADE)return Math.max(0,Math.min(1,(end-t)/FADE));
  return 1;
};
const sync=()=>{
  const t=Number(video.currentTime)||0;
  const duration=Number(video.duration)||45;
  // Complete scene fade: master video + generated image fade together.
  // IMPORTANT: the 1-second indicator gaps are part of the Canva master video,
  // so keep the whole stage fully visible during those gaps.
  let sceneOpacity=1;
  for(const [a,b] of windows){
    const end=b===null?duration:b;
    if(t>=a && t<end){
      sceneOpacity=fadeOpacity(t,a,end);
      break;
    }
  }
  if(stage)stage.style.opacity=String(sceneOpacity);
  for(let n=1;n<=5;n++){
    const img=document.getElementById(`gsqimg${n}`),row=layerRowsByScene[n]||layerRowsByScene[1]||{x:0,y:0,width:1080,height:1920},[a,b]=windows[n-1];
    const active=t>=a && (b===null || t<b);
    img.style.left=`${(Number(row.x)||0)/1080*100}%`;
    img.style.top=`${(Number(row.y)||0)/1920*100}%`;
    img.style.width=`${(Number(row.width)||1080)/1080*100}%`;
    img.style.height=`${(Number(row.height)||1920)/1920*100}%`;
    img.style.opacity=active?'1':'0';
    img.style.display=active?'block':'none';
  }
};video.addEventListener('loadedmetadata',()=>{sync();const qbtn=document.getElementById('quickDownloadBtn');if(qbtn)qbtn.disabled=false;status.textContent='✅ Quick Preview तैयार है — Play दबाकर पाँचों images देखें। अब ⬇️ Quick Preview Download करें दबाएँ।'},{once:true});video.addEventListener('timeupdate',sync);video.addEventListener('seeking',sync);video.addEventListener('error',()=>{const qbtn=document.getElementById('quickDownloadBtn');if(qbtn)qbtn.disabled=true;status.textContent='❌ Master Video browser में load नहीं हुआ।'},{once:true});}catch(e){console.error('Quick Preview:',e);preview.innerHTML=`<div class="qtm-empty">❌ ${esc(e.message||String(e))}</div>`;status.textContent='❌ Quick Preview failed';}finally{btn.disabled=false;}}


async function downloadQuickPreview(){
  const btn=document.getElementById('quickDownloadBtn');
  const status=document.getElementById('finalStatus');
  if(!btn||btn.disabled)return;
  btn.disabled=true;
  let canvas=null,ctx=null,video=null,audioCtx=null,masterUrl=null,raf=0,recorder=null;
  const imageUrls=[];
  try{
    const master=videoRowsByScene[1];
    if(!master?.storage_path)throw new Error('Scene 1 का 45-sec Master Video upload नहीं है।');
    const missing=[1,2,3,4,5].filter(n=>!imageRowsByScene[n]?.storage_path);
    if(missing.length)throw new Error(`Scene ${missing.join(', ')} की image अभी saved नहीं है।`);

    const W=1080,H=1920,FPS=30;
    status.textContent='⏳ Quick Preview को रिकॉर्ड किया जा रहा है…';
    const fetchBlob=async(url,label)=>{
      const res=await fetch(url,{mode:'cors',cache:'no-store'});
      if(!res.ok)throw new Error(`${label} load failed (${res.status})`);
      return await res.blob();
    };
    const masterBlob=await fetchBlob(publicUrl(master.storage_path),'Master Video');
    masterUrl=URL.createObjectURL(masterBlob);

    const images={};
    for(let n=1;n<=5;n++){
      const b=await fetchBlob(imagePublicUrl(imageRowsByScene[n].storage_path),`Scene ${n} image`);
      const u=URL.createObjectURL(b); imageUrls.push(u);
      const im=new Image(); im.src=u;
      await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(new Error(`Scene ${n} image decode नहीं हुई।`));});
      images[n]=im;
    }

    video=document.createElement('video');
    video.playsInline=true; video.preload='auto'; video.muted=false; video.src=masterUrl;
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('Master Video browser में load नहीं हुआ।'));video.load();});

    canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H;
    ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('Canvas उपलब्ध नहीं है।');
    const windows=timelineWindows();
    const draw=()=>{
      if(!video||video.readyState<2)return;
      ctx.drawImage(video,0,0,W,H);
      const t=Number(video.currentTime)||0;
      for(let n=1;n<=5;n++){
        const [start,end]=windows[n-1];
        if(t>=start&&(end===null||t<end)){
          const row=layerRowsByScene[n]||layerRowsByScene[1]||{x:0,y:0,width:W,height:H};
          const x=Math.max(0,Math.min(W,Math.round(Number(row.x)||0)));
          const y=Math.max(0,Math.min(H,Math.round(Number(row.y)||0)));
          const w=Math.max(1,Math.min(W-x,Math.round(Number(row.width)||W)));
          const h=Math.max(1,Math.min(H-y,Math.round(Number(row.height)||H)));
          ctx.drawImage(images[n],x,y,w,h);
        }
      }
    };

    const candidates=[
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4',
      'video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'
    ];
    const mimeType=candidates.find(t=>window.MediaRecorder?.isTypeSupported(t));
    if(!mimeType)throw new Error('इस browser में video recording support उपलब्ध नहीं है।');

    const stream=canvas.captureStream(FPS);
    try{
      audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      const source=audioCtx.createMediaElementSource(video);
      const dest=audioCtx.createMediaStreamDestination();
      source.connect(dest);
      // Keep audio audible while recording; the recorded track comes from dest.
      source.connect(audioCtx.destination);
      dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
      await audioCtx.resume();
    }catch(e){console.warn('Audio capture unavailable',e);}

    const chunks=[];
    const options={videoBitsPerSecond:6000000,audioBitsPerSecond:128000,mimeType};
    recorder=new MediaRecorder(stream,options);
    recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
    const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('Recording failed'));});

    video.currentTime=0;
    await new Promise(resolve=>{
      if(video.readyState>=3)resolve(); else video.addEventListener('canplay',resolve,{once:true});
    });
    draw();
    if(audioCtx?.state==='suspended')await audioCtx.resume();
    await video.play();
    recorder.start(250);
    const loop=()=>{draw();if(recorder?.state==='recording')raf=requestAnimationFrame(loop);};
    raf=requestAnimationFrame(loop);

    await new Promise(resolve=>{
      let done=false;
      const finish=()=>{if(done)return;done=true;resolve();};
      video.addEventListener('ended',finish,{once:true});
      setTimeout(finish,Math.ceil(Math.max(45,Number(video.duration)||45)*1000)+1000);
    });
    cancelAnimationFrame(raf); draw();
    if(recorder.state!=='inactive')recorder.stop();
    await stopped;
    video.pause();

    const ext=mimeType.startsWith('video/mp4')?'mp4':'webm';
    const blob=new Blob(chunks,{type:mimeType});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`question-${questionId(selectedQuestion)}-quick-preview.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    status.textContent=`✅ पूरा Quick Preview डाउनलोड हो गया (${ext.toUpperCase()}) — images और voice दोनों शामिल हैं।`;
  }catch(e){
    console.error('Quick Preview download failed:',e);
    status.textContent=`❌ Quick Preview download failed: ${e.message||e}`;
  }finally{
    cancelAnimationFrame(raf);
    try{if(video)video.pause();}catch(_){ }
    try{if(audioCtx)await audioCtx.close();}catch(_){ }
    if(masterUrl)URL.revokeObjectURL(masterUrl);
    imageUrls.forEach(u=>URL.revokeObjectURL(u));
    btn.disabled=false;
  }
}

async function buildFinalPreview(){
  const status=document.getElementById('finalStatus');
  const preview=document.getElementById('finalPreview');
  const btn=document.getElementById('finalPreviewBtn');
  btn.disabled=true;
  status.textContent='⏳ 45-sec Master Video और saved Scene images तैयार हो रही हैं…';

  let ffmpeg=null;
  try{
    const master=videoRowsByScene[1];
    if(!master?.storage_path)throw new Error('Scene 1 का 45-sec Master Video upload नहीं है।');
    const missing=[1,2,3,4,5].filter(n=>!imageRowsByScene[n]?.storage_path);
    if(missing.length)throw new Error(`Scene ${missing.join(', ')} की image अभी saved नहीं है।`);
    if(!window.FFmpegWASM||!window.FFmpegUtil)throw new Error('Video compiler library load नहीं हुई। कृपया Ctrl+F5 करके फिर प्रयास करें।');

    const {FFmpeg}=window.FFmpegWASM;
    const {fetchFile}=window.FFmpegUtil;
    ffmpeg=new FFmpeg();
    ffmpeg.on('log',({message})=>{
      if(message && /error|failed|invalid|unable/i.test(message))console.warn('FFmpeg:',message);
    });
    ffmpeg.on('progress',({progress})=>{
      const pct=Math.max(0,Math.min(99,Math.round((Number(progress)||0)*100)));
      if(pct>0)status.textContent=`⏳ 45-sec Final MP4 render हो रहा है… ${pct}%`;
    });

    const base='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
    const [coreURL,wasmURL,workerURL]=await Promise.all([
      FFmpegUtil.toBlobURL(`${base}/ffmpeg-core.js`,'text/javascript'),
      FFmpegUtil.toBlobURL(`${base}/ffmpeg-core.wasm`,'application/wasm'),
      FFmpegUtil.toBlobURL(`${base}/ffmpeg-core.worker.js`,'text/javascript')
    ]);
    await Promise.race([
      ffmpeg.load({coreURL,wasmURL,workerURL,classWorkerURL:new URL('assets/js/ffmpeg-class-worker.js?v=20261004-45sec',location.href).href}),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('MP4 converter 90 सेकंड में शुरू नहीं हुआ।')),90000))
    ]);

    // IMPORTANT: Do NOT use MediaRecorder/canvas recording here.
    // That path can create a short video track while audio continues for 45+ sec.
    // FFmpeg now works directly from the original uploaded 45-sec master video.
    // The original audio stream is copied exactly; there is no -shortest and no
    // artificial 45-sec cut. Complete Scene uses 0.25-sec Fade In/Fade Out.
    await ffmpeg.writeFile('master.mp4',await fetchFile(publicUrl(master.storage_path)));
    for(let n=1;n<=5;n++){
      await ffmpeg.writeFile(`scene-${n}.png`,await fetchFile(imagePublicUrl(imageRowsByScene[n].storage_path)));
    }

    const filters=[
      '[0:v]scale=1080:1920,setsar=1,split=2[base][gapbase]',
      // Keep the generated image fully opaque. The FADE is applied AFTER the image
      // and master video are composited, so the COMPLETE SCENE fades together.
      '[1:v]scale=1080:1920,format=rgba[s1]',
      '[2:v]scale=1080:1920,format=rgba[s2]',
      '[3:v]scale=1080:1920,format=rgba[s3]',
      '[4:v]scale=1080:1920,format=rgba[s4]',
      '[5:v]scale=1080:1920,format=rgba[s5]',
      '[base][s1]overlay=0:0:enable=\'between(t,0,8)\'[v1]',
      '[v1][s2]overlay=0:0:enable=\'between(t,9,17)\'[v2]',
      '[v2][s3]overlay=0:0:enable=\'between(t,18,26)\'[v3]',
      '[v3][s4]overlay=0:0:enable=\'between(t,27,35)\'[v4]',
      '[v4][s5]overlay=0:0:enable=\'gte(t,36)\'[v5]',
      // Fast 0.25-sec fade-in/out for the COMPLETE scene composition.
      // Then restore the untouched Canva master ONLY in the 1-sec indicator gaps,
      // so the middle indicator images remain fully visible.
      '[v5]fade=t=in:st=0:d=0.25,fade=t=out:st=7.75:d=0.25,fade=t=in:st=9:d=0.25,fade=t=out:st=16.75:d=0.25,fade=t=in:st=18:d=0.25,fade=t=out:st=25.75:d=0.25,fade=t=in:st=27:d=0.25,fade=t=out:st=34.75:d=0.25,fade=t=in:st=36:d=0.25,fade=t=out:st=44.75:d=0.25[vfaded]',
      '[vfaded][gapbase]overlay=0:0:eof_action=repeat:shortest=0:enable=\'gte(t,8)*lt(t,9)+gte(t,17)*lt(t,18)+gte(t,26)*lt(t,27)+gte(t,35)*lt(t,36)\'[vout]'
    ].join(';');

    status.textContent='⏳ Original 45-sec video पर 5 Scene images overlay हो रही हैं…';
    await Promise.race([
      ffmpeg.exec([
        '-i','master.mp4',
        '-loop','1','-i','scene-1.png',
        '-loop','1','-i','scene-2.png',
        '-loop','1','-i','scene-3.png',
        '-loop','1','-i','scene-4.png',
        '-loop','1','-i','scene-5.png',
        '-filter_complex',filters,
        '-map','[vout]',
        '-map','0:a?',
        '-c:v','mpeg4',
        '-q:v','5',
        '-pix_fmt','yuv420p',
        '-c:a','copy',
        '-movflags','+faststart',
        '-y','final.mp4'
      ]),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('45-sec Final MP4 render 5 मिनट में पूरा नहीं हुआ।')),300000))
    ]);

    const data=await ffmpeg.readFile('final.mp4');
    const blob=new Blob([data.buffer],{type:'video/mp4'});
    const qid=questionId(selectedQuestion);
    const finalPath=`video-scenes/questions/${encodeURIComponent(String(qid))}/final/question-${encodeURIComponent(String(qid))}-final.mp4`;

    const {error:saveErr}=await sb.storage.from(BUCKET).upload(finalPath,blob,{contentType:'video/mp4',upsert:true,cacheControl:'31536000'});
    if(saveErr)throw new Error(`Final MP4 save failed: ${saveErr.message||saveErr}`);

    const verifyUrl=publicUrl(finalPath);
    const verifyRes=await fetch(`${verifyUrl}&verify=${Date.now()}`,{method:'HEAD',cache:'no-store'});
    if(!verifyRes.ok)throw new Error(`Final MP4 save verify failed (${verifyRes.status})`);

    finalBlob=blob;
    if(finalObjectUrl)URL.revokeObjectURL(finalObjectUrl);
    finalObjectUrl=URL.createObjectURL(blob);
    const savedPreviewUrl=`${verifyUrl}&stream=${Date.now()}`;
    preview.innerHTML=`<video controls playsinline preload="metadata" src="${savedPreviewUrl}"></video>`;
    const downloadBtn=document.getElementById('downloadFinalBtn');
    downloadBtn.disabled=false;
    downloadBtn.dataset.url=verifyUrl;
    downloadBtn.dataset.single='1';
    document.getElementById('publishFinalBtn').disabled=false;
    status.textContent='✅ पूरा 45-sec Final MP4 तैयार और Supabase में सुरक्षित है।';

    try{ffmpeg.terminate();}catch(_){ }
  }catch(e){
    console.error('Final MP4 build failed:',e);
    status.textContent=`❌ Final MP4 failed: ${e.message||e}`;
    alert(`Final MP4 नहीं बन सका:\n${e.message||e}`);
    try{if(ffmpeg)ffmpeg.terminate();}catch(_){ }
  }finally{
    btn.disabled=false;
  }
}

async function downloadFinal(){
  const btn=document.getElementById('downloadFinalBtn');
  const qid=questionId(selectedQuestion);
  const name=`question-${qid}-final.mp4`;
  btn.disabled=true;
  const oldText=btn.textContent;
  try{
    let url=btn.dataset.url||'';
    if(!url){
      const finalPath=`video-scenes/questions/${encodeURIComponent(String(qid))}/final/question-${encodeURIComponent(String(qid))}-final.mp4`;
      url=publicUrl(finalPath);
      const check=await fetch(`${url}&check=${Date.now()}`,{method:'HEAD',cache:'no-store'});
      if(!check.ok)throw new Error('इस Question का saved Final MP4 अभी उपलब्ध नहीं है। पहले एक बार Generate करें।');
    }

    // Do NOT fetch the whole 45-sec file into a browser Blob on PC.
    // Supabase serves the saved MP4 directly, allowing Chrome/Edge to use normal
    // HTTP range requests and download the complete file without RAM truncation.
    const separator=url.includes('?')?'&':'?';
    const downloadUrl=`${url}${separator}download=${encodeURIComponent(name)}&v=${Date.now()}`;
    const a=document.createElement('a');
    a.href=downloadUrl;
    a.download=name;
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    document.getElementById('finalStatus').textContent='✅ Saved 45-sec MP4 download शुरू हो गया। PC पर भी original saved file ही download होगी।';
  }catch(e){
    console.error('Final download failed:',e);
    document.getElementById('finalStatus').textContent=`❌ Download failed: ${e.message||e}`;
  }finally{
    btn.textContent=oldText;
    btn.disabled=false;
  }
}

function publishFinal(){
  alert('Final video तैयार है। Publishing button रखा गया है; Facebook / YouTube / WhatsApp Channel publishing को अगले चरण में मौजूदा publishing workflow से जोड़ा जाएगा।');
}

window.addEventListener('DOMContentLoaded',init);
})();