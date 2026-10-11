// GANIT SETU ADMIN DASHBOARD - LIVE SUPABASE DATA
const SUPABASE_URL = "https://cbgojvnbkosdehvwerth.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// Share the existing Admin auth client with pages that need the same session.
window.supabaseClient = supabaseClient;

function setText(id, value){ const el=document.getElementById(id); if(el) el.textContent=value; }
function fmt(n){ return Number(n||0).toLocaleString('en-IN'); }

async function adminLogin(){
 const id=document.getElementById('adminId')?.value.trim();
 const pass=document.getElementById('password')?.value || '';
 if(!id||!pass){alert('कृपया Admin email और password दर्ज करें।');return;}
 try{
  const {data,error}=await supabaseClient.auth.signInWithPassword({email:id,password:pass});
  if(error) throw error;
  if(!data?.session) throw new Error('Secure session नहीं बन सका।');
  location.href='dashboard.html';
 }catch(error){
  console.error('Admin login error:',error);
  alert('Secure Admin Login असफल हुआ।\n\nकृपया वही email/password इस्तेमाल करें जो Supabase Authentication में अधिकृत Admin user के लिए है।\n\nError: '+(error.message||'Unknown error'));
 }
}

async function adminLogout(){
 try{ await supabaseClient.auth.signOut(); }catch(error){ console.error(error); }
 location.href='index.html';
}

async function loadDashboard(){
 try{
  const [studentsRes, teachersRes, testsRes, attemptsRes] = await Promise.all([
   supabaseClient.from('students').select('id,class_level,school_dise_code,created_at,full_name', {count:'exact'}),
   supabaseClient.from('teachers').select('id,created_at,full_name', {count:'exact'}),
   supabaseClient.from('tests').select('id', {count:'exact'}),
   supabaseClient.from('test_attempts').select('id,percentage,status,submitted_at,created_at', {count:'exact'})
  ]);
  for(const r of [studentsRes,teachersRes,testsRes,attemptsRes]) if(r.error) throw r.error;

  const students=studentsRes.data||[];
  const teachers=teachersRes.data||[];
  const attempts=attemptsRes.data||[];
  const submitted=attempts.filter(a=>String(a.status).toLowerCase()==='submitted');
  const schools=new Set(students.map(s=>String(s.school_dise_code||'').trim()).filter(Boolean));
  const c9=students.filter(s=>Number(s.class_level)===9).length;
  const c10=students.filter(s=>Number(s.class_level)===10).length;
  const avg=submitted.length ? submitted.reduce((sum,a)=>sum+(Number(a.percentage)||0),0)/submitted.length : 0;

  setText('totalStudents',fmt(studentsRes.count ?? students.length));
  setText('totalTeachers',fmt(teachersRes.count ?? teachers.length));
  setText('totalSchools',fmt(schools.size));
  setText('totalTests',fmt(testsRes.count ?? 0));
  setText('class9Students',fmt(c9));
  setText('class10Students',fmt(c10));
  setText('submittedAttempts',fmt(submitted.length));
  setText('averagePercentage',avg.toFixed(1)+'%');

  const activities=[];
  students.slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,3).forEach(s=>activities.push({time:new Date(s.created_at),icon:'👨‍🎓',title:'नया विद्यार्थी पंजीकृत हुआ',detail:`${s.full_name||'विद्यार्थी'} • कक्षा ${s.class_level||'—'}`}));
  teachers.slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,3).forEach(t=>activities.push({time:new Date(t.created_at),icon:'👩‍🏫',title:'नया शिक्षक पंजीकृत हुआ',detail:t.full_name||'शिक्षक'}));
  submitted.slice().sort((a,b)=>new Date(b.submitted_at||b.created_at)-new Date(a.submitted_at||a.created_at)).slice(0,3).forEach(a=>activities.push({time:new Date(a.submitted_at||a.created_at),icon:'📝',title:'टेस्ट परिणाम जमा हुआ',detail:`स्कोर: ${Number(a.percentage||0).toFixed(1)}%`}));
  activities.sort((a,b)=>b.time-a.time);
  renderActivities(activities.slice(0,6));
  setText('activityStatus','Live Data');
 }catch(error){
  console.error('Admin Dashboard Error:',error);
  ['totalStudents','totalTeachers','totalSchools','totalTests','class9Students','class10Students','submittedAttempts','averagePercentage'].forEach(id=>setText(id,'—'));
  setText('activityStatus','लोड नहीं हुआ');
  document.getElementById('recentActivities').innerHTML=`<div class="activity"><span>❌</span><div><b>Live data लोड नहीं हो सका</b><small>${escapeHtml(error.message||'Unknown Error')}</small></div></div>`;
 }
}
function renderActivities(items){
 const box=document.getElementById('recentActivities');
 if(!items.length){box.innerHTML='<div class="activity"><span>📭</span><div><b>अभी कोई गतिविधि उपलब्ध नहीं है</b><small>जैसे-जैसे पंजीकरण और टेस्ट होंगे, वे यहाँ दिखाई देंगे।</small></div></div>';return;}
 box.innerHTML=items.map(x=>`<div class="activity"><span>${x.icon}</span><div><b>${escapeHtml(x.title)}</b><small>${escapeHtml(x.detail)} • ${formatDate(x.time)}</small></div></div>`).join('');
}
function formatDate(d){ if(!(d instanceof Date)||isNaN(d)) return ''; return d.toLocaleString('hi-IN',{dateStyle:'medium',timeStyle:'short'}); }
function escapeHtml(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}

document.addEventListener('DOMContentLoaded',()=>{ if(document.getElementById('totalStudents')) loadDashboard(); });
