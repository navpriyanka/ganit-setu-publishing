/* Ganit Setu — Content Production Setup
   Flexible platform/type selection, question mapping, scheduling and ZIP readiness.
   Master Prompt is intentionally NOT generated here; it is a later step.
*/
(function(){
'use strict';

const STORAGE_KEY='ganitsetu_content_production_setup_v1';
const TYPE_LABELS={
 text_post:'Text Post', image_post:'Image Post', carousel:'Carousel', reel:'Reel / Video', story:'Story', poll:'Poll',
 feed_image:'Feed Image', text_graphic:'Text Graphic', video:'Video', short:'Short', thumbnail:'Thumbnail',
 community_image:'Community Image', community_text:'Community Text', community_poll:'Community Poll', community_quiz:'Community Quiz',
 text:'Text Update', image:'Image', link:'Link / CTA', image_ad:'Image Ad', video_ad:'Video Ad', text_ad:'Text Ad', story_ad:'Story Ad'
};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let plan=[]; let mappings=[];


function bindZipUpload(){
  const input=document.getElementById('contentZip'); if(!input)return;
  input.addEventListener('change',async()=>{
    const box=document.getElementById('zipValidationResult');
    const file=input.files?.[0];
    if(!file){return;}
    if(!file.name.toLowerCase().endsWith('.zip')){if(box)box.innerHTML='<span class="zip-bad">❌ केवल .zip file चुनें।</span>';return;}
    if(box)box.innerHTML='<span>⏳ ZIP structure check हो रही है...</span>';
    try{
      if(!window.JSZip) throw new Error('ZIP library अभी उपलब्ध नहीं है। Page refresh करके फिर try करें।');
      const zip=await JSZip.loadAsync(file);
      const names=Object.keys(zip.files);
      const has=path=>names.some(n=>n.endsWith(path));
      const manifest=has('publish.json')||has('metadata.json');
      const images=names.filter(n=>/\/images\/|images\//i.test(n)&&/\.(png|jpg|jpeg|webp)$/i.test(n)).length;
      const texts=names.filter(n=>/\/content\/|content\//i.test(n)&&/\.(txt|json|md)$/i.test(n)).length;
      const videos=names.filter(n=>/\.(mp4|webm|mov)$/i.test(n)).length;
      const missing=[];
      if(!manifest)missing.push('publish.json/metadata.json');
      if(!images)missing.push('images');
      if(!texts)missing.push('content text');
      const ok=missing.length===0;
      box.innerHTML=`<div class="${ok?'zip-good':'zip-warn'}"><b>${ok?'✅ ZIP structure valid':'⚠️ ZIP received — कुछ files missing'}</b><br>Images: ${images} • Text files: ${texts} • Videos: ${videos}<br>${missing.length?'Missing: '+missing.join(', '):'Package आगे processing के लिए तैयार है।'}<br><small>Note: missing asset होने पर दूसरे available items को block नहीं किया जाएगा।</small></div>`;
      window.ganitSetuLastZip={name:file.name,size:file.size,files:names,valid:ok};
    }catch(e){if(box)box.innerHTML='<span class="zip-bad">❌ ZIP पढ़ी नहीं जा सकी: '+esc(e.message)+'</span>';}
  });
}

function init(){
  bindChecks();
  bindZipUpload();
  document.getElementById('clearProductionSelection')?.addEventListener('click',clearAll);
  document.getElementById('saveProductionSetup')?.addEventListener('click',save);
  document.getElementById('exportProductionSetup')?.addEventListener('click',exportJson);
  document.getElementById('defaultScheduleTime')?.addEventListener('change',renderSchedule);
  window.addEventListener('ganitsetu:plan-ready',e=>{ plan=e.detail||[]; renderQuestions(); renderSchedule(); });
  if(window.ganitSetuContentPlan){ plan=window.ganitSetuContentPlan; renderQuestions(); }
  loadSaved();
  updateSummary();
}
function selectedTypes(){
  return [...document.querySelectorAll('#productionSetup input[data-platform][data-content]:checked')]
    .map(x=>({platform:x.dataset.platform,content_type:x.dataset.content,label:TYPE_LABELS[x.dataset.content]||x.dataset.content}));
}
function bindChecks(){
  document.querySelectorAll('#productionSetup input[data-platform][data-content]').forEach(cb=>{
    cb.addEventListener('change',()=>{ syncMappings(); renderMapping(); renderSchedule(); updateSummary(); });
  });
}
function uniqueQuestions(cls){
  const rows=plan.filter(r=>String(r.class_level)===String(cls));
  const map=new Map();
  rows.forEach(r=>{ const id=String(r.question_id); if(!map.has(id)) map.set(id,{id, class_level:r.class_level, chapter_number:r.chapter_number, chapter_name:r.chapter_name, suggested:r.content_type}); });
  return [...map.values()];
}
function renderQuestions(){
  const box=document.getElementById('questionMappingList'); if(!box)return;
  if(!plan.length){box.innerHTML='<div class="empty-box">पहले Content Plan generate करें।</div>';return;}
  const classes=[...new Set(plan.map(x=>Number(x.class_level)))].sort();
  box.innerHTML=classes.map(cls=>{
    const qs=uniqueQuestions(cls);
    return `<div class="question-pool-card"><div class="pool-head"><strong>📘 Class ${cls}</strong><span>${qs.length} Questions</span></div><div class="question-choice-grid">
      ${qs.map((q,i)=>`<label class="question-choice"><input type="checkbox" class="q-select" data-qid="${esc(q.id)}"><span><b>Q${esc(q.id)}</b><small>Chapter ${esc(q.chapter_number)} — ${esc(q.chapter_name||'')}</small></span><em>Suggested: ${esc(q.suggested||'—')}</em></label>`).join('')}
    </div></div>`;
  }).join('');
  box.querySelectorAll('.q-select').forEach(cb=>cb.addEventListener('change',()=>{syncMappings();renderMapping();renderSchedule();updateSummary();}));
}
function syncMappings(){
  const selectedQ=[...document.querySelectorAll('.q-select:checked')].map(x=>String(x.dataset.qid));
  const types=selectedTypes();
  // Preserve existing mappings where possible.
  const next=[];
  mappings.forEach(m=>{if(selectedQ.includes(String(m.question_id)) && types.some(t=>t.platform===m.platform&&t.content_type===m.content_type))next.push(m);});
  types.forEach(t=>{
    const existingCount=next.filter(m=>m.platform===t.platform&&m.content_type===t.content_type).length;
    // one mapping row per selected question; user can later remove/reassign.
    selectedQ.forEach(qid=>{
      if(!next.some(m=>m.platform===t.platform&&m.content_type===t.content_type&&String(m.question_id)===qid)){
        const q=plan.find(r=>String(r.question_id)===qid);
        next.push({id:crypto.randomUUID?.()||String(Date.now()+Math.random()),platform:t.platform,content_type:t.content_type,label:t.label,question_id:qid,class_level:q?.class_level||'',schedule_date:q?.content_date||document.getElementById('startDate')?.value||'',schedule_time:document.getElementById('defaultScheduleTime')?.value||'09:00',status:'Draft'});
      }
    });
  });
  mappings=next;
}
function renderMapping(){
  const box=document.getElementById('questionMappingList'); if(!box)return;
  const oldPools=box.querySelectorAll('.question-pool-card');
  // Keep question pool cards, append/update mapping area.
  let area=box.querySelector('.mapping-area');
  if(!area){area=document.createElement('div');area.className='mapping-area';box.appendChild(area);}
  if(!mappings.length){area.innerHTML='<div class="empty-box">ऊपर Question select करें और platform content type tick करें।</div>';return;}
  area.innerHTML=`<div class="mapping-area-head"><strong>🔗 Selected Content Mapping</strong><span>${mappings.length} items</span></div>`+
    mappings.map((m,i)=>{
      const qs=uniqueQuestions(m.class_level);
      return `<div class="mapping-row" data-map-id="${esc(m.id)}">
        <span class="map-index">${i+1}</span><span class="map-platform">${esc(m.platform)}</span><span class="map-type">${esc(m.label)}</span>
        <select class="map-question" data-map-id="${esc(m.id)}">${qs.map(q=>`<option value="${esc(q.id)}" ${String(q.id)===String(m.question_id)?'selected':''}>Q${esc(q.id)} — Ch.${esc(q.chapter_number)} ${esc(q.chapter_name||'')}</option>`).join('')}</select>
        <button type="button" class="remove-map" data-map-id="${esc(m.id)}">✕</button>
      </div>`;
    }).join('');
  area.querySelectorAll('.map-question').forEach(sel=>sel.addEventListener('change',()=>{const m=mappings.find(x=>String(x.id)===String(sel.dataset.mapId));if(m){m.question_id=sel.value;const q=plan.find(r=>String(r.question_id)===String(sel.value));m.class_level=q?.class_level||m.class_level;m.schedule_date=q?.content_date||m.schedule_date;}renderSchedule();updateSummary();}));
  area.querySelectorAll('.remove-map').forEach(btn=>btn.addEventListener('click',()=>{mappings=mappings.filter(x=>String(x.id)!==String(btn.dataset.mapId));renderMapping();renderSchedule();updateSummary();}));
}
function renderSchedule(){
  const box=document.getElementById('scheduleList');if(!box)return;
  if(!mappings.length){box.innerHTML='<div class="empty-box">Selected content यहाँ schedule होगा।</div>';return;}
  box.innerHTML=mappings.map((m,i)=>`<div class="schedule-row">
    <div><b>${i+1}. ${esc(m.platform)} • ${esc(m.label)}</b><small>Q${esc(m.question_id)} • Class ${esc(m.class_level)}</small></div>
    <input type="date" class="sched-date" data-id="${esc(m.id)}" value="${esc(m.schedule_date||'')}">
    <input type="time" class="sched-time" data-id="${esc(m.id)}" value="${esc(m.schedule_time||'09:00')}">
    <select class="sched-status" data-id="${esc(m.id)}"><option>Draft</option><option>Scheduled</option><option>Published</option><option>Failed</option><option>Missing</option><option>Skipped</option></select>
  </div>`).join('');
  box.querySelectorAll('.sched-date').forEach(el=>el.addEventListener('change',()=>{const m=mappings.find(x=>String(x.id)===String(el.dataset.id));if(m)m.schedule_date=el.value;}));
  box.querySelectorAll('.sched-time').forEach(el=>el.addEventListener('change',()=>{const m=mappings.find(x=>String(x.id)===String(el.dataset.id));if(m)m.schedule_time=el.value;}));
  box.querySelectorAll('.sched-status').forEach(el=>{const m=mappings.find(x=>String(x.id)===String(el.dataset.id));if(m)el.value=m.status||'Draft';el.addEventListener('change',()=>{const m=mappings.find(x=>String(x.id)===String(el.dataset.id));if(m)m.status=el.value;});});
}
function updateSummary(){
  const qs=new Set(mappings.map(m=>String(m.question_id)));
  const img=mappings.filter(m=>/image|story|thumbnail|carousel|graphic|ad/.test(m.content_type)).length;
  const vid=mappings.filter(m=>/reel|video|short/.test(m.content_type)).length;
  document.getElementById('selectedQuestionCount').textContent=qs.size;
  document.getElementById('selectedContentCount').textContent=mappings.length;
  document.getElementById('selectedImageCount').textContent=img;
  document.getElementById('selectedVideoCount').textContent=vid;
  const badge=document.getElementById('setupStatusBadge');
  if(badge)badge.textContent=plan.length?`${qs.size} Questions • ${mappings.length} Content`:'PLAN पहले GENERATE करें';
}
function clearAll(){
  document.querySelectorAll('#productionSetup input[data-platform][data-content],#productionSetup .q-select').forEach(x=>x.checked=false);
  mappings=[];renderMapping();renderSchedule();updateSummary();
}
function payload(){
  return {version:1,generated_at:new Date().toISOString(),plan_id:plan[0]?.plan_id||null,platforms:selectedTypes(),mappings:mappings.map(m=>({...m,schedule_at:m.schedule_date&&m.schedule_time?`${m.schedule_date}T${m.schedule_time}:00`:null})),rules:{only_selected_generate:true,partial_publish:true,missing_assets_do_not_block_other_items:true,whatsapp_channel_manual:true,master_prompt_pending:true}};
}
function save(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(payload()));
  const st=document.getElementById('productionSaveStatus');if(st){st.textContent='✅ Setup saved';setTimeout(()=>st.textContent='',1800);}
}
function exportJson(){
  const blob=new Blob([JSON.stringify(payload(),null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`GanitSetu_ContentSetup_${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);
}
function loadSaved(){
  try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(!x)return;
    const set=new Set((x.platforms||[]).map(t=>`${t.platform}|${t.content_type}`));
    document.querySelectorAll('#productionSetup input[data-platform][data-content]').forEach(cb=>cb.checked=set.has(`${cb.dataset.platform}|${cb.dataset.content}`));
    mappings=x.mappings||[];renderMapping();renderSchedule();
  }catch(e){console.warn('Saved content setup not loaded',e);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();