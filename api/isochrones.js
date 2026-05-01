// POST /api/isochrones
// Body: { points: [[lng,lat],...], minutes: number }  (max 5 points per call)
//
// Proxies to OpenRouteService isochrones API. Caches results in Supabase
// keyed by (lng, lat, minutes) so repeat lookups are instant + don't burn quota.
//
// Required env vars:
//   ORS_API_KEY                — get free at https://openrouteservice.org/dev/#/signup (500 calls/day)
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY  — for caching writes (RLS bypass)

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const orsKey = process.env.ORS_API_KEY;
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_ANON_KEY;
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!orsKey) return res.status(500).json({ error: 'Server misconfigured: missing ORS_API_KEY' });

  // Caller must be authenticated
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Missing authentication token' });

  const userClient = createClient(sbUrl, sbKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData || !userData.user) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const points = Array.isArray(body.points) ? body.points : [];
  const minutes = Number(body.minutes) || 10;
  if (!points.length) return res.status(400).json({ error: 'points array required' });
  if (points.length > 5) return res.status(400).json({ error: 'Max 5 points per request (ORS limit)' });

  const adminClient = createClient(sbUrl, sbService, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Round coords to 5 decimals for cache key consistency
  const round = n => Math.round(n * 1e5) / 1e5;

  // Look up cached isochrones first
  const cached = {};
  for (const [lng, lat] of points) {
    const { data } = await adminClient.from('isochrones')
      .select('lng,lat,minutes,geojson')
      .eq('lng', round(lng)).eq('lat', round(lat)).eq('minutes', minutes)
      .maybeSingle();
    if (data && data.geojson) cached[`${round(lng)},${round(lat)}`] = data.geojson;
  }

  // Find which points need fetching
  const need = points.filter(([lng,lat]) => !cached[`${round(lng)},${round(lat)}`]);
  if (need.length) {
    const orsRes = await fetch('https://api.openrouteservice.org/v2/isochrones/driving-car', {
      method: 'POST',
      headers: {
        'Authorization': orsKey,
        'Content-Type': 'application/json',
        'Accept': 'application/geo+json'
      },
      body: JSON.stringify({
        locations: need,
        range_type: 'time',
        range: [minutes * 60],
        attributes: ['area']
      })
    });
    if (!orsRes.ok) {
      const txt = await orsRes.text();
      return res.status(502).json({ error: `ORS error ${orsRes.status}: ${txt.slice(0,200)}` });
    }
    const orsData = await orsRes.json();
    // ORS returns features in same order as locations input
    const features = orsData.features || [];
    for (let i = 0; i < need.length; i++) {
      const [lng, lat] = need[i];
      const feat = features[i];
      if (!feat) continue;
      const key = `${round(lng)},${round(lat)}`;
      cached[key] = feat;
      // Cache write (best-effort)
      adminClient.from('isochrones').upsert({
        lng: round(lng), lat: round(lat), minutes,
        geojson: feat
      }, { onConflict: 'lng,lat,minutes' }).then(() => {}).catch(() => {});
    }
  }

  // Return in input order
  const features = points.map(([lng,lat]) => cached[`${round(lng)},${round(lat)}`] || null);
  return res.status(200).json({
    type: 'FeatureCollection',
    minutes,
    features: features.filter(Boolean)
  });
};
