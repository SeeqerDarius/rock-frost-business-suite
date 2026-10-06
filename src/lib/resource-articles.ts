export type ResourceSection = {
  heading: string;
  body?: readonly string[];
  list?: readonly string[];
};

export type ResourceArticle = {
  slug: string;
  title: string;
  /** Meta description: keep under 160 characters. */
  description: string;
  eyebrow: string;
  dek: string;
  /** A module key from MODULE_SEO to link the closing call to action to. */
  relatedModuleKey?: string;
  /** A path to link to instead, for articles not tied to one module. */
  relatedPath?: string;
  relatedLabel: string;
  sections: readonly ResourceSection[];
  faqs?: readonly { question: string; answer: string }[];
};

export const RESOURCE_ARTICLES: readonly ResourceArticle[] = [
  {
    slug: "accounting-software-ghana-guide",
    title: "Choosing Accounting Software for a Ghanaian Business",
    description: "What to look for in accounting software in Ghana: VAT, NHIL and GETFund codes, withholding tax, bank reconciliation, and revenue from your operations.",
    eyebrow: "Finance",
    dek: "The features that matter for Ghanaian books, and why your accounting system should hear about sales without anyone retyping them.",
    relatedModuleKey: "accounting",
    relatedLabel: "Explore Accounting",
    sections: [
      {
        heading: "Generic bookkeeping is only half the job",
        body: [
          "Most accounting packages handle a chart of accounts, invoices and reports well. The harder part for a Ghanaian business is everything around the ledger: applying VAT, NHIL and GETFund correctly, deducting withholding tax on the right supplies, and getting revenue from the till, the school fees office or the hotel front desk into the books without someone keying it in a second time.",
        ],
      },
      {
        heading: "What to check before choosing accounting software",
        list: [
          "Tax codes that carry VAT, NHIL and GETFund rates separately, with effective dates so a rate change does not rewrite past entries.",
          "Support for standard-rated, zero-rated and exempt supplies, and withholding tax that varies by goods, services or rent.",
          "Books kept in Ghana cedis (GH₵) by default, with a chart of accounts that suits a Ghanaian SME.",
          "Bank reconciliation that can import a statement file instead of ticking lines by hand.",
          "Journal approval and period locking, so posted history cannot quietly change after the books are closed.",
          "A direct connection to the systems that earn revenue, rather than a monthly export and re-entry.",
        ],
      },
      {
        heading: "Standalone ledger or connected modules",
        body: [
          "A standalone accounting package suits a business whose only system is its ledger. Once sales, fees, stock or payroll run in other software, the ledger becomes the place where numbers are retyped and reconciled by hand. A connected platform removes that step: each operational module posts its confirmed activity into Accounting as it happens.",
        ],
      },
      {
        heading: "How Rock Frost Accounting handles this",
        body: [
          "Rock Frost Accounting includes a one-click Ghana SME chart of accounts, effective-dated tax codes with VAT, NHIL, GETFund and withholding tax, multi-line invoices, supplier bills, credit notes, CSV bank statement reconciliation, recurring entries, journal approval, period locking, budgets, and the trial balance, general ledger, ageing and cash-flow reports. It works on its own, and when you add modules such as Point of Sale, School, Hotel, Pharmacy or Inventory and Procurement, their confirmed revenue and payables post into Accounting automatically.",
        ],
      },
    ],
    faqs: [
      { question: "Can I subscribe to Accounting without other modules?", answer: "Yes. Accounting is its own module. Other modules are optional and connect to it automatically when added." },
      { question: "Does it handle Ghana VAT?", answer: "Yes. Tax codes carry VAT, NHIL and GETFund rates with effective dates, and cover standard-rated, zero-rated and exempt supplies." },
    ],
  },
  {
    slug: "hotel-management-software-ghana",
    title: "Best Hotel Management Software for Ghanaian Hotels",
    description: "What to look for in hotel management software in Ghana, from real-time room availability to folio and housekeeping controls.",
    eyebrow: "Hospitality",
    dek: "What to check before choosing hotel software in Ghana, and how the day-to-day workflow should actually behave.",
    relatedModuleKey: "hotel",
    relatedLabel: "Explore Hotel Management",
    sections: [
      {
        heading: "Why a spreadsheet stops working",
        body: [
          "Once a property has more than a handful of rooms, tracking reservations, folios and housekeeping across separate spreadsheets or a front-desk notebook starts to break down. Double bookings happen when two staff members work from different copies of the same calendar. Guest folios drift out of balance when a payment or a restaurant charge gets recorded in one place but not another.",
        ],
      },
      {
        heading: "What to check before choosing hotel software",
        list: [
          "Real-time room availability, so a room with an overlapping booking cannot be reserved twice.",
          "Folios that block checkout while a balance remains, unless staff explicitly override it.",
          "Housekeeping status that front desk and cleaning staff see from the same system, not two separate lists.",
          "Restaurant or bar charges that reach the correct guest folio automatically.",
          "Reporting in Ghana cedis (GH₵) that matches how your finance team already works.",
        ],
      },
      {
        heading: "How Rock Frost Hotel Management handles this",
        body: [
          "Rock Frost's Hotel module keeps rooms, guests, reservations, folios, housekeeping and restaurant operations in one connected workspace: a room with an overlapping booking cannot be reserved twice, checkout is blocked while a folio balance remains unless a property explicitly allows it, and settled folios post directly into Accounting as Hotel Revenue, so front-desk activity reaches the ledger without manual re-entry.",
        ],
      },
    ],
    faqs: [
      { question: "Can one system handle multiple hotel properties?", answer: "Yes. Each property's rooms, reservations and folios stay organized separately, while management can still see activity across the group." },
      { question: "Does hotel revenue need to be re-entered into accounting?", answer: "No. Settled folios post into Accounting as Hotel Revenue automatically." },
    ],
  },
  {
    slug: "inventory-control-guide-ghana",
    title: "Inventory Control Guide for Ghanaian Retailers",
    description: "A practical guide to stock control for Ghanaian retailers and distributors: reorder points, warehouse transfers, and purchase approvals.",
    eyebrow: "Retail and distribution",
    dek: "A practical look at the stock controls that keep a growing retailer or distributor from running out, or overordering.",
    relatedModuleKey: "inventory",
    relatedLabel: "Explore Inventory and Procurement",
    sections: [
      {
        heading: "The two failure modes of inventory",
        body: [
          "Most stock problems fall into one of two categories: running out of a fast-moving item because nobody noticed it was low, or tying up cash in slow-moving stock that was reordered out of habit rather than need. Both are visibility problems, not purchasing problems.",
        ],
      },
      {
        heading: "Controls worth putting in place",
        list: [
          "A reorder point per item, so low stock is visible before it becomes a lost sale.",
          "One live total across every warehouse, so a transfer between locations does not create a blind spot.",
          "An approval step between a purchase request and an actual order, so spending stays controlled.",
          "Stock movements tied to the business activity that caused them, not entered separately after the fact.",
        ],
      },
      {
        heading: "How Rock Frost Inventory and Procurement handles this",
        body: [
          "On-hand quantity is totalled live across every warehouse and compared against each item's reorder point automatically. Purchase requests move through an approval workflow before becoming purchase orders, and transfers that exceed available stock, or that are sent to the same warehouse, are rejected automatically. Inventory also reads tax codes directly from Accounting, so purchases and stock movements use the same tax treatment as the rest of your books.",
        ],
      },
    ],
    faqs: [
      { question: "Can Rock Frost manage more than one warehouse?", answer: "Yes. Stock is tracked per warehouse, with transfers between locations and one live total across all of them." },
      { question: "Do purchases require approval before they are placed?", answer: "Yes. Purchase requests go through an approval workflow before becoming purchase orders." },
    ],
  },
  {
    slug: "fleet-drivers-fuel-maintenance-tracking",
    title: "How Transport Companies Track Drivers, Fuel and Maintenance",
    description: "How Ghanaian transport operators track vehicles, drivers, work-and-pay contracts and maintenance approvals in one system.",
    eyebrow: "Transport and logistics",
    dek: "What changes when vehicle, driver and maintenance records move out of a paper logbook and into one connected system.",
    relatedModuleKey: "fleet",
    relatedLabel: "Explore Fleet Management",
    sections: [
      {
        heading: "Where paper logbooks break down",
        body: [
          "A logbook can record that a repair happened, but it rarely shows who approved it, whether the owner was consulted, or how much was actually paid against a driver's or owner's running balance. As a fleet grows past a handful of vehicles, that gap turns into disputes over money and maintenance that nobody signed off on.",
        ],
      },
      {
        heading: "What to track for each vehicle",
        list: [
          "Vehicle, driver and owner records in one place, so responsibility is never ambiguous.",
          "Insurance and roadworthy dates that stay visible so renewals do not get missed.",
          "A maintenance approval chain: a fault report reviewed by a manager before an owner signs off and a mechanic is assigned.",
          "Work-and-pay or hire-purchase balances that update automatically as payments are recorded.",
        ],
      },
      {
        heading: "How Rock Frost Fleet Management handles this",
        body: [
          "A fault report needs manager review before owner approval, and a mechanic cannot be assigned until both are approved. Work-and-pay contracts track weekly amounts and payments against a target, with the completion percentage updating automatically as payments come in. Fleet revenue and payments post directly into Accounting as Fleet Revenue, so vehicle income reaches the ledger without manual re-entry.",
        ],
      },
    ],
    faqs: [
      { question: "Can Rock Frost handle work-and-pay or hire-purchase vehicle contracts?", answer: "Yes. Weekly amounts, payments received and completion percentage are tracked automatically for every contract." },
      { question: "Does maintenance require approval before work starts?", answer: "Yes. A fault report needs manager review, then owner approval, before a mechanic can be assigned." },
    ],
  },
  {
    slug: "school-management-implementation-checklist",
    title: "School Management System Implementation Checklist",
    description: "A step-by-step checklist for rolling out a school management system in a Ghanaian basic or senior high school.",
    eyebrow: "Education",
    dek: "A step-by-step checklist for schools moving admissions, fees, attendance and results into one system.",
    relatedModuleKey: "school",
    relatedLabel: "Explore School Management",
    sections: [
      {
        heading: "Before you switch on the system",
        list: [
          "Confirm the current academic year, terms, campuses and classes so the calendar in the system matches reality from day one.",
          "Decide who admits students and links guardians, and who is allowed to publish examination results.",
          "Agree the fee structure per class or programme before the first invoice run, so nothing is billed twice or missed.",
          "List which staff need library, transport or hostel access, separately from academic and fee access.",
        ],
      },
      {
        heading: "During rollout",
        list: [
          "Migrate active students and guardians first; historical records can follow once daily operations are stable.",
          "Run one full attendance and fee cycle in parallel with your existing process before retiring it.",
          "Train front-office and academic staff separately, since they use different parts of the system day to day.",
        ],
      },
      {
        heading: "How Rock Frost School Management supports this",
        body: [
          "Admitting a student and linking their guardian happens on one form, with no separate record to keep in sync. Fee structures, invoices, payments and receipts are tracked per term, and examination results stay hidden from families until a staff member explicitly publishes them. Fee collections post directly into Accounting as School Revenue, and schools with boarding facilities can add the Hostel module for buildings, beds and student allocations against the same student records.",
        ],
      },
    ],
    faqs: [
      { question: "Can guardians be linked to students during admission?", answer: "Yes. One form creates the student and links their guardian, with no separate record required first." },
      { question: "Are exam results visible to families immediately?", answer: "No. Results stay hidden from families until a staff member publishes them." },
    ],
  },
  {
    slug: "business-management-software-cost-ghana",
    title: "How Much Does Business Management Software Cost in Ghana?",
    description: "What determines the cost of business management software in Ghana, and how modular, pay-for-what-you-use pricing compares to one large system.",
    eyebrow: "Buying guide",
    dek: "What actually drives the cost of business software in Ghana, and how to avoid paying for capability you do not need yet.",
    relatedPath: "/pricing",
    relatedLabel: "See current pricing",
    sections: [
      {
        heading: "Why the honest answer is \"it depends\"",
        body: [
          "Business management software cost depends on how many modules you activate, how many people need seats, and whether you need one function (say, just Accounting) or several connected ones (Accounting plus Inventory plus HR and Payroll). A single-department tool and a full ERP are not the same purchase, and pricing pages that quote one number for both are hiding the real driver of cost: scope.",
        ],
      },
      {
        heading: "What tends to drive the price up or down",
        list: [
          "Number of modules activated: each product has its own monthly or annual price, and combined-suite pricing is usually discounted versus buying the same modules separately.",
          "Number of users or seats who need access, not just how many people work at the organization.",
          "Whether you need industry-specific functionality (hotel, school, pharmacy, hospital) rather than general business modules.",
          "Implementation effort: data migration, staff training and configuration time, which a modular rollout can spread out rather than front-load.",
        ],
      },
      {
        heading: "Why modular pricing usually costs less to start",
        body: [
          "Rock Frost prices each module separately in Ghana cedis, with discounted combined-suite pricing when several are activated together, so a business can start with the one or two modules it actually needs, on a limited trial, before committing to a paid plan across the whole platform.",
        ],
      },
    ],
    faqs: [
      { question: "Can I try Rock Frost before paying for a full plan?", answer: "Yes. Trial workspaces are limited to three customer-facing products, so you can evaluate real workflows before choosing a paid plan." },
      { question: "Is pricing per module or one flat platform fee?", answer: "Each product has its own price, with discounted combined-suite pricing when several products are activated together. See the pricing page for the current published catalogue." },
    ],
  },
] as const;

export function getResourceArticle(slug: string): ResourceArticle | undefined {
  return RESOURCE_ARTICLES.find((article) => article.slug === slug);
}
