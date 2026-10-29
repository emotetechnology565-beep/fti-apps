import { usePriceAccess } from '@shared/hooks/use-price-access';
import { SubscribeForPrices } from '@features/subscriptions/SubscribeForPrices';
import { isTmtCategory, tmtCartKey } from '../model/tmt';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Link, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '@core/state/workspace-store';
import { useAuth } from '@features/auth/ui';
import { Button, Card, Chip, Field, Row, Txt, c, s } from '@shared/ui';
import {
  catalogApi,
  CatalogRequestError,
  type CatalogQuery,
} from '../data/catalog-repository';
import { createSelectionDraftStorage } from '../data/selection-draft';
import { useMaterialSelectionOptions } from '../hooks/use-material-selection-options';
import {
  changeSelection,
  emptySelection,
  quantityError,
  selectedOption,
  selectionPrice,
  type SelectionDraft,
} from '../model/material-selection';
import { CatalogFilter } from './CatalogFilter';
import {
  MaterialQuantity,
  MaterialSectionTitle,
  MaterialSpecFilter,
} from './MaterialSpecification';
import { ProductReferenceCharts } from './ProductReferenceCharts';
import {
  manualEstimate,
  manualQuantityError,
  type ManualPreview,
  type ManualRequest,
} from '../model/manual-material';

const drafts = createSelectionDraftStorage(AsyncStorage);
const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const value = Math.floor(Math.random() * 16);
    return (ch === 'x' ? value : (value & 3) | 8).toString(16);
  });
type Props = {
  productId?: string;
  tmtCategory?: string;
  initialSize?: string;
  initialGrade?: string;
  renderAdapter?: (kind: 'fastener' | 'tractor_part') => ReactNode;
  renderMaterials?: (
    filters: Pick<CatalogQuery, 'category' | 'ids'>,
    allCategories?: boolean,
  ) => ReactNode;
};

export function MaterialSelection(props: Props) {
  const auth = useAuth();
  if (!auth.ready) return <Txt style={s.muted}>Loading your selection…</Txt>;
  return (
    <SelectionForm
      key={`${auth.session?.user.id ?? 'guest'}:${props.productId ?? 'catalogue'}`}
      {...props}
    />
  );
}

