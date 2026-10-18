import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Announcements } from '@features/operations/ui';
import { useAuth } from '@features/auth/ui';
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
  const { identity } = useAuth();
  const name = identity?.profile.full_name ?? '';
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
      <Heading
        eyebrow="YOUR INDUSTRIAL PROCUREMENT DESK"
        title={name ? 'Welcome, ' + name + '.' : 'Welcome to FTI.'}
        description="Manage your materials, procurement, and deliveries in one workspace."
      />
      <Card
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
          Everything your business needs to move forward.
        </Txt>
        <Txt style={{ color: '#B8C6D8', fontSize: 13, lineHeight: 22 }}>
          Set up your business profile to begin. Your catalogue, rates, and
          activity will appear when their data sources are connected.
        </Txt>
        <Button
          onPress={() => router.push('/account')}
          style={{ alignSelf: 'flex-start' }}
        >
          Set up business profile
        </Button>
      </Card>
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
