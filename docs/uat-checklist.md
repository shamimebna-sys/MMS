# Business owner UAT

This checklist is for the business owner. It is not signed. Implementation of the screens does not count as acceptance.

- [ ] Sign in as the admin and as a legacy agent, candidate, sub-agent, agencier, and companier.
- [ ] Confirm an agent cannot open another agent's candidate by changing the id in the URL.
- [ ] Confirm a candidate sees only their own record.
- [ ] Search a candidate by code, mobile, and passport and open the detail.
- [ ] Add a candidate and a DR/CR payment. Confirm the amount matches what was typed, with no rounding.
- [ ] Archive a candidate and confirm they leave the active list and remain in the database.
- [ ] Compare pipeline counts with a known group, selection, medical, visa, and flight.
- [ ] Confirm exam results are not labeled as interviews.
- [ ] Download a PDF and an Excel file. Open the Excel file and confirm a cell that starts with `=` was saved as text.
- [ ] Upload a JPEG and a PDF, then download them. Confirm a renamed path outside `data/uploads` is rejected.
- [ ] Request a password reset and complete it. Confirm the old sessions stop working.
- [ ] Lock an email with five bad passwords and confirm the 15-minute message.
- [ ] Review `docs/migration` report totals: source = inserted + skipped + quarantined + excluded.
- [ ] Review placeholder districts 65, 66, and 72 and the thanas that reference them.
- [ ] Review quarantined rows and the `role_id_missing_nulled` notes.

Owner signature: outstanding.
Date: outstanding.