function SelectionForm({
  productId,
  tmtCategory,
  initialSize = '',
  initialGrade = '',
  renderAdapter,
  renderMaterials,
}: Props) {
  const priceAccess = usePriceAccess();
  const SpecificationFilter = productId ? MaterialSpecFilter : CatalogFilter;
  const auth = useAuth();
  const owner = auth.session?.user.id ?? null;
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [location, setLocation] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [cartNotice, setCartNotice] = useState('');
  const [reference, setReference] = useState('');
  const [attempt, setAttempt] = useState<{
    id: string;
    optionId: string;
    quantity: string;
    buyer: Record<string, unknown>;
    manualRequest?: ManualRequest;
  } | null>(null);
  const submitting = useRef(false);
  const buyerEdited = useRef(false);
  const adapter =
    draft?.category === 'fastener' || draft?.category === 'tractor_part'
      ? draft.category
      : null;
  const tmt = !!tmtCategory || isTmtCategory(draft?.category ?? '');
  const selectionProductId = tmt ? undefined : productId;
  const query = useMaterialSelectionOptions(
    adapter || draft?.category === '__manual__' ? undefined : draft?.category,
    adapter || draft?.sizeId === '__manual__' ? undefined : draft?.sizeId,
    selectionProductId,
  );
  const data = query.data;
  const listedOption =
    draft && data ? selectedOption(draft, data.options) : undefined;
  const size = data?.sizes.find((item) => item.id === draft?.sizeId);
  const manualSize = !tmt && draft?.sizeId === '__manual__';
  const manualMaterial = draft?.category === '__manual__';
  const manualGrade = !tmt && draft?.manual?.gradeEntry === true;
  const manualActive = manualSize || manualGrade || manualMaterial;
  const materialInput = manualMaterial
    ? (draft?.manual?.material ?? '')
    : (data?.category?.name ?? '');
  const sizeInput = manualSize
    ? (draft?.manual?.size ?? '')
    : (size?.label ?? '');
  const gradeInput = draft?.grade ?? '';
  const [stableInput, setStableInput] = useState({
    material: '',
    size: '',
    grade: '',
  });
  const [reviewedMatch, setReviewedMatch] = useState<ManualPreview | null>(
    null,
  );
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setStableInput({
          material: materialInput,
          size: sizeInput,
          grade: gradeInput,
        }),
      350,
    );
    return () => clearTimeout(timer);
  }, [materialInput, sizeInput, gradeInput]);
  const currentInput =
    stableInput.material === materialInput &&
    stableInput.size === sizeInput &&
    stableInput.grade === gradeInput;
  const manualPreview = useQuery({
    queryKey: [
      'catalog',
      'manual-preview',
      stableInput.material,
      stableInput.size,
      stableInput.grade,
      productId ?? '',
    ],
    queryFn: () =>
      catalogApi.manualPreview(
        stableInput.material,
        stableInput.size,
        stableInput.grade,
        productId,
      ),
    enabled:
      manualActive &&
      currentInput &&
      !!materialInput.trim() &&
      !!sizeInput.trim() &&
      !reference,
    retry: false,
    staleTime: 0,
  });
  const match = currentInput ? manualPreview.data : undefined;
  const option = manualActive ? (match?.option ?? undefined) : listedOption;
  const gradeOptions = manualActive
    ? (match?.grades ?? [])
    : [...new Set(data?.options.map((item) => item.grade) ?? [])].sort();
  const productOptions =
    data?.options.filter((item) => item.grade === draft?.grade) ?? [];
  const unit = option?.uom ?? draft?.manual?.uom ?? 'MT';
  const locked = busy || attempt !== null;
  const matchChanged =
    manualActive &&
    draft?.review &&
    JSON.stringify(reviewedMatch) !== JSON.stringify(match);

  useEffect(() => {
    let active = true;
    void drafts
      .load(owner)
      .then(async (value) => {
        let restored =
          productId && value.productId !== productId
            ? { ...emptySelection(), productId }
            : value;
        if (productId && !restored.category) {
          const options = await catalogApi.selectionOptions(
            undefined,
            undefined,
            productId,
          );
          const initial = options.sizes.find(
            (item) =>
              Object.values(item.dimensions).length === 1 &&
              String(Object.values(item.dimensions)[0]) === initialSize,
          );
          restored = {
            ...restored,
            category: options.category?.slug ?? '',
            sizeId: initial?.id ?? '',
            grade: initial ? initialGrade : '',
            productId,
          };
        }
        if (tmtCategory)
          restored = {
            ...restored,
            manual: undefined,
            sizeId: restored.sizeId === '__manual__' ? '' : restored.sizeId,
          };
        if (active)
          setDraft(productId ? { ...restored, review: false } : restored);
      })
      .catch(() => {
        if (active) {
          setDraft({ ...emptySelection(), productId: productId ?? '' });
          setMessage(
            'Your previous selection could not be restored. Please choose again.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [owner, productId, initialSize, initialGrade, tmtCategory]);

  useEffect(() => {
    if (draft && !reference)
      void drafts
        .save(owner, draft)
        .catch(() =>
          setMessage('Your selection could not be saved on this device.'),
        );
  }, [draft, owner, reference]);

  useEffect(() => {
    if (!buyerEdited.current) {
      setName(auth.identity?.profile.full_name ?? '');
      setBusiness(auth.identity?.businesses[0]?.legal_name ?? '');
    }
  }, [auth.identity]);

  if (!draft) return <Txt style={s.muted}>Loading your selection…</Txt>;
  const update = (
    field: 'category' | 'sizeId' | 'grade' | 'optionId' | 'quantity',
    value: string,
  ) => {
    if (locked) return;
    setMessage('');
    setCartNotice('');
    setReference('');
    setDraft(changeSelection(draft, field, value));
  };
  const manualFields = draft.manual ?? {
    material: '',
    size: '',
    grade: '',
    uom: 'MT' as const,
  };
  const setManualField = (field: 'material' | 'size', value: string) => {
    if (locked) return;
    setMessage('');
    setCartNotice('');
    setDraft({
      ...draft,
      manual: { ...manualFields, [field]: value },
      grade: field === 'material' ? '' : draft.grade,
      optionId: '',
      review: false,
    });
  };
  const chooseSize = (value: string) => {
    if (locked) return;
    setMessage('');
    setCartNotice('');
    setDraft({
      ...changeSelection(draft, 'sizeId', value),
      grade: value === '__manual__' || manualGrade ? draft.grade : '',
      manual: { ...manualFields, size: '', gradeEntry: manualGrade },
    });
  };
  const chooseGrade = (value: string) => {
    if (locked) return;
    setMessage('');
    setCartNotice('');
    setDraft({
      ...changeSelection(draft, 'grade', value === '__manual__' ? '' : value),
      manual: { ...manualFields, gradeEntry: value === '__manual__' },
    });
  };
  const price = priceAccess && option ? selectionPrice(option) : null;
  const estimate =
    priceAccess && manualActive
      ? manualEstimate(match, draft.quantity)
      : null;
  const errorQuantity = manualActive
    ? manualQuantityError(draft.quantity, match)
    : quantityError(draft.quantity, option);
  const staleSelection =
    !manualSize && draft.sizeId && data && !query.isFetching && !size;
  const valid = manualActive
    ? !!match &&
      currentInput &&
      !manualPreview.isFetching &&
      !manualPreview.error &&
      !query.isFetching &&
      match.status !== 'dimensions_required' &&
      gradeInput.trim().length > 0 &&
      gradeInput.length <= 80 &&
      materialInput.length <= 80 &&
      sizeInput.length <= 80 &&
      (manualGrade || gradeOptions.includes(gradeInput)) &&
      !errorQuantity
    : !!option &&
      !!size &&
      !errorQuantity &&
      !query.isFetching &&
      (!tmt ||
        ((draft.requestedGrade?.length ?? 0) <= 80 &&
          !/[\x00-\x1f\x7f]/.test(draft.requestedGrade ?? '')));

  function addToCart() {
    if (!valid || !draft) return;
    const manualRequest: ManualRequest | undefined =
      manualActive && match
        ? {
            material: materialInput.trim(),
            size: sizeInput.trim(),
            grade: gradeInput.trim(),
            uom: unit,
            product_id: productId ?? null,
            expected_match: match,
            grade_entry: manualGrade ? 'manual' : 'list',
          }
        : undefined;
    const key = manualRequest
      ? JSON.stringify([
          productId,
          materialInput,
          sizeInput,
          gradeInput,
          unit,
          manualGrade,
        ])
      : tmt
        ? tmtCartKey(option!.id, draft.requestedGrade ?? '')
        : option!.id;
    useStore
      .getState()
      .addMaterial(
        option?.product_id ?? productId ?? '',
        Number(draft.quantity),
        {
          key,
          name: option?.product_name ?? materialInput,
          size: sizeInput,
          grade: tmt ? (draft.requestedGrade ?? '').trim() : gradeInput,
          ...(tmt ? { brand: gradeInput } : {}),
          unit,
          minimum: Number(option?.min_order_qty ?? 0.001),
          ...(price
            ? {
                indicativePrice: {
                  amount: Number(price.amount.replaceAll(',', '')),
                  unit: price.unit,
                  tax: price.tax,
                },
              }
            : {}),
          optionId: manualRequest ? undefined : option?.id,
          manualRequest,
        },
      );
    setCartNotice(
      'Added to cart. Choose another size or proceed from your cart.',
    );
    setDraft({ ...draft, review: false });
  }

  async function review() {
    if (!draft) return;
    if (!valid) {
      setMessage(
        errorQuantity ??
          (tmt
            ? 'Choose a size and brand.'
            : 'Choose or enter size and grade.'),
      );
      return;
    }
    if (manualActive && match) setReviewedMatch(match);
    const next = manualActive
      ? { ...draft, review: true }
      : {
          ...draft,
          optionId: option!.id,
          productId: productId ?? option!.product_id,
          review: true,
        };
    setDraft(next);
    setMessage('');
    setCartNotice('');
    if (!auth.session) {
      setBusy(true);
      try {
        await drafts.prepareLogin(next);
        router.push({
          pathname: '/login',
          params: { returnTo: 'material-selection' },
        });
      } catch {
        setMessage(
          'Could not save your selection for sign-in. Please try again.',
        );
      } finally {
        setBusy(false);
      }
    }
  }

  async function submit() {
    if (submitting.current || busy || reference || !draft || !auth.session)
      return;
    let request = attempt;
    if (!request) {
      if (
        !valid ||
        (manualActive && matchChanged) ||
        (!manualActive && !option)
      ) {
        setMessage(
          `This selection is no longer available. Choose a size and ${tmt ? 'brand' : 'grade'} again.`,
        );
        return;
      }
      if (
        name.trim().length < 2 ||
        name.trim().length > 80 ||
        !business.trim() ||
        business.trim().length > 80 ||
        location.trim().length < 5 ||
        location.trim().length > 100 ||
        !consent
      ) {
        setMessage(
          'Enter your name, business and delivery location, and agree to WhatsApp updates.',
        );
        return;
      }
      request = {
        id: newId(),
        optionId: option?.id ?? '',
        ...(manualActive && match
          ? {
              manualRequest: {
                material: materialInput.trim(),
                size: sizeInput.trim(),
                grade: gradeInput.trim(),
                uom: unit,
                product_id: productId ?? null,
                expected_match: match,
                grade_entry: manualGrade
                  ? ('manual' as const)
                  : ('list' as const),
              },
            }
          : {}),
        quantity: draft.quantity,
        buyer: {
          name: name.trim(),
          business: business.trim(),
          location: location.trim(),
          whatsapp_consent: consent,
          ...(tmt
            ? { requested_grade: (draft.requestedGrade ?? '').trim() }
            : {}),
        },
      };
      setAttempt(request);
    }
    submitting.current = true;
    setBusy(true);
    setMessage('');
    setCartNotice('');
    try {
      const result = request.manualRequest
        ? await catalogApi.submitManual(
            request.id,
            request.manualRequest,
            request.quantity,
            request.buyer,
          )
        : await catalogApi.submitSelection(
            request.id,
            request.optionId,
            request.quantity,
            request.buyer,
          );
      setReference(result.reference);
      try {
        await drafts.clear(owner);
      } catch {
        setMessage(
          'Your request was received, but the saved selection could not be cleared on this device.',
        );
      }
    } catch (error) {
      if (error instanceof CatalogRequestError && error.rejected) {
        setAttempt(null);
        if (manualActive) {
          setDraft({ ...draft, review: false });
          void manualPreview.refetch();
        }
        void query.refetch();
      }
      setMessage((error as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 18 }}>
      {!productId ? (
        <CatalogFilter
          label="Category"
          value={adapter ?? (draft.category ? 'steel' : '')}
          options={[
            { value: '', label: 'Choose category' },
            { value: 'steel', label: 'Raw Materials' },
            { value: 'fastener', label: 'Fasteners' },
            { value: 'tractor_part', label: 'Tractor Parts' },
          ]}
          disabled={locked}
          onChange={(value) => update('category', value)}
        />
      ) : null}
      {!productId && !draft.category ? (
        <Row style={{ flexWrap: 'wrap', gap: 10 }}>
          {(
            [
              { value: 'steel', label: 'Raw Materials' },
              { value: 'fastener', label: 'Fasteners' },
              { value: 'tractor_part', label: 'Tractor Parts' },
            ] as const
          ).map((item) => (
            <Button
              key={item.value}
              secondary
              disabled={locked}
              onPress={() => update('category', item.value)}
            >
              {item.label}
            </Button>
          ))}
        </Row>
      ) : null}
      {!productId && draft.category && !adapter ? (
        <CatalogFilter
          label="Raw material category"
          value={draft.category === 'steel' ? '' : draft.category}
          options={[
            { value: '', label: 'Choose material' },
            { value: '__manual__', label: 'Enter material manually' },
            ...(data?.categories ?? []).map((item) => ({
              value: item.slug,
              label: item.name,
            })),
          ]}
          disabled={locked || query.isPending}
          onChange={(value) => update('category', value || 'steel')}
        />
      ) : null}
      {adapter ? (
        renderAdapter?.(adapter)
      ) : (
        <>
          {query.isPending ? (
            <Txt style={s.muted}>
              Loading available sizes and {tmt ? 'brands' : 'grades'}…
            </Txt>
          ) : null}
          {query.error ? (
            <Card style={{ gap: 10 }}>
              <Txt accessibilityRole="alert">{query.error.message}</Txt>
              <Button secondary onPress={() => void query.refetch()}>
                Retry available options
              </Button>
            </Card>
          ) : null}
          {!draft.category && !productId && !query.isPending && !query.error ? (
            <Txt style={s.muted}>
              Choose a category to select a size, grade and quantity.
            </Txt>
          ) : null}
          {draft.category === 'steel' && !query.isPending && !query.error ? (
            <Txt style={s.muted}>
              Choose a raw material category to view available sizes and grades.
            </Txt>
          ) : null}
          {((draft.category &&
            !['steel', '__manual__'].includes(draft.category)) ||
            productId) &&
          data &&
          !data.category &&
          !query.isFetching &&
          !query.error ? (
            <Txt style={s.muted}>
              This category is no longer available. Choose another category from
              the catalogue.
            </Txt>
          ) : null}
          {reference ? (
            <Card style={{ gap: 12 }}>
              <Txt style={s.h2}>Request received</Txt>
              <Txt accessibilityLiveRegion="polite">{reference}</Txt>
              <Txt>
                FTI will confirm availability, pricing and delivery. Your
                WhatsApp acknowledgment is queued.
              </Txt>
              <Button
                secondary
                onPress={() => {
                  setAttempt(null);
                  setReference('');
                  setDraft({
                    ...emptySelection(),
                    category: draft.category,
                    productId: productId ?? '',
                  });
                  setConsent(false);
                }}
              >
                Start another request
              </Button>
            </Card>
          ) : (data?.category || manualMaterial) && !query.error ? (
            <Card
              style={{
                gap: 12,
                ...(productId
                  ? { borderWidth: 0, borderRadius: 8, padding: 14 }
                  : {}),
              }}
            >
              <>
                {productId ? (
                  <MaterialSectionTitle
                    number={1}
                    title={
                      tmt
                        ? 'Brand & Mill Specifications'
                        : 'Grade & Mill Specifications'
                    }
                  />
                ) : null}
                {manualMaterial ? (
                  <Field
                    label="Material"
                    value={manualFields.material}
                    editable={!locked}
                    onChangeText={(value) => setManualField('material', value)}
                    placeholder="Enter material name"
                  />
                ) : null}
                {!data?.sizes.length && !manualMaterial ? (
                  <Txt style={s.muted}>
                    {tmt
                      ? 'No sizes currently available for TMT bars.'
                      : 'No sizes currently available in this category. Enter a size to request a quote.'}
                  </Txt>
                ) : null}
                <Row
                  style={{
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                    gap: 16,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 180, gap: 16 }}>
                    <SpecificationFilter
                      label={data?.category?.dimension_label ?? 'Size (mm)'}
                      value={draft.sizeId}
                      options={[
                        { value: '', label: 'Choose size' },
                        ...(!tmt
                          ? [
                              {
                                value: '__manual__',
                                label: 'Enter size manually',
                              },
                            ]
                          : []),
                        ...(data?.sizes ?? []).map((item) => ({
                          value: item.id,
                          label: item.label,
                        })),
                      ]}
                      disabled={locked || query.isFetching}
                      onChange={chooseSize}
                    />
                    {manualSize ? (
                      <Field
                        label="Enter size (mm)"
                        value={manualFields.size}
                        editable={!locked}
                        onChangeText={(value) => setManualField('size', value)}
                        placeholder="e.g. 15 mm or 10 x 50 mm"
                      />
                    ) : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 180, gap: 16 }}>
                    <SpecificationFilter
                      label={tmt ? 'Brand' : 'Grade'}
                      value={manualGrade ? '__manual__' : draft.grade}
                      options={[
                        {
                          value: '',
                          label: tmt ? 'Choose brand' : 'Choose grade',
                        },
                        ...(!tmt
                          ? [
                              {
                                value: '__manual__',
                                label: 'Enter grade manually',
                              },
                            ]
                          : []),
                        ...gradeOptions.map((value) => ({
                          value,
                          label: value,
                        })),
                      ]}
                      disabled={
                        locked || (!size && !manualSize) || query.isFetching
                      }
                      onChange={chooseGrade}
                    />
                    {manualGrade ? (
                      <Field
                        label="Enter grade"
                        value={draft.grade}
                        editable={!locked}
                        onChangeText={(value) => update('grade', value)}
                        placeholder="Enter required grade"
                      />
                    ) : null}
                  </View>
                </Row>
                {tmt ? (
                  <Field
                    label="Grade (optional)"
                    value={draft.requestedGrade ?? ''}
                    editable={!locked}
                    placeholder="Enter required grade, e.g. Fe 500D"
                    onChangeText={(value) => {
                      setMessage('');
                      setCartNotice('');
                      setDraft({
                        ...draft,
                        requestedGrade: value
                          .replace(/[\x00-\x1f\x7f]/g, '')
                          .slice(0, 80),
                        review: false,
                      });
                    }}
                  />
                ) : null}
                {manualActive && (!currentInput || manualPreview.isFetching) ? (
                  <Txt style={s.muted}>Calculating price...</Txt>
                ) : null}
                {manualActive && manualPreview.error ? (
                  <View style={{ gap: 8 }}>
                    <Txt accessibilityRole="alert">
                      {manualPreview.error.message}
                    </Txt>
                    <Button
                      secondary
                      onPress={() => void manualPreview.refetch()}
                    >
                      Retry price calculation
                    </Button>
                  </View>
                ) : null}
                {manualActive && match?.status === 'dimensions_required' ? (
                  <Txt accessibilityRole="alert">
                    Enter dimensions in this order:{' '}
                    {match.category?.dimension_label}.
                  </Txt>
                ) : null}
                {manualActive && match?.size_status === 'out_of_range' ? (
                  <Txt style={{ color: c.red }}>
                    Size out of range. Contact 9780830333 or submit your
                    requirement for confirmation.
                  </Txt>
                ) : null}
                {manualActive &&
                match &&
                [
                  'out_of_range',
                  'unlisted_material',
                  'unlisted_grade',
                ].includes(match.status) ? (
                  <Link
                    href="tel:+919780830333"
                    accessibilityLabel="Call FTI at 9780830333"
                    style={{ color: c.red, paddingVertical: 12 }}
                  >
                    Call FTI: 9780830333
                  </Link>
                ) : null}
                {staleSelection ? (
                  <Txt accessibilityRole="alert">
                    The selected size is no longer available. Choose another
                    size.
                  </Txt>
                ) : null}
                {!manualActive &&
                size &&
                !query.isFetching &&
                !gradeOptions.length ? (
                  <Txt style={s.muted}>
                    No grades currently available for this size.
                  </Txt>
                ) : null}
                {!manualActive &&
                size &&
                draft.grade &&
                !query.isFetching &&
                gradeOptions.length > 0 &&
                !gradeOptions.includes(draft.grade) ? (
                  <Txt accessibilityRole="alert">
                    The selected grade is no longer available. Choose another
                    grade.
                  </Txt>
                ) : null}
                {!manualActive &&
                size &&
                draft.optionId &&
                productOptions.length === 1 &&
                !option &&
                !query.isFetching ? (
                  <Txt accessibilityRole="alert">
                    The selected product is no longer available. Choose the
                    grade again to view the current product.
                  </Txt>
                ) : null}
                {!manualActive && productOptions.length > 1 ? (
                  <CatalogFilter
                    label="Product"
                    value={draft.optionId}
                    options={[
                      { value: '', label: 'Choose product' },
                      ...productOptions.map((item) => ({
                        value: item.id,
                        label: `${item.product_name} · ${item.uom}`,
                      })),
                    ]}
                    disabled={locked}
                    onChange={(value) => update('optionId', value)}
                  />
                ) : null}
                {manualActive && !option ? (
                  <CatalogFilter
                    label="Quantity unit"
                    value={unit}
                    disabled={locked}
                    options={['MT', 'kg', 'piece', 'box', 'bundle'].map(
                      (value) => ({ value, label: value }),
                    )}
                    onChange={(value) =>
                      setDraft({
                        ...draft,
                        manual: { ...manualFields, uom: value as typeof unit },
                        review: false,
                      })
                    }
                  />
                ) : null}
                {productId ? (
                  <MaterialSectionTitle
                    number={2}
                    title="Consignment Quantity"
                  />
                ) : null}
                {productId ? (
                  <MaterialQuantity
                    value={draft.quantity}
                    onChange={(value) => update('quantity', value)}
                    unit={unit}
                    minimum={option?.min_order_qty}
                    disabled={(!option && !manualActive) || locked}
                  />
                ) : (
                  <Field
                    label={
                      option
                        ? `Quantity (${option.uom}, minimum ${option.min_order_qty})`
                        : manualActive
                          ? `Quantity (${unit})`
                          : 'Quantity'
                    }
                    value={draft.quantity}
                    onChangeText={(value) => update('quantity', value)}
                    numeric
                    placeholder="Enter quantity"
                    editable={(!!option || manualActive) && !locked}
                  />
                )}
                {draft.quantity && errorQuantity ? (
                  <Txt accessibilityRole="alert" style={{ color: c.red }}>
                    {errorQuantity}
                  </Txt>
                ) : null}
                {option || manualActive ? (
                  <View
                    style={{
                      gap: 6,
                      ...(productId
                        ? {
                            padding: 14,
                            borderRadius: 8,
                            backgroundColor: '#eff4ff',
                          }
                        : {}),
                    }}
                  >
                    {productId ? (
                      <Txt
                        style={{
                          color: '#485f83',
                          fontSize: 12,
                          fontWeight: '600',
                        }}
                      >
                        Quotation
                      </Txt>
                    ) : null}
                    <Txt style={{ fontWeight: '700' }}>
                      {option?.product_name ?? materialInput}
                    </Txt>
                    {!priceAccess ? <SubscribeForPrices /> : <Txt style={s.h2}>
                      {price
                        ? `INR ${price.amount} / ${price.unit}`
                        : 'Request quotation'}
                    </Txt>}
                    {estimate?.total ? (
                      <Txt style={{ fontWeight: '700' }}>
                        Estimated total: INR {estimate.total}
                      </Txt>
                    ) : null}
                    <Txt style={s.muted}>
                      {price
                        ? price.tax
                        : `FTI will confirm the price for your selected size and ${tmt ? 'brand' : 'grade'}.`}
                    </Txt>
                  </View>
                ) : null}
                {!draft.review ? (
                  productId ? (
                    <View
                      style={{
                        backgroundColor: '#ffffff',
                        padding: 16,
                        borderTopWidth: 1,
                        borderTopColor: '#e6eeff',
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          gap: 8,
                          width: '100%',
                          maxWidth: 640,
                          alignSelf: 'center',
                        }}
                      >
                        <Button
                          secondary
                          icon="file-text"
                          disabled={!valid || busy}
                          onPress={() => void review()}
                          style={{
                            flex: 1,
                            backgroundColor: '#e6eeff',
                            borderWidth: 0,
                            borderRadius: 4,
                            minHeight: 48,
                          }}
                        >
                          Request quotation
                        </Button>
                        <Button
                          icon="shopping-cart"
                          disabled={!valid || busy}
                          onPress={addToCart}
                          style={{
                            flex: 1.8,
                            backgroundColor:
                              valid && !busy ? '#d32f2f' : '#d7e3f9',
                            borderWidth: 0,
                            borderRadius: 4,
                            minHeight: 48,
                          }}
                        >{`Add to Cart${draft.quantity ? ` · ${draft.quantity} ${unit}` : ''}`}</Button>
                      </View>
                    </View>
                  ) : (
                    <Button
                      disabled={!valid || busy}
                      onPress={() => void review()}
                    >
                      {auth.session ? 'Review request' : 'Sign in to continue'}
                    </Button>
                  )
                ) : (
                  <>
                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: c.line,
                        paddingTop: 16,
                        gap: 8,
                      }}
                    >
                      <Txt style={s.h2}>Review request</Txt>
                      {matchChanged ? (
                        <Button
                          secondary
                          disabled={!valid || busy || !!attempt}
                          onPress={() => void review()}
                        >
                          Review current price
                        </Button>
                      ) : null}
                      <Txt>
                        {materialInput} · {sizeInput || 'Unavailable size'} ·{' '}
                        {tmt
                          ? `Brand: ${draft.grade}${draft.requestedGrade?.trim() ? ` / Grade: ${draft.requestedGrade.trim()}` : ''}`
                          : draft.grade}
                      </Txt>
                      <Txt>
                        {draft.quantity} {unit}
                      </Txt>
                      {!attempt ? (
                        <Button
                          secondary
                          onPress={() => setDraft({ ...draft, review: false })}
                        >
                          Edit selection
                        </Button>
                      ) : null}
                    </View>
                    {!auth.session ? (
                      <Button
                        disabled={busy || !valid}
                        onPress={() => void review()}
                      >
                        Sign in to continue
                      </Button>
                    ) : (
                      <>
                        {productId ? (
                          <MaterialSectionTitle
                            number={3}
                            title="Dispatch Destination"
                          />
                        ) : null}
                        <Field
                          label="Buyer name"
                          value={name}
                          editable={!locked}
                          onChangeText={(value) => {
                            buyerEdited.current = true;
                            setName(value);
                          }}
                          placeholder="Full name"
                        />
                        <Field
                          label="Business / buyer type"
                          value={business}
                          editable={!locked}
                          onChangeText={(value) => {
                            buyerEdited.current = true;
                            setBusiness(value);
                          }}
                          placeholder="Business name or Individual"
                        />
                        <Field
                          label="Delivery location (up to 100 characters)"
                          value={location}
                          editable={!locked}
                          onChangeText={setLocation}
                          placeholder="Address, city, state and PIN code"
                          multiline
                        />
                        <Txt style={s.muted}>
                          Verified WhatsApp:{' '}
                          {auth.identity?.profile.phone ??
                            auth.session.user.phone}
                        </Txt>
                        <View>
                          <Chip
                            selected={consent}
                            onPress={() => {
                              if (!locked) setConsent(!consent);
                            }}
                          >
                            Send me WhatsApp updates for this request
                          </Chip>
                        </View>
                        <Txt style={s.muted}>
                          FTI’s configured recipients will receive your request
                          and delivery details. Pricing and availability are
                          confirmed by FTI.
                        </Txt>
                        <Button
                          disabled={
                            busy || (!attempt && (!valid || !!matchChanged))
                          }
                          onPress={() => void submit()}
                        >
                          {busy
                            ? 'Submitting…'
                            : attempt
                              ? 'Retry request'
                              : 'Submit request'}
                        </Button>
                        {attempt && message ? (
                          <Txt style={s.muted}>
                            Retry sends the same request, so it will not create
                            a duplicate.
                          </Txt>
                        ) : null}
                      </>
                    )}
                  </>
                )}
              </>
            </Card>
          ) : null}
        </>
      )}
      {!productId && draft.category === 'square' ? (
        <ProductReferenceCharts product={{ slug: 'square' }} />
      ) : null}
      {!productId && !adapter && !manualActive ? (
        draft.sizeId && query.isFetching ? (
          <Txt style={s.muted}>Loading matching materials…</Txt>
        ) : (
          renderMaterials?.(
            {
              category:
                draft.category && draft.category !== 'steel'
                  ? draft.category
                  : undefined,
              ids: draft.sizeId
                ? [
                    ...new Set(
                      (data?.options ?? [])
                        .filter(
                          (item) => !draft.grade || item.grade === draft.grade,
                        )
                        .map((item) => item.product_id),
                    ),
                  ]
                : undefined,
            },
            !draft.category,
          )
        )
      ) : null}
      {productId ? (
        <Button secondary onPress={() => router.push('/cart')}>
          View cart
        </Button>
      ) : null}
      {cartNotice ? (
        <View
          style={{ padding: 12, borderRadius: 8, backgroundColor: '#ecfdf3' }}
        >
          <Txt
            accessibilityLiveRegion="polite"
            style={{ color: '#166534', fontSize: 13 }}
          >
            {cartNotice}
          </Txt>
        </View>
      ) : null}
      {message ? (
        <Txt accessibilityRole="alert" style={{ color: c.red }}>
          {message}
        </Txt>
      ) : null}
    </View>
  );
}
