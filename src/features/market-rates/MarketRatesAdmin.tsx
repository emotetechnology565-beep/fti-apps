import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hasPermission } from '@features/auth';
import { useAuth } from '@features/auth/ui';
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Row,
  Txt,
  c,
} from '@shared/ui';
import { marketRatesApi } from './api';
import { exportMarketHistory } from './export-history';
import {
  categories,
  priceTotal,
  rateTime,
  historyRangeError,
  historyPreset,
  type Category,
  type Location,
  type MarketSettings,
  type Rate,
} from './model';

const money = (value: string) =>
  `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const queryRoot = ['admin-market-rates'];

function Choices({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: readonly string[];
  selected: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.group}>
      <Txt style={styles.label}>{label}</Txt>
      <ScrollView
        horizontal
        contentContainerStyle={styles.choices}
        showsHorizontalScrollIndicator={false}
      >
        {values.map((value) => (
          <Chip
            key={value}
            selected={selected === value}
            onPress={() => onChange(value)}
          >
            {value}
          </Chip>
        ))}
      </ScrollView>
    </View>
  );
}

function PriceEditor({
  location,
  latest,
  canPublish,
  onDirty,
  onSaved,
  onBusy,
}: {
  location: Location;
  latest?: Rate;
  canPublish: boolean;
  onDirty: (v: boolean) => void;
  onSaved: () => Promise<void>;
  onBusy: (v: boolean) => void;
}) {
  const [base, setBase] = useState(latest?.base_price ?? '');
  const [increase, setIncrease] = useState(latest?.increase_amount ?? '0');
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const total = priceTotal(base, increase);
  const changed =
    total !== null &&
    (!latest ||
      Number(base) !== Number(latest.base_price) ||
      Number(increase) !== Number(latest.increase_amount));
  function update(field: 'base' | 'increase', value: string) {
    const nextBase = field === 'base' ? value : base,
      nextIncrease = field === 'increase' ? value : increase;
    setBase(nextBase);
    setIncrease(nextIncrease);
    setReview(false);
    setMessage('');
    onDirty(
      nextBase !== (latest?.base_price ?? '') ||
        nextIncrease !== (latest?.increase_amount ?? '0'),
    );
  }
  async function publish() {
    if (busy || !changed || !total) return;
    setBusy(true);
    onBusy(true);
    setMessage('');
    try {
      await marketRatesApi.publish(
        location.id,
        latest?.id ?? null,
        base.trim(),
        increase.trim(),
      );
      onDirty(false);
      setReview(false);
      setMessage('Price published. History has been updated.');
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
      <Row style={styles.wrap}>
        <Txt style={styles.title}>{location.district}</Txt>
        <Badge>{location.category}</Badge>
      </Row>
      <Txt>{location.state} · INR per metric tonne</Txt>
      <Txt>
        {latest
          ? `Last published ${rateTime(latest.published_at)} IST`
          : 'No price published yet. Enter the first rate below.'}
      </Txt>
      <View style={styles.priceRow}>
        <View style={styles.priceCell}>
          <Field
            label="Base price (₹ / tonne)"
            numeric
            editable={!busy && canPublish}
            value={base}
            onChangeText={(v) => update('base', v)}
            placeholder="e.g. 46300"
          />
        </View>
        <View style={styles.priceCell}>
          <Field
            label="Increase amount (₹ / tonne)"
            editable={!busy && canPublish}
            value={increase}
            onChangeText={(v) => update('increase', v)}
            placeholder="e.g. 200 or -200"
          />
        </View>
        <View style={[styles.priceCell, styles.total]}>
          <Txt style={styles.label}>Sale price (₹ / tonne)</Txt>
          <Txt style={styles.amount}>{total ? money(total) : '—'}</Txt>
          <Txt>Base + increase</Txt>
        </View>
      </View>
      <Txt>
        Increase is an added amount, not the resulting price. Use a negative
        amount for a reduction. Sale price calculates automatically.
      </Txt>
      {!total && base !== '' ? (
        <Txt accessibilityRole="alert">
          Enter a positive base and sale price, with up to two decimal places.
          Do not use commas.
        </Txt>
      ) : null}
      {canPublish ? (
        <>
          {review ? (
            <View style={styles.review}>
              <Txt style={styles.label}>Review this update</Txt>
              <Txt>
                {location.category} · {location.state} · {location.district}
              </Txt>
              <Txt>
                Base: {latest ? money(latest.base_price) : 'Not set'} →{' '}
                {money(base)}
              </Txt>
              <Txt>
                Increase: {latest ? money(latest.increase_amount) : 'Not set'} →{' '}
                {money(increase)}
              </Txt>
              <Txt>
                Sale: {latest ? money(latest.sale_price) : 'Not set'} →{' '}
                {money(total!)}
              </Txt>
              <Txt>
                The publication date and time will be recorded automatically.
                Earlier prices remain in history.
              </Txt>
              <Row style={styles.wrap}>
                <Button disabled={busy} onPress={() => void publish()}>
                  {busy ? 'Publishing…' : 'Confirm & publish price'}
                </Button>
                <Button
                  secondary
                  disabled={busy}
                  onPress={() => setReview(false)}
                >
                  Back to editing
                </Button>
              </Row>
            </View>
          ) : (
            <Button disabled={busy || !changed} onPress={() => setReview(true)}>
              Review price update
            </Button>
          )}
        </>
      ) : (
        <Txt>Publishing requires price.publish permission.</Txt>
      )}
      <Button
        secondary
        disabled={busy}
        onPress={() => {
          setBase(latest?.base_price ?? '');
          setIncrease(latest?.increase_amount ?? '0');
          setReview(false);
          setMessage('');
          onDirty(false);
        }}
      >
        Reset to last saved price
      </Button>
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
    </Card>
  );
}

function History({
  location,
  user,
}: {
  location: Location;
  user: string | undefined;
}) {
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const query = useQuery({
    queryKey: [...queryRoot, user, 'history', location.id, range, offset],
    queryFn: () =>
      marketRatesApi.history(location.id, range.from, range.to, offset),
    retry: false,
  });
  function apply(from: string, to: string) {
    const invalid = historyRangeError(from, to);
    if (invalid) {
      setError(invalid);
      return;
    }
    setFromInput(from);
    setToInput(to);
    setRange({ from, to });
    setOffset(0);
    setError('');
    setNotice('');
  }
  async function exportRows(single?: Rate) {
    if (exporting) return;
    setExporting(true);
    setError('');
    setNotice('');
    try {
      const count = await exportMarketHistory(
        location,
        range.from,
        range.to,
        single,
      );
      setNotice(`Exported ${count} price update${count === 1 ? '' : 's'}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <Card style={styles.group}>
      <Txt style={styles.title}>Price history</Txt>
      <Txt>Every published update, newest first. All times are IST.</Txt>
      <Row style={styles.wrap}>
        <Button
          secondary
          disabled={exporting}
          onPress={() => {
            const r = historyPreset(1);
            apply(r.from, r.to);
          }}
        >
          Today
        </Button>
        <Button
          secondary
          disabled={exporting}
          onPress={() => {
            const r = historyPreset(7);
            apply(r.from, r.to);
          }}
        >
          Last 7 days
        </Button>
        <Button secondary disabled={exporting} onPress={() => apply('', '')}>
          All dates
        </Button>
      </Row>
      <View style={styles.priceRow}>
        <View style={styles.priceCell}>
          <Field
            label="From date (YYYY-MM-DD, IST)"
            editable={!exporting}
            value={fromInput}
            onChangeText={setFromInput}
            placeholder="2026-10-24"
          />
        </View>
        <View style={styles.priceCell}>
          <Field
            label="To date (YYYY-MM-DD, IST)"
            editable={!exporting}
            value={toInput}
            onChangeText={setToInput}
            placeholder="2026-10-30"
          />
        </View>
      </View>
      <Row style={styles.wrap}>
        <Button
          secondary
          disabled={exporting}
          onPress={() => apply(fromInput, toInput)}
        >
          Apply date range
        </Button>
        <Button
          disabled={
            exporting || fromInput !== range.from || toInput !== range.to
          }
          onPress={() => void exportRows()}
        >
          {exporting ? 'Exporting…' : 'Export history CSV'}
        </Button>
      </Row>
      <Txt>
        Showing {range.from || 'earliest'} through {range.to || 'latest'} (IST,
        inclusive). For one day, enter the same date in both fields. Export
        includes all matching updates, not just this page.
      </Txt>
      {fromInput !== range.from || toInput !== range.to ? (
        <Txt>Apply your date changes before exporting.</Txt>
      ) : null}
      {error ? <Txt accessibilityRole="alert">{error}</Txt> : null}
      {notice ? <Txt accessibilityRole="alert">{notice}</Txt> : null}
      {query.isPending ? (
        <Txt>Loading history…</Txt>
      ) : query.error ? (
        <Empty
          title="History unavailable"
          description={query.error.message}
          action={
            <Button onPress={() => void query.refetch()}>Retry history</Button>
          }
        />
      ) : (
        <>
          {!query.data.length ? (
            <Txt>No published prices for this selection.</Txt>
          ) : (
            <ScrollView horizontal>
              <View style={{ minWidth: 820 }}>
                <Row style={styles.historyRow}>
                  {[
                    'Published (IST)',
                    'Base price',
                    'Increase',
                    'Sale price',
                    'Export',
                  ].map((v, i) => (
                    <Txt
                      key={v}
                      style={[
                        styles.label,
                        i === 0 ? styles.dateCell : styles.numberCell,
                      ]}
                    >
                      {v}
                    </Txt>
                  ))}
                </Row>
                {query.data.map((rate) => (
                  <Row key={rate.id} style={styles.historyRow}>
                    <Txt style={styles.dateCell}>
                      {rateTime(rate.published_at)}
                    </Txt>
                    <Txt style={styles.numberCell}>
                      {money(rate.base_price)}
                    </Txt>
                    <Txt style={styles.numberCell}>
                      {money(rate.increase_amount)}
                    </Txt>
                    <Txt style={[styles.numberCell, styles.label]}>
                      {money(rate.sale_price)}
                    </Txt>
                    <Button
                      secondary
                      disabled={exporting}
                      onPress={() => void exportRows(rate)}
                    >
                      Export this update
                    </Button>
                  </Row>
                ))}
              </View>
            </ScrollView>
          )}
          <Row style={styles.wrap}>
            <Button
              secondary
              disabled={offset === 0 || query.isFetching}
              onPress={() => setOffset((v) => Math.max(0, v - 20))}
            >
              Newer updates
            </Button>
            <Button
              secondary
              disabled={query.data.length < 20 || query.isFetching}
              onPress={() => setOffset((v) => v + 20)}
            >
              Older updates
            </Button>
          </Row>
        </>
      )}
    </Card>
  );
}

