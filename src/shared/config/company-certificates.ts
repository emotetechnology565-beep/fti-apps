import certificateData from './company-certificates.json';

export type CompanyCertificate = {
  standard: string;
  scope: string;
  organization: string;
  certificate_number: string;
  accreditation: string;
  valid_until: string;
  issuer: string;
  verification_url: string;
  cdn_url: string;
  local_asset?: string;
  badge_cdn_url?: string;
  badge_svg_cdn_url?: string;
};

export const companyCertificate: CompanyCertificate = certificateData;
