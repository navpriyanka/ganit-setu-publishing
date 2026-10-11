/* Ganit Setu — Facebook Page Connector
   Content Day Planning only
   Same-tab Facebook Login
   Uses existing Supabase session
   Meta App Secret is NEVER exposed in frontend

   Added:
   - Existing Facebook connection auto-detection
   - Connected Page name + Page ID display
   - Avoid unnecessary OAuth when already connected
*/

(() => {
  'use strict';

  // --------------------------------------------------
  // CONFIG
  // --------------------------------------------------

  const SUPABASE_URL =
    'https://cbgojvnbkosdehvwerth.supabase.co';

  const FUNCTION_URL =
    SUPABASE_URL + '/functions/v1/facebook-oauth';

  /*
   * Existing Facebook connection table.
   *
   * Expected columns:
   * platform
   * account_id
   * account_name
   * status
   * metadata
   * updated_at
   */const CONNECTIONS_TABLE = 'social_accounts';

  const REDIRECT_URI =
    new URL(
      'facebook-oauth-callback.html',
      window.location.href
    ).href;

  let bound = false;


  // --------------------------------------------------
  // SUPABASE CLIENT
  // --------------------------------------------------

  function getClient() {

    if (
      window.supabaseClient &&
      typeof window.supabaseClient.auth?.getSession === 'function'
    ) {
      return window.supabaseClient;
    }

    if (
      window.gsSupabaseClient &&
      typeof window.gsSupabaseClient.auth?.getSession === 'function'
    ) {
      return window.gsSupabaseClient;
    }

    return null;
  }


  // --------------------------------------------------
  // CONTENT PLANNING FACEBOOK BUTTON
  // --------------------------------------------------

  function findButton() {

    return (
      document.getElementById('cpConnectFacebookBtn') ||
      document.getElementById('connectFacebookBtn') ||
      document.querySelector(
        '[data-action="connect-facebook"]'
      ) ||
      [...document.querySelectorAll('button, a')].find(
        el =>
          /connect facebook page/i.test(
            (el.textContent || '').trim()
          )
      )
    );
  }


  // --------------------------------------------------
  // BUTTON STATE
  // --------------------------------------------------

  function setButtonBusy(btn, busy) {

    if (!btn) return;

    btn.disabled = busy;

    btn.dataset.gsFbBusy =
      busy ? '1' : '0';

    if (busy) {

      btn.dataset.originalText =
        btn.textContent;

      btn.textContent =
        'Facebook जोड़ रहा है…';

    } else if (btn.dataset.originalText) {

      btn.textContent =
        btn.dataset.originalText;
    }
  }


  // --------------------------------------------------
  // CONTENT PLANNING MESSAGE
  // --------------------------------------------------

  function showMessage(
    message,
    type = 'info'
  ) {

    const box =
      document.getElementById(
        'cpFacebookMessage'
      ) ||
      document.getElementById(
        'facebookStatus'
      ) ||
      document.getElementById(
        'fbStatus'
      );

    if (box) {

      box.textContent =
        message;

      box.dataset.type =
        type;

      box.hidden =
        false;

      return;
    }

    console.log(
      '[Ganit Setu Facebook]',
      type,
      message
    );
  }


  // --------------------------------------------------
  // CONNECTION STATUS
  // --------------------------------------------------

  function setConnectionStatus(
    status,
    pageName = ''
  ) {

    const statusBox =
      document.getElementById(
        'cpFacebookConnectionStatus'
      );

    const pageNameBox =
      document.getElementById(
        'cpFacebookPageName'
      );

    if (statusBox) {

      statusBox.textContent =
        status;

      statusBox.dataset.connected =
        pageName ? 'true' : 'false';
    }

    if (pageNameBox) {

      pageNameBox.textContent =
        pageName || '';
    }
  }


  // --------------------------------------------------
  // SUPABASE SESSION
  // --------------------------------------------------

  async function getSession() {

    const client =
      getClient();

    if (!client) {

      throw new Error(
        'Supabase client नहीं मिला। Content Planning में existing login session उपलब्ध नहीं है।'
      );
    }

    const {
      data,
      error
    } =
      await client.auth.getSession();

    if (error) {
      throw error;
    }

    if (!data?.session) {

      throw new Error(
        'Admin login session नहीं मिली। पहले Admin Panel में login करें।'
      );
    }

    return {
      client,
      session: data.session
    };
  }


  // --------------------------------------------------
  // LOAD EXISTING FACEBOOK CONNECTION
  // --------------------------------------------------

  async function loadExistingFacebookConnection() {

    const btn =
      findButton();

    try {

      const {
        client
      } =
        await getSession();

      const {
        data,
        error
      } =
        await client
          .from(CONNECTIONS_TABLE)
          .select(
            'account_id, account_name, status, metadata, updated_at'
          )
          .eq(
            'platform',
            'facebook'
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
          '[Ganit Setu Facebook] Existing connection lookup failed:',
          error
        );

        /*
         * Existing connection check fail होने पर
         * OAuth button normal state में रहेगा।
         */

        return false;
      }

      if (!data) {

        setConnectionStatus(
          'Not connected'
        );

        if (btn) {

          btn.textContent =
            'Connect Facebook Page';

          btn.disabled =
            false;

          btn.dataset.gsFbConnected =
            '0';
        }

        return false;
      }


      // ----------------------------------------------
      // READ METADATA
      // ----------------------------------------------

      let metadata = {};

      if (
        data.metadata &&
        typeof data.metadata === 'object'
      ) {

        metadata =
          data.metadata;
      }


      // ----------------------------------------------
      // PAGE ID
      // ----------------------------------------------

     const pageId =
  metadata.page_id ||
  metadata.pageId ||
  data.account_id ||
  '';


      // ----------------------------------------------
      // PAGE NAME
      // ----------------------------------------------

      const pageName =
        data.account_name ||
        metadata.page_name ||
        metadata.pageName ||
        'Facebook Page';


      // ----------------------------------------------
      // UPDATE UI
      // ----------------------------------------------

      setConnectionStatus(
        '✅ Connected',
        pageName
      );

      const pageNameBox =
        document.getElementById(
          'cpFacebookPageName'
        );

      if (pageNameBox) {

        pageNameBox.textContent =
          pageName +
          (
            pageId
              ? ' • Page ID: ' + pageId
              : ''
          );
      }


      // ----------------------------------------------
      // BUTTON
      // ----------------------------------------------

      if (btn) {

        btn.disabled =
          false;

        btn.textContent =
          '🔄 Reconnect Facebook Page';

        btn.dataset.gsFbConnected =
          '1';
      }


      showMessage(
        'Facebook Page पहले से connected है: ' +
        pageName,
        'success'
      );

      return true;

    } catch (e) {

      console.warn(
        '[Ganit Setu Facebook] loadExistingFacebookConnection:',
        e
      );

      return false;
    }
  }


  // --------------------------------------------------
  // START FACEBOOK OAUTH
  // SAME TAB
  // --------------------------------------------------

  async function startOAuth() {

    const btn =
      findButton();

    if (
      btn?.dataset.gsFbBusy === '1'
    ) {
      return;
    }

    try {

      setButtonBusy(
        btn,
        true
      );

      setConnectionStatus(
        'Facebook से connect हो रहा है…'
      );

      showMessage(
        'Facebook Login शुरू किया जा रहा है…',
        'info'
      );


      // ----------------------------------------------
      // SESSION
      // ----------------------------------------------

      const {
        session
      } =
        await getSession();


      // ----------------------------------------------
      // OAUTH URL
      // ----------------------------------------------

      const url =
        new URL(
          FUNCTION_URL
        );

      url.searchParams.set(
        'action',
        'authorize'
      );

      url.searchParams.set(
        'redirect_uri',
        REDIRECT_URI
      );


      // ----------------------------------------------
      // CALL EDGE FUNCTION
      // ----------------------------------------------

      const res =
        await fetch(
          url.toString(),
          {
            method:
              'GET',

            headers: {

              Authorization:
                'Bearer ' +
                session.access_token,

              apikey:
                session.access_token
            }
          }
        );


      const raw =
        await res.text();

      let data = {};

      try {

        data =
          JSON.parse(raw);

      } catch {

        data = {};
      }


      if (
        !res.ok ||
        !data.url
      ) {

        throw new Error(
          data.error ||
          data.message ||
          (
            'Facebook OAuth authorize failed (' +
            res.status +
            ')'
          )
        );
      }


      /*
       * IMPORTANT:
       * Same browser tab.
       * No popup.
       */

      window.location.href =
        data.url;


    } catch (e) {

      console.error(
        '[Ganit Setu Facebook] startOAuth:',
        e
      );

      setConnectionStatus(
        'Not connected'
      );

      showMessage(
        e.message ||
        'Facebook connection शुरू नहीं हो सका।',
        'error'
      );

      setButtonBusy(
        btn,
        false
      );
    }
  }


  // --------------------------------------------------
  // EXCHANGE FACEBOOK CODE
  // --------------------------------------------------

  async function exchangeCode(
    code,
    state
  ) {

    try {

      setConnectionStatus(
        'Facebook Page connection पूरा किया जा रहा है…'
      );

      showMessage(
        'Facebook authorization सफल हुआ। Page connection पूरा किया जा रहा है…',
        'info'
      );


      const {
        session
      } =
        await getSession();


      const res =
        await fetch(
          FUNCTION_URL,
          {
            method:
              'POST',

            headers: {

              'Content-Type':
                'application/json',

              Authorization:
                'Bearer ' +
                session.access_token,

              apikey:
                session.access_token
            },

            body:
              JSON.stringify({

                action:
                  'exchange',

                code:
                  code,

                state:
                  state,

                redirect_uri:
                  REDIRECT_URI
              })
          }
        );


      const raw =
        await res.text();

      let data = {};

      try {

        data =
          JSON.parse(raw);

      } catch {

        data = {};
      }


      if (!res.ok) {

        throw new Error(
          data.error ||
          data.message ||
          (
            'Facebook token exchange failed (' +
            res.status +
            ')'
          )
        );
      }


      const pages =
        Array.isArray(
          data.pages
        )
          ? data.pages
          : [];


      if (!pages.length) {

        setConnectionStatus(
          'Connected, लेकिन कोई Page नहीं मिला'
        );

        showMessage(
          'Facebook login हो गया, लेकिन कोई Facebook Page उपलब्ध नहीं मिला। सुनिश्चित करें कि आपके Facebook account को Page की आवश्यक permissions प्राप्त हैं।',
          'warning'
        );

        return;
      }


      renderPages(
        pages
      );


      showMessage(
        pages.length +
        ' Facebook Page उपलब्ध है।',
        'success'
      );


      /*
       * OAuth parameters हटाएँ
       * ताकि code/state URL में न रहें।
       */

      const cleanUrl =
        window.location.origin +
        window.location.pathname;

      window.history.replaceState(
        {},
        document.title,
        cleanUrl
      );


    } catch (e) {

      console.error(
        '[Ganit Setu Facebook] exchange:',
        e
      );

      setConnectionStatus(
        'Not connected'
      );

      showMessage(
        e.message ||
        'Facebook Page connect नहीं हो सका।',
        'error'
      );
    }
  }


  // --------------------------------------------------
  // CHECK FACEBOOK CALLBACK
  // --------------------------------------------------

  async function handleOAuthCallback() {

    const params =
      new URLSearchParams(
        window.location.search
      );


    const code =
      params.get(
        'facebook_code'
      );


    const state =
      params.get(
        'facebook_state'
      );


    const error =
      params.get(
        'facebook_error'
      );


    const errorDescription =
      params.get(
        'facebook_error_description'
      );


    if (error) {

      setConnectionStatus(
        'Not connected'
      );

      showMessage(
        errorDescription ||
        error ||
        'Facebook authorization failed.',
        'error'
      );


      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );

      return;
    }


    if (
      !code ||
      !state
    ) {
      return;
    }


    await exchangeCode(
      code,
      state
    );
  }


  // --------------------------------------------------
  // RENDER CONNECTED PAGES
  // --------------------------------------------------

  function renderPages(
    pages
  ) {

    const page =
      pages[0];

    if (!page) {
      return;
    }


    const name =
      String(
        page.name ||
        page.account_name ||
        'Facebook Page'
      );


    const id =
      String(
        page.id ||
        page.page_id ||
        page.account_id ||
        ''
      );


    setConnectionStatus(
      '✅ Connected',
      name
    );


    const pageNameBox =
      document.getElementById(
        'cpFacebookPageName'
      );


    if (pageNameBox) {

      pageNameBox.textContent =
        name +
        (
          id
            ? ' • Page ID: ' + id
            : ''
        );
    }


    const btn =
      findButton();

    if (btn) {

      btn.disabled =
        false;

      btn.textContent =
        '🔄 Reconnect Facebook Page';

      btn.dataset.gsFbConnected =
        '1';
    }


    /*
     * अगर भविष्य में HTML में
     * facebookPages container जोड़ा जाए,
     * तो connected pages वहाँ भी दिखेंगे।
     */

    const container =
      document.getElementById(
        'facebookPages'
      ) ||
      document.getElementById(
        'connectedFacebookPages'
      ) ||
      document.querySelector(
        '[data-facebook-pages]'
      );


    if (!container) {
      return;
    }


    container.innerHTML =
      pages
        .map(
          p => {

            const pName =
              String(
                p.name ||
                p.account_name ||
                'Facebook Page'
              );


            const pId =
              String(
                p.id ||
                p.page_id ||
                p.account_id ||
                ''
              );


            return `
              <div class="facebook-page-item">

                <strong>
                  ${escapeHtml(pName)}
                </strong>

                <small>
                  Page ID:
                  ${escapeHtml(pId)}
                </small>

                <span class="facebook-page-status">
                  Connected
                </span>

              </div>
            `;
          }
        )
        .join('');


    container.hidden =
      false;
  }


  // --------------------------------------------------
  // ESCAPE HTML
  // --------------------------------------------------

  function escapeHtml(v) {

    return String(
      v ?? ''
    ).replace(
      /[&<>"']/g,
      c => ({
        '&':
          '&amp;',

        '<':
          '&lt;',

        '>':
          '&gt;',

        '"':
          '&quot;',

        "'":
          '&#039;'

      }[c])
    );
  }


  // --------------------------------------------------
  // BUTTON BIND
  // --------------------------------------------------

  function bind() {

    if (bound) {
      return true;
    }


    const btn =
      findButton();


    if (!btn) {
      return false;
    }


    bound =
      true;


    btn.addEventListener(
      'click',
      e => {

        e.preventDefault();

        e.stopPropagation();

        startOAuth();

      },
      true
    );


    console.log(
      '[Ganit Setu Facebook] Content Planning Facebook Connector ready'
    );


    return true;
  }


  // --------------------------------------------------
  // BOOT
  // --------------------------------------------------

  async function boot() {

    /*
     * पहले OAuth callback check करें।
     */

    await handleOAuthCallback();


    /*
     * Existing Supabase Facebook connection check करें।
     *
     * इससे page खोलते ही existing connection
     * automatically दिखाई देगा।
     */

    await loadExistingFacebookConnection();


    /*
     * फिर Connect button bind करें।
     */

    if (bind()) {
      return;
    }


    /*
     * अगर button बाद में render होता है
     * तो MutationObserver उसे पकड़ लेगा।
     */

    const observer =
      new MutationObserver(
        () => {

          if (bind()) {
            observer.disconnect();
          }

        }
      );


    observer.observe(
      document.documentElement,
      {
        childList:
          true,

        subtree:
          true
      }
    );


    setTimeout(
      () => observer.disconnect(),
      15000
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
        once:
          true
      }
    );

  } else {

    boot();
  }


  // --------------------------------------------------
  // GLOBAL API
  // --------------------------------------------------

  window.GanitSetuFacebookConnector = {

    startOAuth,

    bind,

    handleOAuthCallback,

    loadExistingFacebookConnection

  };

})();
