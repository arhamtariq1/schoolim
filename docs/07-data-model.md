# 07 — Data Model

Conventions used throughout:
- `id uuid PK default gen_random_uuid()` on every table (UUIDv7 once Postgres/Prisma support lands —
  it gives index locality; note it as a Phase 1 spike).
- `school_id uuid NOT NULL` on every tenant table, first column of every index.
- `created_at`, `updated_at` `timestamptz NOT NULL`; `created_by`, `updated_by` uuid on mutable records.
- `deleted_at timestamptz NULL` for soft delete where the record is operational.
  **Financial records are never soft-deleted** — they are reversed.
- Money: `numeric(14,2)` in Postgres; **integer paisa** in application code.

---

## 1. Platform (no `school_id` — these live outside tenancy)

```
platform_users        id, email, name, password_hash, mfa_secret, role(SUPER_ADMIN|SUPPORT|BILLING),
                      token_version, last_login_at, is_active
school_groups         id, name, slug UNIQUE, legal_name, logo_url, primary_color,
                      billing_mode(PER_CAMPUS|CONSOLIDATED), status, created_at
                      -- reserved in the first migration, unused until Phase 9. See ADR-0008.
schools               id, school_group_id NULL → school_groups.id, name, slug UNIQUE, legal_name,
                      logo_url, primary_color, timezone,
                      country, city, address, phone, email, currency, locale,
                      status(TRIAL|ACTIVE|PAST_DUE|SUSPENDED|CHURNED), shard_key DEFAULT 'main',
                      onboarded_at, trial_ends_at
                      -- one row = one CAMPUS. A standalone school has school_group_id NULL.
school_domains        id, school_id, domain UNIQUE, is_primary, verified_at
plans                 id, code UNIQUE, name, student_cap, price_minor, currency,
                      billing_cycle(MONTHLY|ANNUAL|TERM), features jsonb, is_active
subscriptions         id, school_id, plan_id, status, current_period_start, current_period_end,
                      cancel_at, trial_ends_at, seats_used_snapshot
subscription_invoices id, school_id, subscription_id, number UNIQUE, amount_minor, status,
                      issued_at, due_at, paid_at
school_features       id, school_id, feature_key, enabled, config jsonb   UNIQUE(school_id,feature_key)
platform_audit_logs   id, actor_id, action, target_type, target_id, school_id, meta jsonb, ip, at
usage_snapshots       id, school_id, captured_at, students_active, staff_active, storage_bytes,
                      vouchers_month, messages_month
```

`school_features` is the mechanism that lets one school have something another does not **without a
code branch**. It is load-bearing. See `12-engineering-rules.md` R1.

---

## 2. Identity & access (tenant-scoped)

```
users              id, school_id, identity_id NULL, email, phone, name, password_hash, avatar_url,
                   status(INVITED|ACTIVE|DISABLED), must_change_password, token_version,
                   last_login_at, locale
                   UNIQUE(school_id, email)   ← email is unique per school, not globally
                   -- identity_id is reserved for Phase 9: one login across the campuses of a
                   --   school group, owning N campus users rows. Unused until then. ADR-0008.
user_roles         id, school_id, user_id, role, scope jsonb
                   -- scope example for a teacher: { "sectionIds": ["…"] }
                   UNIQUE(school_id, user_id, role)
sessions           id, school_id, user_id, family_id, refresh_token_hash, ip, user_agent,
                   expires_at, last_used_at, revoked_at, revoked_reason
invitations        id, school_id, email, role, token_hash, invited_by, expires_at, accepted_at
password_resets    id, school_id, user_id, token_hash, expires_at, used_at
audit_logs         id, school_id, actor_user_id, actor_type, action, entity_type, entity_id,
                   before jsonb, after jsonb, ip, user_agent, request_id, at
                   -- append only; no UPDATE/DELETE grant on this table
```

