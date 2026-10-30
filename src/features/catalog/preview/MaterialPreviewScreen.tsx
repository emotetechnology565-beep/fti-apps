import { useEffect, useReducer, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Txt } from '@shared/ui';
import { MaterialMobileHeader } from '@shared/ui/MaterialMobileHeader';
import { MaterialPreviewContent } from './MaterialPreviewContent';
import { Action, Check, Info, Input, Panel, Table, previewStyles as s } from './MaterialPreviewUI';
import { initialPreviewState, materialGroups, materialScreens, previewReducer } from './material-preview-model';
import { downloadPreviewDocument } from './download-preview-document';

const storageKey = 'fti-material-client-preview-v1';
const journeys = [
  { title: 'Standard material order', screens: [1, 4, 7, 15, 17, 18, 19, 20, 21, 24, 22, 23, 61, 24] },
  { title: 'Bulk RFQ → quotation → order', screens: [25, 26, 27, 29, 30, 31, 32, 33, 34, 19, 21] },
  { title: 'Cutting & drawing approval', screens: [36, 37, 38, 39, 40, 41, 60, 32, 34] },
  { title: 'Partial dispatch & actual weight', screens: [42, 43, 62, 44, 45, 63, 50, 46] },
  { title: 'Repeat procurement', screens: [42, 43, 47, 7, 15, 17, 19, 21] },
];
const approvalItems = ['Branding & theme', 'Navigation & material selection', 'Specifications & weight basis', 'Subscription price access', 'Quotation & revision flow', 'Cutting & drawing approval', 'Manual bank verification', 'Dispatch & reconciliation', 'Documents & support'];

