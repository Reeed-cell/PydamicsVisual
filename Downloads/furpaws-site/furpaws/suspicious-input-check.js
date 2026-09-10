// Suspicious input detection — a narrow, honest check for patterns
// commonly seen in injection/script probing attempts (not a general
// "detect hacking" system — see the conversation this was scoped in
// for why that's an intentional limitation, not an oversight).
//
// Checks form text against a short list of concrete patterns: SQL
// injection shapes, script tags, common XSS payloads. A match logs
// the attempt via the log_suspicious_input RPC, which auto-shuts-down
// the public site if 5+ matches happen within 10 minutes.

const SUSPICIOUS_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /on(error|load|click|mouseover)\s*=/i,
  /(\bunion\b.{0,20}\bselect\b)/i,
  /(\bdrop\s+table\b)/i,
  /(\bor\b\s+['"]?1['"]?\s*=\s*['"]?1['"]?)/i,
  /;\s*(drop|delete|update|insert)\s+/i,
  /\.\.\/\.\.\//,
];

async function checkSuspiciousInput(fields, pageUrl) {
  const combined = Object.values(fields).filter(Boolean).join(' ');

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(combined)) {
      try {
        await supabaseClient.rpc('log_suspicious_input', {
          p_type: 'injection_pattern',
          p_detail: `Matched pattern in form input on ${pageUrl}`,
          p_page: pageUrl,
        });
      } catch (err) {
        console.error('Could not log suspicious input:', err);
      }
      return true;
    }
  }
  return false;
}
