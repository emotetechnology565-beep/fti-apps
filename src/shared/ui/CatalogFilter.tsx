import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Button } from './Button';
import { Card } from './Card';
import { Icon } from './Icon';
import { Row } from './Row';
import { Txt } from './Txt';
import { c } from '../theme/tokens';
import { s } from '../theme/styles';

export function CatalogFilter({
  label,
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
  emptyHint,
  onOpen,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  emptyHint?: string;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected =
    options.find((option) => option.value === value)?.label ??
    options[0]?.label ??
    'Choose';
  return (
    <View style={{ flex: 1, minWidth: compact ? 0 : 180, gap: 8 }}>
      <Txt style={s.label}>{label}</Txt>
      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected}`}
        accessibilityState={{ expanded: open, disabled }}
        onPress={() => {
          setOpen(true);
          onOpen?.();
        }}
        style={{
          padding: 14,
          minHeight: 48,
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 8,
          backgroundColor: 'white',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt numberOfLines={compact ? 1 : undefined} style={{ flex: 1 }}>
            {selected}
          </Txt>
          <Icon name="chevron-down" size={18} />
        </Row>
      </Pressable>
      {emptyHint ? <Txt style={s.muted}>{emptyHint}</Txt> : null}
      <Modal
        transparent
        visible={open && !disabled}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
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
              width: '100%',
              maxWidth: 460,
              maxHeight: '80%',
              alignSelf: 'center',
              gap: 14,
            }}
          >
            <Txt style={s.h2}>{label}</Txt>
            <ScrollView nestedScrollEnabled style={{ flexShrink: 1 }}>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{
                    selected: option.value === value,
                    checked: option.value === value,
                  }}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={{
                    padding: 14,
                    minHeight: 48,
                    backgroundColor: option.value === value ? c.pink : 'white',
                    borderRadius: 6,
                  }}
                >
                  <Row>
                    <Icon
                      name={option.value === value ? 'check-circle' : 'circle'}
                      size={18}
                    />
                    <Txt>{option.label}</Txt>
                  </Row>
                </Pressable>
              ))}
            </ScrollView>
            <Button secondary onPress={() => setOpen(false)}>
              Close filter
            </Button>
          </Card>
        </View>
      </Modal>
    </View>
  );
}
