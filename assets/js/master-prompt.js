// GANIT SETU - Master Prompt Editor
(function(){
  'use strict';
  const TABLE = 'content_prompt_configurations';
  const ROW_ID = 1;
  const $ = id => document.getElementById(id);

  function setStatus(text, ok){
    const el = $('promptStatus');
    if(!el) return;
    el.textContent = text;
    el.style.background = ok ? '#ecfdf5' : '#f1f5f9';
    el.style.color = ok ? '#166534' : '';
  }
  function showMessage(text, type){
    const el = $('saveMessage');
    if(!el) return;
    el.hidden = false;
    el.className = 'save-message ' + type;
    el.textContent = text;
  }
  function updateCount(){
    const n = ($('masterPromptText')?.value || '').length;
    $('charCount').textContent = n.toLocaleString('en-IN') + ' characters';
  }
  function formatDate(v){
    if(!v) return '—';
    const d = new Date(v);
    if(Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('hi-IN',{dateStyle:'medium',timeStyle:'short'});
  }

  async function ensureSession(){
    const {data,error} = await window.supabaseClient.auth.getSession();
    if(error || !data?.session){
      location.href = 'index.html';
      return false;
    }
    return true;
  }

  async function loadPrompt(){
    setStatus('लोड हो रहा है...', false);
    $('saveMessage').hidden = true;
    const {data,error} = await window.supabaseClient
      .from(TABLE)
      .select('id,prompt_name,prompt_text,is_active,updated_at')
      .eq('id', ROW_ID)
      .maybeSingle();
    if(error) throw error;
    if(!data){
      throw new Error('Master Prompt row नहीं मिली।');
    }
    $('promptName').textContent = data.prompt_name || 'Master Prompt';
    $('promptUpdated').textContent = formatDate(data.updated_at);
    $('promptActive').textContent = data.is_active ? 'Yes' : 'No';
    $('masterPromptText').value = data.prompt_text || '';
    updateCount();
    setStatus('Loaded', true);
  }

  async function savePrompt(){
    const btn = $('savePromptBtn');
    const prompt = $('masterPromptText').value.trim();
    if(!prompt){
      showMessage('Master Prompt खाली नहीं हो सकता।', 'error');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Saving...';
    setStatus('Saving...', false);
    $('saveMessage').hidden = true;
    try{
      const {data,error} = await window.supabaseClient
        .from(TABLE)
        .update({prompt_text: prompt, is_active: true, updated_at: new Date().toISOString()})
        .eq('id', ROW_ID)
        .select('id,prompt_name,prompt_text,is_active,updated_at')
        .single();
      if(error) throw error;
      $('promptName').textContent = data.prompt_name || 'Master Prompt';
      $('promptUpdated').textContent = formatDate(data.updated_at);
      $('promptActive').textContent = data.is_active ? 'Yes' : 'No';
      $('masterPromptText').value = data.prompt_text || prompt;
      updateCount();
      setStatus('Saved', true);
      showMessage('✅ Master Prompt सफलतापूर्वक Save हो गया।', 'success');
    }catch(error){
      console.error('Master Prompt save error:', error);
      setStatus('Save failed', false);
      showMessage('❌ Save नहीं हुआ: ' + (error.message || 'Unknown error'), 'error');
    }finally{
      btn.disabled = false;
      btn.textContent = '💾 Save Master Prompt';
    }
  }

  document.addEventListener('DOMContentLoaded', async function(){
    $('masterPromptText').addEventListener('input', updateCount);
    $('reloadPromptBtn').addEventListener('click', async function(){
      try{ await loadPrompt(); }catch(e){ console.error(e); showMessage('❌ Prompt load नहीं हुआ: '+(e.message||'Unknown error'),'error'); setStatus('Load failed',false); }
    });
    $('savePromptBtn').addEventListener('click', savePrompt);
    try{
      if(await ensureSession()) await loadPrompt();
    }catch(error){
      console.error('Master Prompt load error:', error);
      setStatus('Load failed', false);
      showMessage('❌ Master Prompt load नहीं हुआ: ' + (error.message || 'Unknown error'), 'error');
    }
  });

  // ---------------------------------------------------------
  // Brand Reference Assets
  // Stored in Supabase Storage bucket: content-media / brand
  // ---------------------------------------------------------
  const BRAND_TABLE = 'content_brand_assets';
  const BRAND_BUCKET = 'content-media';
  const BRAND_FOLDER = 'brand';
  const BRAND_CONFIG = {
    wordmark: {
      input: 'brandInputWordmark',
      preview: 'brandPreviewWordmark',
      file: 'brandFileWordmark',
      name: 'GANIT_SETU_Static_Wordmark'
    },
    animated_wordmark: {
      input: 'brandInputAnimated',
      preview: 'brandPreviewAnimated',
      file: 'brandFileAnimated',
      name: 'GANIT_SETU_Animated_Wordmark'
    },
    original_logo: {
      input: 'brandInputLogo',
      preview: 'brandPreviewLogo',
      file: 'brandFileLogo',
      name: 'GANIT_SETU_Original_Logo'
    }
  };

  function brandMessage(text, type){
    const el = $('brandMessage');
    if(!el) return;
    el.hidden = false;
    el.className = 'save-message ' + type;
    el.textContent = text;
  }

  function setBrandStatus(text, ok){
    const el = $('brandStatus');
    if(!el) return;
    el.textContent = text;
    el.style.background = ok ? '#ecfdf5' : '#f1f5f9';
    el.style.color = ok ? '#166534' : '';
  }

  function brandPublicUrl(path){
    return window.supabaseClient.storage.from(BRAND_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  function showBrandAsset(asset){
    const cfg = BRAND_CONFIG[asset.asset_key];
    if(!cfg) return;
    const img = $(cfg.preview);
    const file = $(cfg.file);
    if(img && asset.public_url){
      img.src = asset.public_url + (asset.public_url.includes('?') ? '&' : '?') + 'v=' + Date.now();
      img.dataset.url = asset.public_url;
    }
    if(file) file.textContent = asset.storage_path || 'Uploaded';
  }

  async function loadBrandAssets(){
    setBrandStatus('लोड हो रहा है...', false);
    const {data,error} = await window.supabaseClient
      .from(BRAND_TABLE)
      .select('id,asset_key,asset_name,asset_type,storage_path,public_url,is_active,updated_at')
      .eq('is_active', true)
      .order('id');
    if(error) throw error;
    (data || []).forEach(showBrandAsset);
    setBrandStatus((data || []).length + ' assets ready', true);
  }

  async function uploadBrandAsset(key, fileObj){
    const cfg = BRAND_CONFIG[key];
    if(!cfg || !fileObj) return;

    const safeName = fileObj.name.replace(/[^a-zA-Z0-9._-]+/g,'_');
    const path = BRAND_FOLDER + '/' + key + '_' + Date.now() + '_' + safeName;

    setBrandStatus('Uploading...', false);
    brandMessage('⏳ ' + cfg.name + ' upload हो रहा है...', 'success');

    const {error: uploadError} = await window.supabaseClient.storage
      .from(BRAND_BUCKET)
      .upload(path, fileObj, {
        upsert: false,
        contentType: fileObj.type || undefined,
        cacheControl: '31536000'
      });

    if(uploadError) throw uploadError;

    const publicUrl = brandPublicUrl(path);

    // Keep only one active record per asset key.
    const {error: deactivateError} = await window.supabaseClient
      .from(BRAND_TABLE)
      .update({is_active:false, updated_at:new Date().toISOString()})
      .eq('asset_key', key)
      .eq('is_active', true);

    if(deactivateError) throw deactivateError;

    const {data,error:insertError} = await window.supabaseClient
      .from(BRAND_TABLE)
      .insert({
        asset_key:key,
        asset_name:cfg.name,
        asset_type:key,
        storage_path:path,
        public_url:publicUrl,
        is_active:true
      })
      .select('id,asset_key,asset_name,asset_type,storage_path,public_url,is_active,updated_at')
      .single();

    if(insertError) throw insertError;
    showBrandAsset(data);
    setBrandStatus('Saved', true);
    brandMessage('✅ ' + cfg.name + ' successfully saved.', 'success');
  }

  async function downloadBrandAsset(key){
    const cfg = BRAND_CONFIG[key];
    const img = $(cfg.preview);
    const url = img?.dataset?.url || img?.src;
    if(!url || url.startsWith('data:') || url.includes('undefined')){
      brandMessage('पहले इस asset को upload/save करें।', 'error');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.download = cfg.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function initBrandReferences(){
    document.querySelectorAll('[data-pick]').forEach(btn => {
      btn.addEventListener('click', () => $(btn.dataset.pick)?.click());
    });

    Object.entries(BRAND_CONFIG).forEach(([key,cfg]) => {
      const input = $(cfg.input);
      if(!input) return;
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if(!file) return;
        try{
          await uploadBrandAsset(key, file);
        }catch(error){
          console.error('Brand upload error:', error);
          setBrandStatus('Upload failed', false);
          brandMessage('❌ Upload नहीं हुआ: ' + (error.message || 'Unknown error'), 'error');
        }finally{
          input.value = '';
        }
      });
    });

    document.querySelectorAll('[data-download]').forEach(btn => {
      btn.addEventListener('click', () => downloadBrandAsset(btn.dataset.download));
    });
  }

  // Hook brand initialization into the existing DOMContentLoaded flow.
  const originalBrandReady = document.readyState === 'loading'
    ? null
    : true;
  if(originalBrandReady){
    initBrandReferences();
  }
  document.addEventListener('DOMContentLoaded', async function(){
    initBrandReferences();
    try{
      if(window.supabaseClient) await loadBrandAssets();
    }catch(error){
      console.error('Brand asset load error:', error);
      setBrandStatus('Load failed', false);
      brandMessage('❌ Brand assets load नहीं हुए: ' + (error.message || 'Unknown error'), 'error');
    }
  });

})();
