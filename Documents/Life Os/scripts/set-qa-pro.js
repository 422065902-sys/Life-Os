#!/usr/bin/env node
/**
 * set-qa-pro.js — Da is_pro:true al usuario QA en Firestore staging
 * Uso: node set-qa-pro.js
 */
'use strict';

require('dotenv').config({ path: '/opt/openclaw/.env' });

const https = require('https');
const path  = require('path');
const fs    = require('fs');

const PROJECT    = 'mylifeos-staging';
const QA_EMAIL   = process.env.QA_USER_EMAIL || 'qa-test@mylifeos-staging.com';
const API_KEY    = process.env.FIREBASE_API_KEY;
const ADC_PATH   = path.join(__dirname, 'firebase-adc.json');

if (!API_KEY) { console.error('ERROR: FIREBASE_API_KEY no en .env'); process.exit(1); }

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

async function getAccessToken() {
  const adc = JSON.parse(fs.readFileSync(ADC_PATH, 'utf8'));
  const res = await post('oauth2.googleapis.com', '/token', {
    client_id:     adc.client_id,
    client_secret: adc.client_secret,
    refresh_token: adc.refresh_token,
    grant_type:    'refresh_token'
  }, {});
  if (!res.body.access_token) throw new Error('ADC token refresh falló: ' + JSON.stringify(res.body));
  return res.body.access_token;
}

async function getQaUid() {
  const res = await post('identitytoolkit.googleapis.com',
    `/v1/accounts:lookup?key=${API_KEY}`,
    { email: [QA_EMAIL] }, {});
  const users = res.body.users;
  if (!users || !users.length) throw new Error('Usuario QA no encontrado: ' + QA_EMAIL);
  return users[0].localId;
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
    console.log('Obteniendo access token...');
    const token = await getAccessToken();
    console.log('Buscando UID de', QA_EMAIL);
    const uid   = await getQaUid();
    console.log('UID:', uid);
    console.log('Actualizando is_pro: true en Firestore...');
    const res   = await setIsPro(token, uid);
    if (res.status === 200) {
      console.log('✅ is_pro: true aplicado correctamente');
    } else {
      console.error('❌ Error Firestore:', res.status, JSON.stringify(res.body));
    }
  } catch(e) {
    console.error('❌ Error:', e.message);
  }
})();