function SettingsEditor({
  settings,
  onDirty,
  onSaved,
  onBusy,
}: {
  settings: MarketSettings;
  onDirty: (v: boolean) => void;
  onSaved: () => Promise<void>;
  onBusy: (v: boolean) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dirty = (Object.keys(settings) as (keyof MarketSettings)[]).some(
    (key) => settings[key] !== draft[key],
  );
  function update(
    key: 'notes' | 'support' | 'sms' | 'whatsapp',
    value: string,
  ) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    onDirty(JSON.stringify(next) !== JSON.stringify(settings));
    setMessage('');
  }
  async function save() {
    if (busy) return;
    if (
      draft.notes.length > 6000 ||
      [draft.support, draft.sms, draft.whatsapp].some((v) => v.length > 500)
    ) {
      setMessage(
        'Use up to 6,000 characters for notes and 500 for each contact field.',
      );
      return;
    }
    if (
      [draft.sms, draft.whatsapp].some(
        (v) =>
          v.trim() &&
          !v
            .trim()
            .split('\n')
            .every((phone) => /^\+?[\d ()-]{6,30}$/.test(phone.trim())),
      )
    ) {
      setMessage('Enter valid SMS and WhatsApp phone numbers, one per line.');
      return;
    }
    setBusy(true);
    onBusy(true);
    setMessage('');
    try {
      await marketRatesApi.settings(draft);
      onDirty(false);
      setMessage('Notes and alert contacts saved.');
      await onSaved();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <View style={styles.group}>
      <Card style={styles.group}>
        <Txt style={styles.title}>Notes & alert contacts</Txt>
        <Txt>
          These settings apply to all four market categories. Editing contacts
          does not send SMS or WhatsApp messages.
        </Txt>
        <Field
          label="Market rate notes (one note per line)"
          multiline
          editable={!busy}
          value={draft.notes}
          onChangeText={(v) => update('notes', v)}
        />
        <Field
          label="Support line"
          editable={!busy}
          value={draft.support}
          onChangeText={(v) => update('support', v)}
        />
        <Field
          label="SMS alert phone numbers (one per line)"
          multiline
          editable={!busy}
          value={draft.sms}
          onChangeText={(v) => update('sms', v)}
        />
        <Field
          label="WhatsApp alert phone numbers (one per line)"
          multiline
          editable={!busy}
          value={draft.whatsapp}
          onChangeText={(v) => update('whatsapp', v)}
        />
        <Button disabled={busy || !dirty} onPress={() => void save()}>
          {busy ? 'Saving…' : 'Save notes & contacts'}
        </Button>
        <Button
          secondary
          disabled={busy}
          onPress={() => {
            setDraft(settings);
            onDirty(false);
            setMessage('');
          }}
        >
          Reset to saved notes & contacts
        </Button>
        {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
      </Card>
      <Card style={styles.group}>
        <Txt style={styles.title}>Preview</Txt>
        <Txt style={styles.label}>Note</Txt>
        <Txt>{draft.notes || 'No notes supplied.'}</Txt>
        <Txt>{draft.support}</Txt>
        <Txt style={styles.label}>SMS alerts</Txt>
        <Txt>{draft.sms || 'No SMS contacts.'}</Txt>
        <Txt style={styles.label}>WhatsApp alerts</Txt>
        <Txt>{draft.whatsapp || 'No WhatsApp contacts.'}</Txt>
      </Card>
    </View>
  );
}

export function MarketRatesAdmin() {
  const auth = useAuth(),
    client = useQueryClient();
  const permitted = hasPermission(auth.identity, 'price.manage');
  const user = auth.session?.user.id;
  const [category, setCategory] = useState<Category>('Ingot');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [tab, setTab] = useState('Prices');
  const [adding, setAdding] = useState(false);
  const [newState, setNewState] = useState(''),
    [newDistrict, setNewDistrict] = useState('');
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const query = useQuery({
    queryKey: [...queryRoot, user, 'admin'],
    queryFn: marketRatesApi.admin,
    enabled: permitted,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const locations =
    query.data?.locations.filter((l) => l.category === category) ?? [];
  const states = [...new Set(locations.map((l) => l.state))];
  const selected = locations.find((l) => l.id === district);
  const current = useQuery({
    queryKey: [...queryRoot, user, 'latest', district],
    queryFn: () => marketRatesApi.history(district, '', '', 0),
    enabled: permitted && !!selected,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  function navigate(action: () => void) {
    if (busy || saving) return;
    if (dirty) setPending(() => action);
    else {
      setMessage('');
      action();
    }
  }
  async function refresh() {
    await client.invalidateQueries({ queryKey: queryRoot });
  }
  async function createLocation() {
    setBusy(true);
    setMessage('');
    try {
      const id = await marketRatesApi.location(category, newState, newDistrict);
      await refresh();
      setState(newState.trim());
      setDistrict(id);
      setAdding(false);
      setNewState('');
      setNewDistrict('');
      setMessage('District added. Enter its first price below.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!permitted)
    return (
      <Empty
        title="Market Rates access required"
        description="Ask an administrator for pricing management permission."
      />
    );
  return (
    <View style={styles.group}>
      <Card style={styles.hero}>
        <Txt style={styles.eyebrow}>MARKET RATE DESK</Txt>
        <Txt style={styles.heroTitle}>District prices, in one place.</Txt>
        <Txt style={{ color: '#CBD5E1' }}>
          Choose a category, state and district. Review the three price columns
          and publish a dated update.
        </Txt>
      </Card>
      {pending ? (
        <Card style={styles.group}>
          <Txt accessibilityRole="alert">
            You have unsaved changes. Discard them and change selection?
          </Txt>
          <Row style={styles.wrap}>
            <Button secondary onPress={() => setPending(null)}>
              Keep editing
            </Button>
            <Button
              onPress={() => {
                setDirty(false);
                setEditorEpoch((v) => v + 1);
                pending();
                setPending(null);
              }}
            >
              Discard changes
            </Button>
          </Row>
        </Card>
      ) : null}
      <Choices
        label="Workspace"
        values={['Prices', 'Notes & contacts']}
        selected={tab}
        onChange={(value) => navigate(() => setTab(value))}
      />
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
      <Button
        secondary
        disabled={
          dirty || saving || busy || query.isFetching || current.isFetching
        }
        onPress={() => void refresh()}
      >
        Refresh Market Rates
      </Button>
      {query.isPending ? (
        <Txt>Loading Market Rates…</Txt>
      ) : query.error ? (
        <Empty
          title="Market Rates unavailable"
          description={query.error.message}
          action={<Button onPress={() => void query.refetch()}>Retry</Button>}
        />
      ) : tab === 'Notes & contacts' ? (
        <SettingsEditor
          key={`${query.data.settings.revision}-${editorEpoch}`}
          settings={query.data.settings}
          onDirty={setDirty}
          onBusy={setSaving}
          onSaved={async () => {
            await refresh();
            setMessage('Notes and alert contacts saved.');
          }}
        />
      ) : (
        <>
          <Choices
            label="1. Category"
            values={categories}
            selected={category}
            onChange={(value) =>
              navigate(() => {
                setCategory(value as Category);
                setState('');
                setDistrict('');
                setAdding(false);
              })
            }
          />
          <Card style={styles.group}>
            {states.length ? (
              <Choices
                label="2. State"
                values={states}
                selected={state}
                onChange={(value) =>
                  navigate(() => {
                    setState(value);
                    setDistrict('');
                  })
                }
              />
            ) : (
              <Txt>
                No districts configured for {category}. Add a district to begin.
              </Txt>
            )}
            {state ? (
              <View style={styles.group}>
                <Txt style={styles.label}>3. District</Txt>
                <Row style={styles.wrap}>
                  {locations
                    .filter((l) => l.state === state)
                    .map((l) => (
                      <Chip
                        key={l.id}
                        selected={district === l.id}
                        onPress={() => navigate(() => setDistrict(l.id))}
                      >
                        {l.district}
                      </Chip>
                    ))}
                </Row>
              </View>
            ) : states.length ? (
              <Txt>Select a state to see its available districts.</Txt>
            ) : null}
            <Button
              secondary
              disabled={busy || dirty}
              onPress={() => {
                setAdding(!adding);
                setNewState(state);
              }}
            >
              {' '}
              {adding ? 'Close district form' : 'Add a district'}
            </Button>
            {adding ? (
              <View style={styles.group}>
                <Txt>New location for {category}</Txt>
                <Field
                  label="State name"
                  editable={!busy}
                  value={newState}
                  onChangeText={setNewState}
                  placeholder="e.g. Punjab"
                />
                <Field
                  label="District name"
                  editable={!busy}
                  value={newDistrict}
                  onChangeText={setNewDistrict}
                  placeholder="e.g. Ludhiana"
                />
                <Button
                  disabled={
                    busy ||
                    newState.trim().length < 2 ||
                    newDistrict.trim().length < 2
                  }
                  onPress={() => void createLocation()}
                >
                  {busy ? 'Adding district…' : `Add district to ${category}`}
                </Button>
              </View>
            ) : null}
          </Card>
          {selected ? (
            current.isPending ? (
              <Txt>Loading district prices…</Txt>
            ) : current.error ? (
              <Empty
                title="District prices unavailable"
                description={current.error.message}
                action={
                  <Button onPress={() => void current.refetch()}>
                    Retry prices
                  </Button>
                }
              />
            ) : (
              <>
                <PriceEditor
                  key={`${selected.id}-${current.data[0]?.id ?? 'new'}-${editorEpoch}`}
                  location={selected}
                  latest={current.data[0]}
                  canPublish={hasPermission(auth.identity, 'price.publish')}
                  onDirty={setDirty}
                  onBusy={setSaving}
                  onSaved={async () => {
                    await refresh();
                    setMessage('Price published. History has been updated.');
                  }}
                />
                <History key={selected.id} location={selected} user={user} />
              </>
            )
          ) : null}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: 14 },
  label: { fontWeight: '700', fontSize: 13 },
  title: { fontSize: 20, fontWeight: '700' },
  choices: { gap: 10, paddingVertical: 4 },
  wrap: { flexWrap: 'wrap', gap: 12 },
  hero: { backgroundColor: c.dark, gap: 12, padding: 22 },
  eyebrow: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  heroTitle: { color: 'white', fontSize: 26, fontWeight: '700' },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  priceCell: { flexGrow: 1, flexBasis: 210 },
  total: {
    padding: 16,
    backgroundColor: c.bgSubtle,
    borderRadius: 10,
    gap: 10,
  },
  amount: { fontSize: 26, fontWeight: '700', color: c.brandBlue },
  review: {
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: c.brandBlueBorder,
    backgroundColor: c.brandBlueLight,
    borderRadius: 10,
  },
  historyRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
    gap: 16,
  },
  dateCell: { width: 250 },
  numberCell: { width: 125, fontVariant: ['tabular-nums'] },
});
