# SplitPay

Arkadaş gruplarının ortak harcamalarını USDC ile takip edip Circle Programmable Wallets üzerinden gerçek ödeme yaptığı web uygulaması. **Splitwise'ın crypto versiyonu** — ama çok daha sade.

---

## Stack

| Katman | Teknoloji |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, TailwindCSS |
| Auth | Supabase Magic Link (e-posta, şifresiz) |
| Wallet | Circle Programmable Wallets (User-Controlled) |
| Ödeme | Circle Web3 Services API — USDC transferleri |
| Blockchain | Arc testnet (EVM uyumlu, Circle Layer-1) |
| State | Zustand |
| DB | Supabase (PostgreSQL + Row Level Security) |

---

## Hızlı Kurulum (5 dakika)

### 1. Repoyu klonla

```bash
git clone https://github.com/Uw4ng/split-pay.git
cd split-pay
npm install
```

### 2. Supabase projesi oluştur

1. [supabase.com](https://supabase.com) → **New project**
2. **Settings → API** sayfasından şu değerleri kopyala:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon / public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_KEY`  *(asla client'a gönderme)*
3. **SQL Editor**'da `supabase/migrations/001_initial.sql` dosyasını çalıştır

### 3. Circle Sandbox API key al

1. [console.circle.com](https://console.circle.com) → kayıt ol veya giriş yap
2. **API Keys → Create API Key** → ortam: **Sandbox**
3. Kopyala → `CIRCLE_API_KEY`

### 4. `.env.local` oluştur

```bash
cp .env.example .env.local
```

`.env.local` içeriği:

```env
# Circle
CIRCLE_API_KEY=TEST_API_KEY:xxx...
CIRCLE_ENV=sandbox

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_KEY=eyJhbGci...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Geliştirme sunucusunu başlat

```bash
npm run dev
# → http://localhost:3000
```

---

## Test

```bash
# Tüm testler
npm test

# Watch mode
npm run test:watch

# Sadece debt algoritması
npx jest src/lib/debt.test.ts

# Sadece settle API
npx jest src/app/api/settle
```

---

## Proje Yapısı

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx          # Magic Link giriş formu
│   │   └── callback/route.ts       # Auth callback → wallet oluştur
│   ├── (app)/
│   │   ├── dashboard/page.tsx      # Grup listesi + USDC bakiyesi
│   │   └── groups/[groupId]/page.tsx  # Grup detayı + harcamalar
│   └── api/
│       ├── circle/
│       │   ├── create-wallet/      # Yeni Circle wallet
│       │   ├── balance/            # USDC bakiye sorgu
│       │   ├── transfer/           # USDC transfer
│       │   └── wallet-info/        # Wallet adresi/ID lookup
│       ├── groups/                 # Grup CRUD
│       ├── expenses/               # Harcama CRUD
│       └── settle/route.ts         # Gerçek USDC settlement akışı
├── components/
│   ├── providers/AuthProvider.tsx  # Supabase session → Zustand
│   ├── groups/CreateGroupModal.tsx
│   ├── expenses/
│   │   ├── AddExpenseForm.tsx
│   │   └── ExpenseCard.tsx
│   └── settlement/
│       ├── SettlementModal.tsx     # "Borçlarımı öde" UI
│       ├── SettlementSummary.tsx
│       └── SettleConfirmModal.tsx
├── hooks/
│   ├── useWalletBalance.ts         # 30s polling
│   └── useSettlement.ts            # Transfer state machine
├── lib/
│   ├── circle.ts                   # Circle SDK singleton
│   ├── supabase.ts                 # Supabase client (client + server)
│   ├── debt.ts                     # Borç minimizasyon algoritması
│   ├── env.ts                      # Startup env validation
│   └── db/
│       ├── users.ts
│       ├── groups.ts
│       └── expenses.ts
└── store/
    ├── userStore.ts
    ├── groupStore.ts
    └── expenseStore.ts
```

---

## Güvenlik Notları

- **API key'ler asla client'a açılmaz** — tüm Circle çağrıları Next.js API route'larından yapılır
- **Wallet ownership**: `/api/settle` sender cüzdanını body'den değil, session user ID'si üzerinden DB'den çeker
- **RLS**: Supabase Row Level Security her tabloda aktif — kullanıcı sadece kendi grup verilerini görebilir
- **İdempotency**: Circle transfer key'i `SHA-256(settle-{walletId}-{splitIds.sorted})` ile deterministik oluşturulur

---

## Arc Testnet → Mainnet Geçişi

`src/lib/circle.ts` içindeki `blockchains` değerini güncelle:

```ts
// Şu an (testnet)
blockchains: ['AVAX-FUJI']

// Arc mainnet çıkınca
blockchains: ['ARC-MAINNET']  // veya Circle'ın resmi chain adı
```

Ve `.env.local`'da:

```env
CIRCLE_ENV=production
```

> **Note**: Arc'ın Circle Wallet entegrasyonu testnet fazında. Chain adı resmi duyuruyla netleşecek.  
> Güncel bilgi: [docs.arc.network](https://docs.arc.network)

---

## Katkı

Bu repo bir hackathon/demo projesidir. PR'lar açık.
