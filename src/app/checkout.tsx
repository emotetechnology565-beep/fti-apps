import { withShell } from '@core/layout/withShell';
import { AccessGate } from '@features/auth/ui';
import { Checkout } from '@features/checkout/screens/CheckoutScreen';
function ProtectedScreen() {
  return (
    <AccessGate>
      <Checkout />
    </AccessGate>
  );
}
export default withShell(ProtectedScreen);
