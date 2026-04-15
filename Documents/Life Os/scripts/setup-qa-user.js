#!/usr/bin/env node
/**
 * setup-qa-user.js — Crea o resetea el usuario QA en Firebase Staging
 * Uso: node setup-qa-user.js
 */
'use strict';

require('dotenv').config({ path: '/opt/openclaw/.env' });

const https = require('https');

const API_KEY  = process.env.FIREBASE_API_KEY;
const QA_EMAIL = process.env.QA_USER_EMAIL   || 'qa-test@mylifeos-staging.com';
const QA_PASS  = process.env.QA_USER_PASSWORD || 'QaTestPass2026!';

if (!API_KEY) { console.error('ERROR: FIREBASE_API_KEY no en .env'); process.exit(1); }

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      path: `/v1/accounts:${path}?key=${API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log(`\nConfigurando usuario QA: ${QA_EMAIL}`);
  console.log(`API Key: ${API_KEY.slice(0,10)}...`);

  // Intentar crear el usuario
  const signUp = await post('signUp', {
    email: QA_EMAIL,
    password: QA_PASS,
    returnSecureToken: true
  });

  if (signUp.status === 200) {
    console.log('✅ Usuario QA creado exitosamente');
    console.log(`   UID: ${signUp.body.localId}`);
    return;
  }

  const errCode = signUp.body?.error?.message;
  if (errCode === 'EMAIL_EXISTS') {
    console.log('ℹ️  El usuario ya existe. Reseteando contraseña...');
    // Hacer login primero para obtener idToken
    const signIn = await post('signInWithPassword', {
      email: QA_EMAIL,
      password: QA_PASS,
      returnSecureToken: true
    });

    if (signIn.status === 200) {
      console.log('✅ Credenciales correctas — login exitoso');
      console.log(`   UID: ${signIn.body.localId}`);
      return;
    }

    // Si el login falla, resetear contraseña con sendOobCode (no requiere auth)
    const reset = await post('sendOobCode', {
      requestType: 'PASSWORD_RESET',
      email: QA_EMAIL
    });

    if (reset.status === 200) {
      console.log('⚠️  Se envió email de reseteo de contraseña a', QA_EMAIL);
      console.log('    Revisa el correo y actualiza QA_USER_PASSWORD en .env');
    } else {
      console.log('❌ Error al resetear:', reset.body?.error?.message);
      console.log('\n→ SOLUCIÓN MANUAL:');
      console.log('  1. Ve a Firebase Console → Authentication → Users');
      console.log('  2. Busca o crea:', QA_EMAIL);
      console.log('  3. Contraseña:', QA_PASS);
    }
  } else {
    console.log('❌ Error al crear usuario:', errCode);
    console.log('\n→ SOLUCIÓN MANUAL:');
    console.log('  1. Ve a Firebase Console → life-os-staging → Authentication → Users');
    console.log('  2. Add user:', QA_EMAIL, '/', QA_PASS);
  }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
