# Tax and statutory reporting

## Scope

The Accounting module provides effective-dated tax codes, immutable tax evidence, controlled tax periods, and a working VAT return. It is jurisdiction-configurable and does not make the platform Ghana-only.

For organizations whose country is Ghana, the system provisions these effective-dated 2026 codes when the Tax and VAT screen is first opened:

- Standard: VAT 15%, NHIL 2.5%, GETFund Levy 2.5%.
- Zero-rated: all three components at 0%.
- Exempt: all three components at 0%, with a distinct treatment for reporting.

These defaults follow the Ghana Revenue Authority's published 2026 reform guidance under the Value Added Tax Act, 2025 (Act 1151), effective 1 January 2026. The old flat-rate scheme is not provisioned because GRA states it was abolished. Current primary sources:

- https://gra.gov.gh/domestic-tax/tax-types/vat/
- https://gra.gov.gh/news/portfolio/notice-to-all-vat-registered-taxpayers/
- https://gra.gov.gh/e-services/e-vat/

Tax codes are effective dated. Transactions retain the selected code and calculated component amounts, so a future rate change does not rewrite prior evidence. Custom jurisdictions and rates can be added by authorized Accounting settings managers.

## Output tax

Accounting customer invoices accept a taxable amount and optional tax code. The gross receivable is taxable value plus VAT, NHIL, and GETFund. Sending the invoice posts:

- Debit Accounts Receivable for the gross invoice.
- Credit Revenue for the taxable value.
- Credit VAT Payable, NHIL Payable, and GETFund Levy Payable separately.

The same transaction writes immutable output-tax evidence. Voiding an unpaid sent invoice creates a negative adjustment and a compensating journal. It never deletes the original evidence.

## Input tax from Procurement

Supplier invoices can select an Accounting tax code. When Accounting is also active, approval posts:

- Debit Inventory Asset for the taxable value.
- Debit separate recoverable input VAT, NHIL, and GETFund accounts.
- Credit Accounts Payable for the gross supplier invoice.

The same Accounting transaction writes immutable input-tax evidence. Procurement remains usable when Accounting is not subscribed; tax-ledger posting is an activated-module integration.

## Tax periods and working return

Authorized users create tax periods with an explicit filing due date. For Ghana, GRA currently states that VAT and levies returns and related payment are due by the last working day of the following month. The system does not guess Ghana public holidays, so the operator must enter and verify the due date.

The working return summarizes output and input VAT, NHIL, and GETFund and calculates the net working liability. A period moves through:

- Open: transactions may continue to enter the period.
- Locked: reviewed and ready for external filing.
- Filed: requires the GRA acknowledgement or filing reference.

Filed is an internal evidence state. Rock Frost does not currently submit the prescribed return to GRA or issue a GRA-authorized E-VAT invoice. Users must reconcile source documents, confirm exemptions and retail-scheme approval, and file through GRA's prescribed process. This feature is operational support, not tax or legal advice.

## Current limitations and next integrations

This release captures tax from Accounting invoices and Procurement supplier invoices. POS, Hotel, Hospital, Pharmacy, School, Fleet, Installment, Hostel, and other activated revenue modules still post their existing gross revenue entries and do not yet create component-level tax evidence. They must be integrated individually because exemptions, zero-rating, retail schemes, and invoice requirements differ by supply type. No component should apply a generic 20% rate without an explicit effective tax code.

E-VAT/Fiscal Electronic Device integration, prescribed-return electronic submission, withholding VAT certificates, import VAT, partial-exemption calculations, tax refunds, and jurisdiction-specific corporate/payroll filings remain separate releases and require provider specifications or professional tax review.
