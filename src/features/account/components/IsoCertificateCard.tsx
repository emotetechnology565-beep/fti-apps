import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Icon, Txt, c } from '@shared/ui';

export function IsoCertificateCard() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View ISO 9001:2015 Registration Certificate"
        onPress={() => setModalOpen(true)}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={styles.headerRow}>
          <View style={styles.badge}>
            <Icon name="award" size={13} color="#A70101" />
            <Txt style={styles.badgeText}>ISO 9001:2015 CERTIFIED</Txt>
          </View>
          <View style={styles.verifiedPill}>
            <View style={styles.greenDot} />
            <Txt style={styles.verifiedText}>Active · IAF / IAS</Txt>
          </View>
        </View>

        <View style={styles.body}>
          <Txt style={styles.title}>FIELDFAST TECH INTERNATIONAL</Txt>
          <Txt style={styles.subtitle}>
            Registered Works: St. No. 1, Industrial Area-C, Ludhiana 141014, India
          </Txt>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Txt style={styles.metaLabel}>CERTIFICATE NO.</Txt>
            <Txt style={styles.metaValue}>QACS/IND/250321</Txt>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaCol}>
            <Txt style={styles.metaLabel}>VALID THROUGH</Txt>
            <Txt style={styles.metaValue}>March 03, 2028</Txt>
          </View>
          <View style={styles.viewBtn}>
            <Txt style={styles.viewBtnText}>Details</Txt>
            <Icon name="chevron-right" size={14} color="#00409A" />
          </View>
        </View>
      </Pressable>

      {/* ISO Certificate Details Modal */}
      {modalOpen ? (
        <Modal
          visible={modalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setModalOpen(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setModalOpen(false)}
          >
            <Pressable
              style={styles.modalCard}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.iconCircle}>
                    <Icon name="award" size={20} color="#A70101" />
                  </View>
                  <View>
                    <Txt style={styles.modalHeading}>ISO 9001:2015</Txt>
                    <Txt style={styles.modalSubheading}>Certificate of Registration</Txt>
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={() => setModalOpen(false)}
                  style={{ padding: 6 }}
                >
                  <Icon name="x" size={20} color="#64748B" />
                </Pressable>
              </View>

              <ScrollView
                style={{ maxHeight: 380 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 14 }}
              >
                <View style={styles.certHero}>
                  <Txt style={styles.certOrg}>FIELDFAST TECH INTERNATIONAL</Txt>
                  <Txt style={styles.certAddress}>
                    St.No.1, New Ram Nagar, Industrial Area-C, Sua Road, Ludhiana 141014, Punjab, India
                  </Txt>
                </View>

                <View style={styles.certGrid}>
                  <View style={styles.gridItem}>
                    <Txt style={styles.gridLabel}>STANDARD</Txt>
                    <Txt style={styles.gridValue}>ISO 9001:2015 (QMS)</Txt>
                  </View>
                  <View style={styles.gridItem}>
                    <Txt style={styles.gridLabel}>CERTIFICATE NUMBER</Txt>
                    <Txt style={styles.gridValue}>QACS/IND/250321</Txt>
                  </View>
                  <View style={styles.gridItem}>
                    <Txt style={styles.gridLabel}>ACCREDITATION BODY</Txt>
                    <Txt style={styles.gridValue}>IAS (MSCB-196) & IAF MLA</Txt>
                  </View>
                  <View style={styles.gridItem}>
                    <Txt style={styles.gridLabel}>REGISTRATION PERIOD</Txt>
                    <Txt style={styles.gridValue}>21/Dec/2025 – 03/Mar/2028</Txt>
                  </View>
                  <View style={styles.gridItemFull}>
                    <Txt style={styles.gridLabel}>ISSUING REGISTRAR</Txt>
                    <Txt style={styles.gridValue}>
                      QACS International — Certification & Assessment Services (London / India)
                    </Txt>
                  </View>
                  <View style={styles.gridItemFull}>
                    <Txt style={styles.gridLabel}>ONLINE VERIFICATION</Txt>
                    <Txt style={styles.gridValueLink}>www.qacscert.com</Txt>
                  </View>
                </View>

                <View style={styles.trustNote}>
                  <Icon name="shield" size={16} color="#00409A" />
                  <Txt style={styles.trustNoteText}>
                    All industrial raw materials, fastener lots and tractor spares procured through FTI adhere to certified quality management benchmarks.
                  </Txt>
                </View>
              </ScrollView>

              <Button
                style={styles.closeBtn}
                onPress={() => setModalOpen(false)}
              >
                Done
              </Button>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.cardBorder,
    padding: 16,
    gap: 12,
    boxShadow: '0 2px 8px rgba(16, 24, 40, 0.04)',
  },
  cardPressed: {
    backgroundColor: '#F8FAFC',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#A70101',
    letterSpacing: 0.5,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  body: {
    gap: 3,
  },
  title: {
    fontSize: 15.5,
    lineHeight: 21,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metaCol: {
    flex: 1,
    minWidth: 90,
    gap: 2,
  },
  metaLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00409A',
  },
  metaDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 10,
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 8,
  },
  viewBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#00409A',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    gap: 14,
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeading: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubheading: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  certHero: {
    backgroundColor: '#0B1B36',
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  certOrg: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  certAddress: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
  },
  certGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 2,
  },
  gridItemFull: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 2,
  },
  gridLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  gridValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  gridValueLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00409A',
  },
  trustNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#EEF4FC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  trustNoteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#00409A',
  },
  closeBtn: {
    backgroundColor: '#00409A',
    borderRadius: 8,
    minHeight: 44,
  },
});

