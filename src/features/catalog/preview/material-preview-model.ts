export const materialScreens = [
  'Raw materials home', 'Material categories', 'Search materials', 'Search results', 'Material filters', 'Guided selection', 'Material detail', 'Grade information', 'Compare materials', 'Reference documents',
  'Weight calculator', 'Rates overview', 'Price access', 'Price breakdown', 'Quantity & unit selector', 'Availability & delivery', 'Requirement basket', 'Login / registration', 'Delivery address', 'Delivery options', 'Review order', 'Bank transfer instructions', 'Payment verification', 'Order acknowledgement',
  'Multi-item requirements', 'Spreadsheet upload', 'Validation & clarifications', 'Manual material enquiry', 'Submit RFQ', 'RFQ tracking', 'Line clarification', 'Quotation detail', 'Request quotation revision', 'Accept quotation', 'Expired quotation',
  'Processing request', 'Cutting schedule', 'Drawing upload', 'Processing summary', 'Technical clarification', 'Drawing approval',
  'Orders', 'Order detail', 'Dispatch detail', 'Delivery tracking', 'Order documents', 'Reorder & review', 'Saved requirements', 'Business account', 'Invoices & payment history', 'Linked support request', 'Notifications & preferences',
  'Admin overview', 'Material catalogue management', 'Availability management', 'Rate management', 'RFQ inbox', 'RFQ workspace', 'Quotation editor', 'Cutting review', 'Order & payment management', 'Dispatch creation', 'Weight reconciliation', 'Customer management', 'Support workspace',
] as const;

export const materialGroups = [
  { name: 'Discover & specify', first: 1, last: 10 }, { name: 'Weight & rates', first: 11, last: 16 },
  { name: 'Order & bank verification', first: 17, last: 24 }, { name: 'Requirements & quotations', first: 25, last: 35 },
  { name: 'Cutting & approval', first: 36, last: 41 }, { name: 'Orders & business', first: 42, last: 52 },
  { name: 'Staff workspace', first: 53, last: 65 },
];

export type DemoMaterial = { id: string; name: string; category: string; grade: string; size: string; pieces: number; kgPerPiece: number; rate: number; requiresDetails?: boolean };
export const demoMaterials: DemoMaterial[] = [
  { id: 'bright', name: 'Round Bright Bar', category: 'round-bright-bar', grade: 'EN-8', size: 'Ø40 × 3000 mm', pieces: 20, kgPerPiece: Math.PI / 4 * 0.04 ** 2 * 3 * 7850, rate: 72 },
  { id: 'square', name: 'Square Bar', category: 'square', grade: '', size: '50 × 50 × 6000 mm', pieces: 10, kgPerPiece: 117.75, rate: 65 },
  { id: 'flat', name: 'Flat Bar', category: 'flat', grade: 'MS', size: '50 × 10 × 6000 mm', pieces: 10, kgPerPiece: 23.55, rate: 62 },
  { id: 'sheet', name: 'Steel Sheet', category: 'sheet', grade: 'MS', size: '6 × 1250 × 2500 mm', pieces: 4, kgPerPiece: 147.1875, rate: 60 },
  { id: 'roof', name: 'Roofing Sheet', category: 'roof-sheet', grade: '', size: '0.5 × 1060 mm overall × 3000 mm', pieces: 20, kgPerPiece: 0, rate: 0, requiresDetails: true },
];

export type PreviewState = {
  access: 'guest' | 'buyer' | 'subscriber'; role: 'customer' | 'accounts';
  selected: string; quantity: number; unit: 'piece' | 'kg' | 'MT';
  requirements: DemoMaterial[]; basket: DemoMaterial[];
  rfq: 'draft' | 'submitted' | 'clarification' | 'quoted' | 'accepted';
  quoteRevision: number; expired: boolean; quotedQuantity: number; acceptedRate: number | null;
  order: 'none' | 'awaiting_payment' | 'processing' | 'shipped' | 'delivered';
  payment: 'awaiting' | 'review' | 'partial' | 'verified' | 'clarification';
  reference: string; paid: number; submittedAmount: number;
  cutLength: number; proposedLength: number; cuttingApproved: boolean; cuttingReason: string;
  uploaded: boolean; actualKg: number; dispatched: number; carrier: string; tracking: string;
  messages: string[]; notes: string; ticket: boolean; approvals: string[];
  buyer: string; company: string; address: string; city: string; pincode: string;
  delivery: 'standard' | 'express'; currentRate: number;
};
export const initialPreviewState = (): PreviewState => ({
  access: 'guest', role: 'customer', selected: 'bright', quantity: 20, unit: 'piece',
  requirements: demoMaterials.map(item => ({ ...item })), basket: [], rfq: 'draft',
  quoteRevision: 1, expired: false, quotedQuantity: 20, acceptedRate: null,
  order: 'none', payment: 'awaiting', reference: '', paid: 0, submittedAmount: 0,
  cutLength: 1000, proposedLength: 950, cuttingApproved: false, cuttingReason: '', uploaded: false,
  actualKg: 594.2, dispatched: 0, carrier: '', tracking: '', messages: [], notes: '', ticket: false, approvals: [],
  buyer: 'Rakesh Kumar', company: 'Sample Engineering Works', address: 'Plot 12, Industrial Area', city: 'Ludhiana', pincode: '141003', delivery: 'standard', currentRate: 72,
});
export type PreviewAction =
  | { type: 'patch'; value: Partial<PreviewState> }
  | { type: 'add' } | { type: 'remove'; id: string }
  | { type: 'grade'; id: string; grade: string }
  | { type: 'rfq' } | { type: 'quote' } | { type: 'revise'; quantity: number }
  | { type: 'accept' } | { type: 'order' }
  | { type: 'payment'; reference: string; amount: number }
  | { type: 'verify' } | { type: 'dispatch'; pieces: number; carrier: string; tracking: string }
  | { type: 'deliver' } | { type: 'approveCut'; reason: string }
  | { type: 'message'; text: string } | { type: 'reorder' } | { type: 'reset' };

