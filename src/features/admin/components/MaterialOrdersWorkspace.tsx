import { useState } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { RawMaterialAdmin } from '@features/catalog';
import { FastenerOrdersAdmin } from '@features/drawings/ui';
import { Icon, Txt, c } from '@shared/ui';

const tabs = [
  { id: 'materials', label: 'Materials', icon: 'layers' },
  { id: 'fasteners', label: 'Fasteners', icon: 'tool' },
  { id: 'settings', label: 'Notification settings', icon: 'settings' },
] as const;
export function MaterialOrdersWorkspace() {
  const [selected, setSelected] =
    useState<(typeof tabs)[number]['id']>('materials');
  return (
    <View style={{ gap: 20 }}>
      <Txt style={{ color: '#58697C', lineHeight: 21 }}>
        Review buyer requests and WhatsApp delivery updates. Manage the
        recipient numbers for both request types in notification settings.
      </Txt>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: selected === tab.id }}
            onPress={() => setSelected(tab.id)}
            style={[styles.tab, selected === tab.id ? styles.active : null]}
          >
            <Icon
              name={tab.icon}
              size={16}
              color={selected === tab.id ? c.red : '#58697C'}
            />
            <Txt
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: selected === tab.id ? c.red : '#58697C',
              }}
            >
              {tab.label}
            </Txt>
          </Pressable>
        ))}
      </View>
      {selected === 'fasteners' ? (
        <FastenerOrdersAdmin />
      ) : (
        <RawMaterialAdmin
          key={selected}
          section={selected === 'settings' ? 'recipients' : 'orders'}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
    paddingBottom: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.paper,
  },
  active: { backgroundColor: c.pink, borderColor: '#EDC6CB' },
});
