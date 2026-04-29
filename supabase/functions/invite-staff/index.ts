// Invite-staff edge function.
// Verifies the caller is an admin (via their JWT), then uses the service-role
// client to send a Supabase Auth invite email and insert the corresponding
// staff row.
//
// Deploy: supabase functions deploy invite-staff
// Supabase auto-injects SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface InviteBody {
  email: string;
  branch_id: string;
  role?: 'staff' | 'manager' | 'admin';
  name?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json({ error: 'Missing authorization' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: 'Server is missing Supabase env vars' }, 500);
  }

  // 1. Verify caller is an admin.
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

  // 2. Validate body.
  let body: InviteBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const { email, branch_id, role = 'staff', name } = body;
  if (!email || !branch_id) {
    return json({ error: 'email and branch_id are required' }, 400);
  }
  if (!['staff', 'manager', 'admin'].includes(role)) {
    return json({ error: 'invalid role' }, 400);
  }

  // 3. Send invite.
  const { data: invite, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(email);
  if (inviteErr || !invite?.user) {
    return json(
      { error: inviteErr?.message ?? 'Failed to invite user' },
      500
    );
  }

  // 4. Insert staff row.
  const { error: staffErr } = await admin.from('staff').insert({
    user_id: invite.user.id,
    branch_id,
    role,
    name: name ?? null,
  });
  if (staffErr) {
    return json({ error: staffErr.message }, 500);
  }

  return json({ ok: true, user_id: invite.user.id });
});
