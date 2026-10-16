import { withShell } from '@core/layout/withShell';
import { Button, Empty } from '@shared/ui';
import { router } from 'expo-router';
function NotFound() {
  return (
    <Empty
      title="This page isn't here"
      description="Return to the workspace to continue."
      action={<Button onPress={() => router.replace('/')}>Back to home</Button>}
    />
  );
}
export default withShell(NotFound);
