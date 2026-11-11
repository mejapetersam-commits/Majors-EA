export interface Env {
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_ID: string;
  VERIFY_TOKEN: string;
  APP_SECRET: string;
  ANTHROPIC_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  OWNER_NUMBER: string;
  MODEL: string;
  OWNER_NAME: string;
}

const enc = new TextEncoder();

/* ---------- helpers ---------- */

const sb = (env: Env, path: string, init: RequestInit = {}) =>
  fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

async function verifySignature(body: string, sig: string | null, secret: string) {
  if (!sig) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sig === `sha256=${hex}`;
}

async function sendWhatsApp(env: Env, to: string, text: string) {
  await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 4000) } }),
  });
}

const nairobiNow = () =>
  new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'full', timeStyle: 'short' });

/* ---------- tools ---------- */

const TOOLS = [
  {
    name: 'remember',
    description: 'Save a durable fact or note about the owner, their projects, clients or preferences.',
    input_schema: { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'] },
  },
  {
    name: 'recall',
    description: 'Search saved memories by keyword. Use before answering questions about things the owner may have told you before.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'add_reminder',
    description: 'Schedule a reminder. due_at must be ISO 8601 with the Nairobi offset, e.g. 2026-11-12T09:00:00+03:00.',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' }, due_at: { type: 'string' } },
      required: ['text', 'due_at'],
    },
  },
  {
    name: 'list_reminders',
    description: 'List upcoming unsent reminders.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'set_brand_profile',
    description: 'Save one part of the owner\'s brand profile (e.g. niche, audience, platforms, tone, topics_to_own, topics_to_avoid, posting_frequency, example_posts). Overwrites that key.',
    input_schema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] },
  },
  {
    name: 'save_draft',
    description: 'Save a social media post draft for the owner to review. One call per post.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'instagram, linkedin, x, tiktok, facebook, etc.' },
        content: { type: 'string' },
        notes: { type: 'string', description: 'Optional: visual idea, hashtags, best time to post' },
      },
      required: ['platform', 'content'],
    },
  },
  {
    name: 'list_drafts',
    description: 'List drafts by status: draft, approved, rejected. Defaults to draft.',
    input_schema: { type: 'object', properties: { status: { type: 'string' } } },
  },
  {
    name: 'update_draft',
    description: 'Edit a draft\'s content and/or change its status (draft, approved, rejected).',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'number' }, content: { type: 'string' }, status: { type: 'string' } },
      required: ['id'],
    },
  },
];

async function runTool(env: Env, name: string, input: any): Promise<string> {
  try {
    if (name === 'remember') {
      await sb(env, 'memories', { method: 'POST', body: JSON.stringify({ content: input.fact }) });
      return 'Saved.';
    }
    if (name === 'recall') {
      const q = encodeURIComponent(`*${input.query}*`);
      const r = await sb(env, `memories?content=ilike.${q}&order=created_at.desc&limit=10`);
      const rows: any[] = await r.json();
      return rows.length ? rows.map((m) => `- ${m.content}`).join('\n') : 'Nothing found.';
    }
    if (name === 'add_reminder') {
      const due = new Date(input.due_at);
      if (isNaN(due.getTime())) return 'Invalid date.';
      await sb(env, 'reminders', { method: 'POST', body: JSON.stringify({ text: input.text, due_at: due.toISOString() }) });
      return `Reminder set for ${due.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}.`;
    }
    if (name === 'list_reminders') {
      const r = await sb(env, 'reminders?sent=eq.false&order=due_at.asc&limit=20');
      const rows: any[] = await r.json();
      return rows.length
        ? rows.map((x) => `- ${new Date(x.due_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}: ${x.text}`).join('\n')
        : 'No upcoming reminders.';
    }
    if (name === 'set_brand_profile') {
      await sb(env, 'brand_profile?on_conflict=key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ key: input.key, value: input.value }),
      });
      return 'Saved.';
    }
    if (name === 'save_draft') {
      const r = await sb(env, 'drafts', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ platform: input.platform, content: input.content, notes: input.notes || null }),
      });
      const [d]: any[] = await r.json();
      return `Draft #${d.id} saved.`;
    }
    if (name === 'list_drafts') {
      const status = encodeURIComponent(input.status || 'draft');
      const r = await sb(env, `drafts?status=eq.${status}&order=id.desc&limit=15`);
      const rows: any[] = await r.json();
      return rows.length
        ? rows.map((d) => `#${d.id} [${d.platform}] ${d.content}${d.notes ? `\n(notes: ${d.notes})` : ''}`).join('\n\n')
        : 'No drafts.';
    }
    if (name === 'update_draft') {
      const patch: any = {};
      if (input.content) patch.content = input.content;
      if (input.status) patch.status = input.status;
      await sb(env, `drafts?id=eq.${input.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      return `Draft #${input.id} updated.`;
    }
    return 'Unknown tool.';
  } catch (e: any) {
    return `Tool error: ${e.message}`;
  }
}

