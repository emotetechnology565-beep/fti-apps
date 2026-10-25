import {
  emptySelection,
  type SelectionDraft,
} from '../model/material-selection';

export type DraftStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};
const prefix = 'fti-material-selection-v1-';
const handoffKey = prefix + 'login-handoff';
const lifetime = 24 * 60 * 60 * 1000;
const handoffLifetime = 30 * 60 * 1000;

function readDraft(
  raw: string | null,
  now: number,
  maxAge = lifetime,
): SelectionDraft | null {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (
      !value ||
      typeof value.savedAt !== 'number' ||
      now < value.savedAt ||
      now - value.savedAt > maxAge
    )
      return null;
    const draft = emptySelection();
    for (const key of [
      'category',
      'sizeId',
      'grade',
      'optionId',
      'quantity',
      'productId',
    ] as const) {
      if (
        typeof value.draft?.[key] !== 'string' ||
        value.draft[key].length > 120
      )
        return null;
      draft[key] = value.draft[key];
    }
    draft.review = value.draft.review === true;
    if (value.draft.manual !== undefined) {
      const manual = value.draft.manual;
      if (
        !manual ||
        !['material', 'size', 'grade'].every(
          (key) => typeof manual[key] === 'string' && manual[key].length <= 80,
        ) ||
        !['kg', 'MT', 'piece', 'box', 'bundle'].includes(manual.uom)
      )
        return null;
      draft.manual = {
        material: manual.material,
        size: manual.size,
        grade: manual.grade,
        uom: manual.uom,
        ...(manual.gradeEntry === true ? { gradeEntry: true } : {}),
      };
    }
    return draft;
  } catch {
    return null;
  }
}

// Only public catalogue identifiers and quantity are stored. Buyer details never enter this adapter.
export function createSelectionDraftStorage(
  storage: DraftStorage,
  now = Date.now,
) {
  let queue = Promise.resolve<unknown>(undefined);
  const serial = <T>(action: () => Promise<T>) => {
    const result = queue.catch(() => {}).then(action);
    queue = result;
    return result;
  };
  const key = (owner: string | null) => prefix + (owner || 'guest');
  const encode = (draft: SelectionDraft) =>
    JSON.stringify({
      savedAt: now(),
      draft: {
        category: draft.category,
        sizeId: draft.sizeId,
        grade: draft.grade,
        optionId: draft.optionId,
        quantity: draft.quantity,
        review: draft.review,
        productId: draft.productId,
        ...(draft.manual
          ? {
              manual: {
                material: draft.manual.material,
                size: draft.manual.size,
                grade: draft.manual.grade,
                uom: draft.manual.uom,
                ...(draft.manual.gradeEntry === true ? { gradeEntry: true } : {}),
              },
            }
          : {}),
      },
    });
  return {
    load: (owner: string | null) =>
      serial(async () => {
        if (owner) {
          const pending = readDraft(
            await storage.getItem(handoffKey),
            now(),
            handoffLifetime,
          );
          if (pending) {
            await storage.removeItem(handoffKey);
            await storage.removeItem(key(null));
            await storage.setItem(key(owner), encode(pending));
            return pending;
          }
          await storage.removeItem(handoffKey);
        }
        return (
          readDraft(await storage.getItem(key(owner)), now()) ??
          emptySelection()
        );
      }),
    save: (owner: string | null, draft: SelectionDraft) =>
      serial(() => storage.setItem(key(owner), encode(draft))),
    prepareLogin: (draft: SelectionDraft) =>
      serial(async () => {
        await storage.setItem(key(null), encode(draft));
        await storage.setItem(handoffKey, encode(draft));
      }),
    clear: (owner: string | null) =>
      serial(() => storage.removeItem(key(owner))),
  };
}
