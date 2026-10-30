import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@features/auth/ui';
import { SubscriptionNotice } from '@features/pricing/components/SubscriptionNotice';
import { usePriceAccess } from '@shared/hooks/use-price-access';
import { Button, Card, Empty, Field, Icon, Row, Txt, c } from '@shared/ui';
import { MarketMultiSelect } from './StateDropdown';
import { RateAlerts } from './RateAlerts';
import { MarketNotes } from './MarketNotes';
import {
  customerMarketApi,
  type MarketQuote,
  type SaleQuote,
  type CustomerOptions,
} from './customer-api';
import { saleMoney, saleMovement, salePublished } from './customer-model';
import {
  categories,
  historyPreset,
  historyRangeError,
  rateTime,
  type Category,
} from './model';

function Movement({
  change,
  prominent = false,
  compact = false,
}: {
  change: string | null;
  prominent?: boolean;
  compact?: boolean;
}) {
  const movement = saleMovement(change);
  const color =
    movement.tone === 'up'
      ? '#166534'
      : movement.tone === 'down'
        ? '#B42318'
        : c.muted;
  const backgroundColor =
    movement.tone === 'up'
      ? '#EDF8F0'
      : movement.tone === 'down'
        ? '#FEF0EE'
        : '#F1F5F9';
  return (
    <Txt
      accessibilityLabel={`${movement.tone === 'up' ? 'Increased by' : movement.tone === 'down' ? 'Decreased by' : ''} ${movement.label}`}
      style={[
        styles.movement,
        prominent && styles.prominentMovement,
        compact && mobileStyles.movement,
        { color, backgroundColor },
      ]}
    >
      {prominent && movement.tone === 'down'
        ? '↓'
        : prominent && movement.tone === 'up'
          ? '↑'
          : movement.symbol}{' '}
      {movement.label}
    </Txt>
  );
}

function QuoteHistory({
  quote,
  user,
}: {
  quote: MarketQuote;
  user: string | undefined;
}) {
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [offset, setOffset] = useState(0),
    [error, setError] = useState('');
  const query = useQuery({
    queryKey: [
      'customer-market',
      user,
      'history',
      quote.location_id,
      quote.id,
      range,
      offset,
    ],
    queryFn: () =>
      customerMarketApi.history(
        quote.location_id,
        range.from,
        range.to,
        offset,
      ),
    retry: false,
  });
  function apply(nextFrom: string, nextTo: string) {
    const invalid = historyRangeError(nextFrom, nextTo);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    setFrom(nextFrom);
    setTo(nextTo);
    setRange({ from: nextFrom, to: nextTo });
    setOffset(0);
  }
  return (
    <View style={styles.history}>
      <Txt style={styles.sectionTitle}>Sale price history</Txt>
      <Row style={styles.wrap}>
        <Button secondary onPress={() => apply('', '')}>
          All updates
        </Button>
        <Button
          secondary
          onPress={() => {
            const r = historyPreset(7);
            apply(r.from, r.to);
          }}
        >
          Last 7 days
        </Button>
        <Button
          secondary
          onPress={() => {
            const r = historyPreset(30);
            apply(r.from, r.to);
          }}
        >
          Last 30 days
        </Button>
      </Row>
      <View style={styles.dateFields}>
        <View style={styles.dateField}>
          <Field
            label="History from (YYYY-MM-DD)"
            value={from}
            onChangeText={setFrom}
            placeholder="2026-10-24"
          />
        </View>
        <View style={styles.dateField}>
          <Field
            label="History to (YYYY-MM-DD)"
            value={to}
            onChangeText={setTo}
            placeholder="2026-10-30"
          />
        </View>
      </View>
      <Button secondary onPress={() => apply(from, to)}>
        Apply history dates
      </Button>
      {error ? <Txt accessibilityRole="alert">{error}</Txt> : null}
      <Txt style={styles.caption}>
        All publication times are IST. Changes compare with the previous
        published sale price.
      </Txt>
      {query.isPending ? (
        <Txt>Loading price history…</Txt>
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
            <Txt>No price updates in this period.</Txt>
          ) : (
            query.data.map((item: SaleQuote) => (
              <View key={item.id} style={styles.historyRow}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Txt style={styles.caption}>
                    {rateTime(item.published_at)}
                  </Txt>
                  <Movement change={item.price_change} />
                </View>
                <Txt style={styles.historyPrice}>
                  {saleMoney(item.sale_price)}
                </Txt>
              </View>
            ))
          )}
          {offset > 0 || query.data.length === 20 ? (
            <Row style={styles.wrap}>
              <Button
                secondary
                disabled={offset === 0 || query.isFetching}
                onPress={() => setOffset((value) => Math.max(0, value - 20))}
              >
                Newer quotes
              </Button>
              <Button
                secondary
                disabled={query.data.length < 20 || query.isFetching}
                onPress={() => setOffset((value) => value + 20)}
              >
                Older quotes
              </Button>
            </Row>
          ) : null}
        </>
      )}
    </View>
  );
}

