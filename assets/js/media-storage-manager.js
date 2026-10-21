(function(){
'use strict';
const cfg=window.GS_SUPABASE_CONFIG||{};
console.log('SUPABASE CONFIG:', cfg.url, cfg.publishableKey);
const sb=window.supabaseClient||(window.supabase&&window.supabase.createClient(cfg.url,cfg.publishableKey));
const $=id=>document.getElementById(id);
const bucket='content-media';
let tab='images', items={images:[],videos:[],texts:[]};
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
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 const textPanel=$('textPostsPanel'); if(textPanel) textPanel.hidden=tab!=='texts';
 const list=items[tab]||[];
 if(tab==='texts'){ $('mediaList').hidden=true; $('bulkActions').hidden=true; return; }
 $('mediaList').hidden=false; $('bulkActions').hidden=false;
 if(!list.length){$('mediaList').innerHTML='<p>इस श्रेणी में कोई पहचानी गई temporary media file नहीं मिली।</p>';bindBulk();return}
 $('mediaList').innerHTML=list.map((x,i)=>`<div class="ms-row"><label><input type="checkbox" data-select-media="${i}"> चुनें</label><div style="flex:1"><b>${tab==='images'?'🖼️':'🎬'} ${esc(x.name)}</b><div class="ms-path">${esc(x.path)}</div><div class="ms-muted">${x.size?`${(x.size/1024/1024).toFixed(2)} MB · `:''}${esc(x.created_at||'समय उपलब्ध नहीं')}</div></div><button class="ms-btn" data-publish="${i}">✅ Mark as Published</button></div>`).join('');
 $('mediaList').querySelectorAll('[data-publish]').forEach(b=>b.addEventListener('click',()=>mark(items[tab][Number(b.dataset.publish)],b)));
 bindBulk();
}
function bindBulk(){
 const all=$('selectAllMedia'); if(all)all.onchange=()=>document.querySelectorAll('[data-select-media]').forEach(c=>c.checked=all.checked);
 const bulk=$('bulkMarkPublished'); if(bulk)bulk.onclick=async()=>{
   const ids=[...document.querySelectorAll('[data-select-media]:checked')].map(c=>Number(c.dataset.selectMedia));
   if(!ids.length){status('पहले कम से कम एक फाइल चुनें।');return}
   if(!confirm(`${ids.length} चुनी गई फाइलों को Mark as Published करके डिलीट करने की पुष्टि करें?`))return;
   for(const i of ids){const item=items[tab][i];if(item)await mark(item,bulk);}
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
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;render()}));
const tx=$('textPostsRefresh'); if(tx)tx.addEventListener('click',()=>{const el=$('textPostsStatus');if(el)el.textContent='Text-post table/schema अभी configure/test होना बाकी है; कोई अनुमानित संख्या नहीं दिखाई गई।'});
$('refreshMedia').addEventListener('click',load);
load();
})();
