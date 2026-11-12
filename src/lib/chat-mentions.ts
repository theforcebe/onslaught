import type { ChatMention } from "./chat";

// Keep selected identities attached to their exact text as the draft is edited.
// Editing inside a mention turns it back into ordinary text, never another person.
export function moveMentions(
  before: string,
  after: string,
  mentions: ChatMention[],
) {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let oldEnd = before.length,
    newEnd = after.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    before[oldEnd - 1] === after[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  const delta = newEnd - oldEnd;
  return mentions.flatMap((mention) => {
    if (mention.end <= start) return [mention];
    if (mention.start >= oldEnd)
      return [
        { ...mention, start: mention.start + delta, end: mention.end + delta },
      ];
    return [];
  });
}

export function mentionQuery(
  body: string,
  caret: number,
  mentions: ChatMention[],
) {
  if (mentions.some((m) => caret > m.start && caret <= m.end)) return null;
  const match = /(?:^|\s)@([^@\n]{0,100})$/.exec(body.slice(0, caret));
  if (!match) return null;
  return { start: caret - match[1].length - 1, end: caret, query: match[1] };
}

export function messageParts(body: string, mentions: ChatMention[]) {
  const parts: { text: string; id?: string }[] = [];
  let cursor = 0;
  for (const m of [...mentions].sort((a, b) => a.start - b.start)) {
    if (m.start < cursor || m.end > body.length || m.end <= m.start) continue;
    if (m.start > cursor) parts.push({ text: body.slice(cursor, m.start) });
    parts.push({ text: body.slice(m.start, m.end), id: m.id });
    cursor = m.end;
  }
  if (cursor < body.length) parts.push({ text: body.slice(cursor) });
  return parts;
}
