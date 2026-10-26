import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Button, Card, Txt, c, s } from '@shared/ui';

export function DimensionSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8, marginBottom: 14 }}>
      <Txt style={s.label}>{label}</Txt>
      <Button
        secondary
        disabled={!options.length}
        onPress={() => setOpen(true)}
      >
        {options.find((o) => o.value === value)?.label ?? 'Choose'}
      </Button>
      <Modal transparent visible={open} onRequestClose={() => setOpen(false)}>
        <View
          style={{
            flex: 1,
            padding: 24,
            justifyContent: 'center',
            backgroundColor: '#00000066',
          }}
        >
          <Card
            style={{
              maxHeight: '80%',
              width: '100%',
              maxWidth: 480,
              alignSelf: 'center',
              gap: 12,
            }}
          >
            <Txt style={s.h2}>{label}</Txt>
            <ScrollView>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ checked: option.value === value }}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={{
                    padding: 15,
                    minHeight: 48,
                    backgroundColor: option.value === value ? c.pink : 'white',
                  }}
                >
                  <Txt>{option.label}</Txt>
                </Pressable>
              ))}
            </ScrollView>
            <Button secondary onPress={() => setOpen(false)}>
              Close choices
            </Button>
          </Card>
        </View>
      </Modal>
    </View>
  );
}
