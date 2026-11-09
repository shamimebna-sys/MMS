-- MP-020. History of passport numbers a candidate no longer uses as their current passport.
-- candidates.passport_no stays the current passport. Existing candidate rows are not copied
-- and are not updated: there is one stored number per candidate file, and 23 duplicate groups
-- already share numbers across candidate files. A unique index is omitted so those groups,
-- and a later archive of each copy, do not fail this migration.

CREATE TABLE "candidate_passports" (
    "id" SERIAL NOT NULL,
    "candidate_id" INTEGER NOT NULL,
    "passport_no" VARCHAR(250) NOT NULL,
    "passport_issue_date" DATE,
    "passport_expire_date" DATE,
    "passport_file_path" TEXT,
    "replaced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_passports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "candidate_passports_candidate_id_idx" ON "candidate_passports"("candidate_id");

CREATE INDEX "candidate_passports_passport_no_idx" ON "candidate_passports"("passport_no");

ALTER TABLE "candidate_passports" ADD CONSTRAINT "candidate_passports_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
