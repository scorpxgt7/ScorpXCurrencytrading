# ScorpXGT Forex & Gold Scalping Calculator

Professional AI-powered scalping assistant with real data integration, rule-based signal generation, and multi-currency support.

## ✨ Features (Fully Enhanced)

### 📊 Position Calculator
- Calculates professional position sizing with risk management
- Supports 7 currency pairs: EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF, XAU/USD
- Inputs: Entry, Stop Loss, Take Profit, Account Balance, Risk %
- Outputs: Pips, Risk:Reward ratio, Position size (lots & units), USD risk, Trade direction
- Real-time pip value calculations per currency

### 🤖 AI Trading Assistant
- **Rule-Based Signal Generation** (NOT random)
  - 9 validation rules from trading system specification
  - Signals: BUY, SELL, or NO_TRADE
- **Multi-Timeframe (MTF) Confirmation**
  - Higher timeframe alignment checking
  - Bullish/Bearish/Range market structure detection
- **Technical Indicator Integration**
  - EMA20/EMA50 alignment
  - RSI14 confirmation
  - ATR-based stop/target calculation
  - Spread analysis
  - **MACD** (Moving Average Convergence Divergence)
  - **Bollinger Bands** (Upper, Middle, Lower bands)
  - **Stochastic Oscillator** (Momentum indicator)
- **Confidence Scoring** (0-100%)
  - Algorithmic scoring based on validation rules
  - Transparent breakdown of confidence factors
  - Configurable confidence threshold

### 📈 Market Data Dashboard
- **Real-time Live API Integration**
  - Powered by exchangerate-api.com (free tier)
  - Fallback to simulated data if API unavailable
  - OHLC (Open, High, Low, Close) data
  - Live bid/ask spreads
  - Market sentiment analysis
- **Advanced Technical Indicators**
  - EMA20/EMA50 (Exponential Moving Averages)
  - RSI14 (Relative Strength Index)
  - ATR14 (Average True Range)
  - MACD (Moving Average Convergence Divergence)
  - Bollinger Bands
  - Stochastic Oscillator
- Auto-refresh capability (configurable interval)
- Data validation status display

### 📊 TradingView Chart Integration
- Live price charts for all supported symbols
- Configurable timeframes (5M, 15M, 1H, 4H, D)
- Multiple chart types (Candles, Line, Bars, Area)
- Chart-to-calculator sync
- **Maximize/Pop-Out Feature** (NEW!)
  - Click "Maximize" button for fullscreen chart view
  - Enter immersive analysis mode without distractions
  - Switch timeframes and chart types on the fly
  - Real-time price, RSI, and sentiment display in modal
  - Press ESC or click Close to restore normal view
  - Perfect for detailed technical analysis

### 📔 Trade Journal & History
- **Complete Trade Management System**
  - Log all executed trades with detailed information
  - Track entry/exit prices, P&L, and confidence scores
  - Searchable trade history with timestamps
  - Easy to review past trades for analysis
- **Export Functionality**
  - Export trade history to CSV format
  - Compatible with Excel, spreadsheet, and analysis tools
  - Timestamp and performance metrics included

### 📊 Performance Dashboard
- **Advanced Analytics**
  - Total trades executed
  - Win rate percentage calculation
  - Cumulative profit/loss tracking
  - Average profit per trade
  - Win/loss trade counts
  - Historical performance visualization
  - Real-time P&L updates
- **Data Persistence**
  - All performance metrics saved to localStorage
  - Track performance across sessions
  - Year-to-date and monthly statistics

### 🔔 Alert System
- **Multi-Channel Alerts**
  - Sound alerts for signal generation
  - Desktop notifications (with permission)
  - Configurable notification types
  - Custom alert sound generation (Web Audio API)
- **Smart Alert Management**
  - Confidence threshold filtering
  - Alert enable/disable toggles
  - Notification permission handling
  - Non-intrusive notification design

