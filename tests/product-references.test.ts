import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import dataset from '../src/features/catalog/data/fastener-references.json';
import { chartsForProduct, referenceRows } from '../src/features/catalog/model/product-references';

test('reference charts retain their source PDFs and omit blank cells without inferring variants', () => {
  assert.equal(dataset.charts.length, 4);
  assert.equal(dataset.rows.length, 945);
  for (const chart of dataset.charts) {
    assert.equal(createHash('sha256').update(readFileSync(`docs/${chart.filename}`)).digest('hex'), chart.sha256);
    assert.ok(chart.pdfUrl.startsWith('https://ftis.b-cdn.net/product-documents/fasteners/'));
    assert.ok(chart.pdfUrl.includes(chart.sha256));
  }
  assert.equal(referenceRows('metric-weights','hex-bolt','M36','10').length, 0);
  assert.equal(referenceRows('metric-weights','hex-bolt','M10','50')[0].weightKgPer1000, 40.6);
  assert.equal(referenceRows('metric-weights','hex-nut','M10')[0].weightKgPer1000, 11.69);
  assert.equal(referenceRows('washer-weights','plain-washer','M10')[0].weightKgPer1000, 3.9);
  assert.equal(referenceRows('washer-weights','spring-washer','M10')[0].weightKgPer1000, 2.5);
});

test('each chart block uses its own length column and metric/inch filters remain separate', () => {
  assert.equal(referenceRows('metric-weights','hex-bolt','M12','18')[0].weightKgPer1000,31.51);
  assert.equal(referenceRows('metric-weights','hex-bolt','M27','40')[0].weightKgPer1000,350);
  assert.equal(referenceRows('unc-weights','hex-bolt','1/4','3/8')[0].weightKgPer1000,11.05);
  assert.equal(referenceRows('unc-weights','hex-bolt','5/8','1')[0].weightKgPer1000,151.6);
  assert.equal(referenceRows('unc-weights','hex-bolt','1.1/4','2.1/2')[0].weightKgPer1000,1389);
  assert.equal(referenceRows('unc-weights','hex-bolt','1 1/4','2 1/2')[0].weightKgPer1000,1389);
  assert.equal(referenceRows('metric-weights','hex-bolt','m-12','18 mm').length,1);
  assert.equal(referenceRows('metric-weights','hex-bolt','1/2','1').length,0);
});

test('questionable source figures are retained and explicitly marked for confirmation', () => {
  const entry = referenceRows('metric-weights','hex-bolt','M20','100')[0];
  assert.equal(entry.weightKgPer1000,270.75);
  assert.match(entry.reviewNote ?? '', /confirmation/);
  assert.ok(referenceRows('metric-weights','hex-bolt','M6','40')[0].reviewNote);
  assert.equal(referenceRows('bolt-dimensions','hex-bolt','M6')[0].dimensions?.['Thread pitch'],'1.00');
  assert.equal(referenceRows('bolt-dimensions','hex-bolt','M24')[0].dimensions?.['Head thickness max.'],'15.55');
});

test('charts attach only to matching imported product families and washer types', () => {
  for (const slug of ['half-thread-hex-bolt','full-thread-hex-screw']) assert.equal(chartsForProduct(slug).length,3);
  assert.deepEqual(chartsForProduct('plain-washers')[0].groups.map(g=>g.id),['plain-washer','machined-washer']);
  assert.deepEqual(chartsForProduct('spring-washers')[0].groups.map(g=>g.id),['spring-washer']);
  for (const slug of ['ss-hex-screw','hsfg-hex-nut','hv-washer','hdg-pack-washers','csk-screw','j-type-blade','unknown']) {
    assert.deepEqual(chartsForProduct(slug),[],slug);
  }
});