export function MaterialPreviewScreen() {
  const params = useLocalSearchParams<{ screen?: string; view?: string }>();
  const parsed = Number(params.screen ?? 1);
  const screen = Number.isInteger(parsed) && parsed >= 1 && parsed <= 65 ? parsed : 1;
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const [state, dispatch] = useReducer(previewReducer, undefined, initialPreviewState);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [gallery, setGallery] = useState(false);
  const [review, setReview] = useState(params.view === 'review');
  const [notes, setNotes] = useState('');
  const scroll = useRef<ScrollView>(null);
  const storageQueue = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(storageKey).then(value => {
      if (!active || !value) return;
      const saved = JSON.parse(value);
      if (saved && Array.isArray(saved.basket) && Array.isArray(saved.requirements) && Array.isArray(saved.approvals)) dispatch({ type: 'patch', value: saved });
    }).catch(() => { if (active) setStorageError('The saved preview could not be restored. Reset demo data if necessary.'); }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    // Serial writes ensure a rapid series of edits cannot restore an older state.
    storageQueue.current = storageQueue.current.catch(() => undefined).then(() => AsyncStorage.setItem(storageKey, JSON.stringify(state))).catch(() => setStorageError('Preview changes could not be saved on this device.'));
  }, [state, ready]);
  const go = (value: number) => {
    setGallery(false); setReview(false);
    router.replace({ pathname: '/materials-preview', params: { screen: String(value) } });
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const galleryContent = <View style={{ gap: 18 }}>
    <Txt style={s.h2}>65 screens · client review</Txt>
    {materialGroups.map(group => <View key={group.first} style={{ gap: 4 }}><Txt style={[s.h2, { fontSize: 14, paddingVertical: 8 }]}>{group.name}</Txt>{materialScreens.slice(group.first - 1, group.last).map((title, index) => {
      const number = group.first + index;
      return <Pressable key={number} accessibilityRole="button" accessibilityLabel={`Open screen ${number}: ${title}`} onPress={() => go(number)} style={{ paddingVertical: 11, paddingHorizontal: 10, borderRadius: 4, backgroundColor: number === screen ? '#E7F0FB' : '#FFFFFF' }}><Txt style={{ color: number === screen ? '#C31925' : '#25445E', fontSize: 12 }}>{String(number).padStart(2, '0')}. {title}</Txt></Pressable>;
    })}</View>)}
  </View>;
  const toggleApproval = (label: string) => dispatch({ type: 'patch', value: { approvals: state.approvals.includes(label) ? state.approvals.filter(item => item !== label) : [...state.approvals, label] } });
  if (!ready) return <View style={{ padding: 24 }}><Txt>Loading raw material preview…</Txt></View>;
  return <SafeAreaView style={s.page}>
    {desktop ? <View style={{ padding: 10, flexDirection: 'row', gap: 10 }}><Action secondary onPress={() => setGallery(true)}>All screens</Action><Action secondary onPress={() => setReview(!review)}>Client review</Action></View> : null}
    <MaterialMobileHeader count={state.basket.length} onMenu={() => setGallery(true)} onSearch={() => go(3)} onCart={() => go(17)} onSupport={() => go(51)} />
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {desktop ? <ScrollView style={{ width: 265, flexGrow: 0, backgroundColor: '#FFFFFF', borderRightWidth: 1, borderColor: '#DFE7F0' }} contentContainerStyle={{ padding: 16 }}>{galleryContent}</ScrollView> : null}
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: 12, paddingTop: 11, paddingBottom: 4, backgroundColor: '#FFFFFF' }}><Txt testID="material-preview-title" accessibilityRole="header" style={s.title}>{review ? 'Client approval presentation' : materialScreens[screen - 1]}</Txt></View>
        <View style={{ width: '100%', maxWidth: 1000, alignSelf: 'center', padding: desktop ? 24 : 12, paddingTop: 4, gap: 10 }}>
          {storageError ? <Info warning>{storageError}</Info> : null}
          {review ? <>
            <Panel title="Design & flow approval"><Txt style={s.text}>Navy headers, white surfaces, red actions, material photographs, dimension figures and specification tables follow the supplied raw material boards. Manual bank verification replaces their online payment example. Subscription access remains required for catalogue prices.</Txt><Table rows={[
              ['Reference scope', '7 supplied image boards, screens 11–52'], ['Added screens', 'Discovery 1–10 and staff 53–65'], ['Platform layouts', 'Mobile customer and responsive desktop'], ['Data', 'Isolated local demo; no production writes'],
            ]} /></Panel>
            {journeys.map(journey => <Panel key={journey.title} title={journey.title}><Txt style={s.muted}>{journey.screens.map(number => `${number}. ${materialScreens[number - 1]}`).join(' → ')}</Txt><View style={s.row}>{journey.screens.map((number, index) => <Action key={`${number}-${index}`} secondary onPress={() => go(number)}>{number}. {materialScreens[number - 1]}</Action>)}</View></Panel>)}
            <Panel title="Reusable UI components"><Info>Informational notice</Info><Info warning>Validation / pending supplier confirmation</Info><Action onPress={() => go(7)}>Primary action</Action><Action secondary onPress={() => go(13)}>Secondary action</Action><Table rows={[
              ['Specification label', 'Selected value'], ['Quantity', '20 pieces'], ['Availability', 'Confirmation required'],
            ]} /><Txt style={s.muted}>Loading: pending data · Empty: no selections · Validation: incomplete details · Success: saved locally.</Txt></Panel>
            <Panel title="Approval checklist · local review only">{approvalItems.map(label => <Check key={label} checked={state.approvals.includes(label)} onPress={() => toggleApproval(label)}>{label}</Check>)}<Input label="Client review notes" value={notes} onChange={setNotes} /><Action onPress={() => void downloadPreviewDocument('Client review checklist', `${approvalItems.map(label => `${state.approvals.includes(label) ? '[x]' : '[ ]'} ${label}`).join('\n')}\n\nNotes: ${notes}`).catch(() => setStorageError('Review document could not be exported.'))}>Export review checklist</Action><Info>Checklist selections record local design feedback only. They do not approve an actual purchase, payment or manufacturing drawing.</Info></Panel>
          </> : <MaterialPreviewContent key={screen} screen={screen} state={state} dispatch={dispatch} go={go} />}
          {!review && desktop ? <View style={[s.row, { justifyContent: 'space-between' }]}><Action secondary disabled={screen === 1} onPress={() => go(screen - 1)}>← Previous screen</Action><Action secondary disabled={screen === 65} onPress={() => go(screen + 1)}>Next screen →</Action></View> : null}
        </View>
      </ScrollView>
    </View>
    <View style={{ flexDirection: 'row', backgroundColor: '#123B60', paddingVertical: 5 }}>
      {([{ title: 'Home', icon: 'home', target: 1 }, { title: 'Materials', icon: 'layers', target: 2 }, { title: 'Requirements', icon: 'file-text', target: 25 }, { title: 'Orders', icon: 'truck', target: 42 }, { title: 'Account', icon: 'user', target: 49 }] as const).map(item => <Pressable key={item.title} accessibilityRole="button" accessibilityLabel={`Preview ${item.title}`} onPress={() => go(item.target)} style={{ flex: 1, minHeight: 53, gap: 4, alignItems: 'center', justifyContent: 'center' }}><Icon name={item.icon} size={21} color={screen === item.target ? '#FF555D' : '#FFFFFF'} /><Txt style={{ color: screen === item.target ? '#FF7278' : '#FFFFFF', fontSize: 10 }}>{item.title}</Txt></Pressable>)}
    </View>
    <Txt style={{ fontSize: 9, color: '#475B70', textAlign: 'center', padding: 5 }}>CLIENT CONCEPT · SAMPLE RATES, STOCK, DATES AND DOCUMENTS · CERTIFICATES NOT VERIFIED</Txt>
    <Modal visible={gallery} animationType="slide" onRequestClose={() => setGallery(false)}><SafeAreaView style={s.page}><View style={s.navy}><Action secondary onPress={() => setGallery(false)}>Close screen gallery</Action><Action secondary onPress={() => { setReview(true); setGallery(false); }}>Client approval presentation</Action><Action secondary onPress={() => { dispatch({ type: 'reset' }); setStorageError(''); go(1); }}>Reset demo data</Action><Txt style={{ color: '#FFFFFF', fontSize: 11 }}>CLIENT PREVIEW ? SAMPLE DATA ? {state.access.toUpperCase()}</Txt></View><ScrollView contentContainerStyle={{ padding: 18 }}>{galleryContent}</ScrollView></SafeAreaView></Modal>
  </SafeAreaView>;
}
