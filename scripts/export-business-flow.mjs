import fs from "node:fs";
import path from "node:path";

const regular = "C:\\Windows\\Fonts\\arial.ttf";
const bold = fs.existsSync("C:\\Windows\\Fonts\\arialbd.ttf") ? "C:\\Windows\\Fonts\\arialbd.ttf" : regular;
const italic = fs.existsSync("C:\\Windows\\Fonts\\ariali.ttf") ? "C:\\Windows\\Fonts\\ariali.ttf" : regular;
const boldItalic = fs.existsSync("C:\\Windows\\Fonts\\arialbi.ttf") ? "C:\\Windows\\Fonts\\arialbi.ttf" : bold;

const navy = "#1A3654";
const red = "#B42318";
const muted = "#5C6B7A";
const line = "#D5DEE8";
const paper = "#F4F7FB";
const white = "#FFFFFF";

function box(title, detail, fill = navy, color = white) {
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            stack: [
              { text: title, bold: true, fontSize: 11, color },
              detail ? { text: detail, fontSize: 8.5, color, margin: [0, 2, 0, 0] } : { text: "" },
            ],
            fillColor: fill,
            margin: [10, 7, 10, 7],
          },
        ],
      ],
    },
    layout: "noBorders",
  };
}

function arrow() {
  return { text: "↓", alignment: "center", color: red, fontSize: 13, bold: true, margin: [0, 1, 0, 1] };
}

function section(title) {
  return { text: title, fontSize: 14, bold: true, color: navy, margin: [0, 14, 0, 6] };
}

function note(text) {
  return { text, fontSize: 9, color: muted, margin: [0, 2, 0, 4] };
}

