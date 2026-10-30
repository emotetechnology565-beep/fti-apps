import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Field, Icon, Row, Txt, c } from '@shared/ui';

export function MarketMultiSelect({
  label,
  options,
  selected,
  onChange,
  disabled,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(selected);
  const [search, setSearch] = useState('');
  const visible = options.filter((option) =>
    option.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const summary = selected.length
    ? options
        .filter((option) => selected.includes(option.id))
        .map((option) => option.label)
        .join(', ')
    : `Choose ${label.toLowerCase()}`;
  return (
    <View style={styles.group}>
      <Txt style={styles.label}>{label}</Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${summary}`}
        accessibilityState={{ expanded: open, disabled }}
        aria-expanded={open}
        disabled={disabled}
        onPress={() => {
          setDraft(selected);
          setSearch('');
          setOpen(true);
        }}
        style={styles.trigger}
      >
        <Row>
          <Txt style={{ flex: 1 }} numberOfLines={2}>
            {summary}
          </Txt>
          <Icon name="chevron-down" size={20} />
        </Row>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <Card style={styles.menu}>
            <Txt style={styles.title}>Choose {label.toLowerCase()}</Txt>
            <Txt>Select multiple options. Scroll to see the full list.</Txt>
            <Field
              label={`Search ${label.toLowerCase()}`}
              value={search}
              onChangeText={setSearch}
            />
            <Row style={{ flexWrap: 'wrap' }}>
              <Button
                secondary
                onPress={() => setDraft(options.map((option) => option.id))}
              >
                Select all
              </Button>
              <Button secondary onPress={() => setDraft([])}>
                Clear selection
              </Button>
            </Row>
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator
              persistentScrollbar
              keyboardShouldPersistTaps="handled"
              accessibilityLabel={`Available ${label.toLowerCase()}`}
            >
              {visible.map((option) => {
                const checked = draft.includes(option.id);
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={option.label}
                    accessibilityState={{ checked }}
                    aria-checked={checked}
                    onPress={() =>
                      setDraft((previous) =>
                        checked
                          ? previous.filter((id) => id !== option.id)
                          : [...previous, option.id],
                      )
                    }
                    style={[styles.option, checked && styles.selected]}
                  >
                    <Icon
                      name={checked ? 'check-square' : 'square'}
                      size={20}
                      color={checked ? c.blue : c.muted}
                    />
                    <Txt style={{ flex: 1 }}>{option.label}</Txt>
                  </Pressable>
                );
              })}
              {!visible.length ? <Txt>No matches.</Txt> : null}
            </ScrollView>
            <Txt>{draft.length} selected</Txt>
            <Row style={{ flexWrap: 'wrap' }}>
              <Button
                onPress={() => {
                  setOpen(false);
                  onChange(draft);
                }}
              >
                Apply {label.toLowerCase()}
              </Button>
              <Button secondary onPress={() => setOpen(false)}>
                Cancel selection
              </Button>
            </Row>
          </Card>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontWeight: '700', fontSize: 13 },
  title: { fontSize: 20, fontWeight: '700' },
  trigger: {
    minHeight: 48,
    padding: 14,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    backgroundColor: c.paper,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#00000066',
  },
  menu: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    alignSelf: 'center',
    gap: 12,
  },
  list: { flexGrow: 0, maxHeight: 300 },
  option: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    minHeight: 48,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  selected: { backgroundColor: c.brandBlueLight },
});
