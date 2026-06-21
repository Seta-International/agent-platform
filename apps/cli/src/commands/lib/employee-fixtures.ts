export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

// Vietnamese name order: family middle ... given(last token).
// Email = given.(rest concatenated)@seta-international.vn
export function deriveEmail(
  fullName: string,
  employeeId: string | number,
  taken: Set<string>,
): string {
  const tokens = stripDiacritics(fullName).trim().split(/\s+/);
  const given = (tokens.at(-1) ?? '').toLowerCase();
  const rest = tokens.slice(0, -1).join('').toLowerCase();
  const base = `${given}.${rest}@seta-international.vn`;
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  const withId = `${given}.${rest}.${employeeId}@seta-international.vn`;
  taken.add(withId);
  return withId;
}

const TOTALS = /^total/i;

type Classified =
  | { kind: 'header'; project: string; code: string | null }
  | {
      kind: 'member';
      id: string;
      name: string;
      role: string | null;
      ratio: number | null;
      manDays: number | null;
    }
  | { kind: 'skip' };

// Column order (0-indexed): No(0), ID(1), Name(2), Roll(3), Project(4), Code(5), TKCP(6), total_days(7), proj_days(8), total_ratio(9), ratio(10)
export function classifyRow(row: unknown[]): Classified {
  const [, id, name, roll, project, code, , , projDays, , ratio] = row;
  const nameStr = typeof name === 'string' ? name.trim() : '';
  if (nameStr && TOTALS.test(nameStr)) return { kind: 'skip' };
  if (id != null && nameStr) {
    return {
      kind: 'member',
      id: String(id),
      name: nameStr,
      role: typeof roll === 'string' && roll.trim() ? roll.trim() : null,
      ratio: typeof ratio === 'number' ? ratio : null,
      manDays: typeof projDays === 'number' ? projDays : null,
    };
  }
  if (typeof project === 'string' && project.trim() && id == null && !nameStr) {
    return {
      kind: 'header',
      project: project.trim(),
      code: typeof code === 'string' && code.trim() ? code.trim() : null,
    };
  }
  return { kind: 'skip' };
}
