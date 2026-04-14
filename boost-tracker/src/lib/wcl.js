// ── WarcraftLogs API client ────────────────────────────────────────────────────
// OAuth2 client_credentials + GraphQL v2

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const GQL_URL   = 'https://www.warcraftlogs.com/api/v2/client';

let _token = null, _tokenExpiry = 0;

export async function getWclToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     'a10bd8bf-6019-4a44-8807-dc0890125c01',
      client_secret: 'QF7bKQN1Mbb7bvdEMDM8vFVxMDRhm34bNzlzm4pr',
    }),
  });

  if (!resp.ok) throw new Error(`Auth WCL échouée (${resp.status})`);
  const json = await resp.json();
  if (!json.access_token) throw new Error('Token WCL invalide — vérifie client_id / client_secret');

  _token = json.access_token;
  _tokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
  return _token;
}

export async function wclQuery(token, query, variables = {}) {
  const resp = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Authorization':  `Bearer ${token}`,
      'Content-Type':   'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!resp.ok) throw new Error(`GraphQL WCL échoué (${resp.status})`);
  const { data, errors } = await resp.json();
  if (errors?.length) throw new Error(errors[0].message);
  return data;
}

export function parseReportCode(url = '') {
  return url.match(/reports\/([A-Za-z0-9]+)/)?.[1] ?? null;
}

export const REPORT_QUERY = `
query($code: String!) {
  reportData {
    report(code: $code) {
      title
      startTime
      fights {
        id
        name
        keystoneLevel
        startTime
        endTime
        kill
        friendlyPlayers
      }
      masterData {
        actors { id name type subType }
      }
    }
  }
}`;
