# SmartStock Pro

Professional inventory + sales + accounting app for tile and building materials stores.

## Structure

```
├── index.html              ← Main app (currently single-file, migrating in phases)
├── css/                    ← Stylesheets (Phase 2)
│   ├── tokens.css          ← Design tokens (colors, fonts)
│   ├── reset.css           ← Base reset
│   ├── layout.css          ← Shell, topbar, sidebar, nav
│   ├── components.css      ← Buttons, badges, cards
│   ├── forms.css           ← Inputs, modals, drawers
│   ├── pages.css           ← Page-specific styles
│   └── print.css           ← Print/report styles
├── js/                     ← JavaScript modules (Phase 3)
│   ├── config.js           ← Constants + Firebase config
│   ├── db.js               ← Storage + encryption + migrateDB
│   ├── utils.js            ← Shared helpers
│   ├── firebase.js         ← Sync + auth
│   ├── auth.js             ← Login + permissions
│   ├── dashboard.js
│   ├── sales.js
│   ├── products.js
│   ├── stock.js
│   ├── suppliers.js
│   ├── warehouses.js
│   ├── quotations.js
│   ├── fulfillment.js
│   ├── credits.js
│   ├── expenses.js
│   ├── salary.js
│   ├── customers.js
│   ├── reports.js
│   ├── ai.js
│   ├── chat.js
│   └── admin.js
├── sw.js                   ← Service Worker (Phase 4)
├── netlify/
│   └── functions/
│       └── ai-chat.mjs     ← AI assistant serverless function
└── netlify.toml            ← Netlify config
```

## Deployment
Hosted on Netlify. Auto-deploys from main branch.
Live: https://smartstock-pro.netlify.app
