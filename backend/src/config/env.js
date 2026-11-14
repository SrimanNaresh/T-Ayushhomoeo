import './load-env.js';

const bool = (v, dflt) => (v === undefined || v === '' ? dflt : /^(1|true|yes)$/i.test(v));

export const env = {
  port: Number(process.env.PORT || 5180),
  host: process.env.HOST || undefined,            // e.g. 127.0.0.1 behind a reverse proxy
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5180').split(',').map((s) => s.trim()),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 1433),
    instance: process.env.DB_INSTANCE || '',          // e.g. SQLEXPRESS (then DB_PORT is ignored)
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'T_multi_branch',
    encrypt: bool(process.env.DB_ENCRYPT, true),
    trustServerCertificate: bool(process.env.DB_TRUST_CERT, true),
    poolSize: Number(process.env.DB_POOL_SIZE || 10),
  },
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  tz: process.env.APP_TZ || 'Asia/Kolkata',
  tzOffsetMinutes: Number(process.env.TZ_OFFSET_MINUTES || 330),   // clinic time = UTC + 5:30
  // Single-clinic mode (SINGLE_CLINIC=1): one row in `clinics`, no branches, no clinic switcher.
  // Read here and nowhere else; 0 / empty = multi-branch (the default).
  singleClinic: bool(process.env.SINGLE_CLINIC, false),
  clinicCode: String(process.env.CLINIC_CODE || 'CL').trim().toUpperCase(),
  clinicName: String(process.env.CLINIC_NAME || 'Clinic').trim(),
};

if (env.singleClinic && !/^[A-Z0-9]{2,10}$/.test(env.clinicCode)) {
  throw new Error(`CLINIC_CODE "${env.clinicCode}" must be 2–10 letters/digits (backend/.env)`);
}

if (process.env.NODE_ENV === 'production' && env.jwtSecret === 'dev-only-secret') {
  throw new Error('JWT_SECRET must be set in production');
}
