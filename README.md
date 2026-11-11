# Major's EA (v0.1, single-user)

## Setup
1. **Supabase**: run `schema.sql` in the SQL editor. Copy the project URL + service role key.
2. **Meta**: developers.facebook.com → create app → add WhatsApp product. Grab the temporary token, phone number ID, and App Secret (Settings → Basic). Add your own number as a test recipient.
3. **Deploy**:
   ```
   npm install
   npx wrangler secret put WHATSAPP_TOKEN
   npx wrangler secret put WHATSAPP_PHONE_ID
   npx wrangler secret put VERIFY_TOKEN        # any random string you choose
   npx wrangler secret put APP_SECRET
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_KEY
   npx wrangler secret put OWNER_NUMBER        # 2547XXXXXXXX, digits only
   npx wrangler deploy
   ```
4. **Webhook**: Meta app → WhatsApp → Configuration → callback URL = your Worker URL, verify token = your VERIFY_TOKEN, subscribe to `messages`.
5. Message the test number from your phone.

## Notes
- Temporary Meta tokens expire in 24h. Create a System User permanent token before relying on it.
- WhatsApp only allows free-form replies within 24h of your last message. Reminders firing outside that window need an approved template message (add later).
- Next: voice notes (download media → Whisper → same loop), then calendar/email tools.
