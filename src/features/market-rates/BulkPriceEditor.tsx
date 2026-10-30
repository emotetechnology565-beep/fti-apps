import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Field, Row, Txt, c } from '@shared/ui';
import { marketRatesApi } from './api';
import { priceTotal, rateTime, type Location, type Rate } from './model';

type Draft = { base: string; increase: string; previous: string | null };
export function BulkPriceEditor({
  locations,
  current,
  canPublish,
  onDirty,
  onBusy,
  onSaved,
}: {
  locations: Location[];
  current: { location_id: string; latest: Rate | null }[];
  canPublish: boolean;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const initial = Object.fromEntries(
    locations.map((location) => {
      const latest = current.find(
        (row) => row.location_id === location.id,
      )?.latest;
      return [
        location.id,
        {
          base: latest?.base_price ?? '',
          increase: latest?.increase_amount ?? '0',
          previous: latest?.id ?? null,
        },
      ];
    }),
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initial);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [commonIncrease, setCommonIncrease] = useState('');
  const changed = locations.filter(
    (location) =>
      Number(drafts[location.id].base) !== Number(initial[location.id].base) ||
      Number(drafts[location.id].increase) !==
        Number(initial[location.id].increase),
  );
  const invalid = changed.some(
    (location) =>
      !priceTotal(drafts[location.id].base, drafts[location.id].increase),
  );
  function update(next: Record<string, Draft>) {
    setDrafts(next);
    onDirty(JSON.stringify(next) !== JSON.stringify(initial));
    setReview(false);
    setMessage('');
  }
  async function publish() {
    if (busy || invalid || !changed.length) return;
    setBusy(true);
    onBusy(true);
    setMessage('');
    try {
      const n = await marketRatesApi.bulkPublish(
        changed.map((location) => ({
          location_id: location.id,
          ...drafts[location.id],
        })),
      );
      onDirty(false);
      setMessage(`Published ${n} district prices.`);
      await onSaved();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <Card style={styles.group}>
      <Txt style={styles.title}>
        {locations.length} selected district{locations.length === 1 ? '' : 's'}
      </Txt>
      <Txt>
        INR per metric tonne. Edit each row; sale price = base + increase. A
        negative increase reduces the price.
      </Txt>
      {canPublish ? (
        <View style={styles.tools}>
          <Field
            label="Common increase amount (₹ / tonne)"
            value={commonIncrease}
            onChangeText={setCommonIncrease}
            editable={!busy}
            placeholder="e.g. 200 or -200"
          />
          <Button
            secondary
            disabled={busy || !/^-?\d{1,9}(\.\d{1,2})?$/.test(commonIncrease)}
            onPress={() =>
              update(
                Object.fromEntries(
                  Object.entries(drafts).map(([id, draft]) => [
                    id,
                    { ...draft, increase: commonIncrease },
                  ]),
                ),
              )
            }
          >
            Apply increase to selected districts
          </Button>
        </View>
      ) : null}
      {locations.map((location) => {
        const draft = drafts[location.id],
          total = priceTotal(draft.base, draft.increase),
          latest = current.find(
            (row) => row.location_id === location.id,
          )?.latest;
        return (
          <View key={location.id} style={styles.district}>
            <Txt style={styles.label}>
              {location.district} · {location.state}
            </Txt>
            <Txt>
              {latest
                ? `Last published ${rateTime(latest.published_at)} IST`
                : 'No price published yet. Enter the first rate below.'}
            </Txt>
            <View style={styles.columns}>
              <View style={styles.cell}>
                <Field
                  label={`Base price — ${location.district}, ${location.state}`}
                  numeric
                  editable={!busy && canPublish}
                  value={draft.base}
                  onChangeText={(base) =>
                    update({ ...drafts, [location.id]: { ...draft, base } })
                  }
                />
              </View>
              <View style={styles.cell}>
                <Field
                  label={`Increase amount — ${location.district}, ${location.state}`}
                  editable={!busy && canPublish}
                  value={draft.increase}
                  onChangeText={(increase) =>
                    update({ ...drafts, [location.id]: { ...draft, increase } })
                  }
                />
              </View>
              <View style={[styles.cell, styles.total]}>
                <Txt style={styles.label}>Sale price (₹ / tonne)</Txt>
                <Txt style={styles.amount}>
                  {total
                    ? `₹${Number(total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                    : '—'}
                </Txt>
              </View>
            </View>
          </View>
        );
      })}
      {invalid ? (
        <Txt accessibilityRole="alert">
          Each changed row needs positive base and sale prices, with up to two
          decimal places.
        </Txt>
      ) : null}
      {review ? (
        <View style={styles.tools}>
          <Txt style={styles.label}>
            Review {changed.length} changed district prices
          </Txt>
          {changed.map((location) => (
            <Txt key={location.id}>
              {location.district} · {location.state}: ₹
              {current.find((row) => row.location_id === location.id)?.latest
                ?.sale_price ?? 'Not set'}{' '}
              → ₹
              {priceTotal(
                drafts[location.id].base,
                drafts[location.id].increase,
              )}
            </Txt>
          ))}
          <Txt>
            All changes publish together. If any district changed since loading,
            none of this batch will be saved. Earlier prices stay in history.
          </Txt>
          <Row style={{ flexWrap: 'wrap' }}>
            <Button disabled={busy} onPress={() => void publish()}>
              {busy ? 'Publishing…' : 'Confirm & publish prices'}
            </Button>
            <Button secondary disabled={busy} onPress={() => setReview(false)}>
              Back to editing
            </Button>
          </Row>
        </View>
      ) : (
        <Button
          disabled={!canPublish || busy || invalid || !changed.length}
          onPress={() => setReview(true)}
        >
          Review price updates
        </Button>
      )}
      {!canPublish ? (
        <Txt>Publishing requires price.publish permission.</Txt>
      ) : null}
      <Button
        secondary
        disabled={busy}
        onPress={() => {
          update(initial);
          setCommonIncrease('');
        }}
      >
        Reset to saved prices
      </Button>
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
    </Card>
  );
}
const styles = StyleSheet.create({
  group: { gap: 14 },
  title: { fontSize: 20, fontWeight: '700' },
  label: { fontWeight: '700' },
  tools: { padding: 14, backgroundColor: c.bgSubtle, borderRadius: 8, gap: 10 },
  district: {
    gap: 12,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: c.line,
  },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cell: { flexBasis: 210, flexGrow: 1 },
  total: {
    padding: 14,
    backgroundColor: c.brandBlueLight,
    borderRadius: 8,
    gap: 12,
  },
  amount: { fontSize: 24, fontWeight: '700', color: c.blue },
});
