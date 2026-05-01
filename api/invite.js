// POST /api/invite
// Body: { email: string, fullName?: string }
// Header: Authorization: Bearer <user-access-token>
//
// Verifies the caller is authenticated (any logged-in team member can invite),
// then uses the service role key to send an invite email via Supabase Auth.
//
// Required env vars:
//   SUPABASE_URL              — already set
//   SUPABASE_ANON_KEY         — already set
//   SUPABASE_SERVICE_ROLE_KEY — server-only, never exposed to browser
//   APP_URL (optional)        — used as the redirect target after the user
//                               clicks the invite link in their email

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase env vars' });
  }

  // Verify caller is authenticated
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Missing authentication token' });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData || !userData.user) {
    return res.status(401).json({ error: 'Invalid or expired session — please sign in again' });
  }
  const callerEmail = userData.user.email;

  // Parse request body
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const email = (body && body.email || '').trim();
  const fullName = (body && body.fullName || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email address required' });
  }

  // Send the invite using the service role
  const adminClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const redirectTo = process.env.APP_URL
    ? `${process.env.APP_URL}/`
    : `https://${req.headers.host || 'maccas-tracka.vercel.app'}/`;

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName, invited_by: callerEmail } : { invited_by: callerEmail },
    redirectTo
  });

  if (error) {
    return res.status(400).json({ error: error.message || 'Invite failed' });
  }

  return res.status(200).json({
    success: true,
    user: { id: data && data.user && data.user.id, email },
    invitedBy: callerEmail
  });
};
