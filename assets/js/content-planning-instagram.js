/* Ganit Setu — Instagram Connector
   Uses the already-connected Facebook Page and the deployed
   instagram-connect Supabase Edge Function.
*/
(() => {
  'use strict';

  const SUPABASE_URL = 'https://cbgojvnbkosdehvwerth.supabase.co';
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/instagram-connect';
  const CONNECTIONS_TABLE = 'social_accounts';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_';

  function getClient() {
    return window.supabaseClient || window.gsSupabaseClient || null;
  }

  function $(id) { return document.getElementById(id); }

  function setStatus(text, type = '') {
    const el = $('cpInstagramConnectionStatus');
    if (!el) return;
    el.textContent = text;
    el.className = type ? `cp-connection-status ${type}` : 'cp-connection-status';
  }

  function setMessage(text, type = 'info') {
    const el = $('cpInstagramMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className = `cp-social-message ${type}`;
  }

  function setBusy(busy) {
    const btn = $('cpConnectInstagramBtn');
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? 'Instagram जोड़ रहा है…' : 'Connect Instagram';
  }

  async function loadExisting() {
    const client = getClient();
    if (!client) return false;

    try {
      const { data, error } = await client
        .from(CONNECTIONS_TABLE)
        .select('account_id,account_name,status,metadata')
        .eq('platform', 'instagram')
        .eq('status', 'connected')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setStatus('Not connected');
        return false;
      }

      const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
      const username = metadata.username || data.account_name || '';
      const instagramId = metadata.instagram_id || data.account_id || '';

      setStatus('✅ Connected', 'connected');
      $('cpInstagramAccountName').textContent = username + (instagramId ? ` • Instagram ID: ${instagramId}` : '');
      const btn = $('cpConnectInstagramBtn');
      if (btn) btn.textContent = '🔄 Refresh Instagram';
      setMessage('Instagram account पहले से connected है।', 'success');
      return true;
    } catch (e) {
      console.warn('[Ganit Setu Instagram] existing connection check failed:', e);
      return false;
    }
  }

  async function connectInstagram() {
    if ($('cpConnectInstagramBtn')?.disabled) return;

    setBusy(true);
    setStatus('Instagram account खोजा जा रहा है…');
    setMessage('Facebook Page से linked Instagram account खोजा जा रहा है…', 'info');

    try {
      // Use the same logged-in Supabase session as the Admin Panel.
      // Supabase Edge Functions normally require the user's JWT.
      const client = getClient();
      let accessToken = '';
      if (client?.auth) {
        const { data: sessionData } = await client.auth.getSession();
        accessToken = sessionData?.session?.access_token || '';
      }

      if (!accessToken) {
        throw new Error('Admin Supabase session नहीं मिली। कृपया Admin Panel से logout करके फिर login करें।');
      }

      const headers = {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${accessToken}`
      };

      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'connect' })
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.details?.error?.message || 'Instagram connection failed');
      }

      const ig = result.instagram || {};
      setStatus('✅ Connected', 'connected');
      $('cpInstagramAccountName').textContent =
        (ig.username ? '@' + ig.username : (ig.name || 'Instagram')) +
        (ig.id ? ` • Instagram ID: ${ig.id}` : '');
      $('cpConnectInstagramBtn').textContent = '🔄 Refresh Instagram';
      setMessage('Instagram account सफलतापूर्वक connected है।', 'success');
    } catch (error) {
      console.error('[Ganit Setu Instagram]', error);
      setStatus('Not connected', 'error');
      setMessage(error.message || 'Instagram connection failed', 'error');
    } finally {
      setBusy(false);
      if ($('cpConnectInstagramBtn')) $('cpConnectInstagramBtn').textContent = '🔄 Refresh Instagram';
    }
  }

  function boot() {
    const btn = $('cpConnectInstagramBtn');
    if (!btn) return;
    btn.addEventListener('click', connectInstagram);
    loadExisting();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.GanitSetuInstagramConnector = { connectInstagram, loadExisting };
})();
