import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRate, materialGrade, priceComponents, pricingUpdateTime } from '../src/features/pricing/model/rate-calculation';

test('selling rate adds profit as a percentage of base, increase and rolling subtotal', () => {
  assert.deepEqual(calculateRate({base_price:'70',increased_price:'2',rolling_price:'3',profit_percent:'10'}), {
    subtotal:'75.0000',profit_amount:'7.5000',amount:'82.5000',
  });
  assert.deepEqual(calculateRate({base_price:'0.0001',increased_price:'',rolling_price:'',profit_percent:'50'}), {
    subtotal:'0.0001',profit_amount:'0.0001',amount:'0.0002',
  });
  assert.equal(calculateRate({base_price:'0.1',increased_price:'0.2',rolling_price:'0',profit_percent:'0'})?.amount,'0.3000');
  assert.equal(calculateRate({base_price:'10',increased_price:'0',rolling_price:'0',profit_percent:'150'})?.amount,'25.0000');
  assert.deepEqual(priceComponents({amount:'40'}),{base_price:'40',increased_price:'0',rolling_price:'0',profit_percent:'0'});
  assert.equal(materialGrade('Mild Steel'),'MS');assert.equal(materialGrade('EN-8'),'EN8');
  assert.equal(materialGrade('SS304'),null);assert.equal(materialGrade(null),null);
});

test('invalid price inputs and totals exceeding database precision are rejected', () => {
  const valid = {base_price:'70',increased_price:'0',rolling_price:'0',profit_percent:'0'};
  for (const value of ['0','','-1','NaN','Infinity','1e2','1.00001']) {
    assert.equal(calculateRate({...valid,base_price:value}),null);
  }
  assert.equal(calculateRate({...valid,profit_percent:'-1'}),null);
  assert.equal(calculateRate({...valid,base_price:'9999999999999999',increased_price:'1'}),null);
  assert.equal(calculateRate({...valid,base_price:'9007199254740993'})?.amount,'9007199254740993.0000');
  assert.match(pricingUpdateTime('2026-12-31T20:05:30Z'),/1 Jan 2027.*01:35:30.*IST/);
});
