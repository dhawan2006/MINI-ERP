# Phase 3B Implementation Plan: Admin Dashboard Foundation

## 1. Audit Summary
- **Frontend Stack**: The existing application (`src/`) is an Electron + React + Vite + TailwindCSS app.
- **Admin App Architecture**: Per the specification, the Admin Platform must be a **completely separate web application**. Thus, a new React/Vite web application has been scaffolded in `admin-ui/`.
- **Phase 3A Endpoints**: The Admin API resides at `/functions/v1/admin/*`, governed strictly by RBAC and MFA (AAL2 for destructive operations) through Supabase Edge Functions.
- **Existing Supabase Auth**: No Supabase client logic exists in the Electron frontend. The Admin App will need its own `@supabase/supabase-js` instance.

## 2. Implementation Plan

### Step 1: Scaffold Admin Web App
- Initialize a new Vite React app in the `admin-ui` folder.
- Add dependencies: `@supabase/supabase-js`, `react-router-dom`, `lucide-react`, `zustand`.

### Step 2: Configure Supabase Auth & State
- Setup `supabaseClient.ts`.
- Implement `useAuthStore` to manage session state and decode AAL levels.

### Step 3: Implement Routing & AppShell
- Set up `react-router-dom` with secure boundaries.
- Build a Login Page (`/login`).
- Build an authenticated AppShell (Sidebar + Header) mapping to core routes:
  - Dashboard (`/`)
  - Customers (`/customers`)
  - Licenses (`/licenses`)
  - Devices (`/devices`)
  - Audit Logs (`/audit`)
- Implement a `ProtectedRoute` component that enforces authentication before mounting the AppShell.

### Step 4: Build & Test
- Verify TypeScript compilation (`npm run build`).
- Validate standard UI rendering.
- No heavy feature logic in this phase; only foundation and routing.
