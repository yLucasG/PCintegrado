// Redeploy after changes with:
//   supabase link --project-ref lyeoxvvhwdhwrscnvwhl
//   supabase functions deploy create-user
// (already deployed to the linked project on 2026-08-27)

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization header' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Invalid session' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: callerProfile, error: profileError } = await adminClient
    .from('perfis_usuarios')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || callerProfile?.role !== 'ADMIN') {
    return jsonResponse({ error: 'Forbidden: apenas ADMIN pode criar usuários' }, 403);
  }

  let body: { email?: string; password?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido' }, 400);
  }

  const { email, password, role } = body;
  if (!email || !password || !role) {
    return jsonResponse({ error: 'email, password e role são obrigatórios' }, 400);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return jsonResponse({ error: createError?.message ?? 'Falha ao criar usuário' }, 400);
  }

  const { error: insertProfileError } = await adminClient
    .from('perfis_usuarios')
    .insert({ id: created.user.id, role });

  if (insertProfileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: insertProfileError.message }, 400);
  }

  return jsonResponse({ id: created.user.id, email: created.user.email, role }, 201);
});
