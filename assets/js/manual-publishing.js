(() => {
'use strict';
const $ = id => document.getElementById(id);
const DRAFT_KEY = 'gs_manual_publishing_drafts_v1';
const cfg = window.GS_SUPABASE_CONFIG || {};
let sb = window.supabaseClient || null;
const platformLabels = {facebook:'Facebook Page',instagram:'Instagram',youtube:'YouTube',whatsapp:'Ganit Setu WhatsApp Channel'};
function status(msg){ $('manualStatus').textContent=msg; }
function selectedPlatforms(){ return [...document.querySelectorAll('.platform-choice:checked')].map(x=>x.value); }
function readDrafts(){ try{return JSON.parse(localStorage.getItem(DRAFT_KEY)||'[]')}catch{return []} }
function writeDrafts(rows){ localStorage.setItem(DRAFT_KEY,JSON.stringify(rows)); renderDrafts(); }
function formData(){
 const file=$('media').files[0]||null;
 return {id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),platforms:selectedPlatforms(),contentType:$('contentType').value,title:$('title').value.trim(),caption:$('caption').value.trim(),hashtags:$('hashtags').value.trim(),publishMode:$('publishMode').value,scheduledAt:$('scheduledAt').value||null,fileName:file?.name||'',createdAt:new Date().toISOString(),status:'draft'};
}
function validate(d){
 if(!d.platforms.length)throw Error('कम से कम एक Platform चुनें।');
 if(!d.title&&!d.caption&&!d.fileName)throw Error('पहले Title, Caption या Media File में से कुछ तो भरें।');
 if(['image','video','pdf'].includes(d.contentType)&&!d.fileName)throw Error('इस Content Type के लिए Media File चुनें।');
 if(d.publishMode==='schedule'&&!d.scheduledAt)throw Error('Schedule के लिए तारीख और समय चुनें।');
 if(d.scheduledAt && new Date(d.scheduledAt)<=new Date())throw Error('Scheduled समय भविष्य का होना चाहिए।');
 if(d.contentType==='pdf' && d.platforms.some(p=>p==='instagram'||p==='youtube'))throw Error('PDF सीधे Instagram या YouTube पर इस manual form से समर्थित नहीं है। PDF के लिए Facebook/WhatsApp में से चुनें।');
 if(d.contentType==='post' && d.platforms.includes('instagram'))throw Error('Instagram पर text-only post समर्थित नहीं है। Instagram हटाएँ या Image/Video चुनें।');
 if(d.contentType==='video' && d.platforms.includes('youtube') && !d.fileName)throw Error('YouTube के लिए video file जरूरी है।');
}
function renderDrafts(){
 const box=$('draftList'), rows=readDrafts();
 if(!rows.length){box.innerHTML='<p>अभी कोई manual draft सेव नहीं है।</p>';return;}
 box.innerHTML=rows.slice().reverse().map(d=>{
  const ps=Array.isArray(d.platforms)?d.platforms:(d.platform?[d.platform]:[]);
  return `<div class="draft-row"><b>${esc(d.title||d.fileName||'Untitled')}</b><div>${esc(ps.map(p=>platformLabels[p]||p).join(', '))} · ${esc(d.contentType)} · ${esc(d.status||'draft')} · ${esc(new Date(d.createdAt).toLocaleString())}</div><div>${esc(d.caption||'')}</div><button type="button" data-load="${esc(d.id)}">Edit / Load</button><button type="button" data-delete="${esc(d.id)}">Remove Draft</button></div>`;
 }).join('');
 box.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{if(confirm('यह manual draft हटाएँ? इससे प्रकाशित पोस्ट या Storage media delete नहीं होगी।'))writeDrafts(readDrafts().filter(x=>x.id!==b.dataset.delete));});
 box.querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>{
  const d=readDrafts().find(x=>x.id===b.dataset.load);if(!d)return;
  const ps=Array.isArray(d.platforms)?d.platforms:(d.platform?[d.platform]:[]);
  document.querySelectorAll('.platform-choice').forEach(x=>x.checked=ps.includes(x.value));
  $('contentType').value=d.contentType;$('title').value=d.title||'';$('caption').value=d.caption||'';$('hashtags').value=d.hashtags||'';
  $('publishMode').value='draft';$('scheduledAt').value='';$('scheduledAt').disabled=true;
  status('Draft form में लोड हो गया। Media file सुरक्षा कारणों से दोबारा चुननी होगी।');window.scrollTo({top:0,behavior:'smooth'});
 });
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function getClient(){
 if(sb)return sb;
 if(window.supabaseClient)return sb=window.supabaseClient;
 if(window.supabase?.createClient&&cfg.url&&cfg.publishableKey)return sb=window.supabase.createClient(cfg.url,cfg.publishableKey);
 return null;
}
$('publishingMode').addEventListener('change',e=>{if(e.target.value)location.href=e.target.value;});
$('publishMode').addEventListener('change',e=>{$('scheduledAt').disabled=e.target.value!=='schedule';});
$('saveDraft').addEventListener('click',()=>{try{const d=formData();validate(d);const rows=readDrafts();rows.push(d);writeDrafts(rows);status('Draft सेव हो गया। यह अभी केवल इसी browser में सेव है।');}catch(e){status('❌ '+e.message);}});
$('submitContent').addEventListener('click',async()=>{
 let d;try{d=formData();validate(d);}catch(e){status('❌ '+e.message);return;}
 if(d.publishMode==='draft'){const rows=readDrafts();rows.push(d);writeDrafts(rows);status('Draft सेव हो गया।');return;}
 const client=getClient();
 if(!client){status('❌ Supabase client/config उपलब्ध नहीं है। Content को publish queue में नहीं भेजा गया।');return;}
 const file=$('media').files[0]||null;
 const btn=$('submitContent');btn.disabled=true;
 try{
   let mediaUrl='';
   if(file){
     const {data:sessionData}=await client.auth.getSession();
     if(!sessionData?.session){throw Error('पहले Admin Panel में Supabase session से login करें।');}
     const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
     const path=`manual/${Date.now()}-${safeName}`;
     const {data:up,error:upErr}=await client.storage.from('content-media').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
     if(upErr)throw upErr;
     const {data:urlData}=client.storage.from('content-media').getPublicUrl(up.path);
     mediaUrl=urlData?.publicUrl||'';
     if(!mediaUrl)throw Error('Media public URL नहीं मिली। Storage policy/config जाँचें।');
   }
   const rows=d.platforms.map(platform=>({
     platform,
     content_type:d.contentType,
     title:d.title||d.fileName||'Ganit Setu Manual Content',
     caption:[d.caption,d.hashtags].filter(Boolean).join('\n\n'),
     description:d.caption,
     hashtags:d.hashtags,
     media_url:mediaUrl||null,
     publish_mode:d.publishMode==='schedule'?'scheduled':'manual',
     scheduled_at:d.publishMode==='schedule'?new Date(d.scheduledAt).toISOString():null,
     status:'ready'
   }));
   const {error}=await client.from('social_publish_queue').insert(rows);
   if(error)throw error;
   d.status='queued';d.mediaUrl=mediaUrl;
   const saved=readDrafts();saved.push(d);writeDrafts(saved);
   status(`✅ ${rows.length} platform item(s) मौजूदा social_publish_queue में सेव हुए: ${d.platforms.map(p=>platformLabels[p]).join(', ')}। वास्तविक publish होना आपके backend queue processor और हर platform के handler पर निर्भर है। WhatsApp Channel के लिए मौजूदा manual-share workflow लागू रहेगा।`);
 }catch(e){status('❌ Queue/Upload नहीं हो सका: '+(e.message||String(e))+'\\nकृपया Supabase table, Storage policy और backend handler जाँचें। कोई automatic retry या delete नहीं किया गया।');}
 finally{btn.disabled=false;}
});
renderDrafts();
})();