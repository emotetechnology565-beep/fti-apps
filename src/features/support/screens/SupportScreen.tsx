import { View } from 'react-native';
import { Heading } from '@shared/ui';
import { AccessGate } from '@features/auth/ui';
import { SupportTickets, Notifications } from '@features/operations/ui';
export function Support() {
 return <View style={{gap:18}}><Heading eyebrow="SUPPORT" title="How can we help?" description="Follow dispatch updates and get help with your orders."/>
 <AccessGate><Notifications/><SupportTickets/></AccessGate></View>;
}
