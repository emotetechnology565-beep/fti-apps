import { withShell } from '@core/layout/withShell';
import { AccessGate } from '@features/auth/ui';
import { RFQs } from '@features/quotations/screens/RFQsScreen';
function ProtectedScreen() {
  return (
    <AccessGate>
      <RFQs />
    </AccessGate>
  );
}
export default withShell(ProtectedScreen);