export function previewTotals(state: PreviewState) {
  const lines = state.basket.length ? state.basket : [{ ...demoMaterials[0], pieces: state.quotedQuantity }];
  const kg = lines.reduce((sum, item) => sum + item.kgPerPiece * item.pieces, 0);
  const goods = lines.reduce((sum, item) => sum + item.kgPerPiece * item.pieces * (item.id === 'bright' ? state.acceptedRate ?? state.currentRate : item.rate), 0);
  const tax = goods * 0.18;
  return { kg, goods, tax, freight: 1800, total: goods + tax + 1800, due: Math.max(0, goods + tax + 1800 - state.paid) };
}
export function requirementErrors(items: DemoMaterial[]) {
  return items.flatMap(item => [
    ...(!item.grade.trim() ? [`${item.name}: select grade${item.requiresDetails ? ', substrate, coating and colour' : ''}.`] : []),
    ...(!Number.isInteger(item.pieces) || item.pieces <= 0 ? [`${item.name}: enter whole positive pieces.`] : []),
  ]);
}
export function previewReducer(state: PreviewState, action: PreviewAction): PreviewState {
  switch (action.type) {
    case 'reset': return initialPreviewState();
    case 'patch': return { ...state, ...action.value };
    case 'grade': return { ...state, requirements: state.requirements.map(item => item.id === action.id ? { ...item, grade: action.grade } : item) };
    case 'add': {
      const item = demoMaterials.find(item => item.id === state.selected);
      if (!item || !item.grade || item.requiresDetails || !Number.isFinite(state.quantity) || state.quantity <= 0) return state;
      const pieces = state.unit === 'piece' ? state.quantity : state.quantity * (state.unit === 'MT' ? 1000 : 1) / item.kgPerPiece;
      if (!Number.isInteger(pieces) || pieces < (item.id === 'bright' ? 20 : 1)) return state;
      return { ...state, basket: [...state.basket.filter(line => line.id !== item.id), { ...item, pieces }] };
    }
    case 'remove': return { ...state, basket: state.basket.filter(item => item.id !== action.id) };
    case 'rfq': return state.access === 'guest' || requirementErrors(state.requirements).length ? state : { ...state, rfq: 'submitted' };
    case 'quote': return { ...state, rfq: 'quoted', expired: false };
    case 'revise': return Number.isInteger(action.quantity) && action.quantity >= 20 ? { ...state, quotedQuantity: action.quantity, quoteRevision: state.quoteRevision + 1, rfq: 'quoted', expired: false, acceptedRate: null, basket: state.basket.map(item => item.id === 'bright' ? { ...item, pieces: action.quantity } : item) } : state;
    case 'accept': return state.expired || state.rfq !== 'quoted' || state.access === 'guest' ? state : { ...state, rfq: 'accepted', acceptedRate: state.currentRate };
    case 'order': return state.access === 'guest' || !state.basket.length || !state.address.trim() || !/^[1-9]\d{5}$/.test(state.pincode) || state.delivery === 'express' ? state : { ...state, order: 'awaiting_payment' };
    case 'payment': return state.order !== 'awaiting_payment' || !/^[A-Za-z0-9/-]{6,40}$/.test(action.reference) || !Number.isFinite(action.amount) || action.amount <= 0 || ['review', 'verified'].includes(state.payment) ? state : { ...state, payment: 'review', reference: action.reference, submittedAmount: action.amount };
    case 'verify': {
      if (state.role !== 'accounts' || state.payment !== 'review') return state;
      const paid = state.paid + state.submittedAmount;
      const verified = paid + 0.005 >= previewTotals(state).total;
      return { ...state, paid, submittedAmount: 0, payment: verified ? 'verified' : 'partial', order: verified ? 'processing' : 'awaiting_payment', messages: [...state.messages, `Accounts verified ${state.reference}: INR ${paid.toFixed(2)} received in total.`] };
    }
    case 'dispatch': return state.payment !== 'verified' || !action.carrier.trim() || !action.tracking.trim() || !Number.isInteger(action.pieces) || action.pieces <= 0 || action.pieces > state.quotedQuantity ? state : { ...state, dispatched: action.pieces, carrier: action.carrier, tracking: action.tracking, order: 'shipped' };
    case 'deliver': return state.order !== 'shipped' ? state : { ...state, order: 'delivered' };
    case 'approveCut': return !state.uploaded || action.reason.trim().length < 5 ? state : { ...state, cuttingApproved: true, cuttingReason: action.reason.trim(), cutLength: state.proposedLength };
    case 'message': return action.text.trim() ? { ...state, messages: [...state.messages, action.text.trim()] } : state;
    case 'reorder': return { ...state, selected: 'bright', quantity: state.quotedQuantity, unit: 'piece', acceptedRate: null, rfq: 'draft', order: 'none', payment: 'awaiting', paid: 0, basket: [] };
  }
}
