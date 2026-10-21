import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Announcements } from '@features/operations/ui';
import { useAuth } from '@features/auth/ui';
import { MaterialPriceBanner } from '@features/pricing/ui';
import {
  Heading,
  Card,
  Section,
  Txt,
  Icon,
  Row,
  Button,
  c,
  s,
} from '@shared/ui';
export function Home() {
  const { identity, session, ready, loading, error } = useAuth();
  const name = identity?.profile.full_name ?? '';
  const business = identity?.businesses.find(
    (item) => item.verification_status === 'verified',
  ) ?? identity?.businesses[0];
  const accountResolved = ready && !loading && !error && !!identity;
  const tools = [
    {
      title: 'Material catalogue',
      description: 'Find materials and specifications',
      icon: 'box' as const,
      path: '/products',
    },
    {
      title: 'Market rates',
      description: 'View published supplier prices',
      icon: 'trending-up' as const,
      path: '/rates',
    },
    {
      title: 'Weight calculator',
      description: 'Calculate theoretical steel weight',
      icon: 'cpu' as const,
      path: '/calculator',
    },
    {
      title: 'Requests & quotations',
      description: 'Prepare your material requirements',
      icon: 'file-text' as const,
      path: '/rfqs',
    },
  ];
  return (
    <View>
      <MaterialPriceBanner />
      <Heading
        eyebrow="YOUR INDUSTRIAL PROCUREMENT DESK"
        title={name ? 'Welcome, ' + name + '.' : 'Welcome to FTI.'}
        description="Manage your materials, procurement, and deliveries in one workspace."
      />
      {accountResolved ? <Card
        style={{
          backgroundColor: c.dark,
          borderColor: c.dark,
          gap: 16,
          marginBottom: 24,
          padding: 26,
        }}
      >
        <Icon name="briefcase" size={28} color="white" />
        <Txt style={{ color: 'white', fontSize: 27, fontWeight: '700' }}>
          {business ? business.legal_name : 'Everything your business needs to move forward.'}
        </Txt>
        <Txt style={{ color: '#B8C6D8', fontSize: 13, lineHeight: 22 }}>
          {business
            ? business.verification_status === 'verified'
              ? 'Your business is verified. Explore materials, market rates, and your procurement activity.'
              : business.verification_status === 'pending'
                ? 'Your business application is under review. You can view your submitted details in your account.'
                : 'Your business application needs changes. Open your account to review the feedback and update your details.'
            : 'You are signed in. Complete your business details and addresses, then submit your application for verification.'}
        </Txt>
        <Button
          onPress={() => router.push({ pathname: '/account', params: { section: business ? 'profile' : 'business' } })}
          style={{ alignSelf: 'flex-start' }}
        >
          {business ? 'View business profile' : 'Set up business profile'}
        </Button>
      </Card> : !session && ready ? <Card style={{ gap: 16, marginBottom: 24 }}>
        <Txt style={s.h2}>Sign in to your FTI account</Txt>
        <Txt style={s.muted}>Sign in to manage your business profile and procurement activity.</Txt>
        <Button onPress={() => router.push('/login')}>Sign in</Button>
      </Card> : null}
      <Section title="Your procurement tools" />
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 28,
        }}
      >
        {tools.map((tool) => (
          <Pressable
            key={tool.path}
            accessibilityRole="button"
            accessibilityLabel={tool.title}
            onPress={() => router.push(tool.path as never)}
            style={{ flexGrow: 1, flexBasis: 210 }}
          >
            <Card style={{ gap: 18, height: 160 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Icon name={tool.icon} color={c.red} />
                <Icon name="arrow-up-right" size={16} />
              </Row>
              <Txt style={s.h2}>{tool.title}</Txt>
              <Txt style={s.muted}>{tool.description}</Txt>
            </Card>
          </Pressable>
        ))}
      </View>
      <Announcements />
    </View>
  );
}
