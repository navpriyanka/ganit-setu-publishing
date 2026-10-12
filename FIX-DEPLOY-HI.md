# Ganit Setu Publishing — Fix Pack (12 Oct 2026)

## इस पैक में क्या सुधारा गया
- Front-end files में पुराना Supabase project URL/key जहाँ hard-coded थे, उन्हें नए project `ucovgluwsiejrhjweuls` और user-provided publishable key से बदला गया।
- `assets/js/supabase-config.js` साझा public configuration के लिए जोड़ी गई।
- मुख्य HTML pages में Supabase library के बाद साझा config लोड होता है। Social Media Manager का duplicate inline client साझा client इस्तेमाल करता है।

## GitHub में कैसे लगाएँ
1. ZIP को Extract करें।
2. Extracted `ganit-setu-publishing-main` folder की सभी files को repository की समान paths पर upload/replace करें।
3. GitHub Pages deployment पूरा होने दें।
4. साइट खोलकर hard refresh करें (Android Chrome: page refresh; जरूरत हो तो browser cache साफ करें)।
5. पहले Admin login करें; Content Day Planning और OAuth के लिए valid Supabase Auth session जरूरी है।

## महत्वपूर्ण सीमाएँ
यह frontend configuration/navigation fix है, live-tested end-to-end repair नहीं। नया project में Edge Functions (`facebook-oauth`, `gemini-generate-post`, `cloudflare-generate-image`, Instagram/YouTube functions), matching OAuth redirect URIs, Auth admin user, RLS/policies, required tables/RPCs और content data भी सही होने चाहिए। Publishing repository में backend function source शामिल नहीं था, इसलिए यह ZIP उन functions को अपने-आप deploy नहीं करती।

`service_role` key, Meta App Secret, YouTube credentials या page tokens browser files में कभी न रखें।
