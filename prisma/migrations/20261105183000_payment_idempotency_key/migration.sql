-- Submission identity for payment retries. Null on every existing row, so legacy
-- payments and repeated invoice numbers stay valid. PostgreSQL unique indexes
-- allow many nulls and reject a second row with the same key.
ALTER TABLE "payments" ADD COLUMN "idempotency_key" VARCHAR(36);

CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");
