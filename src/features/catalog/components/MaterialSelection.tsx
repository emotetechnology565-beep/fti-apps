import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@features/auth/ui';
import { Button, Card, Chip, Field, Row, Txt, c, s } from '@shared/ui';
import { catalogApi, CatalogRequestError } from '../data/catalog-repository';
import { createSelectionDraftStorage } from '../data/selection-draft';
import { useMaterialSelectionOptions } from '../hooks/use-material-selection-options';
import { changeSelection, emptySelection, quantityError, selectedOption, selectionPrice, type SelectionDraft } from '../model/material-selection';
import { CatalogFilter } from './CatalogFilter';

const drafts = createSelectionDraftStorage(AsyncStorage);
const newId = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
  const value = Math.floor(Math.random() * 16); return (ch === 'x' ? value : (value & 3) | 8).toString(16);
});
type Props = {
  productId?: string; initialSize?: string; initialGrade?: string;
  renderAdapter?: (kind: 'fastener' | 'tractor_part') => ReactNode;
};

export function MaterialSelection(props: Props) {
  const auth = useAuth();
  if (!auth.ready) return <Txt style={s.muted}>Loading your selection…</Txt>;
  return <SelectionForm key={`${auth.session?.user.id ?? 'guest'}:${props.productId ?? 'catalogue'}`} {...props} />;
}