A person who is both a parent at the school and a teacher at the same school gets **one** user with
two `user_roles` rows. A person at two different schools gets two users. That is deliberate: it
keeps `school_id` on `users` and makes tenant isolation total.

---

## 3. Academic structure

```
academic_sessions  id, school_id, name ("2026-2027"), start_date, end_date,
                   status(PLANNED|ACTIVE|CLOSED), is_current
                   -- partial unique index: only one is_current=true per school
class_levels       id, school_id, name ("Grade 5"), numeric_order, is_active
sections           id, school_id, class_level_id, session_id, name ("A"),
                   capacity, class_teacher_id → staff.id, room
                   UNIQUE(school_id, session_id, class_level_id, name)
subjects           id, school_id, name, code, is_elective, is_active
class_subjects     id, school_id, class_level_id, session_id, subject_id, teacher_id, weekly_periods
timetable_slots    id, school_id, section_id, day_of_week, period_no, start_time, end_time,
                   subject_id, teacher_id, room
                   UNIQUE(school_id, section_id, day_of_week, period_no)
holidays           id, school_id, session_id, date, name, type(HOLIDAY|VACATION|EVENT),
                   applies_to(ALL|STUDENTS|STAFF)
```

**Design note — sessions are the axis of everything.** In the old portal "session" was probably a
filter bolted on late. Here, `session_id` is on sections, enrollments, fee assignments, attendance
and exams from the first migration. Year rollover then becomes a supported operation
(clone sections → promote students → clone fee plans with increments) rather than a data migration.

---

## 4. People

```
students        id, school_id, admission_no UNIQUE(school_id, admission_no),
                first_name, last_name, gender, date_of_birth, photo_url,
                b_form_no (encrypted), religion, blood_group, nationality,
                address, city, emergency_contact,
                status(ACTIVE|INACTIVE|GRADUATED|LEFT|STRUCK_OFF),
                admitted_on, left_on, leaving_reason, user_id → users.id NULL,
                custom jsonb
guardians       id, school_id, name, relation(FATHER|MOTHER|GUARDIAN), cnic (encrypted),
                phone, whatsapp, email, occupation, monthly_income_band,
                address, user_id → users.id NULL
student_guardians id, school_id, student_id, guardian_id, is_primary, is_fee_payer,
                  can_pickup   UNIQUE(school_id, student_id, guardian_id)
enrollments     id, school_id, student_id, session_id, class_level_id, section_id, roll_no,
                status(ENROLLED|PROMOTED|REPEATED|TRANSFERRED|LEFT), enrolled_on, ended_on
                UNIQUE(school_id, session_id, student_id)
                UNIQUE(school_id, session_id, section_id, roll_no)
siblings        derived view over student_guardians (drives the sibling discount rule)
staff           id, school_id, employee_no, user_id, first_name, last_name, gender, dob,
                cnic (encrypted), phone, email, designation, department,
                type(TEACHING|NON_TEACHING|ADMIN), joined_on, left_on,
                status, qualification, basic_salary_minor, custom jsonb
documents       id, school_id, owner_type(STUDENT|STAFF|APPLICATION), owner_id,
                kind, file_key, file_name, mime, size_bytes, uploaded_by, at
custom_field_defs id, school_id, entity(STUDENT|STAFF|GUARDIAN), key, label,
                  type(TEXT|NUMBER|DATE|SELECT|BOOLEAN), options jsonb, required, order
```

**`custom jsonb` + `custom_field_defs` is the pressure valve.** Every school will ask for a field you
did not anticipate. Without this, each request becomes a migration and a code branch — the exact
mechanism that destroyed the previous portal. With it, the school adds the field itself in Settings.

---

## 5. Admissions

