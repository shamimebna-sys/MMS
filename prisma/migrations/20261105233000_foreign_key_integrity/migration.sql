-- MP-019. Foreign keys for parent links that already match every stored id.
-- Parents are archived with deleted_at, or they are migration runs the
-- application never deletes. ON DELETE RESTRICT blocks a hard delete of a
-- referenced parent. It does not cascade and it does not null child rows.
-- Column names, types, and nullability are unchanged.

ALTER TABLE "candidates" ADD CONSTRAINT "candidates_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_sub_agent_id_fkey" FOREIGN KEY ("sub_agent_id") REFERENCES "sub_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_agencier_id_fkey" FOREIGN KEY ("agencier_id") REFERENCES "agenciers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_companier_id_fkey" FOREIGN KEY ("companier_id") REFERENCES "companiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employer_candidates" ADD CONSTRAINT "employer_candidates_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_agenciers_id_fkey" FOREIGN KEY ("agenciers_id") REFERENCES "agenciers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companier_id_fkey" FOREIGN KEY ("companier_id") REFERENCES "companiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "licenses" ADD CONSTRAINT "licenses_companier_id_fkey" FOREIGN KEY ("companier_id") REFERENCES "companiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sub_agents" ADD CONSTRAINT "sub_agents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sub_agent_payment_requests" ADD CONSTRAINT "sub_agent_payment_requests_sub_agent_id_fkey" FOREIGN KEY ("sub_agent_id") REFERENCES "sub_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_invoices" ADD CONSTRAINT "ticket_invoices_agencier_id_fkey" FOREIGN KEY ("agencier_id") REFERENCES "agenciers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_invoices" ADD CONSTRAINT "ticket_invoices_companier_id_fkey" FOREIGN KEY ("companier_id") REFERENCES "companiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_invoices" ADD CONSTRAINT "ticket_invoices_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_invoices" ADD CONSTRAINT "ticket_invoices_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "users" ADD CONSTRAINT "users_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_sub_agent_id_fkey" FOREIGN KEY ("sub_agent_id") REFERENCES "sub_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_agencier_id_fkey" FOREIGN KEY ("agencier_id") REFERENCES "agenciers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "migration_table_results" ADD CONSTRAINT "migration_table_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "migration_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "migration_quarantine" ADD CONSTRAINT "migration_quarantine_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "migration_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
