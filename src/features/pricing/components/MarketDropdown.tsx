import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Icon, Row, Txt, c, s } from '@shared/ui';
import type { Market } from '../model/types';

export function MarketDropdown({
  markets,
  selected,
  onChange,
}: {
  markets: Market[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const names = markets
    .filter((market) => selected.includes(market.id))
    .map((market) => market.name);
  const label = names.length ? names.join(', ') : 'All markets';
  return (
    <View style={{ gap: 8 }}>
      <Txt style={s.label}>Markets</Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Markets: ${label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.trigger}
      >
        <Txt style={{ flex: 1 }}>{label}</Txt>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} />
      </Pressable>
      {open ? (
        <View style={styles.menu}>
          <Txt style={s.muted}>
            Choose multiple markets. Clear the selection to show all.
          </Txt>
          <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !selected.length }}
              accessibilityLabel="All markets"
              onPress={() => onChange([])}
              style={styles.option}
            >
              <Icon
                name={!selected.length ? 'check-square' : 'square'}
                color={!selected.length ? c.red : c.muted}
                size={20}
              />
              <Txt>All markets</Txt>
            </Pressable>
            {markets.map((market) => {
              const checked = selected.includes(market.id);
              return (
                <Pressable
                  key={market.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={`${market.name}, ${market.state}`}
                  onPress={() =>
                    onChange(
                      checked
                        ? selected.filter((id) => id !== market.id)
                        : [...selected, market.id],
                    )
                  }
                  style={[
                    styles.option,
                    checked ? { backgroundColor: c.pink } : null,
                  ]}
                >
                  <Icon
                    name={checked ? 'check-square' : 'square'}
                    color={checked ? c.red : c.muted}
                    size={20}
                  />
                  <Txt style={{ flex: 1 }}>
                    {market.name} · {market.state}
                  </Txt>
                </Pressable>
              );
            })}
          </ScrollView>
          <Row style={{ justifyContent: 'space-between' }}>
            <Button secondary onPress={() => onChange([])}>
              Clear selection
            </Button>
            <Button onPress={() => setOpen(false)}>Done</Button>
          </Row>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    padding: 14,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    backgroundColor: c.paper,
  },
  menu: {
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    backgroundColor: c.paper,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    padding: 12,
    borderRadius: 6,
  },
});
