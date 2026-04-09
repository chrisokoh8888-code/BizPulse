// ============================================================
//  BIZPULSE — firebase-setup.js
//  Run this ONCE in your browser console or as a Node script
//  to seed default users and structure into Firestore.
// ============================================================

// ─── HOW TO SET UP FIREBASE ──────────────────────────────────
//
// 1. Go to https://console.firebase.google.com
// 2. Create a new project → name it "bizpulse" (or any name)
// 3. Add a Web App → copy the firebaseConfig object
// 4. Paste it into app.js replacing the placeholder firebaseConfig
// 5. Enable Firestore Database (start in TEST MODE for now)
// 6. Enable Authentication (you can use Email/Password or Anonymous)
// 7. Run this seed file once to create demo users
//
// FIRESTORE SECURITY RULES (paste in Firebase Console → Firestore → Rules):
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /businesses/{bizId} {
      allow read, write: if request.auth != null;
    }
    match /transactions/{txnId} {
      allow read, write: if request.auth != null;
    }
    match /inventory/{itemId} {
      allow read, write: if request.auth != null;
    }
  }
}
*/

// ─── SEED DATA STRUCTURE ─────────────────────────────────────
// Run this in your Firebase console or a Node.js setup script

const SEED_USERS = [
  {
    // DEFAULT TRIAL USER — share these credentials with new clients
    username: "demo",
    password: "demo123",
    name: "Demo Owner",
    email: "demo@yourdomain.com",
    phone: "+2348000000000",  // Nigerian number for SMS alerts
    plan: "trial",
    status: "active",
    trialStart: new Date().toISOString(),
    trialEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    businesses: ["bakery", "water", "food", "print"],
    createdAt: new Date().toISOString()
  },
  {
    // ADMIN USER
    username: "admin",
    password: "AdminBizPulse2024!",
    name: "Administrator",
    email: "admin@yourdomain.com",
    plan: "annual",
    status: "active",
    trialEnd: null,
    businesses: [],
    createdAt: new Date().toISOString()
  }
];

// ─── FIRESTORE COLLECTIONS STRUCTURE ─────────────────────────
/*
  Firestore Database Structure:
  
  /users/{userId}
    - username: string
    - password: string (hash in production!)
    - name: string
    - email: string
    - phone: string
    - plan: "trial" | "monthly" | "annual"
    - status: "active" | "expired" | "suspended"
    - trialStart: ISO date string
    - trialEnd: ISO date string
    - businesses: string[] (array of business IDs)
    - createdAt: ISO date string
  
  /businesses/{bizId}
    - name: string
    - type: "bakery" | "water_factory" | "fastfood" | "printing" | "retail" | "other"
    - desc: string
    - currency: string (default "₦")
    - ownerId: userId
    - createdAt: ISO date string
  
  /transactions/{txnId}
    - type: "sale" | "expense"
    - bizId: string
    - item OR desc: string
    - qty: number (for sales)
    - price: number (unit price, for sales)
    - amount: number (total)
    - category: string (for expenses)
    - date: "YYYY-MM-DD"
    - notes: string
    - createdAt: ISO date string
  
  /inventory/{itemId}   (format: bizId_itemSlug)
    - bizId: string
    - name: string
    - qty: number
    - unit: string
    - reorderLevel: number
    - cost: number (unit cost)
    - updatedAt: ISO date string
*/

// ─── TRIAL EXPIRY CLOUD FUNCTION ─────────────────────────────
// Deploy to Firebase Cloud Functions for automated alerts
/*
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

// Runs every day at 8AM Lagos time
exports.checkTrialExpiry = functions.pubsub
  .schedule('0 8 * * *')
  .timeZone('Africa/Lagos')
  .onRun(async () => {
    const db = admin.firestore();
    const now = new Date();
    
    const usersSnap = await db.collection('users')
      .where('plan', '==', 'trial')
      .where('status', '==', 'active')
      .get();
    
    for (const doc of usersSnap.docs) {
      const user = doc.data();
      const trialEnd = new Date(user.trialEnd);
      const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
      
      // Send alerts at 29, 21, 14, 7, 3, 1 days remaining
      if ([29, 21, 14, 7, 3, 1].includes(daysLeft)) {
        await sendTrialExpiryEmail(user, daysLeft);
        await sendTrialExpirySMS(user, daysLeft);
      }
      
      // Lock account if expired
      if (daysLeft <= 0) {
        await db.collection('users').doc(doc.id).update({ status: 'expired' });
        await sendExpiredEmail(user);
      }
    }
  });

async function sendTrialExpiryEmail(user, daysLeft) {
  // Configure with your email provider (SendGrid, Mailgun, etc.)
  const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: { user: 'your@email.com', pass: 'your-app-password' }
  });
  
  await transporter.sendMail({
    from: 'BizPulse <noreply@bizpulse.app>',
    to: user.email,
    subject: `⏰ Your BizPulse trial expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
    html: `
      <h2>Hi ${user.name},</h2>
      <p>Your BizPulse trial expires in <strong>${daysLeft} day${daysLeft > 1 ? 's' : ''}</strong>.</p>
      <p>Upgrade now to keep access to all your business data and insights.</p>
      <a href="https://yourdomain.com/upgrade" 
         style="background:#f5a623;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold">
        Upgrade BizPulse →
      </a>
      <p style="margin-top:24px;color:#888;font-size:12px">
        BizPulse — Every Business, One Pulse
      </p>
    `
  });
}

async function sendTrialExpirySMS(user, daysLeft) {
  // Using Termii (Nigerian SMS provider) — https://termii.com
  const response = await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: user.phone,
      from: 'BizPulse',
      sms: `BizPulse Alert: Your trial expires in ${daysLeft} day(s). Login & upgrade at bizpulse.app to keep your data.`,
      type: 'plain',
      channel: 'generic',
      api_key: 'YOUR_TERMII_API_KEY'
    })
  });
}
*/

// ─── HOW TO ADD A NEW CLIENT (30-DAY TRIAL) ──────────────────
/*
  In your Firebase Console → Firestore → users collection, create a document:
  
  {
    "username": "client_name",
    "password": "InitialPass123",
    "name": "Client Full Name",
    "email": "client@email.com",
    "phone": "+2348012345678",
    "plan": "trial",
    "status": "active",
    "trialStart": "2024-01-01T00:00:00.000Z",
    "trialEnd": "2024-01-31T00:00:00.000Z",   ← 30 days from start
    "businesses": [],
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
  
  Share username + password with the client.
  The app will automatically show trial countdown and send alerts.
  
  To upgrade a client: change "plan" to "monthly" or "annual" and remove "trialEnd".
  To lock a client: change "status" to "expired".
*/

console.log('BizPulse Firebase setup guide loaded.');
console.log('Seed users:', SEED_USERS);
