-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "agenciers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(100),
    "name" VARCHAR(255),
    "email" VARCHAR(255),
    "mobile" VARCHAR(255),
    "license_no" VARCHAR(255),
    "vat_no" VARCHAR(255),
    "address" VARCHAR(255),
    "balance" DECIMAL(15,4),
    "logo" TEXT,
    "status" CHAR(5),
    "country_id" INTEGER,
    "owner_name" VARCHAR(255),
    "owner_mobile" VARCHAR(255),
    "owner_email" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "signature" TEXT,
    "bank_account_name" VARCHAR(200),
    "bank_account_no" VARCHAR(200),
    "bank_name" VARCHAR(200),
    "bank_branch_name" VARCHAR(200),
    "bank_iban_no" VARCHAR(200),
    "bank_swift_no" VARCHAR(200),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "agenciers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agencies" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "candidate_id" INTEGER,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(100),
    "name" VARCHAR(100),
    "email" VARCHAR(250),
    "secondary_email" VARCHAR(250),
    "mobile" VARCHAR(250),
    "secondary_mobile" VARCHAR(250),
    "emergency_mobile" VARCHAR(250),
    "bid" VARCHAR(250),
    "bid_file_path" VARCHAR(255),
    "nid" VARCHAR(250),
    "nid_file_path" VARCHAR(255),
    "passport_no" VARCHAR(250),
    "passport_issue_date" DATE,
    "passport_expire_date" DATE,
    "passport_file_path" VARCHAR(250),
    "dob" DATE,
    "full_photo_file_path" VARCHAR(255),
    "half_photo_file_path" VARCHAR(255),
    "father_name" VARCHAR(50),
    "mother_name" VARCHAR(50),
    "nationality" VARCHAR(20),
    "gender" VARCHAR(20),
    "blood_group" VARCHAR(20),
    "present_address_house" VARCHAR(200),
    "present_address_road" VARCHAR(20),
    "present_address_village" VARCHAR(20),
    "present_address_post" VARCHAR(20),
    "present_address_thana_id" INTEGER,
    "present_address_district_id" INTEGER,
    "present_address_division_id" INTEGER,
    "permanent_address_house" VARCHAR(200),
    "permanent_address_road" VARCHAR(20),
    "permanent_address_village" VARCHAR(20),
    "permanent_address_post" VARCHAR(20),
    "permanent_address_thana_id" INTEGER,
    "permanent_address_district_id" INTEGER,
    "permanent_address_division_id" INTEGER,
    "basic_info_career" VARCHAR(250),
    "basic_info_special" VARCHAR(250),
    "other_skills" VARCHAR(250),
    "balance" DECIMAL(15,4),
    "cv_file_path" VARCHAR(250),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" SERIAL NOT NULL,
    "group_id" VARCHAR(250),
    "topic" VARCHAR(250),
    "message" VARCHAR(250),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "anounce_date" DATE,
    "anounce_date_end" DATE,
    "file_path" VARCHAR(255),

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_class_groups" (
    "id" SERIAL NOT NULL,
    "announcement_id" INTEGER,
    "class_group_id" INTEGER,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "announcement_class_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arcs" (
    "id" SERIAL NOT NULL,
    "issue_date" DATE,
    "expire_date" DATE,
    "is_lifetime" CHAR(5),
    "status" CHAR(5),
    "candidate_id" INTEGER,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "acr_file_path" VARCHAR(255),
    "arc_number" VARCHAR(255),

    CONSTRAINT "arcs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_list" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "attribute_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "attribute_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(100),
    "name" VARCHAR(100),
    "email" VARCHAR(250),
    "secondary_email" VARCHAR(250),
    "mobile" VARCHAR(250),
    "secondary_mobile" VARCHAR(250),
    "emergency_mobile" VARCHAR(250),
    "bid" VARCHAR(250),
    "bid_file_path" TEXT,
    "nid" VARCHAR(250),
    "nid_file_path" VARCHAR(255),
    "passport_no" VARCHAR(250),
    "passport_issue_date" DATE,
    "passport_expire_date" DATE,
    "passport_file_path" TEXT,
    "dob" DATE,
    "full_photo_file_path" TEXT,
    "half_photo_file_path" TEXT,
    "father_name" VARCHAR(250),
    "mother_name" VARCHAR(250),
    "nationality" VARCHAR(250),
    "gender" VARCHAR(20),
    "blood_group" VARCHAR(20),
    "present_address_house" VARCHAR(200),
    "present_address_road" VARCHAR(20),
    "present_address_village" VARCHAR(20),
    "present_address_post" VARCHAR(20),
    "present_address_thana_id" INTEGER,
    "present_address_district_id" INTEGER,
    "present_address_division_id" INTEGER,
    "permanent_address_house" VARCHAR(200),
    "permanent_address_road" VARCHAR(20),
    "permanent_address_village" VARCHAR(20),
    "permanent_address_post" VARCHAR(20),
    "permanent_address_thana_id" INTEGER,
    "permanent_address_district_id" INTEGER,
    "permanent_address_division_id" INTEGER,
    "basic_info_career" TEXT,
    "basic_info_special" TEXT,
    "other_skills" TEXT,
    "balance" DECIMAL(15,4),
    "cv_file_path" TEXT,
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "agent_id" INTEGER,
    "class_group_id" INTEGER,
    "remarks" VARCHAR(255),
    "replacement_remarks" TEXT,
    "admission_payment_id" INTEGER,
    "final_group_payment_id" INTEGER,
    "medical_fee_payment_id" INTEGER,
    "abroad_ex" INTEGER,
    "local_ex" INTEGER,
    "drive_link" VARCHAR(250),
    "facebook_link" VARCHAR(250),
    "youtube_link" VARCHAR(250),
    "linkedin_link" TEXT,
    "twitter_link" VARCHAR(250),
    "instagram_link" VARCHAR(250),
    "position" VARCHAR(250),
    "skill_certificate_file_path" TEXT,
    "height" VARCHAR(100),
    "weight" VARCHAR(100),
    "marital_status" VARCHAR(100),
    "expertise" TEXT,
    "skills" TEXT,
    "extra_curricular" TEXT,
    "interest" TEXT,
    "attribute" TEXT,
    "companier_id" INTEGER,
    "agencier_id" INTEGER,
    "stamp_file_path" TEXT,
    "position_id" INTEGER,
    "company_status" VARCHAR(200),
    "sub_agent_id" INTEGER,
    "country_id" INTEGER,
    "replaced_by_candidate_id" INTEGER,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_documents" (
    "id" SERIAL NOT NULL,
    "candidate_id" INTEGER,
    "document_type_id" INTEGER,
    "document_no" VARCHAR(255),
    "issue_type" VARCHAR(255),
    "issue_date" DATE,
    "expire_date" DATE,
    "reason" VARCHAR(255),
    "file_path" VARCHAR(255),
    "status" CHAR(5),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "candidate_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "parent_id" INTEGER,
    "order" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_groups" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(250),
    "description" VARCHAR(250),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "code" VARCHAR(255),
    "fee_amount" DECIMAL(15,4),

    CONSTRAINT "class_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_schedules" (
    "id" SERIAL NOT NULL,
    "teacher_id" INTEGER,
    "class_group_id" INTEGER,
    "subject" VARCHAR(255),
    "start_time" VARCHAR(16),
    "end_time" VARCHAR(16),
    "week_day" VARCHAR(255),
    "status" CHAR(1),
    "created_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6),
    "updated_by" INTEGER,

    CONSTRAINT "class_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companiers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(100),
    "name" VARCHAR(255),
    "email" VARCHAR(255),
    "mobile" VARCHAR(255),
    "license_no" VARCHAR(255),
    "vat_no" VARCHAR(255),
    "address" VARCHAR(255),
    "balance" DECIMAL(15,4),
    "logo" TEXT,
    "status" CHAR(5),
    "country_id" INTEGER,
    "owner_name" VARCHAR(255),
    "owner_mobile" VARCHAR(255),
    "owner_email" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "companiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "candidate_id" INTEGER,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" SERIAL NOT NULL,
    "iso" CHAR(2) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "code_name" VARCHAR(80) NOT NULL,
    "iso3" CHAR(3),
    "num_code" INTEGER,
    "phone_code" INTEGER NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "id" SERIAL NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "status" CHAR(1),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "short_name" VARCHAR(255),
    "symbol" VARCHAR(255),
    "position" VARCHAR(255),

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curricular_list" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "curricular_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "curricular_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_rows" (
    "id" SERIAL NOT NULL,
    "data_type_id" INTEGER NOT NULL,
    "field" VARCHAR(255) NOT NULL,
    "type" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "required" INTEGER NOT NULL,
    "browse" INTEGER NOT NULL,
    "read" INTEGER NOT NULL,
    "edit" INTEGER NOT NULL,
    "add" INTEGER NOT NULL,
    "delete" INTEGER NOT NULL,
    "details" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "data_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_types" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "display_name_singular" VARCHAR(255) NOT NULL,
    "display_name_plural" VARCHAR(255) NOT NULL,
    "icon" VARCHAR(255),
    "model_name" VARCHAR(255),
    "policy_name" VARCHAR(255),
    "controller" VARCHAR(255),
    "description" VARCHAR(255),
    "generate_permissions" INTEGER NOT NULL,
    "server_side" INTEGER NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" SERIAL NOT NULL,
    "division_id" INTEGER,
    "name" VARCHAR(25) NOT NULL,
    "bn_name" VARCHAR(25) NOT NULL,
    "lat" VARCHAR(15),
    "lon" VARCHAR(15),
    "url" VARCHAR(50) NOT NULL,
    "verification_status" VARCHAR(40) NOT NULL DEFAULT 'source',

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divisions" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(25) NOT NULL,
    "bn_name" VARCHAR(25) NOT NULL,
    "url" VARCHAR(50) NOT NULL,

    CONSTRAINT "divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "serial_no" INTEGER,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educations" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "exam_name" VARCHAR(250),
    "institute_name" VARCHAR(250),
    "subject_group_major" VARCHAR(250),
    "education_label" VARCHAR(250),
    "start_date" DATE,
    "end_date" DATE,
    "duration_year" INTEGER,
    "result_type" VARCHAR(250),
    "result" VARCHAR(250),
    "achievements" VARCHAR(250),
    "certificate_file_path" VARCHAR(250),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "board_name" VARCHAR(200),
    "scale" VARCHAR(200),
    "passing_year" VARCHAR(200),

    CONSTRAINT "educations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(100),
    "name" VARCHAR(250),
    "email" VARCHAR(250),
    "mobile" VARCHAR(255),
    "nid" VARCHAR(255),
    "nid_file_path" VARCHAR(255),
    "passport_no" VARCHAR(255),
    "passport_issue_date" DATE,
    "passport_expire_date" DATE,
    "passport_file_path" VARCHAR(255),
    "dob" DATE,
    "full_photo_file_path" VARCHAR(255),
    "half_photo_file_path" VARCHAR(255),
    "father_name" VARCHAR(255),
    "mother_name" VARCHAR(255),
    "nationality" VARCHAR(255),
    "gender" VARCHAR(255),
    "blood_group" VARCHAR(255),
    "present_address_house" VARCHAR(200),
    "permanent_address_house" VARCHAR(200),
    "cv_file_path" VARCHAR(250),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(100),
    "name" VARCHAR(250),
    "email" VARCHAR(250),
    "mobile" VARCHAR(255),
    "nid" VARCHAR(255),
    "nid_file_path" VARCHAR(255),
    "passport_no" VARCHAR(255),
    "passport_issue_date" DATE,
    "passport_expire_date" DATE,
    "passport_file_path" VARCHAR(255),
    "dob" DATE,
    "full_photo_file_path" VARCHAR(255),
    "half_photo_file_path" VARCHAR(255),
    "father_name" VARCHAR(255),
    "mother_name" VARCHAR(255),
    "nationality" VARCHAR(255),
    "gender" VARCHAR(255),
    "blood_group" VARCHAR(255),
    "present_address_house" VARCHAR(200),
    "permanent_address_house" VARCHAR(200),
    "cv_file_path" VARCHAR(250),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "employers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employer_candidates" (
    "id" SERIAL NOT NULL,
    "employer_id" INTEGER,
    "candidate_id" INTEGER,
    "purpose" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "employer_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "euro_to_bdt_rates" (
    "id" SERIAL NOT NULL,
    "conversion_date" DATE,
    "euro_rate" DECIMAL(18,6),
    "updated_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMPTZ(6),
    "ref_link" VARCHAR(255),
    "description" VARCHAR(255),

    CONSTRAINT "euro_to_bdt_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "exam_date" DATE,
    "exam_time" VARCHAR(16),
    "class_group_id" VARCHAR(200),
    "status" CHAR(5),
    "remarks" TEXT,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "exam_link" TEXT,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_results" (
    "id" SERIAL NOT NULL,
    "exam_id" INTEGER,
    "candidate_id" INTEGER,
    "abroad_ex" INTEGER,
    "local_ex" INTEGER,
    "bl" INTEGER,
    "skill" INTEGER,
    "english" INTEGER,
    "class_group_id" VARCHAR(200),
    "result" CHAR(5),
    "remarks" VARCHAR(255),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiences" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "company_name" VARCHAR(250),
    "company_address" VARCHAR(250),
    "country_id" VARCHAR(250),
    "designation" VARCHAR(250),
    "department" VARCHAR(250),
    "start_date" DATE,
    "end_date" DATE,
    "responsibilities" TEXT,
    "expertise" TEXT,
    "descriptions" TEXT,
    "achievements" VARCHAR(250),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expertise_list" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "expertise_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "expertise_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_schedules" (
    "id" SERIAL NOT NULL,
    "airlinece_name" VARCHAR(255),
    "flight_date" DATE,
    "flight_time" VARCHAR(16),
    "ticket_file_path" VARCHAR(255),
    "arrival_seal_page_file_path" VARCHAR(255),
    "candidate_id" INTEGER,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "departure_time" VARCHAR(16),
    "arrival_time" VARCHAR(16),

    CONSTRAINT "flight_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interest_list" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "interest_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "interest_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "invoice_no" VARCHAR(100),
    "issue_date" DATE,
    "agenciers_id" INTEGER,
    "companier_id" INTEGER,
    "service" VARCHAR(100),
    "country_id" INTEGER,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "owner_name" VARCHAR(255),
    "status" CHAR(5),
    "bank_account_name" VARCHAR(250),
    "bank_account_no" VARCHAR(250),
    "bank_name" VARCHAR(250),
    "bank_branch_name" VARCHAR(250),
    "bank_swift_no" VARCHAR(250),
    "bank_iban_no" VARCHAR(250),
    "old_invoice_no" VARCHAR(200),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_candidates" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER,
    "candidate_id" INTEGER,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "invoice_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_heads" (
    "id" SERIAL NOT NULL,
    "description" VARCHAR(100),
    "vat_rate" DECIMAL(18,6),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "invoice_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER,
    "invoice_head_id" INTEGER,
    "description" VARCHAR(100),
    "quantity" INTEGER,
    "unit_price" DECIMAL(15,4),
    "sub_total_amount" DECIMAL(15,4),
    "vat_rate" DECIMAL(18,6),
    "vat_amount" DECIMAL(15,4),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "total_amount" DECIMAL(15,4),

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_money_receipts" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER,
    "receipt_no" VARCHAR(100),
    "received_from" VARCHAR(255),
    "hotel" VARCHAR(255),
    "amount" DECIMAL(15,4),
    "received_for" VARCHAR(255),
    "receipt_date" DATE,
    "recipient" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "payment_method" VARCHAR(255),
    "transaction_no" VARCHAR(255),

    CONSTRAINT "invoice_money_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labour_contracts" (
    "id" SERIAL NOT NULL,
    "issue_date" DATE,
    "expire_date" DATE,
    "document_file_path" VARCHAR(255),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "candidate_id" INTEGER,

    CONSTRAINT "labour_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "language_list" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "language_name" VARCHAR(255),
    "language_status" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "language_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licenses" (
    "id" SERIAL NOT NULL,
    "license_no" VARCHAR(255) NOT NULL,
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "companier_id" INTEGER,
    "license_start_date" DATE,
    "license_expire_date" DATE,
    "license_file_path" TEXT,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_positions" (
    "id" SERIAL NOT NULL,
    "license_id" INTEGER NOT NULL,
    "position_id" INTEGER NOT NULL,
    "quantity" INTEGER,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "license_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_status" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255),
    "description" VARCHAR(255),
    "step_no" INTEGER,
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "live_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manpower_trainings" (
    "id" SERIAL NOT NULL,
    "candidate_id" INTEGER NOT NULL,
    "certificate_issue_date" DATE,
    "certificate_expire_date" DATE,
    "certificate_file_path" VARCHAR(250),
    "manpower_file_path" VARCHAR(250),
    "finger_print_file_path" VARCHAR(250),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "training_start_date" DATE,
    "training_end_date" DATE,

    CONSTRAINT "manpower_trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicals" (
    "id" SERIAL NOT NULL,
    "issue_date" DATE,
    "expire_date" DATE,
    "status" CHAR(5),
    "document_file_path" VARCHAR(255),
    "candidate_id" INTEGER,
    "updated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6),
    "country_id" INTEGER,

    CONSTRAINT "medicals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" SERIAL NOT NULL,
    "menu_id" INTEGER,
    "title" VARCHAR(255) NOT NULL,
    "url" VARCHAR(255) NOT NULL,
    "target" VARCHAR(255) NOT NULL,
    "icon_class" VARCHAR(255),
    "color" VARCHAR(255),
    "parent_id" INTEGER,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "route" VARCHAR(255),
    "parameters" TEXT,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "title" TEXT,
    "message" TEXT,
    "redirect_url" VARCHAR(255),
    "is_seen" CHAR(5),
    "group_id" INTEGER,
    "code" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_class_groups" (
    "id" SERIAL NOT NULL,
    "notification_id" INTEGER,
    "class_group_id" INTEGER,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_class_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" SERIAL NOT NULL,
    "author_id" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "excerpt" TEXT,
    "body" TEXT,
    "image" VARCHAR(255),
    "slug" VARCHAR(255) NOT NULL,
    "meta_description" TEXT,
    "meta_keywords" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(250),
    "type" CHAR(50),
    "agent_id" INTEGER,
    "sub_agent_id" INTEGER,
    "candidate_id" INTEGER,
    "teacher_id" INTEGER,
    "employee_id" INTEGER,
    "employer_id" INTEGER,
    "amount" DECIMAL(15,4),
    "payment_date" DATE,
    "invoice_no" VARCHAR(250),
    "bank_name" VARCHAR(250),
    "acc_no" VARCHAR(250),
    "trx_no" VARCHAR(250),
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "user_id" INTEGER,
    "cheque_file_path" VARCHAR(255),
    "remarks" VARCHAR(255),
    "account_name" VARCHAR(255),
    "currency_id" INTEGER,
    "exchange_rate" DECIMAL(18,6),
    "payment_method" VARCHAR(255),
    "payment_receiver" VARCHAR(255),
    "payment_received_location" VARCHAR(255),
    "payment_time" VARCHAR(16),
    "description" TEXT,
    "request_id" INTEGER,
    "dev_remarks" VARCHAR(250),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" SERIAL NOT NULL,
    "bill_title" VARCHAR(255),
    "agent_id" INTEGER,
    "group_id" INTEGER,
    "candidate_id" INTEGER,
    "amount" DECIMAL(15,4),
    "status" CHAR(5),
    "payment_id" INTEGER,
    "remarks" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "table_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_role" (
    "permission_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,

    CONSTRAINT "permission_role_pkey" PRIMARY KEY ("permission_id","role_id")
);

-- CreateTable
CREATE TABLE "police_clearances" (
    "id" SERIAL NOT NULL,
    "candidate_id" INTEGER NOT NULL,
    "thana_id" INTEGER,
    "issue_date" DATE,
    "expire_date" DATE,
    "photo_file_path" VARCHAR(250),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "country_id" INTEGER,

    CONSTRAINT "police_clearances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" SERIAL NOT NULL,
    "author_id" INTEGER NOT NULL,
    "category_id" INTEGER,
    "title" VARCHAR(255) NOT NULL,
    "seo_title" VARCHAR(255),
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "image" VARCHAR(255),
    "slug" VARCHAR(255) NOT NULL,
    "meta_description" TEXT,
    "meta_keywords" TEXT,
    "status" TEXT NOT NULL,
    "featured" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_certificates" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(250),
    "institute_name" VARCHAR(250),
    "topics" VARCHAR(250),
    "start_date" DATE,
    "end_date" DATE,
    "duration" INTEGER,
    "duration_type" VARCHAR(10),
    "country_id" VARCHAR(250),
    "descriptions" VARCHAR(250),
    "achievements" VARCHAR(250),
    "certificate_issue_date" DATE,
    "certificate_expire_date" DATE,
    "certificate_file_path" VARCHAR(250),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "updated_by" INTEGER,

    CONSTRAINT "professional_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255),
    "description" VARCHAR(255),
    "params" TEXT,
    "status" CHAR(1),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "report_uri" VARCHAR(255),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selected_candidates" (
    "id" SERIAL NOT NULL,
    "candidate_id" INTEGER,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "position" VARCHAR(255),

    CONSTRAINT "selected_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "value" TEXT,
    "details" TEXT,
    "type" VARCHAR(255) NOT NULL,
    "order" INTEGER NOT NULL,
    "group" VARCHAR(255),

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(250),
    "institute_name" VARCHAR(250),
    "details" VARCHAR(250),
    "result_score" DECIMAL(16,6),
    "certificate_file_path" VARCHAR(250),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "exam_score" DECIMAL(16,6),

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_list" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "skill_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "skill_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_agents" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(100),
    "agent_id" INTEGER NOT NULL,
    "name" VARCHAR(100),
    "email" VARCHAR(250),
    "secondary_email" VARCHAR(250),
    "mobile" VARCHAR(250),
    "secondary_mobile" VARCHAR(250),
    "emergency_mobile" VARCHAR(250),
    "bid" VARCHAR(250),
    "bid_file_path" VARCHAR(255),
    "nid" VARCHAR(250),
    "nid_file_path" VARCHAR(255),
    "passport_no" VARCHAR(250),
    "passport_issue_date" DATE,
    "passport_expire_date" DATE,
    "passport_file_path" VARCHAR(250),
    "dob" DATE,
    "full_photo_file_path" VARCHAR(255),
    "half_photo_file_path" VARCHAR(255),
    "father_name" VARCHAR(50),
    "mother_name" VARCHAR(50),
    "nationality" VARCHAR(20),
    "gender" VARCHAR(20),
    "blood_group" VARCHAR(20),
    "present_address_house" VARCHAR(200),
    "present_address_road" VARCHAR(20),
    "present_address_village" VARCHAR(20),
    "present_address_post" VARCHAR(20),
    "present_address_thana_id" INTEGER,
    "present_address_district_id" INTEGER,
    "present_address_division_id" INTEGER,
    "permanent_address_house" VARCHAR(200),
    "permanent_address_road" VARCHAR(20),
    "permanent_address_village" VARCHAR(20),
    "permanent_address_post" VARCHAR(20),
    "permanent_address_thana_id" INTEGER,
    "permanent_address_district_id" INTEGER,
    "permanent_address_division_id" INTEGER,
    "basic_info_career" VARCHAR(250),
    "basic_info_special" VARCHAR(250),
    "other_skills" VARCHAR(250),
    "balance" DECIMAL(15,4),
    "cv_file_path" VARCHAR(250),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sub_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_agent_payment_requests" (
    "id" SERIAL NOT NULL,
    "bill_title" VARCHAR(255),
    "sub_agent_id" INTEGER,
    "group_id" INTEGER,
    "candidate_id" INTEGER,
    "amount" DECIMAL(15,4),
    "status" CHAR(5),
    "payment_id" INTEGER,
    "remarks" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "sub_agent_payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(100),
    "name" VARCHAR(100),
    "email" VARCHAR(200),
    "secondary_email" VARCHAR(255),
    "mobile" VARCHAR(255),
    "secondary_mobile" VARCHAR(255),
    "emergency_mobile" VARCHAR(255),
    "bid" VARCHAR(255),
    "bid_file_path" VARCHAR(255),
    "nid" VARCHAR(255),
    "nid_file_path" VARCHAR(255),
    "passport_no" VARCHAR(255),
    "passport_issue_date" DATE,
    "passport_expire_date" DATE,
    "passport_file_path" VARCHAR(255),
    "dob" DATE,
    "full_photo_file_path" VARCHAR(255),
    "half_photo_file_path" VARCHAR(255),
    "father_name" VARCHAR(50),
    "mother_name" VARCHAR(50),
    "nationality" VARCHAR(20),
    "gender" VARCHAR(20),
    "blood_group" VARCHAR(20),
    "present_address_house" VARCHAR(200),
    "present_address_road" VARCHAR(20),
    "present_address_village" VARCHAR(20),
    "present_address_post" VARCHAR(20),
    "present_address_thana_id" INTEGER,
    "present_address_district_id" INTEGER,
    "present_address_division_id" INTEGER,
    "permanent_address_house" VARCHAR(200),
    "permanent_address_road" VARCHAR(20),
    "permanent_address_village" VARCHAR(20),
    "permanent_address_post" VARCHAR(20),
    "permanent_address_thana_id" INTEGER,
    "permanent_address_district_id" INTEGER,
    "permanent_address_division_id" INTEGER,
    "basic_info_career" TEXT,
    "basic_info_special" TEXT,
    "other_skills" VARCHAR(250),
    "balance" DECIMAL(15,4),
    "cv_file_path" VARCHAR(250),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temp_candidates" (
    "code" VARCHAR(100),
    "name" VARCHAR(255),
    "email" VARCHAR(255),
    "mobile" VARCHAR(255),
    "passport_no" VARCHAR(255),
    "agent_code" VARCHAR(255),
    "agent_id" INTEGER,
    "class_group_id" INTEGER,
    "id" SERIAL NOT NULL,

    CONSTRAINT "temp_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thanas" (
    "id" SERIAL NOT NULL,
    "district_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "bn_name" VARCHAR(255) NOT NULL,
    "url" VARCHAR(255) NOT NULL,

    CONSTRAINT "thanas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_companies" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(100),
    "name" VARCHAR(255),
    "email" VARCHAR(255),
    "mobile" VARCHAR(255),
    "address" VARCHAR(255),
    "logo" TEXT,
    "status" CHAR(5),
    "country_id" INTEGER,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "bank_account_name_1" VARCHAR(255),
    "bank_account_no_1" VARCHAR(255),
    "bank_name_1" VARCHAR(255),
    "bank_branch_name_1" VARCHAR(255),
    "bank_swift_no_1" VARCHAR(255),
    "bank_iban_no_1" VARCHAR(255),
    "bank_account_name_2" VARCHAR(255),
    "bank_account_no_2" VARCHAR(255),
    "bank_name_2" VARCHAR(255),
    "bank_branch_name_2" VARCHAR(255),
    "bank_swift_no_2" VARCHAR(255),
    "bank_iban_no_2" VARCHAR(255),
    "signature" TEXT,

    CONSTRAINT "ticket_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_invoices" (
    "id" SERIAL NOT NULL,
    "invoice_no" VARCHAR(250),
    "invoice_date" DATE,
    "ticket_company_id" INTEGER,
    "bill_to" VARCHAR(100),
    "companier_id" INTEGER,
    "agencier_id" INTEGER,
    "agency_id" INTEGER,
    "agent_id" INTEGER,
    "candidate_id" INTEGER,
    "bill_to_name" VARCHAR(255),
    "bill_to_code" VARCHAR(255),
    "bill_to_email" VARCHAR(255),
    "bill_to_mobile" VARCHAR(255),
    "bill_to_address" VARCHAR(255),
    "bill_to_terms" VARCHAR(255),
    "route_from" VARCHAR(255),
    "route_to" VARCHAR(255),
    "airline" VARCHAR(255),
    "ticket_no" VARCHAR(255),
    "flight_date" DATE,
    "flight_time" VARCHAR(16),
    "currency" VARCHAR(255),
    "subtotal" DECIMAL(16,6),
    "tax_rate" DECIMAL(18,6),
    "tax_amount" DECIMAL(15,4),
    "total" DECIMAL(16,6),
    "bank_account_name_1" VARCHAR(255),
    "bank_account_no_1" VARCHAR(255),
    "bank_name_1" VARCHAR(255),
    "bank_branch_name_1" VARCHAR(255),
    "bank_swift_no_1" VARCHAR(255),
    "bank_iban_no_1" VARCHAR(255),
    "bank_account_name_2" VARCHAR(255),
    "bank_account_no_2" VARCHAR(255),
    "bank_name_2" VARCHAR(255),
    "bank_branch_name_2" VARCHAR(255),
    "bank_swift_no_2" VARCHAR(255),
    "bank_iban_no_2" VARCHAR(255),
    "status" CHAR(5),
    "remarks" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "canceled_at" TIMESTAMPTZ(6),
    "canceled_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "ticket_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_invoice_lines" (
    "id" SERIAL NOT NULL,
    "ticket_invoice_id" INTEGER,
    "candidate_id" INTEGER,
    "name" VARCHAR(255),
    "passport_no" VARCHAR(100),
    "remarks" VARCHAR(255),
    "quantity" INTEGER,
    "unit_price" DECIMAL(15,4),
    "total_amount" DECIMAL(15,4),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "is_candidate" VARCHAR(100),

    CONSTRAINT "ticket_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_invoice_money_receipts" (
    "id" SERIAL NOT NULL,
    "ticket_invoice_id" INTEGER,
    "receipt_no" VARCHAR(100),
    "received_from" VARCHAR(255),
    "hotel" VARCHAR(255),
    "amount" DECIMAL(15,4),
    "received_for" VARCHAR(255),
    "receipt_date" DATE,
    "recipient" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "payment_method" VARCHAR(255),
    "transaction_no" VARCHAR(255),
    "remarks" VARCHAR(255),

    CONSTRAINT "ticket_invoice_money_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainings" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(250),
    "institute_name" VARCHAR(250),
    "topics" VARCHAR(250),
    "start_date" DATE,
    "end_date" DATE,
    "duration" INTEGER,
    "duration_type" VARCHAR(10),
    "country_id" VARCHAR(250),
    "descriptions" VARCHAR(250),
    "achievements" VARCHAR(250),
    "certificate_file_path" VARCHAR(250),
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "address" VARCHAR(200),

    CONSTRAINT "trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translations" (
    "id" SERIAL NOT NULL,
    "table_name" VARCHAR(255) NOT NULL,
    "column_name" VARCHAR(255) NOT NULL,
    "foreign_key" INTEGER NOT NULL,
    "locale" VARCHAR(255) NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unions" (
    "id" SERIAL NOT NULL,
    "upazilla_id" INTEGER NOT NULL,
    "name" VARCHAR(25) NOT NULL,
    "bn_name" VARCHAR(25) NOT NULL,
    "url" VARCHAR(50) NOT NULL,

    CONSTRAINT "unions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upazilas" (
    "id" SERIAL NOT NULL,
    "district_id" INTEGER NOT NULL,
    "name" VARCHAR(25) NOT NULL,
    "bn_name" VARCHAR(25) NOT NULL,
    "url" VARCHAR(50) NOT NULL,

    CONSTRAINT "upazilas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "avatar" VARCHAR(255),
    "email_verified_at" TIMESTAMPTZ(6),
    "password" VARCHAR(255) NOT NULL,
    "remember_token" VARCHAR(100),
    "settings" TEXT,
    "user_type_id" INTEGER,
    "agent_id" INTEGER,
    "sub_agent_id" INTEGER,
    "teacher_id" INTEGER,
    "employee_id" INTEGER,
    "candidate_id" INTEGER,
    "employer_id" INTEGER,
    "agencier_id" INTEGER,
    "companier_id" INTEGER,
    "status" CHAR(5),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "user_types" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" CHAR(1) NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visa_immigrations" (
    "id" SERIAL NOT NULL,
    "issue_date" DATE,
    "expire_date" DATE,
    "visa_mp_no" VARCHAR(255),
    "status" CHAR(5),
    "candidate_id" INTEGER,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "document_file_path" VARCHAR(255),

    CONSTRAINT "visa_immigrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(400),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" BIGSERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "ip" VARCHAR(64),
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" VARCHAR(64),
    "metadata" JSONB,
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" BIGSERIAL NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "run_after" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "result" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_runs" (
    "id" VARCHAR(64) NOT NULL,
    "source_file" VARCHAR(400) NOT NULL,
    "source_sha256" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "report" JSONB,

    CONSTRAINT "migration_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_table_results" (
    "id" BIGSERIAL NOT NULL,
    "run_id" VARCHAR(64) NOT NULL,
    "source_table" VARCHAR(120) NOT NULL,
    "target_table" VARCHAR(120) NOT NULL,
    "source_rows" INTEGER NOT NULL,
    "inserted_rows" INTEGER NOT NULL,
    "skipped_rows" INTEGER NOT NULL,
    "quarantined_rows" INTEGER NOT NULL,
    "transformed_rows" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_table_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_quarantine" (
    "id" BIGSERIAL NOT NULL,
    "run_id" VARCHAR(64) NOT NULL,
    "source_table" VARCHAR(120) NOT NULL,
    "source_pk" VARCHAR(120),
    "reason" VARCHAR(200) NOT NULL,
    "row_data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_quarantine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "id_maps" (
    "id" BIGSERIAL NOT NULL,
    "source_table" VARCHAR(120) NOT NULL,
    "source_id" VARCHAR(64) NOT NULL,
    "target_table" VARCHAR(120) NOT NULL,
    "target_id" VARCHAR(64) NOT NULL,
    "strategy" VARCHAR(40) NOT NULL,

    CONSTRAINT "id_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" BIGSERIAL NOT NULL,
    "owner_table" VARCHAR(80) NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "account_name" VARCHAR(250),
    "account_no" VARCHAR(250),
    "bank_name" VARCHAR(250),
    "branch_name" VARCHAR(250),
    "iban" VARCHAR(250),
    "swift" VARCHAR(250),
    "slot" VARCHAR(20) NOT NULL DEFAULT 'primary',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "snapshot_name" VARCHAR(120) NOT NULL,
    "source_id" INTEGER,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" VARCHAR(64) NOT NULL,
    "owner_table" VARCHAR(80),
    "owner_id" VARCHAR(64),
    "original_name" VARCHAR(255) NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agenciers_country_id_idx" ON "agenciers"("country_id");

-- CreateIndex
CREATE INDEX "agencies_candidate_id_idx" ON "agencies"("candidate_id");

-- CreateIndex
CREATE INDEX "agents_present_address_thana_id_idx" ON "agents"("present_address_thana_id");

-- CreateIndex
CREATE INDEX "agents_present_address_district_id_idx" ON "agents"("present_address_district_id");

-- CreateIndex
CREATE INDEX "agents_present_address_division_id_idx" ON "agents"("present_address_division_id");

-- CreateIndex
CREATE INDEX "agents_permanent_address_thana_id_idx" ON "agents"("permanent_address_thana_id");

-- CreateIndex
CREATE INDEX "agents_permanent_address_district_id_idx" ON "agents"("permanent_address_district_id");

-- CreateIndex
CREATE INDEX "agents_permanent_address_division_id_idx" ON "agents"("permanent_address_division_id");

-- CreateIndex
CREATE INDEX "announcements_group_id_idx" ON "announcements"("group_id");

-- CreateIndex
CREATE INDEX "announcement_class_groups_announcement_id_idx" ON "announcement_class_groups"("announcement_id");

-- CreateIndex
CREATE INDEX "announcement_class_groups_class_group_id_idx" ON "announcement_class_groups"("class_group_id");

-- CreateIndex
CREATE INDEX "arcs_candidate_id_idx" ON "arcs"("candidate_id");

-- CreateIndex
CREATE INDEX "attribute_list_user_id_idx" ON "attribute_list"("user_id");

-- CreateIndex
CREATE INDEX "candidates_created_at_idx" ON "candidates"("created_at");

-- CreateIndex
CREATE INDEX "candidates_agent_id_idx" ON "candidates"("agent_id");

-- CreateIndex
CREATE INDEX "candidates_class_group_id_idx" ON "candidates"("class_group_id");

-- CreateIndex
CREATE INDEX "candidates_companier_id_idx" ON "candidates"("companier_id");

-- CreateIndex
CREATE INDEX "candidates_agencier_id_idx" ON "candidates"("agencier_id");

-- CreateIndex
CREATE INDEX "candidates_replaced_by_candidate_id_idx" ON "candidates"("replaced_by_candidate_id");

-- CreateIndex
CREATE INDEX "candidates_present_address_thana_id_idx" ON "candidates"("present_address_thana_id");

-- CreateIndex
CREATE INDEX "candidates_present_address_district_id_idx" ON "candidates"("present_address_district_id");

-- CreateIndex
CREATE INDEX "candidates_present_address_division_id_idx" ON "candidates"("present_address_division_id");

-- CreateIndex
CREATE INDEX "candidates_permanent_address_thana_id_idx" ON "candidates"("permanent_address_thana_id");

-- CreateIndex
CREATE INDEX "candidates_permanent_address_district_id_idx" ON "candidates"("permanent_address_district_id");

-- CreateIndex
CREATE INDEX "candidates_permanent_address_division_id_idx" ON "candidates"("permanent_address_division_id");

-- CreateIndex
CREATE INDEX "candidates_admission_payment_id_idx" ON "candidates"("admission_payment_id");

-- CreateIndex
CREATE INDEX "candidates_final_group_payment_id_idx" ON "candidates"("final_group_payment_id");

-- CreateIndex
CREATE INDEX "candidates_medical_fee_payment_id_idx" ON "candidates"("medical_fee_payment_id");

-- CreateIndex
CREATE INDEX "candidates_position_id_idx" ON "candidates"("position_id");

-- CreateIndex
CREATE INDEX "candidates_sub_agent_id_idx" ON "candidates"("sub_agent_id");

-- CreateIndex
CREATE INDEX "candidates_country_id_idx" ON "candidates"("country_id");

-- CreateIndex
CREATE INDEX "candidate_documents_candidate_id_idx" ON "candidate_documents"("candidate_id");

-- CreateIndex
CREATE INDEX "candidate_documents_document_type_id_idx" ON "candidate_documents"("document_type_id");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "class_schedules_teacher_id_idx" ON "class_schedules"("teacher_id");

-- CreateIndex
CREATE INDEX "class_schedules_class_group_id_idx" ON "class_schedules"("class_group_id");

-- CreateIndex
CREATE INDEX "companiers_country_id_idx" ON "companiers"("country_id");

-- CreateIndex
CREATE INDEX "companies_candidate_id_idx" ON "companies"("candidate_id");

-- CreateIndex
CREATE INDEX "curricular_list_user_id_idx" ON "curricular_list"("user_id");

-- CreateIndex
CREATE INDEX "data_rows_data_type_id_idx" ON "data_rows"("data_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_types_name_key" ON "data_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "data_types_slug_key" ON "data_types"("slug");

-- CreateIndex
CREATE INDEX "districts_division_id_idx" ON "districts"("division_id");

-- CreateIndex
CREATE INDEX "educations_user_id_idx" ON "educations"("user_id");

-- CreateIndex
CREATE INDEX "employer_candidates_employer_id_idx" ON "employer_candidates"("employer_id");

-- CreateIndex
CREATE INDEX "employer_candidates_candidate_id_idx" ON "employer_candidates"("candidate_id");

-- CreateIndex
CREATE INDEX "exams_class_group_id_idx" ON "exams"("class_group_id");

-- CreateIndex
CREATE INDEX "exam_results_exam_id_idx" ON "exam_results"("exam_id");

-- CreateIndex
CREATE INDEX "exam_results_candidate_id_idx" ON "exam_results"("candidate_id");

-- CreateIndex
CREATE INDEX "exam_results_class_group_id_idx" ON "exam_results"("class_group_id");

-- CreateIndex
CREATE INDEX "experiences_user_id_idx" ON "experiences"("user_id");

-- CreateIndex
CREATE INDEX "experiences_country_id_idx" ON "experiences"("country_id");

-- CreateIndex
CREATE INDEX "expertise_list_user_id_idx" ON "expertise_list"("user_id");

-- CreateIndex
CREATE INDEX "flight_schedules_candidate_id_idx" ON "flight_schedules"("candidate_id");

-- CreateIndex
CREATE INDEX "interest_list_user_id_idx" ON "interest_list"("user_id");

-- CreateIndex
CREATE INDEX "invoices_agenciers_id_idx" ON "invoices"("agenciers_id");

-- CreateIndex
CREATE INDEX "invoices_companier_id_idx" ON "invoices"("companier_id");

-- CreateIndex
CREATE INDEX "invoices_country_id_idx" ON "invoices"("country_id");

-- CreateIndex
CREATE INDEX "invoice_candidates_invoice_id_idx" ON "invoice_candidates"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_candidates_candidate_id_idx" ON "invoice_candidates"("candidate_id");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_head_id_idx" ON "invoice_lines"("invoice_head_id");

-- CreateIndex
CREATE INDEX "invoice_money_receipts_invoice_id_idx" ON "invoice_money_receipts"("invoice_id");

-- CreateIndex
CREATE INDEX "labour_contracts_candidate_id_idx" ON "labour_contracts"("candidate_id");

-- CreateIndex
CREATE INDEX "language_list_user_id_idx" ON "language_list"("user_id");

-- CreateIndex
CREATE INDEX "licenses_companier_id_idx" ON "licenses"("companier_id");

-- CreateIndex
CREATE UNIQUE INDEX "licenses_license_no_key" ON "licenses"("license_no");

-- CreateIndex
CREATE INDEX "license_positions_license_id_idx" ON "license_positions"("license_id");

-- CreateIndex
CREATE INDEX "license_positions_position_id_idx" ON "license_positions"("position_id");

-- CreateIndex
CREATE INDEX "manpower_trainings_candidate_id_idx" ON "manpower_trainings"("candidate_id");

-- CreateIndex
CREATE INDEX "medicals_candidate_id_idx" ON "medicals"("candidate_id");

-- CreateIndex
CREATE INDEX "medicals_country_id_idx" ON "medicals"("country_id");

-- CreateIndex
CREATE UNIQUE INDEX "menus_name_key" ON "menus"("name");

-- CreateIndex
CREATE INDEX "menu_items_menu_id_idx" ON "menu_items"("menu_id");

-- CreateIndex
CREATE INDEX "menu_items_parent_id_idx" ON "menu_items"("parent_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_group_id_idx" ON "notifications"("group_id");

-- CreateIndex
CREATE INDEX "notification_class_groups_notification_id_idx" ON "notification_class_groups"("notification_id");

-- CreateIndex
CREATE INDEX "notification_class_groups_class_group_id_idx" ON "notification_class_groups"("class_group_id");

-- CreateIndex
CREATE INDEX "pages_author_id_idx" ON "pages"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "pages_slug_key" ON "pages"("slug");

-- CreateIndex
CREATE INDEX "payments_agent_id_idx" ON "payments"("agent_id");

-- CreateIndex
CREATE INDEX "payments_sub_agent_id_idx" ON "payments"("sub_agent_id");

-- CreateIndex
CREATE INDEX "payments_candidate_id_idx" ON "payments"("candidate_id");

-- CreateIndex
CREATE INDEX "payments_teacher_id_idx" ON "payments"("teacher_id");

-- CreateIndex
CREATE INDEX "payments_employee_id_idx" ON "payments"("employee_id");

-- CreateIndex
CREATE INDEX "payments_employer_id_idx" ON "payments"("employer_id");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_currency_id_idx" ON "payments"("currency_id");

-- CreateIndex
CREATE INDEX "payments_request_id_idx" ON "payments"("request_id");

-- CreateIndex
CREATE INDEX "payment_requests_agent_id_idx" ON "payment_requests"("agent_id");

-- CreateIndex
CREATE INDEX "payment_requests_group_id_idx" ON "payment_requests"("group_id");

-- CreateIndex
CREATE INDEX "payment_requests_candidate_id_idx" ON "payment_requests"("candidate_id");

-- CreateIndex
CREATE INDEX "payment_requests_payment_id_idx" ON "payment_requests"("payment_id");

-- CreateIndex
CREATE INDEX "permissions_key_idx" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permission_role_permission_id_idx" ON "permission_role"("permission_id");

-- CreateIndex
CREATE INDEX "permission_role_role_id_idx" ON "permission_role"("role_id");

-- CreateIndex
CREATE INDEX "police_clearances_candidate_id_idx" ON "police_clearances"("candidate_id");

-- CreateIndex
CREATE INDEX "police_clearances_thana_id_idx" ON "police_clearances"("thana_id");

-- CreateIndex
CREATE INDEX "police_clearances_country_id_idx" ON "police_clearances"("country_id");

-- CreateIndex
CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");

-- CreateIndex
CREATE INDEX "posts_category_id_idx" ON "posts"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_key" ON "posts"("slug");

-- CreateIndex
CREATE INDEX "professional_certificates_user_id_idx" ON "professional_certificates"("user_id");

-- CreateIndex
CREATE INDEX "professional_certificates_country_id_idx" ON "professional_certificates"("country_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "selected_candidates_candidate_id_idx" ON "selected_candidates"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "skills_user_id_idx" ON "skills"("user_id");

-- CreateIndex
CREATE INDEX "skill_list_user_id_idx" ON "skill_list"("user_id");

-- CreateIndex
CREATE INDEX "sub_agents_agent_id_idx" ON "sub_agents"("agent_id");

-- CreateIndex
CREATE INDEX "sub_agents_present_address_thana_id_idx" ON "sub_agents"("present_address_thana_id");

-- CreateIndex
CREATE INDEX "sub_agents_present_address_district_id_idx" ON "sub_agents"("present_address_district_id");

-- CreateIndex
CREATE INDEX "sub_agents_present_address_division_id_idx" ON "sub_agents"("present_address_division_id");

-- CreateIndex
CREATE INDEX "sub_agents_permanent_address_thana_id_idx" ON "sub_agents"("permanent_address_thana_id");

-- CreateIndex
CREATE INDEX "sub_agents_permanent_address_district_id_idx" ON "sub_agents"("permanent_address_district_id");

-- CreateIndex
CREATE INDEX "sub_agents_permanent_address_division_id_idx" ON "sub_agents"("permanent_address_division_id");

-- CreateIndex
CREATE INDEX "sub_agent_payment_requests_sub_agent_id_idx" ON "sub_agent_payment_requests"("sub_agent_id");

-- CreateIndex
CREATE INDEX "sub_agent_payment_requests_group_id_idx" ON "sub_agent_payment_requests"("group_id");

-- CreateIndex
CREATE INDEX "sub_agent_payment_requests_candidate_id_idx" ON "sub_agent_payment_requests"("candidate_id");

-- CreateIndex
CREATE INDEX "sub_agent_payment_requests_payment_id_idx" ON "sub_agent_payment_requests"("payment_id");

-- CreateIndex
CREATE INDEX "teachers_present_address_thana_id_idx" ON "teachers"("present_address_thana_id");

-- CreateIndex
CREATE INDEX "teachers_present_address_district_id_idx" ON "teachers"("present_address_district_id");

-- CreateIndex
CREATE INDEX "teachers_present_address_division_id_idx" ON "teachers"("present_address_division_id");

-- CreateIndex
CREATE INDEX "teachers_permanent_address_thana_id_idx" ON "teachers"("permanent_address_thana_id");

-- CreateIndex
CREATE INDEX "teachers_permanent_address_district_id_idx" ON "teachers"("permanent_address_district_id");

-- CreateIndex
CREATE INDEX "teachers_permanent_address_division_id_idx" ON "teachers"("permanent_address_division_id");

-- CreateIndex
CREATE INDEX "temp_candidates_agent_id_idx" ON "temp_candidates"("agent_id");

-- CreateIndex
CREATE INDEX "temp_candidates_class_group_id_idx" ON "temp_candidates"("class_group_id");

-- CreateIndex
CREATE INDEX "thanas_district_id_idx" ON "thanas"("district_id");

-- CreateIndex
CREATE INDEX "ticket_companies_country_id_idx" ON "ticket_companies"("country_id");

-- CreateIndex
CREATE INDEX "ticket_invoices_ticket_company_id_idx" ON "ticket_invoices"("ticket_company_id");

-- CreateIndex
CREATE INDEX "ticket_invoices_companier_id_idx" ON "ticket_invoices"("companier_id");

-- CreateIndex
CREATE INDEX "ticket_invoices_agencier_id_idx" ON "ticket_invoices"("agencier_id");

-- CreateIndex
CREATE INDEX "ticket_invoices_agency_id_idx" ON "ticket_invoices"("agency_id");

-- CreateIndex
CREATE INDEX "ticket_invoices_agent_id_idx" ON "ticket_invoices"("agent_id");

-- CreateIndex
CREATE INDEX "ticket_invoices_candidate_id_idx" ON "ticket_invoices"("candidate_id");

-- CreateIndex
CREATE INDEX "ticket_invoice_lines_ticket_invoice_id_idx" ON "ticket_invoice_lines"("ticket_invoice_id");

-- CreateIndex
CREATE INDEX "ticket_invoice_lines_candidate_id_idx" ON "ticket_invoice_lines"("candidate_id");

-- CreateIndex
CREATE INDEX "ticket_invoice_money_receipts_ticket_invoice_id_idx" ON "ticket_invoice_money_receipts"("ticket_invoice_id");

-- CreateIndex
CREATE INDEX "trainings_user_id_idx" ON "trainings"("user_id");

-- CreateIndex
CREATE INDEX "trainings_country_id_idx" ON "trainings"("country_id");

-- CreateIndex
CREATE UNIQUE INDEX "translations_table_name_column_name_foreign_key_locale_key" ON "translations"("table_name", "column_name", "foreign_key", "locale");

-- CreateIndex
CREATE INDEX "unions_upazilla_id_idx" ON "unions"("upazilla_id");

-- CreateIndex
CREATE INDEX "upazilas_district_id_idx" ON "upazilas"("district_id");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "users_user_type_id_idx" ON "users"("user_type_id");

-- CreateIndex
CREATE INDEX "users_agent_id_idx" ON "users"("agent_id");

-- CreateIndex
CREATE INDEX "users_sub_agent_id_idx" ON "users"("sub_agent_id");

-- CreateIndex
CREATE INDEX "users_teacher_id_idx" ON "users"("teacher_id");

-- CreateIndex
CREATE INDEX "users_employee_id_idx" ON "users"("employee_id");

-- CreateIndex
CREATE INDEX "users_candidate_id_idx" ON "users"("candidate_id");

-- CreateIndex
CREATE INDEX "users_employer_id_idx" ON "users"("employer_id");

-- CreateIndex
CREATE INDEX "users_agencier_id_idx" ON "users"("agencier_id");

-- CreateIndex
CREATE INDEX "users_companier_id_idx" ON "users"("companier_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "visa_immigrations_candidate_id_idx" ON "visa_immigrations"("candidate_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "login_attempts_email_created_at_idx" ON "login_attempts"("email", "created_at");

-- CreateIndex
CREATE INDEX "password_reset_tokens_token_hash_idx" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "jobs_status_run_after_idx" ON "jobs"("status", "run_after");

-- CreateIndex
CREATE UNIQUE INDEX "migration_table_results_run_id_source_table_key" ON "migration_table_results"("run_id", "source_table");

-- CreateIndex
CREATE INDEX "migration_quarantine_run_id_source_table_idx" ON "migration_quarantine"("run_id", "source_table");

-- CreateIndex
CREATE UNIQUE INDEX "id_maps_source_table_source_id_target_table_key" ON "id_maps"("source_table", "source_id", "target_table");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_owner_table_owner_id_slot_key" ON "bank_accounts"("owner_table", "owner_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "payment_snapshots_snapshot_name_source_id_key" ON "payment_snapshots"("snapshot_name", "source_id");

-- CreateIndex
CREATE INDEX "stored_files_owner_table_owner_id_idx" ON "stored_files"("owner_table", "owner_id");

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_replaced_by_candidate_id_fkey" FOREIGN KEY ("replaced_by_candidate_id") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_rows" ADD CONSTRAINT "data_rows_data_type_id_fkey" FOREIGN KEY ("data_type_id") REFERENCES "data_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_role" ADD CONSTRAINT "permission_role_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_role" ADD CONSTRAINT "permission_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
