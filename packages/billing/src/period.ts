/** Calendar period keys derived in UTC. New key = new period = automatic reset. */
export interface PeriodKeys {
  /** 'YYYY-MM-DD' (UTC). */
  day: string;
  /** 'YYYY-MM' (UTC). */
  month: string;
}

export function periodKeys(at: Date): PeriodKeys {
  const iso = at.toISOString(); // always UTC, 'YYYY-MM-DDTHH:mm:ss.sssZ'
  const day = iso.slice(0, 10);
  const month = iso.slice(0, 7);
  return { day, month };
}
