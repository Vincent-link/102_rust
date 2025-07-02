# Virtual BTC Lottery DApp

A decentralized lottery application on the Internet Computer that allows users to play with real Bitcoin using ckBTC.

## Features

- **Internet Identity Integration**: Secure authentication using Internet Identity
- **Real Bitcoin Support**: Use ckBTC to play with actual Bitcoin
- **Unique ckBTC Addresses**: Each user gets a unique Bitcoin address for deposits
- **Automated Draws**: Lottery rounds with automated winner selection
- **Admin Controls**: Manual draw triggers and system management
- **Transaction History**: Complete record of all user activities

## Identity System

This application uses **Internet Identity** as the sole identity provider:

- **Internet Identity**: Official Internet Computer identity provider
- No browser extensions required
- Visit [identity.ic0.app](https://identity.ic0.app/) to create an identity
- Secure and user-friendly authentication

## How It Works

1. **Connect**: Use Internet Identity to connect to the application
2. **Generate Address**: Get your unique ckBTC address for Bitcoin deposits
3. **Deposit**: Send real Bitcoin to your generated address
4. **Bet**: Use your balance to place lottery bets
5. **Win**: Win real Bitcoin prizes when you're selected as the winner

## Technology Stack

- **Backend**: Rust (Internet Computer canisters)
- **Frontend**: JavaScript with Lit-HTML and SCSS
- **Identity**: Internet Identity
- **Bitcoin**: ckBTC integration for real Bitcoin support

## Getting Started

1. Install Internet Identity from [identity.ic0.app](https://identity.ic0.app/)
2. Deploy the canisters using dfx
3. Connect your Internet Identity to start playing

## Development

```bash
# Deploy the application
dfx deploy

# Start the frontend
dfx start --clean
```

## Architecture

- **Backend Canisters**: User management, round management, transaction handling
- **Frontend**: Modern UI with real-time updates
- **CkBTC Integration**: Bitcoin address generation and deposit tracking
- **Admin System**: Privileged operations for lottery management

## Security

- All transactions are recorded on the Internet Computer blockchain
- User identities are verified through Internet Identity
- Bitcoin deposits are tracked through ckBTC integration
- Admin operations require proper authentication

## Support

For issues or questions, please refer to the Internet Computer documentation or contact the development team.
