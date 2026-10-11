/* Ganit Setu — YouTube Connector
   Content Day Planning
   Uses Supabase Edge Functions:
   /functions/v1/youtube-connect
   /functions/v1/youtube-callback
*/

(() => {
  'use strict';

  const SUPABASE_URL =
    'https://cbgojvnbkosdehvwerth.supabase.co';

  const FUNCTION_URL =
    SUPABASE_URL + '/functions/v1/youtube-connect';

  const TABLE =
    'youtube_accounts';

  const PUBLISHABLE_KEY =
    'sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_';

  const $ = id =>
    document.getElementById(id);

  function client() {
    return (
      window.supabaseClient ||
      window.gsSupabaseClient ||
      null
    );
  }

  // --------------------------------------------------
  // STATUS
  // --------------------------------------------------

  function status(text, cls = '') {

    const el =
      $('cpYouTubeConnectionStatus');

    if (!el) return;

    el.textContent = text;

    el.className =
      'cp-connection-status ' + cls;
  }

  // --------------------------------------------------
  // MESSAGE
  // --------------------------------------------------

  function msg(text, cls = 'info') {

    const el =
      $('cpYouTubeMessage');

    if (!el) return;

    el.textContent =
      text || '';

    el.className =
      'cp-social-message ' + cls;
  }

  // --------------------------------------------------
  // BUTTON
  // --------------------------------------------------

  function busy(value) {

    const b =
      $('cpConnectYouTubeBtn');

    if (!b) return;

    b.disabled = value;

    if (value) {

      b.textContent =
        'YouTube जोड़ रहा है…';

    } else {

      b.textContent =
        'Connect YouTube';

    }
  }

  // --------------------------------------------------
  // PLATFORM CARD
  // --------------------------------------------------

  function platform(
    connected,
    name = ''
  ) {

    const text =
      $('cpYouTubePlatformText');

    const state =
      $('cpYouTubePlatformState');

    if (text) {

      text.textContent =
        connected
          ? 'Connected • ' + name
          : 'Ready for connection';
    }

    if (state) {

      state.textContent =
        connected
          ? 'ACTIVE'
          : 'READY';
    }

    const card =
      document.querySelector(
        '.platform-card.youtube'
      );

    if (card) {

      card.classList.toggle(
        'active',
        connected
      );
    }
  }

  // --------------------------------------------------
  // EXISTING YOUTUBE CONNECTION
  // --------------------------------------------------

  async function loadExisting() {

    const c = client();

    if (!c) {

      console.warn(
        '[Ganit Setu YouTube] Supabase client not found'
      );

      return false;
    }

    try {

      const {
        data: sessionData,
        error: sessionError
      } = await c.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      const session =
        sessionData?.session;

      if (!session) {

        status('Not connected');

        platform(false);

        return false;
      }

      const {
        data,
        error
      } = await c
        .from(TABLE)
        .select(
          'channel_id,channel_name,channel_handle,status,channel_thumbnail_url,updated_at'
        )
        .eq(
          'user_id',
          session.user.id
        )
        .eq(
          'status',
          'connected'
        )
        .order(
          'updated_at',
          {
            ascending: false
          }
        )
        .limit(1)
        .maybeSingle();

      if (error) {

        console.warn(
          '[Ganit Setu YouTube] Existing connection lookup failed:',
          error
        );

        status('Not connected');

        platform(false);

        return false;
      }

      if (!data) {

        status('Not connected');

        platform(false);

        return false;
      }

      const name =
        data.channel_name ||
        'YouTube Channel';

      status(
        '✅ Connected',
        'connected'
      );

      const account =
        $('cpYouTubeAccountName');

      if (account) {

        account.textContent =
          name +
          (
            data.channel_id
              ? ' • Channel ID: ' +
                data.channel_id
              : ''
          );
      }

      const button =
        $('cpConnectYouTubeBtn');

      if (button) {

        button.textContent =
          '🔄 Refresh YouTube';
      }

      msg(
        'YouTube channel पहले से connected है।',
        'success'
      );

      platform(
        true,
        name
      );

      return true;

    } catch (error) {

      console.error(
        '[Ganit Setu YouTube] loadExisting error:',
        error
      );

      return false;
    }
  }

  // --------------------------------------------------
  // CONNECT YOUTUBE
  // --------------------------------------------------

  async function connect() {

    const button =
      $('cpConnectYouTubeBtn');

    if (
      button?.disabled
    ) {
      return;
    }

    busy(true);

    status(
      'YouTube connect हो रहा है…'
    );

    msg(
      'Google/YouTube authorization शुरू किया जा रहा है…'
    );

    try {

      const c = client();

      if (!c) {

        throw new Error(
          'Supabase client नहीं मिला।'
        );
      }

      const {
        data,
        error
      } = await c.auth.getSession();

      if (error) {

        throw error;
      }

      const token =
        data?.session?.access_token;

      if (!token) {

        throw new Error(
          'Admin Supabase session नहीं मिली। कृपया Admin Panel में फिर login करें।'
        );
      }

      const response =
        await fetch(
          FUNCTION_URL,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',

              'apikey':
                PUBLISHABLE_KEY,

              'Authorization':
                'Bearer ' + token
            },

            body: JSON.stringify({
              action: 'authorize'
            })
          }
        );

      const raw =
        await response.text();

      let result = {};

      try {

        result =
          raw
            ? JSON.parse(raw)
            : {};

      } catch {

        throw new Error(
          'YouTube connect function ने valid JSON response नहीं दिया।'
        );
      }

      console.log(
        '[Ganit Setu YouTube] Response:',
        response.status,
        result
      );

      /*
       * हमारा नया Edge Function:
       * { ok: true, authorization_url: "..." }
       */

      if (
        !response.ok ||
        result.ok !== true
      ) {

        throw new Error(
          result.error ||
          result.message ||
          `YouTube connection failed (${response.status})`
        );
      }

      const authorizationUrl =
        result.authorization_url;

      if (!authorizationUrl) {

        throw new Error(
          'Google authorization URL नहीं मिला।'
        );
      }

      msg(
        'Google authorization खोला जा रहा है…',
        'info'
      );

      /*
       * Google OAuth
       */

      window.location.href =
        authorizationUrl;

    } catch (error) {

      console.error(
        '[Ganit Setu YouTube] Connect error:',
        error
      );

      status(
        'Not connected',
        'error'
      );

      msg(
        error?.message ||
        'YouTube connection failed',
        'error'
      );

    } finally {

      /*
       * अगर Google पर redirect नहीं हुआ,
       * तभी button वापस enable होगा।
       */

      setTimeout(
        () => {

          if (
            document.visibilityState ===
            'visible'
          ) {

            busy(false);
          }

        },
        500
      );
    }
  }

  // --------------------------------------------------
  // BOOT
  // --------------------------------------------------

  async function boot() {

    const button =
      $('cpConnectYouTubeBtn');

    if (!button) {

      console.warn(
        '[Ganit Setu YouTube] Connect button not found'
      );

      return;
    }

    button.addEventListener(
      'click',
      connect
    );

    await loadExisting();

    console.log(
      '[Ganit Setu YouTube] Connector ready'
    );
  }

  // --------------------------------------------------
  // START
  // --------------------------------------------------

  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      boot,
      {
        once: true
      }
    );

  } else {

    boot();
  }

  // --------------------------------------------------
  // GLOBAL API
  // --------------------------------------------------

  window.GanitSetuYouTubeConnector = {

    connect,

    loadExisting

  };

})();
