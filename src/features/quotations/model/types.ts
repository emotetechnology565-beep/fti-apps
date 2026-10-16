export type RFQ = {
  id: string;
  title: string;
  quantity: string;
  notes: string;
  status:
    | 'Draft'
    | 'Under review'
    | 'Quote received'
    | 'Revision requested'
    | 'Accepted';
  created: string;
};
