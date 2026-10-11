GANIT SETU ADMIN PANEL — CONTENT PRODUCTION SETUP UPDATE

This build adds:
- Flexible platform-wise content type checkboxes for Facebook, Instagram, YouTube, WhatsApp Channel and Advertisement.
- Question selection after Content Plan generation.
- Question-to-content mapping that is not locked to the original suggested content type.
- Day-wise and time-wise schedule controls.
- ZIP upload + local package structure validation.
- Partial-publish rule: a missing asset is marked Missing/Pending and must not block other available items.
- WhatsApp remains the existing Ganit Setu WhatsApp Channel workflow; no WhatsApp Business publishing workflow is added.
- Master Prompt generation is intentionally NOT included yet. It will be connected after this setup is approved.

IMPORTANT:
1. Run supabase_content_production_setup.sql once in Supabase SQL Editor for persistent mapping/package tables.
2. The existing Content Day Planning/RPC remains the source of the initial question plan.
3. The ZIP validator checks the package in the browser. Actual per-platform ZIP extraction/upload/publish orchestration is a separate integration step and should use the existing platform Edge Functions/queues.