/* ---------- agent loop ---------- */

async function think(env: Env, history: { role: string; content: any }[]) {
  const pr = await sb(env, 'brand_profile?select=key,value');
  const prRows: any[] = pr.ok ? await pr.json() : [];
  const profileText = prRows.length ? prRows.map((r) => `- ${r.key}: ${r.value}`).join('\n') : '(empty)';

  const system = `You are ${env.OWNER_NAME}'s EA (executive assistant), talking over WhatsApp.
Current time in Nairobi: ${nairobiNow()}.
Be casual, direct and brief. No filler, no long lists unless asked. Give recommendations, not both-sides essays.
Use tools: remember durable facts, recall before answering things that may have been told to you earlier, set reminders in Nairobi time (+03:00).

You are also ${env.OWNER_NAME}'s social media manager.
Brand profile:
${profileText}

If the brand profile is empty or thin, onboard first: ask ONE question at a time (what he does, target audience, platforms, tone of voice, topics to own, topics to avoid, how often he wants to post, 2-3 example posts he likes) and save each answer with set_brand_profile.
When asked for content, write posts that sound like him and fit each platform's native style. Save every post with save_draft and show them in your reply with their #IDs so he can say "approve 4" or "rewrite 4".
Publishing is NOT connected yet. Never say anything has been posted or scheduled; approved drafts just wait in the queue.`;

  const messages = [...history];
  for (let i = 0; i < 6; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: env.MODEL, max_tokens: 1024, system, tools: TOOLS, messages }),
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));

    if (data.stop_reason !== 'tool_use') {
      return data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    }
    messages.push({ role: 'assistant', content: data.content });
    const results = [];
    for (const b of data.content) {
      if (b.type === 'tool_use') {
        results.push({ type: 'tool_result', tool_use_id: b.id, content: await runTool(env, b.name, b.input) });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return 'I got stuck in a loop on that one. Try rephrasing?';
}

async function handleMessage(env: Env, msg: any) {
  const from: string = msg.from;
  if (from !== env.OWNER_NUMBER) return; // single-user lock

  if (msg.type !== 'text') {
    await sendWhatsApp(env, from, 'Text only for now. Voice notes coming soon.');
    return;
  }
  const text: string = msg.text.body;

  // Dedup (WhatsApp retries webhooks)
  const ins = await sb(env, 'messages', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ wa_msg_id: msg.id, role: 'user', content: text }),
  });
  const inserted: any[] = await ins.json();
  if (!inserted.length) return;

  // Last 20 turns of history (includes the message just stored)
  const h = await sb(env, 'messages?select=role,content&order=id.desc&limit=20');
  const rows: any[] = await h.json();
  const history = rows.reverse();
  while (history.length && history[0].role !== 'user') history.shift();

  let reply: string;
  try {
    reply = await think(env, history);
  } catch (e: any) {
    console.error(e);
    reply = 'Something broke on my end. Check the Worker logs.';
  }
  await sb(env, 'messages', { method: 'POST', body: JSON.stringify({ role: 'assistant', content: reply }) });
  await sendWhatsApp(env, from, reply);
}

/* ---------- worker entry ---------- */

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      // Meta webhook verification handshake
      if (url.searchParams.get('hub.verify_token') === env.VERIFY_TOKEN) {
        return new Response(url.searchParams.get('hub.challenge') || '', { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    if (req.method === 'POST') {
      const raw = await req.text();
      if (!(await verifySignature(raw, req.headers.get('x-hub-signature-256'), env.APP_SECRET))) {
        return new Response('Bad signature', { status: 401 });
      }
      const body = JSON.parse(raw);
      const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
      for (const m of messages) ctx.waitUntil(handleMessage(env, m));
      return new Response('ok'); // ack fast
    }

    return new Response('Major\'s EA online');
  },

  async scheduled(_e: ScheduledEvent, env: Env) {
    const now = new Date().toISOString();
    const r = await sb(env, `reminders?sent=eq.false&due_at=lte.${encodeURIComponent(now)}`);
    const due: any[] = await r.json();
    for (const x of due) {
      await sendWhatsApp(env, env.OWNER_NUMBER, `⏰ Reminder: ${x.text}`);
      await sb(env, `reminders?id=eq.${x.id}`, { method: 'PATCH', body: JSON.stringify({ sent: true }) });
    }
  },
};
