(function(){
'use strict';
const cfg=window.GS_SUPABASE_CONFIG||{};
console.log('SUPABASE CONFIG:', cfg.url, cfg.publishableKey);
const sb=window.supabaseClient||(window.supabase&&window.supabase.createClient(cfg.url,cfg.publishableKey));
const $=id=>document.getElementById(id);
const bucket='content-media';
let tab='texts', items={images:[],videos:[],texts:[]}, textRows=[];
function activeMediaItems(){return tab==='combined'?[...items.images,...items.videos]:(items[tab]||[])}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(s){$('msStatus').textContent=s}
function kind(path){
 const p=String(path||'').toLowerCase();
 if(p.startsWith('content-packages/images/'))return 'images';
 if(p.startsWith('content-packages/youtube/'))return /\.(mp4|mov|webm|m4v)$/i.test(p)?'videos':'images';
 if(/^video-scenes\/questions\/[^/]+\/final\/question-[^/]+-final\.mp4$/i.test(path))return 'videos';
 return null;
}
async function sessionToken(){const {data,error}=await sb.auth.getSession();if(error)throw error;return data.session?.access_token||''}
async function load(){
 if(!sb){status('Supabase client उपलब्ध नहीं है।');return}
 status('Supabase Storage से temporary media लोड हो रही है…');
 items={images:[],videos:[]};
 try{
  async function walk(prefix){
   const {data,error}=await sb.storage.from(bucket).list(prefix,{limit:100,sortBy:{column:'created_at',order:'desc'}});
   if(error)throw error;
   const found=[];
   for(const x of data||[]){
    const path=prefix?prefix+'/'+x.name:x.name;
    if(x.id===null && !x.metadata){ // folder entry
      if(['content-packages','video-scenes'].includes(path))found.push(...await walk(path));
      else if(path==='content-packages/images'||path==='content-packages/youtube'||path==='video-scenes/questions')found.push(...await walk(path));
      else if(path.startsWith('video-scenes/questions/'))found.push(...await walk(path));
      continue;
    }
    if(kind(path))found.push({name:x.name,path,created_at:x.created_at||x.updated_at||'',size:Number(x.metadata?.size||0),type:kind(path)});
   }
   return found;
  }
  // Explicitly walk only approved temporary folders. Do not scan/delete templates or logos.
  const [images,videos,youtube]=await Promise.all([
   sb.storage.from(bucket).list('content-packages/images',{limit:100,sortBy:{column:'created_at',order:'desc'}}),
   sb.storage.from(bucket).list('video-scenes/questions',{limit:100,sortBy:{column:'created_at',order:'desc'}}),
   sb.storage.from(bucket).list('content-packages/youtube',{limit:100,sortBy:{column:'created_at',order:'desc'}})
  ]);
  for(const res of [images,videos,youtube])if(res.error)throw res.error;
 for (const x of images.data || []) {
  const name = String(x.name || '');
  // Supabase may return this internal placeholder for an empty folder.
  // It is not a real image and must never appear in the count or delete list.
  if (!name || name === '.emptyFolderPlaceholder' || name.startsWith('.')) continue;
  if (x.id == null && !x.metadata) continue;
  if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(name)) continue;

  items.images.push({
    name,
    path: 'content-packages/images/' + name,
    created_at: x.created_at || x.updated_at || '',
    size: Number(x.metadata?.size || 0),
    type: 'images'
  });
}
  for(const x of youtube.data||[])if(x.id!==null || x.metadata){const path='content-packages/youtube/'+x.name;const type=kind(path);if(type)items[type].push({name:x.name,path,created_at:x.created_at||x.updated_at||'',size:Number(x.metadata?.size||0),type});}
  // Only inspect immediate folders under video-scenes/questions, then final folder of each question.
  for(const q of videos.data||[]){
   if(q.id!==null || q.metadata)continue;
   const qPath='video-scenes/questions/'+q.name;
   const {data:dirs,error:e}=await sb.storage.from(bucket).list(qPath,{limit:100});
   if(e)throw e;
   if(!(dirs||[]).some(d=>d.name==='final'&&d.id===null))continue;
   const {data:files,error:fe}=await sb.storage.from(bucket).list(qPath+'/final',{limit:100});
   if(fe)throw fe;
   for(const f of files||[]){const path=qPath+'/final/'+f.name;if(kind(path))items.videos.push({name:f.name,path,created_at:f.created_at||f.updated_at||'',size:Number(f.metadata?.size||0),type:'videos'});}
  }
  $('imageCount').textContent=items.images.length;$('videoCount').textContent=items.videos.length;$('totalCount').textContent=items.images.length+items.videos.length;
  render();status('स्टेटस अपडेट हो गया।');
 }catch(e){console.error(e);status('लोड नहीं हो पाया: '+(e.message||e)+' — Storage policies/लॉगिन जाँचें।')}
}
function render(){
 document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===tab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
 const textPanel=$('textPostsPanel'); if(textPanel) textPanel.hidden=tab!=='texts';
 const list=activeMediaItems();
 if(tab==='texts'){ $('mediaList').hidden=true; $('bulkActions').hidden=true; $('msStatus').hidden=true; loadTextPosts(); return; }
 $('msStatus').hidden=false; $('mediaList').hidden=false; $('bulkActions').hidden=false;
 if(!list.length){$('mediaList').innerHTML=tab==='combined'?'<p>अभी Combined Media में कोई temporary image या video नहीं मिली।</p>':'<p>इस श्रेणी में कोई पहचानी गई temporary media file नहीं मिली।</p>';bindBulk();return}
 $('mediaList').innerHTML=list.map((x,i)=>`<div class="ms-row"><label><input type="checkbox" data-select-media="${i}"> चुनें</label><div style="flex:1"><b>${x.type==='images'?'🖼️':'🎬'} ${esc(x.name)}</b><div class="ms-path">${esc(x.path)}</div><div class="ms-muted">${x.size?`${(x.size/1024/1024).toFixed(2)} MB · `:''}${esc(x.created_at||'समय उपलब्ध नहीं')}</div></div><button class="ms-btn" data-publish="${i}">✅ Mark as Published</button></div>`).join('');
 $('mediaList').querySelectorAll('[data-publish]').forEach(b=>b.addEventListener('click',()=>mark(activeMediaItems()[Number(b.dataset.publish)],b)));
 bindBulk();
}
function bindBulk(){
 const all=$('selectAllMedia'); if(all)all.onchange=()=>document.querySelectorAll('[data-select-media]').forEach(c=>c.checked=all.checked);
 const bulk=$('bulkMarkPublished'); if(bulk)bulk.onclick=async()=>{
   const ids=[...document.querySelectorAll('[data-select-media]:checked')].map(c=>Number(c.dataset.selectMedia));
   if(!ids.length){status('पहले कम से कम एक फाइल चुनें।');return}
   if(!confirm(`${ids.length} चुनी गई फाइलों को Mark as Published करके डिलीट करने की पुष्टि करें?`))return;
   for(const i of ids){const item=activeMediaItems()[i];if(item)await mark(item,bulk);}
 };
}
async function mark(item,button){
 if(!item)return;
 const ok=window.confirm(`क्या आपने इस सामग्री के लिए publishing का काम पूरा कर लिया है?\n\n${item.name}\n\nपुष्टि के बाद temporary file Supabase से हटाने का अनुरोध होगा।`);
 if(!ok)return;
 button.disabled=true;button.textContent='Deleting…';status('Supabase से deletion की पुष्टि ली जा रही है…');
 try{
  const token=await sessionToken();if(!token)throw new Error('पहले Admin account से login करें।');
  const r=await fetch(cfg.url+'/functions/v1/cleanup-temporary-media',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'apikey':cfg.publishableKey},body:JSON.stringify({action:'delete_after_publish',storage_path:item.path,publish_confirmed:true})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||data.ok!==true||data.deleted!==true)throw new Error(data.error||'फाइल delete होने की पुष्टि नहीं मिली।');
  status('✅ Temporary media delete हो गई।');await load();
 }catch(e){console.error(e);status('❌ Delete नहीं हुआ: '+(e.message||e));button.disabled=false;button.textContent='✅ Mark as Published';}
}

