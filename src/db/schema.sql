CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  email           varchar(255) UNIQUE NOT NULL,
  password_hash   varchar(255) NOT NULL,
  full_name       varchar(200) NOT NULL,
  role            varchar(20)  NOT NULL CHECK (role IN ('APPLICANT','REVIEWER','APPROVER','ADMIN')),
  organization    varchar(200),
  is_active       boolean      DEFAULT true,
  created_at      timestamptz  DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id        uuid         NOT NULL REFERENCES users(id),
  institution_name    varchar(300) NOT NULL,
  institution_type    varchar(100) NOT NULL,
  registration_number varchar(100),
  contact_email       varchar(255),
  contact_phone       varchar(20),
  license_type        varchar(100) NOT NULL,
  status              varchar(30)  NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN (
                          'DRAFT','SUBMITTED','UNDER_REVIEW',
                          'ADDITIONAL_INFO_REQUIRED','REVIEWED',
                          'APPROVED','REJECTED'
                        )),
  reviewer_id         uuid         REFERENCES users(id),
  approver_id         uuid         REFERENCES users(id),
  review_notes        text,
  decision_reason     text,
  submitted_at        timestamptz,
  decided_at          timestamptz,
  created_at          timestamptz  DEFAULT now(),
  updated_at          timestamptz  DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid         NOT NULL REFERENCES applications(id),
  uploaded_by      uuid         NOT NULL REFERENCES users(id),
  original_name    varchar(500) NOT NULL,
  stored_name      varchar(500) NOT NULL,
  file_path        text         NOT NULL,
  file_size        integer      NOT NULL,
  mime_type        varchar(100) NOT NULL,
  document_type    varchar(100) NOT NULL,
  version          integer      NOT NULL DEFAULT 1,
  is_current       boolean      DEFAULT true,
  uploaded_at      timestamptz  DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid         REFERENCES applications(id),
  actor_id         uuid         NOT NULL REFERENCES users(id),
  actor_role       varchar(20)  NOT NULL,
  action           varchar(100) NOT NULL,
  previous_status  varchar(30),
  new_status       varchar(30),
  previous_state   jsonb,
  new_state        jsonb,
  metadata         jsonb,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid         NOT NULL REFERENCES users(id),
  token_hash   varchar(255) UNIQUE NOT NULL,
  expires_at   timestamptz  NOT NULL,
  created_at   timestamptz  DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_types (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(100) UNIQUE NOT NULL,
  description text         NOT NULL,
  mandatory   boolean      DEFAULT false,
  created_at  timestamptz  DEFAULT now()
);

CREATE TABLE IF NOT EXISTS application_comments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid        NOT NULL REFERENCES applications(id),
  author_id        uuid        NOT NULL REFERENCES users(id),
  author_role      varchar(20) NOT NULL,
  content          text        NOT NULL,
  is_internal      boolean     DEFAULT false,
  created_at       timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_applications_updated_at'
  ) THEN
    CREATE TRIGGER trg_applications_updated_at
      BEFORE UPDATE ON applications
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
