import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Icon, Row, Txt, c, s } from '@shared/ui';

export function StockSourceDropdown({source}: {source: 'fti' | 'business'}) {
  const [open, setOpen] = useState(false);
  function choose(next: 'fti' | 'business') {
    setOpen(false);
    if (next !== source) router.replace((next === 'fti' ? '/products' : '/business-stock') as never);
  }
  return <View style={{marginBottom: 20, gap: 8}}>
    <Txt style={s.label}>Stock source</Txt>
    <Pressable accessibilityRole="button" accessibilityLabel={`Stock source: ${source === 'fti' ? 'FTI stock' : 'Business stock'}`} accessibilityState={{expanded: open}} onPress={() => setOpen(true)} style={{padding: 15, borderWidth: 1, borderColor: c.line, borderRadius: 7, backgroundColor: 'white', maxWidth: 420}}>
      <Row style={{justifyContent: 'space-between'}}><Txt>{source === 'fti' ? 'FTI stock' : 'Business stock'}</Txt><Icon name="chevron-down" size={18}/></Row>
    </Pressable>
    <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#00000066'}}>
        <Card style={{gap: 14, width: '100%', maxWidth: 440, alignSelf: 'center'}}>
          <Txt style={s.h2}>Choose stock source</Txt>
          <Button secondary={source !== 'fti'} onPress={() => choose('fti')}>FTI stock</Button>
          <Txt>Materials supplied by FTI.</Txt>
          <Button secondary={source !== 'business'} onPress={() => choose('business')}>Business stock</Button>
          <Txt>Materials owned and uploaded by verified businesses.</Txt>
          <Button secondary onPress={() => setOpen(false)}>Close stock selector</Button>
        </Card>
      </View>
    </Modal>
  </View>;
}
