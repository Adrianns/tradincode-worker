#!/bin/sh
set -e

echo "Running database migrations..."
npm run migrate
echo "✓ Main migrations completed"

echo "Running paper trading migrations..."
npm run migrate:paper
echo "✓ Paper trading migrations completed"

echo "Running indicator signals migrations..."
npm run migrate:indicators
echo "✓ Indicator signals migrations completed"

echo "Starting worker..."
npm start
