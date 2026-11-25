// Starter legal templates. Replace [bracketed] details and have them reviewed by your lawyer before launch.
export const LEGAL: Record<string, { title: string; body: string }> = {
  terms: {
    title: 'Terms of Service',
    body: `**Last updated: [date]**

These Terms govern your use of [Brand] ("we", "us"), operated by [Company Name] Private Limited, CIN [CIN], registered office [address].

## 1. Accounts
You must be 18 or older, or use the service with a parent or guardian's consent. Keep your login secure; you're responsible for activity on your account.

## 2. Memberships and purchases
- Memberships renew automatically each billing period until cancelled. You authorise us to charge your UPI Autopay mandate or card on each renewal date.
- You can cancel anytime from **Account → Billing**. Access continues until the end of the paid period.
- Prices are in INR and include GST unless stated otherwise. A GST invoice is issued for every payment.
- Free trials convert to paid memberships unless cancelled before the trial ends.

## 3. Content and licence
Creators own their content. Your purchase gives you a personal, non-transferable, non-commercial licence to view it. You must not copy, record, redistribute, resell or share downloads, videos or login access. Content may carry identifying watermarks; we may suspend accounts that leak content.

## 4. Community rules
Be respectful. No harassment, hate speech, spam, illegal content or sharing others' personal data. Moderators may remove content and mute or ban members.

## 5. Live sessions
Live sessions run on Zoom inside the platform and may be recorded and made available to members as replays. By joining you consent to this.

## 6. Liability
The service is provided "as is". To the extent permitted by law, our total liability is limited to the amount you paid us in the 3 months before the claim.

## 7. Governing law
These Terms are governed by the laws of India. Courts at [city] have exclusive jurisdiction.

## 8. Contact
[support email] · Grievance officer: see /legal/grievance`,
  },
  privacy: {
    title: 'Privacy Policy',
    body: `**Last updated: [date]**

[Company Name] Private Limited is the Data Fiduciary for personal data processed on [Brand], under the Digital Personal Data Protection Act, 2023 ("DPDP Act").

## What we collect
- **Account:** name, email, mobile number, profile photo.
- **Billing:** state (for GST), invoices, payment status. Card/UPI details are handled by Razorpay; we never store them.
- **Usage:** courses progress, posts, comments, messages, watch time, live session attendance.
- **Technical:** essential cookies to keep you signed in, referral and A/B test identifiers.

## Why we use it
To provide memberships and content, process payments and issue GST invoices, send service messages (receipts, reminders), prevent content piracy and abuse, and — only with your consent — send marketing emails and WhatsApp updates.

## Sharing
With the creator whose membership you join (name, email, activity in their community), and processors acting for us: Supabase (database and hosting of data), Razorpay (payments), Mux (video), Zoom (live sessions), Resend (email), Meta WhatsApp Business (messages), Vercel (hosting). Some processors may store data outside India in accordance with the DPDP Act.

## Your rights
Access and download your data, correct it, withdraw consent, request erasure, and nominate someone to exercise your rights. Use **Account → Privacy & data** or write to our grievance officer. We respond within 30 days. You may also approach the Data Protection Board of India.

## Retention
We keep account data while your account is active. On deletion, we erase personal data within 30 days, except invoices and payment records we must keep for 8 years under tax law.

## Children
If you are under 18, you need verifiable consent from a parent or guardian to use the service.

## Contact
Grievance officer: [name], [email], [address].`,
  },
  refunds: {
    title: 'Cancellation & Refund Policy',
    body: `**Last updated: [date]**

- **Memberships:** cancel anytime; you keep access until the end of the current billing period. Renewals already charged are not refunded, except where required by law or at our discretion.
- **Courses and digital products:** because they are delivered instantly, purchases are non-refundable once accessed or downloaded. If you can't access something you bought, contact us within 7 days for a full refund.
- **1:1 sessions:** reschedule or cancel at least 24 hours before for a full refund. No-shows are not refunded.
- **Ticketed live events:** refundable up to 24 hours before the event.
- **Merchandise:** returns accepted within 7 days of delivery for damaged or incorrect items.
- **Gift cards:** non-refundable once delivered.

Approved refunds go back to the original payment method within 5–7 working days via Razorpay. Contact [support email].`,
  },
  'creator-agreement': {
    title: 'Creator Agreement',
    body: `**Last updated: [date]**

This agreement is between [Company Name] Private Limited ("Platform") and the creator ("Creator").

1. **Managed service.** The Platform sets up and operates the Creator's membership, content, community and payments. The Creator can view all activity and earnings in their dashboard.
2. **Commission.** The Platform retains the agreed commission ([x]%) on the taxable value of each sale. GST is collected and remitted by the Platform.
3. **TDS.** The Platform deducts TDS under Section 194-O of the Income-tax Act at the applicable rate and issues Form 16A.
4. **Payouts.** Net earnings are paid to the Creator's verified bank account [monthly/fortnightly], after refunds and chargebacks.
5. **Content ownership.** The Creator owns their content and grants the Platform a licence to host, stream and promote it for the term of this agreement.
6. **Creator obligations.** Content must be original or licensed, lawful, and accurate. The Creator handles their own income tax.
7. **Term.** Either party may end this agreement with 30 days' notice. Existing members keep access until their paid period ends.
8. **Governing law.** India; courts at [city].`,
  },
  grievance: {
    title: 'Grievance Officer',
    body: `In accordance with the Information Technology Act, 2000, the IT Rules 2021 and the DPDP Act, 2023:

**Grievance officer:** [Name]
**Email:** [email]
**Address:** [Company Name] Private Limited, [address]
**Hours:** Monday–Friday, 10am–6pm IST

We acknowledge complaints within 24 hours and resolve them within 15 days.`,
  },
};
