#!/bin/bash

# Virtual BTC Lottery DApp Deployment Script
echo "🚀 Starting Virtual BTC Lottery DApp deployment..."

# Check if necessary tools are installed
echo "📋 Checking environment dependencies..."

# Check Rust
if ! command -v rustc &> /dev/null; then
    echo "❌ Rust not installed, please install Rust first: https://rustup.rs/"
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not installed, please install Node.js"
    exit 1
fi

# Check DFX
if ! command -v dfx &> /dev/null; then
    echo "❌ DFX not installed, please install DFX: https://internetcomputer.org/docs/current/developer-docs/setup/install/"
    exit 1
fi

echo "✅ Environment check passed"

# Install Rust wasm target
echo "🔧 Installing Rust wasm target..."
rustup target add wasm32-unknown-unknown

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd src/my_rust_dapp_frontend
npm install
cd ../..

# Stop any running dfx processes
echo "🛑 Stopping existing DFX processes..."
pkill -f dfx || true
sleep 2

# Start dfx local network
echo "🌐 Starting DFX local network..."
dfx start --background --clean

# Wait for network to be ready
echo "⏳ Waiting for network to be ready..."
sleep 10

# Deploy canisters
echo "🚀 Deploying canisters..."
dfx deploy

# Generate declarations
echo "📝 Generating declarations..."
dfx generate

# Build frontend
echo "🔨 Building frontend..."
cd src/my_rust_dapp_frontend
npm run build
cd ../..

echo "✅ Deployment completed successfully!"
echo ""
echo "🌐 Frontend URL: http://localhost:5173"
echo "🔗 Canister ID: $(dfx canister id my_rust_dapp_backend)"
echo ""
echo "📖 For more information, check the README.md file" 