### ⚙️ Settings & Customization Panel
- **Live API Configuration**
  - Toggle between live API and simulated data
  - Support for exchangerate-api.com integration
  - Ready for Alpha Vantage and Finnhub.io
- **User Preferences**
  - Sound alert enable/disable
  - Desktop notification toggle
  - Confidence threshold slider (0-100%)
  - Data refresh interval configuration (10-120 seconds)
- **Data Management**
  - Clear all data with one click
  - Reset to defaults
  - Local storage management
- **Persistent Settings**
  - All preferences saved to localStorage
  - Restored on page reload
  - No server required

### 🎨 Professional UI
- Dark/Light theme toggle with localStorage persistence
- Responsive design (mobile, tablet, desktop)
- Real-time data updates
- Professional color scheme with trading indicators
- **Tab-Based Navigation**
  - Position Calculator tab
  - AI Trading Assistant tab
  - Market Data tab
  - Trade Journal tab
  - Performance Dashboard tab
  - Settings panel
  - **Paper Trading tab** (NEW!)

### 📝 Paper Trading / Simulated Live Trading (NEW!)
- **Risk-Free Trading Simulation**
  - Execute trades with simulated account balance ($10,000 starting)
  - Real prices from live API data
  - Realistic slippage and margin calculations
  - No real money at risk - perfect for practice
  
- **Full Position Management**
  - Open multiple simultaneous positions
  - Set stop loss and take profit in pips
  - Monitor floating P&L in real-time (updates every 5 seconds)
  - Automatic position closure on SL/TP hit
  - Manual position close option
  
- **Account Tracking**
  - Real-time account balance display
  - Equity calculation (balance + floating P&L)
  - Margin usage monitoring
  - Floating and realized P&L tracking
  
- **Trade History**
  - Complete log of all closed trades
  - Entry/exit prices and profit/loss
  - Trade duration and status (TP/SL/Manual close)
  - CSV export for analysis
  - Timestamp tracking for all trades
  
- **Features**
  - Automatic position closure when SL/TP is hit
  - Real-time P&L updates for open positions
  - Reset account to start fresh
  - Export trade history to CSV
  - Persistent data storage (trades saved between sessions)
  - Support for all 7 currency pairs

### AI Strategy Optimizer & Auto Paper Trading
- Scans supported pairs against built-in strategy profiles: Trend Scalper, Momentum Breakout, Balanced Swing, and Gold Conservative
- Ranks setups by rule alignment, spread, higher-timeframe confirmation, and expected risk/reward
- Displays the best scoring simulated setup in the Paper Trading tab
- Optional auto paper trading mode executes paper trades only, never live broker orders
- Configurable scan interval, minimum confidence, risk percent, and max open trades
- Avoids duplicate open positions for the same symbol, direction, and strategy
- Stores strategy name and confidence on auto-generated paper trades
- Live auto-trade monitor shows active symbol, strategy, entry/current price, real-time P&L, and distance to SL/TP
- AI trade summary provides hold, close/trail, or risk-warning guidance from current indicator alignment and live simulated market data
- Closed paper trades sync into the Trade Journal automatically
- Performance Dashboard refreshes with journal totals plus live paper-trading equity, open trades, and floating P&L

### Guided UI & Live AI Agent Chat
- Every tab includes a visible guide explaining what the tab does and how to use it
- AI Trading Assistant tab includes a live chat panel for questions about:
  - Current market status
  - Active auto paper trades
  - Close/hold guidance
  - Best strategy setup
  - Paper trading performance
- Default mode uses built-in deterministic AI rules, so it works on GitHub Pages without paid API keys
- Optional Local Ollama mode can call `http://localhost:11434/api/generate` when Ollama is running on the user's computer
- API keys are intentionally not hardcoded into the static app; a backend proxy should be used before adding paid/cloud AI or market-data secrets

