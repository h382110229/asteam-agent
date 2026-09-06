/**
 * Lightweight ANSI escape sequence to HTML converter
 * Supports standard colors (30-37), bright colors (90-97),
 * background colors (40-47, 100-107), bold, dim, underline, and reset.
 */

const ANSI_COLOR_MAP: Record<number, string> = {
  30: '#1e293b', // Black
  31: '#ef4444', // Red
  32: '#10b981', // Green
  33: '#f59e0b', // Yellow
  34: '#3b82f6', // Blue
  35: '#a855f7', // Magenta
  36: '#06b6d4', // Cyan
  37: '#e2e8f0', // White

  90: '#64748b', // Bright Black (Gray)
  91: '#f87171', // Bright Red
  92: '#34d399', // Bright Green
  93: '#fbbf24', // Bright Yellow
  94: '#60a5fa', // Bright Blue
  95: '#c084fc', // Bright Magenta
  96: '#22d3ee', // Bright Cyan
  97: '#ffffff', // Bright White
};

const ANSI_BG_MAP: Record<number, string> = {
  40: '#020617',
  41: '#7f1d1d',
  42: '#064e3b',
  43: '#78350f',
  44: '#1e3a8a',
  45: '#581c87',
  46: '#164e63',
  47: '#334155',

  100: '#1e293b',
  101: '#991b1b',
  102: '#065f46',
  103: '#92400e',
  104: '#1e40af',
  105: '#6b21a8',
  106: '#155e75',
  107: '#475569',
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function ansiToHtml(raw: string): string {
  if (!raw) return '';

  const ansiRegex = /(?:\x1b|\u001b)\[([\d;]*)m/g;

  let resultHtml = '';
  let lastIndex = 0;

  let currentFg: string | null = null;
  let currentBg: string | null = null;
  let isBold = false;
  let isDim = false;
  let isUnderline = false;

  const openSpan = () => {
    const styles: string[] = [];
    if (currentFg) styles.push(`color:${currentFg}`);
    if (currentBg) styles.push(`background-color:${currentBg}`);
    if (isBold) styles.push('font-weight:600');
    if (isDim) styles.push('opacity:0.7');
    if (isUnderline) styles.push('text-decoration:underline');

    if (styles.length > 0) {
      return `<span style="${styles.join(';')}">`;
    }
    return '';
  };

  const closeSpan = () => {
    if (currentFg || currentBg || isBold || isDim || isUnderline) {
      return '</span>';
    }
    return '';
  };

  let hasOpenSpan = false;
  let match: RegExpExecArray | null;

  while ((match = ansiRegex.exec(raw)) !== null) {
    const textChunk = raw.slice(lastIndex, match.index);
    if (textChunk) {
      resultHtml += escapeHtml(textChunk);
    }

    lastIndex = ansiRegex.lastIndex;
    const codes = match[1] ? match[1].split(';').map(n => parseInt(n, 10)) : [0];

    for (const code of codes) {
      if (isNaN(code) || code === 0) {
        if (hasOpenSpan) {
          resultHtml += closeSpan();
          hasOpenSpan = false;
        }
        currentFg = null;
        currentBg = null;
        isBold = false;
        isDim = false;
        isUnderline = false;
      } else if (code === 1) {
        isBold = true;
      } else if (code === 2) {
        isDim = true;
      } else if (code === 4) {
        isUnderline = true;
      } else if (code === 22) {
        isBold = false;
        isDim = false;
      } else if (code === 24) {
        isUnderline = false;
      } else if (code === 39) {
        currentFg = null;
      } else if (code === 49) {
        currentBg = null;
      } else if (ANSI_COLOR_MAP[code]) {
        currentFg = ANSI_COLOR_MAP[code];
      } else if (ANSI_BG_MAP[code]) {
        currentBg = ANSI_BG_MAP[code];
      }
    }

    if (hasOpenSpan) {
      resultHtml += closeSpan();
      hasOpenSpan = false;
    }

    const newOpen = openSpan();
    if (newOpen) {
      resultHtml += newOpen;
      hasOpenSpan = true;
    }
  }

  if (lastIndex < raw.length) {
    resultHtml += escapeHtml(raw.slice(lastIndex));
  }

  if (hasOpenSpan) {
    resultHtml += closeSpan();
  }

  return resultHtml;
}
