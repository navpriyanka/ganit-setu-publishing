/* Ganit Setu — Instagram OAuth Connector */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://ucovgluwsiejrhjweuls.supabase.co';
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/instagram-oauth';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_1XHxsjb_vNK8BYHHGiIYeQ__ouET5_Q';

  const $ = (id) => document.getElementById(id);

  function setStatus(message, type = '') {
    const el = $('cpInstagramConnectionStatus');
    if (!el) return;
    el.textContent = message;
    el.className = type
      ? `cp-connection-status ${type}`
      : 'cp-connection-status';
  }

  function setMessage(message, type = 'info') {
    const el = $('cpInstagramMessage');
    if (!el) return;
    el.textContent = message || '';
    el.className = `cp-social-message ${type}`;
  }

  function setBusy(busy) {
    const btn = $('cpConnectInstagramBtn');
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy
      ? 'Meta लॉगिन खोला जा रहा है…'
      : 'Connect Instagram';
  }

  function getClient() {
    return window.supabaseClient || window.gsSupabaseClient || null;
  }

  async function getHeaders() {
    let bearer = SUPABASE_PUBLISHABLE_KEY;
    const client = getClient();

    if (client?.auth) {
      try {
        const { data } = await client.auth.getSession();
        bearer = data?.session?.access_token || bearer;
      } catch (e) {
        console.warn('Supabase session check:', e);
      }
    }

    return {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${bearer}`
    };
  }

  async function callOAuth(payload) {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.error ||
        result.message ||
        `Instagram OAuth अनुरोध विफल (HTTP ${response.status})`
      );
    }

    return result;
  }

  async function loadExisting() {
    const client = getClient();

    if (!client) {
      setStatus('स्थिति जाँची नहीं जा सकी', 'error');
      return false;
    }

    try {
      const { data, error } = await client
        .from('social_accounts')
        .select('account_id,account_name,status,connection_status,metadata')
        .eq('platform', 'instagram')
        .eq('status', 'connected')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setStatus('Not connected');
        setMessage('Instagram जोड़ने के लिए Connect Instagram दबाएँ।');
        return false;
      }

      const metadata = data.metadata || {};
      const username =
        metadata.username ||
        data.account_name ||
        'Instagram';

      const instagramId =
        metadata.instagram_id ||
        data.account_id ||
        '';

      setStatus('✅ Connected', 'connected');

      const accountName = $('cpInstagramAccountName');
      if (accountName) {
        accountName.textContent =
          (username.startsWith('@') ? username : '@' + username) +
          (instagramId ? ` • Instagram ID: ${instagramId}` : '');
      }

      const btn = $('cpConnectInstagramBtn');
      if (btn) btn.textContent = '🔄 Refresh Instagram';

      setMessage('Instagram account connected है।', 'success');
      return true;
    } catch (error) {
      console.error('[Ganit Setu Instagram status]', error);
      setStatus('स्थिति जाँचने में समस्या', 'error');
      setMessage(
        'कनेक्शन की स्थिति नहीं पढ़ी जा सकी। Supabase RLS और social_accounts रिकॉर्ड जाँचें।',
        'error'
      );
      return false;
    }
  }

  async function connectInstagram() {
    const btn = $('cpConnectInstagramBtn');
    if (btn?.disabled) return;

    setBusy(true);
    setStatus('Meta से संपर्क किया जा रहा है…');
    setMessage('Instagram को Facebook Page से जोड़ने की प्रक्रिया शुरू है।');

    try {
      const result = await callOAuth({ action: 'authorize' });

      if (!result.authorization_url) {
        throw new Error(
          result.error || 'Authorization URL नहीं मिला। Edge Function का response जाँचें।'
        );
      }

      // Meta login opens in the current tab.
      window.location.assign(result.authorization_url);
    } catch (error) {
      console.error('[Ganit Setu Instagram OAuth]', error);
      setStatus('Not connected', 'error');
      setMessage(error.message || 'Instagram कनेक्शन शुरू नहीं हो पाया।', 'error');
      setBusy(false);
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

  window.GanitSetuInstagramConnector = {
    connectInstagram,
    loadExisting
  };
})();