### TradingView Affiliate Placement
- TradingView affiliate banner is visible beside the embedded chart area
- Maximized chart modal includes the same TradingView call-to-action
- Affiliate URL: `https://www.tradingview.com/?aff_id=166197&source=https%3A%2F%2Fscorpxgt7.github.io%2FScorpXCurrencytrading%2F`

## Safety Notice
This application is for education, analysis, and paper trading simulation only. It does not provide financial advice, does not guarantee profitability, and does not place live broker trades.

## API Integration

### Available APIs
**Currently Integrated:**
- **exchangerate-api.com** (Free tier)
  - Real-time forex rates
  - No API key required for basic usage
  - Automatic fallback if unavailable
  
**Ready for Integration:**
- **Alpha Vantage** (Advanced technical indicators, crypto)
- **Finnhub.io** (Professional forex data)
- **Interactive Brokers API** (Premium professional data)
- **Investing.com** (Economic calendar for news risk filtering)

### Real-Time Data Features
- Automatic API switching with fallback
- Configurable refresh intervals (10-120 seconds)
- Live bid/ask spread calculations
- Data quality validation
- Connection status monitoring
- Enable/disable via Settings panel

## Validation Rules

The AI assistant validates trades using:
1. **Symbol Validation** - Only allowed pairs
2. **Data Quality** - Bid/ask spread, data freshness
3. **Spread Risk** - Maximum allowable spread for scalping
4. **News Risk** - High news events filtered
5. **Market Structure** - No trades in range-bound markets
6. **EMA Alignment** - EMA20 > EMA50 for BUY, reverse for SELL
7. **RSI Confirmation** - RSI > 50 for BUY, < 50 for SELL
8. **MTF Confirmation** - Higher timeframe must align
9. **Risk:Reward Ratio** - Minimum 1.5:1 (2.0:1 for gold)

## Live Site
Automatically deployed to GitHub Pages:
`https://georgetolin.github.io/Multi-Currency-Scalping-Calculator/`

## Quick Start
1. **Open the Calculator**
   - Launch in your browser: https://georgetolin.github.io/Multi-Currency-Scalping-Calculator/
   - Select a currency pair from the badges
   - Enable/disable live API data in Settings

2. **Calculate Position Size**
   - Select currency pair or enter prices manually
   - Enter your account balance and risk percentage
   - Click "Calculate" for professional position sizing

3. **Generate AI Signal**
   - Enter your entry, stop loss, and take profit levels
   - Click "Generate AI Signal" for trade analysis
   - Review confidence breakdown and validation results

4. **Manage Trades**
   - View execution logs in Trade Journal tab
   - Export trade history as CSV
   - Review P&L in Performance Dashboard

5. **Customize Settings**
   - Toggle live API integration (exchangerate-api.com)
   - Configure alerts (sound & notifications)
   - Adjust confidence threshold and refresh intervals
   - All settings saved automatically to browser storage

## Technical Stack
- **Pure JavaScript** (ES6+) - No frameworks required
- **HTML5** - Semantic markup
- **CSS3** - Modern layouts (Grid/Flexbox)
- **TradingView Widget** - Professional chart integration
- **Font Awesome 6.4.0** - Icon library
- **Web Audio API** - Sound alert generation
- **localStorage API** - Data persistence
- **Notifications API** - Desktop alerts

## Data Sources & Integration

### Real-Time Market Data
- **Primary:** exchangerate-api.com (free tier, no API key)
- **Fallback:** Simulated realistic data
- **Status:** Live API integration fully implemented
- **Refresh:** Configurable (10-120 seconds)

### Technical Indicators (All Calculated Locally)
- **Trend:** EMA20, EMA50, MACD
- **Momentum:** RSI14, Stochastic Oscillator  
- **Volatility:** ATR14, Bollinger Bands
- **Sentiment:** Market structure analysis

### Data Persistence
- Trade journal (all executed trades)
- Performance metrics (P&L, win rate, etc.)
- User preferences and settings
- Chart preferences and layouts
- All stored in browser localStorage (no server needed)

