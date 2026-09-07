/* ============================================================
   CATALOG — every note sold on the site.

   TO ADD A NOTE:
     1. Drop the PDF into  notes/
     2. Add an object to PRODUCTS below
     3. Commit + push. That's the whole workflow.

   Fields:
     id      unique slug (used by the cart — never reuse one)
     addedAt 'YYYY-MM-DD' the day this title was published. Drives the
             "newest first" ordering of the homepage's Everything view —
             use today's date so your new note surfaces at the top.
     cat     'mbbs' | 'internship' | 'abroad'
     sub     one of the sub-ids listed in CATEGORIES below
     title   shown on the card
     desc    one or two lines of selling copy
     price   number, in the currency set in config.js
     was     optional strike-through price
     meta    small chips: format, length, style
     region  anatomy hotspot this note pins to (see REGIONS)
     file    delivery filename, or null while it is still manual
     status  'live'  purchasable (the default when omitted)
             'soon'  listed but NOT purchasable — shown dimmed, no
                     Add to Cart, and the server refuses to price it.
                     Use this for anything not finished. Selling a
                     title that does not exist yet is how refund
                     disputes start.
   ============================================================ */

export const REGIONS = {
  head: "Head & Neuro",
  chest: "Thorax",
  abdomen: "Abdomen",
  pelvis: "Pelvis",
  limbs: "Musculoskeletal",
  systemic: "Systemic",
};

export const CATEGORIES = {
  mbbs: {
    id: "mbbs",
    title: "MBBS Level",
    page: "mbbs.html",
    blurb:
      "Year-by-year notes built from the university syllabus — condensed, diagram-led, and written to be revised the night before.",
    subs: [
      { id: "year-1", label: "1st Year" },
      { id: "year-2", label: "2nd Year" },
      { id: "year-3", label: "3rd Year" },
      { id: "year-4", label: "4th Year" },
    ],
  },
  internship: {
    id: "internship",
    title: "Internship Practical Guides",
    page: "internship.html",
    blurb:
      "What nobody teaches you on day one of posting. Ward-ready protocols, procedure steps and the exact lines to write in the case sheet.",
    subs: [
      { id: "medicine", label: "General Medicine" },
      { id: "surgery", label: "General Surgery" },
      { id: "paediatrics", label: "Paediatrics" },
      { id: "orthopaedics", label: "Orthopaedics" },
      { id: "obg", label: "Obstetrics & Gynaecology" },
      { id: "research", label: "Research Aid 101" },
    ],
  },
  abroad: {
    id: "abroad",
    title: "Abroad Exams",
    page: "abroad.html",
    blurb:
      "High-yield preparation for the exams that move your career across borders — mapped to each board's current blueprint.",
    subs: [
      { id: "neetpg", label: "NEET PG" },
      { id: "usmle-1", label: "USMLE Step 1" },
      { id: "usmle-2", label: "USMLE Step 2" },
      { id: "amc-1", label: "AMC 1" },
      { id: "amc-2", label: "AMC 2" },
      { id: "plab", label: "PLAB" },
      { id: "dha", label: "DHA" },
      { id: "mcat", label: "MCAT" },
    ],
  },
};

