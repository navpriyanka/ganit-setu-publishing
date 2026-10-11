# Ganit Setu Publishing — Repository Package

यह पुराने Admin Panel से चुने गए publishing/content modules का अलग repository-ready package है।

## शामिल मॉड्यूल
- Social Media Manager
- Content Day Planning
- Video Scene Manager
- Content Creation (Question Selection + unified content creation)
- Master Prompt (supporting page)

## महत्वपूर्ण स्थिति
यह package पुराने Supabase project के URLs, publishable/anon key, Edge Function endpoints, tables और Storage buckets को reference करता है। नया Supabase project बन जाने के बाद इसे live मानकर न चलाएँ; पहले configuration, schema, Edge Functions, Storage policies और OAuth callbacks migrate तथा test करने होंगे। पुराने project को तब तक न हटाएँ।

## नई repository में उपयोग
1. इस ZIP की files को नई `ganit-setu-publishing` GitHub repository में upload करें (folder की files repository root पर हों)।
2. GitHub Pages/hosting चालू करने से पहले `assets/js` में Supabase URL/key के hard-coded references खोजें और नए project के values से बदलें। Browser में केवल publishable/anon key रखें—service-role key या provider secrets कभी न डालें।
3. पुराने backend के SQL schema/RPCs, Edge Functions, Storage buckets/policies और OAuth redirect URLs को नए project में migrate करें।
4. YouTube/Meta/WhatsApp provider credentials को नए Supabase Edge Function secrets में set करें और OAuth reconnect/test करें।
5. `index.html`/`dashboard.html` खोलकर हर module अलग-अलग test करें; खासकर upload, scheduling, publish queue, OAuth callback और publish test।

## Storage cleanup requirement
मौजूदा Video Scene Manager का code media को स्थायी रूप से Supabase Storage में save करता है; Content Planning/Content Creation भी `content-media` bucket में upload करते हैं। इस ZIP में automatic expiry cleanup को अभी लागू नहीं माना जाना चाहिए। इसे सही करने के लिए retention अवधि तय कर scheduled Edge Function/cron cleanup, आवश्यक database references के cleanup और failure logging को नए backend में जोड़कर test करना होगा। केवल browser-side delete या upload के बाद तुरंत delete करने से publish workflows टूट सकते हैं।

## सावधानी
- यह extraction है, complete backend migration नहीं।
- WhatsApp का existing Ganit Setu WhatsApp Channel workflow ही रखें; WhatsApp Business publishing flow न जोड़ें।
- Facebook integration Content Day Planning में ही है; उसे Social Media Manager में न ले जाएँ।
