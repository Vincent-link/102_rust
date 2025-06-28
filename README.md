# Virtual BTC Lottery DApp

This is a decentralized application built on the Internet Computer (IC) for a virtual BTC lottery. Users can connect via Internet Identity wallet, deposit virtual BTC, participate in lottery games, and have a chance to win prizes from the prize pool.

## Features

### User Features
- 🔐 **Internet Identity Wallet Connection** - Secure authentication
- 👤 **User Registration** - Create personal account
- 💰 **Virtual Deposit** - Deposit virtual BTC to account
- 🎯 **Lottery Betting** - Participate in lottery games (1 BTC per bet)
- 🏆 **Prize Winning** - Win prizes from the prize pool
- 📊 **Transaction History** - View deposit and winning records

### Admin Features
- 👑 **Admin Authentication** - Initialize admin privileges
- 🎲 **Manual Draw** - Trigger lottery draws manually
- 📈 **System Statistics** - View overall system statistics

## Technology Stack

### Backend
- **Rust** - Core canister logic
- **Internet Computer** - Decentralized platform
- **Candid** - Interface definition language
- **DFX** - Development framework

### Frontend
- **JavaScript** - Main application logic
- **Lit-HTML** - Template rendering
- **SCSS** - Styling
- **Vite** - Build tool

## Project Structure

```
my_rust_dapp/
├── src/
│   ├── my_rust_dapp_backend/     # Rust canister backend
│   │   ├── src/
│   │   │   └── lib.rs           # Main canister logic
│   │   └── my_rust_dapp_backend.did  # Candid interface
│   └── my_rust_dapp_frontend/    # JavaScript frontend
│       ├── src/
│       │   ├── App.js           # Main application
│       │   ├── wallet-utils.js  # Wallet utilities
│       │   └── index.scss       # Styles
│       └── index.html           # Entry point
├── dfx.json                      # DFX configuration
└── Cargo.toml                    # Rust dependencies
```

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- DFX (Internet Computer development kit)
- Rust toolchain

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd my_rust_dapp
   ```

2. **Install dependencies**
   ```bash
   # Install frontend dependencies
   cd src/my_rust_dapp_frontend
   npm install
   
   # Return to root directory
   cd ../..
   ```

3. **Start local network**
   ```bash
   dfx start --background
   ```

4. **Deploy canisters**
   ```bash
   dfx deploy
   ```

5. **Generate declarations**
   ```bash
   dfx generate
   ```

6. **Build frontend**
   ```bash
   cd src/my_rust_dapp_frontend
   npm run build
   ```

7. **Start frontend**
   ```bash
   npm run dev
   ```

### Access the Application

- **Frontend**: http://localhost:5173
- **Canister ID**: Check `dfx.json` or run `dfx canister id my_rust_dapp_backend`

## Usage

### For Users

1. **Connect Wallet**
   - Open the application in your browser
   - Click "Connect Wallet" and choose your preferred wallet
   - Complete the authentication process

2. **Create Account**
   - After connecting, click "Create User" to register
   - Your account will be created on the blockchain

3. **Deposit Funds**
   - Enter the amount of virtual BTC you want to deposit
   - Click "Deposit" to add funds to your account

4. **Place Bets**
   - Click "Place Bet" to participate in the current round
   - Each bet costs 1 BTC from your balance

5. **Win Prizes**
   - If you win, prizes will be automatically added to your balance
   - Check your transaction history for details

### For Admins

1. **Initialize Admin**
   - Connect your wallet
   - Click "Initialize Admin Privileges"
   - You'll become the admin of the system

2. **Manual Draw**
   - As admin, you can trigger manual draws
   - Click "Manual Draw" to end the current round and select a winner

## Development

### Backend Development

The backend is written in Rust and runs on the Internet Computer. Key files:

- `src/my_rust_dapp_backend/src/lib.rs` - Main canister logic
- `src/my_rust_dapp_backend/my_rust_dapp_backend.did` - Candid interface

### Frontend Development

The frontend uses JavaScript with Lit-HTML for rendering. Key files:

- `src/my_rust_dapp_frontend/src/App.js` - Main application logic
- `src/my_rust_dapp_frontend/src/wallet-utils.js` - Wallet integration utilities
- `src/my_rust_dapp_frontend/src/index.scss` - Application styles

### Testing

```bash
# Test backend
dfx test

# Test frontend
cd src/my_rust_dapp_frontend
npm test
```

## Deployment

### Local Development
```bash
dfx start --background
dfx deploy
```

### Production Deployment
```bash
dfx deploy --network ic
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the troubleshooting guide

## Acknowledgments

- DFINITY Foundation for the Internet Computer platform
- The IC community for tools and libraries
- Contributors and testers
