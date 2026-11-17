import { describe, expect, it } from 'vitest';
import { orgIdOf, scopeFetch, scopeRequest, withOrgFilter } from '../tenancy';

const ORG = 'abcdefghij12345';
const list = '/pb/api/collections/meetings/records';

describe('scopeRequest', () => {
  it('stamps new records in tenant collections with the org', () => {
    const { options } = scopeRequest(list, { method: 'POST', body: { agenda: 'x' } }, ORG, false);
    expect(options.body).toEqual({ agenda: 'x', org: ORG });

    const fd = new FormData();
    fd.set('agenda', 'x');
    scopeRequest(list, { method: 'POST', body: fd }, ORG, false);
    expect(fd.get('org')).toBe(ORG);
  });

  it('keeps an org that is already set, and leaves other collections and updates alone', () => {
    expect(scopeRequest(list, { method: 'POST', body: { org: 'zzzzzzzzzzzzzzz' } }, ORG, true).options.body.org).toBe('zzzzzzzzzzzzzzz');
    expect(scopeRequest('/pb/api/collections/organizations/records', { method: 'POST', body: { name: 'A' } }, ORG, true).options.body).toEqual({ name: 'A' });
    expect(scopeRequest(`${list}/rec123456789012`, { method: 'PATCH', body: { agenda: 'y' } }, ORG, false).options.body).toEqual({ agenda: 'y' });
  });

  it('filters lists by org for superusers only', () => {
    const su = scopeRequest(list, { method: 'GET', query: { filter: 'status = "x"' } }, ORG, true);
    expect(su.options.query!.filter).toBe(`(status = "x") && org = "${ORG}"`);
    const user = scopeRequest(list, { method: 'GET', query: { filter: 'status = "x"' } }, ORG, false);
    expect(user.options.query!.filter).toBe('status = "x"'); // the API rules scope app users
    const one = scopeRequest(`${list}/rec123456789012`, { method: 'GET', query: {} }, ORG, true);
    expect(one.options.query!.filter).toBeUndefined();
  });

  it('allOrgs lets the platform owner look across organisations (and is never sent to PocketBase)', () => {
    const r = scopeRequest(list, { method: 'GET', query: { filter: 'org = "q"', allOrgs: true } }, ORG, true);
    expect(r.options.query).toEqual({ filter: 'org = "q"' });
    const notOwner = scopeRequest(list, { method: 'GET', query: { allOrgs: true } }, ORG, false);
    expect(notOwner.options.query).toEqual({});
  });

  it('does nothing without a valid org', () => {
    const opts = { method: 'POST', body: { a: 1 } };
    expect(scopeRequest(list, opts, '', true).options).toBe(opts);
    expect(scopeRequest(list, opts, 'bad"id', true).options).toBe(opts);
  });
});

describe('helpers', () => {
  it('withOrgFilter', () => {
    expect(withOrgFilter('', ORG)).toBe(`org = "${ORG}"`);
    expect(withOrgFilter('a = 1 || b = 2', ORG)).toBe(`(a = 1 || b = 2) && org = "${ORG}"`);
  });

  it('orgIdOf: app users use their own org', () => {
    expect(orgIdOf({ collectionName: 'users', org: ORG })).toBe(ORG);
    expect(orgIdOf({ collectionName: 'users', org: '' })).toBe('');
    expect(orgIdOf(null)).toBe('');
  });

  it('scopeFetch only changes superuser list URLs', () => {
    const url = '/pb/api/collections/users/records?page=1&perPage=30';
    expect(scopeFetch(url, { collectionName: 'users', org: ORG })).toBe(url);
    expect(scopeFetch(url, { collectionName: '_superusers' })).toBe(url); // no active org picked
  });
});
