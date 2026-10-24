import test from 'node:test';
import assert from 'node:assert/strict';
import type { Identity } from '../src/features/auth/model/identity';
import { availableStaffSections, selectedStaffSection, staffSections } from '../src/features/admin/model/sections';

const identity = (permissions: string[], status = 'active') => ({profile: {account_status: status},permissions} as Identity);
test('staff section navigation shows only assigned tools and rejects unavailable deep links', () => {
  const sales = identity(['staff.access','sales.manage']);
  assert.deepEqual(availableStaffSections(sales).map(s => s.id),['sales']);
  assert.equal(selectedStaffSection(sales,'payments')?.id,'sales');
  assert.equal(selectedStaffSection(sales,['payments'])?.id,'sales');
  assert.deepEqual(availableStaffSections(identity(['sales.manage'])),[]);
  assert.deepEqual(availableStaffSections(identity(['staff.access','sales.manage'],'blocked')),[]);
  assert.equal(selectedStaffSection(identity(['staff.access']),'sales'),undefined);
  const superAdmin = identity(['staff.access',...staffSections.flatMap(s => [...s.permissions])]);
  assert.equal(availableStaffSections(superAdmin).length,16);
  assert.equal(selectedStaffSection(superAdmin,'business-stock')?.id,'business-stock');
});
