import 'server-only';
import { admin } from '@/lib/supabase/admin';

export type Settings = {
  company_name: string; brand_name: string; gstin: string | null; pan: string | null; state_code: string;
  address: string | null; support_email: string | null; gst_rate: number; tds_rate: number;
  prices_include_gst: boolean; default_commission_pct: number; invoice_prefix: string; dunning_grace_days: number;
};

export async function getSettings(): Promise<Settings> {
  const { data } = await admin().from('platform_settings').select('*').single();
  return { ...data, gst_rate: Number(data.gst_rate), tds_rate: Number(data.tds_rate), default_commission_pct: Number(data.default_commission_pct) };
}

/** What the buyer pays for a list price, honouring the "prices include GST" setting. */
export function grossUp(listPaise: number, s: Settings) {
  return s.prices_include_gst ? listPaise : Math.round(listPaise * (1 + s.gst_rate / 100));
}

/** Split a captured amount into GST, platform commission, TDS (Sec 194-O) and the creator's net. */
export function splitAmount(amountPaise: number, s: Settings, commissionPct: number | null) {
  const taxable = Math.round((amountPaise * 100) / (100 + s.gst_rate));
  const gst = amountPaise - taxable;
  const fee = Math.round((taxable * (commissionPct ?? s.default_commission_pct)) / 100);
  const tds = Math.round((taxable * s.tds_rate) / 100);
  return { taxable, gst, fee, tds, net: Math.max(0, taxable - fee - tds) };
}

/** CGST+SGST when the buyer is in the platform's state (or unknown), IGST otherwise. */
export function gstBreakup(gst: number, buyerState: string | null | undefined, s: Settings) {
  if (!buyerState || buyerState === s.state_code) {
    const half = Math.floor(gst / 2);
    return { cgst: half, sgst: gst - half, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: gst };
}

export { GST_STATES } from '@/lib/states';
