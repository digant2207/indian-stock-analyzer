---
name: Indian Stock Screener & AI Analyst Design System
colors:
  surface: '#0f172a'
  surface-dim: '#0b1120'
  surface-bright: '#1e293b'
  surface-container-lowest: '#030712'
  surface-container-low: '#0f172a'
  surface-container: '#1e293b'
  surface-container-high: '#334155'
  surface-container-highest: '#475569'
  on-surface: '#f8fafc'
  on-surface-variant: '#94a3b8'
  inverse-surface: '#f8fafc'
  inverse-on-surface: '#0f172a'
  outline: '#334155'
  outline-variant: '#1e293b'
  surface-tint: '#0284c7'
  primary: '#0284c7'
  on-primary: '#ffffff'
  primary-container: '#0369a1'
  on-primary-container: '#e0f2fe'
  secondary: '#059669'
  on-secondary: '#ffffff'
  secondary-container: '#064e3b'
  on-secondary-container: '#6ee7b7'
  tertiary: '#e11d48'
  on-tertiary: '#ffffff'
  tertiary-container: '#881337'
  on-tertiary-container: '#fca5a5'
  warning: '#d97706'
  on-warning-container: '#fde68a'
  background: '#0a0f1d'
  on-background: '#f8fafc'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '800'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '700'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.5'
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.4'
  data-lg:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '700'
    lineHeight: '1'
  data-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '600'
    lineHeight: '1'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  full: 9999px
spacing:
  base: 4px
  gutter: 16px
  margin-mobile: 12px
  margin-desktop: 24px
  card-gap: 16px
---

# Indian Stock Screener & AI Analyst — Screen Designs

## 1. Overview & Brand Theme
An institutional-grade financial analytics terminal engineered for Indian equity traders and investors (NSE / BSE).
- **Theme**: Modern Dark Financial Terminal with Glassmorphism layers and high-contrast semantic accents.
- **Accents**: 
  - Emerald Green (`#059669` / `#10b981`): Bullish, Gains, Long-Term Buy.
  - Electric Cyan (`#0284c7` / `#06b6d4`): Breakout triggers, Action highlights.
  - Crimson Red (`#e11d48` / `#ef4444`): Stop Loss, Debt Warnings, Exit.
  - Warm Amber (`#d97706`): Hold, Caution, Corporate Events.

---

## 2. Laptop / Desktop Page Design (1440 × 900)

### Layout Grid:
- **Sticky Top App Bar (Height: 64px)**:
  - Brand identity: Logo pill `IN` + "Indian Stock Screener & AI Analyst" with subtitle "NSE/BSE Intelligence • 8:00 AM Daily Pre-Market & 30-Min Live Cloud Automation".
  - Live market pulse indicator: Pulsing green dot + "Last Run: Live Market (30-min scan)".
  - Quick action controls: "🚀 Real-Time Cloud Scan", Theme toggle (Dark/Light), Notifications.
- **Two-Column Container**:
  - **Left Sidebar (Width: 230px, sticky)**:
    - Vertical navigation items:
      1. 🎯 Today's Breakouts (Top 25) [Active state with Cyan glow]
      2. 🔥 Top 15 & Worst 5
      3. 📊 Spark Watchlist
      4. 📈 Nifty 250 Universe
      5. 📰 Major Corporate Events
  - **Main Workspace (Fluid 12-column grid)**:
    - **Row 1: 4 KPI Summary Cards**:
      - Total Stocks Scanned (e.g. 384)
      - Long-Term Buy Signals (ROE > 15%, Low Debt)
      - Swing Breakout Setups (Within 2% of Trigger)
      - High Debt / Red Flags (Debt-to-Equity > 2.0 or Pledge Alerts)
    - **Row 2: Action Toolbar**:
      - Real-time search bar ("Search company, e.g. Reliance, Dixon...")
      - Sector filter dropdown
      - Signal filter dropdown (Buy, Breakout, Exit)
      - Export / Refresh action
    - **Row 3: High-Density Breakout Table**:
      - Columns: Company Name, Price (₹), Day Chg (%), Distance (%), Buy Trigger (₹), Stop Loss (₹), Target 1 (₹), Action Rationale & Status.
      - Interactive rows with hover lift and modal drilldown trigger.

---

## 3. Mobile Page Design (390 × 844)

### Mobile Optimization Principles:
- Single-column vertical scroll with thumb-accessible controls.
- Compact data density without horizontal table overflow.

### Screen Structure:
1. **Compact Mobile Header (Height: 52px)**:
   - Monogram logo + "Stock Screener" + Live green pulse dot.
   - Cloud Scan icon button + Dark/Light switch.
2. **Horizontal Swipeable KPI Carousel**:
   - 4 compact metric cards swipeable horizontally with page dots:
     - 🎯 Breakouts (18)
     - 💎 Buy Signals (42)
     - 📊 Scanned (384)
     - ⚠️ Red Flags (7)
3. **Segmented Tab Pill Bar**:
   - Scrollable pill buttons: `🎯 Breakouts` | `🔥 Top 15` | `📊 Watchlist` | `📈 Nifty 250` | `📰 Events`
4. **Mobile Stock Cards List (Card-based layout instead of wide table)**:
   - Each stock is rendered as a clean frosted glass card:
     - **Card Header**: Company Name (`Inter Bold 15px`), Ticker (`JetBrains Mono 12px`), Price (`₹2,845.00`), and Day % pill (`+2.45%`).
     - **Trigger Bar**: Visual progress gauge showing distance to trigger (e.g. `0.8% to Buy Trigger ₹2,868`).
     - **Key Levels Grid (2x2)**:
       - Target 1: `₹3,050`
       - Stop Loss: `₹2,760`
       - Fund Score: `86/100`
       - Tech Score: `91/100`
     - **Badge & Action**: "🔥 MOMENTUM BREAKOUT" badge + "Deep Analysis ➔" tap target.
5. **Fixed Bottom Navigation Bar (Height: 56px)**:
   - 4 bottom icons: `Breakouts`, `Watchlist`, `Events`, `Cloud Scan`.
