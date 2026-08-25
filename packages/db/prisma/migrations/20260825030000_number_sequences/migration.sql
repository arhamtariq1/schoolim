-- CreateTable
CREATE TABLE "number_sequences" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "number_sequences_school_id_kind_idx" ON "number_sequences"("school_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequences_school_id_kind_key" ON "number_sequences"("school_id", "kind");

-- AddForeignKey
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Layer 3, same four requirements as every other tenant table.
ALTER TABLE "number_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "number_sequences" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "number_sequences"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

-- The application role needs INSERT and UPDATE here: allocating a number is an
-- upsert inside the caller's transaction, not a privileged operation.
GRANT SELECT, INSERT, UPDATE ON "number_sequences" TO ilm_app;

COMMENT ON TABLE "number_sequences" IS
  'Gapless per-school counters. A PostgreSQL sequence will not do: sequences leak numbers on rollback, and an audited register may not have holes.';
