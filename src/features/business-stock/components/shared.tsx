import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Row, Button, Txt } from '@shared/ui';

export function StockPages({offset, setOffset, count}: {offset: number; setOffset: (value: number) => void; count: number}) {
  return <Row><Button secondary disabled={!offset} onPress={() => setOffset(Math.max(0, offset - 24))}>Previous</Button><Txt>Page {Math.floor(offset / 24) + 1}</Txt><Button secondary disabled={count < 24} onPress={() => setOffset(offset + 24)}>Next</Button></Row>;
}
export function useStockAction() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function run(action: () => Promise<unknown>, success = 'Saved.', after?: () => void) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); await client.invalidateQueries({queryKey: ['business-stock']}); setMessage(success); after?.(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return {busy, message, run};
}
