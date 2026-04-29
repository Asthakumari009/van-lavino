// Minimal markdown → HTML converter for native blog posts.
//
// Why inline (not the `marked` package)? The blog composer only needs a
// fixed subset — headings, bold/italic, links, lists, quotes, inline code,
// images — and shipping a 50 KB dependency for that is overkill. Output is
// sanitized via DOMPurify on render in BlogPostPage, so we don't need to
// defend against XSS here.

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

// Slugify a title into a URL-safe slug. Used in the composer to derive a
// default `slug` field from the title; the admin can override before save.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

// Inline replacements — applied to the contents of a block after escaping.
// Order matters: images before links (`![…](…)` is also a link pattern),
// bold before italic (`**foo**` would otherwise match as `*` + `*foo*` + `*`).
function inline(s: string): string {
  // Escape first; replacements re-introduce only the tags we trust.
  let out = escapeHtml(s);
  // images
  out = out.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" />'
  );
  // links
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  // bold (**) — non-greedy so repeated bolds in one line work
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // italic (*) — must not match the `**` we just consumed
  out = out.replace(/(^|[^*])\*(?!\*)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
  // inline code
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  return out;
}

function blockToHtml(block: string): string {
  const trimmed = block.trim();
  if (!trimmed) return '';

  // Heading (# / ## / ### / #### / ##### / ######)
  const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
  if (hMatch) {
    const level = hMatch[1].length;
    return `<h${level}>${inline(hMatch[2])}</h${level}>`;
  }

  // Block quote — every line in the block starts with `>`
  if (trimmed.split('\n').every((l) => /^>\s?/.test(l))) {
    const text = trimmed
      .split('\n')
      .map((l) => l.replace(/^>\s?/, ''))
      .join(' ');
    return `<blockquote>${inline(text)}</blockquote>`;
  }

  // Unordered list — every line starts with `-` or `*`
  if (trimmed.split('\n').every((l) => /^[-*]\s+/.test(l))) {
    const items = trimmed
      .split('\n')
      .map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  }

  // Ordered list — every line starts with `\d+. `
  if (trimmed.split('\n').every((l) => /^\d+\.\s+/.test(l))) {
    const items = trimmed
      .split('\n')
      .map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ''))}</li>`)
      .join('');
    return `<ol>${items}</ol>`;
  }

  // Paragraph — single line breaks within a paragraph become spaces (CommonMark-ish)
  return `<p>${inline(trimmed.replace(/\n/g, ' '))}</p>`;
}

export function markdownToHtml(md: string): string {
  if (!md.trim()) return '';
  // Split on blank lines into blocks.
  const blocks = md
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => blockToHtml(b))
    .filter(Boolean);
  return blocks.join('\n\n');
}
