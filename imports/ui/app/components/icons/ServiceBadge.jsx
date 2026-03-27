const SERVICE_STYLE_MAP = {
  provider: {
    openai: { glyph: 'OA', bg: '#e7f5ee', fg: '#0f6d4f' },
    gemini: { glyph: 'G', bg: '#e7efff', fg: '#2857c5' },
    'aws-bedrock': { glyph: 'AWS', bg: '#fff1df', fg: '#b15a00' },
    'google-vertex-ai': { glyph: 'VA', bg: '#e9f4ff', fg: '#1f65b8' },
    'corporate-ai-model': { glyph: 'AI', bg: '#eef1f7', fg: '#425372' },
    'lm-studio': { glyph: 'LM', bg: '#f2ebff', fg: '#6941c6' },
    ollama: { glyph: 'OL', bg: '#f1f4f5', fg: '#44525a' },
  },
  channel: {
    gmail: { glyph: 'GM', bg: '#fde9e7', fg: '#b73d2a' },
    'imap-email': { glyph: 'IM', bg: '#eef5f2', fg: '#2a6a55' },
    telegram: { glyph: 'TG', bg: '#e8f4ff', fg: '#1765ad' },
    twitter: { glyph: 'X', bg: '#eef2f5', fg: '#1f2937' },
    linkedin: { glyph: 'IN', bg: '#e8f1ff', fg: '#0b5cab' },
    reddit: { glyph: 'RD', bg: '#fff1e7', fg: '#c25100' },
    github: { glyph: 'GH', bg: '#f1f2f4', fg: '#1f2937' },
    facebook: { glyph: 'FB', bg: '#e8eeff', fg: '#315fc7' },
    'google-drive': { glyph: 'GD', bg: '#ebf8ea', fg: '#2b7a38' },
    shell: { glyph: 'SH', bg: '#eef1f4', fg: '#374151' },
    'claude-code': { glyph: 'CC', bg: '#fff2e8', fg: '#b6531b' },
    deepseek: { glyph: 'DS', bg: '#eef2ff', fg: '#4a3ec7' },
    sharepoint: { glyph: 'SP', bg: '#e7f6f4', fg: '#0f766e' },
    onedrive: { glyph: 'OD', bg: '#eaf3ff', fg: '#1d5fd0' },
    'sas-institute': { glyph: 'SAS', bg: '#eef2ff', fg: '#434cc9' },
  },
};

function resolveServiceStyle(kind, id, name) {
  const bucket =
    SERVICE_STYLE_MAP[String(kind || '').trim().toLowerCase()] || {};
  const explicit = bucket[String(id || '').trim()] || null;
  if (explicit) return explicit;

  const fallbackGlyph =
    String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?';

  return {
    glyph: fallbackGlyph,
    bg: '#eef2f7',
    fg: '#526072',
  };
}

export function ServiceBadge({
  kind = 'provider',
  id = '',
  name = '',
  size = 'md',
  className = '',
}) {
  const style = resolveServiceStyle(kind, id, name);
  const classes = ['service-badge', `service-badge-${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={classes}
      aria-hidden="true"
      style={{
        '--service-badge-bg': style.bg,
        '--service-badge-fg': style.fg,
      }}
    >
      <span className="service-badge-glyph">{style.glyph}</span>
    </span>
  );
}
