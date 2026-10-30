import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hasPermission } from '@features/auth';
import { useAuth } from '@features/auth/ui';
import { Button, Card, Chip, Empty, Field, Row, Txt, c } from '@shared/ui';
import { marketRatesApi } from './api';
import { MarketMultiSelect } from './StateDropdown';
import { BulkPriceEditor } from './BulkPriceEditor';
import { exportMarketHistory } from './export-history';
import {
  categories,
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
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [historyDistrict, setHistoryDistrict] = useState('');
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
  const availableDistricts = locations.filter((l) =>
    selectedStates.includes(l.state),
  );
  const selected = availableDistricts.filter((l) =>
    selectedDistricts.includes(l.id),
  );
  const districtIds = selected.map((l) => l.id).sort();
  const historyLocation =
    selected.find((l) => l.id === historyDistrict) ?? selected[0];
  const current = useQuery({
    queryKey: [...queryRoot, user, 'latest', districtIds],
    queryFn: () => marketRatesApi.current(districtIds),
    enabled: permitted && districtIds.length > 0 && districtIds.length <= 100,
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
      setSelectedStates([newState.trim()]);
      setSelectedDistricts([id]);
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
          Choose a category, multiple states and districts. Review the price
          columns and publish a dated update.
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
                setSelectedStates([]);
                setSelectedDistricts([]);
                setAdding(false);
              })
            }
          />
          <Card style={styles.group}>
            {states.length ? (
              <MarketMultiSelect
                key={category}
                label="States"
                options={states
                  .sort()
                  .map((value) => ({ id: value, label: value }))}
                selected={selectedStates}
                disabled={busy || saving}
                onChange={(values) =>
                  navigate(() => {
                    setSelectedStates(values);
                    setSelectedDistricts((ids) =>
                      ids.filter((id) =>
                        locations.some(
                          (l) => l.id === id && values.includes(l.state),
                        ),
                      ),
                    );
                  })
                }
              />
            ) : (
              <Txt>
                No districts configured for {category}. Add a district to begin.
              </Txt>
            )}
            {selectedStates.length ? (
              <MarketMultiSelect
                label="Districts"
                options={availableDistricts.map((l) => ({
                  id: l.id,
                  label: `${l.district} · ${l.state}`,
                }))}
                selected={selectedDistricts}
                disabled={busy || saving}
                onChange={(ids) => navigate(() => setSelectedDistricts(ids))}
              />
            ) : states.length ? (
              <Txt>Select states to see their available districts.</Txt>
            ) : null}
            <Button
              secondary
              disabled={busy || dirty}
              onPress={() => {
                setAdding(!adding);
                setNewState(
                  selectedStates.length === 1 ? selectedStates[0] : '',
                );
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
          {selected.length > 100 ? (
            <Txt accessibilityRole="alert">
              Select up to 100 districts per update.
            </Txt>
          ) : selected.length ? (
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
                <BulkPriceEditor
                  key={`${districtIds.join(',')}-${current.data.map((row) => row.latest?.id ?? 'new').join(',')}-${editorEpoch}`}
                  locations={selected}
                  current={current.data}
                  canPublish={hasPermission(auth.identity, 'price.publish')}
                  onDirty={setDirty}
                  onBusy={setSaving}
                  onSaved={async () => {
                    await refresh();
                    setMessage(
                      'District prices published. History has been updated.',
                    );
                  }}
                />
                {historyLocation ? (
                  <>
                    <Choices
                      label="District history"
                      values={selected.map((l) => `${l.district} · ${l.state}`)}
                      selected={`${historyLocation.district} · ${historyLocation.state}`}
                      onChange={(label) =>
                        setHistoryDistrict(
                          selected.find(
                            (l) => `${l.district} · ${l.state}` === label,
                          )!.id,
                        )
                      }
                    />
                    <History
                      key={historyLocation.id}
                      location={historyLocation}
                      user={user}
                    />
                  </>
                ) : null}
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
