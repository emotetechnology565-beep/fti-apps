import { withShell } from '@core/layout/withShell';
import { AccessGate } from '@features/auth/ui';
import { Orders } from '@features/orders/screens/OrdersScreen';
function ProtectedScreen() {
  return (
    <AccessGate>
      <Orders />
    </AccessGate>
  );
}
export default withShell(ProtectedScreen);