```
admission_applications id, school_id, session_id, application_no UNIQUE, applied_for_class_level_id,
                       student_first_name, student_last_name, dob, gender,
                       guardian_name, guardian_phone, guardian_cnic,
                       previous_school, source(WALK_IN|ONLINE|REFERRAL|CAMPAIGN),
                       status(NEW|SCREENING|TEST_SCHEDULED|TESTED|INTERVIEW|OFFERED|
                              ACCEPTED|ENROLLED|REJECTED|WITHDRAWN),
                       test_date, test_score, interview_notes, offered_on,
                       admission_fee_minor, converted_student_id, rejected_reason
application_events     id, school_id, application_id, from_status, to_status, by_user_id, note, at
```

Status is a **state machine with allowed transitions declared in code**, not a free enum. The UI
renders it as a kanban board; the API rejects an illegal transition.

---

## 6. Fees (the commercial core)

```
fee_heads          id, school_id, name ("Tuition","Transport","Exam","Admission"), code,
                   type(RECURRING|ONE_TIME|REFUNDABLE), default_frequency(MONTHLY|TERM|ANNUAL|ONCE),
                   is_taxable, gl_category, sort_order, is_active
fee_plans          id, school_id, session_id, name ("Grade 5 — 2026-27"),
                   class_level_id NULL, status(DRAFT|ACTIVE|ARCHIVED), effective_from, effective_to
fee_plan_lines     id, school_id, fee_plan_id, fee_head_id, amount_minor, frequency,
                   due_day_of_month, months smallint[]  -- e.g. exam fee only in {4,11}
                   UNIQUE(school_id, fee_plan_id, fee_head_id)
student_fee_assignments id, school_id, student_id, session_id, fee_plan_id,
                        effective_from, effective_to, note
student_fee_overrides   id, school_id, student_id, session_id, fee_head_id,
                        amount_minor NULL, waived boolean, reason, approved_by, effective_from, effective_to
                        -- per-student deviation without cloning a whole plan
discounts          id, school_id, name, type(PERCENT|FIXED), value,
                   applies_to_head_id NULL, reason_category(SIBLING|MERIT|STAFF|HARDSHIP|OTHER),
                   requires_approval, is_active
student_discounts  id, school_id, student_id, session_id, discount_id, effective_from, effective_to,
                   approved_by, approved_at, note
fee_increments     id, school_id, session_id, name, scope(ALL|CLASS|PLAN),
                   class_level_id NULL, fee_plan_id NULL, fee_head_id NULL,
                   mode(PERCENT|FIXED), value, effective_from,
                   status(DRAFT|APPLIED), applied_at, applied_by, preview jsonb
billing_periods    id, school_id, session_id, code ("2026-09"), label ("September 2026"),
                   period_start, period_end, due_date, late_fee_after, status(OPEN|LOCKED)
                   UNIQUE(school_id, session_id, code)

fee_vouchers       id, school_id, student_id, session_id, billing_period_id,
                   voucher_no UNIQUE(school_id, voucher_no),
                   issue_date, due_date,
                   gross_minor, discount_minor, waiver_minor, arrears_minor, late_fee_minor,
                   net_payable_minor, paid_minor, balance_minor,
                   status(DRAFT|ISSUED|PARTIALLY_PAID|PAID|OVERDUE|CANCELLED|WAIVED),
                   generation_run_id, cancelled_reason, printed_at, sent_at
                   UNIQUE(school_id, student_id, billing_period_id)  ← the anti-double-billing key
fee_voucher_lines  id, school_id, voucher_id, fee_head_id, description,
                   amount_minor, discount_minor, net_minor, source(PLAN|OVERRIDE|ARREAR|LATE_FEE|MANUAL)
fee_generation_runs id, school_id, billing_period_id, idempotency_key UNIQUE,
                    scope jsonb, status(PENDING|RUNNING|COMPLETED|FAILED|ROLLED_BACK),
                    total_students, created_count, skipped_count, failed_count,
                    cursor, error jsonb, started_at, finished_at, run_by
                    -- a run is previewable and reversible while every voucher in it is unpaid

payments           id, school_id, receipt_no UNIQUE(school_id, receipt_no), student_id,
                   amount_minor, method(CASH|BANK|CHEQUE|ONLINE|ADJUSTMENT),
                   provider, provider_ref, bank_slip_no, paid_on, received_by,
                   status(PENDING|CONFIRMED|BOUNCED|REVERSED), reversed_by_payment_id,
                   idempotency_key, note
payment_allocations id, school_id, payment_id, voucher_id, amount_minor
                    -- one payment may settle several vouchers (arrears clearing)
security_deposits  id, school_id, student_id, amount_minor, received_on, payment_id,
                   status(HELD|REFUNDED|FORFEITED|ADJUSTED),
                   refunded_on, refund_payment_id, note
fee_waivers        id, school_id, student_id, voucher_id NULL, fee_head_id NULL,
                   amount_minor, reason, requested_by, approved_by, approved_at, status
```

