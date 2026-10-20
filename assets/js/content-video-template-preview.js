/* Five-scene previews: load the existing GitHub Pages video files. */
(() => {
  'use strict';
  function load() {
    for (let scene = 1; scene <= 5; scene++) {
      const video = document.getElementById(`ccTplPreview${scene}`);
      if (!video) continue;
      const url = `assets/video-templates/scene-${scene}.mp4`;
      if (video.getAttribute('src') !== url) video.setAttribute('src', url);
      video.hidden = false;
      const empty = document.getElementById(`ccTplEmpty${scene}`);
      if (empty) empty.hidden = true;
      const state = document.getElementById(`ccTplState${scene}`);
      if (state) state.textContent = 'GitHub video';
      video.addEventListener('error', () => {
        if (state) state.textContent = 'Video load failed';
        console.error(`Scene ${scene}: cannot load ${url}`);
      });
      video.load();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
