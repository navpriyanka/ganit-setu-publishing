/* Ganit Setu Publishing — public browser configuration. Never put service-role or provider secrets here. */
(function () {
  const config = Object.freeze({
    url: "https://ucovgluwsiejrhjweuls.supabase.co",
    publishableKey: "sb_publishable_1XHxsjb_vNK8BYHHGiIYeQ__ouET5_Q"
  });
  window.GS_SUPABASE_CONFIG = config;
  if (window.supabase && typeof window.supabase.createClient === "function" && !window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
})();
