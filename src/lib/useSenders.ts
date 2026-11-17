'use client';

// useSenders — the accounts a meeting can be sent from (Google Calendar, Meet and invite emails),
// with their connection status, from /api/google/senders. See lib/senders for the setup.
import { useCallback, useEffect, useState } from 'react';
import { apiJSON } from '@/lib/apiClient';

export type SenderInfo = {
  id: string;
  email: string;
  label: string;
  title?: string;
  canEmail: boolean; // has its own mailbox password (otherwise emails go via the main mailbox)
  google: { connected: boolean | null; reason?: string; message?: string };
};

// defaultSender = SENDER_DEFAULT; yourSender = the account the signed-in user's meetings go out from
type SendersResponse = { senders: SenderInfo[]; defaultSender: string; yourSender?: string; allCalendars: boolean; org?: string; principal?: string | null };

export function useSenders(enabled = true) {
  const [data, setData] = useState<SendersResponse | null>(null);

  const load = useCallback(async (fresh = false) => {
    try {
      const r = await apiJSON<SendersResponse>('/api/google/senders', { fresh });
      setData({ senders: r.senders || [], defaultSender: r.defaultSender, yourSender: r.yourSender, allCalendars: !!r.allCalendars, org: r.org, principal: r.principal ?? null });
    } catch {
      setData({ senders: [], defaultSender: 'main', allCalendars: false });
    }
  }, []);

  useEffect(() => {
    // fetch-on-mount: setState happens after the request resolves
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (enabled) void load();
  }, [enabled, load]);

  const senders = data?.senders ?? null;
  const from = senders?.find((s) => s.id === (data?.yourSender || data?.defaultSender)) ?? senders?.[0];
  // who sends the invites, and which calendars every meeting is saved in
  const summary = from
    ? { from, calendars: data!.allCalendars ? senders!.map((s) => s.email || s.label) : [from.email || from.label] }
    : null;

  return { senders, defaultSender: data?.defaultSender ?? 'main', yourSender: data?.yourSender ?? null, allCalendars: !!data?.allCalendars, summary, reload: load,
    org: data?.org || 'Brihaspathi Technologies', principal: data?.principal ?? null };
}
