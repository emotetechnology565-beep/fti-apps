import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNotificationPhones } from '../src/features/catalog/model/notification-recipients';

test('notification numbers normalize, split and deduplicate before saving', () => {
  assert.deepEqual(parseNotificationPhones('+919000000001,+919000000002'), ['+919000000001', '+919000000002']);
  assert.deepEqual(parseNotificationPhones('+91 (900) 000-0001; +919000000001\n+919000000002,'), ['+919000000001', '+919000000002']);
  for (const value of ['', ', ;', '9000000001', '+919000000001,invalid', '+0', '+1234567890123456']) {
    assert.throws(() => parseNotificationPhones(value), /valid WhatsApp/);
  }
});