function SelectionForm({ productId, initialSize = '', initialGrade = '', renderAdapter }: Props) {
  const auth = useAuth();
  const owner = auth.session?.user.id ?? null;
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [location, setLocation] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState('');
  const [attempt, setAttempt] = useState<{ id: string; optionId: string; quantity: string; buyer: Record<string, unknown> } | null>(null);
  const submitting = useRef(false);
  const buyerEdited = useRef(false);
  const adapter = draft?.category === 'fastener' || draft?.category === 'tractor_part' ? draft.category : null;
  const query = useMaterialSelectionOptions(adapter ? undefined : draft?.category, adapter ? undefined : draft?.sizeId, productId);
  const data = query.data;
  const option = draft && data ? selectedOption(draft, data.options) : undefined;
  const size = data?.sizes.find(item => item.id === draft?.sizeId);
  const gradeOptions = [...new Set(data?.options.map(item => item.grade) ?? [])].sort();
  const productOptions = data?.options.filter(item => item.grade === draft?.grade) ?? [];
  const locked = busy || attempt !== null;

  useEffect(() => {
    let active = true;
    void drafts.load(owner).then(async value => {
      let restored = productId && value.productId !== productId ? { ...emptySelection(), productId } : value;
      if (productId && !restored.category) {
        const options = await catalogApi.selectionOptions(undefined, undefined, productId);
        const initial = options.sizes.find(item => Object.values(item.dimensions).length === 1 && String(Object.values(item.dimensions)[0]) === initialSize);
        restored = { ...restored, category: options.category?.slug ?? '', sizeId: initial?.id ?? '', grade: initial ? initialGrade : '', productId };
      }
      if (active) setDraft(restored);
    }).catch(() => { if (active) { setDraft({ ...emptySelection(), productId: productId ?? '' }); setMessage('Your previous selection could not be restored. Please choose again.'); } });
    return () => { active = false; };
  }, [owner, productId, initialSize, initialGrade]);

  useEffect(() => {
    if (draft && !reference) void drafts.save(owner, draft).catch(() => setMessage('Your selection could not be saved on this device.'));
  }, [draft, owner, reference]);

  useEffect(() => {
    if (!buyerEdited.current) {
      setName(auth.identity?.profile.full_name ?? '');
      setBusiness(auth.identity?.businesses[0]?.legal_name ?? '');
    }
  }, [auth.identity]);

  if (!draft) return <Txt style={s.muted}>Loading your selection…</Txt>;
  const update = (field: 'category' | 'sizeId' | 'grade' | 'optionId' | 'quantity', value: string) => {
    if (locked) return;
    setMessage(''); setReference('');
    setDraft(changeSelection(draft, field, value));
  };
  const price = option ? selectionPrice(option) : null;
  const staleSelection = draft.sizeId && data && !query.isFetching && !size;
  const valid = !!option && !!size && !quantityError(draft.quantity, option) && !query.isFetching;

  async function review() {
    if (!draft) return;
    const error = quantityError(draft.quantity, option);
    if (error || !size) { setMessage(error ?? 'Choose an available size.'); return; }
    const next = { ...draft, optionId: option!.id, productId: option!.product_id, review: true };
    setDraft(next); setMessage('');
    if (!auth.session) {
      setBusy(true);
      try {
        await drafts.prepareLogin(next);
        router.push({ pathname: '/login', params: { returnTo: 'material-selection' } });
      } catch { setMessage('Could not save your selection for sign-in. Please try again.'); }
      finally { setBusy(false); }
    }
  }

  async function submit() {
    if (submitting.current || busy || reference || !draft || !auth.session) return;
    let request = attempt;
    if (!request) {
      if (!valid || !option) { setMessage('This selection is no longer available. Choose a size and grade again.'); return; }
      if (name.trim().length < 2 || name.trim().length > 80 || !business.trim() || business.trim().length > 80 || location.trim().length < 5 || location.trim().length > 100 || !consent) {
        setMessage('Enter your name, business and delivery location, and agree to WhatsApp updates.'); return;
      }
      request = {
        id: newId(), optionId: option.id, quantity: draft.quantity,
        buyer: { name: name.trim(), business: business.trim(), location: location.trim(), whatsapp_consent: consent }
      };
      setAttempt(request);
    }
    submitting.current = true;
    setBusy(true); setMessage('');
    try {
      const result = await catalogApi.submitSelection(request.id, request.optionId, request.quantity, request.buyer);
      setReference(result.reference);
      try { await drafts.clear(owner); }
      catch { setMessage('Your request was received, but the saved selection could not be cleared on this device.'); }
    } catch (error) {
      if (error instanceof CatalogRequestError && error.rejected) {
        setAttempt(null);
        void query.refetch();
      }
      setMessage((error as Error).message);
    }
    finally { submitting.current = false; setBusy(false); }
  }

  return <View style={{ gap: 18 }}>
    {!productId ? <CatalogFilter label="Category" value={adapter ?? (draft.category ? 'steel' : '')}
      options={[{ value: '', label: 'Choose category' }, { value: 'steel', label: 'Raw Materials' },
      { value: 'fastener', label: 'Fasteners' }, { value: 'tractor_part', label: 'Tractor Parts' }]}
      disabled={locked} onChange={value => update('category', value)} /> : null}
    {!productId && draft.category && !adapter ? <CatalogFilter label="Raw material category" value={draft.category === 'steel' ? '' : draft.category}
      options={[{ value: '', label: 'Choose material' }, ...(data?.categories ?? []).map(item => ({ value: item.slug, label: item.name }))]}
      disabled={locked || query.isPending} onChange={value => update('category', value || 'steel')} /> : null}
    {adapter ? renderAdapter?.(adapter) : <>
      {query.isPending ? <Txt style={s.muted}>Loading available sizes and grades…</Txt> : null}
      {query.error ? <Card style={{ gap: 10 }}><Txt accessibilityRole="alert">{query.error.message}</Txt><Button secondary onPress={() => void query.refetch()}>Retry available options</Button></Card> : null}
      {!draft.category && !productId && !query.isPending && !query.error ? <Txt style={s.muted}>Choose a category to select a size, grade and quantity.</Txt> : null}
      {draft.category === 'steel' && !query.isPending && !query.error ? <Txt style={s.muted}>Choose a raw material category to view available sizes and grades.</Txt> : null}
      {((draft.category && draft.category !== 'steel') || productId) && data && !data.category && !query.isFetching && !query.error ? <Txt style={s.muted}>This category is no longer available. Choose another category from the catalogue.</Txt> : null}
      {reference ? <Card style={{ gap: 12 }}>
        <Txt style={s.h2}>Request received</Txt><Txt accessibilityLiveRegion="polite">{reference}</Txt>
        <Txt>FTI will confirm availability, pricing and delivery. Your WhatsApp acknowledgment is queued.</Txt>
        <Button secondary onPress={() => { setAttempt(null); setReference(''); setDraft({ ...emptySelection(), category: draft.category, productId: productId ?? '' }); setConsent(false); }}>Start another request</Button>
      </Card> : data?.category && !query.error ? <Card style={{ gap: 18 }}>
        {!data.sizes.length ? <Txt style={s.muted}>No sizes currently available in this category. Choose another category or check again later.</Txt> : <>
          <Row style={{ flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }}>
            <CatalogFilter label={data.category.dimension_label} value={draft.sizeId}
              options={[{ value: '', label: 'Choose size' }, ...data.sizes.map(item => ({ value: item.id, label: item.label }))]}
              disabled={locked || query.isFetching} onChange={value => update('sizeId', value)} />
            <CatalogFilter label="Grade" value={draft.grade}
              options={[{ value: '', label: 'Choose grade' }, ...gradeOptions.map(value => ({ value, label: value }))]}
              disabled={locked || !size || query.isFetching || !gradeOptions.length} onChange={value => update('grade', value)} />
          </Row>
          {staleSelection ? <Txt accessibilityRole="alert">The selected size is no longer available. Choose another size.</Txt> : null}
          {size && !query.isFetching && !gradeOptions.length ? <Txt style={s.muted}>No grades currently available for this size.</Txt> : null}
          {size && draft.grade && !query.isFetching && gradeOptions.length > 0 && !gradeOptions.includes(draft.grade) ? <Txt accessibilityRole="alert">The selected grade is no longer available. Choose another grade.</Txt> : null}
          {size && draft.optionId && productOptions.length === 1 && !option && !query.isFetching ? <Txt accessibilityRole="alert">The selected product is no longer available. Choose the grade again to view the current product.</Txt> : null}
          {productOptions.length > 1 ? <CatalogFilter label="Product" value={draft.optionId}
            options={[{ value: '', label: 'Choose product' }, ...productOptions.map(item => ({ value: item.id, label: `${item.product_name} · ${item.uom}` }))]}
            disabled={locked} onChange={value => update('optionId', value)} /> : null}
          <Field label={option ? `Quantity (${option.uom}, minimum ${option.min_order_qty})` : 'Quantity'} value={draft.quantity}
            onChangeText={value => update('quantity', value)} numeric placeholder="Enter quantity" editable={!!option && !locked} />
          {draft.quantity && option && quantityError(draft.quantity, option) ? <Txt accessibilityRole="alert" style={{ color: c.red }}>{quantityError(draft.quantity, option)}</Txt> : null}
          {option ? <View style={{ gap: 6 }}><Txt style={{ fontWeight: '700' }}>{option.product_name}</Txt>
            <Txt style={s.h2}>{price ? `INR ${price.amount} / ${price.unit}` : 'Request quote'}</Txt>
            <Txt style={s.muted}>{price ? price.tax : 'FTI will confirm the price for your selected size and grade.'}</Txt>
          </View> : null}
          {!draft.review ? <Button disabled={!valid || busy} onPress={() => void review()}>{auth.session ? 'Review request' : 'Sign in to continue'}</Button> : <>
            <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 16, gap: 8 }}>
              <Txt style={s.h2}>Review request</Txt>
              <Txt>{data.category.name} · {size?.label ?? 'Unavailable size'} · {draft.grade}</Txt>
              <Txt>{draft.quantity} {option?.uom ?? ''}</Txt>
              {!attempt ? <Button secondary onPress={() => setDraft({ ...draft, review: false })}>Edit selection</Button> : null}
            </View>
            {!auth.session ? <Button disabled={busy || !valid} onPress={() => void review()}>Sign in to continue</Button> : <>
              <Field label="Buyer name" value={name} editable={!locked} onChangeText={value => { buyerEdited.current = true; setName(value); }} placeholder="Full name" />
              <Field label="Business / buyer type" value={business} editable={!locked} onChangeText={value => { buyerEdited.current = true; setBusiness(value); }} placeholder="Business name or Individual" />
              <Field label="Delivery location (up to 100 characters)" value={location} editable={!locked} onChangeText={setLocation} placeholder="Address, city, state and PIN code" multiline />
              <Txt style={s.muted}>Verified WhatsApp: {auth.identity?.profile.phone ?? auth.session.user.phone}</Txt>
              <View><Chip selected={consent} onPress={() => { if (!locked) setConsent(!consent); }}>Send me WhatsApp updates for this request</Chip></View>
              <Txt style={s.muted}>FTI’s configured recipients will receive your request and delivery details. Pricing and availability are confirmed by FTI.</Txt>
              <Button disabled={busy || (!attempt && !valid)} onPress={() => void submit()}>{busy ? 'Submitting…' : attempt ? 'Retry request' : 'Submit request'}</Button>
              {attempt && message ? <Txt style={s.muted}>Retry sends the same request, so it will not create a duplicate.</Txt> : null}
            </>}
          </>}
        </>}
      </Card> : null}
    </>}
    {message ? <Txt accessibilityRole="alert" style={{ color: c.red }}>{message}</Txt> : null}
  </View>;
}