## Notes
- Typical EUR/USD pip value: ~$10 per standard lot
- Scalping stops: 5–10 pips | Targets: 10–20 pips
- Best trading hours: London–New York overlap (13:00–16:00 GMT)
- JPY pairs & XAUUSD have different pip calculations

## Local Development
Just open `index.html` in your browser — no dependencies required.
```bash
# Clone the repo
git clone https://github.com/georgetolin/Multi-Currency-Scalping-Calculator.git

# Open in browser
open index.html
```

## Deployment
This repo auto-deploys to GitHub Pages on push to `main` via the `.github/workflows/pages.yml` workflow.

## 🚀 Recent Improvements (v2.0+)

### Major Features Added
✅ **Live API Integration** - Real-time market data from exchangerate-api.com
✅ **Trade Journal System** - Complete trade history management with CSV export
✅ **Performance Dashboard** - Analytics with win rate, P&L, and trade statistics
✅ **Alert System** - Sound alerts and desktop notifications with Web Audio API
✅ **Advanced Indicators** - MACD, Bollinger Bands, Stochastic Oscillator
✅ **Settings Panel** - Fully customizable app configuration
✅ **Paper Trading System** - Risk-free simulated live trading with position management
✅ **Chart Maximize Feature** - Pop-out fullscreen chart for advanced analysis (NEW!)
✅ **Enhanced UI** - New tabs for Journal, Performance, Settings, and Paper Trading

### Technical Enhancements
- Multi-API support with automatic fallback mechanism
- LocalStorage data persistence for journal, performance, and trade data
- Configurable data refresh intervals (10-120 seconds)
- Advanced technical indicator calculations (MACD, Bollinger, Stochastic)
- Sound generation using Web Audio API
- Desktop notification support with permission handling
- Export trade history to CSV format
- **Paper trading engine** with real-time P&L calculation
- **Position management** with automatic SL/TP closure
- **Margin calculation** for realistic position sizing
- **Floating P&L** updates every 5 seconds
- **Chart maximize modal** with immersive fullscreen analysis
- **ESC key support** for quick modal close
- **Real-time chart stats** in maximized view (price, RSI, sentiment)
- Clear separation of concerns with modular code

### User Experience
- **Six dedicated tabs** for different features (added Paper Trading)
- Real-time performance metrics and position updates
- Persistent trading account data across sessions
- Responsive design for all devices
- Non-intrusive alert system
- Professional dark/light theme toggle
- Risk-free practice environment for new traders

## Architecture

### Frontend Components
1. **Calculator Module** - Position sizing calculations
2. **AI Assistant Module** - Signal generation and validation
3. **Market Data Module** - Live price feeds and indicators
4. **Trade Journal Module** - Trade logging and history
5. **Performance Module** - Analytics and reporting
6. **Settings Module** - User preferences and configuration
7. **Paper Trading Module** - Simulated live trading with position management (NEW!)

### Data Flow
```
Live API / Simulated Data
         ↓
Technical Indicators (EMA, RSI, MACD, etc.)
         ↓
Signal Generation Engine
         ↓
Trade Validation Rules (9-point system)
         ↓
Confidence Scoring & Alerts
         ↓
Journal Logging & Performance Tracking
```

## Production Readiness

### For Production Deployment
1. **API Integration**
   - Use paid tier of exchangerate-api.com or Alpha Vantage
   - Implement API key management
   - Add rate limiting and caching

2. **Database**
   - Consider moving from localStorage to backend database
   - Implement user authentication
   - Add data backup and recovery

3. **Security**
   - Add HTTPS enforcement
   - Implement CORS properly
   - Add input validation and sanitization

4. **Monitoring**
   - Add error tracking (Sentry)
   - Implement performance monitoring
   - Track user analytics (Plausible)

## Support & Documentation

For issues, feature requests, or contributions:
- Check existing GitHub issues
- Review README and inline code comments
- Test with different browser and device combinations

## License
MIT — see `LICENSE`.