function QuoteCard({
  quote,
  user,
  wide,
  settings,
  mobile,
}: {
  quote: MarketQuote;
  user: string | undefined;
  wide: boolean;
  settings?: CustomerOptions['settings'];
  mobile: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  return (
    <View
      style={[
        styles.quote,
        wide && styles.wideQuote,
        mobile && mobileStyles.quote,
      ]}
    >
      <View pointerEvents="none" style={styles.cardRule} />
      <View style={[styles.quoteTop, mobile && mobileStyles.quoteTop]}>
        <View style={[styles.place, mobile && mobileStyles.place]}>
          <View
            style={[styles.locationIcon, mobile && mobileStyles.locationIcon]}
          >
            <Icon name="map-pin" size={mobile ? 17 : 21} color="#0D315C" />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Txt style={[styles.district, mobile && mobileStyles.district]}>
              {quote.district}
            </Txt>
            <Txt style={[styles.state, mobile && mobileStyles.state]}>
              {quote.state}
            </Txt>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${open ? 'Hide' : 'View'} price history for ${quote.district}, ${quote.state}`}
          accessibilityState={{ expanded: open }}
          aria-expanded={open}
          onPress={() => setOpen((value) => !value)}
          hitSlop={mobile ? 4 : undefined}
          style={[styles.historyButton, mobile && mobileStyles.historyButton]}
        >
          <Txt
            style={[
              styles.historyButtonText,
              mobile && mobileStyles.historyText,
            ]}
          >
            {mobile
              ? open
                ? 'Hide'
                : 'History'
              : open
                ? 'Hide history'
                : 'View history'}
          </Txt>
          <Icon
            name={open ? 'chevron-up' : 'arrow-up-right'}
            size={mobile ? 12 : 15}
            color={c.brandBlue}
          />
        </Pressable>
      </View>
      <View style={[styles.priceSection, mobile && mobileStyles.priceSection]}>
        <View style={styles.priceBlock}>
          <Txt
            style={[
              styles.salePrice,
              wide && { fontSize: 40 },
              mobile && mobileStyles.salePrice,
            ]}
          >
            {saleMoney(quote.sale_price)}
          </Txt>
          <Txt style={[styles.unit, mobile && mobileStyles.unit]}>
            per metric tonne
          </Txt>
        </View>
        <View style={styles.changeBlock}>
          <Movement change={quote.price_change} prominent compact={mobile} />
          <Txt style={[styles.caption, mobile && mobileStyles.small]}>
            Price change
          </Txt>
        </View>
      </View>
      <View style={[styles.quoteBottom, mobile && mobileStyles.quoteBottom]}>
        <Icon name="clock" size={mobile ? 12 : 15} color="#6C829F" />
        <Txt
          style={[styles.caption, { flex: 1 }, mobile && mobileStyles.small]}
        >
          {mobile
            ? salePublished(quote.published_at).replace(/^Published /, '')
            : salePublished(quote.published_at)}
        </Txt>
      </View>
      <RateAlerts quote={quote} settings={settings} compact={mobile}>
        {settings?.notes ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${notesOpen ? 'Hide' : 'Show'} market notes for ${quote.district}, ${quote.state}`}
            accessibilityState={{ expanded: notesOpen }}
            aria-expanded={notesOpen}
            onPress={() => setNotesOpen((value) => !value)}
            hitSlop={mobile ? 4 : undefined}
            style={[styles.notesToggle, mobile && mobileStyles.notesToggle]}
          >
            <Icon name="info" size={mobile ? 11 : 14} color={c.muted} />
            <Txt
              numberOfLines={1}
              style={[styles.caption, mobile && mobileStyles.notesText]}
            >
              Market notes
            </Txt>
            <Icon
              name={notesOpen ? 'chevron-up' : 'chevron-right'}
              size={mobile ? 10 : 14}
              color={c.muted}
            />
          </Pressable>
        ) : null}
      </RateAlerts>
      {notesOpen && settings?.notes ? (
        <View style={styles.cardNotes}>
          <MarketNotes notes={settings.notes} />
        </View>
      ) : null}
      {open ? <QuoteHistory quote={quote} user={user} /> : null}
    </View>
  );
}

