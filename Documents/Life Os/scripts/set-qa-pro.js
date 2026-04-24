#!/usr/bin/env node
/**
 * set-qa-pro.js — Da is_pro:true al usuario QA en Firestore staging
 * Uso: node set-qa-pro.js
 */
'use strict';

require('dotenv').config({ path: '/opt/openclaw/.env' });

const https = require('https');

const PROJECT    = 'mylifeos-staging';
const QA_EMAIL   = process.env.QA_USER_EMAIL    || 'qa-test@mylifeos-staging.com';
const QA_PASS    = process.env.QA_USER_PASSWORD || '';
const API_KEY    = process.env.FIREBASE_API_KEY;

if (!API_KEY)  { console.error('ERROR: FIREBASE_API_KEY no en .env'); process.exit(1); }
if (!QA_PASS)  { console.error('ERROR: QA_USER_PASSWORD no en .env'); process.exit(1); }

function post(hostname, path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request({ hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
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

function patch(hostname, urlPath, body, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request({ hostname, path: urlPath, method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
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

async function signIn() {
  const res = await post('identitytoolkit.googleapis.com',
    `/v1/accounts:signInWithPassword?key=${API_KEY}`,
    { email: QA_EMAIL, password: QA_PASS, returnSecureToken: true }, {});
  if (!res.body.idToken) throw new Error('Sign-in falló: ' + JSON.stringify(res.body));
  return { idToken: res.body.idToken, uid: res.body.localId };
}

async function setIsPro(token, uid) {
  const urlPath = `/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=is_pro`;
  const body = {
    fields: { is_pro: { booleanValue: true } }
  };
  const res = await patch('firestore.googleapis.com', urlPath, body, {
    Authorization: `Bearer ${token}`
  });
  return res;
}

(async () => {
  try {
    console.log('Autenticando como', QA_EMAIL);
    const { idToken, uid } = await signIn();
    console.log('UID:', uid);
    console.log('Actualizando is_pro: true en Firestore...');
    const res   = await setIsPro(idToken, uid);
    if (res.status === 200) {
      console.log('✅ is_pro: true aplicado correctamente');
    } else {
      console.error('❌ Error Firestore:', res.status, JSON.stringify(res.body));
    }
  } catch(e) {
    console.error('❌ Error:', e.message);
  }
})();
