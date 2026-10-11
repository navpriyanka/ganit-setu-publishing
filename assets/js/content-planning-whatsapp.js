/* =========================================================
   Ganit Setu — WhatsApp Channel Connector
   =========================================================
   Channel: Ganit Setu

   IMPORTANT:
   - This is for the existing Ganit Setu WhatsApp Channel.
   - WhatsApp Business API publishing is NOT used here.
   - No WhatsApp Business OAuth is required by this connector.
   - No web.whatsapp.com URL is hard-coded here.
   - The public Channel page is opened for manual/admin posting.
   ========================================================= */

(() => {
  'use strict';

  /* ---------------------------------------------------------
     Ganit Setu WhatsApp Channel
     --------------------------------------------------------- */

  const CHANNEL_URL =
    'https://whatsapp.com/channel/0029VbDLOBHICVfrePXZ363D';

  const STORAGE_KEY =
    'ganitSetuWhatsAppChannelUrl';

  /* ---------------------------------------------------------
     Helper
     --------------------------------------------------------- */

  const $ = id =>
    document.getElementById(id);

  /* ---------------------------------------------------------
     Connection Status
     --------------------------------------------------------- */

  function status(text, cls = '') {

    const el =
      $('cpWhatsAppConnectionStatus');

    if (!el) return;

    el.textContent = text;

    el.className =
      'cp-connection-status ' + cls;
  }

  /* ---------------------------------------------------------
     Message
     --------------------------------------------------------- */

  function msg(text, cls = 'info') {

    const el =
      $('cpWhatsAppMessage');

    if (!el) return;

    el.textContent =
      text || '';

    el.className =
      'cp-social-message ' + cls;
  }

  /* ---------------------------------------------------------
     Platform Card
     --------------------------------------------------------- */

  function platform(
    configured,
    name = ''
  ) {

    const text =
      $('cpWhatsAppPlatformText');

    const state =
      $('cpWhatsAppPlatformState');

    if (text) {

      text.textContent =
        configured
          ? 'Channel Configured • ' + name
          : 'Channel link configured';

    }

    if (state) {

      state.textContent =
        configured
          ? 'READY'
          : 'READY';

    }

    const card =
      document.querySelector(
        '.platform-card.whatsapp'
      );

    if (card) {

      card.classList.toggle(
        'active',
        configured
      );

    }
  }

  /* ---------------------------------------------------------
     Get Channel URL
     --------------------------------------------------------- */

  function getChannelUrl() {

    /*
      Always prefer the configured Channel URL.
    */

    return (
      localStorage.getItem(
        STORAGE_KEY
      ) || CHANNEL_URL
    );
  }

  /* ---------------------------------------------------------
     Copy Text
     --------------------------------------------------------- */

  async function copyText(text) {

    try {

      await navigator.clipboard.writeText(
        text
      );

      return true;

    } catch (error) {

      try {

        const textarea =
          document.createElement(
            'textarea'
          );

        textarea.value =
          text;

        textarea.style.position =
          'fixed';

        textarea.style.left =
          '-9999px';

        textarea.style.top =
          '-9999px';

        document.body.appendChild(
          textarea
        );

        textarea.focus();
        textarea.select();

        const ok =
          document.execCommand(
            'copy'
          );

        textarea.remove();

        return ok;

      } catch (e) {

        return false;

      }
    }
  }

  /* ---------------------------------------------------------
     Configure UI
     --------------------------------------------------------- */

  function setConfiguredUI() {

    status(
      '🟢 Channel Configured',
      'connected'
    );

    const account =
      $('cpWhatsAppAccountName');

    if (account) {

      account.textContent =
        'Ganit Setu • WhatsApp Channel';

    }

    const connectBtn =
      $('cpConnectWhatsAppBtn');

    if (connectBtn) {

      connectBtn.textContent =
        '📲 Open Ganit Setu Channel';

      connectBtn.type =
        'button';

    }

    msg(
      'Ganit Setu WhatsApp Channel configured है। पोस्ट करने के लिए Channel Admin के रूप में WhatsApp में login करके manually publish करें।',
      'success'
    );

    platform(
      true,
      'Ganit Setu Channel'
    );
  }

  /* ---------------------------------------------------------
     Open Public Channel Page
     --------------------------------------------------------- */

  function openChannel() {

    const url =
      getChannelUrl();

    /*
      IMPORTANT:
      This connector intentionally opens ONLY
      the public WhatsApp Channel URL.

      No web.whatsapp.com URL is used here.
    */

    window.open(
      url,
      '_blank',
      'noopener,noreferrer'
    );
  }

  /* ---------------------------------------------------------
     Build Question Caption
     --------------------------------------------------------- */

  function buildCaptionFromCard(
    card
  ) {

    if (!card) {
      return '';
    }

    const id =
      card.querySelector(
        '.q-title'
      )?.innerText
        ?.trim() || '';

    const question =
      card.querySelector(
        '.question-text'
      )?.innerText
        ?.trim() || '';

    const options = [
      ...card.querySelectorAll(
        '.options .option'
      )
    ]
      .map(
        x => x.innerText.trim()
      )
      .filter(Boolean)
      .join('\n');

    const chapter =
      card.querySelector(
        '.chapter-badge'
      )?.innerText
        ?.trim() || '';

    return [

      '📚 Ganit Setu — आज का गणित प्रश्न',

      id,

      chapter,

      '',

      question,

      options,

      '',

      '🤔 आपका उत्तर क्या है?',

      'Comment करके बताइए!',

      '',

      '#GanitSetu #Maths #MPBoard #Class9 #Class10 #आजकागणितप्रश्न'

    ]
      .filter(Boolean)
      .join('\n');
  }

  /* ---------------------------------------------------------
     Prepare Question for WhatsApp Channel
     --------------------------------------------------------- */

  async function prepareFromCard(
    btn
  ) {

    const card =
      btn.closest(
        '.question-card'
      );

    if (!card) {

      openChannel();

      return;
    }

    const caption =
      buildCaptionFromCard(
        card
      );

    const copied =
      await copyText(
        caption
      );

    const oldText =
      btn.textContent;

    if (copied) {

      btn.textContent =
        '✅ Caption Copied • Open Channel';

      btn.classList.add(
        'whatsapp-ready'
      );

      msg(
        'Caption clipboard में copy हो गया है। अब Ganit Setu WhatsApp Channel खोलें, image चुनें, caption paste करें और manually Send करें।',
        'success'
      );

    } else {

      btn.textContent =
        '📲 Open Ganit Setu Channel';

      msg(
        'Caption automatic copy नहीं हो पाया। Channel खोलकर caption manually paste करें।',
        'info'
      );
    }

    /*
      Open public Channel page.
    */

    openChannel();

    setTimeout(
      () => {

        btn.textContent =
          oldText;

        btn.classList.remove(
          'whatsapp-ready'
        );

      },
      4000
    );
  }

  /* ---------------------------------------------------------
     Inject Question Buttons
     --------------------------------------------------------- */

  function injectQuestionButtons() {

    document
      .querySelectorAll(
        '.question-card'
      )
      .forEach(card => {

        if (
          card.querySelector(
            '.publish-whatsapp-channel'
          )
        ) {

          return;
        }

        const actions =
          card.querySelector(
            '.prompt-actions'
          );

        if (!actions) {
          return;
        }

        const btn =
          document.createElement(
            'button'
          );

        btn.type =
          'button';

        btn.className =
          'publish-whatsapp-channel';

        btn.textContent =
          '📲 Prepare for WhatsApp Channel';

        btn.title =
          'Caption copy करके Ganit Setu WhatsApp Channel खोलें';

        btn.addEventListener(
          'click',
          () =>
            prepareFromCard(btn)
        );

        actions.appendChild(
          btn
        );
      });
  }

  /* ---------------------------------------------------------
     Configure Channel
     --------------------------------------------------------- */

  async function connect() {

    /*
      Save only the official public
      Ganit Setu Channel URL.
    */

    localStorage.setItem(
      STORAGE_KEY,
      CHANNEL_URL
    );

    setConfiguredUI();

    msg(
      'Ganit Setu WhatsApp Channel configured है। Direct API publishing इस workflow में enabled नहीं है।',
      'success'
    );
  }

  /* ---------------------------------------------------------
     Bind Existing WhatsApp Buttons
     --------------------------------------------------------- */

  function bindChannelButtons() {

    document
      .querySelectorAll(
        'button, a'
      )
      .forEach(el => {

        if (
          el.dataset.gsWhatsAppBound === '1'
        ) {

          return;
        }

        const text =
          (
            el.innerText ||
            el.textContent ||
            ''
          )
            .trim()
            .toLowerCase();

        const isWhatsAppButton =
          text.includes(
            'test whatsapp channel'
          ) ||
          text.includes(
            'open whatsapp channel'
          ) ||
          text.includes(
            'open gantit setu channel'
          ) ||
          text.includes(
            'whatsapp channel'
          );

        if (!isWhatsAppButton) {
          return;
        }

        /*
          Don't override the question-level
          button created above.
        */

        if (
          el.classList.contains(
            'publish-whatsapp-channel'
          )
        ) {

          return;
        }

        el.dataset.gsWhatsAppBound =
          '1';

        /*
          Clone element to remove old
          click handlers attached elsewhere.
        */

        const clone =
          el.cloneNode(true);

        el.parentNode.replaceChild(
          clone,
          el
        );

        clone.dataset.gsWhatsAppBound =
          '1';

        clone.addEventListener(
          'click',
          function(event) {

            event.preventDefault();

            event.stopPropagation();

            openChannel();

          },
          true
        );

      });
  }

  /* ---------------------------------------------------------
     Load Existing Configuration
     --------------------------------------------------------- */

  async function loadExisting() {

    /*
      Keep the exact Ganit Setu Channel URL.
    */

    localStorage.setItem(
      STORAGE_KEY,
      CHANNEL_URL
    );

    setConfiguredUI();

    injectQuestionButtons();

    bindChannelButtons();

    return true;
  }

  /* ---------------------------------------------------------
     WhatsApp CSS
     --------------------------------------------------------- */

  function injectStyle() {

    if (
      document.getElementById(
        'ganitsetu-whatsapp-style'
      )
    ) {

      return;
    }

    const style =
      document.createElement(
        'style'
      );

    style.id =
      'ganitsetu-whatsapp-style';

    style.textContent = `

      .publish-whatsapp-channel {

        background:
          #128c7e !important;

        color:
          #fff !important;

        border:
          0 !important;

        border-radius:
          8px !important;

        padding:
          8px 11px !important;

        cursor:
          pointer !important;

        font-weight:
          600 !important;

      }

      .publish-whatsapp-channel:hover {

        filter:
          brightness(.95);

      }

      .publish-whatsapp-channel.whatsapp-ready {

        background:
          #0b7d3e !important;

      }

    `;

    document.head.appendChild(
      style
    );
  }

  /* ---------------------------------------------------------
     Boot
     --------------------------------------------------------- */

  function boot() {

    const connectBtn =
      $('cpConnectWhatsAppBtn');

    if (connectBtn) {

      connectBtn.type =
        'button';

      connectBtn.addEventListener(
        'click',
        function(event) {

          event.preventDefault();

          event.stopPropagation();

          connect();

        },
        true
      );
    }

    injectStyle();

    loadExisting();

    /*
      Watch dynamically generated
      Content Day Planning content.
    */

    const observer =
      new MutationObserver(
        () => {

          injectQuestionButtons();

          bindChannelButtons();

        }
      );

    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true
      }
    );

    /* -------------------------------------------------------
       Public connector API
       ------------------------------------------------------- */

    window.GanitSetuWhatsAppConnector = {

      connect,

      loadExisting,

      openChannel,

      getChannelUrl,

      channelUrl:
        CHANNEL_URL

    };
  }

  /* ---------------------------------------------------------
     Start
     --------------------------------------------------------- */

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

})();