function party(title, lines) {
  return {
    table: {
      widths: ["*"],
      body: [
        [{ text: title, bold: true, fontSize: 10, color: white, fillColor: navy, margin: [8, 6, 8, 6] }],
        [
          {
            stack: lines.map((item) => ({ text: item, fontSize: 8, color: navy, margin: [0, 1, 0, 1] })),
            fillColor: paper,
            margin: [8, 6, 8, 6],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      hLineColor: () => line,
      vLineColor: () => line,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };
}

const steps = [
  ["1. Registration", "An agent or sub-agent creates the person. Required: name, passport number, email, mobile."],
  ["2. Candidate login", "A password at registration creates a Candidate account on that email. The person then sees only their own file."],
  ["3. CV, photos, passport stamp", "CV, half photo, full photo, NID, and the stamped passport are stored on the file."],
  ["4. Class group", "Office assigns the training batch. The group carries its own fee. A teacher runs that group's timetable."],
  ["5. Exams", "Office schedules an exam for the group and records local, abroad, skill, and English marks. This stays beside the file."],
  ["6. Selected", "Office adds a selection row and the job title. Selected people appear on the dashboard banner."],
  ["7. Company, agency, position", "Office tags the hiring company, the partner agency, the licensed job, and the destination country."],
  ["8. Labour contract", "Issue date, expiry, and the scanned contract. Live status becomes Labour."],
  ["9. Police clearance", "Clearance dates and photo. Live status becomes Police."],
  ["10. Medical", "Medical dates, destination country, and the report. A medical-fee payment can be linked here."],
  ["11. Visa", "Visa or MP number, issue and expiry, and the scan. Live status becomes Visa."],
  ["12. Manpower training", "BMET training dates, certificate, fingerprint, and manpower paper. Live status becomes Manpower."],
  ["13. ARC", "Alien registration card number and dates. Kept on the file. Live status stays on the placement step."],
  ["14. Flight", "Airline, date, time, and ticket. Live status becomes Flight. A ticket invoice can be raised for the same person."],
];

const pdfMake = (await import("pdfmake")).default;
const allowed = new Set([path.resolve(regular), path.resolve(bold), path.resolve(italic), path.resolve(boldItalic)]);
pdfMake.setFonts({
  Roboto: {
    normal: path.resolve(regular),
    bold: path.resolve(bold),
    italics: path.resolve(italic),
    bolditalics: path.resolve(boldItalic),
  },
});
pdfMake.setLocalAccessPolicy((candidate) => allowed.has(path.resolve(candidate)));
pdfMake.setUrlAccessPolicy(() => false);

const definition = {
  pageSize: "A4",
  pageMargins: [36, 42, 36, 42],
  info: {
    title: "Manpower business flow",
    author: "E & A AIR INTERNATIONAL",
    subject: "Who reports to whom, and what happens after a candidate is registered",
  },
  defaultStyle: { font: "Roboto", fontSize: 10, color: navy },
  footer: (current, total) => ({
    columns: [
      { text: "E & A AIR INTERNATIONAL  ·  EUJOBBD", fontSize: 8, color: muted, margin: [36, 8, 0, 0] },
      { text: `${current} / ${total}`, alignment: "right", fontSize: 8, color: muted, margin: [0, 8, 36, 0] },
    ],
  }),
  content: [
    { text: "MANPOWER BUSINESS FLOW", fontSize: 9, bold: true, color: red, margin: [0, 0, 0, 4] },
    { text: "How a candidate moves from registration to flight", fontSize: 18, bold: true, color: navy, margin: [0, 0, 0, 4] },
    note("E & A AIR INTERNATIONAL. A person is registered inside the office system by an agent or a sub-agent. The public site only shows profiles."),

    section("1. Who is under whom"),
    {
      table: {
        widths: ["*"],
        body: [[
          {
            stack: [
              box("Office", "Super admin and owner. They see every candidate, payment, invoice, and file."),
              { text: "reports down to", alignment: "center", fontSize: 8, color: muted, margin: [0, 4, 0, 4] },
            ],
            margin: [70, 0, 70, 0],
          },
        ]],
      },
      layout: "noBorders",
    },
    {
      columns: [
        party("Employees and teachers", ["Office staff.", "Teachers run class timetables.", "They do not own candidates."]),
        { text: "", width: 8 },
        party("Agents", ["Recruiting partners.", "Own a wallet.", "See their own candidates,", "their sub-agents, payments,", "and payment requests."]),
        { text: "", width: 8 },
        party("Agencies", ["Partner agencies.", "See candidates and invoices", "tagged with their agency."]),
        { text: "", width: 8 },
        party("Companies", ["Hiring companies.", "Hold the license and the", "job seats on that license.", "See candidates tagged to them."]),
      ],
      columnGap: 0,
      margin: [0, 0, 0, 8],
    },
    {
      table: {
        widths: ["*"],
        body: [[
          {
            stack: [
              { text: "Under the agent", alignment: "center", fontSize: 8, color: muted, margin: [0, 2, 0, 3] },
              box("Sub-agent", "Belongs to one agent. Sees only the candidates they registered. The parent agent is stored on those candidates too.", "#244A73"),
              arrow(),
              box("Candidate", "Sees only their own file. Also tagged, when the office fills them in, to one class group, one agency, one company, one job, and one country.", red),
            ],
            margin: [90, 0, 90, 0],
          },
        ]],
      },
      layout: "noBorders",
    },
    note("A candidate always sits on one recruiting line (agent, and a sub-agent when one registered them). Agency, company, class group, position, and country are tags on that same person."),

    section("2. What the candidate list calls the current step"),
    note("The board shows one live status: the furthest placement record that already exists. A later paper moves the status forward even when an earlier paper is still missing."),
    ...[
      ["Registration", "The candidate row exists. No class group yet."],
      ["Group", "A class group is assigned."],
      ["Selected", "A selection row exists."],
      ["Labour", "A labour contract exists."],
      ["Police", "A police clearance exists."],
      ["Medical", "A medical record exists."],
      ["Visa", "A visa record exists."],
      ["Manpower", "A manpower training record exists."],
      ["Flight", "A flight schedule exists. This is the last status."],
    ].flatMap(([title, detail], index, all) => {
      const item = box(`${index + 1}   ${title}`, detail, index === all.length - 1 ? red : index === 0 ? navy : "#244A73");
      return index === all.length - 1 ? [item] : [item, arrow()];
    }),

    section("3. Full path after registration"),
    note("This is the working order on the candidate file: who acts, and what is saved."),
    {
      table: {
        headerRows: 1,
        widths: [22, 118, "*", 78],
        body: [
          ["#", "Step", "What is saved", "Who does it"].map((label) => ({
            text: label,
            bold: true,
            color: white,
            fillColor: navy,
            fontSize: 8,
            margin: [4, 4, 4, 4],
          })),
          ...[
            ["1", "Register", "Name, passport, email, mobile. Agent is set automatically. A sub-agent also sets the parent agent.", "Agent, sub-agent, or office"],
            ["2", "Login", "Candidate user on that email, only when a password is entered.", "Created at registration"],
            ["3", "CV and photos", "CV, photos, NID, passport scan, addresses.", "Whoever can edit the file"],
            ["4", "Passport stamp", "Stamp scan on the passport step of the file.", "Office"],
            ["5", "Class group", "Training batch and its fee.", "Office"],
            ["6", "Classes", "Weekly timetable for that group.", "Teacher"],
            ["7", "Exams", "Result: local, abroad, skill, English. Does not change live status.", "Office"],
            ["8", "Selected", "Selection row and job title. Shown on the dashboard banner.", "Office"],
            ["9", "Company and agency", "Company, agency, licensed position, country.", "Office"],
            ["10", "Labour", "Contract issue date, expiry, scan.", "Office"],
            ["11", "Police", "Clearance dates and photo.", "Office"],
            ["12", "Medical", "Medical dates, country, report. Medical fee can be linked.", "Office"],
            ["13", "Visa", "Visa or MP number, dates, scan.", "Office"],
            ["14", "Manpower", "Training dates, certificate, fingerprint.", "Office"],
            ["15", "ARC", "Card number and dates. Does not change live status.", "Office"],
            ["16", "Flight", "Airline, date, time, ticket.", "Office"],
            ["17", "Ticket invoice", "Ticket bill linked to this candidate.", "Office"],
            ["18", "Replacement", "Another candidate can be recorded as the replacement.", "Office"],
          ].map((row, index) =>
            row.map((cell) => ({
              text: cell,
              fontSize: 8,
              color: navy,
              fillColor: index % 2 === 0 ? white : paper,
              margin: [4, 3, 4, 3],
            })),
          ),
        ],
      },
      layout: {
        hLineWidth: () => 0.4,
        vLineWidth: () => 0.4,
        hLineColor: () => line,
        vLineColor: () => line,
      },
    },
    note("Agents open candidates, payment requests, sub-agents, and payments. Sub-agents open candidates and payment requests. Agencies open candidates and invoices. Labour, police, medical, visa, manpower, and flight are office modules."),

    section("4. Money, beside the placement steps"),
    box("Sub-agent payment request", "A bill for one candidate or one class group, sent up to the parent agent.", "#244A73"),
    arrow(),
    box("Agent payment request", "The agent's bill for that candidate or group.", "#244A73"),
    arrow(),
    box("Payment  ·  pending", "Office reviews it. Approved is status A. Rejected is status R. Anything else stays pending.", red),
    arrow(),
    box("Wallet", "Only an approved payment moves the balance. A DR adds to the agent or sub-agent wallet. Any other type subtracts.", navy),
    { text: "", margin: [0, 6, 0, 0] },
    {
      columns: [
        party("Fees on the person", ["Admission payment", "Final group payment", "Medical fee payment", "The candidate list shows Done once any approved payment exists."]),
        { text: "", width: 10 },
        party("Invoice", ["Agency plus company.", "Service, country, line items.", "The candidates on that invoice.", "Then a money receipt."]),
        { text: "", width: 10 },
        party("Manpower bill", ["A payment whose title starts with Manpower.", "Marked done on the candidate file when that payment is approved."]),
      ],
    },

    section("5. What each login can see"),
    {
      table: {
        headerRows: 1,
        widths: [110, "*"],
        body: [
          ["Login", "Sees"].map((label) => ({ text: label, bold: true, color: white, fillColor: navy, fontSize: 8, margin: [4, 4, 4, 4] })),
          ...[
            ["Super admin, owner", "Every record."],
            ["Agent", "Own candidates, own sub-agents, own payments and payment requests, own wallet."],
            ["Sub-agent", "Own candidates and own payment requests. New candidates are also tied to the parent agent."],
            ["Agency", "Candidates and invoices tagged with that agency."],
            ["Company", "Candidates tagged with that company. The company license lists jobs and seat counts."],
            ["Candidate", "Only their own file."],
            ["Teacher", "Class timetable. Teachers do not own candidate files."],
          ].map((row, index) =>
            row.map((cell) => ({ text: cell, fontSize: 8, color: navy, fillColor: index % 2 === 0 ? white : paper, margin: [4, 3, 4, 3] })),
          ),
        ],
      },
      layout: {
        hLineWidth: () => 0.4,
        vLineWidth: () => 0.4,
        hLineColor: () => line,
        vLineColor: () => line,
      },
    },
    note("The public candidate page lists name, job, and experience. Phone and email stay in the office."),
  ],
};

const buffer = await pdfMake.createPdf(definition).getBuffer();
const out = path.resolve("docs", "business-flow.pdf");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buffer);
console.log(`${out} ${buffer.length}`);
