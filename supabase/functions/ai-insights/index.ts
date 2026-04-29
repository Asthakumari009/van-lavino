// AI insights edge function — proxies admin requests to the Gemini API.
//
// - Verifies the caller is a Van Lavino admin before doing anything.
// - Pulls recent reviews server-side via the service-role client so the
//   model sees a full, trustworthy corpus (not just what the client sent).
// - Calls Gemini 2.0 Flash for speed/cost, returns the text response.
//
// Deploy:   supabase functions deploy ai-insights --no-verify-jwt
// Secrets:  supabase secrets set GEMINI_API_KEY=<key>
//           (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//            are auto-injected by the platform.)

// @ts-expect-error — Deno-only remote import, resolved at function runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

type Kind = 'review_insights' | 'chat';

interface ReqBody {
  kind: Kind;
  // For `chat`: the admin's free-form question.
  prompt?: string;
  // Optional override for review window; defaults to last 90 days.
  days?: number;
  // Optional branch scope. When null/omitted we aggregate across every branch.
  branch_id?: string | null;
}

interface ReviewRow {
  rating: number;
  body: string | null;
  is_featured: boolean;
  created_at: string;
  customer_name: string | null;
}

const SYSTEM_PROMPT = `You are the AI operations assistant for Van Lavino,
a premium café chain in Hyderabad, India (three branches: Jubilee Hills,
Financial District, Nalagandla). You advise the OWNER — not guests.

Style rules:
- Concise. Bullet points. No flattery, no filler.
- Ground every claim in the data provided. If the data is thin, say so.
- Flag any review that mentions hygiene, allergens, or safety as URGENT.
- Suggestions must be specific and actionable within a week.
- When in doubt, ask a clarifying question instead of guessing.`;

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.4,
        topP: 0.9,
        maxOutputTokens: 1024,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const text: string | undefined =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned no text');
  }
  return text;
}

function summariseReviews(rows: ReviewRow[]): string {
  if (rows.length === 0) return 'No reviews in the selected window.';
  const n = rows.length;
  const avg = rows.reduce((a, r) => a + r.rating, 0) / n;
  const dist = [0, 0, 0, 0, 0];
  for (const r of rows) if (r.rating >= 1 && r.rating <= 5) dist[r.rating - 1]++;
  const lines: string[] = [];
  lines.push(`Window: ${n} reviews, avg ${avg.toFixed(2)}★.`);
  lines.push(
    `Distribution: 1★=${dist[0]}  2★=${dist[1]}  3★=${dist[2]}  4★=${dist[3]}  5★=${dist[4]}`
  );
  lines.push('---');
  lines.push('Sample (most recent 40, oldest first):');
  const sample = rows.slice(0, 40).reverse();
  sample.forEach((r, i) => {
    const who = r.customer_name ?? 'guest';
    lines.push(
      `[${i + 1}] ${r.rating}★ — ${who}${r.is_featured ? ' ⭐' : ''}: ${
        (r.body ?? '(no text)').replace(/\s+/g, ' ').slice(0, 400)
      }`
    );
  });
  return lines.join('\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json({ error: 'Missing authorization' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const geminiKey = Deno.env.get('GEMINI_API_KEY');

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: 'Server is missing Supabase env vars' }, 500);
  }
  if (!geminiKey) {
    return json(
      { error: 'GEMINI_API_KEY is not configured on this function' },
      500
    );
  }

  // 1. Admin gate.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Not signed in' }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: callerStaff } = await admin
    .from('staff')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!callerStaff || callerStaff.role !== 'admin') {
    return json({ error: 'Admin access required' }, 403);
  }

  // 2. Parse body.
  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.kind) return json({ error: 'Missing kind' }, 400);

  try {
    if (body.kind === 'review_insights') {
      const days = Math.min(Math.max(body.days ?? 90, 7), 365);
      const since = new Date(Date.now() - days * 86_400_000).toISOString();

      // Resolve branch name for prompt context if a specific branch was sent.
      let branchLabel = 'all branches';
      if (body.branch_id) {
        const { data: branch } = await admin
          .from('branches')
          .select('name, city')
          .eq('id', body.branch_id)
          .maybeSingle();
        if (branch?.name) {
          branchLabel = `${branch.name}${branch.city ? `, ${branch.city}` : ''}`;
        }
      }

      let reviewsQuery = admin
        .from('reviews')
        .select('rating, body, is_featured, created_at, customer_name')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200);
      if (body.branch_id) {
        reviewsQuery = reviewsQuery.eq('branch_id', body.branch_id);
      }
      const { data: rows, error } = await reviewsQuery;
      if (error) throw error;

      const corpus = summariseReviews((rows ?? []) as ReviewRow[]);
      const userPrompt = [
        `Scope: ${branchLabel}. Window: last ${days} days.`,
        '',
        'Review data:',
        corpus,
        '',
        'Produce the following, in this exact order, each as its own section:',
        '',
        '## Sentiment Snapshot',
        '- One paragraph, 2-3 sentences. Overall mood + biggest shift vs. earlier weeks if visible.',
        '',
        '## Top Themes (Praise)',
        '- Bullet list, max 5. Each bullet: theme — count — one representative quote.',
        '',
        '## Top Themes (Complaints)',
        '- Bullet list, max 5. Each bullet: theme — count — one representative quote.',
        '',
        '## URGENT Flags',
        '- Any mention of hygiene, allergens, illness, staff conduct, or safety. If none, say "None spotted".',
        '',
        '## Three Wins This Week',
        '- Three concrete actions the owner can take in the next 7 days to raise average rating. Each: action — expected impact — effort (low/medium/high).',
      ].join('\n');

      const answer = await callGemini(geminiKey, SYSTEM_PROMPT, userPrompt);
      return json({ ok: true, kind: body.kind, text: answer });
    }

    if (body.kind === 'chat') {
      const q = (body.prompt ?? '').trim();
      if (!q) return json({ error: 'Empty prompt' }, 400);

      let branchLabel = 'all 3 branches';
      if (body.branch_id) {
        const { data: branch } = await admin
          .from('branches')
          .select('name, city')
          .eq('id', body.branch_id)
          .maybeSingle();
        if (branch?.name) {
          branchLabel = `${branch.name}${branch.city ? `, ${branch.city}` : ''}`;
        }
      }

      // Counts scoped to the selected branch (or global if none).
      const reviewsCount = admin
        .from('reviews')
        .select('id', { count: 'exact', head: true });
      const ordersCount = admin
        .from('orders')
        .select('id', { count: 'exact', head: true });
      if (body.branch_id) {
        reviewsCount.eq('branch_id', body.branch_id);
        ordersCount.eq('branch_id', body.branch_id);
      }
      const [{ count: reviewCount }, { count: orderCount }] = await Promise.all([
        reviewsCount,
        ordersCount,
      ]);

      const context = [
        `Business: Van Lavino café, Hyderabad.`,
        `Scope: ${branchLabel}.`,
        `Data snapshot: reviews=${reviewCount ?? 0}, orders=${orderCount ?? 0}.`,
        `If the question requires data the assistant does not have, ask the owner to open the relevant dashboard tab instead of guessing.`,
      ].join('\n');

      const userPrompt = `Context:\n${context}\n\nOwner asks:\n${q}`;
      const answer = await callGemini(geminiKey, SYSTEM_PROMPT, userPrompt);
      return json({ ok: true, kind: body.kind, text: answer });
    }

    return json({ error: 'Unknown kind' }, 400);
  } catch (err) {
    console.error('[ai-insights]', err);
    return json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'AI insights failed',
      },
      500
    );
  }
});