function textStatus(s){const el=$('textPostsStatus');if(el)el.textContent=s;}
function formatTime(s){if(!s)return 'समय उपलब्ध नहीं';try{return new Date(s).toLocaleString('hi-IN')}catch(_){return s}}
async function loadTextPosts(){
 if(!sb){textStatus('Supabase client उपलब्ध नहीं है।');return}
 const panel=$('textPostsPanel'); if(panel && panel.hidden && tab!=='texts') return;
 textStatus('Supabase से पोस्ट रिकॉर्ड लोड हो रहे हैं…');
 try{
  const {data:sessionData,error:sessionError}=await sb.auth.getSession();
  if(sessionError)throw sessionError;
  if(!sessionData.session)throw new Error('पहले Admin account से login करें।');
  const {data,error}=await sb.from('social_publish_queue').select('id,question_id,platform,content_type,title,status,publish_mode,created_at,external_post_id').order('created_at',{ascending:false}).limit(1000);
  if(error)throw error;
  textRows=data||[];
  const {count:logCount,error:logError}=await sb.from('social_publish_logs').select('id',{count:'exact',head:true});
  if(logError)throw logError;
  if($('textQueueCount'))$('textQueueCount').textContent=String(textRows.length);
  if($('textLogCount'))$('textLogCount').textContent=String(logCount??'—');
  const list=$('textPostsList');
  if(!list)return;
  if(!textRows.length){list.innerHTML='<div class="ms-card">कोई पोस्ट रिकॉर्ड नहीं मिला।</div>';textStatus('लोड पूरा हुआ।');return;}
  list.innerHTML=textRows.map((r,i)=>`<div class="ms-row ms-card" style="align-items:flex-start"><label><input type="checkbox" data-select-text value="${esc(r.id)}"> चुनें</label><div style="flex:1;min-width:180px"><b>${esc(r.title||'(शीर्षक नहीं)')}</b><div class="ms-muted">${esc(r.platform)} · ${esc(r.content_type)} · ${esc(r.status)} · ${esc(r.publish_mode)}</div><div class="ms-path">Question ID: ${esc(r.question_id||'नहीं')}<br>Created: ${esc(formatTime(r.created_at))}<br>External Post ID: ${esc(r.external_post_id||'नहीं')}</div></div><button class="ms-btn" data-delete-text="${esc(r.id)}" type="button" style="background:#b91c1c">🗑️ Delete Record</button></div>`).join('');
  list.querySelectorAll('[data-delete-text]').forEach(b=>b.addEventListener('click',()=>deleteTextRows([b.dataset.deleteText],false,b)));
  textStatus(`${textRows.length} पोस्ट रिकॉर्ड लोड हुए। यह सूची Text, Image और Video सभी content_type के रिकॉर्ड दिखाती है।`);
 }catch(e){console.error(e);textStatus('❌ पोस्ट रिकॉर्ड लोड नहीं हुए: '+(e.message||e)+'। Supabase login/RLS policies जाँचें।');}
}
async function deleteTextRows(ids,all,button){
 const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return;
 const message=all
  ?`पुष्टि करें: ${unique.length} Queue रिकॉर्ड और उनसे जुड़े Publish Logs हटाए जाएँगे। यह केवल Supabase रिकॉर्ड हटाएगा; प्लेटफॉर्म पर प्रकाशित पोस्ट, questions, daily_content_questions, content_plans और Storage files सुरक्षित रहेंगी। यह वापस नहीं किया जा सकता।`
  :`पुष्टि करें: ${unique.length} चुने हुए Queue रिकॉर्ड और उनसे जुड़े Publish Logs हटाए जाएँगे। प्लेटफॉर्म पर प्रकाशित पोस्ट नहीं हटेगी।`;
 if(!window.confirm(message))return;
 const controls=[$('deleteSelectedTextPosts'),$('deleteAllTextPosts'),button].filter(Boolean);controls.forEach(b=>b.disabled=true);textStatus('पहले संबंधित Publish Logs हटाए जा रहे हैं…');
 try{
  const tokenData=await sb.auth.getSession();if(tokenData.error)throw tokenData.error;if(!tokenData.data.session)throw new Error('पहले Admin account से login करें।');
  // Delete logs first to avoid leaving orphaned publish history for removed queue rows.
  const logDeleteQuery = all ? sb.from('social_publish_logs').delete().not('id','is',null) : sb.from('social_publish_logs').delete().in('queue_id',unique);
  const {error:logDeleteError}=await logDeleteQuery;
  if(logDeleteError)throw new Error('Publish Logs नहीं हटे: '+logDeleteError.message);
  textStatus('Queue रिकॉर्ड हटाए जा रहे हैं…');
  const {error:queueDeleteError}=await sb.from('social_publish_queue').delete().in('id',unique);
  if(queueDeleteError)throw new Error('Queue रिकॉर्ड नहीं हटे: '+queueDeleteError.message);
  textStatus(`✅ ${unique.length} Queue रिकॉर्ड और उनसे जुड़े Logs हट गए।`);
  if($('selectAllTextPosts'))$('selectAllTextPosts').checked=false;
  await loadTextPosts();
  textStatus(`✅ ${unique.length} Queue रिकॉर्ड और उनसे जुड़े Logs हट गए।`);
 }catch(e){console.error(e);textStatus('❌ डिलीट पूरा नहीं हुआ: '+(e.message||e)+'। यदि Logs पहले हट गए हों और Queue नहीं हटी हो, तो स्थिति Refresh करके जाँचें। Supabase RLS delete policies भी जाँचें।');}
 finally{controls.forEach(b=>b.disabled=false);}
}

document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;render()}));
const tx=$('textPostsRefresh'); if(tx)tx.addEventListener('click',loadTextPosts);
const selectText=$('selectAllTextPosts'); if(selectText)selectText.addEventListener('change',()=>document.querySelectorAll('[data-select-text]').forEach(c=>c.checked=selectText.checked));
const deleteSelected=$('deleteSelectedTextPosts'); if(deleteSelected)deleteSelected.addEventListener('click',async()=>{const ids=[...document.querySelectorAll('[data-select-text]:checked')].map(c=>c.value);if(!ids.length){textStatus('पहले कम से कम एक रिकॉर्ड चुनें।');return}await deleteTextRows(ids,false)});
const deleteAll=$('deleteAllTextPosts'); if(deleteAll)deleteAll.addEventListener('click',async()=>{if(!textRows.length){textStatus('हटाने के लिए कोई Queue रिकॉर्ड नहीं है।');return}await deleteTextRows(textRows.map(x=>x.id),true)});
loadTextPosts();
$('refreshMedia').addEventListener('click',load);
load();
})();
