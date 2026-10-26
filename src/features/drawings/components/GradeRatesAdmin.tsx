import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Field, Txt, s } from '@shared/ui';
import {
  gradeKey,
  loadGradeRates,
  saveGradeRate,
  type GradeRate,
} from '../services/grade-api';
function RateEditor({ row }: { row: GradeRate }) {
  const [bolt, setBolt] = useState(String(row.bolt_rate));
  const [nut, setNut] = useState(String(row.nut_rate));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  async function save() {
    if (
      ![bolt, nut].every((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0)
    ) {
      setMessage('Enter positive rates with at most two decimal places.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await saveGradeRate(row, Number(bolt), Number(nut));
      await client.invalidateQueries({ queryKey: gradeKey });
      setMessage('Rates saved.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 10 }}>
      <Txt style={s.h2}>{row.grade}</Txt>
      <Field
        label="Bolt rate (₹/kg)"
        numeric
        value={bolt}
        onChangeText={setBolt}
      />
      <Field
        label="Nut rate (₹/kg)"
        numeric
        value={nut}
        onChangeText={setNut}
      />
      <Button disabled={busy} onPress={() => void save()}>
        Save {row.grade} rates
      </Button>
      {message ? <Txt accessibilityRole="alert">{message}</Txt> : null}
    </Card>
  );
}
export function GradeRatesAdmin() {
  const query = useQuery({ queryKey: gradeKey, queryFn: loadGradeRates });
  return (
    <Card style={{ gap: 12 }}>
      <Txt style={s.h2}>Fastener grade prices</Txt>
      <Txt>
        Shared rates per kilogram for all bolts and nuts. Changes apply to new
        estimates.
      </Txt>
      {query.isPending ? (
        <Txt>Loading rates...</Txt>
      ) : query.isError ? (
        <>
          <Txt>Grade rates unavailable. Apply the grade-rate SQL setup.</Txt>
          <Button onPress={() => void query.refetch()}>
            Reload grade rates
          </Button>
        </>
      ) : (
        query.data.map((row) => (
          <RateEditor key={row.grade + row.revision} row={row} />
        ))
      )}
    </Card>
  );
}
