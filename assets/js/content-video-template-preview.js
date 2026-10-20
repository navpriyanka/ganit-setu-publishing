/* Loads the persistent five-scene template previews in Content Creation. */
(() => {
  'use strict';
  const config = window.GS_SUPABASE_CONFIG;
  const BUCKET = 'content-media';
  const scenePath = n => `video-templates/scene-${n}.mp4`;
  const publicUrl = path => `${config.url}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}?v=${Date.now()}`;
  function apply(scene, url) {
    const video = document.getElementById(`ccTplPreview${scene}`);
    const empty = document.getElementById(`ccTplEmpty${scene}`);
    const state = document.getElementById(`ccTplState${scene}`);
    if (!video || !url) return;
    video.src = url; video.hidden = false;
    if (empty) empty.hidden = true;
    if (state) state.textContent = 'Supabase saved';
  }
  async function load() {
    if (!config || !window.supabase?.createClient) return;
    const client = window.supabaseClient || window.supabase.createClient(config.url, config.publishableKey);
    try {
      const { data, error } = await client.from('video_master_templates')
        .select('scene_number,storage_path,is_active').eq('is_active', true).order('scene_number');
      if (error) throw error;
      (data || []).forEach(row => apply(Number(row.scene_number), publicUrl(row.storage_path)));
    } catch (err) {
      // Keep GitHub fallback/empty slots visible; template management remains available.
      console.info('Five-scene preview library is not connected yet:', err.message);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