function MarketBoard() {
  const auth = useAuth(),
    client = useQueryClient();
  const user = auth.session?.user.id;
  const wide = useWindowDimensions().width >= 1200;
  const mobile = useWindowDimensions().width < 1000;
  const params = useLocalSearchParams<{
    category?: string;
    state?: string;
    district?: string;
  }>();
  const [category, setCategory] = useState<Category>(
    typeof params.category === 'string' &&
      categories.includes(params.category as Category)
      ? (params.category as Category)
      : 'Ingot',
  );
  const [states, setStates] = useState<string[]>(
      typeof params.state === 'string' ? [params.state] : [],
    ),
    [districts, setDistricts] = useState<string[]>(
      typeof params.district === 'string' ? [params.district] : [],
    );
  const [search, setSearch] = useState(''),
    [appliedSearch, setAppliedSearch] = useState('');
  const [offset, setOffset] = useState(0),
    [filtersOpen, setFiltersOpen] = useState(false);
  const options = useQuery({
    queryKey: ['customer-market', user, 'options'],
    queryFn: customerMarketApi.options,
    staleTime: 30000,
    retry: false,
  });
  const rates = useQuery({
    queryKey: [
      'customer-market',
      user,
      'board',
      category,
      states,
      districts,
      appliedSearch,
      offset,
    ],
    queryFn: () =>
      customerMarketApi.board(
        category,
        states,
        districts,
        appliedSearch,
        offset,
      ),
    enabled: options.isSuccess,
    staleTime: 15000,
    refetchInterval: 30000,
    retry: false,
  });
  const locations =
    options.data?.locations.filter(
      (location) => location.category === category,
    ) ?? [];
  const availableStates = [
    ...new Set(locations.map((location) => location.state)),
  ].sort();
  const availableDistricts = locations.filter(
    (location) => !states.length || states.includes(location.state),
  );
  const filterCount = states.length + districts.length;
  const settings = options.data?.settings;
  const lastPublished = rates.data?.items.reduce(
    (latest, quote) =>
      quote.published_at > latest ? quote.published_at : latest,
    '',
  );
  const publicationDate = lastPublished
    ? new Date(lastPublished).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Latest updates';
  function clear() {
    setStates([]);
    setDistricts([]);
    setSearch('');
    setAppliedSearch('');
    setOffset(0);
  }
  return (
    <View style={[styles.page, mobile && mobileStyles.page]}>
      <View style={[styles.header, mobile && mobileStyles.header]}>
        {!mobile ? <View style={styles.redRule} /> : null}
        <Txt style={[styles.eyebrow, mobile && mobileStyles.eyebrow]}>
          FIELDFAST MARKET WATCH
        </Txt>
        <Txt
          accessibilityRole="header"
          style={[styles.pageTitle, mobile && mobileStyles.pageTitle]}
        >
          Market rates
        </Txt>
        <Txt style={[styles.intro, mobile && mobileStyles.intro]}>
          Steel prices across your markets.
        </Txt>
      </View>
      <View style={[styles.tabs, mobile && mobileStyles.tabs]}>
        {categories.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={value}
            accessibilityState={{ selected: category === value }}
            aria-selected={category === value}
            onPress={() => {
              setCategory(value);
              clear();
            }}
            hitSlop={mobile ? { top: 4, bottom: 4 } : undefined}
            style={[
              styles.tab,
              mobile && mobileStyles.tab,
              category === value &&
                (mobile ? mobileStyles.activeTab : styles.activeTab),
            ]}
          >
            <Txt
              style={[
                styles.tabText,
                mobile && mobileStyles.tabText,
                category === value && styles.activeTabText,
              ]}
            >
              {value}
            </Txt>
          </Pressable>
        ))}
      </View>
      <View style={[styles.toolbar, mobile && mobileStyles.toolbar]}>
        {mobile ? (
          <View
            accessibilityLabel={`Latest publication date: ${publicationDate}`}
            style={mobileStyles.dateBadge}
          >
            <Icon name="calendar" size={14} color={c.dark} />
            <Txt style={mobileStyles.dateText}>{publicationDate}</Txt>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Txt style={styles.sectionTitle}>{category} markets</Txt>
            <Txt style={styles.caption}>
              INR / metric tonne · Indicative spot rates
            </Txt>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filter markets"
          accessibilityState={{ expanded: filtersOpen }}
          aria-expanded={filtersOpen}
          onPress={() => setFiltersOpen((value) => !value)}
          style={[
            styles.filterButton,
            mobile && mobileStyles.filterButton,
            filterCount > 0 && styles.filterActive,
          ]}
        >
          <Icon name="sliders" size={17} color={c.brandBlue} />
          <Txt style={styles.filterText}>
            Filters{filterCount ? ` (${filterCount})` : ''}
          </Txt>
        </Pressable>
      </View>
      {filtersOpen ? (
        <Card style={styles.filterPanel}>
          <Txt style={styles.sectionTitle}>Choose your markets</Txt>
          <Txt style={styles.caption}>
            Select multiple states and districts. Leave selections empty to show
            all.
          </Txt>
          <MarketMultiSelect
            label="States"
            options={availableStates.map((state) => ({
              id: state,
              label: state,
            }))}
            selected={states}
            disabled={options.isPending}
            onChange={(values) => {
              setStates(values);
              setDistricts((ids) =>
                ids.filter((id) =>
                  locations.some(
                    (location) =>
                      location.id === id &&
                      (!values.length || values.includes(location.state)),
                  ),
                ),
              );
              setOffset(0);
            }}
          />
          <MarketMultiSelect
            label="Districts"
            options={availableDistricts.map((location) => ({
              id: location.id,
              label: `${location.district} · ${location.state}`,
            }))}
            selected={districts}
            disabled={options.isPending}
            onChange={(values) => {
              setDistricts(values);
              setOffset(0);
            }}
          />
          <Field
            label="Search district or state"
            value={search}
            onChangeText={setSearch}
            placeholder="e.g. Ludhiana"
          />
          <Row style={styles.wrap}>
            <Button
              onPress={() => {
                setAppliedSearch(search.trim());
                setOffset(0);
              }}
            >
              Apply search
            </Button>
            <Button secondary onPress={clear}>
              Reset filters
            </Button>
          </Row>
        </Card>
      ) : null}
      {options.isPending ? (
        <Card>
          <Txt>Loading markets…</Txt>
        </Card>
      ) : options.error ? (
        <Empty
          title="Markets unavailable"
          description={options.error.message}
          action={
            <Button onPress={() => void options.refetch()}>
              Retry markets
            </Button>
          }
        />
      ) : (
        <>
          <Row
            style={{
              ...styles.summary,
              ...(mobile ? mobileStyles.summary : {}),
            }}
          >
            <Txt style={[styles.caption, mobile && mobileStyles.small]}>
              {rates.data && !rates.error
                ? `${rates.data.total} district quote${rates.data.total === 1 ? '' : 's'}`
                : 'Published district prices'}
            </Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh market prices"
              disabled={rates.isFetching}
              onPress={() =>
                void client.invalidateQueries({
                  queryKey: ['customer-market', user],
                })
              }
              style={[styles.refresh, mobile && mobileStyles.refresh]}
            >
              <Icon name="refresh-cw" size={13} color={c.muted} />
              <Txt style={[styles.caption, mobile && mobileStyles.small]}>
                {rates.isFetching ? 'Refreshing…' : 'Refresh'}
              </Txt>
            </Pressable>
          </Row>
          {mobile ? (
            <View style={mobileStyles.rateStrip}>
              <Txt style={mobileStyles.rateStripText}>
                ₹ / metric tonne · Indicative spot rates
              </Txt>
            </View>
          ) : null}
          {rates.isPending ? (
            <Card>
              <Txt>Loading sale prices…</Txt>
            </Card>
          ) : rates.error ? (
            <Empty
              title="Prices unavailable"
              description={rates.error.message}
              action={
                <Button onPress={() => void rates.refetch()}>
                  Retry prices
                </Button>
              }
            />
          ) : !rates.data.items.length ? (
            <Empty
              title="No rates for this selection"
              description="Try another category or clear your market filters."
              action={
                <Button secondary onPress={clear}>
                  Clear market filters
                </Button>
              }
            />
          ) : (
            <>
              <View style={[styles.quotes, mobile && mobileStyles.quotes]}>
                {rates.data.items.map((quote) => (
                  <QuoteCard
                    key={quote.location_id}
                    quote={quote}
                    user={user}
                    wide={wide}
                    settings={settings}
                    mobile={mobile}
                  />
                ))}
              </View>
              {offset > 0 || rates.data.total > 24 ? (
                <Row style={styles.pagination}>
                  <Button
                    secondary
                    disabled={offset === 0 || rates.isFetching}
                    onPress={() =>
                      setOffset((value) => Math.max(0, value - 24))
                    }
                  >
                    Previous markets
                  </Button>
                  <Txt style={styles.caption}>
                    {offset + 1}–{offset + rates.data.items.length} of{' '}
                    {rates.data.total}
                  </Txt>
                  <Button
                    secondary
                    disabled={
                      offset + 24 >= rates.data.total || rates.isFetching
                    }
                    onPress={() => setOffset((value) => value + 24)}
                  >
                    Next markets
                  </Button>
                </Row>
              ) : null}
            </>
          )}
        </>
      )}
      {!mobile ? (
        <View style={styles.infoStrip}>
          <Icon name="info" size={16} color={c.blue} />
          <Txt style={styles.infoText}>
            Indicative market rates. Confirm availability and commercial terms
            before ordering.
          </Txt>
        </View>
      ) : null}
      <View style={styles.legend}>
        <Txt style={styles.caption}>▲ Price increased</Txt>
        <Txt style={styles.caption}>▼ Price decreased</Txt>
        <Txt style={styles.caption}>— No change / first quote</Txt>
      </View>
      {settings ? (
        <View style={styles.footer}>
          <Txt style={styles.sectionTitle}>Market notes</Txt>
          <MarketNotes
            notes={
              settings.notes || 'Rates are indicative and for information only.'
            }
          />
          {settings.support ? (
            <Txt style={styles.support}>{settings.support}</Txt>
          ) : null}
          {settings.sms || settings.whatsapp ? (
            <View style={styles.contacts}>
              {settings.sms ? (
                <View style={styles.contact}>
                  <Txt style={styles.updateLabel}>SMS ALERTS</Txt>
                  <Txt style={styles.notes}>{settings.sms}</Txt>
                </View>
              ) : null}
              {settings.whatsapp ? (
                <View style={styles.contact}>
                  <Txt style={styles.updateLabel}>WHATSAPP ALERTS</Txt>
                  <Txt style={styles.notes}>{settings.whatsapp}</Txt>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function CustomerMarketRates() {
  const access = usePriceAccess();
  return access ? (
    <MarketBoard />
  ) : (
    <View style={styles.page}>
      <Txt style={styles.pageTitle}>Market rates</Txt>
      <SubscriptionNotice />
    </View>
  );
}
const styles = StyleSheet.create({
  page: { gap: 18, paddingBottom: 24 },
  header: { gap: 8, paddingTop: 8, paddingBottom: 8 },
  redRule: {
    width: 36,
    height: 4,
    backgroundColor: c.brandRed,
    marginBottom: 6,
  },
  eyebrow: {
    color: c.brandRed,
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: '700',
  },
  pageTitle: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700',
    color: c.dark,
    letterSpacing: -1,
  },
  intro: { color: c.muted, fontSize: 15 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#E9EEF4',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 7,
  },
  activeTab: { backgroundColor: c.dark },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    color: c.muted,
  },
  activeTabText: { color: 'white' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: c.dark },
  caption: { fontSize: 11, lineHeight: 17, color: c.muted },
  filterButton: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: 'white',
    borderRadius: 8,
  },
  filterActive: { borderColor: c.brandBlue, backgroundColor: c.brandBlueLight },
  filterText: { color: c.brandBlue, fontSize: 12, fontWeight: '600' },
  filterPanel: { gap: 14 },
  wrap: { flexWrap: 'wrap', gap: 8 },
  summary: { justifyContent: 'space-between', gap: 12 },
  refresh: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  quotes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    alignItems: 'flex-start',
  },
  quote: {
    width: '100%',
    padding: 18,
    paddingTop: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: '#E0E7EF',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    boxShadow: '0px 4px 14px rgba(11, 27, 54, 0.07)',
  },
  wideQuote: { width: 'auto', flexBasis: '48.5%', flexGrow: 0, maxWidth: 620 },
  cardRule: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#123B70',
  },
  locationIcon: {
    width: 36,
    height: 38,
    borderRadius: 6,
    backgroundColor: '#E9EEF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  changeBlock: {
    gap: 5,
    borderLeftWidth: 1,
    borderLeftColor: '#E3EAF3',
    paddingLeft: 16,
  },
  prominentMovement: { fontSize: 15, paddingVertical: 5, paddingHorizontal: 9 },
  cardNotes: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#D1DFF0',
    paddingTop: 4,
  },
  notesToggle: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  quoteTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },
  place: {
    flex: 1,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  state: {
    fontSize: 10,
    fontWeight: '600',
    color: '#69809E',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  district: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: '#0D2B50',
  },
  priceBlock: { gap: 2, flexShrink: 1 },
  salePrice: {
    fontSize: 36,
    fontWeight: '700',
    color: '#071E41',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  unit: { fontSize: 11, color: '#69809E' },
  movement: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '700',
    borderRadius: 5,
    overflow: 'hidden',
    fontVariant: ['tabular-nums'],
  },
  quoteBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E7EDF5',
  },
  updateLabel: {
    color: c.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
    paddingLeft: 6,
  },
  historyButtonText: { color: c.brandBlue, fontSize: 11, fontWeight: '600' },
  history: {
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: c.line,
    paddingTop: 16,
    backgroundColor: '#F8FAFE',
    padding: 12,
    borderRadius: 8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
    paddingVertical: 12,
  },
  historyPrice: {
    fontSize: 19,
    fontWeight: '700',
    color: c.dark,
    fontVariant: ['tabular-nums'],
  },
  dateFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dateField: { flexGrow: 1, flexBasis: 160 },
  pagination: { flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingVertical: 4,
  },
  infoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#E8F1FD',
  },
  infoText: { flex: 1, fontSize: 11, lineHeight: 17, color: '#3E5877' },
  footer: {
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: c.line,
    paddingTop: 22,
    marginTop: 6,
  },
  notes: { fontSize: 12, lineHeight: 21, color: c.muted },
  support: { fontSize: 13, fontWeight: '600', color: c.dark },
  contacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  contact: { gap: 7, flexBasis: 200, flexGrow: 1 },
});
const mobileStyles = StyleSheet.create({
  page: {
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  header: { gap: 2, paddingTop: 0, paddingBottom: 5 },
  eyebrow: {
    fontSize: 8,
    letterSpacing: 0.7,
    lineHeight: 12,
    color: '#D70B1D',
  },
  pageTitle: { fontSize: 26, lineHeight: 32, letterSpacing: -0.6 },
  intro: { fontSize: 12, lineHeight: 17 },
  tabs: { padding: 3, gap: 2, borderRadius: 5, backgroundColor: '#E9EEF4' },
  tab: {
    minHeight: 36,
    paddingVertical: 7,
    paddingHorizontal: 3,
    borderRadius: 4,
  },
  tabText: { fontSize: 10, lineHeight: 16 },
  activeTab: { backgroundColor: '#DF0921' },
  toolbar: { paddingTop: 4, justifyContent: 'space-between' },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    minHeight: 36,
    borderWidth: 1,
    borderColor: '#D4DEED',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  dateText: { fontSize: 10, fontWeight: '600', color: '#17365C' },
  filterButton: { minHeight: 36, paddingHorizontal: 10, borderRadius: 4 },
  summary: { minHeight: 26 },
  refresh: { minHeight: 30, paddingHorizontal: 2 },
  small: { fontSize: 9, lineHeight: 14 },
  rateStrip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
  },
  rateStripText: { fontSize: 9, lineHeight: 14, color: '#174879' },
  quotes: { gap: 10 },
  quote: {
    padding: 12,
    paddingTop: 14,
    gap: 8,
    borderRadius: 6,
    boxShadow: '0px 1px 4px rgba(11, 27, 54, 0.04)',
  },
  quoteTop: { gap: 8 },
  place: { gap: 8 },
  locationIcon: { width: 28, height: 30, borderRadius: 4 },
  district: { fontSize: 16, lineHeight: 20 },
  state: { fontSize: 8, lineHeight: 11, letterSpacing: 0.3 },
  historyButton: { minHeight: 36, gap: 3, paddingLeft: 0 },
  historyText: { fontSize: 10 },
  priceSection: { gap: 14 },
  salePrice: { fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  unit: { fontSize: 9, lineHeight: 13 },
  movement: { fontSize: 12, paddingHorizontal: 7, paddingVertical: 3 },
  quoteBottom: { paddingVertical: 6, gap: 6 },
  notesToggle: { minHeight: 36, gap: 4, flexShrink: 1 },
  notesText: { fontSize: 9, lineHeight: 13, flexShrink: 1 },
});
