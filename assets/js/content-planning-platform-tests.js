/* Ganit Setu — Temporary Platform Connection Tests
   Remove this file + its script tag when testing is complete.
*/
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function setResult(text, type = '') {
    const el = $('cpPlatformTestResult');
    if (!el) return;
    el.textContent = text;
    el.className = 'platform-test-result' + (type ? ` ${type}` : '');
  }

  function setButton(id, pass) {
    const btn = $(id);
    if (!btn) return;
    btn.classList.remove('test-pass', 'test-fail');
    btn.classList.add(pass ? 'test-pass' : 'test-fail');
  }

  async function testFacebook() {
    const connector = window.GanitSetuFacebookConnector;
    if (!connector?.loadExistingFacebookConnection) {
      throw new Error('Facebook connector उपलब्ध नहीं है।');
    }
    const ok = await connector.loadExistingFacebookConnection();
    if (!ok) throw new Error('Facebook connection verify नहीं हुआ।');
    return 'Facebook: ✅ Connected';
  }

 async function testInstagram() {
  const status = document.getElementById('cpInstagramConnectionStatus');
  const text = status?.textContent?.trim() || '';

  if (text.includes('Connected') || text.includes('✅')) {
    return 'Instagram: ✅ Connected';
  }

  throw new Error('Instagram अभी Connected नहीं दिख रहा है।');
}

  async function testYouTube() {
    const connector = window.GanitSetuYouTubeConnector;
    if (!connector?.loadExisting) {
      throw new Error('YouTube connector उपलब्ध नहीं है।');
    }
    const ok = await connector.loadExisting();
    if (!ok) throw new Error('YouTube connection verify नहीं हुआ।');
    return 'YouTube: ✅ Connected';
  }

  async function testWhatsApp() {
    const connector = window.GanitSetuWhatsAppConnector;
    if (!connector?.loadExisting) {
      throw new Error('WhatsApp Channel connector उपलब्ध नहीं है।');
    }
    const ok = await connector.loadExisting();
    if (!ok) throw new Error('WhatsApp Channel configuration verify नहीं हुई।');

    return 'WhatsApp Channel: ✅ Configured';
  }

  async function runOne(testId, fn, label) {
    const btn = $(testId);
    if (btn) btn.disabled = true;

    try {
      const result = await fn();
      setButton(testId, true);
      setResult(result, 'success');
      return { ok: true, result };
    } catch (error) {
      setButton(testId, false);
      const message = error?.message || String(error);
      setResult(`${label}: ❌ ${message}`, 'error');
      return { ok: false, result: `${label}: ❌ ${message}` };
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function testAll() {
    const allBtn = $('cpTestAllPlatformsBtn');
    if (allBtn) {
      allBtn.disabled = true;
      allBtn.textContent = '⏳ Testing 4 platforms…';
    }

    setResult('चारों platforms का connection test चल रहा है…');

    const results = [];
    const tests = [
      ['cpTestFacebookBtn', testFacebook, 'Facebook'],
      ['cpTestInstagramBtn', testInstagram, 'Instagram'],
      ['cpTestYouTubeBtn', testYouTube, 'YouTube'],
      ['cpTestWhatsAppBtn', testWhatsApp, 'WhatsApp Channel']
    ];

    for (const [id, fn, label] of tests) {
      const btn = $(id);
      if (btn) btn.disabled = true;
      try {
        const result = await fn();
        setButton(id, true);
        results.push(result);
      } catch (error) {
        const message = error?.message || String(error);
        setButton(id, false);
        results.push(`${label}: ❌ ${message}`);
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    const passed = results.filter(x => x.includes('✅')).length;
    setResult(
      `Test Result: ${passed}/4 passed\n\n${results.join('\n')}`,
      passed === 4 ? 'success' : 'error'
    );

    if (allBtn) {
      allBtn.disabled = false;
      allBtn.textContent = '🧪 Test All 4';
    }
  }

  function bind() {
    const fb = $('cpTestFacebookBtn');
    const ig = $('cpTestInstagramBtn');
    const yt = $('cpTestYouTubeBtn');
    const wa = $('cpTestWhatsAppBtn');
    const all = $('cpTestAllPlatformsBtn');

    if (fb) fb.addEventListener('click', () => runOne('cpTestFacebookBtn', testFacebook, 'Facebook'));
    if (ig) ig.addEventListener('click', () => runOne('cpTestInstagramBtn', testInstagram, 'Instagram'));
    if (yt) yt.addEventListener('click', () => runOne('cpTestYouTubeBtn', testYouTube, 'YouTube'));
    if (wa) wa.addEventListener('click', () => runOne('cpTestWhatsAppBtn', testWhatsApp, 'WhatsApp Channel'));
    if (all) all.addEventListener('click', testAll);

    console.log('[Ganit Setu] Temporary platform testing ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }

  window.GanitSetuPlatformTests = {
    testFacebook,
    testInstagram,
    testYouTube,
    testWhatsApp,
    testAll
  };
})();
