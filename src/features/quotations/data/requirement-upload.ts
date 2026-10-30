import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const salesAttachmentTypes = ['application/pdf', 'image/jpeg', 'image/png'];
export type RequirementUpload = { name: string; mimeType: string; size: number; base64: string; owner: string | null; selectedAt: number };
const storageKey = 'fti-requirement-upload-v1';

export async function pickSalesAttachment(owner: string | null): Promise<RequirementUpload | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: salesAttachmentTypes, copyToCacheDirectory: true, base64: true });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  if (!asset?.mimeType || !salesAttachmentTypes.includes(asset.mimeType) || !asset.size || asset.size > 3 * 1024 * 1024) throw new Error('Choose a PDF, JPEG or PNG requirement list up to 3 MB.');
  const encoded = Platform.OS === 'web' ? asset.base64 ?? await asset.file?.arrayBuffer().then(buffer => {
    const bytes = new Uint8Array(buffer); let raw = ''; bytes.forEach(byte => { raw += String.fromCharCode(byte); }); return btoa(raw);
  }) : await new File(asset.uri).base64();
  const base64 = encoded?.replace(/^data:[^,]*;base64,/i, '');
  if (!base64) throw new Error('Could not read this file. Please choose it again.');
  return { name: asset.name, mimeType: asset.mimeType, size: asset.size, base64, owner, selectedAt: Date.now() };
}
export async function stageRequirementUpload(file: RequirementUpload) {
  await AsyncStorage.setItem(storageKey, JSON.stringify(file));
}
export async function pendingRequirementUpload(owner: string | null): Promise<RequirementUpload | null> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return null;
  const file = JSON.parse(raw) as RequirementUpload;
  if (Date.now() - file.selectedAt > 30 * 60 * 1000) { await AsyncStorage.removeItem(storageKey); return null; }
  if (file.owner && file.owner !== owner) return null;
  if (!salesAttachmentTypes.includes(file.mimeType) || !file.size || file.size > 3 * 1024 * 1024 || !file.base64) throw new Error('The saved requirement file is invalid. Select the file again.');
  if (owner && !file.owner) { file.owner = owner; await stageRequirementUpload(file); }
  return file;
}
export const clearRequirementUpload = () => AsyncStorage.removeItem(storageKey);