### Invariants the database enforces
1. `UNIQUE(school_id, student_id, billing_period_id)` on `fee_vouchers` — **a student cannot be
   billed twice for one period.** This one constraint prevents the single worst class of bug.
2. `net_payable_minor = gross - discount - waiver + arrears + late_fee` — CHECK constraint.
3. `balance_minor = net_payable_minor - paid_minor` — generated column.
4. `paid_minor <= net_payable_minor` — CHECK. Overpayment becomes a `student_credits` row, not a
   negative balance.
5. `SUM(payment_allocations.amount) = payments.amount` — enforced in the service transaction and
   verified by a nightly consistency job.
6. A voucher with `status = PAID` cannot be updated except to `REVERSED` via an explicit reversal.

---

## 7. Finance

```
expense_categories id, school_id, name, parent_id, gl_code, is_active
expenses           id, school_id, voucher_no, category_id, payee, amount_minor,
                   method, paid_on, reference, description, attachment_key,
                   status(DRAFT|APPROVED|PAID|VOID), approved_by, created_by
income_categories  id, school_id, name, is_active
other_income       id, school_id, category_id, source, amount_minor, received_on, method, reference
bank_accounts      id, school_id, title, bank_name, account_no (masked), iban, opening_balance_minor
cash_transactions  id, school_id, account_id NULL, direction(IN|OUT), source_type, source_id,
                   amount_minor, occurred_on, description
                   -- the unified day-book: every payment and expense writes one row here
bank_reconciliations id, school_id, account_id, statement_date, file_key, status,
                     matched_count, unmatched_count
```

`cash_transactions` is the seam that lets a real double-entry general ledger be added in v2 without
reworking the fee module. Every money-moving service writes to it in the same transaction.

---

## 8. Attendance

```
attendance_records  id, school_id, session_id, student_id, section_id, date,
                    status(PRESENT|ABSENT|LATE|LEAVE|HALF_DAY|EXCUSED),
                    period_no NULL, marked_by, marked_at, note
                    UNIQUE(school_id, student_id, date, COALESCE(period_no,0))
                    PARTITION BY RANGE (date)          ← monthly partitions from day one
attendance_locks    id, school_id, section_id, date, locked_by, locked_at
staff_attendance    id, school_id, staff_id, date, status, check_in, check_out, note
leave_types         id, school_id, name, applies_to(STUDENT|STAFF), annual_quota, is_paid
leave_requests      id, school_id, subject_type, subject_id, leave_type_id,
                    from_date, to_date, days, reason, attachment_key,
                    status(PENDING|APPROVED|REJECTED|CANCELLED), decided_by, decided_at
```

Partitioning `attendance_records` by month is decided now because retrofitting a partition on a
10M-row table in production is a maintenance window you do not want.

---

## 9. Exams (v1.1 — schema declared now so reports can be designed against it)

