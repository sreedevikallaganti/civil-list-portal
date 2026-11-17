import { describe, expect, it } from 'vitest';
import { ASSISTANT_TOOLS, newToolContext, runAssistantTool, type PbReader } from '@/lib/ai/assistantTools';

/* A tiny in-memory PocketBase that understands the filters the tools send. */
const DATA: Record<string, Record<string, any>[]> = {
  ias_directory: [
    { id: 'ias000000000001', name: 'Anil Kumar', service: 'IAS', batch: 1988, cadre: 'Rajasthan', designation: 'Chief Secretary', email: 'anil@x.in', contact_number: '+91 90000 00001' },
    { id: 'ias000000000002', name: 'Beena Rao', service: 'IAS', batch: 1988, cadre: 'Tamil Nadu ', designation: 'Secretary', email: 'beena@x.in' },
    { id: 'ias000000000003', name: 'Chitra Iyer', service: 'IAS', batch: 1990, cadre: 'Kerala', designation: 'Collector' },
  ],
  ips_directory: [
    { id: 'ips000000000001', name: 'Dev Singh', service: 'IPS', batch: 1988, cadre: 'Rajasthan', designation: 'DGP' },
  ],
  meetings: [
    { id: 'm1', officer_id: 'ias000000000002', officer_name: 'Beena Rao', officer_type: 'IAS', meeting_date: '2026-05-01 00:00:00.000Z', meeting_time: '10:00', duration: 60, status: 'Completed', city: 'Chennai', agenda: 'Port project' },
    { id: 'm2', officer_name: 'Someone', meeting_date: '2026-11-03 00:00:00.000Z', meeting_time: '16:00', duration: 60, status: 'Scheduled', agenda: 'Budget' },
  ],
};

function matches(row: Record<string, any>, filter: string): boolean {
  return filter.split(' && ').every((part) => {
    let m = /^(\w+) = (\d+)$/.exec(part);
    if (m) return Number(row[m[1]]) === Number(m[2]);
    m = /^(\w+) = "(.*)"$/.exec(part);
    if (m) return String(row[m[1]]) === m[2];
    m = /^(\w+) != "(.*)"$/.exec(part);
    if (m) return String(row[m[1]]) !== m[2];
    m = /^(\w+) ~ "(.*)"$/.exec(part);
    if (m) return String(row[m[1]] ?? '').toLowerCase().includes(m[2].toLowerCase());
    m = /^meeting_date >= "(\S+) 00:00:00"$/.exec(part);
    if (m) return String(row.meeting_date).slice(0, 10) >= m[1];
    m = /^meeting_date <= "(\S+) 23:59:59"$/.exec(part);
    if (m) return String(row.meeting_date).slice(0, 10) <= m[1];
    throw new Error(`fake PocketBase can't read: ${part}`);
  });
}

const fakePb: PbReader = {
  async list(collection, { filter = '', perPage = 50, page = 1 }) {
    const rows = (DATA[collection] || []).filter((r) => !filter || matches(r, filter));
    const items = rows.slice((page - 1) * perPage, page * perPage);
    return { items, totalItems: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / perPage)) };
  },
};

const run = async (name: string, input: unknown) => {
  const ctx = newToolContext(fakePb, '2026-10-28');
  const res = await runAssistantTool(ctx, name, input);
  return { ctx, res, out: JSON.parse(res.isError && !res.content.startsWith('{') ? '{}' : res.content) };
};

describe('tool definitions', () => {
  it('every tool has a handler and an object schema', async () => {
    for (const t of ASSISTANT_TOOLS) {
      expect(t.input_schema.type).toBe('object');
      const { res } = await run(t.name, {});
      expect(res.content).not.toMatch(/Unknown tool/);
    }
  });
});

describe('search_officers', () => {
  it('filters by batch and service and never returns contact details', async () => {
    const { out, ctx } = await run('search_officers', { batch_year: 1988, service: 'IAS' });
    expect(out.results).toHaveLength(1);
    expect(out.results[0].officers.map((o: any) => o.name)).toEqual(['Anil Kumar', 'Beena Rao']);
    expect(JSON.stringify(out)).not.toMatch(/@x\.in|\+91/);
    expect(ctx.people.map((p) => p.ref)).toEqual(['IAS:ias000000000001', 'IAS:ias000000000002']);
  });
  it('marks who has been met before', async () => {
    const { out } = await run('search_officers', { batch_year: 1988, service: 'IAS' });
    const beena = out.results[0].officers.find((o: any) => o.name === 'Beena Rao');
    expect(beena).toMatchObject({ met_before: 1, last_met: '2026-05-01' });
  });
  it('searches both services by cadre (any designation)', async () => {
    const { out } = await run('search_officers', { cadre: 'Rajasthan' });
    expect(out.results.flatMap((r: any) => r.officers.map((o: any) => `${o.service} ${o.name}`))).toEqual(['IAS Anil Kumar', 'IPS Dev Singh']);
  });
  it('asks for a filter instead of listing everyone', async () => {
    const { res } = await run('search_officers', {});
    expect(res.isError).toBe(true);
  });
});

describe('batchmates', () => {
  it('lists the same batch and service, without the officer, met-before first', async () => {
    const { out } = await run('batchmates', { officer_name: 'Anil Kumar' });
    expect(out.batch).toBe('1988');
    expect(out.batchmates.map((o: any) => o.name)).toEqual(['Beena Rao']);
  });
  it('can include the other service', async () => {
    const { out } = await run('batchmates', { officer_name: 'Anil Kumar', include_other_service: true });
    expect(out.batchmates.map((o: any) => o.name)).toEqual(['Beena Rao', 'Dev Singh']);
  });
});

describe('people_met_before', () => {
  it('finds people met in a state', async () => {
    const { out } = await run('people_met_before', { state: 'Tamil Nadu' });
    expect(out.people).toEqual([expect.objectContaining({ name: 'Beena Rao', times_met: 1, last_met: '2026-05-01' })]);
  });
});

describe('check_availability', () => {
  it('reports a clash and suggests free slots', async () => {
    const { out } = await run('check_availability', { date: '2026-11-03', start_time: '16:30', duration_minutes: 30 });
    expect(out.requested_is_free).toBe(false);
    expect(out.clashes_with).toMatch(/Budget/);
    expect(out.free_slots[0]).toBe('09:30');
  });
  it('rejects a bad date', async () => {
    const { res } = await run('check_availability', { date: 'next tuesday' });
    expect(res.isError).toBe(true);
  });
});

describe('draft_meeting', () => {
  it('returns a draft only — resolving directory people and keeping unknown names', async () => {
    const { out, ctx } = await run('draft_meeting', {
      title: '1988 Batch Meet', mode: 'online', date: '2026-11-03', time: '4:00 pm', duration_minutes: 60,
      people: [{ name: 'Anil Kumar', id: 'ias000000000001', service: 'IAS' }, { name: 'Beena Rao' }, { name: 'Walk In Guest' }],
    });
    expect(out.draft_ready).toBe(true);
    expect(ctx.drafts[0]).toMatchObject({
      title: '1988 Batch Meet', refs: ['IAS:ias000000000001', 'IAS:ias000000000002'], names: ['Walk In Guest'],
      date: '2026-11-03', time: '16:00', mode: 'online', duration: 60,
    });
  });
  it('drops an invalid date instead of guessing', async () => {
    const { ctx } = await run('draft_meeting', { title: 'x', mode: 'offline', date: '3rd Nov', people: [{ name: 'Anil Kumar' }] });
    expect(ctx.drafts[0].date).toBe('');
  });
});
