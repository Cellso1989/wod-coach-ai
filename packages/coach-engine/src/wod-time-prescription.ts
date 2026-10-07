export function readTimePrescription(source: string, kind: 'target' | 'cap'): number[] {
  const marker = kind === 'target' ? '(?:target|meta|objetivo)' : '(?:time[ -]?cap|cap)';
  const pattern = new RegExp(
    `^\\s*${marker}\\s*:?\\s*(\\d+)\\s*(?:min(?:utes|utos)?\\.?|['\\u2019\\u2032])\\s*$`,
    'gim',
  );
  return [...source.matchAll(pattern)].map((match) => Number(match[1]));
}

export function preferredTimePrescription(
  rawText: string | null | undefined,
  extractedText: string | null | undefined,
  kind: 'target' | 'cap',
): number[] {
  const typed = readTimePrescription(rawText ?? '', kind);
  return typed.length ? typed : readTimePrescription(extractedText ?? '', kind);
}
