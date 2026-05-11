require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../src/db/pool');
const { initDb } = require('../src/db/init');

const SALT = 10;

const users = [
  {
    email: 'admin@bnr.rw',
    password: 'Admin@2026',
    full_name: 'System Admin',
    role: 'ADMIN',
    organization: 'National Bank of Rwanda'
  },
  {
    email: 'reviewer@bnr.rw',
    password: 'Reviewer@2026',
    full_name: 'Alice Uwimana',
    role: 'REVIEWER',
    organization: 'National Bank of Rwanda'
  },
  {
    email: 'approver@bnr.rw',
    password: 'Approver@2026',
    full_name: 'Jean Pierre Habimana',
    role: 'APPROVER',
    organization: 'National Bank of Rwanda'
  },
  {
    email: 'applicant@rtn.rw',
    password: 'Applicant@2026',
    full_name: 'Paul Barera',
    role: 'APPLICANT',
    organization: 'RTN'
  }
];

async function upsertUser(u) {
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [u.email]);
  if (existing.rows.length > 0) {
    console.log(`  skip  ${u.role.padEnd(10)} ${u.email} (already exists)`);
    return existing.rows[0].id;
  }

  const hash = await bcrypt.hash(u.password, SALT);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role, organization)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [u.email, hash, u.full_name, u.role, u.organization]
  );

  console.log(`  added ${u.role.padEnd(10)} ${u.email}`);
  return rows[0].id;
}

const documentTypes = [
  { name: 'Certificate of Incorporation',          description: 'Official document confirming the institution is legally registered.',                                   mandatory: true  },
  { name: 'Memorandum and Articles of Association', description: 'Founding documents outlining the institution\'s objectives, structure, and governance rules.',          mandatory: true  },
  { name: 'Business Plan',                          description: 'Three to five year plan covering strategy, market analysis, projections, and operational model.',        mandatory: false  },
  { name: 'Audited Financial Statements',           description: 'Most recent two years of financial statements audited by a certified external auditor.',                 mandatory: false  },
  { name: 'Proof of Minimum Capital',               description: 'Bank statement or equivalent evidence showing the institution meets BNR\'s minimum capital threshold.', mandatory: false  },
  { name: 'Fit and Proper Declaration',             description: 'Signed declarations for all directors and key management confirming eligibility under BNR guidelines.',  mandatory: false  },
  { name: 'AML/CFT Policy Document',                description: 'Anti-money laundering and counter-financing of terrorism policies and procedures.',                      mandatory: false  },
  { name: 'Source of Funds Declaration',            description: 'Documentation explaining the origin of the capital being used to establish the institution.',            mandatory: false  },
  { name: 'Organizational Chart',                   description: 'Diagram of the proposed management structure including reporting lines and key roles.',                   mandatory: false },
  { name: 'IT Systems and Infrastructure Plan',     description: 'Overview of the core banking system, data security controls, and disaster recovery arrangements.',       mandatory: false },
];

async function upsertDocumentType(dt) {
  const existing = await pool.query(
    'SELECT id FROM document_types WHERE name = $1',
    [dt.name]
  );

  if (existing.rows.length > 0) {
    console.log(`  skip  ${dt.name}`);
    return;
  }

  await pool.query(
    `INSERT INTO document_types (name, description, mandatory)
     VALUES ($1, $2, $3)`,
    [dt.name, dt.description, dt.mandatory]
  );
  console.log(`  added ${dt.mandatory ? '(required)' : '(optional)'} ${dt.name}`);
}

async function seed() {
  console.log('\nApplying schema...');
  await initDb();

  console.log('\nSeeding document types...');
  for (const dt of documentTypes) {
    await upsertDocumentType(dt);
  }

  console.log('\nSeeding users...');
  const ids = {};

  for (const u of users) {
    ids[u.role] = await upsertUser(u);
  }

  console.log('\nSeeding applications...');

  // application 1
  const draftCheck = await pool.query(
    'SELECT id FROM applications WHERE institution_name = $1',
    ['Kigali Commercial Bank Ltd']
  );

  if (draftCheck.rows.length === 0) {
    await pool.query(
      `INSERT INTO applications
         (applicant_id, institution_name, institution_type, license_type, contact_email, contact_phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')`,
      [
        ids['APPLICANT'],
        'Kigali Commercial Bank Ltd',
        'Commercial Bank',
        'Full Banking License',
        'info@kcbl.rw',
        '+250788000001'
      ]
    );
    console.log('  added  (DRAFT)');
  } else {
    console.log('  skip    (already exists)');
  }

  // application 2  UNDER_REVIEW, claimed by reviewer
  const reviewCheck = await pool.query(
    'SELECT id FROM applications WHERE institution_name = $1',
    ['Rwanda Microfinance Cooperative']
  );

  if (reviewCheck.rows.length === 0) {
    await pool.query(
      `INSERT INTO applications
         (applicant_id, institution_name, institution_type, license_type, contact_email,
          status, reviewer_id, submitted_at)
       VALUES ($1, $2, $3, $4, $5, 'UNDER_REVIEW', $6, now())`,
      [
        ids['APPLICANT'],
        'Rwanda Microfinance Cooperative',
        'Microfinance Institution',
        'Microfinance License',
        'info@rmc.rw',
        ids['REVIEWER']
      ]
    );
    console.log('  added  (UNDER_REVIEW)');
  } else {
    console.log('  skip   (already exists)');
  }

  console.log('\nDone. Login credentials:');
  console.log('─'.repeat(52));
  users.forEach(u => {
    console.log(`  ${u.role.padEnd(10)}  ${u.email.padEnd(26)} ${u.password}`);
  });
  console.log('─'.repeat(52));
}

seed()
  .catch(err => {
    console.error('\nSeed failed:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
