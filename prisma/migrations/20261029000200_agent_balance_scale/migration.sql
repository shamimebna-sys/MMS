-- One legacy agent balance has 8 fractional digits. DECIMAL(15,4) rounded it.
ALTER TABLE "agents" ALTER COLUMN "balance" TYPE DECIMAL(24, 8);
