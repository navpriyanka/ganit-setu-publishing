# Migration checklist

- [ ] New Supabase project created
- [ ] Existing tables and RLS policies exported/recreated
- [ ] Required RPCs recreated (`get_content_question_pool_status`, `generate_content_plan_v4`, and any others found in SQL/functions)
- [ ] Edge Functions deployed (Facebook OAuth/publish, Instagram publish, YouTube publish, WhatsApp channel workflow, Gemini generation, Cloudflare image generation, platform verification, and queue/bridge functions as applicable)
- [ ] Storage buckets and policies recreated (`content-media` and video/brand buckets used by the pages)
- [ ] Provider secrets added as Edge Function secrets (never frontend JS)
- [ ] OAuth redirect/callback URLs updated and provider connection re-authorized if required
- [ ] Temporary media retention policy agreed and scheduled cleanup function tested
- [ ] Test login/session, plan generation, asset upload, queue insert, scheduled publishing, each platform publish, and cleanup
- [ ] Old project retained until all tests pass
