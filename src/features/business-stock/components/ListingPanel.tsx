import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@features/auth/ui';
import { Badge, Button, Card, Field, Txt, s } from '@shared/ui';
import { editableStock, newStockId, type StockListing } from '../model/types';
import { stockApi } from '../services/stock-api';
import { useStockAction } from './shared';
import { StockMedia } from './StockMedia';

export function ListingPanel({listing, review = false, onEdit}: {listing: StockListing; review?: boolean; onEdit?: () => void}) {
  const auth = useAuth();
  const action = useStockAction();
  const [confirm, setConfirm] = useState('');
  const [note, setNote] = useState('');
  const [quantity, setQuantity] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const requestId = useRef(newStockId());
  const eligible = !!auth.identity?.businesses.some(b => b.id === listing.business_id && b.verification_status === 'verified');
  const canUpload = listing.is_seller && eligible && ['draft','rejected','withdrawn'].includes(listing.status);
  const sameBusiness = !!auth.identity?.businesses.some(b => b.id === listing.business_id);
  async function enquire() {
    if (!/^\d{1,15}(\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0 || Number(quantity) > Number(listing.quantity) || message.trim().length < 5 || message.length > 2000) throw new Error('Enter an available quantity and enquiry of 5-2000 characters.');
    await stockApi.enquire(requestId.current,listing.id,quantity,message);
  }
  return <View style={{gap: 14}}>
    <Card style={{gap: 10}}><Badge>Business stock</Badge><Txt style={s.h2}>{listing.material}</Txt><Txt>Owned and offered by {listing.business_name}</Txt><Txt>{listing.grade} · {listing.specification}</Txt>
      <Txt>Condition: {listing.condition}</Txt><Txt>Available quantity: {listing.quantity} {listing.uom}</Txt><Txt>Asking INR {listing.asking_price} / {listing.price_unit}</Txt><Txt>{listing.city}, {listing.state} · {listing.pincode}</Txt><Txt>Available until {new Date(listing.available_until).toLocaleString()}</Txt>
      {listing.notes ? <Txt>{listing.notes}</Txt> : null}<Txt>Status: {listing.status}{listing.status === 'published' && !listing.available ? ' · unavailable or expired' : ''}</Txt>
      <Txt>Seller asking price only. Final price, GST, freight, payment and fulfilment require agreement through an enquiry.</Txt>
      {listing.review_note ? <Txt>FTI review: {listing.review_note}</Txt> : null}
    </Card>
    <StockMedia listing={listing} kind="stock_photo" canUpload={canUpload}/>
    {listing.is_seller || listing.can_certificates || review ? <StockMedia listing={listing} kind="stock_certificate" canUpload={canUpload}/> : <Txt>Submit an enquiry to access supporting certificates.</Txt>}
    {listing.is_seller ? <Card style={{gap: 12}}><Txt style={s.h2}>Seller controls</Txt>
      {eligible && editableStock(listing.status) && onEdit ? <Button secondary disabled={action.busy} onPress={onEdit}>Edit details and availability</Button> : null}
      {listing.status === 'published' ? <Txt>Editing removes the listing from buyer discovery until FTI approves the updated draft.</Txt> : null}
      {!eligible ? <Txt>Your business must be verified to submit or edit stock. You can still withdraw this listing.</Txt> : null}
      {eligible && ['draft','rejected'].includes(listing.status) ? <Button disabled={action.busy} onPress={() => setConfirm('submit')}>Submit for FTI review</Button> : null}
      {['draft','submitted','published','rejected'].includes(listing.status) ? <Button secondary disabled={action.busy} onPress={() => setConfirm('withdraw')}>Withdraw listing</Button> : null}
      {eligible && listing.status === 'published' ? <Button secondary disabled={action.busy} onPress={() => setConfirm('sold')}>Mark stock sold</Button> : null}
    </Card> : null}
    {review && listing.status === 'submitted' ? listing.is_seller ? <Txt>Another FTI reviewer must review your own listing.</Txt> : <Card style={{gap: 10}}><Txt style={s.h2}>FTI stock review</Txt><Field label="Listing review note (5-1000 characters)" value={note} onChangeText={setNote} multiline/><Button disabled={action.busy || note.trim().length < 5 || note.length > 1000} onPress={() => setConfirm('approve')}>Approve for publication</Button><Button secondary disabled={action.busy || note.trim().length < 5 || note.length > 1000} onPress={() => setConfirm('reject')}>Reject with feedback</Button></Card> : null}
    {confirm ? <Card style={{gap: 12}}><Txt>Confirm: {confirm} this business stock listing? {confirm === 'sold' ? 'Sold listings cannot be reopened.' : confirm === 'approve' ? 'This publishes the listing details and photos to signed-in buyers.' : ''}</Txt><Button disabled={action.busy} onPress={() => void action.run(() => stockApi.transition(listing,confirm,note), 'Listing updated.', () => setConfirm(''))}>Confirm listing action</Button><Button secondary disabled={action.busy} onPress={() => setConfirm('')}>Cancel action</Button></Card> : null}
    {!listing.is_seller && !sameBusiness && !review && listing.available ? <Card style={{gap: 12}}><Txt style={s.h2}>Enquire about this business stock</Txt>
      {sent ? <><Txt>Enquiry submitted. Track the conversation in My stock workspace.</Txt><Button secondary onPress={() => router.push('/sell-stock' as never)}>View my enquiries</Button></> : <>
        <Field label={`Requested quantity (${listing.uom})`} numeric value={quantity} onChangeText={setQuantity}/><Field label="Message to seller" value={message} onChangeText={setMessage} multiline/>
        <Txt>This sends an enquiry and does not reserve stock or take payment.</Txt>
        <Button disabled={action.busy} onPress={() => void action.run(enquire, 'Enquiry submitted.', () => setSent(true))}>Send stock enquiry</Button>
      </>}
    </Card> : null}
    {action.message ? <Txt accessibilityRole="alert">{action.message}</Txt> : null}
  </View>;
}