```
exam_terms      id, school_id, session_id, name ("Mid Term"), start_date, end_date, weight, status
exams           id, school_id, exam_term_id, class_level_id, subject_id, date,
                total_marks, passing_marks, weight
exam_results    id, school_id, exam_id, student_id, marks_obtained, is_absent,
                grade, remarks, entered_by, entered_at
                UNIQUE(school_id, exam_id, student_id)
grading_schemes id, school_id, name, bands jsonb   -- [{min:80,grade:"A+",gpa:4.0}, …]
report_cards    id, school_id, session_id, exam_term_id, student_id, generated_at,
                payload jsonb, pdf_key, published_at
```

---

## 10. Workflow & communication

```
request_types    id, school_id, code, name, form_schema jsonb, approval_chain jsonb, is_active
requests         id, school_id, type_id, requester_user_id, subject_type, subject_id,
                 payload jsonb, status(DRAFT|SUBMITTED|IN_REVIEW|APPROVED|REJECTED|CANCELLED),
                 current_step, due_at
request_actions  id, school_id, request_id, step, actor_user_id, action, note, at
notifications    id, school_id, user_id, type, title, body, link, read_at, created_at
message_templates id, school_id, code, channel(EMAIL|SMS|WHATSAPP|INAPP), subject, body,
                  variables jsonb, is_active
message_log      id, school_id, channel, template_code, to_address, subject, body_snapshot,
                 status(QUEUED|SENT|DELIVERED|FAILED|READ), provider_ref, cost_minor,
                 related_type, related_id, sent_at, error
```

`request_types.form_schema` + `approval_chain` means a school can define "Transfer Certificate
Request" or "Fee Refund Request" itself, with its own approval path. Again: configuration, not code.

---

## 11. Reporting & system

```
saved_views     id, school_id, user_id NULL, entity, name, filters jsonb, columns jsonb, is_shared
export_jobs     id, school_id, requested_by, entity, format(XLSX|PDF|CSV), filters jsonb,
                status, file_key, row_count, error, requested_at, completed_at
job_runs        id, school_id NULL, name, idempotency_key UNIQUE, status, cursor,
                stats jsonb, error jsonb, started_at, finished_at
settings        id, school_id, key, value jsonb   UNIQUE(school_id, key)
number_sequences id, school_id, key ("voucher","receipt","admission"), prefix, next_value, padding
                 UNIQUE(school_id, key)
```

`number_sequences` is allocated inside the same transaction using `SELECT … FOR UPDATE`, so voucher
and receipt numbers are gapless per school. Do not use a global sequence — school A must not be able
to infer school B's volume from its receipt numbers.

---

## 12. Indexing plan (first pass)

Every index leads with `school_id`.

```sql
CREATE INDEX ON students            (school_id, status, last_name);
CREATE INDEX ON enrollments         (school_id, session_id, section_id);
CREATE INDEX ON fee_vouchers        (school_id, billing_period_id, status);
CREATE INDEX ON fee_vouchers        (school_id, student_id, issue_date DESC);
CREATE INDEX ON fee_vouchers        (school_id, status, due_date) WHERE status IN ('ISSUED','PARTIALLY_PAID','OVERDUE');
CREATE INDEX ON payments            (school_id, paid_on DESC);
CREATE INDEX ON payment_allocations (school_id, voucher_id);
CREATE INDEX ON attendance_records  (school_id, section_id, date);
CREATE INDEX ON attendance_records  (school_id, student_id, date DESC);
CREATE INDEX ON audit_logs          (school_id, entity_type, entity_id, at DESC);
-- fuzzy student search
CREATE EXTENSION pg_trgm;
CREATE INDEX ON students USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
```

## 13. Seed data for a new school

Onboarding inserts sane defaults so the school is usable in minutes, not days:
one active academic session · class levels Nursery→Grade 10 · sections A/B ·
fee heads (Tuition, Admission, Exam, Transport, Security Deposit) · expense categories
(Salaries, Utilities, Rent, Maintenance, Supplies) · leave types · default roles ·
default message templates · a `voucher`/`receipt`/`admission` number sequence.

Non-negotiable: **a school that has just been created must be able to admit a student and generate
a voucher without configuring anything.** Defaults are a product feature.