export const PRODUCTS = [
  /* ---------- MBBS · 1st Year ---------- */
  {
    id: "mbbs-y1-anatomy",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-1", region: "limbs",
    title: "General & Systemic Anatomy",
    desc: "Every region, every relation — with the viva questions examiners actually ask, marked in the margin.",
    price: 399, was: 599,
    meta: ["PDF", "Diagram-led", "Viva notes"],
    file: null,
  },
  {
    id: "mbbs-y1-physiology",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-1", region: "systemic",
    title: "Physiology — Systems Compendium",
    desc: "Mechanisms explained as flowcharts, not paragraphs. Cardiac, respiratory, renal and neurophysiology in one file.",
    price: 399, was: 599,
    meta: ["PDF", "Flowcharts", "High-yield"],
    file: null,
  },
  {
    id: "mbbs-y1-biochem",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-1", region: "systemic",
    title: "Biochemistry — Pathways Decoded",
    desc: "All major metabolic pathways on single-page maps, with the enzyme deficiencies and clinical correlations built in.",
    price: 349, was: 499,
    meta: ["PDF", "Pathway maps"],
    file: null,
  },

  /* ---------- MBBS · 2nd Year ---------- */
  {
    id: "mbbs-y2-pathology",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-2", region: "systemic",
    title: "Pathology — General & Systemic",
    desc: "Morphology you can picture, mechanisms you can reproduce. Gross and microscopic findings tabulated for rapid recall.",
    price: 449, was: 649,
    meta: ["PDF", "Tables", "Image-based"],
    file: null,
  },
  {
    id: "mbbs-y2-pharmacology",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-2", region: "systemic",
    title: "Pharmacology — Drug Master File",
    desc: "Class by class: mechanism, uses, adverse effects, contraindications. Built as a lookup table you keep for internship.",
    price: 449, was: 649,
    meta: ["PDF", "Drug tables", "Reference"],
    file: null,
  },
  {
    id: "mbbs-y2-microbiology",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-2", region: "systemic",
    title: "Microbiology — Organism Atlas",
    desc: "Bacteria, viruses, fungi and parasites organised by system, with culture characteristics and treatment of choice.",
    price: 399, was: 549,
    meta: ["PDF", "Organism-wise"],
    file: null,
  },
  {
    id: "mbbs-y2-forensic",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-2", region: "systemic",
    title: "Forensic Medicine & Toxicology",
    desc: "Medicolegal essentials, injury interpretation and the poisons list — written for both the exam and the courtroom.",
    price: 299, was: 449,
    meta: ["PDF", "Case-based"],
    file: null,
  },

  /* ---------- MBBS · 3rd Year ---------- */
  {
    id: "mbbs-y3-ent",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-3", region: "head",
    title: "ENT — Complete Notes",
    desc: "Ear, nose and throat conditions with clinical examination steps and the instruments you'll be handed in practicals.",
    price: 349, was: 499,
    meta: ["PDF", "Clinical", "Instruments"],
    file: null,
  },
  {
    id: "mbbs-y3-ophthal",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-3", region: "head",
    title: "Ophthalmology — Complete Notes",
    desc: "From refractive errors to retinal disease, with fundus interpretation made systematic.",
    price: 349, was: 499,
    meta: ["PDF", "Image-based"],
    file: null,
  },
  {
    id: "mbbs-y3-psm",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-3", region: "systemic",
    title: "Community Medicine (PSM)",
    desc: "Epidemiology, biostatistics and national health programmes — the numbers and schemes, current and exam-ready.",
    price: 349, was: 499,
    meta: ["PDF", "Programmes", "Statistics"],
    file: null,
  },

  /* ---------- MBBS · 4th Year ---------- */
  {
    id: "mbbs-y4-medicine",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-4", region: "chest",
    title: "General Medicine — Final Year",
    desc: "System-wise clinical medicine with differential diagnosis tables and the management protocols in current use.",
    price: 599, was: 899,
    meta: ["PDF", "Clinical", "Protocols"],
    file: null,
  },
  {
    id: "mbbs-y4-surgery",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-4", region: "abdomen",
    title: "General Surgery — Final Year",
    desc: "Operative principles, pre-op and post-op care, and the short cases that come up in every practical exam.",
    price: 599, was: 899,
    meta: ["PDF", "Short cases", "Operative"],
    file: null,
  },
  {
    id: "mbbs-y4-obg",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-4", region: "pelvis",
    title: "Obstetrics & Gynaecology",
    desc: "Antenatal to postpartum, plus gynaecological pathology — with partogram and labour management explained cleanly.",
    price: 599, was: 899,
    meta: ["PDF", "Protocols", "Clinical"],
    file: null,
  },
  {
    id: "mbbs-y4-paeds",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-4", region: "systemic",
    title: "Paediatrics — Final Year",
    desc: "Growth, development, neonatology and paediatric emergencies, with weight-based dosing you can use on the ward.",
    price: 549, was: 799,
    meta: ["PDF", "Dosing", "Milestones"],
    file: null,
  },
  {
    id: "mbbs-y4-ortho",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-4", region: "limbs",
    title: "Orthopaedics — Final Year",
    desc: "Fractures, classifications and management, with the X-ray interpretation drills that make the viva easy.",
    price: 449, was: 649,
    meta: ["PDF", "X-ray", "Classifications"],
    file: null,
  },
  {
    id: "mbbs-y4-psych",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-4", region: "head",
    title: "Psychiatry — Complete Notes",
    desc: "Diagnostic criteria condensed, mental status examination scripted, and psychopharmacology in one table.",
    price: 299, was: 449,
    meta: ["PDF", "Criteria", "MSE"],
    file: null,
  },
  {
    id: "mbbs-y4-derma",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-4", region: "systemic",
    title: "Dermatology — Complete Notes",
    desc: "Lesion morphology as the organising principle — describe it correctly and the diagnosis follows.",
    price: 299, was: 449,
    meta: ["PDF", "Morphology"],
    file: null,
  },
  {
    id: "mbbs-y4-anaesthesia",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-4", region: "chest",
    title: "Anaesthesia & Critical Care",
    desc: "Airway assessment, anaesthetic agents and the ICU basics every final-year student is expected to know.",
    price: 299, was: 449,
    meta: ["PDF", "Airway", "ICU"],
    file: null,
  },
  {
    id: "mbbs-y4-radiology",
    addedAt: "2026-09-06",
    cat: "mbbs", sub: "year-4", region: "chest",
    title: "Radiology — Reading Films",
    desc: "A repeatable system for chest X-rays, abdominal films and CT basics. Never freeze in front of a film again.",
    price: 349, was: 499,
    meta: ["PDF", "Film reading"],
    file: null,
  },

  /* ---------- INTERNSHIP ---------- */
  {
    id: "int-medicine",
    addedAt: "2026-09-06",
    cat: "internship", sub: "medicine", region: "chest",
    title: "Medicine Posting — Ward Survival Guide",
    desc: "Admission notes, common ward calls, fluid and insulin orders, and the exact escalation points. Written for your first week.",
    price: 499, was: 749,
    meta: ["PDF", "Ward-ready", "Protocols"],
    file: null,
  },
  {
    id: "int-surgery",
    addedAt: "2026-09-06",
    cat: "internship", sub: "surgery", region: "abdomen",
    title: "Surgery Posting — Practical Guide",
    desc: "Scrubbing, suturing, drain care and post-op rounds. Includes the pre-op checklist and consent essentials.",
    price: 499, was: 749,
    meta: ["PDF", "Procedures", "Checklists"],
    file: null,
  },
  {
    id: "int-paeds",
    addedAt: "2026-09-06",
    cat: "internship", sub: "paediatrics", region: "systemic",
    title: "Paediatrics Posting — Practical Guide",
    desc: "Neonatal resuscitation, weight-based drug charts and paediatric fluid calculation, on pages you can carry.",
    price: 499, was: 749,
    meta: ["PDF", "Dosing charts", "NRP"],
    file: null,
  },
  {
    id: "int-ortho",
    addedAt: "2026-09-06",
    cat: "internship", sub: "orthopaedics", region: "limbs",
    title: "Orthopaedics Posting — Practical Guide",
    desc: "Plaster technique, traction setup, splinting and the trauma primary survey done properly.",
    price: 449, was: 649,
    meta: ["PDF", "Procedures", "Trauma"],
    file: null,
  },
  {
    id: "int-obg",
    addedAt: "2026-09-06",
    cat: "internship", sub: "obg", region: "pelvis",
    title: "OBG Posting — Labour Room Guide",
    desc: "Conducting a normal delivery, partogram in practice, PPH protocol and the antenatal clinic routine.",
    price: 499, was: 749,
    meta: ["PDF", "Labour room", "Emergencies"],
    file: null,
  },
  {
    id: "int-research",
    addedAt: "2026-09-06",
    cat: "internship", sub: "research", region: "head",
    title: "Research Aid 101",
    desc: "Your first paper, start to finish: question, design, ethics approval, statistics, writing and where to submit.",
    price: 599, was: 899,
    meta: ["PDF", "Templates", "Statistics"],
    file: null,
  },

  /* ---------- ABROAD EXAMS ---------- */
  {
    id: "abroad-neetpg",
    addedAt: "2026-09-06",
    cat: "abroad", sub: "neetpg", region: "systemic",
    title: "NEET PG — High-Yield Compendium",
    desc: "Subject-wise rapid revision built from recent paper trends, with image-based questions covered separately.",
    price: 999, was: 1499,
    meta: ["PDF", "Rapid revision", "Trend-based"],
    file: null,
  },
  {
    id: "abroad-usmle-1",
    addedAt: "2026-09-06",
    cat: "abroad", sub: "usmle-1", region: "systemic",
    title: "USMLE Step 1 — Concept Notes",
    desc: "First Aid gaps filled in: mechanisms, integrated physiology and the pathology correlations Step 1 rewards.",
    price: 1299, was: 1899,
    meta: ["PDF", "Integrated", "Mechanism-first"],
    file: null,
  },
  {
    id: "abroad-usmle-2",
    addedAt: "2026-09-06",
    cat: "abroad", sub: "usmle-2", region: "chest",
    title: "USMLE Step 2 CK — Clinical Notes",
    desc: "Next-best-step logic made explicit, with management algorithms for the presentations CK tests hardest.",
    price: 1299, was: 1899,
    meta: ["PDF", "Algorithms", "Clinical"],
    file: null,
  },
  /* ---- AMC 1 is a section of per-subject notebooks ----
     Each subject is its own purchasable notebook. The bundle below
     covers all of them and stays unlisted until enough exist to
     bundle honestly. */
  {
    id: "abroad-amc1-mental-health",
    addedAt: "2026-09-07",
    cat: "abroad", sub: "amc-1", region: "head",
    title: "Mental Health — AMC 1",
    desc: "Adult, child and perinatal psychiatry for the AMC Part 1 CAT. Every disorder in the same shape: the exact MCQ stem AMC uses, the buzzwords and duration thresholds that lock the answer, DSM-5-TR criteria trimmed to what is testable, and management split into initial, best and avoid.",
    price: 199,
    meta: ["PDF", "AMC stem patterns", "DSM-5-TR"],
    file: "DaVinci Medical Library's AMC 1 - Mental Health.pdf",
  },
  {
    id: "abroad-amc-1",
    addedAt: "2026-09-07",
    cat: "abroad", sub: "amc-1", region: "systemic",
    title: "AMC Part 1 — Complete Bundle",
    desc: "Every AMC Part 1 subject notebook in one purchase. Listed once enough subjects are published to bundle.",
    price: 1199, was: 1699,
    meta: ["PDF", "All subjects", "Bundle"],
    file: null,
    status: "soon",
  },
  {
    id: "abroad-amc-2",
    addedAt: "2026-09-06",
    cat: "abroad", sub: "amc-2", region: "head",
    title: "AMC Part 2 — Clinical & OSCE",
    desc: "Station-by-station scripts for history, examination and counselling, with the marking criteria in view.",
    price: 1399, was: 1999,
    meta: ["PDF", "OSCE scripts", "Counselling"],
    file: null,
  },
  {
    id: "abroad-plab",
    addedAt: "2026-09-06",
    cat: "abroad", sub: "plab", region: "systemic",
    title: "PLAB 1 & 2 — Complete Preparation",
    desc: "NICE-aligned management, UK ethics and communication stations written the way examiners want them answered.",
    price: 1299, was: 1899,
    meta: ["PDF", "NICE", "Stations"],
    file: null,
  },
  {
    id: "abroad-dha",
    addedAt: "2026-09-06",
    cat: "abroad", sub: "dha", region: "systemic",
    title: "DHA — Licensing Exam Notes",
    desc: "Focused preparation for the Dubai Health Authority exam, with the specialty weightings and question style covered.",
    price: 1099, was: 1599,
    meta: ["PDF", "Specialty-wise"],
    file: null,
  },
  {
    id: "abroad-mcat",
    addedAt: "2026-09-06",
    cat: "abroad", sub: "mcat", region: "head",
    title: "MCAT — Sciences & CARS",
    desc: "Biology, chemistry, physics and psychology consolidated, plus a repeatable method for CARS passages.",
    price: 1199, was: 1699,
    meta: ["PDF", "Sciences", "CARS method"],
    file: null,
  },
];

/* ---------- Query helpers ---------- */

/** Anything without an explicit status is on sale. */
export const isBuyable = (p) => (p?.status ?? "live") === "live";

/** Most recently added first. Ties keep their catalogue order (stable sort). */
export const byNewest = (list) =>
  [...list].sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));

export const byId = (id) => PRODUCTS.find((p) => p.id === id);

export const byCategory = (cat) => PRODUCTS.filter((p) => p.cat === cat);

export const byRegion = (region) => PRODUCTS.filter((p) => p.region === region);

export function subLabel(cat, sub) {
  return CATEGORIES[cat]?.subs.find((s) => s.id === sub)?.label ?? sub;
}
