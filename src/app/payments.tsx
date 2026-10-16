import { withShell } from '@core/layout/withShell';
import { AccessGate } from '@features/auth/ui';
import { Payments } from '@features/payments/screens/PaymentsScreen';
function ProtectedScreen() {
  return (
    <AccessGate>
      <Payments />
    </AccessGate>
  );
}
export default withShell(ProtectedScreen);
